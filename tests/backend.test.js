const test=require('node:test'),assert=require('node:assert/strict');
const {runtime}=require('./helpers.cjs');
const C=require('../src/core'),bank=require('../src/demo-bank');
const tok=n=>n.toString(16).padStart(48,'0');
const answers=s=>Object.fromEntries(s.items.map(x=>[x.id,Object.fromEntries(s.questions.map(q=>[q.id,q.type==='binary'?1:4]))]));
function enrolled(c,t){let s=c.startSession(t);if(s.requiresGender&&!s.demographics)c.saveDemographics(t,{gender:'female',other:''});return c.startSession(t);}
test('54 distinct articles; 27 per genre; each axis 18; both orders randomized reproducibly',()=>{
  const orders=new Set(),qOrders=new Set();
  for(let seed=0;seed<200;seed++){
    const a=C.allocate54(bank,C.QUESTIONS,seed),s=C.summary(a.items);
    assert.equal(a.items.length,54);assert.equal(new Set(a.items.map(x=>x.id)).size,54);
    assert.deepEqual(s.category,{'金銭':27,'不倫':27});
    for(const axis of ['justice','envy','sexual'])assert.deepEqual(s[axis],{'大':18,'中':18,'小':18});
    assert.equal(new Set(a.items.map(x=>x.category+'|'+C.key(x))).size,54);
    assert.deepEqual(a,C.allocate54(bank,C.QUESTIONS,seed));
    orders.add(a.items.map(x=>x.id).join(','));qOrders.add(a.questions.map(q=>q.id).join(','));
  }
  assert.equal(orders.size,200);assert.equal(qOrders.size,6);
});
test('new edition has isolated sheet property and resumes the exact saved order',()=>{
  const {context:c,sheets,props}=runtime();
  assert.ok(props.get('STUDY_108_SHEET_ID'));assert.equal(props.get('STUDY_SHEET_ID'),undefined);
  const a=enrolled(c,tok(1)),b=enrolled(c,tok(2));
  assert.equal(a.items.length,54);assert.equal(b.items.length,54);
  assert.notDeepEqual(a.items.map(x=>x.id),b.items.map(x=>x.id));
  assert.equal(JSON.stringify(enrolled(c,tok(1))),JSON.stringify(a));
  assert.equal(sheets.get('Sessions').rows.length,3);
});
test('edits to article and question sheet apply to new starts, with old snapshots preserved',()=>{
  const {context:c,sheets}=runtime(),a=enrolled(c,tok(1));
  sheets.get('Stimuli').rows.slice(1).forEach(r=>r[5]='編集後の本文。');
  sheets.get('Questions').rows[1][1]='編集後の質問ですか。';
  sheets.get('Questions').rows[1][2]='編集後の低い側';
  sheets.get('Questions').rows.push(['additional','追加の質問ですか。','低い','高い',true]);
  const b=enrolled(c,tok(2));assert.notEqual(a.version,b.version);assert.equal(b.questions.length,5);
  assert.equal(b.items[0].text,'編集後の本文。');
  assert.equal(b.questions.find(q=>q.id==='read_more').label,'編集後の質問ですか。');
  assert.equal(JSON.stringify(enrolled(c,tok(1))),JSON.stringify(a));
  sheets.get('Questions').rows[1][4]=false;
  assert.equal(enrolled(c,tok(3)).questions.length,4);
});
test('pause new starts while editing, but resume and save existing sessions',()=>{
  const {context:c,sheets}=runtime(),a=enrolled(c,tok(1));
  sheets.get('Settings').rows.find(r=>r[0]==='accepting_responses')[1]=false;
  assert.throws(()=>enrolled(c,tok(2)),/準備中/);
  assert.equal(enrolled(c,tok(1)).id,a.id);
  assert.equal(c.saveSession(tok(1),0,{},0,false).revision,1);
});
test('save, resume, reject stale/invalid ratings, submit 216 rows and retry without duplication',()=>{
  const {context:c,sheets}=runtime(),a=enrolled(c,tok(1)),ratings=answers(a);
  assert.throws(()=>c.saveSession(tok(1),0,{},54,true),/未回答/);
  assert.throws(()=>c.saveSession(tok(1),0,ratings,55,false),/記事番号/);
  const bad=structuredClone(ratings);bad[a.items[0].id][a.questions.find(q=>q.type!=='binary').id]=8;
  assert.throws(()=>c.saveSession(tok(1),0,bad,1,false),/1〜7/);
  c.saveSession(tok(1),0,ratings,30,false);assert.throws(()=>c.saveSession(tok(1),0,ratings,30,false),/別のタブ/);
  assert.equal(enrolled(c,tok(1)).position,30);
  const done=c.saveSession(tok(1),1,ratings,54,true);assert.equal(done.status,'submitted');
  assert.equal(JSON.stringify(c.saveSession(tok(1),1,ratings,54,true)),JSON.stringify(done));
  const r=sheets.get('Responses').rows;assert.equal(r.length,217);
  assert.equal(r[1][10],1);assert.equal(r[1][11],a.questions[0].id);assert.equal(r[1][14],a.questions[0].label);assert.equal(r[1][17],a.items[0].text);
  assert.equal(new Set(r.slice(1).map(x=>x[4])).size,54);
});
test('large snapshots are split across cells and remain intact after all answers are added',()=>{
  const {context:c,sheets}=runtime();
  sheets.get('Stimuli').rows.slice(1).forEach(r=>r[5]='あ'.repeat(2000));
  const a=enrolled(c,tok(1));c.saveSession(tok(1),0,answers(a),54,true);
  const row=sheets.get('Sessions').rows[1];assert.ok(row[7].length>0);assert.ok(row.slice(6).every(x=>x.length<=30000));
  assert.equal(enrolled(c,tok(1)).items[0].text.length,2000);assert.equal(sheets.get('Responses').rows.length,217);
});
test('response write failure can be retried after session submission',()=>{
  const {context:c,sheets}=runtime(),a=enrolled(c,tok(1)),s=sheets.get('Responses'),orig=s.getRange;let fail=true;
  s.getRange=function(...args){const r=orig.apply(this,args),write=r.setValues;r.setValues=function(v){if(fail&&args[0]>1){fail=false;throw new Error('outage');}return write.call(this,v);};return r;};
  assert.throws(()=>c.saveSession(tok(1),0,answers(a),54,true),/outage/);
  c.saveSession(tok(1),0,answers(a),54,true);assert.equal(s.rows.length,217);
});
test('invalid configuration fails clearly and does not create a partial participant',()=>{
  const {context:c,sheets}=runtime();sheets.get('Questions').rows[1][0]='__proto__';
  assert.throws(()=>enrolled(c,tok(1)),/質問ID/);assert.equal(sheets.get('Sessions').rows.length,1);
  assert.throws(()=>C.validateBank(bank.slice(1)),/108/);
});
test('progress acknowledgements are compact and lost responses can retry the same request',()=>{
  const {context:c}=runtime(),a=enrolled(c,tok(1)),r=answers(a);
  const ack=c.saveProgress(tok(1),0,r,1,false,tok(100));
  assert.ok(JSON.stringify(ack).length<400);assert.equal(ack.items,undefined);
  assert.equal(c.saveProgress(tok(1),0,r,1,false,tok(100)).revision,1);
  assert.throws(()=>c.saveProgress(tok(1),0,r,1,false,tok(101)),/別のタブ/);
  assert.equal(c.saveProgress(tok(1),1,r,2,false,tok(101)).revision,2);
  assert.throws(()=>c.saveProgress(tok(1),1,r,1,false,tok(100)),/別のタブ/);
});
test('resuming a committed submission repairs a failed response-table write before reporting complete',()=>{
  const {context:c,sheets}=runtime(),a=enrolled(c,tok(1)),s=sheets.get('Responses'),orig=s.getRange;let fail=true;
  s.getRange=function(...args){const r=orig.apply(this,args),write=r.setValues;r.setValues=function(v){if(fail&&args[0]>1){fail=false;throw new Error('outage');}return write.call(this,v);};return r;};
  assert.throws(()=>c.saveProgress(tok(1),0,answers(a),54,true,tok(100)),/outage/);
  assert.equal(enrolled(c,tok(1)).status,'submitted');assert.equal(s.rows.length,217);
});
test('54-row bank works and malformed condition coverage is rejected',()=>{
  const selected=C.allocate54(bank,C.QUESTIONS,42).items;
  assert.equal(C.allocate54(selected,C.QUESTIONS,43).items.length,54);
  const broken=structuredClone(selected);broken[0].category=broken[0].category==='金銭'?'不倫':'金銭';
  assert.throws(()=>C.allocate54(broken,C.QUESTIONS,1),/それぞれ/);
  const chosen=new Set(Array.from({length:200},(_,seed)=>C.allocate54(bank,C.QUESTIONS,seed).items.map(x=>x.id)).flat());
  assert.equal(chosen.size,108);
});
test('old 108 sessions retain their full snapshot and can still save',()=>{
  const {context:c,sheets}=runtime(),old=enrolled(c,tok(1));
  old.items=structuredClone(bank);old.version='old108';
  sheets.get('Sessions').rows[1]=c.rowFor_(old);
  assert.equal(enrolled(c,tok(1)).items.length,108);
  assert.equal(c.saveProgress(tok(1),0,{},80,false,tok(100)).revision,1);
  assert.equal(enrolled(c,tok(1)).position,80);
  assert.equal(enrolled(c,tok(2)).items.length,54);
});
test('upgrade changes only original 108 wording and preserves customized sheet settings',()=>{
  const {context:c,sheets,props}=runtime();
  const settings=sheets.get('Settings').rows;
  settings.find(r=>r[0]==='title')[1]='記事印象調査（108篇版）';
  settings.find(r=>r[0]==='intro')[1]='108篇の記事を一つずつ読み、受けた印象をお答えください。正解・不正解はありません。';
  c.upgrade54Settings_();assert.match(c.getStudyInfo().title,/54篇版/);assert.match(c.getStudyInfo().intro,/54篇/);
  props.delete('STUDY_54_SETTINGS_V1');settings.find(r=>r[0]==='intro')[1]='グループ独自の説明';
  c.upgrade54Settings_();assert.equal(c.getStudyInfo().intro,'グループ独自の説明');assert.equal(c.getStudyInfo().count,54);
});
test('Q1 stays first while Q2 uses all six orders; binary zero is accepted and invalid values rejected',()=>{
  const orders=new Set();
  for(let seed=0;seed<100;seed++){
    const a=C.allocate54(bank,C.QUESTIONS,seed);
    assert.equal(a.questions[0].id,'read_more');orders.add(a.questions.slice(1).map(q=>q.id).join(','));
  }
  assert.equal(orders.size,6);
  const a=C.allocate54(bank,C.QUESTIONS,1),r=answers(a);r[a.items[0].id].read_more=0;
  assert.equal(C.validateAnswers(a.items,a.questions,r,true)[a.items[0].id].read_more,0);
  r[a.items[0].id].read_more=2;assert.throws(()=>C.validateAnswers(a.items,a.questions,r,true),/0または1/);
});
test('gender is required once, free text is validated, and short IDs remain stable',()=>{
  const {context:c,sheets}=runtime(),a=c.startSession(tok(1)),b=c.startSession(tok(2));
  assert.equal(a.shortId,'P0001');assert.equal(b.shortId,'P0002');
  assert.throws(()=>c.saveProgress(tok(1),0,answers(a),1,false,tok(100)),/性別/);
  assert.throws(()=>c.saveDemographics(tok(1),{gender:'other',other:'  '}),/1〜100/);
  const saved=c.saveDemographics(tok(1),{gender:'other',other:'自由記述のテスト'});
  assert.equal(saved.revision,0);assert.equal(saved.demographics.other,'自由記述のテスト');
  assert.equal(c.saveDemographics(tok(1),{gender:'other',other:'自由記述のテスト'}).shortId,'P0001');
  assert.throws(()=>c.saveDemographics(tok(1),{gender:'female'}),/すでに/);
  assert.deepEqual(Array.from(sheets.get('Participants').rows[1].slice(2,4)),['その他','自由記述のテスト']);
});
test('analysis has exactly six columns, short IDs and unmodified raw records including binary zero',()=>{
  const {context:c,sheets,ss}=runtime(),a=enrolled(c,tok(1)),r=answers(a);r[a.items[0].id].read_more=0;
  c.saveProgress(tok(1),0,r,54,true,tok(100));
  const original=JSON.stringify(sheets.get('Responses').rows),analysis=sheets.get('Analysis').rows;
  assert.equal(analysis.length,217);assert.deepEqual(Array.from(analysis[0]),['participant_id','stimulus_id','question_id','rating','version','gender']);
  assert.ok(analysis.slice(1).every(row=>row.length===6&&row[0]==='P0001'));
  assert.deepEqual(Array.from(analysis[1]),['P0001',a.items[0].id,'read_more',0,a.version,'女']);
  c.syncAnalysis_(ss);assert.equal(JSON.stringify(sheets.get('Responses').rows),original);assert.equal(sheets.get('Analysis').rows.length,217);
  sheets.get('Participants').rows.push(['P0042','external-id','','','legacy']);
  assert.equal(c.startSession(tok(2)).shortId,'P0043');
});
test('migration backs up old questions, backfills analysis and leaves sessions and raw responses unchanged',()=>{
  const {context:c,sheets,ss,props}=runtime(),a=enrolled(c,tok(1));
  c.saveProgress(tok(1),0,answers(a),54,true,tok(100));
  const raw=JSON.stringify(sheets.get('Responses').rows),sessions=JSON.stringify(sheets.get('Sessions').rows);
  const old=[['id','label','low','high','enabled'],['old','旧質問','低','高',true]];
  sheets.get('Questions').rows=structuredClone(old);sheets.delete('Questions_previous');props.delete('STUDY_Q1_GENDER_V2');
  sheets.delete('Analysis');sheets.delete('Participants');c.upgradeQuestionnaire_();
  assert.equal(JSON.stringify(sheets.get('Questions_previous').rows),JSON.stringify(old));
  assert.equal(JSON.stringify(sheets.get('Responses').rows),raw);assert.equal(JSON.stringify(sheets.get('Sessions').rows),sessions);
  assert.equal(sheets.get('Analysis').rows.length,217);
  sheets.get('Questions').rows[1][1]='管理者の編集';c.upgradeQuestionnaire_();assert.equal(c.getStudyInfo().questions[0].label,'管理者の編集');
});
