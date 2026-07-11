/* ==========================================================================
   XEL I — Blog : utilitaires partagés (liste, article, admin)
   - Chargement de blog/articles.json
   - Mini-rendu Markdown sécurisé (titres, gras, italique, listes, liens)
   - Formatage des dates en français
   ========================================================================== */

var XeliBlog = (function () {
  "use strict";

  /* ---------- Chargement des articles ---------- */
  function fetchArticles() {
    // cache-buster : le JSON est mis à jour après chaque publication
    return fetch("blog/articles.json?t=" + Date.now())
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) { return data.articles || []; });
  }

  /* ---------- Dates ---------- */
  var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin",
              "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

  function formatDate(iso) {
    var parts = String(iso || "").split("-");
    if (parts.length !== 3) return iso || "";
    var jour = parseInt(parts[2], 10);
    var mois = MOIS[parseInt(parts[1], 10) - 1] || "";
    return (jour === 1 ? "1ᵉʳ" : jour) + " " + mois + " " + parts[0];
  }

  /* ---------- Échappement HTML ---------- */
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* ---------- Mini-Markdown (sûr : tout est échappé d'abord) ----------
     Supporté : ## titre · ### sous-titre · - liste · **gras** · *italique*
     · [texte](https://lien) · paragraphes séparés par une ligne vide     */
  function inline(s) {
    return s
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, texte, url) {
        // uniquement http(s), liens relatifs internes ou ancres
        if (!/^(https?:\/\/|#|[a-z0-9_./-]+(#[\w-]+)?$)/i.test(url)) return texte;
        var externe = /^https?:\/\//i.test(url);
        return '<a href="' + url + '"' + (externe ? ' target="_blank" rel="noopener"' : "") + ">" + texte + "</a>";
      });
  }

  function renderMarkdown(src) {
    var lines = escapeHtml(src || "").split(/\r?\n/);
    var html = [];
    var liste = false;

    function fermerListe() { if (liste) { html.push("</ul>"); liste = false; } }

    var paragraphe = [];
    function fermerParagraphe() {
      if (paragraphe.length) {
        html.push("<p>" + inline(paragraphe.join(" ")) + "</p>");
        paragraphe = [];
      }
    }

    lines.forEach(function (raw) {
      var line = raw.trim();
      if (!line) { fermerParagraphe(); fermerListe(); return; }

      if (line.indexOf("### ") === 0) {
        fermerParagraphe(); fermerListe();
        html.push("<h3>" + inline(line.slice(4)) + "</h3>");
      } else if (line.indexOf("## ") === 0) {
        fermerParagraphe(); fermerListe();
        html.push("<h2>" + inline(line.slice(3)) + "</h2>");
      } else if (line.indexOf("- ") === 0) {
        fermerParagraphe();
        if (!liste) { html.push("<ul>"); liste = true; }
        html.push("<li>" + inline(line.slice(2)) + "</li>");
      } else {
        fermerListe();
        paragraphe.push(line);
      }
    });
    fermerParagraphe();
    fermerListe();
    return html.join("\n");
  }

  /* ---------- Slug ---------- */
  function slugify(titre) {
    return String(titre)
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // retire les accents
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "article";
  }

  return {
    fetchArticles: fetchArticles,
    formatDate: formatDate,
    escapeHtml: escapeHtml,
    renderMarkdown: renderMarkdown,
    slugify: slugify
  };
})();
