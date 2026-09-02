(function arcadePlatform(global) {
  "use strict";

  const config = global.ARCADE_CONFIG || {};
  const economy = config.localEconomy || {};
  const store = global.ArcadeLocalStore;
  const state = { profile: null, currentChallenge: null };

  const labels = {
    starter_grant: "Coins de départ",
    game_entry: "Partie lancée",
    game_win: "Victoire",
    daily_challenge_bonus: "Bonus quotidien",
    game_loss: "Défaite",
    game_abandoned: "Partie abandonnée",
    game_cancelled: "Partie quittée avant démarrage",
    shop_purchase: "Achat boutique",
    admin_adjustment: "Ajustement test",
  };

  function element(id) {
    return document.getElementById(id);
  }

  function coinsToUnits(coins) {
    return Math.round(Number(coins || 0) * Number(config.coins?.unitsPerCoin || 100));
  }

  function formatCoins(units) {
    const value = Number(units || 0) / Number(config.coins?.unitsPerCoin || 100);
    return new Intl.NumberFormat("fr-BE", {
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: config.coins?.decimals ?? 2,
    }).format(value);
  }

  function setText(id, value) {
    const node = element(id);
    if (node) node.textContent = value;
  }

  function setMessage(message, type = "info") {
    const node = element("platformMessage");
    if (!node) return;
    node.textContent = message;
    node.dataset.type = type;
    node.hidden = !message;
  }

  function readableError(error) {
    const messages = {
      invalid_pseudo: "Le pseudo doit contenir entre 2 et 20 lettres, chiffres, espaces, _ ou -.",
      profile_required: "Choisissez d’abord un pseudo.",
      insufficient_balance: "Solde insuffisant pour lancer cette partie.",
      active_session_exists: "Une autre partie est encore active.",
      session_not_found: "Cette session de jeu est introuvable.",
      session_closed: "Cette partie est déjà terminée.",
      admin_required: "Cette action est réservée au profil ADMIN de test.",
      profile_not_found: "Le profil sélectionné n’existe plus.",
      invalid_adjustment: "Saisissez un montant supérieur à zéro.",
      negative_balance: "Le solde d’un profil ne peut pas devenir négatif.",
      daily_challenge_completed: "Le défi quotidien est déjà terminé. Revenez demain.",
    };
    return messages[error?.message] || "Une erreur locale est survenue.";
  }

  function isConfigured() {
    return config.mode === "local-test" && Boolean(store);
  }

  function renderSignedOut() {
    state.profile = null;
    setText("coinBalance", "—");
    setText("accountLabel", "Choisir un pseudo");
    element("signedOutPanel")?.removeAttribute("hidden");
    element("signedInPanel")?.setAttribute("hidden", "");
    element("openAdminButton")?.setAttribute("hidden", "");
    document.querySelectorAll("[data-requires-account]").forEach((button) => {
      button.disabled = true;
    });
  }

  function renderSignedIn(profile) {
    setText("coinBalance", formatCoins(profile.balanceUnits));
    setText("accountLabel", profile.pseudo);
    setText("accountEmail", profile.pseudo);
    setText("modalCoinBalance", `${formatCoins(profile.balanceUnits)} Coins fictifs`);
    element("signedOutPanel")?.setAttribute("hidden", "");
    element("signedInPanel")?.removeAttribute("hidden");
    document.querySelectorAll("[data-requires-account]").forEach((button) => {
      button.disabled = false;
    });
    const adminButton = element("openAdminButton");
    if (profile.isAdmin) adminButton?.removeAttribute("hidden");
    else adminButton?.setAttribute("hidden", "");
  }

  function updateEconomyCopy() {
    setText("gamePlayCost", `${formatCoins(coinsToUnits(economy.playCostCoins ?? 1))} Coin`);
    setText("dailyChallengeReward", `${formatCoins(coinsToUnits(economy.dailyChallengePayoutCoins ?? 1.25))} Coins`);
    setText("dailyCompletionBonus", `${formatCoins(coinsToUnits(economy.dailyCompletionBonusCoins ?? 5))} Coins`);
    setText("starterCoins", `${formatCoins(coinsToUnits(economy.starterCoins ?? 5))} Coins`);
    setText("starterCoinsDialog", `${formatCoins(coinsToUnits(economy.starterCoins ?? 5))} Coins de départ`);
    setText("adminPseudoHint", (economy.adminPseudos || ["ADMIN"]).join(", "));
  }

  function renderTransactions(transactions) {
    const list = element("transactionList");
    if (!list) return;
    list.replaceChildren();
    if (!transactions.length) {
      const empty = document.createElement("li");
      empty.className = "transaction-empty";
      empty.textContent = "Aucune transaction pour le moment.";
      list.appendChild(empty);
      return;
    }

    transactions.forEach((transaction) => {
      const item = document.createElement("li");
      item.className = "transaction-item";
      const info = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = transaction.label
        ? `${labels[transaction.type] || transaction.type} · ${transaction.label}`
        : labels[transaction.type] || transaction.type;
      const date = document.createElement("small");
      date.textContent = new Intl.DateTimeFormat("fr-BE", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(transaction.createdAt));
      info.append(title, date);

      const amount = document.createElement("span");
      if (transaction.amountUnits > 0) amount.className = "amount-positive";
      else if (transaction.amountUnits < 0) amount.className = "amount-negative";
      else amount.className = "amount-neutral";
      const sign = transaction.amountUnits > 0 ? "+" : transaction.amountUnits < 0 ? "−" : "";
      amount.textContent = `${sign}${formatCoins(Math.abs(transaction.amountUnits))} 🪙`;
      item.append(info, amount);
      list.appendChild(item);
    });
  }

  function renderDailyChallengeCards(profile) {
    const dayKey = dailyChallengeKey();
    document.querySelectorAll("[data-challenge-key]").forEach((button) => {
      const completed = (profile?.sessions || []).find((session) => session.gameKey === button.dataset.challengeKey && session.metadata?.dailyKey === dayKey && ["won", "lost"].includes(session.state));
      button.disabled = Boolean(completed);
      const description = button.querySelector("small");
      if (!description) return;
      description.textContent = completed?.state === "won" ? "Réussi · récompense obtenue" : completed?.state === "lost" ? "Terminé · nouvelle série demain" : "Gratuit · une tentative par jour";
    });
  }

  function refreshAccount() {
    state.profile = store.getActiveProfile();
    if (!state.profile) {
      renderSignedOut();
      return null;
    }
    renderSignedIn(state.profile);
    renderTransactions(state.profile.history || []);
    renderDailyChallengeCards(state.profile);
    return state.profile;
  }

  function openDialog(id) {
    const dialog = element(id);
    if (typeof dialog?.showModal === "function" && !dialog.open) dialog.showModal();
  }

  function openAccountDialog() {
    setMessage("");
    openDialog("accountDialog");
  }

  function handleProfileSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const pseudo = String(new FormData(form).get("pseudo") || "");
    try {
      const profile = store.login(pseudo);
      refreshAccount();
      form.reset();
      setMessage(`Profil ${profile.pseudo} actif · ${formatCoins(profile.balanceUnits)} Coins disponibles.`, "success");
      if (profile.isAdmin) global.dispatchEvent(new CustomEvent("arcade:admin-request"));
    } catch (error) {
      setMessage(readableError(error), "error");
    }
  }

  function beginGame({ gameKey, title, url }) {
    if (!state.profile) {
      openAccountDialog();
      setMessage("Choisissez un pseudo avant de lancer une partie.", "info");
      return false;
    }
    try {
      const session = store.createSession({ gameKey, title, url });
      refreshAccount();
      const destination = new URL(url, global.location.href);
      destination.searchParams.set("arcadeSession", session.id);
      setMessage(
        session.economyMode === "practice"
          ? `${title} est actuellement en entraînement gratuit.`
          : `Session créée pour ${title}. Le Coin sera débité au démarrage réel.`,
        "success",
      );
      return { sessionId: session.id, url: destination.href, session };
    } catch (error) {
      setMessage(readableError(error), "error");
      return false;
    }
  }

  function recoverInterruptedSession(reason = "returned_to_grid") {
    const active = store.getActiveSession();
    if (!active || state.currentChallenge) return null;
    const resolved = store.recoverActiveSession(reason);
    if (!resolved) return null;
    refreshAccount();
    setMessage(
      resolved.metadata?.wasStarted
        ? `${resolved.title} a été enregistrée comme abandonnée : la mise reste dépensée.`
        : `${resolved.title} a été quittée avant son démarrage : aucun Coin n’a été débité.`,
      "info",
    );
    return resolved;
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function dailyChallengeKey() {
    return new Intl.DateTimeFormat("fr-CA", {
      timeZone: "Europe/Brussels",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }

  function dailySeed(gameKey) {
    return [...(dailyChallengeKey() + ":" + gameKey)].reduce((sum, character) => (
      ((sum * 31) + character.charCodeAt(0)) >>> 0
    ), 17);
  }

  function createDailyChallenge(gameKey) {
    const seed = dailySeed(gameKey);
    if (gameKey === "daily-challenge-math") {
      const left = 10 + (seed % 31);
      const right = 4 + (Math.floor(seed / 31) % 17);
      return { gameKey, title: "Calcul éclair", prompt: `${left} + ${right} = ?`, input_mode: "number", answer: String(left + right) };
    }
    if (gameKey === "daily-challenge-sequence") {
      const start = 2 + (seed % 14);
      const step = 2 + (Math.floor(seed / 17) % 7);
      const sequence = Array.from({ length: 5 }, (_, index) => start + index * step);
      return { gameKey, title: "Suite néon", prompt: `${sequence.join(" · ")} · ?`, input_mode: "number", answer: String(start + sequence.length * step) };
    }
    const parity = seed % 2;
    const choices = Array.from({ length: 6 }, (_, index) => (2 + (seed % 16) + index * 2) * 2 + parity);
    const answer = Math.floor(seed / 13) % choices.length;
    choices[answer] += 1;
    return { gameKey, title: "Intrus logique", prompt: "Quel nombre ne suit pas la règle ?", input_mode: "choice", choices, answer: String(answer) };
  }

  function createChallenge(gameKey) {
    if (gameKey.startsWith("daily-challenge-")) return createDailyChallenge(gameKey);
    if (gameKey === "challenge_math") {
      const left = randomInt(8, 40);
      const right = randomInt(3, 20);
      return { gameKey, title: "Calcul éclair", prompt: `${left} + ${right} = ?`, input_mode: "number", answer: String(left + right) };
    }
    if (gameKey === "challenge_sequence") {
      const start = randomInt(2, 15);
      const step = randomInt(2, 8);
      const sequence = Array.from({ length: 5 }, (_, index) => start + index * step);
      return { gameKey, title: "Suite néon", prompt: `${sequence.join(" · ")} · ?`, input_mode: "number", answer: String(start + sequence.length * step) };
    }
    if (gameKey === "challenge_intruder") {
      const parity = randomInt(0, 1);
      const choices = Array.from({ length: 6 }, () => randomInt(2, 22) * 2 + parity);
      const answer = randomInt(0, choices.length - 1);
      choices[answer] += 1;
      return { gameKey, title: "Intrus logique", prompt: "Quel nombre ne suit pas la règle ?", input_mode: "choice", choices, answer: String(answer) };
    }
    throw new Error("unknown_challenge");
  }

  function startChallenge(gameKey) {
    const challenge = createChallenge(gameKey);
    if (!state.profile) throw new Error("profile_required");
    const session = store.createSession({ gameKey, title: challenge.title, url: "index.html", metadata: { dailyKey: dailyChallengeKey() } });
    store.startSession(session.id, { source: "home_challenge" });
    refreshAccount();
    state.currentChallenge = {
      session_id: session.id,
      challenge,
    };
    renderChallenge(state.currentChallenge);
    return state.currentChallenge;
  }

  function renderChallenge(data) {
    const challenge = data.challenge;
    setText("activeChallengeTitle", challenge.title);
    setText("activeChallengePrompt", challenge.prompt);
    const input = element("challengeAnswer");
    const choices = element("challengeChoices");
    choices.replaceChildren();
    input.value = "";

    if (challenge.input_mode === "choice") {
      input.hidden = true;
      challenge.choices.forEach((choice, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "challenge-choice";
        button.textContent = choice;
        button.dataset.answer = String(index);
        button.addEventListener("click", () => {
          choices.querySelectorAll("button").forEach((item) => item.classList.remove("selected"));
          button.classList.add("selected");
          input.value = button.dataset.answer;
        });
        choices.appendChild(button);
      });
    } else {
      input.hidden = false;
      setTimeout(() => input.focus(), 0);
    }
    element("challengeLobby").hidden = true;
    element("activeChallenge").hidden = false;
  }

  function settleChallenge(sessionId, answer) {
    if (!state.currentChallenge || state.currentChallenge.session_id !== sessionId) {
      throw new Error("no_active_challenge");
    }
    const won = String(answer).trim() === state.currentChallenge.challenge.answer;
    const settledSession = store.finishSession(sessionId, won ? "won" : "lost", { source: "home_challenge" });
    const dailyBonus = won && settledSession.gameKey.startsWith("daily-challenge-")
      ? store.claimDailyChallengeBonus(settledSession.metadata.dailyKey)
      : { awarded: false, payoutUnits: 0 };
    state.currentChallenge = null;
    refreshAccount();
    return { status: won ? "won" : "lost", payout_units: won ? settledSession.payoutUnits : 0, bonus_awarded: dailyBonus.awarded, bonus_units: dailyBonus.payoutUnits, balance_units: state.profile.balanceUnits };
  }

  function submitChallenge(event) {
    event.preventDefault();
    const button = event.submitter;
    const answer = element("challengeAnswer").value.trim();
    if (!answer || !state.currentChallenge) {
      setMessage("Choisissez ou saisissez une réponse.", "error");
      return;
    }
    button.disabled = true;
    try {
      const result = settleChallenge(state.currentChallenge.session_id, answer);
      const won = result.status === "won";
      const bonusMessage = result.bonus_awarded ? ` Bonus quotidien : +${formatCoins(result.bonus_units)} Coins.` : "";
      setText("challengeResult", won ? `Victoire ! +${formatCoins(result.payout_units)} Coins fictifs.${bonusMessage}` : "Défi terminé. Aucun Coin dépensé.");
      element("challengeResult").dataset.status = won ? "won" : "lost";
      element("challengeResult").hidden = false;
      element("challengeAnswer").disabled = true;
      element("challengeChoices").querySelectorAll("button").forEach((item) => { item.disabled = true; });
      button.hidden = true;
      element("backToChallenges").hidden = false;
    } catch (error) {
      setMessage(readableError(error), "error");
    } finally {
      button.disabled = false;
    }
  }

  function resetChallengeLobby() {
    state.currentChallenge = null;
    element("challengeLobby").hidden = false;
    element("activeChallenge").hidden = true;
    element("challengeResult").hidden = true;
    element("challengeSubmit").hidden = false;
    element("backToChallenges").hidden = true;
    element("challengeAnswer").disabled = false;
    element("challengeAnswer").value = "";
  }

  function bindUi() {
    element("accountButton")?.addEventListener("click", openAccountDialog);
    element("openAccountButton")?.addEventListener("click", openAccountDialog);
    element("authForm")?.addEventListener("submit", handleProfileSubmit);
    element("signOutButton")?.addEventListener("click", () => {
      store.logout();
      refreshAccount();
      setMessage("Profil local fermé. Les données restent enregistrées sur cet appareil.", "success");
    });
    element("challengeForm")?.addEventListener("submit", submitChallenge);
    element("backToChallenges")?.addEventListener("click", resetChallengeLobby);
    document.querySelectorAll("[data-open-dialog]").forEach((button) => {
      button.addEventListener("click", () => {
        openDialog(button.dataset.openDialog);
      });
    });
    document.querySelectorAll("[data-challenge-key]").forEach((button) => {
      button.addEventListener("click", () => {
        button.disabled = true;
        try { startChallenge(button.dataset.challengeKey); }
        catch (error) { setMessage(readableError(error), "error"); }
        finally { button.disabled = false; }
      });
    });
    document.querySelectorAll("[data-close-dialog]").forEach((button) => {
      button.addEventListener("click", () => button.closest("dialog")?.close());
    });
    document.querySelectorAll("dialog").forEach((dialog) => {
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
      });
    });
  }

  function init() {
    if (!isConfigured()) {
      setMessage("Le stockage local des Coins n’a pas pu être initialisé.", "error");
      return;
    }
    bindUi();
    updateEconomyCopy();
    setText("platformState", "Mode test local");
    refreshAccount();
    setTimeout(() => recoverInterruptedSession("grid_loaded"), 0);
    global.addEventListener("pageshow", () => setTimeout(() => recoverInterruptedSession("returned_to_grid"), 0));
  }

  global.ArcadePlatform = Object.freeze({
    init,
    isConfigured,
    getSession: () => state.profile ? { user: { id: state.profile.id, pseudo: state.profile.pseudo } } : null,
    getBalance: () => state.profile?.balanceUnits ?? null,
    refreshAccount,
    beginGame,
    getGameSession: store.getSession,
    startGameSession: store.startSession,
    reportGameResult: store.finishSession,
    startChallenge,
    settleChallenge,
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);
