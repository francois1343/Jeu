"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { DevTools, retry, measurementExpression } = require("../scripts/generate-ux-audit.js");

const root = path.resolve(__dirname, "..");
const baseUrl = process.env.ARCADE_BASE_URL || "http://127.0.0.1:4175";
const debugPort = 9385;
const chromePath = [process.env.CHROME_PATH, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].filter(Boolean).find(fs.existsSync);
assert(chromePath, "Chrome ou Edge est requis pour la recette responsive");

const cases = [
  { route: "games/BubbleShooter/BubbleShooter.html", states: [["menu", "true"], ["game", "document.getElementById('btn-start').click(); true"]] },
  { route: "games/pong/index.html", states: [
    ["menu", "true"], ["settings", "showSettings(); true"], ["game", "hideSettings(); startGame('classic'); true"],
  ], canvas: "#canvas" },
  { route: "games/casse-bloc/index.html", states: [["menu", "true"], ["game", "game.start(); true"]], canvas: "#game" },
  { route: "games/Cyber-Symbol Poker/Cyber-SymbolPoker.html", states: [["table", "true"], ["hand", "document.getElementById('btn-action').click(); true"]] },
  { route: "games/Cyber-CoreSorter/Cyber-CoreSorter.html", states: [["menu", "true"], ["game", "document.getElementById('btn-start').click(); true"], ["pause", "document.getElementById('btn-pause').click(); true"]] },
  { route: "games/cyberfind/index.html", states: [["menu", "true"], ["game", "document.getElementById('btn-start').click(); true"]] },
  { route: "games/demineur/index.html", states: [["menu", "true"], ["beginner", "startGame('beginner'); true"], ["expert", "startGame('expert'); true"]] },
  { route: "games/openworld/index.html", wait: 1000, states: [["menu", "true"], ["community", "toggleCollabPanel(); true"], ["settings", "toggleCollabPanel(); showSettings(); true"]] },
  { route: "games/spider-solitaire/index.html", states: [["menu", "true"], ["game", "document.querySelector('.btn-difficulty').click(); true"]] },
  { route: "games/Poker/poker.html", states: [["lobby", "true"], ["game", "document.getElementById('btn-start').click(); true"]] },
  { route: "games/neon-overdrive/index.html", states: [["menu", "true"], ["game", "document.getElementById('startButton').click(); true"], ["pause", "document.getElementById('pauseButton').click(); true"]] },
  { route: "games/synthwave-runner/index.html", states: [["menu", "true"], ["game", "document.getElementById('startButton').click(); true"], ["pause", "document.getElementById('pauseButton').click(); true"]] },
];

