window.ARCADE_PWA_CONFIG = Object.freeze({
  serviceWorker: Object.freeze({
    path: "./service-worker.js",
    scope: "./",
  }),
  installPrompt: Object.freeze({
    storageKey: "arcade.pwa-install-prompt.v1",
    initialDisplayDelayMs: 15000,
    minimumVisits: 2,
    initialSnoozeDays: 3,
    snoozeIncrementDays: 4,
    maximumSnoozeDays: 30,
  }),
});
