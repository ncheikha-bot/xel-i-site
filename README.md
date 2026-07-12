# Xel i — Site vitrine · École d'art, Dakar

Site statique (HTML / CSS / JS vanilla, aucun build) présentant l'école d'art **Xel i**,
première école d'art extrascolaire du Sénégal (Dakar-Mermoz, bientôt Almadies & Ngor).
Le contenu provient des documents fournis (« La Vision Xel i », « Xel I Théâtre »,
texte de positionnement) et la palette est celle de la charte graphique officielle
(`xel-i-INFO.pdf`) : vert `#3E4E3E` · jaune `#EBBE36` · rose `#DFB0CD` · noir `#2B2B2A`.

Sections : hero · marquee · vision (+ ouvertures Almadies/Ngor) · valeurs · pédagogie ·
cours d'art (7 disciplines + note adultes) · **Art-Thlète** (art + sport) · théâtre à
l'école · équipe · **galerie slider** (avec lightbox) · familles · **inscription**
(formulaire complet) · contact · footer, plus un **bouton WhatsApp flottant** (24h/24).

## Structure des fichiers

```
index.html              ← page d'accueil (toutes les sections)
blog.html               ← liste des articles du blog
article.html            ← lecture d'un article (?article=slug)
admin.html              ← espace de gestion du blog (connexion requise)
css/style.css           ← styles, palette, animations, responsive
css/admin.css           ← styles de l'espace de gestion
js/main.js              ← nav mobile, reveals, compteurs, parallaxe,
                          slider galerie, lightbox, formulaires
js/blog.js              ← chargement des articles, rendu markdown, dates
js/admin.js             ← connexion, création/édition/suppression d'articles
blog/articles.json      ← contenu du blog (un objet par article)
assets/
  logo/                 ← logo détouré, favicons
  photos/               ← 24 photos optimisées pour le web (~160-330 Ko)
  blog/                 ← images de couverture téléversées depuis l'admin
```

## Blog & espace de gestion

Le blog fonctionne **sans serveur** (« CMS Git ») : les articles vivent dans
`blog/articles.json` sur GitHub, `blog.html` les affiche, et `admin.html`
écrit directement dans le dépôt via l'API GitHub. Chaque publication
déclenche la reconstruction du site (~1 minute).

**Connexion à l'admin** (`admin.html`, lien discret « Gestion » dans le footer) :
identifiant + mot de passe. Sans backend, le mécanisme est le suivant : la clé
GitHub est chiffrée dans le navigateur (AES-GCM 256, clé dérivée du mot de passe
par PBKDF2 150 000 itérations) et stockée dans `blog/acces.json` ; le bon mot de
passe la déchiffre localement, un mauvais mot de passe échoue au déchiffrement.
Le mot de passe lui-même n'est jamais stocké ni transmis.

**Configuration initiale (une fois, équipe technique)** — dépliant en bas de
l'écran de connexion :
1. Sur github.com : *Settings → Developer settings → Personal access tokens →
   Fine-grained tokens* → jeton limité au dépôt `xel-i-site`, permission
   **Contents : Read and write**.
2. Dans le dépliant « Configuration initiale », coller ce jeton, choisir un
   identifiant et un mot de passe (≥ 8 caractères) → le compte est enregistré
   dans le dépôt et utilisable ~1 minute plus tard.
3. Refaire la même opération pour changer de mot de passe ou renouveler le
   jeton (même identifiant = remplacement), ou ajouter d'autres comptes.

⚠️ Limite d'un site 100 % statique : `blog/acces.json` est public (chiffré).
Choisissez un mot de passe solide — un mot de passe faible peut être attaqué
hors-ligne.

**Mode démo** : bouton « Découvrir en mode démo » sur l'écran de connexion —
aucun identifiant requis. Toute l'interface fonctionne (création, édition,
suppression, aperçu) mais rien n'est écrit dans le dépôt : idéal pour montrer
l'outil au client.

**Écrire un article** : titre, date, catégorie, résumé, image de couverture
(téléversée dans `assets/blog/`), contenu avec mise en forme simple
(`## sous-titre`, `**gras**`, `*italique*`, `- liste`, `[texte](lien)`) et
aperçu en direct. Décocher « Publier » enregistre un brouillon invisible
sur le site public.

## Slider de la galerie

