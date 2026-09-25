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
        const privacyConsent = data.get("privacyConsent") === "yes";
        if (!privacyConsent) {
          setFeedbackStatus("Votre accord est nécessaire pour transmettre le retour par email.", "error");
          return;
        }
        form.setAttribute("aria-busy", "true");
        if (submit) { submit.disabled = true; submit.textContent = "Envoi en cours…"; }
        setFeedbackStatus("Envoi du retour via EmailJS…");
        try {
          report = window.ArcadeFeedbackStore?.create({ type: data.get("type"), gameKey: data.get("gameKey"), gameTitle: selected?.textContent, urgency: data.get("urgency"), description: data.get("description"), reporterPseudo: data.get("reporterPseudo"), privacyConsent });
          if (!report) throw new Error("feedback_unavailable");
          await window.ArcadeFeedbackStore.sendByEmail(report.id);
          form.reset(); prefillFeedbackPseudo(); setFeedbackStatus(`Merci ! Retour envoyé. Référence à conserver : ${report.id}`, "success");
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
      const coinGame = { mode: "solo", chooser: "Joueur 1", side: "Pile", scores: { "Joueur 1": 0, "Joueur 2": 0 }, busy: false };
      function openCoinGame(event) { event.stopPropagation(); const dialog = document.getElementById("coinGameDialog"); if (dialog && !dialog.open) dialog.showModal(); renderCoinGame(); }
      function renderCoinGame() {
        const duel = coinGame.mode === "duel";
        document.querySelectorAll("[data-coin-mode]").forEach((button) => button.classList.toggle("is-selected", button.dataset.coinMode === coinGame.mode));
        document.querySelectorAll("[data-coin-side]").forEach((button) => button.classList.toggle("is-selected", button.dataset.coinSide === coinGame.side));
        document.getElementById("coinChooserRow").hidden = !duel;
        document.getElementById("coinScoreboard").hidden = !duel;
        document.getElementById("coinChoiceLabel").textContent = duel ? `${coinGame.chooser} choisit` : "Vous choisissez";
        const other = coinGame.side === "Pile" ? "Face" : "Pile";
        document.getElementById("coinAssignment").textContent = duel ? `${coinGame.chooser} : ${coinGame.side} · ${coinGame.chooser === "Joueur 1" ? "Joueur 2" : "Joueur 1"} : ${other}` : `Vous avez choisi ${coinGame.side}.`;
        document.getElementById("coinScoreP1").textContent = coinGame.scores["Joueur 1"];
        document.getElementById("coinScoreP2").textContent = coinGame.scores["Joueur 2"];
      }
      async function beginCoinStake() {
        if (window.ARCADE_CONFIG?.mode === "local-test") {
          const session = window.ArcadeLocalStore?.createSession({
            gameKey: "pile-face", title: "Pile ou Face", url: "index.html",
          });
          if (!session) throw new Error("profile_required");
          window.ArcadeLocalStore.startSession(session.id, { mode: coinGame.mode });
          return { id: session.id, local: true };
        }
        const random = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const session = await window.ArcadeSupabase?.startGame("pile-face", `game:pile-face:${random}`);
        if (!session?.session_id) throw new Error("authentication_required");
        return { id: session.session_id, local: false };
      }

      async function settleCoinStake(stake, won, metadata) {
        if (stake.local) {
          window.ArcadeLocalStore.finishSession(stake.id, won ? "won" : "lost", metadata);
        } else {
          await window.ArcadeSupabase.settleGame(stake.id, won ? "won" : "lost", metadata);
        }
        await window.ArcadePlatform?.refreshAccount?.();
      }

      async function tossCoin() {
        const display = document.getElementById("coinMatchDisplay"), button = document.getElementById("coinTossButton"), status = document.getElementById("coinMatchStatus");
        if (coinGame.busy) return;
        coinGame.busy = true;
        button.disabled = true;
        status.textContent = "Engagement de la mise de 1 Coin…";
        let stake;
        try {
          stake = await beginCoinStake();
          display.textContent = "?";
          display.classList.add("flipping");
          status.textContent = "La pièce est en l’air…";
          playSound(800, .1);
          await new Promise((resolve) => setTimeout(resolve, 620));
          const result = Math.random() < .5 ? "Pile" : "Face";
          const duel = coinGame.mode === "duel";
          const winner = result === coinGame.side ? coinGame.chooser : (coinGame.chooser === "Joueur 1" ? "Joueur 2" : "Joueur 1");
          const won = duel ? winner === "Joueur 1" : result === coinGame.side;
          display.textContent = result === "Pile" ? "P" : "F";
          display.classList.remove("flipping");
          if (duel) {
            coinGame.scores[winner]++;
            status.textContent = `${result} ! ${winner} remporte la manche. ${won ? "+2 Coins" : "Mise perdue"}.`;
          } else {
            status.textContent = won ? `${result} ! Vous gagnez 2 Coins.` : `${result} ! La pièce gagne votre mise.`;
          }
          await settleCoinStake(stake, won, { mode: coinGame.mode, side: coinGame.side, result, winner });
          playSound(result === "Pile" ? 600 : 400, .15);
          renderCoinGame();
        } catch (error) {
          display.classList.remove("flipping");
          const message = String(error?.message || "");
          status.textContent = message.includes("insufficient_balance")
            ? "Solde insuffisant : il faut 1 Coin pour lancer la pièce."
            : "Connectez-vous à votre compte pour engager la mise.";
        } finally {
          coinGame.busy = false;
          button.disabled = false;
        }
      }
      function initCoinGame() {
        document.querySelectorAll("[data-coin-mode]").forEach((button) => button.addEventListener("click", () => { coinGame.mode = button.dataset.coinMode; renderCoinGame(); }));
        document.querySelectorAll("[data-coin-side]").forEach((button) => button.addEventListener("click", () => { coinGame.side = button.dataset.coinSide; renderCoinGame(); }));
        document.getElementById("coinChooser")?.addEventListener("change", (event) => { coinGame.chooser = event.target.value; renderCoinGame(); });
        document.getElementById("coinTossButton")?.addEventListener("click", tossCoin);
      }

      // ===== LANCEMENT DES JEUX =====
      function launchGame(url, event) {
        event.stopPropagation();
        const card = event.currentTarget.closest("[data-game]");
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
        arcade: "Arcade", reflex: "Réflexes", memory: "Mémoire", logic: "Logique", enigma: "Énigmes", strategy: "Stratégie", cards: "Jeux de cartes", dice: "Jeux de dés", puzzle: "Puzzle", adventure: "Aventure", chance: "Hasard", progression: "Progression", other: "Autres",
      });
      const catalogTagAliases = Object.freeze({
        arcade: "arcade", reflexe: "reflex", reflexes: "reflex", memoire: "memory", logique: "logic", reflexion: "logic", enigme: "enigma", enigmes: "enigma", mystere: "enigma", strategie: "strategy", carte: "cards", cartes: "cards", card: "cards", cards: "cards", solitaire: "cards", "jeux de des": "dice", dice: "dice", puzzle: "puzzle", aventure: "adventure", exploration: "adventure",
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
        syncPreferencesForm(); populateFeedbackGames(); initialiseGameCatalog(); initCoinGame();
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
