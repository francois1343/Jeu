"use strict";
// Run with CHROME_PATH=/path/to/chrome node tests/mobile-discovery-browser.test.js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { DevTools, retry } = require("../scripts/generate-ux-audit.js");
const root = path.resolve(__dirname, "..");
const chrome = process.env.CHROME_PATH;
assert(chrome && fs.existsSync(chrome), "Définir CHROME_PATH vers Chrome ou Chromium");
const base = "http://127.0.0.1:4182";
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "arcade-mobile-"));
  const server = spawn("python", ["-m", "http.server", "4182", "--bind", "127.0.0.1"], { cwd: root, stdio: "ignore" });
  const browser = spawn(chrome, ["--headless=new", "--remote-debugging-port=9392", `--user-data-dir=${profile}`, "--no-first-run", "--mute-audio", "about:blank"], { stdio: "ignore" });
  let cdp, checks = 0;
  try {
    await retry(async () => assert((await fetch(base)).ok));
    const target = await retry(async () => {
      const pages = await (await fetch("http://127.0.0.1:9392/json/list")).json();
      const page = pages.find(p => p.type === "page"); assert(page); return page;
    });
    cdp = new DevTools(target.webSocketDebuggerUrl); await cdp.connect();
    await cdp.send("Page.enable"); await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    const check = async (expression, message) => { assert(await cdp.evaluate(expression), message); checks++; };
    const click = selector => cdp.evaluate(`document.querySelector(${JSON.stringify(selector)}).click(); true`);
    const search = text => cdp.evaluate(`(() => { const input = document.getElementById('gameSearch'); input.value=${JSON.stringify(text)}; input.dispatchEvent(new Event('input',{bubbles:true})); return true; })()`);
    const navigate = async route => {
      await cdp.send("Page.navigate", { url: `${base}/${route}` });
      await retry(async () => assert(await cdp.evaluate(`location.pathname===${JSON.stringify('/'+route)} && document.readyState==='complete'`)));
      await cdp.evaluate("document.fonts.ready.then(() => true)"); await pause(200);
      await cdp.evaluate("(() => { if(window.ArcadeGameShell?.isOpen) document.getElementById('arcadeShellTutorialSkip')?.click(); return true; })()");
    };
    for (const [width, height] of [[320,568],[390,844],[844,390],[800,1280],[1280,800]]) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 1000 });
      await navigate("index.html");
      await check("document.documentElement.scrollWidth <= innerWidth + 1 && document.documentElement.scrollHeight <= innerHeight + 1", `Catalogue sans débordement ${width}×${height}`);
      await check("document.querySelector('.catalog-pages').getBoundingClientRect().bottom < document.querySelector('.arcade-bottom-nav').getBoundingClientRect().top", "Pagination au-dessus de la navigation");
      await check(`Array.from(document.querySelectorAll('.game-card:not([hidden]) .btn-launch')).every(button => {
        const r=button.getBoundingClientRect(); return r.height>=44 && r.width>=44 && button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
      })`, "Boutons tactiles accessibles sans recouvrement");
      const titles = await cdp.evaluate("Array.from(document.querySelectorAll('.game-card .game-title'), n=>n.textContent.trim())");
      for (const title of titles) {
        await search(title);
        await check(`Array.from(document.querySelectorAll('.game-card:not([hidden]) .game-title')).some(n=>n.textContent.trim()===${JSON.stringify(title)})`, `Recherche ${title}`);
      }
      await search("");
      await check(`(() => { const seen=new Set();let guard=0;
        do {if(document.querySelector('.catalog-pages').getBoundingClientRect().bottom > document.querySelector('.arcade-bottom-nav').getBoundingClientRect().top) return false;
          document.querySelectorAll('.game-card:not([hidden])').forEach(n=>seen.add(n.dataset.game));
          const next=document.getElementById('catalogNext');if(next.disabled)break;next.click();
        } while(++guard<100);
        return seen.size===document.querySelectorAll('.game-card').length;
      })()`, "Chaque jeu accessible par pagination");
      await search("introuvablezzzz"); await check("!document.getElementById('catalogEmpty').hidden", "État vide visible"); await search("");
      await click(".catalog-filter-toggle");
      await check("document.getElementById('catalogFilters').matches(':modal')", "Filtres modaux");
      await click('[data-category-filter="dice"]');
      await check("!document.getElementById('activeFilterCount').hidden && [...document.querySelectorAll('.game-card:not([hidden])')].every(n=>n.dataset.categories.split(' ').includes('dice'))", "Filtre dés effectif");
      await click("#clearCatalogFilters"); await click(".filter-apply");
      for (const [trigger, dialog] of [["#compactSelection","arcadeSelection"],["#compactAccount","arcadeWallet"],[".arcade-bottom-nav [data-open-dialog]","settingsDialog"]]) {
        await click(trigger);
        await check(`document.getElementById('${dialog}').matches(':modal') && document.getElementById('${dialog}').contains(document.activeElement)`, `Ouverture et focus ${dialog}`);
        await cdp.send("Input.dispatchKeyEvent", { type:"keyDown", key:"Escape", code:"Escape", windowsVirtualKeyCode:27 });
        await cdp.send("Input.dispatchKeyEvent", { type:"keyUp", key:"Escape", code:"Escape", windowsVirtualKeyCode:27 });
        await check(`!document.getElementById('${dialog}').open`, `Fermeture ${dialog}`);
      }
      await click("#compactGames"); await check("document.activeElement.id!=='gameSearch'", "Retour au catalogue sans clavier forcé");
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: height, height: width, deviceScaleFactor: 1, mobile: true });
      await pause(250);
      await check("document.documentElement.scrollWidth <= innerWidth + 1 && document.documentElement.scrollHeight <= innerHeight + 1", "Rotation sans débordement du catalogue");
      await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 1000 });
      await navigate("games/reflex-lab/index.html");
      for (const mode of ["grid","piano","targets"]) {
        await click(`[data-mode="${mode}"]`);
        for(let hit=0;hit<6;hit++) {
          await cdp.evaluate(`document.querySelector(${JSON.stringify(mode === "grid" ? ".cell.target" : mode === "piano" ? ".lane:has(.tile)" : "#arena > .target")}).click(); true`);
        }
        await check("document.getElementById('arena').children.length===1 && document.getElementById('score').textContent==='60'", `Reflex ${mode} : six réussites, une seule arène`);
        await click("#quit");
      }
      console.log(`${width}×${height} : ${checks} contrôles cumulés`);
    }
    console.log(`Découverte mobile : ${checks} contrôles réussis.`);
  } finally { cdp?.close(); browser.kill(); server.kill(); }
}
main().catch(error => { console.error(error); process.exitCode=1; });
