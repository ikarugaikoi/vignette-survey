const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const C=require('../src/core'),bank=require('../src/demo-bank');
const html=()=>fs.readFileSync(path.join(__dirname,'../dist/index.html'),'utf8');
function boot(saved={},gas=null){
  const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
  const dom=new JSDOM(gas?html().replace("window.RUNTIME_MODE = 'local'","window.RUNTIME_MODE = 'gas'"):html(),{
    url:'http://localhost:4180',runScripts:'dangerously',virtualConsole:vc,
    beforeParse(w){w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
      for(const [k,v] of Object.entries(saved))w.localStorage.setItem(k,v);
      if(gas)w.google={script:{run:new Proxy({}, {get(_,name){
        if(name==='withSuccessHandler')return success=>new Proxy({},{get(_,next){if(next==='withFailureHandler')return failure=>new Proxy({},{get(_,method){return (...args)=>{Promise.resolve().then(()=>gas[method](...args)).then(success,e=>failure({message:e.message}));};}});}});
      }})}};
    }
  });return {dom,w:dom.window,d:dom.window.document,errors};
}
const ticks=async()=>{await new Promise(r=>setTimeout(r,2));for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));};
async function click(d,id){const e=d.getElementById(id);assert.ok(e,'Missing element '+id);assert.equal(e.disabled,false,'Disabled '+id);e.click();await ticks();if(['begin','fresh'].includes(id)&&d.getElementById('genderForm')){d.querySelector('input[name=gender][value=female]').click();d.getElementById('genderNext').click();await ticks();}}
function answerAll(d,w,n=5){for(const q of C.QUESTIONS){const e=d.querySelector(`input[name="${q.id}"][value="${q.type==='binary'?1:n}"]`);assert.ok(e);e.checked=true;e.dispatchEvent(new w.Event('change',{bubbles:true}));}}
function saved(w){return Object.fromEntries(Array.from({length:w.localStorage.length},(_,i)=>{const k=w.localStorage.key(i);return[k,w.localStorage.getItem(k)];}));}
const {runtime}=require('./helpers.cjs');
const order=d=>Array.from(d.querySelectorAll('fieldset input[value="1"]'),x=>x.name);
test('cloud UI completes all 54, retains randomized questions after reload, pauses and submits 216 rows',async()=>{
  const {context:c,sheets}=runtime();let b=boot({},c);await ticks();await click(b.d,'begin');
  const first=b.d.querySelector('.article p').textContent,qOrder=order(b.d);
  answerAll(b.d,b.w,5);const memory=saved(b.w);b.w.close();b=boot(memory,c);await ticks();await click(b.d,'begin');
  assert.equal(b.d.querySelector('.article p').textContent,first);assert.deepEqual(order(b.d),qOrder);assert.equal(b.d.querySelectorAll('input:checked').length,4);
  await click(b.d,'pause');assert.match(b.d.getElementById('app').textContent,/保存しました/);await click(b.d,'resume');
  for(let i=0;i<54;i++){
    assert.equal(b.d.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'),String(i));
    assert.deepEqual(order(b.d),qOrder);answerAll(b.d,b.w,(i%7)+1);await click(b.d,'next');
  }
  assert.equal(b.d.querySelectorAll('[data-review]').length,54);await click(b.d,'submit');
  assert.match(b.d.getElementById('app').textContent,/54件すべての回答を受け付けました/);assert.equal(sheets.get('Responses').rows.length,217);
  assert.deepEqual(b.errors,[]);b.w.close();
});
test('failed background save does not block navigation; online retry and fresh questions work',async()=>{
  const {context:c,sheets}=runtime();let fail=true;
  const gas={getStudyInfo:()=>c.getStudyInfo(),startSession:t=>c.startSession(t),saveDemographics:(...a)=>c.saveDemographics(...a),saveProgress:(...a)=>{if(fail)throw new Error('接続できません');return c.saveProgress(...a);}};
  const b=boot({},gas);await ticks();await click(b.d,'begin');const first=b.d.querySelector('.article p').textContent;
  answerAll(b.d,b.w);await click(b.d,'next');assert.notEqual(b.d.querySelector('.article p').textContent,first);assert.match(b.d.getElementById('app').textContent,/再試行/);
  assert.equal(b.d.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'),'1');
  fail=false;b.w.dispatchEvent(new b.w.Event('online'));await ticks();
  await click(b.d,'prev');assert.equal(b.d.querySelectorAll('input:checked').length,4);
  sheets.get('Questions').rows[1][1]='更新した質問文ですか。';
  await click(b.d,'studioToggle');await click(b.d,'fresh');assert.match(b.d.querySelector('.ratings').textContent,/更新した質問文/);
  assert.equal(sheets.get('Sessions').rows.length,3);assert.deepEqual(b.errors,[]);b.w.close();
});
test('local UI is usable and uses isolated storage from the 27-article edition',async()=>{
  const b=boot({'vignette-prototype-v1-active':'old-session'});await ticks();await click(b.d,'begin');
  assert.equal(b.d.querySelector('[role="progressbar"]').getAttribute('aria-valuemax'),'54');
  assert.equal(b.w.localStorage.getItem('vignette-prototype-v1-active'),'old-session');
  assert.ok(b.w.localStorage.getItem('vignette-balanced54-v2-active'));assert.deepEqual(b.errors,[]);b.w.close();
});
test('navigation renders immediately during slow saves and coalesces later pages without reverting answers',async()=>{
  const {context:c}=runtime();const pending=[];let concurrent=0,maxConcurrent=0;
  const gas={getStudyInfo:()=>c.getStudyInfo(),startSession:t=>c.startSession(t),saveDemographics:(...a)=>c.saveDemographics(...a),saveProgress:(...a)=>new Promise(resolve=>{
    concurrent++;maxConcurrent=Math.max(concurrent,maxConcurrent);
    pending.push({args:a,resolve:()=>{concurrent--;resolve(c.saveProgress(...a));}});
  })};
  const b=boot({},gas);await ticks();await click(b.d,'begin');
  answerAll(b.d,b.w,2);b.d.getElementById('next').click();
  assert.equal(b.d.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'),'1');
  await ticks();assert.equal(pending.length,1);
  answerAll(b.d,b.w,5);await click(b.d,'next');answerAll(b.d,b.w,6);
  assert.equal(pending.length,1);assert.equal(b.d.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'),'2');
  pending[0].resolve();await ticks();assert.equal(pending.length,2);
  assert.equal(b.d.querySelectorAll('input:checked').length,4);
  assert.equal(Object.keys(pending[1].args[2]).length,3);assert.equal(pending[1].args[3],2);
  pending[1].resolve();await ticks();assert.equal(maxConcurrent,1);
  const remote=c.startSession(pending[0].args[0]);assert.equal(remote.position,2);
  for(const q of remote.questions)assert.equal(remote.answers[remote.items[2].id][q.id],q.type==='binary'?1:6);
  assert.deepEqual(b.errors,[]);b.w.close();
});
test('reload restores edits made while a save was committed but its response was lost',async()=>{
  const {context:c}=runtime();let hold=true;
  const gas={getStudyInfo:()=>c.getStudyInfo(),startSession:t=>c.startSession(t),saveDemographics:(...a)=>c.saveDemographics(...a),saveProgress:(...a)=>{
    const ack=c.saveProgress(...a);return hold?new Promise(()=>{}):ack;
  }};
  let b=boot({},gas);await ticks();await click(b.d,'begin');answerAll(b.d,b.w,2);await click(b.d,'next');
  answerAll(b.d,b.w,7);const memory=saved(b.w);b.w.close();hold=false;
  b=boot(memory,gas);await ticks();await click(b.d,'begin');
  assert.equal(b.d.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'),'1');
  assert.equal(b.d.querySelectorAll('input:checked').length,4);assert.ok(Array.from(b.d.querySelectorAll('input:checked')).every(x=>x.value===(x.name==='read_more'?'1':'7')));
  await click(b.d,'pause');assert.match(b.d.getElementById('app').textContent,/保存しました/);assert.deepEqual(b.errors,[]);b.w.close();
});
test('final completion waits for server acknowledgement and does not allow edits after an uncertain submit',async()=>{
  const {context:c,sheets}=runtime();let finalResolve;
  const gas={getStudyInfo:()=>c.getStudyInfo(),startSession:t=>c.startSession(t),saveDemographics:(...a)=>c.saveDemographics(...a),saveProgress:(...a)=>a[4]?new Promise(resolve=>{finalResolve=()=>resolve(c.saveProgress(...a));}):c.saveProgress(...a)};
  const b=boot({},gas);await ticks();await click(b.d,'begin');
  for(let i=0;i<54;i++){answerAll(b.d,b.w);await click(b.d,'next');}
  await click(b.d,'submit');assert.ok(finalResolve);assert.doesNotMatch(b.d.getElementById('app').textContent,/ご回答ありがとうございました/);
  assert.equal(b.d.getElementById('submit').disabled,true);assert.equal(sheets.get('Responses').rows.length,1);
  finalResolve();await ticks();assert.match(b.d.getElementById('app').textContent,/ご回答ありがとうございました/);assert.equal(sheets.get('Responses').rows.length,217);
  b.w.close();
});
test('failed final acknowledgement keeps review locked until an idempotent retry confirms submission',async()=>{
  const {context:c,sheets}=runtime();let lose=true;
  const gas={getStudyInfo:()=>c.getStudyInfo(),startSession:t=>c.startSession(t),saveDemographics:(...a)=>c.saveDemographics(...a),saveProgress:(...a)=>{
    const ack=c.saveProgress(...a);if(a[4]&&lose){lose=false;throw new Error('回線が切れました');}return ack;
  }};
  const b=boot({},gas);await ticks();await click(b.d,'begin');
  for(let i=0;i<54;i++){answerAll(b.d,b.w);await click(b.d,'next');}
  await click(b.d,'submit');assert.match(b.d.getElementById('app').textContent,/回線が切れました/);
  assert.ok(Array.from(b.d.querySelectorAll('[data-review]')).every(x=>x.disabled));
  assert.equal(sheets.get('Responses').rows.length,217);
  await click(b.d,'submit');assert.match(b.d.getElementById('app').textContent,/ご回答ありがとうございました/);
  assert.equal(sheets.get('Responses').rows.length,217);b.w.close();
});
test('transient offline failure automatically retries and keeps new answers',async()=>{
  const {context:c}=runtime();let failures=1,calls=0;
  const gas={getStudyInfo:()=>c.getStudyInfo(),startSession:t=>c.startSession(t),saveDemographics:(...a)=>c.saveDemographics(...a),saveProgress:(...a)=>{
    calls++;if(failures-->0)throw new Error('offline');return c.saveProgress(...a);
  }};
  const b=boot({},gas);await ticks();await click(b.d,'begin');answerAll(b.d,b.w);await click(b.d,'next');
  assert.match(b.d.getElementById('saveNote').textContent,/再試行/);
  answerAll(b.d,b.w,6);await new Promise(r=>setTimeout(r,1100));await ticks();
  assert.ok(calls>=2);assert.match(b.d.getElementById('saveNote').textContent,/^保存済み$/);
  assert.equal(b.d.querySelectorAll('input:checked').length,4);b.w.close();
});
test('gender page comes before articles, other text survives reload, Q1 is first and No survives navigation',async()=>{
  const {context:c,sheets}=runtime();let b=boot({},c);await ticks();b.d.getElementById('begin').click();await ticks();
  assert.ok(b.d.getElementById('genderForm'));assert.equal(b.d.querySelector('.article'),null);
  await click(b.d,'genderNext');assert.match(b.d.getElementById('error').textContent,/性別/);
  b.d.querySelector('input[name=gender][value=other]').click();await click(b.d,'genderNext');assert.match(b.d.getElementById('error').textContent,/1〜100/);
  b.d.getElementById('genderOther').value='テスト記述';b.d.getElementById('genderOther').dispatchEvent(new b.w.Event('input',{bubbles:true}));
  const memory=saved(b.w);b.w.close();b=boot(memory,c);await ticks();b.d.getElementById('begin').click();await ticks();
  assert.equal(b.d.getElementById('genderOther').value,'テスト記述');await click(b.d,'genderNext');
  assert.equal(b.d.querySelector('fieldset input').name,'read_more');assert.equal(b.d.querySelectorAll('fieldset')[0].querySelectorAll('input').length,2);
  answerAll(b.d,b.w);const no=b.d.querySelector('input[name=read_more][value="0"]');no.click();await click(b.d,'next');await click(b.d,'prev');
  assert.equal(b.d.querySelector('input[name=read_more][value="0"]').checked,true);
  await click(b.d,'pause');assert.deepEqual(Array.from(sheets.get('Participants').rows[1].slice(2,4)),['その他','テスト記述']);b.w.close();
});
