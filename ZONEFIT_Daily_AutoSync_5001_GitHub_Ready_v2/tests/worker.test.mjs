import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validAustralianProductURL, filterProducts, validateCapture, runWorker} from '../scripts/worker-core.mjs';

const product = {id:'ascolour-p02-5001',code:'5001',url:'https://www.ascolour.com.au/staple-tee-5001/',name:'Staple Tee'};
const goodCapture = () => ({
  records: Array.from({length: 68}, (_,ci) =>
    ['XSM','SML','MED','LRG','XLG','2XL','3XL','4XL'].map((size,si) =>
      ({colour:`Colour ${ci+1}`,size,quantity:String(ci*2+si+1),status:'in_stock',isMinimum:false})
    )
  ).flat(),
  diagnostics:{matchedCells:544}
});
function harness(capture = goodCapture(), {redirect=null,authResponse=200}={}) {
  const calls=[];
  const fetcher = async (url,req) => {
    const u = new URL(url),action = u.searchParams.get('action');
    calls.push({action,method:req.method,body:req.body?JSON.parse(req.body):null});
    if(authResponse !== 200) return new Response(JSON.stringify({error:'Authorization failed'}), {status:authResponse});
    if(action==='worker-products') return Response.json({products:[product]});
    if(action==='worker-capture') return Response.json({observed:capture.records.length,changes:4});
    if(action==='worker-report') return Response.json({recorded:true});
    throw new Error('Unexpected API action '+action);
  };
  let clicked=false,closed=false;
  const page = {
    goto: async() => {}, url: () => redirect || product.url,
    waitForTimeout: async() => {},
    getByText:() => ({count: async()=>1,first:()=>({click:async()=>{clicked=true;}})}),
    addScriptTag:async({content})=>{assert.match(content,/zonefitCollectVariants/)},
    evaluate:async()=>capture
  };
  const context = {newPage:async()=>page,close:async()=>{closed=true}};
  const browser={newContext:async()=>context,close:async()=>{closed=true}};
  return {fetcher, calls, browserFactory:async()=>browser, wasClicked:()=>clicked, wasClosed:()=>closed};
}
const common = {site:'https://zonefit-test.netlify.app',token:'test-worker-secret',collector:'window.zonefitCollectVariants = function(){}',maxStyles:1,waitBetween:async()=>{},log:{log:()=>{},error:()=>{}}};

test('only the Australian matching style URL is accepted',()=>{
 assert.equal(validAustralianProductURL(product.url,'5001'),true);
 for(const url of ['http://www.ascolour.com.au/staple-tee-5001/','https://ascolour.com/staple-tee-5001/','https://www.ascolour.com.au/maple-tee-4001/','https://www.ascolour.com.au.evil.example/staple-tee-5001/'])
   assert.equal(validAustralianProductURL(url,'5001'),false);
});

test('pilot only selects style 5001, future URLs can be added later',()=>{
 const other={...product,id:'ascolour-p13-4001',code:'4001',url:'https://www.ascolour.com.au/maple-tee-4001/'};
 assert.deepEqual(filterProducts([other,product],'5001',2).map(p=>p.code),['5001']);
 assert.deepEqual(filterProducts([other,product],'all',2).map(p=>p.code),['4001','5001']);
});

test('capture quality: rejects incomplete stock grids and ambiguous 0+',()=>{
 const full=goodCapture();
 assert.equal(validateCapture(full,product).cells,544);
 assert.throws(()=>validateCapture({records:full.records.slice(0,15)},product),/Incomplete supplier grid/);
 assert.throws(()=>validateCapture({records:full.records.map(r=>({...r,quantity:'0+'}))},product),/Incomplete supplier grid/);
 const withAmbiguous={records:[...full.records,...Array.from({length:40},(_,i)=>({colour:'Special',size:'MED',quantity:'0+'}))]};
 assert.equal(validateCapture(withAmbiguous,product).cells,544);
});

test('preview mode checks actual grid but cannot update inventory',async()=>{
 const h=harness();const result=await runWorker({...common,...h,mode:'preview'});
 assert.equal(result.previewed,1);assert.equal(result.saved,0);assert.equal(result.failed,0);
 assert.equal(h.calls.filter(x=>x.action==='worker-capture').length,0);
 assert.equal(h.calls.filter(x=>x.action==='worker-report').length,0);
 assert.ok(h.wasClicked());assert.ok(h.wasClosed());
});

test('sync mode submits verified colour/size snapshot to existing Netlify API',async()=>{
 const h=harness();const result=await runWorker({...common,...h,mode:'sync'});
 assert.equal(result.saved,1);assert.equal(result.failed,0);
 const post=h.calls.find(x=>x.action==='worker-capture');
 assert.equal(post.method,'POST');assert.equal(post.body.productId,product.id);
 assert.equal(post.body.payload.records.length,544);
 assert.equal(post.body.payload.source,product.url);
 assert.ok(!Number.isNaN(new Date(post.body.payload.capturedAt).getTime()));
});

test('failed extraction preserves existing stock; reports failure without capture upload',async()=>{
 const h=harness({records:[{colour:'Black',size:'MED',quantity:'3'}]});
 const result=await runWorker({...common,...h,mode:'sync'});
 assert.equal(result.failed,1);assert.equal(result.saved,0);
 assert.equal(h.calls.filter(x=>x.action==='worker-capture').length,0);
 assert.equal(h.calls.filter(x=>x.action==='worker-report').length,1);
});

test('bad redirects never import, and the worker reports the cause',async()=>{
 const h=harness(goodCapture(),{redirect:'https://www.ascolour.com.au/login/'});
 const result=await runWorker({...common,...h});
 assert.equal(result.failed,1);
 assert.equal(h.calls.filter(x=>x.action==='worker-capture').length,0);
 assert.match(result.products[0].message,/redirected/);
});

test('missing/mismatched worker credentials stop before launching browser',async()=>{
 const h=harness(goodCapture(),{authResponse:401});
 await assert.rejects(runWorker({...common,...h}),/rejected ZONEFIT_WORKER_TOKEN/);
 assert.equal(h.calls.length,1);
});


test('pilot schedule uses Sydney timezone and GitHub manual preview', async () => {
  const yml = await readFile(
    new URL('../.github/workflows/zonefit-daily-stock.yml', import.meta.url),
    'utf8'
  );

  assert.match(yml, /workflow_dispatch:/);
  assert.match(yml, /default:\s*preview/);
  assert.match(yml, /ZONEFIT_STYLE_CODES:\s*['"]?5001['"]?/);
  assert.match(yml, /TZ:\s*Australia\/Sydney/);
  assert.match(yml, /cron:\s*['"]?17 19 \* \* \*/);
});
