(function arcadePlatformGuest(global) {
  "use strict";
  if (global.ARCADE_CONFIG?.mode !== "guest") return;

  function beginGame(game) {
    const destination = new URL(game.url, global.location.href);
    for (const key of ["arcadeSession", "arcadeServer", "arcadeGame", "room"]) destination.searchParams.delete(key);
    destination.searchParams.set("arcadeFree", "1");
    return { url: destination.href, practice: true };
  }

  function init() {
    const text = (selector, value) => {
      const node = document.querySelector(selector);
      if (node) node.textContent = value;
    };
    text("#platformState", "Accès libre · sans connexion ni Coins");
    text("#accountLabel", "Mode invité");
    text(".platform-intro .platform-kicker", "ACCÈS LIBRE · TEMPORAIRE");
    text("#arcadeEconomyTitle", "Tous les jeux restent accessibles");
    text(".platform-intro p", "Jouez gratuitement, seul, contre les bots ou à plusieurs sur le même écran. Les comptes, les Coins et les fonctions en ligne sont temporairement en pause. Les records propres aux jeux restent sur cet appareil.");
    document.querySelector(".account-balance")?.setAttribute("hidden", "");
    document.getElementById("accountButton")?.setAttribute("disabled", "");
    for (const id of ["openAccountButton", "openShopButton", "openAdminButton"]) {
      document.getElementById(id)?.setAttribute("hidden", "");
    }
    const daily = document.querySelector('.platform-actions [data-open-dialog="challengeDialog"]');
    if (daily) {
      daily.removeAttribute("data-open-dialog");
      text('.platform-actions .platform-action.primary strong', "Choisir un jeu");
      text('.platform-actions .platform-action.primary small', "Gratuit · sans inscription");
      daily.addEventListener("click", () => document.querySelector(".games-grid")?.scrollIntoView({ behavior: "smooth" }));
    }
    document.querySelectorAll(".game-card").forEach((card) => {
      card.dataset.free = "true";
      if (!card.querySelector(".free-badge")) {
        const badge = document.createElement("span");
        badge.className = "free-badge";
        badge.textContent = "FREE";
        badge.setAttribute("aria-label", "Jeu gratuit");
        card.prepend(badge);
      }
    });
    document.querySelectorAll('[data-open-dialog="accountDialog"],[data-open-dialog="challengeDialog"],[data-requires-account]')
      .forEach((button) => { button.disabled = true; button.title = "Service temporairement en pause"; });
    document.querySelectorAll('#accountDialog form,#challengeForm').forEach((form) => {
      form.addEventListener("submit", (event) => event.preventDefault());
      form.querySelectorAll("input,button,select").forEach((control) => { control.disabled = true; });
    });
  }

  const unavailable = () => { throw new Error("online_services_paused"); };
  global.ArcadePlatform = Object.freeze({
    init,
    isConfigured: () => true,
    beginGame,
    getSession: () => null,
    getBalance: () => null,
    refreshAccount: () => null,
    getGameSession: () => null,
    startGameSession: unavailable,
    reportGameResult: unavailable,
    startChallenge: unavailable,
    settleChallenge: unavailable,
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);
