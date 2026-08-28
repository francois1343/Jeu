(function arcadeGameSdk(global) {
  "use strict";

  function platform() {
    if (!global.ArcadePlatform) {
      throw new Error("arcade_platform_unavailable");
    }
    return global.ArcadePlatform;
  }

  global.ArcadeGameSDK = Object.freeze({
    isReady() {
      return Boolean(global.ArcadePlatform?.isConfigured());
    },
    getSession() {
      return platform().getSession();
    },
    getBalance() {
      return platform().getBalance();
    },
    beginGame(game) {
      return platform().beginGame(game);
    },
    startSession(sessionId, metadata) {
      return platform().startGameSession(sessionId, metadata);
    },
    reportResult(sessionId, outcome, metadata) {
      return platform().reportGameResult(sessionId, outcome, metadata);
    },
    startVerifiedGame(gameKey) {
      return platform().startChallenge(gameKey);
    },
    settleVerifiedGame(sessionId, answer) {
      return platform().settleChallenge(sessionId, answer);
    },
    refreshAccount() {
      return platform().refreshAccount();
    },
  });
})(window);
