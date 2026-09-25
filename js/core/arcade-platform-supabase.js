(function arcadePlatformSupabase(global) {
  "use strict";

  const config = global.ARCADE_CONFIG || {};
  if (config.mode !== "supabase") return;

  const api = global.ArcadeSupabase;
  const state = {
    account: null,
    session: null,
    economy: null,
    currentChallenge: null,
    pendingGame: null,
    authMode: "signin",
    ready: false,
  };

  const challengeKeys = Object.freeze({
    "daily-challenge-math": "challenge_math",
    "daily-challenge-sequence": "challenge_sequence",
    "daily-challenge-intruder": "challenge_intruder",
  });

  const transactionLabels = Object.freeze({
    starter_grant: "Coins de départ",
    game_entry: "Mise de partie",
    game_win: "Victoire · pot remporté",
    rewarded_ad: "Récompense publicitaire",
    daily_bonus: "Bonus quotidien",
    achievement: "Succès",
    admin_adjustment: "Ajustement administrateur",
    refund: "Remboursement",
  });

  function element(id) {
    return document.getElementById(id);
  }

  function setText(id, value) {
    const node = element(id);
    if (node) node.textContent = value;
  }

  function formatCoins(units) {
    const divisor = Number(state.economy?.units_per_coin || config.coins?.unitsPerCoin || 100);
    const value = Number(units || 0) / divisor;
    return new Intl.NumberFormat("fr-BE", {
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: config.coins?.decimals ?? 2,
    }).format(value);
  }

  function setMessage(message, type = "info") {
    const node = element("platformMessage");
    if (!node) return;
    node.textContent = message;
    node.dataset.type = type;
    node.hidden = !message;
  }

  function setProfileStatus(message, type = "info") {
    const node = element("profileStatus");
    if (!node) return;
    node.textContent = message;
    node.dataset.type = type;
    node.hidden = !message;
  }

  function readableError(error) {
    const code = String(error?.code || "").toLowerCase();
    const message = String(error?.message || "").toLowerCase();
    if (code === "invalid_credentials" || message.includes("invalid login credentials")) {
      return "Adresse e-mail ou mot de passe incorrect.";
    }
    if (code === "email_not_confirmed" || message.includes("email not confirmed")) {
      return "Confirmez d’abord votre adresse e-mail depuis le message reçu.";
    }
    if (code === "user_already_exists" || message.includes("already registered")) {
      return "Un compte utilise déjà cette adresse e-mail.";
    }
    if (code === "over_email_send_rate_limit" || message.includes("rate limit")) {
      return "Trop de demandes ont été envoyées. Patientez quelques minutes.";
    }
    if (code === "weak_password" || message.includes("password")) {
      return "Choisissez un mot de passe plus long et difficile à deviner.";
    }
    if (message.includes("failed to fetch") || message.includes("network")) {
      return "Connexion au serveur impossible. Vérifiez votre réseau puis réessayez.";
    }
    const serverMessages = {
      insufficient_balance: "Solde insuffisant pour lancer ce défi.",
      daily_start_limit: "La limite quotidienne de parties vérifiées est atteinte.",
      start_rate_limit: "Trop de parties ont été lancées rapidement. Patientez un instant.",
      session_not_found: "Cette session vérifiée est introuvable.",
      authentication_required: "Votre session a expiré. Reconnectez-vous.",
      origin_not_allowed: "Cette adresse du site n’est pas encore autorisée par le serveur.",
    };
    const known = Object.keys(serverMessages).find((key) => message.includes(key));
    return known ? serverMessages[known] : "L’opération sécurisée n’a pas pu aboutir.";
  }

  function openDialog(id) {
    const dialog = element(id);
    if (typeof dialog?.showModal === "function" && !dialog.open) dialog.showModal();
  }

  function setAccountControls(enabled) {
    document.querySelectorAll("[data-requires-account]").forEach((button) => {
      button.disabled = !enabled || button.id === "openShopButton";
    });
    const shopButton = element("openShopButton");
    if (shopButton) {
      shopButton.disabled = true;
      shopButton.setAttribute("aria-disabled", "true");
      shopButton.title = "La boutique sera activée après sa migration vers le portefeuille serveur.";
    }
  }

  function setAuthMode(mode) {
    state.authMode = mode === "signup" ? "signup" : "signin";
    const signup = state.authMode === "signup";
    document.querySelectorAll("[data-auth-mode]").forEach((button) => {
      const selected = button.dataset.authMode === state.authMode;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    element("authPseudoField")?.toggleAttribute("hidden", !signup);
    element("authConsentField")?.toggleAttribute("hidden", !signup);
    const pseudo = element("authPseudo");
    const consent = element("authConsent");
    const password = element("authPassword");
    if (pseudo) pseudo.required = signup;
    if (consent) consent.required = signup;
    if (password) password.autocomplete = signup ? "new-password" : "current-password";
    setText("authSubmitLabel", signup ? "Créer mon compte" : "Se connecter");
    setText("accountDialogTitle", signup ? "Créer votre compte" : "Connexion sécurisée");
    setProfileStatus("");
  }

  function renderSignedOut() {
    state.account = null;
    state.session = null;
    setText("accountLabel", "Connexion");
    setText("coinBalance", "—");
    setText("platformState", "Serveur sécurisé · connexion requise");
    element("signedOutPanel")?.removeAttribute("hidden");
    element("signedInPanel")?.setAttribute("hidden", "");
    element("passwordRecoveryPanel")?.setAttribute("hidden", "");
    element("openAdminButton")?.setAttribute("hidden", "");
    setAccountControls(false);
    setAuthMode(state.authMode);
  }

  function transactionDescription(transaction) {
    const game = transaction.metadata?.game_key;
    return game ? `${transactionLabels[transaction.transaction_type] || transaction.transaction_type} · ${game}` : transactionLabels[transaction.transaction_type] || transaction.transaction_type;
  }

  function renderTransactions(transactions) {
    const list = element("transactionList");
    if (!list) return;
    list.replaceChildren();
    if (!transactions.length) {
      const empty = document.createElement("li");
      empty.className = "transaction-empty";
      empty.textContent = "Aucune transaction serveur pour le moment.";
      list.appendChild(empty);
      return;
    }
    transactions.forEach((transaction) => {
      const item = document.createElement("li");
      item.className = "transaction-item";
      const info = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = transactionDescription(transaction);
      const date = document.createElement("small");
      date.textContent = new Intl.DateTimeFormat("fr-BE", {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
      }).format(new Date(transaction.created_at));
      info.append(title, date);
      const amount = document.createElement("span");
      const value = Number(transaction.amount_units || 0);
      amount.className = value > 0 ? "amount-positive" : value < 0 ? "amount-negative" : "amount-neutral";
      amount.textContent = `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatCoins(Math.abs(value))} 🪙`;
      item.append(info, amount);
      list.appendChild(item);
    });
  }

  function renderSignedIn(account) {
    const pseudo = account.profile?.display_name || account.user.email?.split("@")[0] || "Joueur";
    state.account = account;
    state.session = account.session;
    state.economy = account.economy;
    setText("accountDialogTitle", "Votre compte Arcade");
    setText("accountLabel", pseudo);
    setText("accountDisplayName", pseudo);
    setText("accountEmail", account.user.email || "Compte Supabase");
    setText("coinBalance", formatCoins(account.wallet.balance_units));
    setText("modalCoinBalance", `${formatCoins(account.wallet.balance_units)} Coins serveur`);
    setText("platformState", "Compte synchronisé · portefeuille serveur");
    element("signedOutPanel")?.setAttribute("hidden", "");
    element("passwordRecoveryPanel")?.setAttribute("hidden", "");
    element("signedInPanel")?.removeAttribute("hidden");
    element("openAdminButton")?.setAttribute("hidden", "");
    setAccountControls(true);
    renderTransactions(account.transactions || []);
    renderChallengeCards();
    updateEconomyCopy();
  }

  function updateEconomyCopy() {
    const economy = state.economy;
    if (!economy) return;
    setText("gamePlayCost", `${formatCoins(economy.default_play_cost_units)} Coin`);
    setText("dailyChallengeReward", `${formatCoins(economy.default_win_payout_units)} Coins`);
    setText("starterCoins", `${formatCoins(economy.starter_grant_units)} Coins`);
    setText("starterCoinsDialog", `${formatCoins(economy.starter_grant_units)} Coins serveur offerts à l’inscription`);
  }

  async function refreshAccount() {
    if (!api) {
      renderSignedOut();
      setText("platformState", "Configuration Supabase indisponible");
      setMessage("Le client sécurisé n’a pas pu être chargé.", "error");
      return null;
    }
    try {
      const account = await api.getAccount();
      if (!account) {
        renderSignedOut();
        return null;
      }
      renderSignedIn(account);
      return account;
    } catch (error) {
      renderSignedOut();
      setMessage(readableError(error), "error");
      return null;
    }
  }

  function openAccountDialog() {
    setMessage("");
    setProfileStatus("");
    if (!state.account) setAuthMode("signin");
    openDialog("accountDialog");
  }

  function validPseudo(value) {
    return /^[\p{L}\p{N} _-]{2,20}$/u.test(value);
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "");
    const pseudo = String(formData.get("pseudo") || "").trim();
    const submit = form.querySelector('[type="submit"]');
    if (state.authMode === "signup" && !validPseudo(pseudo)) {
      setProfileStatus("Le pseudo doit contenir 2 à 20 lettres, chiffres, espaces, _ ou -.", "error");
      element("authPseudo")?.focus();
      return;
    }
    if (password.length < 10) {
      setProfileStatus("Utilisez au moins 10 caractères pour le mot de passe.", "error");
      element("authPassword")?.focus();
      return;
    }
    submit.disabled = true;
    setProfileStatus(state.authMode === "signup" ? "Création du compte…" : "Connexion…");
    try {
      if (state.authMode === "signup") {
        const result = await api.signUp({ email, password, pseudo });
        form.reset();
        if (!result.session) {
          setProfileStatus("Compte créé. Consultez votre e-mail pour confirmer l’adresse, puis revenez vous connecter.", "success");
          return;
        }
      } else {
        await api.signIn({ email, password });
      }
      await refreshAccount();
      setMessage("Connexion sécurisée réussie.", "success");
      setProfileStatus("Compte synchronisé.", "success");
      element("accountDialog")?.close();
      resumePendingGame();
    } catch (error) {
      setProfileStatus(readableError(error), "error");
    } finally {
      submit.disabled = false;
    }
  }

  async function handlePasswordResetRequest() {
    const email = String(element("authEmail")?.value || "").trim().toLowerCase();
    if (!email) {
      setProfileStatus("Saisissez d’abord votre adresse e-mail.", "error");
      element("authEmail")?.focus();
      return;
    }
    const button = element("forgotPasswordButton");
    button.disabled = true;
    try {
      await api.requestPasswordReset(email);
      setProfileStatus("Si un compte correspond à cette adresse, un lien de réinitialisation vient d’être envoyé.", "success");
    } catch (error) {
      setProfileStatus(readableError(error), "error");
    } finally {
      button.disabled = false;
    }
  }

  function showPasswordRecovery() {
    element("signedOutPanel")?.setAttribute("hidden", "");
    element("signedInPanel")?.setAttribute("hidden", "");
    element("passwordRecoveryPanel")?.removeAttribute("hidden");
    setText("accountDialogTitle", "Nouveau mot de passe");
    openDialog("accountDialog");
    setTimeout(() => element("recoveryPassword")?.focus(), 0);
  }

  async function handlePasswordRecoverySubmit(event) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password") || "");
    const submit = event.currentTarget.querySelector('[type="submit"]');
    if (password.length < 10) {
      setProfileStatus("Utilisez au moins 10 caractères.", "error");
      return;
    }
    submit.disabled = true;
    try {
      await api.updatePassword(password);
      event.currentTarget.reset();
      await refreshAccount();
      setProfileStatus("Mot de passe mis à jour.", "success");
    } catch (error) {
      setProfileStatus(readableError(error), "error");
    } finally {
      submit.disabled = false;
    }
  }

  async function handleSignOut() {
    const button = element("signOutButton");
    button.disabled = true;
    try {
      await api.signOut();
      state.pendingGame = null;
      renderSignedOut();
      setMessage("Déconnexion terminée sur cet appareil.", "success");
      element("accountDialog")?.close();
    } catch (error) {
      setProfileStatus(readableError(error), "error");
    } finally {
      button.disabled = false;
    }
  }

  function beginGame(game) {
    if (!state.account) {
      state.pendingGame = { ...game };
      openAccountDialog();
      setProfileStatus(`Connectez-vous pour lancer ${game.title}.`, "info");
      return false;
    }
    const destination = new URL(game.url, global.location.href);
    destination.searchParams.set("arcadeServer", "1");
    destination.searchParams.set("arcadeGame", game.gameKey);
    setMessage(`${game.title} est prêt. La mise de 1 Coin sera débitée au démarrage réel.`, "success");
    return { url: destination.href, practice: false };
  }

  function resumePendingGame() {
    if (!state.pendingGame || !state.account) return;
    const game = state.pendingGame;
    state.pendingGame = null;
    const launch = beginGame(game);
    if (launch?.url) global.location.assign(launch.url);
  }

  function dateKey() {
    return new Intl.DateTimeFormat("fr-CA", {
      timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
  }

  function renderChallengeCards() {
    document.querySelectorAll("[data-challenge-key]").forEach((button) => {
      button.disabled = !state.account;
      const description = button.querySelector("small");
      if (description) description.textContent = "Serveur · résultat certifié";
    });
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

  async function startChallenge(clientKey) {
    if (!state.account) throw new Error("authentication_required");
    const gameKey = challengeKeys[clientKey] || clientKey;
    const idempotencyKey = `daily:${gameKey}:${dateKey()}:${state.account.user.id}`;
    const data = await api.startChallenge(gameKey, idempotencyKey);
    state.currentChallenge = data;
    renderChallenge(data);
    await refreshAccount();
    return data;
  }

  async function settleChallenge(sessionId, answer) {
    if (!state.currentChallenge || state.currentChallenge.session_id !== sessionId) {
      throw new Error("session_not_found");
    }
    const result = await api.settleChallenge(sessionId, answer);
    state.currentChallenge = null;
    await refreshAccount();
    return result;
  }

  async function submitChallenge(event) {
    event.preventDefault();
    const button = event.submitter || element("challengeSubmit");
    const answer = element("challengeAnswer").value.trim();
    if (!answer || !state.currentChallenge) {
      setMessage("Choisissez ou saisissez une réponse.", "error");
      return;
    }
    button.disabled = true;
    try {
      const result = await settleChallenge(state.currentChallenge.session_id, answer);
      const won = result.status === "won";
      setText("challengeResult", won
        ? `Victoire certifiée · ${formatCoins(result.payout_units)} Coins crédités par le serveur.`
        : result.status === "invalid"
          ? "Résultat refusé par le serveur : partie terminée trop rapidement."
          : "Défi terminé · aucun gain crédité.");
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
    renderChallengeCards();
  }

  function bindUi() {
    element("accountButton")?.addEventListener("click", openAccountDialog);
    element("openAccountButton")?.addEventListener("click", openAccountDialog);
    element("authForm")?.addEventListener("submit", handleAuthSubmit);
    element("forgotPasswordButton")?.addEventListener("click", handlePasswordResetRequest);
    element("passwordRecoveryForm")?.addEventListener("submit", handlePasswordRecoverySubmit);
    element("signOutButton")?.addEventListener("click", handleSignOut);
    document.querySelectorAll("[data-auth-mode]").forEach((button) => {
      button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
    });
    element("challengeForm")?.addEventListener("submit", submitChallenge);
    element("backToChallenges")?.addEventListener("click", resetChallengeLobby);
    document.querySelectorAll("[data-open-dialog]").forEach((button) => {
      button.addEventListener("click", () => openDialog(button.dataset.openDialog));
    });
    document.querySelectorAll("[data-challenge-key]").forEach((button) => {
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await startChallenge(button.dataset.challengeKey);
        } catch (error) {
          setMessage(readableError(error), "error");
        } finally {
          button.disabled = false;
        }
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
    element("accountDialog")?.addEventListener("close", () => {
      if (!state.account) state.pendingGame = null;
    });
  }

  async function init() {
    bindUi();
    renderSignedOut();
    renderChallengeCards();
    if (!api) {
      setMessage("Configuration Supabase absente. Les comptes serveur sont indisponibles.", "error");
      return;
    }
    api.onAuthStateChange((event, session) => {
      state.session = session;
      if (event === "PASSWORD_RECOVERY") {
        setTimeout(showPasswordRecovery, 0);
        return;
      }
      setTimeout(async () => {
        await refreshAccount();
        if (event === "SIGNED_IN") resumePendingGame();
      }, 0);
    });
    await refreshAccount();
    state.ready = true;
  }

  global.ArcadePlatform = Object.freeze({
    init,
    isConfigured: () => Boolean(api),
    getSession: () => state.account ? {
      user: {
        id: state.account.user.id,
        pseudo: state.account.profile?.display_name,
        email: state.account.user.email,
      },
    } : null,
    getBalance: () => state.account?.wallet?.balance_units ?? null,
    refreshAccount,
    beginGame,
    getGameSession: () => null,
    startGameSession(gameKey, idempotencyKey) {
      return api.startGame(gameKey, idempotencyKey);
    },
    reportGameResult(sessionId, outcome, metadata) {
      return api.settleGame(sessionId, outcome, metadata);
    },
    startChallenge,
    settleChallenge,
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);
