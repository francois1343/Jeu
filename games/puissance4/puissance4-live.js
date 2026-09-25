(function puissance4Live(global) {
  "use strict";

  function boot() {

  const rootApi = global.ArcadeSupabase;
  const api = rootApi?.connect4;
  const game = global.Puissance4Game;
  if (!game) return;

  const DOM = {
    panel: document.getElementById("live-multiplayer-group"),
    authPanel: document.getElementById("live-auth-panel"),
    authForm: document.getElementById("live-auth-form"),
    authEmail: document.getElementById("live-auth-email"),
    authPassword: document.getElementById("live-auth-password"),
    actions: document.getElementById("live-room-actions"),
    createButton: document.getElementById("live-create-room"),
    turnSeconds: document.getElementById("live-turn-seconds"),
    joinForm: document.getElementById("live-join-form"),
    roomCode: document.getElementById("live-room-code"),
    waiting: document.getElementById("live-waiting-room"),
    roomCodeDisplay: document.getElementById("live-room-code-display"),
    copyInvite: document.getElementById("live-copy-invite"),
    cancelRoom: document.getElementById("live-cancel-room"),
    status: document.getElementById("live-status"),
    reconnect: document.getElementById("live-reconnect"),
    connectionState: document.getElementById("live-connection-state"),
    ranking: document.getElementById("live-ranking"),
    leaderboard: document.getElementById("live-leaderboard"),
    startButton: document.getElementById("btn-start"),
    statsBar: document.querySelector(".stats-bar"),
    mode3d: document.querySelector('[data-mode="3d"]'),
    mode2d: document.querySelector('[data-mode="2d"]'),
    liveChoice: document.querySelector('[data-opp="live"]'),
    turnClock: document.getElementById("live-turn-clock"),
    modeInstruction: document.getElementById("mode-instruction"),
  };

  const STATE = {
    session: null,
    room: null,
    subscription: null,
    subscriptionRoomId: null,
    clockTimer: null,
    fallbackTimer: null,
    serverOffsetMs: 0,
    busy: false,
    syncing: false,
    timeoutRefreshStarted: false,
  };

  const errorMessages = {
    authentication_required: "Connexion requise.",
    invalid_room_code: "Le code doit contenir six caractères.",
    room_not_found: "Salon introuvable ou inaccessible.",
    room_unavailable: "Ce salon n’est plus disponible.",
    already_in_active_room: "Vous participez déjà à une autre partie.",
    room_not_active: "La partie n’est pas active.",
    not_your_turn: "Ce n’est pas encore votre tour.",
    column_full: "Cette colonne est pleine.",
    invalid_column: "Cette colonne n’est pas valide.",
    invalid_turn_seconds: "Ce chrono n’est pas disponible.",
    "Invalid login credentials": "E-mail ou mot de passe incorrect.",
  };

  function readableError(error) {
    const source = `${error?.message || ""} ${error?.details || ""}`.trim();
    const key = Object.keys(errorMessages).find((candidate) => source.includes(candidate));
    return key ? errorMessages[key] : "Le service Live est momentanément indisponible.";
  }

  function setStatus(message = "", tone = "") {
    DOM.status.textContent = message;
    if (tone) DOM.status.dataset.tone = tone;
    else delete DOM.status.dataset.tone;
  }

  function setConnection(label) {
    DOM.connectionState.textContent = label;
  }

  function showReconnect(visible) {
    DOM.reconnect.classList.toggle("hidden", !visible);
  }

  function setBusy(busy) {
    STATE.busy = busy;
    [DOM.createButton, DOM.cancelRoom, DOM.copyInvite].forEach((button) => {
      if (button) button.disabled = busy;
    });
    DOM.joinForm?.querySelector("button")?.toggleAttribute("disabled", busy);
    DOM.authForm?.querySelector("button")?.toggleAttribute("disabled", busy);
  }

  function normalizeCode(value) {
    return String(value || "").toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);
  }

  function inviteUrl(code = STATE.room?.code) {
    const url = new URL(global.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("room", code);
    return url.href;
  }

  function writeRoomToUrl(code) {
    const url = new URL(global.location.href);
    if (code) url.searchParams.set("room", code);
    else url.searchParams.delete("room");
    global.history.replaceState({}, "", url);
  }

  function selectLiveMode() {
    if (!DOM.liveChoice.classList.contains("active")) DOM.liveChoice.click();
    DOM.panel.classList.remove("hidden");
    DOM.startButton.classList.add("hidden");
    DOM.statsBar?.classList.add("hidden");
    DOM.mode3d.disabled = true;
    if (DOM.mode3d.classList.contains("active")) DOM.mode2d.click();
  }

  function setOpponentMode(mode) {
    const isLive = mode === "live";
    DOM.panel.classList.toggle("hidden", !isLive);
    DOM.startButton.classList.toggle("hidden", isLive);
    DOM.statsBar?.classList.toggle("hidden", isLive);
    DOM.mode3d.disabled = isLive;
    if (isLive && DOM.mode3d.classList.contains("active")) DOM.mode2d.click();
  }

  async function refreshAuth() {
    try {
      STATE.session = rootApi ? await rootApi.getSession() : null;
    } catch {
      STATE.session = null;
    }
    const signedIn = Boolean(STATE.session?.user);
    DOM.authPanel.classList.toggle("hidden", signedIn);
    DOM.actions.classList.toggle("hidden", !signedIn || Boolean(STATE.room));
    DOM.ranking.classList.toggle("hidden", !signedIn);
    setConnection(!api ? "INDISPONIBLE" : signedIn ? "PRÊT" : "CONNEXION REQUISE");
    if (signedIn) await loadLeaderboard();
    return signedIn;
  }

  async function loadLeaderboard() {
    if (!STATE.session || !api) return;
    try {
      const ranking = await api.getLeaderboard();
      DOM.leaderboard.innerHTML = "";
      const fragment = document.createDocumentFragment();
      (ranking?.top || []).forEach((entry) => {
        const item = document.createElement("li");
        item.classList.toggle("is-me", entry.user_id === STATE.session.user.id);
        const rank = document.createElement("span");
        const name = document.createElement("span");
        const rating = document.createElement("b");
        rank.textContent = `#${entry.rank}`;
        name.textContent = entry.display_name;
        rating.textContent = `${entry.rating}`;
        item.append(rank, name, rating);
        fragment.appendChild(item);
      });
      DOM.leaderboard.appendChild(fragment);
    } catch (error) {
      console.warn("Classement Puissance 4 indisponible.", error);
    }
  }

  function stopClock() {
    global.clearInterval(STATE.clockTimer);
    STATE.clockTimer = null;
    DOM.turnClock.classList.add("hidden");
    DOM.turnClock.classList.remove("is-urgent");
  }

  function stopFallbackSync() {
    global.clearInterval(STATE.fallbackTimer);
    STATE.fallbackTimer = null;
  }

  function startFallbackSync() {
    stopFallbackSync();
    if (!STATE.room || !["waiting", "active"].includes(STATE.room.status)) return;
    STATE.fallbackTimer = global.setInterval(() => {
      if (!document.hidden && navigator.onLine !== false) syncRoom();
    }, 15000);
  }

  function startClock(room) {
    stopClock();
    if (room.status !== "active" || !room.turn_deadline) return;
    const serverNow = Date.parse(room.server_now);
    if (Number.isFinite(serverNow)) STATE.serverOffsetMs = serverNow - Date.now();
    const deadline = Date.parse(room.turn_deadline);
    STATE.timeoutRefreshStarted = false;
    DOM.turnClock.classList.remove("hidden");

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadline - (Date.now() + STATE.serverOffsetMs)) / 1000));
      DOM.turnClock.textContent = String(remaining);
      DOM.turnClock.classList.toggle("is-urgent", remaining <= 5);
      if (remaining === 0 && !STATE.timeoutRefreshStarted) {
        STATE.timeoutRefreshStarted = true;
        global.setTimeout(syncRoom, 250);
      }
    };
    tick();
    STATE.clockTimer = global.setInterval(tick, 250);
  }

  async function subscribeToRoom(room) {
    if (STATE.subscription && STATE.subscriptionRoomId === room.id) return;
    if (STATE.subscription) await STATE.subscription.unsubscribe();
    STATE.subscription = api.subscribeRoom(
      room.id,
      () => { syncRoom(); },
      (status) => {
        if (status === "SUBSCRIBED") {
          setConnection("LIVE");
          showReconnect(false);
        } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
          setConnection("À RECONNECTER");
          showReconnect(true);
        }
      },
    );
    STATE.subscriptionRoomId = room.id;
  }

  function renderWaiting(room) {
    game.returnFromLiveGame();
    DOM.actions.classList.add("hidden");
    DOM.waiting.classList.remove("hidden");
    DOM.roomCodeDisplay.textContent = room.code;
    setStatus("Partagez le code ou le lien. Le salon expire après 30 minutes.");
  }

  async function acceptRoom(room) {
    if (!room?.id) throw new Error("room_not_found");
    if (STATE.room?.id === room.id && Number(room.version) < Number(STATE.room.version)) return;
    STATE.room = room;
    writeRoomToUrl(room.code);
    await subscribeToRoom(room);
    startFallbackSync();

    if (room.status === "waiting") {
      stopClock();
      renderWaiting(room);
      return;
    }

    DOM.waiting.classList.add("hidden");
    DOM.actions.classList.add("hidden");
    if (document.getElementById("game-screen").classList.contains("hidden")) game.openLiveGame(room);
    else game.renderLiveRoom(room);
    startClock(room);
    if (room.status === "completed") {
      stopClock();
      stopFallbackSync();
      loadLeaderboard();
    }
  }

  async function reconnectRoom() {
    if (!STATE.room || STATE.syncing || !api || navigator.onLine === false) return;
    setConnection("RECONNEXION…");
    showReconnect(false);
    if (STATE.subscription) await STATE.subscription.unsubscribe();
    STATE.subscription = null;
    STATE.subscriptionRoomId = null;
    try {
      await subscribeToRoom(STATE.room);
      await syncRoom();
    } catch (error) {
      setConnection("À RECONNECTER");
      showReconnect(true);
      setStatus(readableError(error), "error");
    }
  }

  async function syncRoom() {
    if (!STATE.room?.code || STATE.syncing || !api) return;
    STATE.syncing = true;
    try {
      await acceptRoom(await api.getRoom(STATE.room.code));
    } catch (error) {
      setStatus(readableError(error), "error");
    } finally {
      STATE.syncing = false;
    }
  }

  async function createRoom() {
    if (!STATE.session || STATE.busy || !api) return;
    setBusy(true);
    setStatus("Création du salon…");
    try {
      const seconds = Number(DOM.turnSeconds.value) || 30;
      await acceptRoom(await api.createRoom(seconds));
    } catch (error) {
      setStatus(readableError(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom(code) {
    if (!STATE.session || STATE.busy || !api) return;
    const normalized = normalizeCode(code);
    if (normalized.length !== 6) {
      setStatus(errorMessages.invalid_room_code, "error");
      return;
    }
    setBusy(true);
    setStatus("Connexion au salon…");
    try {
      await acceptRoom(await api.joinRoom(normalized));
      setStatus("Adversaire trouvé. Bonne partie !", "success");
    } catch (error) {
      setStatus(readableError(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function playColumn(column) {
    if (!STATE.room || STATE.busy || STATE.room.status !== "active") return;
    if (Number(STATE.room.me_player) !== Number(STATE.room.current_player)) {
      setStatus(errorMessages.not_your_turn, "error");
      return;
    }
    setBusy(true);
    try {
      await acceptRoom(await api.play(STATE.room.code, Number(column)));
      setStatus("");
    } catch (error) {
      setStatus(readableError(error), "error");
      await syncRoom();
    } finally {
      setBusy(false);
    }
  }

  async function clearRoom() {
    stopClock();
    stopFallbackSync();
    if (STATE.subscription) await STATE.subscription.unsubscribe();
    STATE.subscription = null;
    STATE.subscriptionRoomId = null;
    STATE.room = null;
    showReconnect(false);
    writeRoomToUrl(null);
    game.returnFromLiveGame();
    DOM.waiting.classList.add("hidden");
    DOM.actions.classList.toggle("hidden", !STATE.session);
    setConnection(STATE.session ? "PRÊT" : "CONNEXION REQUISE");
  }

  async function leaveToMenu() {
    await clearRoom();
    setStatus("Vous pouvez créer ou rejoindre un nouveau salon.");
  }

  async function requestExit() {
    if (!STATE.room) {
      await clearRoom();
      return;
    }
    if (STATE.room.status === "active") {
      const confirmed = global.confirm("Abandonner la partie ? La victoire et l’Elo seront attribués à votre adversaire.");
      if (!confirmed) return;
      setBusy(true);
      try {
        await api.resign(STATE.room.code);
      } catch (error) {
        setStatus(readableError(error), "error");
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    await leaveToMenu();
  }

  async function cancelWaitingRoom() {
    if (!STATE.room || STATE.busy) return;
    setBusy(true);
    try {
      await api.resign(STATE.room.code);
      await clearRoom();
      setStatus("Salon annulé.");
    } catch (error) {
      setStatus(readableError(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function copyInvite() {
    if (!STATE.room) return;
    const text = inviteUrl();
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Lien d’invitation copié.", "success");
    } catch {
      global.prompt("Copiez ce lien d’invitation :", text);
    }
  }

  async function resumeInvite() {
    const code = normalizeCode(new URL(global.location.href).searchParams.get("room"));
    if (!code) return;
    selectLiveMode();
    DOM.roomCode.value = code;
    if (!STATE.session) {
      setStatus("Connectez-vous pour rejoindre ce salon.");
      return;
    }
    setBusy(true);
    try {
      let room;
      try {
        room = await api.getRoom(code);
      } catch {
        room = await api.joinRoom(code);
      }
      await acceptRoom(room);
    } catch (error) {
      setStatus(readableError(error), "error");
    } finally {
      setBusy(false);
    }
  }

  DOM.authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!rootApi || STATE.busy) return;
    setBusy(true);
    setStatus("Connexion…");
    try {
      await rootApi.signIn({ email: DOM.authEmail.value.trim(), password: DOM.authPassword.value });
      DOM.authPassword.value = "";
      await refreshAuth();
      setStatus("Connexion réussie.", "success");
      await resumeInvite();
    } catch (error) {
      setStatus(readableError(error), "error");
    } finally {
      setBusy(false);
    }
  });

  document.querySelectorAll(".btn-opp").forEach((button) => {
    button.addEventListener("click", () => setOpponentMode(button.dataset.opp));
  });
  DOM.roomCode.addEventListener("input", () => { DOM.roomCode.value = normalizeCode(DOM.roomCode.value); });
  DOM.createButton.addEventListener("click", createRoom);
  DOM.joinForm.addEventListener("submit", (event) => {
    event.preventDefault();
    joinRoom(DOM.roomCode.value);
  });
  DOM.copyInvite.addEventListener("click", copyInvite);
  DOM.cancelRoom.addEventListener("click", cancelWaitingRoom);
  DOM.reconnect.addEventListener("click", reconnectRoom);
  global.addEventListener("offline", () => {
    if (!STATE.room) return;
    setConnection("HORS LIGNE");
    showReconnect(true);
  });
  global.addEventListener("online", () => { reconnectRoom(); });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && STATE.room) reconnectRoom();
  });

  global.Puissance4Live = Object.freeze({ playColumn, requestExit, leaveToMenu });

  async function init() {
    if (!api) {
      setConnection("INDISPONIBLE");
      DOM.liveChoice.disabled = true;
      return;
    }
    await refreshAuth();
    await resumeInvite();
    rootApi.onAuthStateChange(() => global.setTimeout(async () => {
      const wasSignedIn = Boolean(STATE.session);
      const isSignedIn = await refreshAuth();
      if (isSignedIn && !wasSignedIn) await resumeInvite();
      if (!isSignedIn && STATE.room) await clearRoom();
    }, 0));
  }

  init();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})(window);
