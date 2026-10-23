/* Actual GSI tiles + isolated failure fixtures. Browser emulation, not iPhone device QA. */
const {chromium,webkit}=require(process.env.SEABORNIA_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const url=process.env.SEABORNIA_URL||'http://127.0.0.1:8765/',out=process.env.SEABORNIA_QA_DIR||'/tmp/seastyle-v10-maps',results=[];
(async()=>{
 await fs.mkdir(out,{recursive:true});
 for(const engine of (process.env.SEABORNIA_BROWSERS||'chromium,webkit').split(',')){
  const b=await {chromium,webkit}[engine].launch({headless:true,...(engine==='chromium'?{channel:'chrome'}:{})}),ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'ja-JP',reducedMotion:'reduce',serviceWorkers:'block'}),p=await ctx.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(12000);
  const shot=n=>p.screenshot({path:path.join(out,engine+'-'+n+'.png')});
  const view=async()=>p.locator('#oceanSVG').getAttribute('viewBox');
  async function check(label,fn){try{await fn();results.push({engine,label,status:'pass'});console.log('PASS',engine,label)}catch(e){results.push({engine,label,status:'fail',error:e.message});await shot('FAILED');throw e}}
  const prefs=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('seabornia-workspaces-v1')));
  const open=async id=>{await p.locator('#destinationBtn').click();await p.locator('[data-region=all]').click();await p.locator('#clearDestinationFilters').click();await p.locator('[data-card="'+id+'"] button').click();await p.locator('#openMarinaWorkspace').click();await p.waitForFunction(id=>JSON.parse(localStorage.getItem('seabornia-workspaces-v1')).activeMarinaId===id,id)};
  try{
   await p.goto(url);await p.locator('[data-area=kamegi]').waitFor();
   await check('GSI standard map, labels, attribution and responsive metric scale',async()=>{
    await p.waitForFunction(()=>document.querySelector('#geographicMap .leaflet-tile-loaded'));
    assert.match(await p.locator('#basemapStatus').innerText(),/標準地図/);assert.match(await p.locator('#mapScale').innerText(),/m/);
    assert.ok(await p.locator('#mapTileAttribution a').isVisible());await shot('standard');
   });
   await check('backgrounds and independent overlays preserve the geographic camera and open sheet',async()=>{
    await p.locator('[data-area=kamegi]').click();await p.waitForTimeout(60);const before=await view();
    for(const base of ['pale','photo','diagram','standard']){
     await p.locator('#layersBtn').click();await p.locator('[data-basemap='+base+']').click();assert.equal(await view(),before);assert.ok(await p.locator('#selectedSheet').isVisible());assert.equal(await p.locator('[data-basemap='+base+']').getAttribute('aria-pressed'),'true');
     if(base==='photo')await shot('aerial-layers-sheet');await p.locator('#layersBtn').click();
    }
    await p.locator('#layersBtn').click();await p.locator('.layer[data-layer=depth]').click();await p.locator('#depthOpacity').fill('0.35');await p.locator('#depthOpacity').dispatchEvent('input');
    assert.equal(await p.locator('.layer[data-layer=spots]').getAttribute('aria-pressed'),'true');assert.ok(await p.locator('#selectedSheet').isVisible());await shot('independent-overlays');await p.locator('#layersBtn').click();await p.locator('.sheetClose').click();
   });
   await check('all tile failures fall back with markers, controls and selection intact',async()=>{
    await ctx.route('https://cyberjapandata.gsi.go.jp/**',r=>r.abort());await p.locator('#layersBtn').click();await p.locator('[data-basemap=photo]').click();await p.locator('#retryBasemap').click();await p.locator('#layersBtn').click();await p.locator('#zoomIn').click();await p.locator('#zoomIn').click();
    await p.waitForFunction(()=>/取得できません|応答がありません/.test(document.querySelector('#basemapStatus').textContent),null,{timeout:18000});
    assert.equal(await p.locator('.mapShell.detailedMap').count(),0);assert.equal(await p.locator('#spots [data-area]').count(),10);await p.locator('#zoomIn').click();assert.equal(await p.locator('#actionDialog').isVisible(),false);await shot('tile-failure-fallback');await ctx.unroute('https://cyberjapandata.gsi.go.jp/**');
   });
   await check('layers and camera remember separate marina workspaces and survive reload',async()=>{
    await p.locator('#layersBtn').click();await p.locator('[data-basemap=pale]').click();await p.locator('#layersBtn').click();await p.locator('#zoomIn').click();await p.waitForTimeout(500);const home=await prefs();assert.equal(home.workspaces['J14-0170'].map.base,'pale');assert.ok(home.workspaces['J14-0170'].camera.lat);
    await open('J14-0130');await p.locator('#layersBtn').click();await p.locator('[data-basemap=diagram]').click();await p.locator('#layersBtn').click();await p.waitForTimeout(450);await open('J14-0170');await p.locator('#layersBtn').click();assert.equal(await p.locator('[data-basemap=pale]').getAttribute('aria-pressed'),'true');await p.locator('#layersBtn').click();await p.reload();await p.locator('#layersBtn').click();assert.equal(await p.locator('[data-basemap=pale]').getAttribute('aria-pressed'),'true');await p.locator('#layersBtn').click();
   });
   await check('rich reports paginate, fish links filter both ways, and reference classes stay distinct',async()=>{
    await open('J14-0130');await p.locator('.nav[data-tab=latest]:visible').click();await p.locator('[data-days=all]').click();
    assert.equal(await p.locator('#reportList .reportCard').count(),40);await p.locator('#moreReports').click();assert.equal(await p.locator('#reportList .reportCard').count(),80);
    await p.locator('#reportKind').selectOption('rental');assert.ok((await p.locator('#reportList .reportCard .tag').allInnerTexts()).some(t=>t.includes('レンタル')));
    await p.locator('#reportList [data-report-fish]').first().click();assert.ok(await p.locator('.localFishEvidence').isVisible());const fish=await p.locator('#modalContent h2').innerText();await p.locator('#fishReportLink').click();assert.equal(await p.locator('#reportFish').inputValue(),fish);assert.ok(await p.locator('#reportList .reportCard').count());await shot('rich-local-reports');
    await p.locator('#clearReportFilters').click();assert.equal(await p.locator('#reportFish').inputValue(),'');await p.locator('#localResearch summary').click();assert.match(await p.locator('#localResearchBody').innerText(),/2024-10-24/);
   });
   await check('regional discovery also renders detailed tiles without moving private records',async()=>{
    await p.locator('#destinationBtn').click();await p.locator('[data-region=okinawa]').click();await p.waitForFunction(()=>document.querySelector('.regionalMapCanvas .leaflet-tile-loaded'));assert.ok(await p.locator('.regionalMapCredit').isVisible());await shot('okinawa-destinations');await p.locator('#destinationClose').click();
    assert.equal((await prefs()).activeMarinaId,'J14-0130');assert.deepEqual(errors,[]);
   });
  }finally{await b.close();await fs.writeFile(path.join(out,'maps.json'),JSON.stringify(results,null,2))}
 }
})().catch(e=>{console.error(e);process.exitCode=1});
