/* ==========================================================================
   XEL I — Gestion du blog (admin.html)
   CMS statique : les articles vivent dans blog/articles.json sur GitHub ;
   l'admin lit et écrit dans le dépôt via l'API GitHub (Contents API).

   Connexion par identifiant + mot de passe, sans backend :
   la clé GitHub est chiffrée (AES-GCM, clé dérivée du mot de passe par
   PBKDF2) et stockée dans blog/acces.json. Le bon mot de passe déchiffre
   la clé dans le navigateur ; un mauvais mot de passe échoue au déchiffrement.

   Mode démo : accès sans identifiants — les articles publics sont chargés,
   toutes les actions fonctionnent mais rien n'est écrit dans le dépôt.
   ========================================================================== */

(function () {
  "use strict";

  /* ---------- Configuration du dépôt ---------- */
  var OWNER = "ncheikha-bot";
  var REPO = "xel-i-site";
  var BRANCH = "main";
  var FICHIER_ARTICLES = "blog/articles.json";
  var FICHIER_ACCES = "blog/acces.json";
  var API = "https://api.github.com";
  var CLE_STOCKAGE = "xeli_admin_token";

  /* ---------- État ---------- */
  var token = null;
  var modeDemo = false;
  var articles = [];         // contenu de articles.json
  var shaArticles = null;    // sha du fichier (requis pour l'écriture)
  var slugEnEdition = null;  // null = nouvel article
  var imageBase64 = null;    // nouvelle image choisie (contenu base64)
  var imageDataUrl = null;   // aperçu local de cette image
  var imageExtension = null;

  /* ---------- Raccourcis DOM ---------- */
  function $(id) { return document.getElementById(id); }
  var ecranConnexion = $("ecran-connexion");
  var ecranAdmin = $("ecran-admin");
  var panneauListe = $("panneau-liste");
  var panneauEditeur = $("panneau-editeur");

  /* ---------- Helpers API GitHub ---------- */
  function gh(chemin, options, tokenExplicite) {
    options = options || {};
    options.headers = {
      "Authorization": "Bearer " + (tokenExplicite || token),
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    if (options.body) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(options.body);
    }
    return fetch(API + chemin, options).then(function (r) {
      if (!r.ok) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          var err = new Error(data.message || ("Erreur " + r.status));
          err.status = r.status;
          throw err;
        });
      }
      return r.status === 204 ? null : r.json();
    });
  }

  /* base64 <-> UTF-8 (btoa/atob seuls cassent les accents) */
  function encoderBase64(texte) {
    var octets = new TextEncoder().encode(texte);
    var binaire = "";
    octets.forEach(function (o) { binaire += String.fromCharCode(o); });
    return btoa(binaire);
  }
  function decoderBase64(b64) {
    var binaire = atob(b64.replace(/\n/g, ""));
    var octets = new Uint8Array(binaire.length);
    for (var i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
    return new TextDecoder().decode(octets);
  }

  /* ---------- Chiffrement (WebCrypto) ---------- */
  function bufVersB64(buf) {
    var octets = new Uint8Array(buf);
    var binaire = "";
    octets.forEach(function (o) { binaire += String.fromCharCode(o); });
    return btoa(binaire);
  }
  function b64VersBuf(b64) {
    var binaire = atob(b64);
    var octets = new Uint8Array(binaire.length);
    for (var i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
    return octets;
  }

  function deriverCle(motDePasse, sel) {
    return crypto.subtle.importKey(
      "raw", new TextEncoder().encode(motDePasse), "PBKDF2", false, ["deriveKey"]
    ).then(function (base) {
      return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: sel, iterations: 150000, hash: "SHA-256" },
        base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
      );
    });
  }

  function chiffrerTexte(texte, motDePasse) {
    var sel = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return deriverCle(motDePasse, sel).then(function (cle) {
      return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, cle,
        new TextEncoder().encode(texte));
    }).then(function (chiffre) {
      return { sel: bufVersB64(sel), iv: bufVersB64(iv), donnees: bufVersB64(chiffre) };
    });
  }

  function dechiffrerTexte(bloc, motDePasse) {
    return deriverCle(motDePasse, b64VersBuf(bloc.sel)).then(function (cle) {
      return crypto.subtle.decrypt(
        { name: "AES-GCM", iv: b64VersBuf(bloc.iv) }, cle, b64VersBuf(bloc.donnees));
    }).then(function (buf) {
      return new TextDecoder().decode(buf);
    });
  }

  /* ---------- Comptes (blog/acces.json, public mais chiffré) ---------- */
  function chargerComptes() {
    return fetch(FICHIER_ACCES + "?t=" + Date.now())
      .then(function (r) {
        if (r.status === 404) return null;
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) { return data ? (data.comptes || []) : null; })
      .catch(function () { return null; });
  }

  /* ---------- Lecture / écriture des articles ---------- */
  function chargerArticlesDepuisGitHub() {
    if (modeDemo) {
      return XeliBlog.fetchArticles().then(function (liste) { articles = liste; });
    }
    return gh("/repos/" + OWNER + "/" + REPO + "/contents/" + FICHIER_ARTICLES + "?ref=" + BRANCH)
      .then(function (fichier) {
        shaArticles = fichier.sha;
        articles = JSON.parse(decoderBase64(fichier.content)).articles || [];
      });
  }

  function enregistrerArticlesSurGitHub(message) {
    if (modeDemo) return Promise.resolve(); // démo : rien n'est écrit
    var json = JSON.stringify({ articles: articles }, null, 2);
    return gh("/repos/" + OWNER + "/" + REPO + "/contents/" + FICHIER_ARTICLES, {
      method: "PUT",
      body: {
        message: message,
        content: encoderBase64(json),
        sha: shaArticles,
        branch: BRANCH
      }
    }).then(function (reponse) {
      shaArticles = reponse.content.sha;
    });
  }

  function televerserImage(chemin, base64, message) {
    if (modeDemo) return Promise.resolve();
    return gh("/repos/" + OWNER + "/" + REPO + "/contents/" + chemin, {
      method: "PUT",
      body: { message: message, content: base64, branch: BRANCH }
    });
  }

  /* ---------- Connexion ---------- */
  function verifierToken(candidat) {
    return gh("/repos/" + OWNER + "/" + REPO, null, candidat).then(function (repo) {
      if (!repo.permissions || !repo.permissions.push) {
        throw new Error("Cette clé n'a pas le droit d'écriture sur le site.");
      }
    });
  }

  $("form-connexion").addEventListener("submit", function (e) {
    e.preventDefault();
    var id = $("c-id").value.trim();
    var mdp = $("c-mdp").value;
    var statut = $("statut-connexion");

    if (!id || !mdp) {
      statut.textContent = "Merci de saisir votre identifiant et votre mot de passe.";
      return;
    }
    statut.textContent = "Connexion en cours…";

    chargerComptes().then(function (comptes) {
      if (comptes === null || !comptes.length) {
        statut.textContent =
          "Aucun compte n'est encore configuré — utilisez la configuration initiale ci-dessous, ou le mode démo.";
        throw { silencieux: true };
      }
      var compte = comptes.filter(function (c) {
        return String(c.id).toLowerCase() === id.toLowerCase();
      })[0];
      if (!compte) throw { identifiants: true };
      return dechiffrerTexte(compte, mdp).catch(function () { throw { identifiants: true }; });
    }).then(function (jetonDechiffre) {
      return verifierToken(jetonDechiffre).then(function () { return jetonDechiffre; });
    }).then(function (jetonValide) {
      token = jetonValide;
      modeDemo = false;
      if ($("c-souvenir").checked) localStorage.setItem(CLE_STOCKAGE, jetonValide);
      else sessionStorage.setItem(CLE_STOCKAGE, jetonValide);
      statut.textContent = "";
      afficherAdmin();
    }).catch(function (err) {
      if (err && err.silencieux) return;
      statut.textContent = (err && err.identifiants)
        ? "Identifiant ou mot de passe incorrect."
        : "La clé enregistrée semble expirée ou révoquée — refaites la configuration initiale.";
    });
  });

  /* ---------- Mode démo ---------- */
  $("btn-demo").addEventListener("click", function () {
    modeDemo = true;
    token = null;
    afficherAdmin();
  });

  /* ---------- Déconnexion ---------- */
  function fermerSession() {
    token = null;
    modeDemo = false;
    localStorage.removeItem(CLE_STOCKAGE);
    sessionStorage.removeItem(CLE_STOCKAGE);
    ecranAdmin.hidden = true;
    ecranConnexion.hidden = false;
    $("c-mdp").value = "";
    $("statut-connexion").textContent = "";
  }
  $("btn-deconnexion").addEventListener("click", fermerSession);

  /* ---------- Configuration initiale (équipe technique) ---------- */
  $("form-config").addEventListener("submit", function (e) {
    e.preventDefault();
    var statut = $("statut-config");
    var jeton = $("s-token").value.trim();
    var id = $("s-id").value.trim();
    var mdp = $("s-mdp").value;
    var mdp2 = $("s-mdp2").value;

    if (!jeton || !id) { statut.textContent = "Clé GitHub et identifiant requis."; return; }
    if (mdp.length < 8) { statut.textContent = "Le mot de passe doit faire au moins 8 caractères."; return; }
    if (mdp !== mdp2) { statut.textContent = "Les deux mots de passe ne correspondent pas."; return; }

    statut.textContent = "Vérification de la clé…";
    verifierToken(jeton).then(function () {
      statut.textContent = "Chiffrement et enregistrement…";
      return chiffrerTexte(jeton, mdp);
    }).then(function (bloc) {
      bloc.id = id;
      /* récupérer l'existant (sha) puis écrire le fichier des comptes */
      return gh("/repos/" + OWNER + "/" + REPO + "/contents/" + FICHIER_ACCES + "?ref=" + BRANCH, null, jeton)
        .then(function (fichier) {
          var contenu = JSON.parse(decoderBase64(fichier.content));
          var comptes = (contenu.comptes || []).filter(function (c) {
            return String(c.id).toLowerCase() !== id.toLowerCase();
          });
          comptes.push(bloc);
          return { comptes: comptes, sha: fichier.sha };
        })
        .catch(function (err) {
          if (err.status === 404) return { comptes: [bloc], sha: null };
          throw err;
        });
    }).then(function (resultat) {
      var corps = {
        message: "Blog : configuration du compte « " + id + " »",
        content: encoderBase64(JSON.stringify({ comptes: resultat.comptes }, null, 2)),
        branch: BRANCH
      };
      if (resultat.sha) corps.sha = resultat.sha;
      return gh("/repos/" + OWNER + "/" + REPO + "/contents/" + FICHIER_ACCES, {
        method: "PUT", body: corps
      }, jeton);
    }).then(function () {
      $("s-token").value = ""; $("s-mdp").value = ""; $("s-mdp2").value = "";
      statut.textContent = "Compte « " + id + " » enregistré ! Connexion possible d'ici ~1 minute (mise à jour du site).";
    }).catch(function (err) {
      statut.textContent = err.status === 401
        ? "Clé GitHub invalide ou expirée."
        : "Échec : " + (err.message || "erreur inconnue");
    });
  });

  /* ---------- Tableau de bord : liste ---------- */
  function afficherAdmin() {
    ecranConnexion.hidden = true;
    ecranAdmin.hidden = false;
    $("badge-demo").hidden = !modeDemo;
    montrerListe();
    rechargerListe();
  }

  function rechargerListe() {
    var statut = $("statut-liste");
    statut.textContent = "Chargement…";
    chargerArticlesDepuisGitHub().then(function () {
      statut.textContent = modeDemo
        ? "Mode démo : essayez tout, rien ne sera publié sur le site."
        : "";
      dessinerListe();
    }).catch(function (err) {
      statut.textContent = "Impossible de charger les articles : " + err.message;
    });
  }

  function dessinerListe() {
    var tries = articles.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    $("compte-articles").textContent = "(" + articles.length + ")";
    var ul = $("liste-articles");

    if (!tries.length) {
      ul.innerHTML = '<li class="admin-liste__vide">Aucun article pour le moment — créez le premier !</li>';
      return;
    }

    ul.innerHTML = tries.map(function (a) {
      return '<li class="admin-liste__item" data-slug="' + XeliBlog.escapeHtml(a.slug) + '">' +
        '<div class="admin-liste__infos">' +
          '<span class="admin-badge ' + (a.publie ? "admin-badge--publie" : "admin-badge--brouillon") + '">' +
            (a.publie ? "Publié" : "Brouillon") + "</span>" +
          "<strong>" + XeliBlog.escapeHtml(a.titre) + "</strong>" +
          '<span class="admin-liste__meta">' + XeliBlog.escapeHtml(a.categorie || "") + " · " +
            XeliBlog.formatDate(a.date) + "</span>" +
        "</div>" +
        '<div class="admin-liste__boutons">' +
          '<a class="btn btn--ghost btn--petit" target="_blank" rel="noopener" href="article.html?article=' +
            encodeURIComponent(a.slug) + '">Voir</a>' +
          '<button type="button" class="btn btn--ghost btn--petit" data-action="modifier">Modifier</button>' +
          '<button type="button" class="btn btn--danger btn--petit" data-action="supprimer">Supprimer</button>' +
        "</div></li>";
    }).join("");
  }

  $("liste-articles").addEventListener("click", function (e) {
    var bouton = e.target.closest("button[data-action]");
    if (!bouton) return;
    var slug = bouton.closest(".admin-liste__item").getAttribute("data-slug");
    if (bouton.getAttribute("data-action") === "modifier") ouvrirEditeur(slug);
    if (bouton.getAttribute("data-action") === "supprimer") supprimerArticle(slug);
  });

  function supprimerArticle(slug) {
    var article = articles.filter(function (a) { return a.slug === slug; })[0];
    if (!article) return;
    if (!window.confirm('Supprimer définitivement « ' + article.titre + ' » ?')) return;

    var statut = $("statut-liste");
    statut.textContent = "Suppression en cours…";
    articles = articles.filter(function (a) { return a.slug !== slug; });
    enregistrerArticlesSurGitHub("Blog : suppression de « " + article.titre + " »")
      .then(function () {
        statut.textContent = modeDemo
          ? "Mode démo : article supprimé localement (rien n'est publié)."
          : "Article supprimé. Le site se met à jour d'ici ~1 minute.";
        dessinerListe();
      })
      .catch(function (err) {
        statut.textContent = "Échec de la suppression : " + err.message + " — rechargez la page.";
      });
  }

  /* ---------- Éditeur ---------- */
  function montrerListe() {
    panneauEditeur.hidden = true;
    panneauListe.hidden = false;
  }

  function ouvrirEditeur(slug) {
    slugEnEdition = slug || null;
    imageBase64 = null;
    imageDataUrl = null;
    imageExtension = null;

    var article = slug ? articles.filter(function (a) { return a.slug === slug; })[0] : null;
    $("titre-editeur").textContent = article ? "Modifier l'article" : "Nouvel article";
    $("a-titre").value = article ? article.titre : "";
    $("a-date").value = article ? article.date : new Date().toISOString().slice(0, 10);
    $("a-categorie").value = article ? (article.categorie || "L'école") : "L'école";
    $("a-auteur").value = article ? (article.auteur || "") : "L'équipe Xel i";
    $("a-resume").value = article ? (article.resume || "") : "";
    $("a-contenu").value = article ? (article.contenu || "") : "";
    $("a-publie").checked = article ? Boolean(article.publie) : true;
    $("a-image-fichier").value = "";

    var apercuImage = $("a-image-apercu");
    if (article && article.image) {
      apercuImage.src = article.image;
      apercuImage.hidden = false;
    } else {
      apercuImage.hidden = true;
      apercuImage.src = "";
    }

    $("statut-editeur").textContent = "";
    rafraichirApercu();
    panneauListe.hidden = true;
    panneauEditeur.hidden = false;
    $("a-titre").focus();
  }

  $("btn-nouveau").addEventListener("click", function () { ouvrirEditeur(null); });
  $("btn-retour-liste").addEventListener("click", montrerListe);
  $("btn-annuler").addEventListener("click", montrerListe);

  /* Aperçu markdown en direct */
  function rafraichirApercu() {
    $("a-apercu").innerHTML = XeliBlog.renderMarkdown($("a-contenu").value) ||
      '<p class="admin-apercu__vide">L\'aperçu de votre article s\'affichera ici.</p>';
  }
  $("a-contenu").addEventListener("input", rafraichirApercu);

  /* Sélection d'une image de couverture */
  $("a-image-fichier").addEventListener("change", function () {
    var fichier = this.files && this.files[0];
    var erreur = this.closest(".form__field").querySelector(".form__error");
    erreur.textContent = "";
    imageBase64 = null;
    imageDataUrl = null;
    imageExtension = null;
    if (!fichier) return;

    if (fichier.size > 3 * 1024 * 1024) {
      erreur.textContent = "Image trop lourde (max 3 Mo). Réduisez-la avant de la téléverser.";
      this.value = "";
      return;
    }
    var lecteur = new FileReader();
    lecteur.onload = function () {
      imageDataUrl = String(lecteur.result);
      imageBase64 = imageDataUrl.split(",")[1];
      imageExtension = (fichier.name.split(".").pop() || "jpg").toLowerCase().replace("jpeg", "jpg");
      var apercuImage = $("a-image-apercu");
      apercuImage.src = imageDataUrl;
      apercuImage.hidden = false;
    };
    lecteur.readAsDataURL(fichier);
  });

  /* Enregistrement */
  $("form-article").addEventListener("submit", function (e) {
    e.preventDefault();
    var statut = $("statut-editeur");

    /* validation simple */
    var valides = true;
    ["a-titre", "a-date", "a-categorie", "a-resume", "a-contenu"].forEach(function (id) {
      var champ = $(id);
      var erreur = champ.closest(".form__field").querySelector(".form__error");
      if (!champ.value.trim()) { erreur.textContent = "Ce champ est requis."; valides = false; }
      else erreur.textContent = "";
    });
    if (!valides) { statut.textContent = "Merci de compléter les champs indiqués."; return; }

    var articleExistant = slugEnEdition
      ? articles.filter(function (a) { return a.slug === slugEnEdition; })[0]
      : null;

    /* slug : conservé en modification, généré (et unique) en création */
    var slug = articleExistant ? articleExistant.slug : XeliBlog.slugify($("a-titre").value);
    if (!articleExistant) {
      var base = slug, n = 2;
      while (articles.some(function (a) { return a.slug === slug; })) { slug = base + "-" + n++; }
    }

    var bouton = $("btn-enregistrer");
    bouton.disabled = true;
    statut.textContent = "Enregistrement en cours…";

    /* 1. téléverser la nouvelle image si besoin, 2. mettre à jour le JSON.
       En mode démo, l'aperçu local (data URL) sert d'image : rien n'est écrit. */
    var promesseImage = Promise.resolve(articleExistant ? articleExistant.image : "");
    if (imageBase64) {
      if (modeDemo) {
        promesseImage = Promise.resolve(imageDataUrl);
      } else {
        var cheminImage = "assets/blog/" + slug + "-" + Date.now() + "." + imageExtension;
        promesseImage = televerserImage(cheminImage, imageBase64,
          "Blog : image de couverture pour « " + $("a-titre").value.trim() + " »")
          .then(function () { return cheminImage; });
      }
    }

    promesseImage.then(function (cheminImage) {
      var donnees = {
        slug: slug,
        titre: $("a-titre").value.trim(),
        date: $("a-date").value,
        auteur: $("a-auteur").value.trim() || "L'équipe Xel i",
        categorie: $("a-categorie").value,
        image: cheminImage || "",
        resume: $("a-resume").value.trim(),
        contenu: $("a-contenu").value.trim(),
        publie: $("a-publie").checked
      };
      if (articleExistant) {
        articles = articles.map(function (a) { return a.slug === slug ? donnees : a; });
      } else {
        articles.unshift(donnees);
      }
      return enregistrerArticlesSurGitHub(
        "Blog : " + (articleExistant ? "mise à jour" : "ajout") + " de « " + donnees.titre + " »");
    }).then(function () {
      bouton.disabled = false;
      statut.textContent = modeDemo
        ? "Mode démo : article enregistré localement — rien n'est publié sur le site."
        : "Enregistré ! Le site se met à jour d'ici ~1 minute.";
      dessinerListe();
      window.setTimeout(montrerListe, 1500);
    }).catch(function (err) {
      bouton.disabled = false;
      if (err.status === 409) {
        statut.textContent = "Conflit de version : quelqu'un a modifié le blog en même temps. Rechargez la page puis réessayez.";
      } else {
        statut.textContent = "Échec de l'enregistrement : " + err.message;
      }
    });
  });

  /* ---------- Reconnexion automatique ---------- */
  var tokenMemorise = localStorage.getItem(CLE_STOCKAGE) || sessionStorage.getItem(CLE_STOCKAGE);
  if (tokenMemorise) {
    verifierToken(tokenMemorise).then(function () {
      token = tokenMemorise;
      modeDemo = false;
      afficherAdmin();
    }).catch(function () {
      localStorage.removeItem(CLE_STOCKAGE);
      sessionStorage.removeItem(CLE_STOCKAGE);
    });
  }
})();
