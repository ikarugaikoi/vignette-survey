(function () {
  'use strict';
  const C = StudyCore, cloud = window.RUNTIME_MODE === 'gas';
  const STORE = 'vignette-prototype-v1', TOKEN = STORE + '-active', DRAFT = STORE + '-draft-';
  const el = document.getElementById('app');
  let session = null, view = 'landing', busy = false, toastTimer, storageError = '';
  let studyInfo = { title: '記事印象調査', demo: true, questions: C.QUESTIONS };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function token() { return Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join(''); }
  function seed() { return crypto.getRandomValues(new Uint32Array(1))[0]; }
  function readStore() {
    const raw = localStorage.getItem(STORE);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.schema !== 1 || !data.sessions || !Array.isArray(data.blocks)) throw new Error('保存データの形式を確認できません。ブラウザのデータを消さずに管理者へご連絡ください。');
      return data;
    }
    return { schema: 1, bank: DEMO_BANK, version: 'demo-bank-v1', blocks: [], sessions: {} };
  }
  function putStore(data) { localStorage.setItem(STORE, JSON.stringify(data)); }
  const clone = x => JSON.parse(JSON.stringify(x));
  function callGas(name, ...args) {
    return new Promise((resolve, reject) => google.script.run.withSuccessHandler(resolve).withFailureHandler(e => reject(new Error(e.message || String(e))))[name](...args));
  }
  async function startSession(t) {
    if (cloud) return callGas('startSession', t);
    const data = readStore();
    if (data.sessions[t]) return clone(data.sessions[t]);
    let block = data.blocks.at(-1);
    const questionSignature = JSON.stringify(C.QUESTIONS);
    if (!block || block.version !== data.version || block.questionSignature !== questionSignature || block.used >= 4) {
      block = { id: 'B' + (data.blocks.length + 1), version: data.version, questionSignature, seed: seed(), used: 0 };
      block.schedules = C.allocateBlock(data.bank, block.seed);
      data.blocks.push(block);
    }
    const s = { id: 'P-' + t.slice(0, 16), token: t, version: data.version, blockId: block.id, slot: block.used,
      seed: block.seed, items: clone(block.schedules[block.used++]), questions: clone(C.QUESTIONS), answers: {},
      position: 0, revision: 0, status: 'in_progress', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      demo: data.bank.every(x => x.id.startsWith('DEMO-')), mode: 'local' };
    data.sessions[t] = s; putStore(data); return clone(s);
  }
  async function saveSession(complete) {
    const answers = C.validateAnswers(session.items, session.questions, session.answers, complete);
    persistDraft();
    if (cloud) {
      session = await callGas('saveSession', session.token, session.revision, answers, session.position, complete);
    } else {
      const data = readStore(), current = data.sessions[session.token];
      if (!current) throw new Error('この回答セッションが見つかりません。');
      if (current.status === 'submitted') session = clone(current);
      else {
        if (current.revision !== session.revision) throw new Error('別のタブで回答が更新されています。このページを再読み込みしてください。');
        session.answers = answers; session.revision++; session.updatedAt = new Date().toISOString();
        if (complete) { session.status = 'submitted'; session.completedAt = session.updatedAt; }
        data.sessions[session.token] = clone(session); putStore(data);
      }
    }
    localStorage.removeItem(DRAFT + session.token);
  }
  function persistDraft() {
    localStorage.setItem(DRAFT + session.token, JSON.stringify({ revision: session.revision, answers: session.answers, position: session.position }));
  }
  function showError(e) {
    let box = document.getElementById('error');
    if (!box) { box = document.createElement('div'); box.id = 'error'; box.className = 'error'; box.setAttribute('role', 'alert'); el.prepend(box); }
    box.textContent = e.message || String(e); box.scrollIntoView({ block: 'nearest' });
  }
  function toast(text) {
    const x = document.getElementById('toast'); x.textContent = text; x.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => x.classList.remove('show'), 3500);
  }
  function focusPage() { window.scrollTo({ top: 0, behavior: 'instant' }); const h = el.querySelector('h1,[data-focus]'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } }
  function on(id, fn) { const x = document.getElementById(id); if (x) x.addEventListener('click', fn); }
  function loading() { el.innerHTML = '<div class="loading"><div class="spinner"></div>回答画面を準備しています…</div>'; }
  function landing() {
    view = 'landing';
    const active = localStorage.getItem(TOKEN);
    el.innerHTML = `<div class="landing"><section><div class="eyebrow">READ · FEEL · RESPOND</div><h1>短い記事から、<br>受けた印象を。</h1><p class="lead">記事を一つずつ読み、感じた印象をお答えください。<br>正解・不正解はありません。</p><div class="numbers"><div class="number"><strong>27<span>篇</span></strong><small>お読みいただく記事</small></div><div class="number"><strong>3<span>項目</span></strong><small>記事ごとの質問（仮）</small></div><div class="number"><strong>7<span>段階</span></strong><small>回答の選択肢</small></div></div><button class="primary" id="begin">${active ? '回答を再開する' : 'プレビューを始める'} <span aria-hidden="true">→</span></button><p class="smallnote">途中で閉じても、同じブラウザで続きから回答できます。</p><div class="notice">動作確認用のプレビューです。本文は架空のデモ用テキスト、質問は仮の項目です。性的な内容を含む記事があります。${cloud ? '回答は調査用スプレッドシートに保存されます。' : '回答はこの端末のブラウザに保存され、外部には送信されません。'}</div></section><aside class="sample-paper"><div class="paper-top"><span>ARTICLE PREVIEW</span><span>読む → 印象を答える</span></div><blockquote>食品会社の経理担当B氏（42）が、会社の資金約80万円を私的な旅行に使っていたことが、社内調査で分かった。複数の領収書に不審な点があり、会社が確認を進めていた。B氏は流用を認め、返済を約束した。</blockquote><div class="sample-scale">表示イメージ（抽出される記事とは別の例です）<div class="sample-circles">${[1,2,3,4,5,6,7].map(n=>`<span>${n}</span>`).join('')}</div><div class="anchors"><span>まったく感じない</span><span>非常に強く感じる</span></div></div></aside></div>`;
    const numbers = el.querySelectorAll('.number strong');
    numbers[1].innerHTML = `${studyInfo.questions.length}<span>項目</span>`;
    if (cloud && studyInfo.demo) {
      document.getElementById('modeBadge').textContent = 'グループ内試用';
      document.getElementById('begin').textContent = active ? '試用を再開する →' : '説明を確認して試用を始める →';
      el.querySelector('.notice').textContent = '研究グループ内の動作確認用です。本文はデモ用の架空の記事で、最終選定した108篇ではありません。性的な内容を含みます。回答は試用データとして管理者のGoogleスプレッドシートに保存されます。氏名・メールアドレスの入力は不要です。参加は任意で、途中で閉じることができます。';
    }
    if (!studyInfo.demo) {
      document.getElementById('modeBadge').textContent = '調査';
      document.getElementById('begin').innerHTML = `${active ? '回答を再開する' : '説明を確認して回答を始める'} <span aria-hidden="true">→</span>`;
      el.querySelector('.number:nth-child(2) small').textContent = '記事ごとの質問';
      el.querySelector('.notice').textContent = 'この記事は研究用に作成された架空の文章です。性的な内容を含む記事があります。回答は調査用スプレッドシートに保存されます。参加は任意です。';
    }
    const previous = !cloud && active ? readStore().sessions[active] : null;
    const updatedQuestions = previous && JSON.stringify(previous.questions) !== JSON.stringify(C.QUESTIONS);
    if (updatedQuestions) {
      document.getElementById('begin').textContent = '更新された質問で試す →';
      el.querySelector('.smallnote').textContent = '質問文を更新しました。以前の回答は残したまま、新しくプレビューを開始します。';
    }
    on('begin', () => launch(Boolean(updatedQuestions)));
    if (storageError) showError(new Error(storageError));
  }
  async function launch(fresh) {
    if (busy) return; busy = true; loading();
    try {
      if (fresh && session && session.status !== 'submitted') await saveSession(false);
      const t = fresh ? token() : (localStorage.getItem(TOKEN) || token());
      localStorage.setItem(TOKEN, t); session = await startSession(t);
      const draft = JSON.parse(localStorage.getItem(DRAFT + t) || 'null');
      if (draft && draft.revision === session.revision && session.status !== 'submitted') {
        session.answers = C.validateAnswers(session.items, session.questions, draft.answers, false);
        session.position = Math.max(0, Math.min(27, draft.position | 0));
      }
      busy = false;
      document.getElementById('modeBadge').textContent = session.demo ? (cloud ? 'グループ内試用' : 'プレビュー') : '調査';
      if (session.status === 'submitted') complete(); else if (session.position >= 27) review(); else survey();
      focusPage();
    } catch (e) { landing(); showError(e); } finally { busy = false; }
  }
  function answeredCount(item) { return session.questions.filter(q => Number.isInteger(session.answers[item.id]?.[q.id])).length; }
  function survey() {
    view = 'survey'; const pos = session.position, item = session.items[pos];
    el.innerHTML = `<section class="survey"><div class="progressline"><span>記事 <strong>${String(pos + 1).padStart(2, '0')} <span>/ 27</span></strong></span><span>${session.demo ? '動作確認プレビュー' : '記事を読んでお答えください'}</span></div><div class="progress" role="progressbar" aria-label="回答の進み具合" aria-valuenow="${pos}" aria-valuemin="0" aria-valuemax="27"><div style="width:${pos / 27 * 100}%"></div></div><article class="article" data-focus><div class="article-label">次の記事をお読みください</div><p>${esc(item.text)}</p></article><form id="ratingForm" class="ratings">${session.questions.map((q, qi) => `<fieldset class="rating"><legend><span class="qnum">0${qi + 1}</span>${esc(q.label)}</legend><div class="choices">${[1,2,3,4,5,6,7].map(n => `<label class="choice"><input type="radio" name="${esc(q.id)}" value="${n}" ${session.answers[item.id]?.[q.id] === n ? 'checked' : ''} aria-label="${n}${n === 1 ? '：' + esc(q.low) : n === 7 ? '：' + esc(q.high) : ''}"><span>${n}</span></label>`).join('')}</div><div class="anchors"><span>1 — ${esc(q.low)}</span><span>${esc(q.high)} — 7</span></div></fieldset>`).join('')}</form><div class="actions"><button class="quiet" id="prev" ${pos === 0 ? 'disabled' : ''}>← 前の記事</button><div class="actions-right"><span id="answered" class="answered"></span><button class="primary" id="next">${pos === 26 ? '回答を確認する' : '次の記事へ'} <span aria-hidden="true">→</span></button></div></div><div class="save-note" id="saveNote">選択した回答は、この端末に自動保存されます。</div></section>`;
    const update = () => { const n = answeredCount(item); document.getElementById('answered').textContent = `${n} / ${session.questions.length} 回答`; document.getElementById('next').disabled = n !== session.questions.length || busy; };
    document.getElementById('ratingForm').addEventListener('change', e => {
      if (e.target.type !== 'radio') return;
      (session.answers[item.id] ||= {})[e.target.name] = Number(e.target.value);
      try { persistDraft(); document.getElementById('saveNote').textContent = cloud ? 'この端末に保存済み。「次の記事へ」でサーバーにも保存します。' : 'この端末に保存済み'; }
      catch (error) { showError(new Error('回答を端末に保存できません。空き容量やブラウザ設定を確認してください。')); }
      update();
    });
    on('prev', () => navigate(pos - 1)); on('next', () => navigate(pos + 1));
    update();
  }
  async function navigate(position) {
    if (busy) return; busy = true;
    const old = session.position; session.position = position;
    const next = document.getElementById('next'); if (next) { next.disabled = true; next.textContent = '保存しています…'; }
    try { await saveSession(false); busy = false; if (position === 27) review(); else survey(); focusPage(); }
    catch (e) { session.position = old; busy = false; survey(); showError(e); }
  }
  function review() {
    view = 'review';
    const count = session.items.filter(x => answeredCount(x) === session.questions.length).length;
    el.innerHTML = `<section class="review"><div class="eyebrow">REVIEW YOUR RESPONSES</div><h1>27篇の回答を確認します。</h1><p class="lead">回答済み：${count} / 27篇。記事の番号を押すと、回答を見直せます。</p><div class="list">${session.items.map((x, i) => `<button data-review="${i}">${String(i + 1).padStart(2, '0')} ${answeredCount(x) === session.questions.length ? '✓' : '・'}</button>`).join('')}</div><button class="primary" id="submit" ${count !== 27 ? 'disabled' : ''}>${cloud ? '回答を送信する' : '回答を確定する'} <span aria-hidden="true">→</span></button><p class="smallnote">${cloud ? '送信完了の表示が出るまで、この画面を閉じないでください。' : 'ローカルの動作確認です。外部への送信は行いません。'}</p></section>`;
    el.querySelectorAll('[data-review]').forEach(b => b.addEventListener('click', () => { session.position = Number(b.dataset.review); persistDraft(); survey(); focusPage(); }));
    on('submit', async () => { if (busy) return; busy = true; document.getElementById('submit').disabled = true;
      try { await saveSession(true); complete(); focusPage(); } catch (e) { review(); showError(e); } finally { busy = false; }
    });
  }
  function complete() {
    view = 'complete';
    el.innerHTML = `<section class="review"><div class="success-mark" aria-hidden="true">✓</div><div class="eyebrow">COMPLETED</div><h1>ご回答ありがとうございました。</h1><p class="lead">27篇すべての回答を${cloud ? '受け付けました' : 'この端末に保存しました'}。</p><div class="notice">回答番号：<span class="mono">${esc(session.id)}</span><br>${cloud ? 'この画面を閉じていただいて構いません。' : 'これはプレビューです。抽出内容と回答データは「抽出を確認」から確認できます。'}</div>${!cloud ? '<div class="toolbar"><button class="primary" id="inspectDone">抽出と回答を確認する →</button><button class="secondary" id="anotherDone">別の回答者として試す</button></div>' : ''}</section>`;
    on('inspectDone', studio); on('anotherDone', () => launch(true));
  }
  function countsTable(s) {
    return `<table><thead><tr><th>操作軸</th><th>大</th><th>中</th><th>小</th></tr></thead><tbody>${[['justice','正義'],['envy','嫉妬'],['sexual','性的']].map(([k,l]) => `<tr><td>${l}</td>${C.LEVELS.map(x=>`<td>${s[k][x]||0}篇</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
  async function studio() {
    if (cloud) return;
    try {
      if (!session) { const t = localStorage.getItem(TOKEN) || token(); localStorage.setItem(TOKEN, t); session = await startSession(t); }
      view = 'studio'; const data = readStore(), s = C.summary(session.items);
      el.innerHTML = `<section class="studio"><div class="studio-head"><div><div class="eyebrow">RESEARCHER PREVIEW</div><h1>抽出は、条件ごとに一篇。</h1><p class="lead">各被験者に27組の条件を一度ずつ割り当てます。4人ごとに108篇を一巡し、次の4人分は新しくランダムに生成します。</p></div><button class="secondary" id="returnSurvey">回答画面に戻る →</button></div><div class="pills"><div class="pill"><strong>${s.total}</strong>篇を抽出</div><div class="pill"><strong>${s.unique}</strong>条件・重複なし</div><div class="pill"><strong>${s.category['金銭']}</strong>金銭</div><div class="pill"><strong>${s.category['不倫']}</strong>不倫</div></div><div class="notice">${session.demo ? '現在はデモ用108文です。先ほど選定した108篇ではありません。文章と3つの評価質問は、研究用に確定したものへ差し替えてください。' : 'インポートした文章を使用しています。評価質問は引き続き仮の項目です。'} この画面は研究者向けで、Apps Script版の通常回答画面には表示されません。</div><div class="audit-card"><h2>この回答者の条件バランス</h2>${countsTable(s)}<p>各ジャンルの中でも、各軸の大・中・小はそれぞれ4〜5篇です。均等なのは割り当て数です。途中離脱があれば、有効回答数は別途確認します。</p></div><div class="toolbar"><button class="secondary" id="newPerson">次の回答者を生成</button><button class="secondary" id="simulate">1,000人分を検証</button><button class="secondary" id="downloadCsv">回答CSVを保存</button><button class="secondary" id="autoFill">デモ回答で最後まで試す</button></div><div id="simulation" role="status"></div><div class="audit-card"><h2>今回の提示順</h2><p class="mono">${esc(session.id)} · ${esc(session.blockId)} / slot ${session.slot + 1} · seed ${session.seed}</p><div class="table-wrap"><table><thead><tr><th>順番</th><th>記事ID</th><th>類型</th><th>正義</th><th>嫉妬</th><th>性的</th><th>回答</th></tr></thead><tbody>${session.items.map((x,i)=>`<tr><td>${i+1}</td><td class="mono">${esc(x.id)}</td><td>${esc(x.category)}</td><td>${x.justice}</td><td>${x.envy}</td><td>${x.sexual}</td><td>${answeredCount(x)} / ${session.questions.length}</td></tr>`).join('')}</tbody></table></div></div><details class="audit-card"><summary>本番の108篇を読み込む</summary><p>列名 id, category, justice, envy, sexual, text を持つJSON配列、または同じ見出しのタブ区切りテキストを貼り付けます。既存の回答は残したまま、新しい材料で開始します。</p><textarea id="bankInput" aria-label="108篇の刺激文データ" placeholder="id&#9;category&#9;justice&#9;envy&#9;sexual&#9;text"></textarea><button class="secondary" id="importBank">108篇を検証して読み込む</button></details></section>`;
      on('returnSurvey', () => { if(session.status==='submitted') complete(); else if(session.position===27) review(); else survey(); focusPage(); });
      on('newPerson', async () => { await launch(true); if(session) await studio(); });
      on('simulate', () => {
        try {
          const counts = Object.fromEntries(data.bank.map(x => [x.id,0])); let passed = 0;
          for(let b=0;b<250;b++) for(const items of C.allocateBlock(data.bank, b+82491)) {
            const z=C.summary(items);
            if(z.total!==27||z.unique!==27||!Object.values(z.category).every(v=>v===13||v===14)||!['justice','envy','sexual'].every(a=>Object.values(z[a]).every(n=>n===9))) throw new Error('バランス検証に失敗しました。');
            items.forEach(x=>counts[x.id]++); passed++;
          }
          const all = Object.values(counts);
          document.getElementById('simulation').innerHTML = `<div class="notice">✓ ${passed.toLocaleString()}人すべてで27篇・条件の重複なし・各軸9/9/9篇。<br>108篇それぞれの割り当て回数：最少${Math.min(...all)}回／最多${Math.max(...all)}回。</div>`;
        } catch(e) { showError(e); }
      });
      on('downloadCsv', exportCsv);
      on('autoFill', async () => { try {if(session.status==='submitted'){toast('新しい回答者を生成してからお試しください。');return;} session.items.forEach(x=>session.answers[x.id]=Object.fromEntries(session.questions.map(q=>[q.id,4]))); session.position=27; persistDraft(); await saveSession(false); review(); focusPage();}catch(e){showError(e);} });
      on('importBank', () => {
        try {
          const raw = document.getElementById('bankInput').value.trim();
          let bank;
          if(raw.startsWith('[')) bank=JSON.parse(raw);
          else {const lines=raw.split(/\r?\n/);const heads=lines.shift().split('\t').map(x=>x.trim());const required=['id','category','justice','envy','sexual','text'];if(required.some(h=>!heads.includes(h)))throw new Error('必要な列名が不足しています。');bank=lines.filter(x=>x.trim()).map(l=>{const v=l.split('\t');if(v.length!==heads.length)throw new Error('本文中の改行・タブを除いてください。');return Object.fromEntries(heads.map((h,i)=>[h,v[i]]));});}
          C.validateBank(bank); const next = readStore(); next.bank=bank; next.version='import-'+Date.now(); putStore(next); launch(true);
        } catch(e){showError(e);}
      });
    } catch(e){showError(e);}
  }
  function exportCsv() {
    const data=readStore(), rows=[['participant_id','bank_version','status','block_id','slot','seed','presentation_order','stimulus_id','category','justice','envy','sexual','question_id','rating','completed_at','question_text','scale_low','scale_high']];
    for(const s of Object.values(data.sessions)) {
      let answers=s.answers; const draft=JSON.parse(localStorage.getItem(DRAFT+s.token)||'null'); if(draft&&draft.revision===s.revision&&s.status!=='submitted') answers=draft.answers;
      s.items.forEach((x,i)=>s.questions.forEach(q=>rows.push([s.id,s.version,s.status,s.blockId,s.slot+1,s.seed,i+1,x.id,x.category,x.justice,x.envy,x.sexual,q.id,answers[x.id]?.[q.id]??'',s.completedAt||'',q.label,q.low,q.high])));
    }
    const csv=rows.map(row=>row.map(v=>{let s=String(v);if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}).join(',')).join('\r\n');
    const a=document.createElement('a'),url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));a.href=url;a.download='vignette-preview-responses.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('回答CSVを保存しました');
  }
  document.getElementById('homeLink').addEventListener('click', e=>{e.preventDefault();if(session&&session.status!=='submitted'){try{persistDraft();}catch(e){showError(e);return;}}landing();});
  document.getElementById('studioToggle').hidden=cloud;
  on('studioToggle', studio);
  document.getElementById('storageLabel').textContent=cloud?'進行中の回答は端末と調査用シートに保存されます':'回答はこのブラウザに保存されます';
  try {localStorage.setItem(STORE+'-check','1');localStorage.removeItem(STORE+'-check');if(cloud){loading();callGas('getStudyInfo').then(info=>{studyInfo=info;document.title=info.title;landing();}).catch(showError);}else landing();}
  catch(e){el.innerHTML='<div class="error">ブラウザへの保存が利用できません。通常モードのブラウザで開き直してください。</div>';}
})();
