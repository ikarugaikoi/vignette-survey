const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const C=require('../src/core'),bank=require('../src/demo-bank');
const html=()=>fs.readFileSync(path.join(__dirname,'../dist/index.html'),'utf8');
function boot(saved={},gas=null){
  const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
  const dom=new JSDOM(gas?html().replace("window.RUNTIME_MODE = 'local'","window.RUNTIME_MODE = 'gas'"):html(),{
    url:'http://localhost:4178',runScripts:'dangerously',virtualConsole:vc,
    beforeParse(w){w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
      for(const [k,v] of Object.entries(saved))w.localStorage.setItem(k,v);
      if(gas)w.google={script:{run:new Proxy({}, {get(_,name){
        if(name==='withSuccessHandler')return success=>new Proxy({},{get(_,next){if(next==='withFailureHandler')return failure=>new Proxy({},{get(_,method){return (...args)=>{Promise.resolve().then(()=>gas[method](...args)).then(success,e=>failure({message:e.message}));};}});}});
      }})}};
    }
  });return {dom,w:dom.window,d:dom.window.document,errors};
}
const ticks=async()=>{for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
async function click(d,id){const e=d.getElementById(id);assert.ok(e,'Missing element '+id);assert.equal(e.disabled,false,'Disabled '+id);e.click();await ticks();}
function answerAll(d,w,n=5){for(const q of C.QUESTIONS){const e=d.querySelector(`input[name="${q.id}"][value="${n}"]`);assert.ok(e);e.checked=true;e.dispatchEvent(new w.Event('change',{bubbles:true}));}}
function saved(w){return Object.fromEntries(Array.from({length:w.localStorage.length},(_,i)=>{const k=w.localStorage.key(i);return[k,w.localStorage.getItem(k)];}));}
const study=w=>JSON.parse(w.localStorage.getItem('vignette-prototype-v1'));

test('UI: complete ratings, navigate, reload and restore drafts; finish and inspect next respondent',async()=>{
  let b=boot();assert.match(b.d.body.textContent,/短い記事から/);await click(b.d,'begin');
  assert.equal(b.d.querySelectorAll('input[type=radio]').length,21);assert.equal(b.d.getElementById('next').disabled,true);
  const first=b.d.querySelector('.article p').textContent;
  answerAll(b.d,b.w,5);assert.equal(b.d.getElementById('next').disabled,false);
  // Refresh before moving to the next article: local draft must survive.
  const memory=saved(b.w);b.w.close();b=boot(memory);await click(b.d,'begin');
  assert.equal(b.d.querySelector('.article p').textContent,first);
  assert.equal(b.d.querySelectorAll('input:checked').length,3);assert.equal(b.d.getElementById('next').disabled,false);
  await click(b.d,'next');assert.notEqual(b.d.querySelector('.article p').textContent,first);await click(b.d,'prev');
  assert.equal(b.d.querySelector('.article p').textContent,first);assert.equal(b.d.querySelectorAll('input:checked').length,3);
  await click(b.d,'studioToggle');assert.match(b.d.body.textContent,/27条件・重複なし/);
  await click(b.d,'simulate');assert.match(b.d.getElementById('simulation').textContent,/最少250回／最多250回/);
  await click(b.d,'autoFill');assert.ok(b.d.getElementById('submit'));await click(b.d,'submit');
  assert.match(b.d.body.textContent,/27篇すべての回答をこの端末に保存しました/);
  assert.equal(Object.values(study(b.w).sessions)[0].status,'submitted');
  await click(b.d,'anotherDone');assert.equal(Object.values(study(b.w).sessions).length,2);
  const [a,c]=Object.values(study(b.w).sessions);assert.notEqual(a.token,c.token);assert.equal(a.blockId,c.blockId);assert.notEqual(a.slot,c.slot);
  assert.deepEqual(b.errors,[]);b.w.close();
});

test('UI: invalid materials are rejected; a valid bank creates a new version without deleting old answers',async()=>{
  const b=boot();await click(b.d,'studioToggle');const old=Object.values(study(b.w).sessions)[0];
  b.d.getElementById('bankInput').value='[]';await click(b.d,'importBank');assert.match(b.d.getElementById('error').textContent,/108件必要/);
  b.d.getElementById('bankInput').value=JSON.stringify(bank.map(x=>({...x,id:x.id.replace('DEMO-','STIM-')})));
  await click(b.d,'importBank');const sessions=Object.values(study(b.w).sessions);assert.equal(sessions.length,2);
  assert.equal(sessions[0].id,old.id);assert.notEqual(sessions[1].version,old.version);assert.equal(sessions[1].demo,false);
  assert.deepEqual(b.errors,[]);b.w.close();
});

test('cloud UI: a failed save stays on the article; retry succeeds and researcher tools are hidden',async()=>{
  let fail=true,state=null;
  const backend={getStudyInfo:()=>({title:'記事印象調査',demo:true,questions:C.QUESTIONS}),startSession:t=>{
    state={id:'TEST-P',token:t,version:'test',blockId:'TEST-B',slot:0,seed:12,items:C.allocateBlock(bank,12)[0],questions:C.QUESTIONS,answers:{},position:0,revision:0,status:'in_progress',demo:true};return structuredClone(state);
  },saveSession:(t,revision,answers,position,finalize)=>{if(fail)throw new Error('接続できませんでした。再試行してください。');assert.equal(revision,state.revision);state={...state,answers,position,revision:revision+1,status:finalize?'submitted':'in_progress'};return structuredClone(state);}};
  const b=boot({},backend);await ticks();assert.equal(b.d.getElementById('studioToggle').hidden,true);await click(b.d,'begin');
  const first=b.d.querySelector('.article p').textContent;answerAll(b.d,b.w);await click(b.d,'next');
  assert.equal(b.d.querySelector('.article p').textContent,first);assert.match(b.d.getElementById('error').textContent,/接続できません/);
  assert.equal(state.revision,0);fail=false;await click(b.d,'next');assert.equal(state.revision,1);assert.equal(state.position,1);
  assert.notEqual(b.d.querySelector('.article p').textContent,first);assert.deepEqual(b.errors,[]);b.w.close();
});

test('UI: revised questions start a separate preview, preserving legacy answers and their original question text',async()=>{
  let b=boot();await click(b.d,'begin');
  const store=study(b.w),oldToken=b.w.localStorage.getItem('vignette-prototype-v1-active');
  const old=store.sessions[oldToken],item=old.items[0];
  old.questions[1]={id:'envy',label:'この人物の経済的な状況を、どの程度うらやましいと感じますか。',low:'まったく感じない',high:'非常に強く感じる'};
  old.answers={[item.id]:{envy:6}};
  delete store.blocks[0].questionSignature;
  b.w.localStorage.setItem('vignette-prototype-v1',JSON.stringify(store));
  const memory=saved(b.w);b.w.close();b=boot(memory);
  assert.match(b.d.getElementById('begin').textContent,/更新された質問で試す/);
  await click(b.d,'begin');
  const result=study(b.w),newToken=b.w.localStorage.getItem('vignette-prototype-v1-active');
  assert.notEqual(newToken,oldToken);assert.deepEqual(result.sessions[oldToken],old);
  assert.notEqual(result.sessions[newToken].blockId,old.blockId);
  assert.deepEqual(result.sessions[newToken].answers,{});
  assert.match(b.d.querySelector('.ratings').textContent,/経済的に恵まれている/);
  assert.match(b.d.querySelector('.ratings').textContent,/身体的に親密な場面/);
  assert.doesNotMatch(b.d.querySelector('.ratings').textContent,/うらやましい|具体的に書かれている/);
  answerAll(b.d,b.w);await click(b.d,'next');
  assert.deepEqual(Object.keys(study(b.w).sessions[newToken].answers[result.sessions[newToken].items[0].id]).sort(),['economic_advantage','intimacy_imagery','wrongness']);
  assert.deepEqual(b.errors,[]);b.w.close();
});