const viewports = [
  { width: 1366, height: 768, mobile: false },
  { width: 390, height: 844, mobile: true },
  { width: 320, height: 568, mobile: true },
  { width: 844, height: 390, mobile: true },
];
const selected = process.env.ARCADE_LAYOUT_GAMES?.split(",");
const routes = selected ? cases.filter((item) => selected.some((name) => item.route.includes(name))) : cases;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "arcade-responsive-"));
  const screenshotDir = process.env.ARCADE_SCREENSHOT_DIR || path.join(profile, "screenshots");
  const server = process.env.ARCADE_BASE_URL ? null : spawn("python", ["-m", "http.server", "4175", "--bind", "127.0.0.1"], { cwd: root, stdio: "ignore", windowsHide: true });
  const browser = spawn(chromePath, ["--headless=new", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--mute-audio", "about:blank"], { stdio: "ignore", windowsHide: true });
  let cdp;
  let checks = 0;
  const issues = [];
  try {
    await retry(async () => { assert((await fetch(`${baseUrl}/index.html`)).ok); });
    const target = await retry(async () => {
      const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
      const page = targets.find((item) => item.type === "page");
      assert(page);
      return page;
    });
    cdp = new DevTools(target.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: "try { localStorage.setItem('arcade.qa.localMode', '1'); } catch (_) {}" });

    for (const viewport of viewports) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1 });
      for (const item of routes) {
        let url = new URL(item.route, `${baseUrl}/`).href;
        await cdp.send("Page.navigate", { url });
        await retry(async () => {
          assert(await cdp.evaluate(`location.href === ${JSON.stringify(url)} && document.readyState === 'complete' && Boolean(window.ArcadeGameShell)`));
        });
        await cdp.evaluate("document.fonts.ready.then(() => true)");
        await delay(item.wait || 100);
        await cdp.evaluate("(() => { if (window.ArcadeGameShell.isOpen) document.getElementById('arcadeShellTutorialSkip').click(); return true; })()");
        if (item.route.includes("cyberfind")) {
          assert(await cdp.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--text').trim() === '#f1f5f9'"), "La palette Cyberfind n'est pas appliquée");
        }
        // Use an isolated local profile/session, so the real Coins + menu HUD is tested too.
        const sessionId = await cdp.evaluate(`(() => {
          window.ArcadeLocalStore.login(${JSON.stringify(`QA ${viewport.width} ${routes.indexOf(item)}`)});
          return window.ArcadeLocalStore.createSession({ gameKey: window.ArcadeGameShell.gameKey, title: document.title, url: location.pathname }).id;
        })()`);
        const sessionUrl = new URL(url);
        sessionUrl.searchParams.set("arcadeSession", sessionId);
        url = sessionUrl.href;
        await cdp.send("Page.navigate", { url });
        await retry(async () => {
          assert(await cdp.evaluate(`location.href === ${JSON.stringify(url)} && document.readyState === 'complete' && Boolean(window.ArcadeGameShell && document.getElementById('arcadeSessionHud'))`));
        });
        await cdp.evaluate("document.fonts.ready.then(() => true)");
        await delay(item.wait || 100);
        await cdp.evaluate("(() => { if (window.ArcadeGameShell.isOpen) document.getElementById('arcadeShellTutorialSkip').click(); return true; })()");
        const states = [...item.states,
          ["common-menu", "window.ArcadeGameShell.open('overview'); true"],
          ["common-settings", "window.ArcadeGameShell.open('settings'); true"],
        ];
        for (const [name, setup] of states) {
          try {
            await cdp.evaluate(setup);
            await delay(120);
            const metrics = await cdp.evaluate(measurementExpression());
            const problems = [];
            if (metrics.horizontal_overflow_px > 2) problems.push(`débordement ${metrics.horizontal_overflow_px}px`);
            if (metrics.overlap_count) problems.push(`collisions ${JSON.stringify(metrics.overlaps)}`);
            if (metrics.fixed_cut_count) problems.push(`commandes coupées ${JSON.stringify(metrics.fixed_cuts)}`);
            const utility = await cdp.evaluate("(() => { const h = document.getElementById('arcadeSessionHud'); const r = h.getBoundingClientRect(); return { floating: h.classList.contains('arcade-session-hud--floating'), height: r.height, top: r.top }; })()");
            if (utility.floating && (utility.height > 76 || utility.top > 56)) problems.push(`bandeau Coins disproportionné ${JSON.stringify(utility)}`);
            if (name.startsWith("common-")) {
              const shell = await cdp.evaluate("(() => { const d = document.getElementById('arcadeGameShellDialog'); const r = d.getBoundingClientRect(); return { panels: [...d.querySelectorAll('[data-shell-panel]')].filter(p => getComputedStyle(p).display !== 'none').length, top: r.top, bottom: r.bottom }; })()");
              if (shell.panels !== 1 || shell.top < -2 || shell.bottom > viewport.height + 2) problems.push(`menu commun hors cadre ${JSON.stringify(shell)}`);
            }
            if (item.route.includes("demineur") && name === "expert") {
              const grid = await cdp.evaluate("(() => { const s = document.querySelector('.board-scroll'); s.scrollLeft = s.scrollWidth; const last = document.querySelector('#board').lastElementChild.getBoundingClientRect(); const frame = s.getBoundingClientRect(); return { right: last.right, limit: frame.right, pageOverflow: document.documentElement.scrollWidth - innerWidth }; })()");
              if (grid.right > grid.limit + 2 || grid.pageOverflow > 2) problems.push(`dernière colonne inaccessible ${JSON.stringify(grid)}`);
            }
            if (item.route.includes("cyberfind") && name === "game") {
              const zoom = await cdp.evaluate("(() => { const v = document.getElementById('viewport'), w = document.getElementById('world'), r = v.getBoundingClientRect(); const x = r.width / 2, y = r.height / 2; const before = new DOMMatrix(getComputedStyle(w).transform); v.dispatchEvent(new WheelEvent('wheel', {clientX: r.left + x, clientY: r.top + y, deltaY: -100, cancelable: true})); const after = new DOMMatrix(getComputedStyle(w).transform); return {x: Math.abs((x - before.e) / before.a - (x - after.e) / after.a), y: Math.abs((y - before.f) / before.d - (y - after.f) / after.d)}; })()");
              if (zoom.x > .1 || zoom.y > .1) problems.push(`zoom décalé du pointeur ${JSON.stringify(zoom)}`);
            }
            if (item.canvas) {
              const rect = await cdp.evaluate(`(() => { const c = document.querySelector(${JSON.stringify(item.canvas)}); const r = c.getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}; })()`);
              if (rect.left < -2 || rect.right > viewport.width + 2 || rect.top < 56 || rect.bottom > viewport.height + 2) problems.push(`terrain hors écran ${JSON.stringify(rect)}`);
            }
            checks += 1;
            const captureSuccess = process.env.ARCADE_CAPTURE_GAME && item.route.includes(process.env.ARCADE_CAPTURE_GAME)
              && name === "game" && [390, 1366].includes(viewport.width);
            if (problems.length || captureSuccess) {
              const label = `${item.route} ${viewport.width}×${viewport.height} ${name}`;
              if (problems.length) issues.push(`${label}: ${problems.join("; ")}`);
              fs.mkdirSync(screenshotDir, { recursive: true });
              const screenshot = await cdp.send("Page.captureScreenshot", { format: "png" });
              const filename = `${path.basename(path.dirname(item.route))}-${viewport.width}-${name}.png`;
              fs.writeFileSync(path.join(screenshotDir, filename), Buffer.from(screenshot.data, "base64"));
            }
          } catch (error) {
            issues.push(`${item.route} ${viewport.width}×${viewport.height} ${name}: ${error.message}`);
          }
        }
      }
      console.log(`Responsive : ${viewport.width}×${viewport.height}, ${checks} états contrôlés.`);
    }
    if (issues.length) {
      console.error(issues.join("\n"));
      console.error(`Captures : ${screenshotDir}`);
      if (process.env.ARCADE_LAYOUT_REPORT_ONLY !== "1") process.exitCode = 1;
    } else {
      console.log(`Recette responsive : ${checks} états sans débordement, collision de commandes ni terrain coupé.`);
    }
  } finally {
    cdp?.close();
    browser.kill();
    server?.kill();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
