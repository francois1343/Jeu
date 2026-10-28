(function arcadeSupport(global) {
  "use strict";

  const config = global.ARCADE_CONFIG || {};
  let busy = false;

  function paypalUrl(settings = {}) {
    const buttonId = String(settings.hostedButtonId || "").trim();
    if (/^[A-Za-z0-9]{8,32}$/.test(buttonId)) {
      const url = new URL("https://www.paypal.com/donate/");
      url.searchParams.set("hosted_button_id", buttonId);
      return url.href;
    }
    try {
      const url = new URL(settings.donationUrl);
      const allowed = new Set(["paypal.me", "www.paypal.me", "paypal.com", "www.paypal.com"]);
      if (url.protocol !== "https:" || url.username || url.password || !allowed.has(url.hostname)) return null;
      const donation = /^\/donate(?:\/|$)/.test(url.pathname);
      const receptionQr = /^\/qrcodes\/managed\/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\/?$/i.test(url.pathname);
      if (url.hostname.endsWith("paypal.com") && !donation && !receptionQr) return null;
      if (url.pathname === "/") return null;
      return url.href;
    } catch {
      return null;
    }
  }

  function message(text) {
    const node = document.getElementById("supportStatus");
    if (node) { node.textContent = text; node.hidden = !text; }
  }

  function providerReady() {
    return config.mode === "supabase" && config.rewardedAds?.enabled === true
      && typeof global.ArcadeRewardedAdProvider?.show === "function";
  }

  async function watchRewardedAd() {
    if (busy || !providerReady()) return;
    const platform = global.ArcadePlatform;
    const session = platform?.getSession?.();
    if (!session?.user?.id) {
      message("Connectez-vous à votre compte Arcade avant de choisir une vidéo récompensée.");
      return;
    }
    const button = document.getElementById("watchRewardedAdButton");
    busy = true;
    if (button) { button.disabled = true; button.setAttribute("aria-busy", "true"); }
    message("Chargement de la vidéo facultative…");
    try {
      const result = await global.ArcadeRewardedAdProvider.show({
        userId: session.user.id,
        placement: config.rewardedAds.placement || "arcade_home_reward",
      });
      if (result?.completed === true) {
        message("Vidéo terminée. Les Coins apparaîtront après confirmation du fournisseur par le serveur.");
        // This refresh never credits the wallet. Only the signed backend callback may do so.
        try { await platform.refreshAccount?.(); }
        catch { message("Vidéo terminée. Rechargez votre compte pour consulter la validation serveur."); }
      } else {
        message("Vidéo non terminée ou indisponible. Vous pouvez continuer à jouer.");
      }
    } catch {
      message("La vidéo est indisponible pour le moment. Vous pouvez continuer à jouer.");
    } finally {
      busy = false;
      if (button) { button.disabled = false; button.removeAttribute("aria-busy"); }
    }
  }

  function init() {
    const section = document.getElementById("supportArcade");
    if (!section) return;
    const donation = document.getElementById("paypalSupportLink");
    const donationAddress = paypalUrl(config.paypal);
    if (donation && donationAddress) {
      donation.href = donationAddress;
      donation.hidden = false;
      const qrPath = String(config.paypal?.qrImage || "");
      if (/^assets\/[a-zA-Z0-9/_-]+\.png$/.test(qrPath)) {
        const image = document.getElementById("paypalQrImage");
        if (image) image.src = qrPath;
        const block = document.getElementById("paypalQrBlock");
        const note = document.getElementById("paypalQrNote");
        if (block && image) block.hidden = false;
        if (note) note.hidden = false;
      }
    }
    const reward = document.getElementById("watchRewardedAdButton");
    const ready = providerReady();
    if (reward && ready) {
      reward.hidden = false;
      reward.addEventListener("click", watchRewardedAd);
    }
    // No placeholder payment link or pretend video is shown when configuration is absent.
    section.hidden = !donationAddress && !ready;
  }

  global.ArcadeSupport = Object.freeze({ paypalUrl, watchRewardedAd });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})(window);
