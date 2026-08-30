      // ===== PRÉFÉRENCES ET RETOURS =====
      const PREFERENCES_KEY = "francis-arcade-preferences";
      const defaultPreferences = Object.freeze({ soundEffects: true, animations: !window.matchMedia("(prefers-reduced-motion: reduce)").matches, highContrast: false });
      function loadPreferences() {
        try {
          const saved = JSON.parse(localStorage.getItem(PREFERENCES_KEY) || "null");
          return {
            soundEffects: typeof saved?.soundEffects === "boolean" ? saved.soundEffects : defaultPreferences.soundEffects,
            animations: typeof saved?.animations === "boolean" ? saved.animations : defaultPreferences.animations,
            highContrast: typeof saved?.highContrast === "boolean" ? saved.highContrast : defaultPreferences.highContrast,
          };
        } catch (_) { return { ...defaultPreferences }; }
      }
      let preferences = loadPreferences();
      function applyPreferences() { document.documentElement.dataset.animations = preferences.animations ? "on" : "off"; document.documentElement.dataset.highContrast = String(preferences.highContrast); }
      function savePreferences(message = "Préférences enregistrées sur cet appareil.") {
        try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences)); } catch (_) { message = "Préférences appliquées pour cette session."; }
        const status = document.getElementById("preferencesStatus");
        if (status) status.textContent = message;
      }
      function syncPreferencesForm() {
        ["soundEffects", "animations", "highContrast"].forEach((name) => {
          const control = document.getElementById(`${name}Setting`);
          if (control) control.checked = preferences[name];
        });
      }
      function populateFeedbackGames() {
        const select = document.getElementById("feedbackGame");
        if (!select) return;
        const knownKeys = new Set([...select.options].map((option) => option.value));
        document.querySelectorAll(".game-card[data-game]").forEach((card) => {
          const key = card.dataset.game;
          const title = card.querySelector(".game-title")?.textContent?.trim();
          if (!key || !title || knownKeys.has(key)) return;
          const option = document.createElement("option");
          option.value = key; option.textContent = title; select.appendChild(option); knownKeys.add(key);
        });
      }
      function prefillFeedbackPseudo() {
        const input = document.querySelector('#feedbackForm [name="reporterPseudo"]');
        const pseudo = window.ArcadePlatform?.getSession()?.user?.pseudo || "";
        if (input && !input.value) input.value = pseudo;
      }
      function setFeedbackStatus(message, state = "") {
        const status = document.getElementById("feedbackStatus");
        if (!status) return;
        status.textContent = message;
        if (state) status.dataset.state = state; else delete status.dataset.state;
      }
      async function handleFeedbackSubmit(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const select = form.elements.gameKey;
        const selected = select.options[select.selectedIndex];
        const submit = form.querySelector('[type="submit"]');
        const label = submit?.textContent || "Envoyer le retour";
        let report;
        form.setAttribute("aria-busy", "true");
        if (submit) { submit.disabled = true; submit.textContent = "Envoi en cours…"; }
        setFeedbackStatus("Envoi sécurisé vers EmailJS…");
        try {
          report = window.ArcadeFeedbackStore?.create({ type: data.get("type"), gameKey: data.get("gameKey"), gameTitle: selected?.textContent, urgency: data.get("urgency"), description: data.get("description"), reporterPseudo: data.get("reporterPseudo") });
          if (!report) throw new Error("feedback_unavailable");
          await window.ArcadeFeedbackStore.sendByEmail(report.id);
          form.reset(); prefillFeedbackPseudo(); setFeedbackStatus("Merci ! Votre retour a été envoyé par email.", "success");
        } catch (error) {
          if (report) { form.reset(); prefillFeedbackPseudo(); setFeedbackStatus("Le retour est sauvegardé sur cet appareil, mais l’email n’a pas pu être envoyé.", "warning"); }
          else setFeedbackStatus(error?.message === "feedback_description_too_short" ? "Ajoutez quelques précisions (10 caractères minimum)." : "Le retour n’a pas pu être enregistré pour le moment.", "error");
        } finally {
          form.removeAttribute("aria-busy");
          if (submit) { submit.disabled = false; submit.textContent = label; }
        }
      }
      applyPreferences();
      // ===== GÉNÉRATION DES PARTICULES =====
      function createParticles() {
        const container = document.getElementById("particles");
        if (!preferences.animations || container.childElementCount) return;
        const colors = ["#00ffff", "#ff00ff", "#00ff88", "#ffff00", "#4d7cff"];

        for (let i = 0; i < 20; i++) {
          const particle = document.createElement("div");
          particle.className = "particle";
          particle.style.left = Math.random() * 100 + "%";
          particle.style.animationDelay = Math.random() * 15 + "s";
          particle.style.animationDuration = 10 + Math.random() * 10 + "s";
          particle.style.background =
            colors[Math.floor(Math.random() * colors.length)];
          container.appendChild(particle);
        }
      }
      createParticles();

      // ===== PILE OU FACE =====
      function playCoin(event) {
        event.stopPropagation();
        const display = document.getElementById("coinDisplay");
        display.classList.add("flipping");

        // Son de flip (optionnel)
        playSound(800, 0.1);

        setTimeout(() => {
          const result = Math.random() < 0.5 ? "P" : "F";
          display.textContent = result;
          display.classList.remove("flipping");

          // Son de résultat
          playSound(result === "P" ? 600 : 400, 0.15);
        }, 600);
      }

      // ===== DÉ PERSONNALISABLE =====
      function rollDice(event) {
        event.stopPropagation();
        const faces = parseInt(document.getElementById("diceFaces").value) || 6;
        const display = document.getElementById("diceDisplay");

        display.classList.add("rolling");
        playSound(500, 0.1);

        // Animation de chiffres aléatoires
        let rolls = 0;
        const maxRolls = 10;
        const interval = setInterval(() => {
          display.textContent = Math.floor(Math.random() * faces) + 1;
          rolls++;

          if (rolls >= maxRolls) {
            clearInterval(interval);
            const result = Math.floor(Math.random() * faces) + 1;
            display.textContent = result;
            display.classList.remove("rolling");
            playSound(700, 0.15);
          }
        }, 50);
      }

      // ===== LANCEMENT DES JEUX =====
      function launchGame(url, event) {
        event.stopPropagation();
        const card = event.currentTarget.closest(".game-card");
        const gameKey = card?.dataset.game || url.replace(/\.html$/i, "");
        const title = card?.querySelector(".game-title")?.textContent?.trim() || gameKey;
        const launch = window.ArcadePlatform?.beginGame({ gameKey, title, url });
        if (launch === false) return;
        const destination = launch?.url || url;

        playSound(900, 0.1);

        // Animation de transition
        document.body.style.opacity = "0";
        document.body.style.transition = "opacity 0.3s ease";

        setTimeout(() => {
          window.location.href = destination;
        }, 300);
      }

      // ===== FOCUS SUR CARTE =====
      function focusCard(card) {
        // Effet visuel subtil au clic
        card.style.transform = "scale(0.98)";
        setTimeout(() => {
          card.style.transform = "";
        }, 150);
      }

      // ===== SYSTÈME AUDIO SIMPLE =====
      let audioContext = null;

      function playSound(frequency, duration) {
        if (!preferences.soundEffects) return;
        try {
          if (!audioContext) {
            audioContext = new (
              window.AudioContext || window.webkitAudioContext
            )();
          }

          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();

          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);

          const chipwaveEnabled = document.documentElement.dataset.arcadeSound === "chipwave";
          oscillator.frequency.value = chipwaveEnabled ? frequency * 1.12 : frequency;
          oscillator.type = chipwaveEnabled ? "square" : "sine";

          gainNode.gain.setValueAtTime(chipwaveEnabled ? 0.055 : 0.1, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(
            0.01,
            audioContext.currentTime + duration,
          );

          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + duration);
        } catch (e) {
          // Audio non supporté, on continue silencieusement
        }
      }

      // ===== CATALOGUE DE JEUX =====
      const catalogCategoryLabels = Object.freeze({
        arcade: "Arcade", reflex: "Réflexes", memory: "Mémoire", logic: "Logique", enigma: "Énigmes", strategy: "Stratégie", puzzle: "Puzzle", adventure: "Aventure", chance: "Hasard", progression: "Progression", other: "Autres",
      });
      const catalogTagAliases = Object.freeze({
        arcade: "arcade", reflexe: "reflex", reflexes: "reflex", memoire: "memory", logique: "logic", reflexion: "logic", enigme: "enigma", enigmes: "enigma", mystere: "enigma", strategie: "strategy", puzzle: "puzzle", aventure: "adventure", exploration: "adventure",
      });
      const catalogDifficultyRank = Object.freeze({ easy: 1, medium: 2, hard: 3 });

      function normalizeCatalogText(value) {
        return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
      }

      function getCardDifficulty(card) {
        if (card.querySelector(".difficulty-hard")) return "hard";
        if (card.querySelector(".difficulty-medium")) return "medium";
        return "easy";
      }

      function getCardCategories(card, configuredCategories) {
        const tagCategories = [...card.querySelectorAll(".game-tags .tag")]
          .map((tag) => catalogTagAliases[normalizeCatalogText(tag.textContent)])
          .filter(Boolean);
        return [...new Set([...(configuredCategories || []), ...tagCategories])];
      }

      function initialiseGameCatalog() {
        const grid = document.querySelector(".games-grid");
        const search = document.getElementById("gameSearch");
        const sort = document.getElementById("gameSort");
        const difficulty = document.getElementById("difficultyFilter");
        const result = document.getElementById("catalogResults");
        const empty = document.getElementById("catalogEmpty");
        const clear = document.getElementById("clearCatalogFilters");
        const categoryButtons = [...document.querySelectorAll("[data-category-filter]")];
        if (!grid || !search || !sort || !difficulty || !result || !empty || !clear) return;

        const configuredMap = window.ARCADE_CONFIG?.localEconomy?.gameCategories || window.ARCADE_CONFIG?.gameCategories || {};
        let activeCategory = "all";
        const entries = [...grid.querySelectorAll(".game-card")].map((card, order) => {
          const key = card.dataset.game || `game-${order}`;
          const categories = getCardCategories(card, configuredMap[key]);
          const title = card.querySelector(".game-title")?.textContent?.trim() || key;
          card.dataset.catalogOrder = String(order);
          card.dataset.categories = categories.join(" ");
          return {
            card, key, categories, title, order,
            difficulty: getCardDifficulty(card),
            searchText: normalizeCatalogText([title, card.textContent, ...categories.map((category) => catalogCategoryLabels[category] || category)].join(" ")),
          };
        });

        function selectCategory(category) {
          activeCategory = category;
          categoryButtons.forEach((button) => {
            const selected = button.dataset.categoryFilter === category;
            button.classList.toggle("is-active", selected);
            button.setAttribute("aria-pressed", String(selected));
          });
        }

        function updateCatalog() {
          const query = normalizeCatalogText(search.value.trim());
          const stats = new Map((window.ArcadeStats?.getGameStats?.() || []).map((stat) => [stat.key, stat]));
          const visible = entries.filter((entry) =>
            (!query || entry.searchText.includes(query)) &&
            (activeCategory === "all" || entry.categories.includes(activeCategory)) &&
            (difficulty.value === "all" || entry.difficulty === difficulty.value),
          );

          visible.sort((left, right) => {
            if (sort.value === "name") return left.title.localeCompare(right.title, "fr");
            if (sort.value === "popularity") return (stats.get(right.key)?.plays || 0) - (stats.get(left.key)?.plays || 0) || left.order - right.order;
            if (sort.value.startsWith("difficulty-")) {
              const leftValue = stats.get(left.key)?.observedDifficulty ?? catalogDifficultyRank[left.difficulty] / 3;
              const rightValue = stats.get(right.key)?.observedDifficulty ?? catalogDifficultyRank[right.difficulty] / 3;
              return (sort.value === "difficulty-desc" ? rightValue - leftValue : leftValue - rightValue) || left.order - right.order;
            }
            return left.order - right.order;
          });

          entries.forEach((entry) => { entry.card.hidden = true; });
          visible.forEach((entry) => { entry.card.hidden = false; grid.appendChild(entry.card); });
          result.textContent = `${visible.length} ${visible.length > 1 ? "jeux" : "jeu"}`;
          empty.hidden = visible.length > 0;
          clear.hidden = !query && activeCategory === "all" && difficulty.value === "all" && sort.value === "recommended";
        }

        categoryButtons.forEach((button) => button.addEventListener("click", () => {
          selectCategory(button.dataset.categoryFilter || "all");
          updateCatalog();
        }));
        search.addEventListener("input", updateCatalog);
        sort.addEventListener("change", updateCatalog);
        difficulty.addEventListener("change", updateCatalog);
        clear.addEventListener("click", () => {
          search.value = "";
          sort.value = "recommended";
          difficulty.value = "all";
          selectCategory("all");
          updateCatalog();
        });
        updateCatalog();
      }
      // ===== INITIALISATION =====
      document.addEventListener("DOMContentLoaded", () => {
        const preferencesForm = document.getElementById("preferencesForm");
        const resetPreferencesButton = document.getElementById("resetPreferencesButton");
        const exploreGamesButton = document.getElementById("exploreGamesButton");
        const feedbackButton = document.getElementById("feedbackButton");
        const feedbackForm = document.getElementById("feedbackForm");
        syncPreferencesForm(); populateFeedbackGames(); initialiseGameCatalog();
        preferencesForm?.addEventListener("change", (event) => { const control = event.target; if (!(control instanceof HTMLInputElement) || !(control.name in preferences)) return; preferences = { ...preferences, [control.name]: control.checked }; applyPreferences(); if (preferences.animations) createParticles(); savePreferences(); });
        resetPreferencesButton?.addEventListener("click", () => { preferences = { ...defaultPreferences }; applyPreferences(); syncPreferencesForm(); if (preferences.animations) createParticles(); savePreferences("Paramètres par défaut restaurés."); });
        exploreGamesButton?.addEventListener("click", () => { document.querySelector(".games-grid")?.scrollIntoView({ behavior: preferences.animations ? "smooth" : "auto", block: "start" }); });
        feedbackButton?.addEventListener("click", () => { prefillFeedbackPseudo(); setFeedbackStatus(""); const dialog = document.getElementById("feedbackDialog"); if (dialog instanceof HTMLDialogElement && !dialog.open) dialog.showModal(); });
        feedbackForm?.addEventListener("submit", handleFeedbackSubmit);
        document.querySelectorAll(".footer-link[data-open-dialog]").forEach((link) => link.addEventListener("click", (event) => { event.preventDefault(); const dialog = document.getElementById(link.dataset.openDialog); if (dialog instanceof HTMLDialogElement && !dialog.open) dialog.showModal(); }));
        document.querySelectorAll(".info-dialog [data-close-dialog]").forEach((button) => button.addEventListener("click", () => { const dialog = button.closest("dialog"); if (dialog?.open) dialog.close(); }));
        document.querySelectorAll(".info-dialog").forEach((dialog) => dialog.addEventListener("click", (event) => { if (event.target === dialog && dialog.open) dialog.close(); }));
        const requestedDialog = location.hash ? document.getElementById(location.hash.slice(1)) : null;
        if (requestedDialog instanceof HTMLDialogElement && !requestedDialog.open) requestedDialog.showModal();
        // Activation du contexte audio au premier clic
        document.body.addEventListener(
          "click",
          () => {
            if (preferences.soundEffects && !audioContext) {
              audioContext = new (
                window.AudioContext || window.webkitAudioContext
              )();
            }
          },
          { once: true },
        );
      });

      // ===== EMPÊCHER LE SCROLL HORIZONTAL =====
      document.body.addEventListener(
        "touchmove",
        (e) => {
          if (e.touches.length > 1) {
            e.preventDefault();
          }
        },
        { passive: false },
      );
