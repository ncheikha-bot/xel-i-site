/* ==========================================================================
   XEL I — École d'art · Dakar
   JavaScript principal : navigation, reveals, compteurs, parallaxe,
   galerie lightbox, validation du formulaire.
   Aucune dépendance — vanilla JS + Intersection Observer.
   ========================================================================== */

(function () {
  "use strict";

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- 1. Header : fond au scroll ---------- */
  var header = document.getElementById("header");
  function onScrollHeader() {
    header.classList.toggle("scrolled", window.scrollY > 24);
  }
  window.addEventListener("scroll", onScrollHeader, { passive: true });
  onScrollHeader();

  /* ---------- 2. Menu burger (mobile) ---------- */
  var burger = document.getElementById("burger");
  var nav = document.getElementById("nav");

  function closeNav() {
    nav.classList.remove("open");
    burger.setAttribute("aria-expanded", "false");
    burger.setAttribute("aria-label", "Ouvrir le menu");
    document.body.style.overflow = "";
  }

  burger.addEventListener("click", function () {
    var open = nav.classList.toggle("open");
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
    document.body.style.overflow = open ? "hidden" : "";
  });

  // Fermer le menu quand on clique sur un lien ou avec Échap
  nav.addEventListener("click", function (e) {
    if (e.target.closest("a")) closeNav();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && nav.classList.contains("open")) {
      closeNav();
      burger.focus();
    }
  });

  /* ---------- 3. Reveal au scroll (Intersection Observer) ---------- */
  var reveals = document.querySelectorAll(".reveal");
  if (reducedMotion || !("IntersectionObserver" in window)) {
    reveals.forEach(function (el) { el.classList.add("in"); });
  } else {
    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    reveals.forEach(function (el) { revealObserver.observe(el); });
  }

  /* ---------- 4. Compteurs animés (chiffres clés) ---------- */
  var counters = document.querySelectorAll("[data-count]");
  function animateCounter(el) {
    var target = parseInt(el.getAttribute("data-count"), 10);
    var duration = 900;
    var start = null;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      // easing out
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(eased * target);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  if (!reducedMotion && "IntersectionObserver" in window && counters.length) {
    var countObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animateCounter(entry.target);
            countObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.6 }
    );
    counters.forEach(function (el) { countObserver.observe(el); });
  }

  /* ---------- 5. Parallaxe légère (transform uniquement, rAF) ---------- */
  var parallaxEls = document.querySelectorAll(".parallax");
  if (!reducedMotion && parallaxEls.length && window.innerWidth > 860) {
    var ticking = false;
    function updateParallax() {
      parallaxEls.forEach(function (el) {
        var rect = el.parentElement.getBoundingClientRect();
        var speed = parseFloat(el.getAttribute("data-speed")) || 0.08;
        var offset = (rect.top + rect.height / 2 - window.innerHeight / 2) * speed;
        el.style.transform = "translateY(" + (-offset).toFixed(1) + "px)";
      });
      ticking = false;
    }
    window.addEventListener("scroll", function () {
      if (!ticking) {
        requestAnimationFrame(updateParallax);
        ticking = true;
      }
    }, { passive: true });
    updateParallax();
  }

  /* ---------- 6. Galerie : lightbox ---------- */
  var lightbox = document.getElementById("lightbox");
  var lightboxImg = document.getElementById("lightbox-img");
  var btnClose = document.getElementById("lightbox-close");
  var btnPrev = document.getElementById("lightbox-prev");
  var btnNext = document.getElementById("lightbox-next");
  var galleryBtns = Array.prototype.slice.call(document.querySelectorAll(".galerie__btn"));
  var currentIndex = -1;
  var lastFocused = null;

  function openLightbox(index) {
    currentIndex = index;
    var btn = galleryBtns[index];
    lightboxImg.src = btn.getAttribute("data-full");
    lightboxImg.alt = btn.querySelector("img").alt;
    lightbox.hidden = false;
    document.body.style.overflow = "hidden";
    lastFocused = document.activeElement;
    btnClose.focus();
  }

  function closeLightbox() {
    lightbox.hidden = true;
    lightboxImg.src = "";
    document.body.style.overflow = "";
    if (lastFocused) lastFocused.focus();
  }

  function showRelative(delta) {
    currentIndex = (currentIndex + delta + galleryBtns.length) % galleryBtns.length;
    var btn = galleryBtns[currentIndex];
    lightboxImg.src = btn.getAttribute("data-full");
    lightboxImg.alt = btn.querySelector("img").alt;
  }

  galleryBtns.forEach(function (btn, i) {
    btn.addEventListener("click", function () { openLightbox(i); });
  });
  btnClose.addEventListener("click", closeLightbox);
  btnPrev.addEventListener("click", function () { showRelative(-1); });
  btnNext.addEventListener("click", function () { showRelative(1); });

  // Clic sur le fond = fermer
  lightbox.addEventListener("click", function (e) {
    if (e.target === lightbox) closeLightbox();
  });

  // Navigation clavier dans la lightbox
  document.addEventListener("keydown", function (e) {
    if (lightbox.hidden) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") showRelative(-1);
    if (e.key === "ArrowRight") showRelative(1);
    // piège de focus minimal entre les 3 boutons
    if (e.key === "Tab") {
      var focusables = [btnClose, btnPrev, btnNext];
      var idx = focusables.indexOf(document.activeElement);
      if (e.shiftKey && (idx === 0 || idx === -1)) {
        e.preventDefault();
        focusables[focusables.length - 1].focus();
      } else if (!e.shiftKey && idx === focusables.length - 1) {
        e.preventDefault();
        focusables[0].focus();
      }
    }
  });

  /* ---------- 6 bis. Galerie : slider (flèches + défilement auto) ---------- */
  var track = document.getElementById("slider-track");
  var sliderPrev = document.getElementById("slider-prev");
  var sliderNext = document.getElementById("slider-next");

  if (track && sliderPrev && sliderNext) {
    var sliderItems = Array.prototype.slice.call(track.querySelectorAll(".slider__item"));

    // Item actuellement centré dans la fenêtre du slider
    function currentSlideIndex() {
      var center = track.scrollLeft + track.clientWidth / 2;
      var best = 0;
      var bestDist = Infinity;
      sliderItems.forEach(function (item, i) {
        var d = Math.abs(item.offsetLeft + item.offsetWidth / 2 - center);
        if (d < bestDist) { bestDist = d; best = i; }
      });
      return best;
    }

    // Animation manuelle (rAF) : le défilement natif "smooth" est annulé
    // par scroll-snap mandatory dans Chromium, on anime donc nous-mêmes
    // en désactivant le snap le temps de l'animation.
    var slideAnimId = null;
    function smoothTrackScrollTo(left) {
      if (reducedMotion) { track.scrollLeft = left; return; }
      if (slideAnimId !== null) cancelAnimationFrame(slideAnimId);
      var start = track.scrollLeft;
      var dist = left - start;
      var duration = 550;
      var t0 = null;
      track.style.scrollSnapType = "none";
      function step(ts) {
        if (!t0) t0 = ts;
        var p = Math.min((ts - t0) / duration, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        track.scrollLeft = start + dist * eased;
        if (p < 1) {
          slideAnimId = requestAnimationFrame(step);
        } else {
          slideAnimId = null;
          track.style.scrollSnapType = "";
        }
      }
      slideAnimId = requestAnimationFrame(step);
    }

    function slideBy(direction) {
      var target = currentSlideIndex() + direction * 2;
      if (target > sliderItems.length - 1) target = 0;      // boucle
      if (target < 0) target = sliderItems.length - 1;
      var item = sliderItems[target];
      var left = item.offsetLeft + item.offsetWidth / 2 - track.clientWidth / 2;
      left = Math.max(0, Math.min(left, track.scrollWidth - track.clientWidth));
      smoothTrackScrollTo(left);
    }
    sliderPrev.addEventListener("click", function () { slideBy(-1); });
    sliderNext.addEventListener("click", function () { slideBy(1); });

    // Défilement automatique discret : seulement quand le slider est visible,
    // en pause au survol, au focus, pendant le toucher et si l'onglet est masqué.
    if (!reducedMotion) {
      var paused = false;
      var sliderVisible = false;

      if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (entries) {
          sliderVisible = entries[0].isIntersecting;
        }, { threshold: 0.6 }).observe(track);
      }

      window.setInterval(function () {
        if (sliderVisible && !paused && !document.hidden && lightbox.hidden) slideBy(1);
      }, 5000);

      ["mouseenter", "focusin", "touchstart", "pointerdown"].forEach(function (evt) {
        track.addEventListener(evt, function () { paused = true; }, { passive: true });
      });
      ["mouseleave", "focusout"].forEach(function (evt) {
        track.addEventListener(evt, function () { paused = false; });
      });
      // après un toucher/drag, on laisse quelques secondes de répit
      ["touchend", "pointerup"].forEach(function (evt) {
        track.addEventListener(evt, function () {
          window.setTimeout(function () { paused = false; }, 6000);
        }, { passive: true });
      });
    }
  }

  /* ---------- 7. Formulaire : validation côté client ---------- */
  var form = document.getElementById("contact-form");
  var statusEl = form.querySelector(".form__status");

  function setError(input, message) {
    var field = input.closest(".form__field");
    field.classList.toggle("invalid", Boolean(message));
    field.querySelector(".form__error").textContent = message || "";
  }

  function validateInput(input) {
    var value = input.value.trim();
    if (input.required && !value) {
      setError(input, input.tagName === "SELECT" ? "Merci de choisir un programme." : "Ce champ est requis.");
      return false;
    }
    if (input.type === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError(input, "Merci d'indiquer un email valide.");
      return false;
    }
    if (input.type === "tel" && value && !/^[+\d][\d\s().-]{6,}$/.test(value)) {
      setError(input, "Merci d'indiquer un numéro valide (ex. +221 78 716 46 46).");
      return false;
    }
    if (input.type === "number" && value) {
      var n = parseFloat(value);
      var min = input.min ? parseFloat(input.min) : -Infinity;
      var max = input.max ? parseFloat(input.max) : Infinity;
      if (isNaN(n) || n < min || n > max) {
        setError(input, "Merci d'indiquer un âge entre " + input.min + " et " + input.max + " ans.");
        return false;
      }
    }
    setError(input, "");
    return true;
  }

  var formInputs = Array.prototype.slice.call(form.querySelectorAll("input, textarea"));
  formInputs.forEach(function (input) {
    input.addEventListener("blur", function () { validateInput(input); });
    input.addEventListener("input", function () {
      if (input.closest(".form__field").classList.contains("invalid")) validateInput(input);
    });
  });

  form.addEventListener("submit", function (e) {
    // valider tous les champs (pas de court-circuit : afficher toutes les erreurs)
    var results = formInputs.map(function (input) { return validateInput(input); });
    var allValid = results.every(Boolean);
    if (!allValid) {
      e.preventDefault();
      statusEl.textContent = "Merci de corriger les champs indiqués.";
      var firstInvalid = form.querySelector(".invalid input, .invalid textarea");
      if (firstInvalid) firstInvalid.focus();
      return;
    }
    // Si le formulaire n'est pas encore branché sur Formspree (VOTRE_ID),
    // on évite un envoi vers une URL invalide et on informe le visiteur.
    if (form.action.indexOf("VOTRE_ID") !== -1) {
      e.preventDefault();
      statusEl.textContent =
        "Formulaire de démonstration — contactez-nous au +221 78 716 46 46 ou xeliecoldart@gmail.com.";
    }
  });

  /* ---------- 8. Formulaire d'inscription : validation + envoi WhatsApp ---------- */
  var inscForm = document.getElementById("inscription-form");
  if (inscForm) {
    var inscStatus = inscForm.querySelector(".form__status");
    var inscInputs = Array.prototype.slice.call(
      inscForm.querySelectorAll("input, select, textarea")
    );

    inscInputs.forEach(function (input) {
      input.addEventListener("blur", function () { validateInput(input); });
      input.addEventListener("input", function () {
        if (input.closest(".form__field").classList.contains("invalid")) validateInput(input);
      });
    });

    // Aide contextuelle selon le programme choisi
    var programmeSelect = document.getElementById("i-programme");
    var programmeHint = document.getElementById("i-programme-hint");
    programmeSelect.addEventListener("change", function () {
      var v = programmeSelect.value;
      var hint = "";
      if (v.indexOf("Ngor") !== -1) {
        hint = "☀️ Cet été sur l'île de Ngor — pour les 6 à 18 ans.";
      } else if (v.indexOf("Art-Thlète — Mermoz") !== -1) {
        hint = "🏠 À Mermoz — accessible dès 2 ans et demi.";
      } else if (v.indexOf("adultes") !== -1) {
        hint = "🎨 Cours adultes à Mermoz — dessin et peinture pour l'instant.";
      } else if (v) {
        hint = "📍 À Dakar-Mermoz — programme structuré sur 6 mois.";
      }
      programmeHint.textContent = hint;
      validateInput(programmeSelect);
    });

    inscForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var results = inscInputs.map(function (input) { return validateInput(input); });
      if (!results.every(Boolean)) {
        inscStatus.textContent = "Merci de corriger les champs indiqués.";
        var firstInvalid = inscForm.querySelector(".invalid input, .invalid select, .invalid textarea");
        if (firstInvalid) firstInvalid.focus();
        return;
      }

      // Compose le message WhatsApp récapitulatif
      var val = function (id) { return document.getElementById(id).value.trim(); };
      var lines = [
        "Bonjour Xel i ! Je souhaite faire une inscription :",
        "• Élève : " + val("i-eleve") + " (" + val("i-age") + " ans)",
        "• Programme : " + val("i-programme"),
        "• Parent / tuteur : " + val("i-parent"),
        "• Téléphone : " + val("i-tel")
      ];
      if (val("i-email")) lines.push("• Email : " + val("i-email"));
      if (val("i-message")) lines.push("• Précisions : " + val("i-message"));

      var url = "https://wa.me/221787164646?text=" + encodeURIComponent(lines.join("\n"));
      window.open(url, "_blank", "noopener");
      inscStatus.textContent =
        "WhatsApp s'ouvre avec votre demande — appuyez sur « Envoyer » pour la transmettre à l'école.";
    });
  }
})();
