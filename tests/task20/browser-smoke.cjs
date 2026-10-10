const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const root = path.resolve(__dirname, '../../project1/src/main/resources/static');
const out = process.env.BROWSER_TEST_OUTPUT || path.join(require('node:os').tmpdir(), 'cs3300-task20-browser');
// These fixtures exercise the production HTML/auth/search modules without calling live services.
const mapsFixture = `
class Bounds {
  constructor(bounds = {north:34,south:33,east:-84,west:-85}) { this.bounds = bounds; }
  toJSON() { return {...this.bounds}; }
  contains({lat,lng}) { const b=this.bounds; return lat>=b.south && lat<=b.north && lng>=b.west && lng<=b.east; }
}
window.requests = [];
class MapElement extends HTMLElement {
  connectedCallback() {
    this.style.background = '#dce7d7';
    this.innerHTML = '<p style="padding:2rem;color:#19332e">Map fixture — browser layout and interaction check</p>';
    this.innerMap = {
      center:{lat:33.7756,lng:-84.3963}, zoom:13, bounds:new Bounds(),
      getCenter(){return this.center;},setCenter(value){this.center=value;},
      getZoom(){return this.zoom;},setZoom(value){this.zoom=value;},getBounds(){return this.bounds;}
    };
  }
}
class Marker extends EventTarget {constructor(options){super();Object.assign(this,options);}}
window.google = {maps:{
  importLibrary:async()=>({}), LatLngBounds:Bounds,
  marker:{AdvancedMarkerElement:Marker},
  InfoWindow:class{setContent(){} open(){} close(){}},
  Geocoder:class{geocode(request,cb){cb([{formatted_address:request.address,geometry:{location:{lat:()=>33.78,lng:()=>-84.4}}}], 'OK');}},
  places:{
    RankBy:{DISTANCE:'distance',PROMINENCE:'prominence'},PlacesServiceStatus:{OK:'OK',ZERO_RESULTS:'ZERO_RESULTS'},
    PlacesService:class{
      nearbySearch(request,cb){window.requests.push(request);setTimeout(()=>cb([{place_id:'fixture-cafe',name:'Fixture Cafe',vicinity:'Atlanta',types:['cafe'],geometry:{location:{lat:33.78,lng:-84.4}}}], 'OK'),20);}
      textSearch(request,cb){this.nearbySearch(request,cb);}
    }
  }
}};
customElements.define('gmp-map',MapElement);
`;
(async()=>{
 await fs.mkdir(out,{recursive:true});
 const server = http.createServer(async(req,res)=>{
   const name = new URL(req.url,'http://localhost').pathname;
   if(name==='/api/firebase-config'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({apiKey:'fixture'}));return;}
   try {
     const file = path.resolve(root,'.'+name);
     if(!file.startsWith(root+'/')) throw new Error('Invalid file');
     const content = await fs.readFile(file);
     res.setHeader('Content-Type', {'.html':'text/html','.js':'text/javascript','.css':'text/css'}[path.extname(file)] || 'application/octet-stream');res.end(content);
   } catch {res.statusCode=404;res.end('Not found');}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try {
  browser = await chromium.launch({headless:true,channel:'chrome'});
  const context = await browser.newContext({viewport:{width:1440,height:900}});
  await context.route('https://maps.googleapis.com/**',route=>route.fulfill({contentType:'text/javascript',body:mapsFixture}));
  await context.route('https://identitytoolkit.googleapis.com/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({users:[{localId:'browser-fixture-user',email:'fixture@example.test'}]})}));
  await context.addInitScript(()=>sessionStorage.setItem('firebaseIdToken','fixture-token'));
  const page = await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const url=`http://127.0.0.1:${server.address().port}/homepage.html`;
  await page.goto(url);
  await page.locator('body').waitFor({state:'visible'});
  await page.locator('.search-history summary').click();
  assert.equal(await page.locator('.search-history-empty').isVisible(),true);
  await page.locator('#location').fill('33.78, -84.4');
  await page.locator('#place-keyword').fill('coffee');
  await page.locator('.advanced-settings summary').click();
  await page.locator('#radius').fill('1250');
  await page.locator('#price').selectOption('2');
  await page.locator('#place-type').selectOption('cafe');
  await page.locator('#open-now').check();
  await page.locator('.map-search-button').click();
  await page.waitForFunction(()=>document.querySelectorAll('.search-history-entry').length===1);
  await page.locator('.advanced-settings summary').click();
  await page.screenshot({path:out+'/desktop.png',fullPage:true});
  const resultBounds=await page.locator('.location-results').boundingBox();
  assert.ok(resultBounds.y+resultBounds.height<=900);
  await page.reload();
  await page.locator('.search-history summary').click();
  assert.equal(await page.locator('.search-history-entry').count(),1);
  await page.locator('.search-history-replay').click();
  await page.waitForFunction(()=>window.requests.length===1);
  assert.equal(await page.locator('#place-keyword').inputValue(),'coffee');
  assert.equal(await page.locator('#radius').inputValue(),'1250');
  assert.equal(await page.locator('#price').inputValue(),'2');
  assert.equal(await page.locator('#open-now').isChecked(),true);
  await page.waitForFunction(()=>document.querySelector('.location-result-button')!==null);
  assert.equal(await page.locator('.search-history-entry').count(),1);
  const second=await context.newPage();await second.goto(url);
  await second.locator('.search-history summary').click();
  assert.equal(await second.locator('.search-history-entry').count(),1);
  await page.locator('.search-history-clear').click();
  await second.waitForFunction(()=>document.querySelectorAll('.search-history-entry').length===0);
  for(let i=0;i<12;i++){
    await page.locator('#location').fill(`${33.78+i/1000}, -84.4`);
    await page.locator('.map-search-button').click();
    await page.waitForFunction(i=>window.requests.length===i+2,i);
    await page.waitForFunction(query=>document.querySelector('.search-history-entry strong')?.textContent===query, `${33.78+i/1000}, -84.4`);
    assert.equal(await page.locator('.search-history-entry').count(),Math.min(i+1,10));
  }
  await page.waitForFunction(()=>document.querySelectorAll('.search-history-entry').length===10);
  await page.locator('.search-history-remove').first().click();
  assert.equal(await page.locator('.search-history-entry').count(),9);
  await page.reload();await page.locator('.search-history summary').click();
  assert.equal(await page.locator('.search-history-entry').count(),9);
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:out+'/mobile.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const mobileSearch=await page.locator('.location-search').boundingBox();
  const mobileResults=await page.locator('.location-results').boundingBox();
  assert.ok(mobileSearch.y+mobileSearch.height<=mobileResults.y);
  await page.locator('.advanced-settings summary').click();
  await page.setViewportSize({width:1280,height:720});
  await page.screenshot({path:out+'/desktop-expanded.png',fullPage:true});
  const bounds=await page.locator('.location-results').boundingBox();
  assert.ok(bounds.y+bounds.height<=720);
  assert.deepEqual(errors,[]);
  const summary={passed:['empty state','save filters','reload persistence','replay','same-query dedupe','cross-tab clear','10-entry cap','remove persistence','390px no horizontal overflow','desktop advanced/history bounded'],pageErrors:errors,screenshots:['desktop.png','mobile.png','desktop-expanded.png']};
  await fs.writeFile(out+'/result.json',JSON.stringify(summary,null,2));
  console.log(JSON.stringify(summary));
 } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
