(function arcadePwaInstall(global) {
  "use strict";

  const config = global.ARCADE_PWA_CONFIG;
  if (!config) return;

  const promptConfig = config.installPrompt;
  const storageKey = promptConfig.storageKey;
  let deferredPrompt = null;
  let state = null;
  let updateRegistration = null;
  let reloadForUpdate = false;

  function isStandalone() {
    return global.matchMedia?.("(display-mode: standalone)").matches
      || global.navigator.standalone === true;
  }

  function isIosSafari() {
    const userAgent = global.navigator.userAgent || "";
    const iosDevice = /iPad|iPhone|iPod/.test(userAgent)
      || (global.navigator.platform === "MacIntel" && global.navigator.maxTouchPoints > 1);
    return iosDevice && /Safari/i.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent);
  }

  function readState() {
    try {
      const saved = JSON.parse(global.localStorage.getItem(storageKey) || "{}");
      return {
        visits: Math.max(0, Number(saved.visits) || 0),
        dismissals: Math.max(0, Number(saved.dismissals) || 0),
        nextEligibleAt: Math.max(0, Number(saved.nextEligibleAt) || 0),
        installedAt: Math.max(0, Number(saved.installedAt) || 0),
      };
    } catch {
      return { visits: 0, dismissals: 0, nextEligibleAt: 0, installedAt: 0 };
    }
  }

  function saveState() {
    try {
      global.localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // L’installation reste disponible même si le stockage est désactivé.
    }
  }

  function hidePrompt() {
    document.getElementById("pwaInstallPrompt")?.setAttribute("hidden", "");
  }

  function canOfferPrompt() {
    return state
      && !isStandalone()
      && !state.installedAt
      && state.visits >= promptConfig.minimumVisits
      && Date.now() >= state.nextEligibleAt
      && (Boolean(deferredPrompt) || isIosSafari());
  }

  function showPrompt() {
    if (!canOfferPrompt()) return;
    const prompt = document.getElementById("pwaInstallPrompt");
    if (!prompt) return;
    prompt.dataset.platform = isIosSafari() ? "ios" : "supported";
    prompt.removeAttribute("hidden");
  }

  function postponePrompt() {
    state.dismissals += 1;
    const delayDays = Math.min(
      promptConfig.initialSnoozeDays + ((state.dismissals - 1) * promptConfig.snoozeIncrementDays),
      promptConfig.maximumSnoozeDays,
    );
    state.nextEligibleAt = Date.now() + (delayDays * 24 * 60 * 60 * 1000);
    saveState();
    hidePrompt();
  }

  async function install() {
    const help = document.getElementById("pwaInstallIosHelp");
    if (isIosSafari()) {
      help?.removeAttribute("hidden");
      return;
    }
    if (!deferredPrompt) return;

    const promptEvent = deferredPrompt;
    deferredPrompt = null;
    hidePrompt();
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome !== "accepted") postponePrompt();
    } catch {
      postponePrompt();
    }
  }

  function showUpdatePrompt(registration) {
    if (!registration.waiting || !global.navigator.serviceWorker.controller) return;
    updateRegistration = registration;
    document.getElementById("pwaUpdatePrompt")?.removeAttribute("hidden");
  }

  function activateUpdate() {
    if (!updateRegistration?.waiting) return;
    reloadForUpdate = true;
    updateRegistration.waiting.postMessage({ type: "SKIP_WAITING" });
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in global.navigator)) return;
    global.navigator.serviceWorker.register(config.serviceWorker.path, { scope: config.serviceWorker.scope })
      .then((registration) => {
        const offerUpdate = () => showUpdatePrompt(registration);
        if (registration.waiting) offerUpdate();
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed") offerUpdate();
          });
        });
      })
      .catch(() => {
        // Le site reste totalement fonctionnel lorsqu’un navigateur bloque les Service Workers.
      });
  }

  global.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    showPrompt();
  });

  global.addEventListener("appinstalled", () => {
    state ||= readState();
    state.installedAt = Date.now();
    saveState();
    deferredPrompt = null;
    hidePrompt();
  });

  document.addEventListener("DOMContentLoaded", () => {
    state = readState();
    registerServiceWorker();
    document.getElementById("pwaUpdateButton")?.addEventListener("click", activateUpdate);
    global.navigator.serviceWorker?.addEventListener("controllerchange", () => {
      if (reloadForUpdate) global.location.reload();
    });
    if (isStandalone()) {
      state.installedAt = state.installedAt || Date.now();
      saveState();
      return;
    }

    state.visits += 1;
    saveState();
    document.getElementById("pwaInstallButton")?.addEventListener("click", install);
    document.getElementById("pwaInstallLater")?.addEventListener("click", postponePrompt);
    global.setTimeout(showPrompt, promptConfig.initialDisplayDelayMs);
  });
})(window);
