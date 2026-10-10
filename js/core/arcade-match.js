(function installArcadeMatch(global) {
  "use strict";

  const MODES = Object.freeze({
    SOLO: "solo",
    BOT: "bot",
    LOCAL: "local",
    INVITE: "invite",
    MATCHMAKING: "matchmaking",
  });
  const onlineModes = new Set([MODES.INVITE, MODES.MATCHMAKING]);
  const terminalStates = new Set(["completed", "abandoned", "cancelled", "expired"]);
  const listeners = new Set();
  let match = null;
  let realtimeSubscription = null;
  let heartbeatTimer = null;
  let refreshPromise = null;

  function api() {
    const service = global.ArcadeSupabase?.matches;
    if (!service) throw new Error("arcade_match_unavailable");
    return service;
  }

  function snapshot() {
    if (!match) return null;
    return {
      ...match,
      options: { ...(match.options || {}) },
      result: match.result ? { ...match.result } : null,
      players: Array.isArray(match.players)
        ? match.players.map((player) => ({ ...player, metadata: { ...(player.metadata || {}) } }))
        : [],
    };
  }

  function emit(source, detail = {}) {
    const event = Object.freeze({ source, match: snapshot(), ...detail });
    listeners.forEach((listener) => listener(event));
    global.dispatchEvent?.(new CustomEvent("arcade:match", { detail: event }));
  }

  function stopHeartbeat() {
    if (heartbeatTimer) global.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  async function heartbeat(source = "heartbeat") {
    if (!match?.id || terminalStates.has(match.status) || !onlineModes.has(match.mode)) return snapshot();
    try {
      match = await api().heartbeat(match.id);
      emit(source);
      return snapshot();
    } catch (error) {
      emit("connection_error", { error });
      throw error;
    }
  }

  function startHeartbeat() {
    stopHeartbeat();
    if (!match?.id || terminalStates.has(match.status) || !onlineModes.has(match.mode)) return;
    heartbeatTimer = global.setInterval(() => {
      if (!global.document?.hidden && global.navigator?.onLine !== false) heartbeat().catch(() => {});
    }, 15000);
  }

  function stopRealtime() {
    realtimeSubscription?.unsubscribe?.();
    realtimeSubscription = null;
  }

  async function refresh(source = "refresh") {
    if (!match?.id) return null;
    if (!refreshPromise) {
      refreshPromise = api().get(match.id)
        .then((nextMatch) => {
          match = nextMatch;
          startHeartbeat();
          emit(source);
          return snapshot();
        })
        .finally(() => { refreshPromise = null; });
    }
    return refreshPromise;
  }

  function watch(matchId) {
    stopRealtime();
    if (!matchId) return;
    realtimeSubscription = api().subscribe(
      matchId,
      (kind, payload) => {
        emit("realtime", { kind, payload });
        refresh(`realtime:${kind}`).catch((error) => emit("connection_error", { error }));
      },
      (status, error) => {
        emit("realtime_status", { status, error: error || null });
        if (status === "SUBSCRIBED") heartbeat("reconnected").catch(() => {});
      },
    );
  }

  function attach(nextMatch, source) {
    match = nextMatch;
    watch(match?.id);
    startHeartbeat();
    emit(source);
    return snapshot();
  }

  async function create({ gameKey, mode, options = {} }) {
    if (!Object.values(MODES).includes(mode) || mode === MODES.MATCHMAKING) {
      throw new Error("invalid_match_mode");
    }
    return attach(await api().create(gameKey, mode, options), "created");
  }

  async function findOpponent(gameKey, options = {}) {
    return attach(await api().findOpponent(gameKey, options), "matchmaking");
  }

  async function createInvite({ inviteeUserId = null, ttlMinutes = 30 } = {}) {
    if (!match?.id || match.mode !== MODES.INVITE) throw new Error("match_not_invitable");
    const invite = await api().createInvite(match.id, inviteeUserId, ttlMinutes);
    const inviteUrl = new URL(global.location.href);
    inviteUrl.searchParams.set("matchInvite", invite.token);
    const result = Object.freeze({ ...invite, url: inviteUrl.href });
    emit("invite_created", { invite: result });
    return result;
  }

  async function acceptInvite(token) {
    return attach(await api().acceptInvite(token), "invite_accepted");
  }

  async function resume(matchId) {
    return attach(await api().get(matchId), "resumed");
  }

  async function submitTurn(action, { actorSlot = null } = {}) {
    if (!match?.id || match.status !== "active") throw new Error("match_not_active");
    return attach(
      await api().submitTurn(match.id, match.version, action, actorSlot),
      "turn_submitted",
    );
  }

  async function reportResult(result) {
    if (!match?.id || match.status !== "active") throw new Error("match_not_active");
    const acknowledgement = await api().reportResult(match.id, match.version, result);
    emit("result_reported", { acknowledgement });
    return acknowledgement;
  }

  async function abandon() {
    if (!match?.id || terminalStates.has(match.status)) return snapshot();
    return attach(await api().abandon(match.id), "abandoned");
  }

  async function disconnect() {
    if (!match?.id || terminalStates.has(match.status) || !onlineModes.has(match.mode)) return snapshot();
    try {
      match = await api().disconnect(match.id);
      emit("disconnected");
    } finally {
      stopHeartbeat();
    }
    return snapshot();
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    listener({ source: "subscribe", match: snapshot() });
    return () => listeners.delete(listener);
  }

  function destroy() {
    stopHeartbeat();
    stopRealtime();
    match = null;
  }

  global.addEventListener?.("online", () => heartbeat("online").catch(() => {}));
  global.addEventListener?.("offline", () => disconnect().catch(() => {}));
  global.addEventListener?.("pagehide", () => disconnect().catch(() => {}));
  global.document?.addEventListener?.("visibilitychange", () => {
    if (!global.document.hidden) heartbeat("visible").catch(() => {});
  });

  global.ArcadeMatch = Object.freeze({
    MODES,
    get current() { return snapshot(); },
    create,
    findOpponent,
    createInvite,
    acceptInvite,
    resume,
    refresh,
    heartbeat,
    disconnect,
    submitTurn,
    reportResult,
    abandon,
    subscribe,
    destroy,
  });
})(window);
