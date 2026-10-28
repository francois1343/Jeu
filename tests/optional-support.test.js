"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../js/core/arcade-support.js"), "utf8");

function setup(options = {}) {
  const nodes = new Map(["supportArcade", "paypalSupportLink", "watchRewardedAdButton", "supportStatus", "paypalQrImage", "paypalQrBlock", "paypalQrNote"].map(id => [id, {
    hidden: true, disabled: false, textContent: "", handlers: {},
    addEventListener(name, handler) { this.handlers[name] = handler; },
    setAttribute() {}, removeAttribute() {},
  }]));
  let shows = 0, refreshes = 0;
  const win = {
    ARCADE_CONFIG: {mode: "supabase", paypal: options.paypal || {}, rewardedAds: {enabled: options.ads === true}},
    ArcadePlatform: {getSession: () => options.signedOut ? null : {user: {id: "test-user"}},
                     refreshAccount: async () => { refreshes++; }},
  };
  if (options.provider) win.ArcadeRewardedAdProvider = {show: async () => {shows++; return options.result;}};
  vm.runInNewContext(source, {window: win, URL, document: {readyState: "complete", getElementById: id => nodes.get(id)}});
  return {nodes, win, calls: () => ({shows, refreshes})};
}

(async () => {
  const missing = setup();
  assert.equal(missing.nodes.get("supportArcade").hidden, true);
  const support = missing.win.ArcadeSupport;
  assert.equal(support.paypalUrl({donationUrl: "javascript:alert(1)"}), null);
  assert.equal(support.paypalUrl({donationUrl: "https://paypal.com.evil.example/donate"}), null);
  assert.equal(support.paypalUrl({donationUrl: "https://user:secret@paypal.com/donate"}), null);
  assert.equal(support.paypalUrl({donationUrl: "https://paypal.me/ExampleCreator"}), "https://paypal.me/ExampleCreator");
  assert.equal(support.paypalUrl({hostedButtonId: "ABC1234567890"}), "https://www.paypal.com/donate/?hosted_button_id=ABC1234567890");
  const receptionQr = "https://www.paypal.com/qrcodes/managed/da87cc2d-20d0-49d3-be3b-fae1b667bcdf";
  assert.equal(support.paypalUrl({donationUrl: receptionQr}), receptionQr);
  assert.equal(support.paypalUrl({donationUrl: "https://www.paypal.com/qrcodes/managed/not-a-valid-id"}), null);
  const qr = setup({paypal: {donationUrl: receptionQr, qrImage: "assets/paypal-reception-qr.png"}});
  assert.equal(qr.nodes.get("paypalQrBlock").hidden, false);
  assert.equal(qr.nodes.get("paypalQrImage").src, "assets/paypal-reception-qr.png");
  const remoteQr = setup({paypal: {donationUrl: receptionQr, qrImage: "https://example.org/tracker.png"}});
  assert.equal(remoteQr.nodes.get("paypalQrBlock").hidden, true);
  const donation = setup({paypal: {donationUrl: "https://paypal.me/ExampleCreator"}});
  assert.equal(donation.nodes.get("supportArcade").hidden, false);
  assert.equal(donation.nodes.get("paypalSupportLink").hidden, false);
  assert.equal(donation.nodes.get("watchRewardedAdButton").hidden, true);
  const absentProvider = setup({ads: true});
  assert.equal(absentProvider.nodes.get("supportArcade").hidden, true);
  const signedOut = setup({ads: true, provider: true, signedOut: true});
  await signedOut.win.ArcadeSupport.watchRewardedAd();
  assert.equal(signedOut.calls().shows, 0);
  const cancelled = setup({ads: true, provider: true, result: {completed: false}});
  await cancelled.win.ArcadeSupport.watchRewardedAd();
  assert.deepEqual(cancelled.calls(), {shows: 1, refreshes: 0});
  const completed = setup({ads: true, provider: true, result: {completed: true}});
  await completed.win.ArcadeSupport.watchRewardedAd();
  assert.deepEqual(completed.calls(), {shows: 1, refreshes: 1});
  assert.match(completed.nodes.get("supportStatus").textContent, /confirmation.*serveur/);
  assert.equal(completed.nodes.get("watchRewardedAdButton").disabled, false);
  assert.doesNotMatch(source, /localStorage|creditWallet|creditCoins|arcade_credit_rewarded_ad/);
  console.log("Soutien facultatif : configuration, liens PayPal et validation serveur vérifiés.");
})().catch(error => {console.error(error); process.exitCode = 1;});
