(function () {
  'use strict';
  const C=StudyCore, cloud=window.RUNTIME_MODE==='gas';
  const STORE='vignette-balanced54-v2', TOKEN=STORE+'-active', DRAFT=STORE+'-draft-';
  const el=document.getElementById('app'), clone=x=>JSON.parse(JSON.stringify(x));
  let session=null,busy=false,studyInfo=null,sync=null;
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
  function on(id,fn){const x=document.getElementById(id);if(x)x.addEventListener('click',fn);}
  function readStore(){return JSON.parse(localStorage.getItem(STORE)||'{"sessions":{}}');}
  function callGas(name,...args){return new Promise((resolve,reject)=>google.script.run.withSuccessHandler(resolve).withFailureHandler(e=>reject(new Error(e.message||String(e))))[name](...args));}
  function loading(){el.innerHTML='<div class="loading"><div class="spinner"></div>回答画面を準備しています…</div>';}
  function showError(e){let box=document.getElementById('error');if(!box){box=document.createElement('div');box.id='error';box.className='error';box.setAttribute('role','alert');el.prepend(box);}box.textContent=e.message||String(e);box.scrollIntoView({block:'nearest'});}
  function focusPage(){window.scrollTo({top:0,behavior:'instant'});const h=el.querySelector('h1,[data-focus]');if(h){h.tabIndex=-1;h.focus({preventScroll:true});}}
  function persistDraft(){if(sync)sync.persist();}
  function syncStatus(){
    if(!sync)return;
    const s=sync.status(),message=s.conflict?'別のタブとの競合があります。下書きは端末に保持しています。':s.error?'この端末に保存済み。サーバーへの同期を再試行します。':(s.saving||s.dirty)?'':'保存済み';
    const note=document.getElementById('saveNote');if(note)note.textContent=message;
    document.getElementById('storageLabel').textContent='';
  }
  function updateBadge(){document.getElementById('modeBadge').hidden=true;document.getElementById('studioToggle').hidden=true;}
  async function start(t){
    if(cloud)return callGas('startSession',t);
    const store=readStore();if(store.sessions[t])return clone(store.sessions[t]);
    const seed=crypto.getRandomValues(new Uint32Array(1))[0],a=C.allocate54(DEMO_BANK,C.QUESTIONS,seed),now=new Date().toISOString();
    const s={id:'P-'+t.slice(0,16),token:t,seed,version:'local-balanced54-q1-gender-v2',items:a.items,questions:a.questions,requiresGender:true,demographics:null,answers:{},position:0,revision:0,status:'in_progress',demo:true,createdAt:now,updatedAt:now};
    store.sessions[t]=s;localStorage.setItem(STORE,JSON.stringify(store));return clone(s);
  }
  async function save(finalize){C.validateAnswers(session.items,session.questions,session.answers,finalize);await sync.flush(finalize);}
  function attachSync(next,draft){
    const controller=StudySync.create(next,{
      draft,requestId:token,validate:a=>C.validateAnswers(next.items,next.questions,a,false),
      persist:d=>{if(d===null)localStorage.removeItem(DRAFT+next.token);else localStorage.setItem(DRAFT+next.token,JSON.stringify(d));},
      onStatus:syncStatus,
      send:async p=>{
        if(cloud)return callGas('saveProgress',next.token,p.revision,p.answers,p.position,p.finalize,p.id);
        const store=readStore(),current=store.sessions[next.token];
        if(!current)throw new Error('回答セッションが見つかりません。');
        if(current.status!=='submitted'&&current.lastRequestId!==p.id){
          if(current.revision!==p.revision)throw new Error('別のタブで回答が更新されています。');
          current.answers=C.validateAnswers(current.items,current.questions,p.answers,p.finalize);current.position=p.position;
          current.revision++;current.lastRequestId=p.id;current.updatedAt=new Date().toISOString();
          if(p.finalize){current.status='submitted';current.completedAt=current.updatedAt;}
          localStorage.setItem(STORE,JSON.stringify(store));
        }
        return {revision:current.revision,status:current.status,lastRequestId:current.lastRequestId,updatedAt:current.updatedAt,completedAt:current.completedAt||''};
      }
    });
    if(sync)sync.dispose();sync=controller;session=next;
  }
  function landing(){
    const active=localStorage.getItem(TOKEN);updateBadge();
    const intro=studyInfo.intro.replace(/^54篇の記事を一つずつ読み、受けた印象をお答えください。/,`100字程度の短い文章を54件読み、それぞれ${studyInfo.questions.length}つの質問にお答えいただきます。`);
    el.innerHTML=`<div class="landing"><section><div class="eyebrow">READ · FEEL · RESPOND</div><h1>短い記事から、<br>受けた印象を。</h1><p class="lead">${esc(intro)}</p><div class="numbers"><div class="number"><strong>54<span>件</span></strong><small>お読みいただく短い文章</small></div><div class="number"><strong>${studyInfo.questions.length}<span>項目</span></strong><small>記事ごとの質問</small></div><div class="number"><strong>2 / 7<span>段階</span></strong><small>Q1は二択・Q2は7件法</small></div></div><button class="primary" id="begin" ${!active&&!studyInfo.accepting?'disabled':''}>${active?'回答を再開する':'説明を確認して始める'} →</button><p class="smallnote">途中で休憩できます。同じ端末・ブラウザで続きから回答してください。</p><div class="notice">本調査で提示する文章は、調査用に作成した架空のものです。性的な内容を含みます。${cloud?'回答は授業のグループワークにおける分析に使用し、調査用のGoogleスプレッドシートに保存します。':'このプレビューの回答はブラウザ内に保存されます。'}氏名・メールアドレスの入力は不要です。参加は任意で、途中で回答をやめることもできます。</div>${studyInfo.accepting?'':'<p class="smallnote">現在、新しい回答の受付を停止しています。開始済みの回答は再開できます。</p>'}</section><aside class="sample-paper"><div class="paper-top"><span>54 ARTICLES</span><span>読む → 印象を答える</span></div><blockquote>短い文章が1件ずつ表示されます。<br>それぞれの記事について、画面に表示される質問にお答えください。</blockquote><div class="sample-scale">回答のイメージ<div class="sample-circles">${[1,2,3,4,5,6,7].map(n=>`<span>${n}</span>`).join('')}</div><p>選択した回答は、前の画面に戻って見直すことができます。</p></div></aside></div>`;
    on('begin',()=>launch(false));
  }
  async function launch(fresh){
    if(busy)return;
    if(session&&!fresh){renderSession();focusPage();return;}
    busy=true;loading();
    try{
      if(fresh&&session&&session.status!=='submitted')await save(false);
      const t=fresh?token():(localStorage.getItem(TOKEN)||token());
      const next=await start(t);
      const draft=JSON.parse(localStorage.getItem(DRAFT+t)||'null');
      attachSync(next,draft);localStorage.setItem(TOKEN,t);
      busy=false;updateBadge();renderSession();focusPage();sync.schedule(0);
    }catch(e){busy=false;landing();showError(e);}finally{busy=false;}
  }
  function answeredCount(item){return session.questions.filter(q=>Number.isInteger(session.answers[item.id]?.[q.id])).length;}
  function renderSession(){if(session.status==='submitted')complete();else if(session.requiresGender&&!session.demographics)demographics();else if(session.position>=session.items.length)review();else survey();}
  function questionHTML(q,qi){
    const binary=q.type==='binary',item=session.items[session.position],selected=session.answers[item.id]?.[q.id];
    const options=binary?[1,0]:[1,2,3,4,5,6,7];
    const label=n=>binary?(n===1?q.high:q.low):String(n);
    const number=q.block==='Q1'?'Q1':q.block==='Q2'?'Q2-'+(session.questions.slice(0,qi+1).filter(x=>x.block==='Q2').length):String(qi+1).padStart(2,'0');
    return `<fieldset class="rating"><legend><span class="qnum">${number}</span>${esc(q.label)}</legend><div class="choices ${binary?'binary':''}">${options.map(n=>`<label class="choice"><input type="radio" name="${esc(q.id)}" value="${n}" ${selected===n?'checked':''} aria-label="${binary?esc(label(n)):n===1?'1：'+esc(q.low):n===7?'7：'+esc(q.high):n}"><span>${esc(label(n))}</span></label>`).join('')}</div>${binary?'':`<div class="anchors"><span>1 — ${esc(q.low)}</span><span>${esc(q.high)} — 7</span></div>`}</fieldset>`;
  }
  function demographics(){
    const key=STORE+'-gender-'+session.token,draft=JSON.parse(localStorage.getItem(key)||'{}');
    el.innerHTML=`<section class="review"><div class="eyebrow">はじめに</div><h1>性別を教えてください。</h1><form id="genderForm"><div class="choices gender-choices">${[['female','女'],['male','男'],['other','その他']].map(([v,l])=>`<label class="choice"><input type="radio" name="gender" value="${v}" ${draft.gender===v?'checked':''}><span>${l}</span></label>`).join('')}</div><label class="gender-other" id="otherLabel" ${draft.gender==='other'?'':'hidden'}>その他の内容<input id="genderOther" type="text" maxlength="100" value="${esc(draft.other||'')}" autocomplete="off"></label><div class="toolbar"><button type="submit" class="primary" id="genderNext">記事へ進む →</button></div></form></section>`;
    const form=document.getElementById('genderForm'),input=document.getElementById('genderOther');
    const current=()=>({gender:form.querySelector('input[name="gender"]:checked')?.value||'',other:input.value});
    form.addEventListener('change',()=>{const value=current();document.getElementById('otherLabel').hidden=value.gender!=='other';try{localStorage.setItem(key,JSON.stringify(value));}catch(e){showError(e);}});
    input.addEventListener('input',()=>{try{localStorage.setItem(key,JSON.stringify(current()));}catch(e){showError(e);}});
    form.addEventListener('submit',async e=>{
      e.preventDefault();if(busy)return;
      let value;try{value=C.validateDemographics(current());}catch(error){showError(error);return;}
      busy=true;disableActions();document.getElementById('genderNext').textContent='準備しています…';
      try{
        let next;
        if(cloud)next=await callGas('saveDemographics',session.token,value);
        else {const store=readStore();next=store.sessions[session.token];next.demographics=value;localStorage.setItem(STORE,JSON.stringify(store));next=clone(next);}
        attachSync(next,null);localStorage.removeItem(key);busy=false;renderSession();focusPage();
      }catch(error){busy=false;demographics();showError(error);}finally{busy=false;enableHeader();}
    });
  }
  function survey(){
    const pos=session.position,total=session.items.length,item=session.items[pos];
    el.innerHTML=`<section class="survey"><div class="progressline"><span><strong>${pos+1} <span>/ ${total}</span></strong></span></div><div class="progress" role="progressbar" aria-label="回答の進み具合" aria-valuenow="${pos}" aria-valuemin="0" aria-valuemax="${total}"><div style="width:${pos/total*100}%"></div></div><article class="article" data-focus><div class="article-label">次の記事をお読みください</div><p>${esc(item.text)}</p></article><form id="ratingForm" class="ratings">${session.questions.map(questionHTML).join('')}</form><div class="actions"><button class="quiet" id="prev" ${pos===0?'disabled':''}>← 戻る</button><div class="actions-right"><span id="answered" class="answered"></span><button class="primary" id="next">${pos===total-1?'回答を確認する':'次へ'} →</button></div></div><div class="save-note" id="saveNote"></div><div class="toolbar"><button class="secondary" id="pause">保存して休憩する</button></div></section>`;
    const update=()=>{const n=answeredCount(item);document.getElementById('answered').textContent=`${n} / ${session.questions.length} 回答`;document.getElementById('next').disabled=n!==session.questions.length||busy;};
    document.getElementById('ratingForm').addEventListener('change',e=>{
      if(e.target.type!=='radio')return;
      if(!session.answers[item.id])session.answers[item.id]={};session.answers[item.id][e.target.name]=Number(e.target.value);
      try{sync.changed();}catch(error){showError(error);}update();
    });
    on('prev',()=>navigate(pos-1));on('next',()=>navigate(pos+1));on('pause',pause);update();syncStatus();
  }
  function disableActions(){el.querySelectorAll('button,input').forEach(x=>x.disabled=true);document.getElementById('studioToggle').disabled=true;}
  function enableHeader(){document.getElementById('studioToggle').disabled=false;}
  function navigate(position){
    if(busy)return;const old=session.position;session.position=position;
    try{sync.changed();renderSession();focusPage();sync.schedule(0);}
    catch(e){session.position=old;survey();showError(e);}
  }
  async function pause(){
    if(busy)return;busy=true;disableActions();
    try{await save(false);el.innerHTML=`<section class="review"><h1>ここまでの回答を保存しました。</h1><p class="lead">この画面を閉じて休憩できます。同じ端末・ブラウザでリンクを開くと、続きから再開できます。</p><button class="primary" id="resume">回答を続ける →</button></section>`;on('resume',()=>{renderSession();focusPage();});}
    catch(e){busy=false;survey();showError(e);}finally{busy=false;enableHeader();}
  }
  function review(){
    const count=session.items.filter(x=>answeredCount(x)===session.questions.length).length,total=session.items.length;
    el.innerHTML=`<section class="review"><div class="eyebrow">REVIEW YOUR RESPONSES</div><h1>回答を確認します。</h1><p class="lead">回答済み：${count} / ${total}件。番号を押すと回答を見直せます。</p><div class="list">${session.items.map((x,i)=>`<button data-review="${i}">${i+1} ${answeredCount(x)===session.questions.length?'✓':'・'}</button>`).join('')}</div><button class="primary" id="submit" ${count!==total?'disabled':''}>回答を送信する →</button><p class="smallnote">送信完了の表示が出るまで、この画面を閉じないでください。</p></section>`;
    el.querySelectorAll('[data-review]').forEach(b=>{b.disabled=sync.status().finalizing;b.addEventListener('click',()=>navigate(Number(b.dataset.review)));});
    if(sync.status().finalizing)el.querySelector('.smallnote').textContent='送信結果を確認できませんでした。回答内容は保持しています。「回答を送信する」で同じ回答を再送できます。';
    on('submit',async()=>{if(busy)return;busy=true;disableActions();document.getElementById('submit').textContent='送信しています…';try{await save(true);complete();focusPage();}catch(e){review();showError(e);}finally{busy=false;enableHeader();}});
  }
  function complete(){el.innerHTML=`<section class="review"><div class="success-mark">✓</div><h1>ご回答ありがとうございました。</h1><p class="lead">${session.items.length}件すべての回答を${cloud?'受け付けました':'この端末に保存しました'}。</p><div class="notice">回答番号：<span class="mono">${esc(session.shortId||session.id)}</span><br>この画面を閉じていただいて構いません。</div></section>`;}
  document.getElementById('homeLink').addEventListener('click',e=>{e.preventDefault();if(busy)return;if(session&&session.status!=='submitted'){try{persistDraft();}catch(error){showError(error);return;}}landing();});
  on('studioToggle',()=>{if(busy)return;el.innerHTML='<section class="review"><h1>新しい試用を始めますか？</h1><p class="lead">今の試用記録を残して、最新の文章と質問で最初から始めます。</p><div class="toolbar"><button class="primary" id="fresh">新しい試用を開始</button><button class="secondary" id="cancelFresh">戻る</button></div></section>';on('fresh',()=>launch(true));on('cancelFresh',()=>session?renderSession():landing());});
  document.getElementById('storageLabel').textContent='';
  window.addEventListener('online',()=>{if(sync)sync.retry();});
  document.addEventListener('visibilitychange',()=>{if(sync&&session.status!=='submitted'){try{persistDraft();sync.retry();}catch(e){showError(e);}}});
  async function init(){
    loading();
    try{localStorage.setItem(STORE+'-check','1');localStorage.removeItem(STORE+'-check');studyInfo=cloud?await callGas('getStudyInfo'):{title:'記事印象調査（54篇版）',intro:'54篇の記事を一つずつ読み、受けた印象をお答えください。',questions:C.QUESTIONS,demo:true,accepting:true,count:54};document.title=studyInfo.title.replace('（54篇版）','');landing();}
    catch(e){el.innerHTML='<section class="review"><h1>読み込みを完了できませんでした。</h1><button class="primary" id="retry">再読み込み</button></section>';showError(e);on('retry',init);}
  }
  init();
})();
