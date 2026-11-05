(function arcadeGameBridge(global) {
  "use strict";

  const store = global.ArcadeLocalStore;
  const config = global.ARCADE_CONFIG || {};
  const params = new URLSearchParams(global.location.search);
  const sessionId = params.get("arcadeSession");
  let session = sessionId && store ? store.getSession(sessionId) : null;
  let blocked = false;
  let outcomeObserver = null;
  const originalAlert = global.alert?.bind(global);

  const terminalStates = new Set(["won", "lost", "abandoned"]);
  const winPattern = /\b(victoire|vous avez gagné|you win|bravo|félicitations|grille complétée|puzzle résolu|niveau terminé|mission accomplie|remporte la partie)\b/i;
  const lossPattern = /\b(game over|vous avez perdu|défaite|you lose|crash detected|santé épuisée|boom)\b/i;

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
    }[state] || state;
  }

  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .arcade-session-hud{position:fixed;right:max(10px,env(safe-area-inset-right));bottom:max(10px,env(safe-area-inset-bottom));z-index:2147483000;display:flex;align-items:center;gap:9px;padding:8px 12px;border:1px solid rgba(0,255,255,.42);border-radius:999px;background:rgba(5,10,22,.9);box-shadow:0 0 24px rgba(0,255,255,.16);backdrop-filter:blur(10px);color:#fff;font:600 12px Rajdhani,system-ui,sans-serif;pointer-events:none}
      .arcade-session-hud strong{color:#00ffff;font-family:Orbitron,system-ui,sans-serif;font-size:10px;letter-spacing:.5px;text-transform:uppercase}.arcade-session-hud span:last-child{color:#ffe66d}
      .arcade-session-hud[data-state="won"]{border-color:#00ff88}.arcade-session-hud[data-state="won"] strong{color:#00ff88}.arcade-session-hud[data-state="lost"],.arcade-session-hud[data-state="abandoned"]{border-color:#ff4757}.arcade-session-hud[data-state="lost"] strong,.arcade-session-hud[data-state="abandoned"] strong{color:#ff8d98}
      .arcade-session-blocker{position:fixed;inset:0;z-index:2147483500;display:grid;place-items:center;padding:20px;background:rgba(2,6,16,.88);backdrop-filter:blur(9px)}.arcade-session-blocker>div{width:min(92vw,460px);padding:28px;border:1px solid rgba(255,71,87,.45);border-radius:18px;background:#0d1422;color:#fff;text-align:center;box-shadow:0 0 55px rgba(255,71,87,.16);font-family:Rajdhani,system-ui,sans-serif}.arcade-session-blocker h2{margin:0 0 10px;color:#ff8d98;font-family:Orbitron,system-ui,sans-serif;font-size:20px}.arcade-session-blocker p{margin:0 0 20px;color:#a5afc7;line-height:1.5}.arcade-session-blocker a{display:inline-flex;min-height:44px;align-items:center;padding:0 18px;border:1px solid #00ffff;border-radius:9px;color:#00ffff;text-decoration:none;font-weight:700}
      @media(max-width:520px){.arcade-session-hud{right:8px;bottom:8px;padding:7px 10px}.arcade-session-hud span:last-child{display:none}}
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
    const profile = store.getActiveProfile();
    hud.dataset.state = session.state;
    hud.title = `Session ${session.id}`;
    hud.querySelector("strong").textContent = `${session.economyMode === "practice" ? "Entraînement" : "Coins"} · ${statusLabel(session.state)}`;
    hud.querySelector("span").textContent = `${coins(profile?.balanceUnits)} 🪙`;
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
    const link = document.createElement("a");
    heading.textContent = title;
    copy.textContent = message;
    link.href = new URL("../../index.html", global.location.href).href;
    link.textContent = "Retour à l’arcade";
    panel.append(heading, copy, link);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  }

  function updateSession() {
    session = sessionId ? store.getSession(sessionId) : null;
    renderHud();
    return session;
  }

  function start(metadata = {}) {
    if (!session || blocked) return null;
    if (session.state === "started") return session;
    if (terminalStates.has(session.state)) return session;
    try {
      session = store.startSession(session.id, metadata);
      renderHud();
      return session;
    } catch (error) {
      if (session.state === "created") {
        session = store.finishSession(session.id, "abandoned", { reason: error.message });
      }
      renderHud();
      showBlocker("Partie non démarrée", error.message === "insufficient_balance" ? "Votre solde est insuffisant. Aucun Coin n’a été débité." : "Cette session ne peut plus être démarrée.");
      return null;
    }
  }

  function finish(outcome, metadata = {}) {
    if (!session || terminalStates.has(session.state)) return session;
    if (outcome === "won" || outcome === "lost") {
      if (!start({ outcomeReportedAtStart: true })) return session;
    }
    try {
      session = store.finishSession(session.id, outcome, metadata);
      renderHud();
      outcomeObserver?.disconnect();
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

  function observeOutcomes() {
    outcomeObserver = new MutationObserver((mutations) => {
      if (session?.state !== "started") return;
      for (const mutation of mutations) {
        const target = mutation.type === "characterData" ? mutation.target.parentElement : mutation.target;
        if (isVisible(target) && reportFromText(target.textContent)) break;
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
    if (target?.closest?.("a[href*='index'],.home-button,.arcade-home")) return false;
    if (event.type === "keydown" || target?.closest?.("canvas,button,[role='button'],.game-board,.board")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showBlocker("Session terminée", "Revenez à l’arcade pour créer une nouvelle session et rejouer.");
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

  function init() {
    if (!sessionId || !store) return;
    injectStyles();
    if (!session) {
      showBlocker("Session introuvable", "Relancez ce jeu depuis la grille principale.");
      return;
    }
    if (session.state === "started") {
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
          : "Revenez à l’arcade pour créer une nouvelle session et rejouer.",
      );
      return;
    }
    renderHud();
    bindLifecycle();
    observeOutcomes();
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
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);