- Défilement au doigt (snap natif), aux flèches, et automatique toutes les 5 s.
- L'auto-défilement se met en pause au survol, au focus, pendant le toucher,
  quand l'onglet est masqué, quand la lightbox est ouverte, et se désactive
  entièrement avec `prefers-reduced-motion`.
- Pour ajouter une photo : dupliquer un `<li class="slider__item">` dans
  `index.html` (section GALERIE) en renseignant `src`, `data-full`, `alt`
  et les dimensions réelles.

## Formulaire d'inscription (section `#inscription`)

Formulaire complet en trois blocs — l'élève (nom, âge), le programme (menu avec les
7 disciplines, les deux formules Art-Thlète et les cours adultes, avec aide
contextuelle selon le choix), le parent/tuteur (nom, téléphone, email facultatif) —
plus un champ de précisions.

**Fonctionnement sans backend** : à l'envoi, après validation des champs, WhatsApp
s'ouvre avec un message récapitulatif pré-rempli adressé au +221 78 716 46 46 ;
le visiteur n'a plus qu'à appuyer sur « Envoyer ». Aucun service tiers à configurer.
Pour modifier les programmes proposés, éditer le `<select id="i-programme">` dans
`index.html` ; les textes d'aide contextuelle sont dans `js/main.js` (section 8).

## Bouton WhatsApp

Le bouton flottant (et les CTA Art-Thlète / équipe / contact) pointent vers
`https://wa.me/221787164646` avec un message pré-rempli. Pour changer le numéro,
chercher `wa.me/221787164646` dans `index.html`.

Les fichiers sources d'origine (docx, pdf, images WhatsApp) restent à la racine du
projet — ils ne sont **pas** utilisés par le site et peuvent être exclus du déploiement.

## Lancer le site en local

N'importe quel serveur statique fonctionne, par exemple :

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

(Ouvrir `index.html` directement dans le navigateur fonctionne aussi.)

## Remplacer une photo

1. Déposer la nouvelle image dans `assets/photos/` (idéalement ≤ 1600 px de large,
   JPEG qualité ~80).
2. Dans `index.html`, chercher le nom de l'ancien fichier et remplacer les attributs
   `src` (et `data-full` pour la galerie).
3. Mettre à jour `width`/`height` avec les dimensions réelles de la nouvelle image
   (évite tout décalage de mise en page) et adapter le texte `alt`.

## Modifier un texte

Tout le contenu est dans `index.html`, organisé par sections commentées
(`<!-- ============ HERO ============ -->`, `VISION`, `VALEURS`, `PÉDAGOGIE`,
`ATELIERS`, `THÉÂTRE`, `GALERIE`, `FAMILLES`, `CONTACT`, `FOOTER`).
Chercher la section voulue et éditer le texte directement.

Les mots en écriture manuscrite utilisent la classe `script` (police Pacifico,
celle du logo) ; les mots soulignés « au pinceau » utilisent `accent-underline`
(jaune) ou `accent-underline accent-underline--pink` (rose).

## Brancher le formulaire de contact (Formspree)

Le formulaire est prêt pour [Formspree](https://formspree.io) (gratuit jusqu'à
50 messages/mois, aucun backend à héberger) :

1. Créer un compte sur formspree.io avec l'adresse `xeliecoldart@gmail.com`.
2. Créer un nouveau formulaire → copier son identifiant (ex. `xkgqwzab`).
3. Dans `index.html`, remplacer `VOTRE_ID` dans
   `action="https://formspree.io/f/VOTRE_ID"` par cet identifiant.

Tant que `VOTRE_ID` n'est pas remplacé, le formulaire reste en mode démonstration :
il valide les champs mais n'envoie rien (un message l'indique au visiteur).

## Déploiement

Le site est 100 % statique : déposer le dossier (sans les fichiers sources de la
racine) sur n'importe quel hébergement — Netlify, Vercel, GitHub Pages, OVH, etc.
Une fois le nom de domaine connu, remplacer l'URL relative de la balise
`og:image` dans `<head>` par une URL absolue (ex.
`https://votredomaine.sn/assets/photos/atelier-sculpture-artiste.jpg`).

## Accessibilité & performance

- Les animations respectent `prefers-reduced-motion` (tout se désactive proprement).
- Animations uniquement sur `transform`/`opacity` (60 fps).
- Images en `loading="lazy"` avec dimensions déclarées (pas de layout shift).
- Contrastes AA, navigation clavier complète (menu, galerie/lightbox, formulaire).
