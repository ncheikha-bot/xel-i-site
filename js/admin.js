/* ==========================================================================
   XEL I — Gestion du blog (admin.html)
   CMS statique : les articles vivent dans blog/articles.json sur GitHub.
   L'admin lit et écrit dans le dépôt via l'API GitHub (Contents API) ;
   chaque enregistrement déclenche la reconstruction du site (~1 minute).
   Connexion : jeton d'accès GitHub (fine-grained, permission Contents R/W).
   ========================================================================== */

(function () {
  "use strict";

  /* ---------- Configuration du dépôt ---------- */
  var OWNER = "ncheikha-bot";
  var REPO = "xel-i-site";
  var BRANCH = "main";
  var FICHIER_ARTICLES = "blog/articles.json";
  var API = "https://api.github.com";
  var CLE_STOCKAGE = "xeli_admin_token";

  /* ---------- État ---------- */
  var token = null;
  var articles = [];         // contenu de articles.json
  var shaArticles = null;    // sha du fichier (requis pour l'écriture)
  var slugEnEdition = null;  // null = nouvel article
  var imageBase64 = null;    // nouvelle image choisie (contenu base64)
  var imageExtension = null;

  /* ---------- Raccourcis DOM ---------- */
  function $(id) { return document.getElementById(id); }
  var ecranConnexion = $("ecran-connexion");
  var ecranAdmin = $("ecran-admin");
  var panneauListe = $("panneau-liste");
  var panneauEditeur = $("panneau-editeur");

  /* ---------- Helpers API GitHub ---------- */
  function gh(chemin, options) {
    options = options || {};
    options.headers = {
      "Authorization": "Bearer " + token,
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

  function chargerArticlesDepuisGitHub() {
    return gh("/repos/" + OWNER + "/" + REPO + "/contents/" + FICHIER_ARTICLES + "?ref=" + BRANCH)
      .then(function (fichier) {
        shaArticles = fichier.sha;
        articles = JSON.parse(decoderBase64(fichier.content)).articles || [];
      });
  }

  function enregistrerArticlesSurGitHub(message) {
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
    return gh("/repos/" + OWNER + "/" + REPO + "/contents/" + chemin, {
      method: "PUT",
      body: { message: message, content: base64, branch: BRANCH }
    });
  }

  /* ---------- Connexion ---------- */
  function verifierToken(candidat) {
    token = candidat;
    return gh("/repos/" + OWNER + "/" + REPO).then(function (repo) {
      if (!repo.permissions || !repo.permissions.push) {
        throw new Error("Cette clé n'a pas le droit d'écriture sur le site.");
      }
    });
  }

  function ouvrirSession(candidat, retenir) {
    var statut = $("statut-connexion");
    statut.textContent = "Connexion en cours…";
    verifierToken(candidat).then(function () {
      if (retenir) localStorage.setItem(CLE_STOCKAGE, candidat);
      else sessionStorage.setItem(CLE_STOCKAGE, candidat);
      statut.textContent = "";
      afficherAdmin();
    }).catch(function (err) {
      token = null;
      statut.textContent = err.status === 401
        ? "Clé d'accès invalide ou expirée."
        : (err.message || "Connexion impossible. Vérifiez votre réseau.");
    });
  }

  function fermerSession() {
    token = null;
    localStorage.removeItem(CLE_STOCKAGE);
    sessionStorage.removeItem(CLE_STOCKAGE);
    ecranAdmin.hidden = true;
    ecranConnexion.hidden = false;
    $("c-token").value = "";
  }

  $("form-connexion").addEventListener("submit", function (e) {
    e.preventDefault();
    var candidat = $("c-token").value.trim();
    if (!candidat) {
      $("form-connexion").querySelector(".form__error").textContent = "Collez votre clé d'accès.";
      return;
    }
    $("form-connexion").querySelector(".form__error").textContent = "";
    ouvrirSession(candidat, $("c-souvenir").checked);
  });

  $("btn-deconnexion").addEventListener("click", fermerSession);

  /* ---------- Tableau de bord : liste ---------- */
  function afficherAdmin() {
    ecranConnexion.hidden = true;
    ecranAdmin.hidden = false;
    montrerListe();
    rechargerListe();
  }

  function rechargerListe() {
    var statut = $("statut-liste");
    statut.textContent = "Chargement…";
    chargerArticlesDepuisGitHub().then(function () {
      statut.textContent = "";
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
        statut.textContent = "Article supprimé. Le site se met à jour d'ici ~1 minute.";
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
    imageExtension = null;
    if (!fichier) return;

    if (fichier.size > 3 * 1024 * 1024) {
      erreur.textContent = "Image trop lourde (max 3 Mo). Réduisez-la avant de la téléverser.";
      this.value = "";
      return;
    }
    var lecteur = new FileReader();
    lecteur.onload = function () {
      imageBase64 = String(lecteur.result).split(",")[1];
      imageExtension = (fichier.name.split(".").pop() || "jpg").toLowerCase().replace("jpeg", "jpg");
      var apercuImage = $("a-image-apercu");
      apercuImage.src = String(lecteur.result);
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

    /* 1. téléverser la nouvelle image si besoin, 2. mettre à jour le JSON */
    var promesseImage = Promise.resolve(articleExistant ? articleExistant.image : "");
    if (imageBase64) {
      var cheminImage = "assets/blog/" + slug + "-" + Date.now() + "." + imageExtension;
      promesseImage = televerserImage(cheminImage, imageBase64,
        "Blog : image de couverture pour « " + $("a-titre").value.trim() + " »")
        .then(function () { return cheminImage; });
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
      statut.textContent = "Enregistré ! Le site se met à jour d'ici ~1 minute.";
      dessinerListe();
      window.setTimeout(montrerListe, 1200);
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
    verifierToken(tokenMemorise).then(afficherAdmin).catch(function () {
      localStorage.removeItem(CLE_STOCKAGE);
      sessionStorage.removeItem(CLE_STOCKAGE);
    });
  }
})();
