(function arcadeGamePreferences(global) {
  "use strict";

  const store = global.ArcadeLocalStore;
  const config = global.ARCADE_GAME_CONFIG?.preferences || {};
  const defaults = config.defaults || {
    sound: true,
    music: true,
    vibration: true,
    animations: true,
    visualIntensity: "balanced",
  };
  const listeners = new Set();
  const reducedMotionQuery = global.matchMedia?.("(prefers-reduced-motion: reduce)");
  let current = { ...defaults };

  function prefersReducedMotion() {
    return Boolean(reducedMotionQuery?.matches);
  }

  function clone(value) {
    return { ...value };
  }

  function read() {
    try { return store?.getGamePreferences?.() || clone(defaults); }
    catch (_) { return clone(defaults); }
  }

  function apply(preferences, source = "sync") {
    current = { ...defaults, ...preferences };
    const root = global.document?.documentElement;
    if (root) {
      root.dataset.arcadeSound = current.sound ? "on" : "off";
      root.dataset.arcadeMusic = current.music ? "on" : "off";
      root.dataset.arcadeVibration = current.vibration ? "on" : "off";
      root.dataset.arcadeAnimations = current.animations ? "on" : "off";
      root.dataset.arcadeReducedMotion = prefersReducedMotion() ? "reduce" : "no-preference";
      root.dataset.arcadeVisualIntensity = current.visualIntensity;
    }
    const detail = { preferences: clone(current), source };
    listeners.forEach((listener) => listener(detail));
    global.dispatchEvent?.(new CustomEvent("arcade:preferences-change", { detail }));
    return clone(current);
  }

  function update(patch = {}) {
    const saved = store?.saveGamePreferences?.({ ...current, ...patch });
    return apply(saved || { ...current, ...patch }, "user");
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    listener({ preferences: clone(current), source: "subscribe" });
    return () => listeners.delete(listener);
  }

  function vibrate(pattern = 20) {
    if (!current.vibration || typeof global.navigator?.vibrate !== "function") return false;
    return global.navigator.vibrate(pattern);
  }

  function sync() {
    return apply(read(), "storage");
  }

  global.ArcadeGamePreferences = Object.freeze({
    get: () => clone(current),
    update,
    subscribe,
    sync,
    vibrate,
    allowsSound: () => current.sound,
    allowsMusic: () => current.music,
    allowsVibration: () => current.vibration,
    allowsAnimations: () => current.animations && !prefersReducedMotion(),
  });

  sync();
  global.addEventListener?.("arcade-local-store-change", sync);
  if (typeof reducedMotionQuery?.addEventListener === "function") {
    reducedMotionQuery.addEventListener("change", () => apply(current, "system"));
  } else if (typeof reducedMotionQuery?.addListener === "function") {
    reducedMotionQuery.addListener(() => apply(current, "system"));
  }
  global.dispatchEvent?.(new CustomEvent("arcade:preferences-ready", { detail: { preferences: clone(current) } }));
})(window);
