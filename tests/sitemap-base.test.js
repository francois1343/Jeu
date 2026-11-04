"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {generate, siteBase} = require('../scripts/generate-sitemap');

test('sous-chemin, canonical et sitemap cohérents, génération répétable', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arcade-seo-'));
  try {
    for (const [name, meta] of [['index.html',''],['games/test/index.html',''],['admin/index.html',''],['private.html','<meta content="noindex,follow" name="robots">']]) {
      const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});
      fs.writeFileSync(file, `<html><head>${meta}\n</head><body>test</body></html>`);
    }
    const result=generate(root,'https://francois1343.github.io/Jeu');
    assert.deepEqual(result.locations,['https://francois1343.github.io/Jeu/games/test/index.html','https://francois1343.github.io/Jeu/']);
    const first=fs.readFileSync(path.join(root,'index.html'),'utf8');
    assert.match(first,/rel="canonical" href="https:\/\/francois1343.github.io\/Jeu\/"/);
    assert.match(fs.readFileSync(path.join(root,'robots.txt'),'utf8'),/Sitemap: https:\/\/francois1343.github.io\/Jeu\/sitemap.xml/);
    generate(root,'https://francois1343.github.io/Jeu/');
    assert.equal(fs.readFileSync(path.join(root,'index.html'),'utf8'),first);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
test('origine racine acceptée et URL ambiguës refusées',()=>{
  assert.equal(siteBase('https://example.com').href,'https://example.com/');
  for(const value of ['http://example.com/','https://u:p@example.com/','https://example.com/?x=1','https://example.com/#x'])assert.throws(()=>siteBase(value));
});
