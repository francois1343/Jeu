(function arcadeGameBridge(global) {
  "use strict";

  const store = global.ArcadeLocalStore;
  const config = global.ARCADE_CONFIG || {};
  const bridgeScriptUrl = document.currentScript?.src || "";
  const params = new URLSearchParams(global.location.search);
  let sessionId = params.get("arcadeSession");
  let serverMode = false;
  let serverApi = null;
  let serverBalanceUnits = null;
  let serverStartPromise = null;
  let serverSettlePromise = null;
  let serverIdempotencyKey = null;
  let session = null;
  let blocked = false;
  let outcomeObserver = null;
  const stateListeners = new Set();
  const originalAlert = global.alert?.bind(global);

  const terminalStates = new Set(["won", "lost", "abandoned", "expired", "cancelled", "invalid"]);
  const winPattern = /\b(victoire|vous avez gagné|you win|bravo|félicitations|grille complétée|puzzle résolu|niveau terminé|mission accomplie|remporte la partie)\b/i;
  const lossPattern = /\b(game over|vous avez perdu|défaite|you lose|crash detected|santé épuisée|boom)\b/i;

  function inferredGameKey() {
    const explicit = params.get("arcadeGame");
    if (explicit) return explicit;
    const parts = global.location.pathname.split("/").filter(Boolean);
    const folder = decodeURIComponent(parts.at(-2) || "").toLocaleLowerCase("fr");
    return global.ARCADE_GAME_CONFIG?.shell?.routeAliases?.[folder] || folder;
  }

  function newIdempotencyKey(gameKey) {
    const random = global.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `game:${gameKey}:${random}`;
  }

  function serverSessionFrom(data, fallbackState = "started") {
    return {
      id: data?.session_id || sessionId || null,
      gameKey: data?.game_key || inferredGameKey(),
      title: document.title,
      url: global.location.pathname,
      state: data?.status || fallbackState,
      economyMode: "paid",
      wagerUnits: Number(data?.wager_units ?? 100),
      payoutUnits: Number(data?.potential_payout_units ?? 200),
      startedAt: data?.started_at || null,
      resolvedAt: data?.settled_at || null,
      metadata: { validation: "client_result" },
    };
  }

  function policy() {
    return config.localEconomy?.gamePolicies?.[session?.gameKey] || {};
  }

  function coins(units) {
    const unit = Number(config.coins?.unitsPerCoin || 100);
    return new Intl.NumberFormat("fr-BE", { maximumFractionDigits: 2 }).format(Number(units || 0) / unit);
  }

  function statusLabel(state) {
    return {
      created: "Prête",
      started: "En cours",
      won: "Gagnée",
      lost: "Perdue",
      abandoned: "Abandonnée",
      expired: "Expirée",
      cancelled: "Annulée",
      invalid: "Refusée",
    }[state] || state;
  }

  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .arcade-session-hud{position:fixed;right:max(10px,env(safe-area-inset-right));bottom:max(10px,env(safe-area-inset-bottom));z-index:2147483000;display:flex;align-items:center;gap:9px;padding:8px 12px;border:1px solid rgba(0,255,255,.42);border-radius:999px;background:rgba(5,10,22,.9);box-shadow:0 0 24px rgba(0,255,255,.16);backdrop-filter:blur(10px);color:#fff;font:600 12px Rajdhani,system-ui,sans-serif;pointer-events:none}
      .arcade-session-hud strong{color:#00ffff;font-family:Orbitron,system-ui,sans-serif;font-size:10px;letter-spacing:.5px;text-transform:uppercase}.arcade-session-hud span:last-child{color:#ffe66d}
      .arcade-session-hud[data-state="won"]{border-color:#00ff88}.arcade-session-hud[data-state="won"] strong{color:#00ff88}.arcade-session-hud[data-state="lost"],.arcade-session-hud[data-state="abandoned"]{border-color:#ff4757}.arcade-session-hud[data-state="lost"] strong,.arcade-session-hud[data-state="abandoned"] strong{color:#ff8d98}
      .arcade-home-link{position:fixed;top:max(12px,env(safe-area-inset-top));left:max(12px,env(safe-area-inset-left));z-index:2147483400;display:inline-flex;min-height:42px;align-items:center;gap:8px;padding:0 14px;border:1px solid rgba(0,255,255,.72);border-radius:999px;background:rgba(5,10,22,.9);box-shadow:0 0 22px rgba(0,255,255,.22);backdrop-filter:blur(10px);color:#dffcff;font:700 13px Orbitron,Rajdhani,system-ui,sans-serif;letter-spacing:.04em;text-decoration:none;transition:transform .18s ease,background .18s ease,box-shadow .18s ease}.arcade-home-link:hover,.arcade-home-link:focus-visible{transform:translateY(-2px);background:rgba(0,243,255,.16);box-shadow:0 0 30px rgba(0,255,255,.45);outline:none}.arcade-home-link:focus-visible{outline:2px solid #fff;outline-offset:3px}
      .arcade-session-blocker{position:fixed;inset:0;z-index:2147483500;display:grid;place-items:center;padding:20px;background:rgba(2,6,16,.88);backdrop-filter:blur(9px)}.arcade-session-blocker>div{width:min(92vw,460px);padding:28px;border:1px solid rgba(255,71,87,.45);border-radius:18px;background:#0d1422;color:#fff;text-align:center;box-shadow:0 0 55px rgba(255,71,87,.16);font-family:Rajdhani,system-ui,sans-serif}.arcade-session-blocker h2{margin:0 0 10px;color:#ff8d98;font-family:Orbitron,system-ui,sans-serif;font-size:20px}.arcade-session-blocker p{margin:0 0 20px;color:#a5afc7;line-height:1.5}.arcade-session-blocker-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:10px}.arcade-session-blocker a,.arcade-session-replay{display:inline-flex;min-height:44px;align-items:center;justify-content:center;padding:0 18px;border:1px solid #00ffff;border-radius:9px;background:transparent;color:#00ffff;text-decoration:none;font:700 16px Rajdhani,system-ui,sans-serif;cursor:pointer}.arcade-session-replay{border-color:#00ff88;color:#00ff88}.arcade-session-replay:disabled{opacity:.5;cursor:not-allowed}
      @media(max-width:520px){.arcade-session-hud{right:8px;bottom:8px;padding:7px 10px}.arcade-session-hud span:last-child{display:none}.arcade-home-link{top:8px;left:8px;min-height:44px;padding:0 11px;font-size:11px}}
    `;
    document.head.appendChild(style);
  }

  function renderHud() {
    if (!session) return;
    let hud = document.getElementById("arcadeSessionHud");
    if (!hud) {
      hud = document.createElement("div");
      hud.id = "arcadeSessionHud";
      hud.className = "arcade-session-hud";
      hud.innerHTML = "<strong></strong><span></span>";
      document.body.appendChild(hud);
    }
    const profile = serverMode ? null : store?.getActiveProfile();
    hud.dataset.state = session.state;
    hud.title = `Session ${session.id}`;
    hud.querySelector("strong").textContent = `${session.economyMode === "practice" ? "Entraînement" : "Coins"} · ${statusLabel(session.state)}`;
    const balance = serverMode ? serverBalanceUnits : profile?.balanceUnits;
    hud.querySelector("span").textContent = Number.isFinite(Number(balance))
      ? `${coins(balance)} 🪙`
      : "Solde serveur";
  }

  function injectHomeButton() {
    if (document.getElementById("arcadeHomeButton")) return;
    const existingHome = document.querySelector(".arcade-home-link");
    if (existingHome) {
      existingHome.id = "arcadeHomeButton";
      existingHome.addEventListener("click", () => {
        if (session?.state === "created" || session?.state === "started") abandon("home_navigation");
      });
      return;
    }
    const home = document.createElement("a");
    home.id = "arcadeHomeButton";
    home.className = "arcade-home-link";
    home.href = new URL("../../index.html", global.location.href).href;
    home.textContent = "← Accueil";
    home.setAttribute("aria-label", "Retourner à l'accueil de l'Arcade");
    home.addEventListener("click", () => {
      if (session?.state === "created" || session?.state === "started") abandon("home_navigation");
    });
    document.body.appendChild(home);
  }

  function sessionSnapshot() {
    if (!session) return null;
    return {
      ...session,
      metadata: { ...(session.metadata || {}) },
    };
  }

  function announceState(previousState, source = "bridge") {
    const detail = {
      previousState: previousState || null,
      state: session?.state || null,
      session: sessionSnapshot(),
      source,
    };
    stateListeners.forEach((listener) => listener(detail));
    global.dispatchEvent?.(new CustomEvent("arcade:session-state", { detail }));
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    stateListeners.add(listener);
    listener({ previousState: null, state: session?.state || null, session: sessionSnapshot(), source: "subscribe" });
    return () => stateListeners.delete(listener);
  }

  function replay() {
    if (!session || !terminalStates.has(session.state)) return null;
    if (serverMode) {
      const destination = new URL(global.location.href);
      destination.searchParams.delete("arcadeSession");
      destination.searchParams.set("arcadeServer", "1");
      destination.searchParams.set("arcadeGame", session.gameKey);
      global.location.assign(destination.href);
      return null;
    }
    const nextSession = store.createSession({
      gameKey: session.gameKey,
      title: session.title,
      url: session.url || global.location.pathname,
    });
    const destination = new URL(global.location.href);
    destination.searchParams.set("arcadeSession", nextSession.id);
    global.location.assign(destination.href);
    return nextSession;
  }

  function showBlocker(title, message) {
    if (document.getElementById("arcadeSessionBlocker")) return;
    blocked = true;
    const overlay = document.createElement("div");
    overlay.id = "arcadeSessionBlocker";
    overlay.className = "arcade-session-blocker";
    const panel = document.createElement("div");
    const heading = document.createElement("h2");
    const copy = document.createElement("p");
    const actions = document.createElement("div");
    const link = document.createElement("a");
    actions.className = "arcade-session-blocker-actions";
    heading.textContent = title;
    copy.textContent = message;
    if (session && terminalStates.has(session.state)) {
      const replayButton = document.createElement("button");
      replayButton.type = "button";
      replayButton.className = "arcade-session-replay";
      replayButton.textContent = "Rejouer";
      replayButton.addEventListener("click", () => {
        try {
          replay();
        } catch (error) {
          replayButton.disabled = true;
          copy.textContent = error.message === "insufficient_balance" ? "Solde insuffisant pour lancer une nouvelle partie." : "Impossible de créer une nouvelle session pour le moment.";
        }
      });
      actions.appendChild(replayButton);
    }
    link.href = new URL("../../index.html", global.location.href).href;
    link.textContent = "Accueil arcade";
    actions.appendChild(link);
    panel.append(heading, copy, actions);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  }

  function updateSession() {
    if (serverMode) {
      renderHud();
      return session;
    }
    session = sessionId ? store.getSession(sessionId) : null;
    renderHud();
    return session;
  }

  function start(metadata = {}) {
    if (!session || blocked) return null;
    if (session.state === "started") return session;
    if (terminalStates.has(session.state)) return session;
    const previousState = session.state;
    if (serverMode) {
      session.state = "started";
      session.startedAt = new Date().toISOString();
      session.metadata = { ...session.metadata, ...metadata };
      renderHud();
      announceState(previousState, metadata.source || "server_game_start");
      serverIdempotencyKey ||= newIdempotencyKey(session.gameKey);
      serverStartPromise = serverApi.startGame(session.gameKey, serverIdempotencyKey)
        .then((data) => {
          sessionId = data.session_id;
          serverBalanceUnits = Number(data.balance_units);
          session = { ...serverSessionFrom(data), metadata: { ...session.metadata } };
          const destination = new URL(global.location.href);
          destination.searchParams.set("arcadeServer", "1");
          destination.searchParams.set("arcadeGame", session.gameKey);
          destination.searchParams.set("arcadeSession", session.id);
          global.history.replaceState({}, "", destination);
          renderHud();
          return session;
        })
        .catch((error) => {
          const failedState = session.state;
          session.state = "abandoned";
          renderHud();
          announceState(failedState, "server_start_failed");
          showBlocker(
            "Partie non démarrée",
            String(error?.message || "").includes("insufficient_balance")
              ? "Votre solde est insuffisant. Aucun Coin n’a été débité."
              : "Le serveur n’a pas pu engager la mise. Aucun résultat ne sera crédité.",
          );
          return null;
        });
      return session;
    }
    try {
      session = store.startSession(session.id, metadata);
      renderHud();
      announceState(previousState, metadata.source || "game_start");
      return session;
    } catch (error) {
      if (session.state === "created") {
        session = store.finishSession(session.id, "abandoned", { reason: error.message });
      }
      renderHud();
      announceState(previousState, "start_failed");
      showBlocker("Partie non démarrée", error.message === "insufficient_balance" ? "Votre solde est insuffisant. Aucun Coin n’a été débité." : "Cette session ne peut plus être démarrée.");
      return null;
    }
  }

  function finish(outcome, metadata = {}) {
    if (!session || terminalStates.has(session.state)) return session;
    if (serverMode) {
      if (session.state === "created" && outcome === "abandoned") {
        const previousState = session.state;
        session.state = "abandoned";
        session.resolvedAt = new Date().toISOString();
        session.metadata = { ...session.metadata, ...metadata, wasStarted: false };
        renderHud();
        announceState(previousState, metadata.source || "server_game_cancelled");
        return session;
      }
      if (session.state === "created") start({ outcomeReportedAtStart: true });
      const previousState = session.state;
      session.state = outcome;
      session.resolvedAt = new Date().toISOString();
      session.metadata = { ...session.metadata, ...metadata };
      renderHud();
      outcomeObserver?.disconnect();
      announceState(previousState, metadata.source || `server_game_${outcome}`);
      if (!serverSettlePromise) {
        serverSettlePromise = Promise.resolve(serverStartPromise)
          .then((startedSession) => {
            if (!startedSession || !session.id) return null;
            return serverApi.settleGame(session.id, outcome, metadata);
          })
          .then((result) => {
            if (!result) return null;
            serverBalanceUnits = Number(result.balance_units);
            session.state = result.status === "invalid" ? "lost" : result.status;
            session.resolvedAt = new Date().toISOString();
            renderHud();
            return result;
          })
          .catch((error) => {
            console.error("Règlement serveur impossible.", error);
            showBlocker(
              "Résultat à synchroniser",
              "La mise est enregistrée, mais le résultat n’a pas pu être synchronisé. Revenez à l’accueil puis réessayez avec une nouvelle partie.",
            );
            return null;
          });
      }
      return session;
    }
    if (outcome === "won" || outcome === "lost") {
      if (!start({ outcomeReportedAtStart: true })) return session;
    }
    try {
      const previousState = session.state;
      session = store.finishSession(session.id, outcome, metadata);
      renderHud();
      outcomeObserver?.disconnect();
      announceState(previousState, metadata.source || `game_${outcome}`);
      return session;
    } catch (_) {
      return updateSession();
    }
  }

  function win(metadata) {
    return finish("won", metadata);
  }

  function lose(metadata) {
    return finish("lost", metadata);
  }

  function abandon(reason = "page_left") {
    return finish("abandoned", { reason });
  }

  function completeByScore(score, metadata = {}) {
    const minimum = Number(policy().minimumScore);
    if (!Number.isFinite(minimum)) return lose({ ...metadata, score, reason: "no_win_threshold" });
    return Number(score) >= minimum ? win({ ...metadata, score, minimum }) : lose({ ...metadata, score, minimum });
  }

  function completeByAccuracy(accuracy, metadata = {}) {
    const minimum = Number(policy().minimumAccuracy);
    if (!Number.isFinite(minimum)) return lose({ ...metadata, accuracy, reason: "no_accuracy_threshold" });
    return Number(accuracy) >= minimum ? win({ ...metadata, accuracy, minimum }) : lose({ ...metadata, accuracy, minimum });
  }

  function reportFromText(value) {
    if (!session || session.state !== "started") return null;
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text || text.length > 350 || (winPattern.test(text) && lossPattern.test(text))) return null;
    if (winPattern.test(text)) return win({ source: "visible_result", text: text.slice(0, 160) });
    if (lossPattern.test(text)) return lose({ source: "visible_result", text: text.slice(0, 160) });
    return null;
  }

  function isVisible(element) {
    if (!(element instanceof Element) || element.closest("[hidden],.hidden")) return false;
    const style = global.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) !== 0;
  }

  function inspectVisibleOutcome(target) {
    if (!(target instanceof Element)) return null;
    const selector = [
      "[role='alert']", "[role='status']", "[aria-live]",
      ".game-over", ".gameover", ".game-over-screen", ".gameover-menu",
      ".victory", ".victory-overlay", ".result", ".result-overlay",
      "h1", "h2", "h3",
    ].join(",");
    const candidates = target.matches(selector) ? [target] : [...target.querySelectorAll(selector)];
    for (const candidate of candidates) {
      if (isVisible(candidate) && reportFromText(candidate.textContent)) return true;
    }
    return null;
  }

  function observeOutcomes() {
    outcomeObserver = new MutationObserver((mutations) => {
      if (session?.state !== "started") return;
      for (const mutation of mutations) {
        const target = mutation.type === "characterData" ? mutation.target.parentElement : mutation.target;
        if (inspectVisibleOutcome(target)) break;
      }
    });
    outcomeObserver.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "hidden", "style"],
    });
  }

  function isStartIntent(target) {
    const control = target.closest?.("button,[role='button'],.difficulty-card,.difficulty-btn,.mode-card,.choice-btn,.fighter-choice");
    if (!control) return false;
    const descriptor = `${control.id} ${control.className} ${control.getAttribute("onclick") || ""} ${control.textContent || ""}`.toLocaleLowerCase("fr");
    if (/retour|back|menu|règle|rule|comment|how|param|setting|stat|score|classement|leader|crédit|audio|music|son|\bfree\b|libre|creative|créatif|\bzen\b|insane/.test(descriptor)) return false;
    return /start|play|jouer|commencer|nouvelle|new.game|rejouer|restart|difficulty|difficulté|facile|moyen|difficile|mode|choice|fighter/.test(descriptor);
  }

  function guardTerminalInput(event) {
    if (!session || !terminalStates.has(session.state)) return false;
    const target = event.target;
    if (target?.closest?.("a[href*='index'],.home-button,.arcade-home,.arcade-session-replay")) return false;
    if (event.type === "keydown" || target?.closest?.("canvas,button,[role='button'],.game-board,.board")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showBlocker("Session terminée", "Choisissez Rejouer pour rester dans ce jeu.");
      return true;
    }
    return false;
  }

  function bindLifecycle() {
    document.addEventListener("click", (event) => {
      if (guardTerminalInput(event)) return;
      if (session?.state === "created" && isStartIntent(event.target)) start({ source: "start_control" });
    }, true);
    document.addEventListener("pointerdown", (event) => {
      if (guardTerminalInput(event)) return;
      if (session?.state === "created" && event.target.closest?.("canvas,.game-board,.board,.grid")) {
        start({ source: "game_surface" });
      }
    }, true);
    document.addEventListener("keydown", (event) => {
      if (guardTerminalInput(event)) return;
      if (session?.state !== "created" || event.target.matches?.("input,textarea,select")) return;
      if (/^(Arrow|Key[WASD]|Space|Enter)/.test(event.code)) start({ source: "game_keyboard" });
    }, true);
    global.addEventListener("arcade:started", (event) => start(event.detail || {}));
    global.addEventListener("arcade:won", (event) => win(event.detail || {}));
    global.addEventListener("arcade:lost", (event) => lose(event.detail || {}));
    global.addEventListener("arcade:abandoned", (event) => abandon(event.detail?.reason));
    global.addEventListener("pagehide", () => {
      if (session?.state === "created" || session?.state === "started") abandon("pagehide");
    });
  }

  async function init() {
    injectStyles();
    injectHomeButton();
    serverMode = config.mode === "supabase";
    if (serverMode) {
      serverApi = global.ArcadeSupabase;
      const gameKey = inferredGameKey();
      if (!serverApi || !gameKey) {
        showBlocker("Serveur indisponible", "La session Coins ne peut pas être créée depuis cette page.");
        return;
      }
      if (sessionId) {
        try {
          const data = await serverApi.getGameSession(sessionId);
          serverBalanceUnits = Number(data.balance_units);
          session = serverSessionFrom(data);
        } catch (_) {
          showBlocker("Session introuvable", "Relancez ce jeu depuis la grille principale.");
          return;
        }
        if (session.state === "started") {
          try {
            const result = await serverApi.settleGame(session.id, "abandoned", { reason: "page_reloaded_after_start" });
            serverBalanceUnits = Number(result.balance_units);
            session.state = "abandoned";
          } catch (_) {
            session.state = "abandoned";
          }
          renderHud();
          showBlocker("Partie abandonnée", "La page a été rechargée après le démarrage. La mise reste dépensée.");
          return;
        }
      } else {
        session = serverSessionFrom({ game_key: gameKey, status: "created" }, "created");
        try {
          const account = await serverApi.getAccount();
          serverBalanceUnits = Number(account?.wallet?.balance_units);
        } catch (_) {
          serverBalanceUnits = null;
        }
      }
    } else {
      session = sessionId && store ? store.getSession(sessionId) : null;
      if (!sessionId || !store) return;
    }
    if (!session) {
      showBlocker("Session introuvable", "Relancez ce jeu depuis la grille principale.");
      return;
    }
    if (!serverMode && session.state === "started") {
      session = store.finishSession(session.id, "abandoned", { reason: "page_reloaded_after_start" });
      renderHud();
      showBlocker("Partie abandonnée", "La page a été rechargée après le démarrage. La mise reste dépensée.");
      return;
    }
    if (terminalStates.has(session.state)) {
      renderHud();
      showBlocker(
        "Session déjà terminée",
        session.state === "abandoned"
          ? "Cette partie a été quittée ou rechargée. Relancez-la depuis la grille."
          : "Choisissez Rejouer pour créer une nouvelle session dans ce jeu.",
      );
      return;
    }
    renderHud();
    bindLifecycle();
    observeOutcomes();
    announceState(null, "session_ready");
    if (originalAlert) {
      global.alert = (message) => {
        reportFromText(message);
        return originalAlert(message);
      };
    }
  }

  global.ArcadeGameSession = Object.freeze({
    get id() { return session?.id || null; },
    get state() { return session?.state || null; },
    get gameKey() { return session?.gameKey || null; },
    get policy() { return policy(); },
    start,
    win,
    lose,
    abandon,
    completeByScore,
    completeByAccuracy,
    reportFromText,
    replay,
    subscribe,
    get snapshot() { return sessionSnapshot(); },
  });

  function loadSharedScript(filename) {
    if (!bridgeScriptUrl) return Promise.resolve(null);
    const source = new URL(filename, bridgeScriptUrl).href;
    const existing = [...document.scripts].find((script) => script.src === source);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = source;
      script.onload = () => resolve(script);
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    });
  }

  async function loadSharedExperience() {
    await loadSharedScript("arcade-game-config.js");
    await loadSharedScript("arcade-game-preferences.js");
    // Toute partie lancée depuis l'index reçoit désormais le même menu commun.
    // Une page peut uniquement s'en exclure explicitement avec data-arcade-shell="false".
    if (document.body?.dataset.arcadeShell !== "false") {
      await loadSharedScript("arcade-game-shell.js");
    }
  }

  async function bootstrap() {
    await loadSharedExperience();
    if (config.mode === "supabase" && !global.ArcadeSupabase) {
      await loadSharedScript("../../vendor/supabase/arcade-supabase-client.min.js");
    }
    await init();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  } else {
    bootstrap();
  }
})(window);
