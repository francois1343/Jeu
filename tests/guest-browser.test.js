"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const { DevTools, retry } = require("../scripts/generate-ux-audit.js");
const root = path.resolve(__dirname, "..");
const base = process.env.ARCADE_BASE_URL || "http://127.0.0.1:4178";
const chrome = [process.env.CHROME_PATH, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].filter(Boolean).find(fs.existsSync);
assert(chrome, "Chrome ou Edge requis");
function pages(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? pages(file) : file.endsWith(".html") ? [path.relative(root, file).split(path.sep).map(encodeURIComponent).join("/")] : [];
  });
}

(async () => {
  const server = process.env.ARCADE_BASE_URL ? null : spawn("python", ["-m", "http.server", "4178", "--bind", "127.0.0.1"], { cwd: root, stdio: "ignore", windowsHide: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "arcade-guest-"));
  const browser = spawn(chrome, ["--headless=new", "--remote-debugging-port=9386", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--mute-audio", "about:blank"], { stdio: "ignore", windowsHide: true });
  let cdp;
  try {
    await retry(async () => assert((await fetch(`${base}/index.html`)).ok));
    const target = await retry(async () => {
      const page = (await (await fetch("http://127.0.0.1:9386/json/list")).json()).find((item) => item.type === "page");
      assert(page); return page;
    });
    cdp = new DevTools(target.webSocketDebuggerUrl);
    await cdp.connect();
    const requests = [], errors = [];
    cdp.socket.addEventListener("message", (event) => {
      const item = JSON.parse(event.data);
      if (item.method === "Network.requestWillBeSent" && /supabase\.co/.test(item.params.request.url)) requests.push(item.params.request.url);
      if (item.method === "Runtime.exceptionThrown") errors.push(item.params.exceptionDetails.exception?.description || item.params.exceptionDetails.text);
    });
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Network.enable");
    await cdp.send("Network.setBlockedURLs", { urls: ["*supabase.co/*"] });
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: "localStorage.removeItem('arcade.qa.localMode'); if (!localStorage.getItem('arcade.auth.nnqfomqgagfshujyfrtl')) localStorage.setItem('arcade.auth.nnqfomqgagfshujyfrtl', 'preserve-server-auth'); if (!localStorage.getItem('arcade.pending-settlements.nnqfomqgagfshujyfrtl')) localStorage.setItem('arcade.pending-settlements.nnqfomqgagfshujyfrtl', 'preserve-server-settlements');" });
    async function navigate(route, game = true) {
      const url = new URL(route, `${base}/`).href;
      await cdp.send("Page.navigate", { url });
      await retry(async () => assert(await cdp.evaluate(`location.href === ${JSON.stringify(url)} && document.readyState === 'complete' && ${game ? "Boolean(window.ArcadeGameShell)" : "Boolean(window.ArcadePlatform)"}`)));
      assert.equal(await cdp.evaluate("window.ARCADE_CONFIG.mode"), "guest");
      assert.equal(await cdp.evaluate("Boolean(window.ArcadeSupabase)"), false);
      assert.equal(await cdp.evaluate("Boolean(document.getElementById('arcadeSessionBlocker'))"), false);
      if (game) await cdp.evaluate("(() => { if (ArcadeGameShell.isOpen) document.getElementById('arcadeShellTutorialSkip').click(); return true; })()");
    }

    await navigate("index.html", false);
    assert.equal(await cdp.evaluate("document.getElementById('accountButton').disabled"), true);
    assert.equal(await cdp.evaluate("document.querySelectorAll('.game-card:not([data-free=\"true\"])').length"), 0);
    await cdp.evaluate("document.querySelector('[data-game=\"snake\"] .btn-launch').click(); true");
    await retry(async () => assert(await cdp.evaluate("location.pathname.endsWith('/games/snake/index.html') && Boolean(window.ArcadeGameShell)")));
    assert.equal(await cdp.evaluate("new URL(location.href).searchParams.get('arcadeFree')"), "1");
    assert.deepEqual(await cdp.evaluate("(() => { if (ArcadeGameShell.isOpen) document.getElementById('arcadeShellTutorialSkip').click(); startGame(); return {running:game.isRunning,session:ArcadeGameSession.id,blocker:!!document.getElementById('arcadeSessionBlocker')}; })()"), { running: true, session: null, blocker: false });
    await navigate("games/pong/index.html?arcadeServer=1&arcadeSession=00000000-0000-0000-0000-000000000000");
    assert.equal(await cdp.evaluate("ArcadeGameSession.id"), null);
    assert.equal(await cdp.evaluate("startGame('classic'); game.running"), true);

    const routes = pages(path.join(root, "games"));
    for (const route of routes) await navigate(route);
    await navigate("games/puissance4/index.html");
    assert.equal(await cdp.evaluate("document.querySelector('[data-opp=live]').disabled"), true);
    assert.equal(await cdp.evaluate("document.getElementById('btn-start').disabled"), false);
    assert.equal(await cdp.evaluate("localStorage.getItem('arcade.auth.nnqfomqgagfshujyfrtl')"), "preserve-server-auth");
    assert.equal(await cdp.evaluate("localStorage.getItem('arcade.pending-settlements.nnqfomqgagfshujyfrtl')"), "preserve-server-settlements");
    assert.deepEqual(requests, [], "Le mode invité ne doit appeler aucun service Supabase");
    assert.deepEqual(errors, [], "Erreur JavaScript en mode invité");
    console.log(`Mode invité : ${routes.length} pages, lancement depuis l'accueil, parties Snake/Pong et anciens liens vérifiés sans Supabase; données serveur préservées.`);
  } finally {
    cdp?.close(); browser.kill(); server?.kill();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
