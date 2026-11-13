/** 54-article edition, reusing the existing 108-candidate sheet and deployment. */
const STUDY_PROPERTY = 'STUDY_108_SHEET_ID';
const STIMULUS_HEADERS = ['id','category','justice','envy','sexual','text'];
const QUESTION_HEADERS = ['id','label','low','high','enabled','type','block'];
const PAYLOAD_PARTS = 12, PAYLOAD_SIZE = 30000;
const SESSION_HEADERS = ['token','participant_id','created_at','updated_at','status','version'].concat(Array.from({length: PAYLOAD_PARTS}, (_,i) => 'payload_' + (i + 1)));
const RESPONSE_HEADERS = ['participant_id','version','status','seed','presentation_order','stimulus_id','category','justice','envy','sexual','question_order','question_id','rating','completed_at','question_text','scale_low','scale_high','article_text','demo'];

function doGet() {
  if (!PropertiesService.getScriptProperties().getProperty(STUDY_PROPERTY)) locked_(() => setupStudy_());
  locked_(() => { upgrade54Settings_(); upgradeQuestionnaire_(); });
  return HtmlService.createHtmlOutputFromFile('Index').setTitle('記事印象調査（54篇版）').addMetaTag('viewport','width=device-width, initial-scale=1');
}
function locked_(fn) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function setupStudy_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(STUDY_PROPERTY)) return;
  const ss = SpreadsheetApp.create('記事印象調査（54篇版）— 設定と回答');
  const stimuli = ss.getSheets()[0]; stimuli.setName('Stimuli');
  stimuli.getRange(1,1,1,STIMULUS_HEADERS.length).setValues([STIMULUS_HEADERS]);
  stimuli.getRange(2,1,DEMO_BANK.length,STIMULUS_HEADERS.length).setValues(DEMO_BANK.map(x => STIMULUS_HEADERS.map(k => x[k])));
  const questions = ss.insertSheet('Questions');
  questions.getRange(1,1,1,QUESTION_HEADERS.length).setValues([QUESTION_HEADERS]);
  questions.getRange(2,1,StudyCore.QUESTIONS.length,QUESTION_HEADERS.length).setValues(StudyCore.QUESTIONS.map(q => [q.id,q.label,q.low,q.high,true,q.type,q.block]));
  const settings = ss.insertSheet('Settings');
  settings.getRange(1,1,6,3).setValues([
    ['key','value','説明'],
    ['title','記事印象調査（54篇版）','回答画面のタイトル'],
    ['demo',true,'試用中はTRUE。最終本文・質問を確認してからFALSEに変更。'],
    ['accepting_responses',true,'編集中はFALSEで新規開始を停止できます。開始済みの回答は続行できます。'],
    ['intro','54篇の記事を一つずつ読み、受けた印象をお答えください。正解・不正解はありません。','開始画面の説明文'],
    ['editing_guide','Stimuliのtext＝本文。Questionsのlabel＝質問、low/high＝1点/7点の説明。enabled＝TRUEで使用。','変更は新規開始時に反映。開始済みの文章・質問・順序は固定。IDと列名は維持してください。']
  ]);
  ss.insertSheet('Sessions').getRange(1,1,1,SESSION_HEADERS.length).setValues([SESSION_HEADERS]);
  ss.insertSheet('Responses').getRange(1,1,1,RESPONSE_HEADERS.length).setValues([RESPONSE_HEADERS]);
  ss.getSheets().forEach(s => {
    s.setFrozenRows(1);
    s.getRange(1,1,1,s.getLastColumn()).setBackground('#dcece3').setFontWeight('bold');
  });
  stimuli.setColumnWidths(1,5,110); stimuli.setColumnWidth(6,760);
  stimuli.getRange(2,6,108,1).setWrap(true).setFontColor('#1455a0');
  questions.setColumnWidth(1,200); questions.setColumnWidth(2,590); questions.setColumnWidths(3,2,260);
  questions.getRange(2,2,12,3).setWrap(true).setFontColor('#1455a0');
  questions.getRange(2,5,12,1).insertCheckboxes();
  questions.getRange(2,5,StudyCore.QUESTIONS.length,1).setValues(StudyCore.QUESTIONS.map(() => [true]));
  settings.setColumnWidth(1,190); settings.setColumnWidth(2,550); settings.setColumnWidth(3,670);
  settings.getRange(2,2,5,2).setWrap(true);
  props.setProperty(STUDY_PROPERTY,ss.getId());
  SpreadsheetApp.flush(); console.log('54篇版の設定・回答表: ' + ss.getUrl());
}
// Update only the old default wording; preserve custom descriptions and all answers.
function upgrade54Settings_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('STUDY_54_SETTINGS_V1') === 'done') return;
  const sheet = spreadsheet_().getSheetByName('Settings'), rows = sheet.getDataRange().getValues();
  const keyCol = rows[0].indexOf('key'), valueCol = rows[0].indexOf('value');
  if (keyCol < 0 || valueCol < 0) throw new Error('Settingsの列名を確認してください。');
  rows.slice(1).forEach((row,i) => {
    const key = row[keyCol], value = row[valueCol];
    if (key === 'title' && value === '記事印象調査（108篇版）') sheet.getRange(i+2,valueCol+1).setValues([['記事印象調査（54篇版）']]);
    if (key === 'intro' && value === '108篇の記事を一つずつ読み、受けた印象をお答えください。正解・不正解はありません。') sheet.getRange(i+2,valueCol+1).setValues([['54篇の記事を一つずつ読み、受けた印象をお答えください。正解・不正解はありません。']]);
  });
  SpreadsheetApp.flush();props.setProperty('STUDY_54_SETTINGS_V1','done');
}
function spreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(STUDY_PROPERTY);
  if (!id) throw new Error('管理者がdoGetを実行して初期設定を完了してください。');
  return SpreadsheetApp.openById(id);
}
function table_(ss,name,headers) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error(name + 'シートが見つかりません。');
  const rows = sheet.getDataRange().getValues(), h = rows.shift().map(String);
  if (headers.some(k => !h.includes(k)) || new Set(h).size !== h.length) throw new Error(name + 'の列名を確認してください。');
  return rows.filter(r => r.some(v => v !== '' && v !== false)).map(r => Object.fromEntries(headers.map(k => [k,r[h.indexOf(k)]])));
}
function bool_(v,name) {
  if (v === true || String(v).trim().toUpperCase() === 'TRUE') return true;
  if (v === false || String(v).trim().toUpperCase() === 'FALSE') return false;
  throw new Error(name + ' はTRUEまたはFALSEにしてください。');
}
function config_(ss) {
  const settings = Object.fromEntries(table_(ss,'Settings',['key','value']).map(r => [r.key,r.value]));
  const questions = table_(ss,'Questions',QUESTION_HEADERS).filter(q => bool_(q.enabled,'Questions.enabled')).map(q => ({id:String(q.id).trim(),label:String(q.label).trim(),low:String(q.low).trim(),high:String(q.high).trim(),type:String(q.type||'likert7').trim(),block:String(q.block||'Q2').trim()}));
  StudyCore.validateQuestions(questions);
  if (!String(settings.title || '').trim() || !String(settings.intro || '').trim()) throw new Error('Settingsのtitleとintroを入力してください。');
  return {title:String(settings.title),intro:String(settings.intro),demo:bool_(settings.demo,'demo'),accepting:bool_(settings.accepting_responses,'accepting_responses'),questions,count:54};
}
function bank_(ss) {
  const bank = table_(ss,'Stimuli',STIMULUS_HEADERS).map(x => Object.fromEntries(STIMULUS_HEADERS.map(k => [k,String(x[k])])));
  StudyCore.validateBank(bank); return bank;
}
function fingerprint_(bank,config) {
  const canonical = bank.slice().sort((a,b) => a.id.localeCompare(b.id));
  const q = config.questions.slice().sort((a,b) => a.id.localeCompare(b.id));
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify([canonical,q,config.title,config.intro,config.demo,'balanced54-q1-gender-v2']));
  return bytes.map(b => ('0'+(b & 255).toString(16)).slice(-2)).join('').slice(0,20);
}
function tokenCheck_(token) { if (typeof token !== 'string' || !/^[a-f0-9]{48}$/.test(token)) throw new Error('回答セッションが不正です。'); }
function findRow_(sheet,token) {
  if (sheet.getLastRow() < 2) return 0;
  const i = sheet.getRange(2,1,sheet.getLastRow()-1,1).getValues().findIndex(r => r[0] === token);
  return i < 0 ? 0 : i + 2;
}
function readState_(sheet,row) {
  return JSON.parse(sheet.getRange(row,7,1,PAYLOAD_PARTS).getValues()[0].join(''));
}
function rowFor_(state) {
  const json = JSON.stringify(state);
  if (json.length > PAYLOAD_PARTS * PAYLOAD_SIZE) throw new Error('文章と質問の合計が長すぎます。管理者へお知らせください。');
  return [state.token,state.id,state.createdAt,state.updatedAt,state.status,state.version].concat(Array.from({length:PAYLOAD_PARTS},(_,i) => json.slice(i*PAYLOAD_SIZE,(i+1)*PAYLOAD_SIZE)));
}
function getStudyInfo() { return config_(spreadsheet_()); }
function startSession(token) {
  tokenCheck_(token);
  return locked_(() => {
    const ss=spreadsheet_(), sheet=ss.getSheetByName('Sessions'), row=findRow_(sheet,token);
    if (row) {
      const existing=readState_(sheet,row);
      if(existing.status==='submitted') writeResponses_(ss,existing);
      return existing;
    }
    const config=config_(ss);
    if (!config.accepting) throw new Error('ただいま準備中です。しばらくしてからお試しください。');
    const bank=bank_(ss), seed=parseInt(Utilities.getUuid().replace(/-/g,'').slice(0,8),16);
    const allocated=StudyCore.allocate54(bank,config.questions,seed), now=new Date().toISOString();
    const state={id:'P-'+Utilities.getUuid(),token,version:fingerprint_(bank,config),seed,items:allocated.items,questions:allocated.questions,
      requiresGender:true,demographics:null,answers:{},position:0,revision:0,status:'in_progress',createdAt:now,updatedAt:now,demo:config.demo,title:config.title,mode:'gas'};
    state.shortId=participant_(ss,state.id,state.version).id;
    sheet.appendRow(rowFor_(state)); SpreadsheetApp.flush(); return state;
  });
}
function saveSession(token,revision,answers,position,finalize) {
  return saveState_(token,revision,answers,position,finalize,null);
}
function saveProgress(token,revision,answers,position,finalize,requestId) {
  if(typeof requestId!=='string'||!/^[a-f0-9]{48}$/.test(requestId)) throw new Error('保存要求IDが不正です。');
  const state=saveState_(token,revision,answers,position,finalize,requestId);
  return {revision:state.revision,status:state.status,lastRequestId:state.lastRequestId||'',updatedAt:state.updatedAt,completedAt:state.completedAt||''};
}
function saveState_(token,revision,answers,position,finalize,requestId) {
  tokenCheck_(token);
  if (!Number.isInteger(revision) || !Number.isInteger(position) || typeof finalize !== 'boolean') throw new Error('保存要求が不正です。');
  return locked_(() => {
    const ss=spreadsheet_(),sheet=ss.getSheetByName('Sessions'),row=findRow_(sheet,token);
    if (!row) throw new Error('回答セッションが見つかりません。');
    const state=readState_(sheet,row);
    if (position<0 || position>state.items.length) throw new Error('記事番号が不正です。');
    if (state.status==='submitted') { writeResponses_(ss,state); return state; }
    if (requestId && state.lastRequestId===requestId) return state;
    if (state.revision!==revision) throw new Error('別のタブで回答が更新されました。このページを再読み込みしてください。');
    if(state.requiresGender && !state.demographics && (finalize || Object.keys(answers||{}).length)) throw new Error('先に性別の入力を完了してください。');
    state.answers=StudyCore.validateAnswers(state.items,state.questions,answers,finalize);
    state.position=position;state.revision++;state.updatedAt=new Date().toISOString();
    state.lastRequestId=requestId||'';
    if(finalize) { state.status='submitted';state.completedAt=state.updatedAt; }
    sheet.getRange(row,1,1,SESSION_HEADERS.length).setValues([rowFor_(state)]);SpreadsheetApp.flush();
    if(finalize) writeResponses_(ss,state);return state;
  });
}
function textCell_(value) { return typeof value==='string' && /^[=+@-]/.test(value) ? "'"+value : value; }
function writeResponses_(ss,state) {
  const sheet=ss.getSheetByName('Responses'),count=state.items.length*state.questions.length;
  const existing=sheet.getLastRow()>1 ? sheet.getRange(2,1,sheet.getLastRow()-1,1).getValues().filter(r=>r[0]===state.id).length : 0;
  if(existing===count) { syncAnalysis_(ss); return; }
  if(existing) throw new Error('回答一覧に不完全な記録があります。管理者へ回答番号をお知らせください。');
  const rows=state.items.flatMap((x,i)=>state.questions.map((q,qi)=>[
    state.id,state.version,state.status,state.seed,i+1,x.id,x.category,x.justice,x.envy,x.sexual,qi+1,q.id,state.answers[x.id][q.id],state.completedAt,q.label,q.low,q.high,x.text,state.demo
  ].map(textCell_)));
  const start=sheet.getLastRow()+1;
  if(sheet.getMaxRows()<start+rows.length-1) sheet.insertRowsAfter(sheet.getMaxRows(),start+rows.length-1-sheet.getMaxRows());
  sheet.getRange(start,1,rows.length,RESPONSE_HEADERS.length).setValues(rows);SpreadsheetApp.flush();
  syncAnalysis_(ss);
}

const PARTICIPANT_HEADERS = ['participant_id','original_participant_id','gender','gender_other','version'];
const ANALYSIS_HEADERS = ['participant_id','stimulus_id','question_id','rating','version','gender'];
function derivedSheet_(ss,name,headers) {
  let sheet=ss.getSheetByName(name);
  if (!sheet) {
    sheet=ss.insertSheet(name);sheet.getRange(1,1,1,headers.length).setValues([headers]);sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,headers.length).setBackground('#dcece3').setFontWeight('bold');
    sheet.setColumnWidths(1,headers.length,190);
    if(name==='Participants') {sheet.setColumnWidth(2,340);sheet.setColumnWidth(4,260);}
  }
  return sheet;
}
function participant_(ss,originalId,version) {
  const sheet=derivedSheet_(ss,'Participants',PARTICIPANT_HEADERS),rows=sheet.getDataRange().getValues().slice(1);
  const i=rows.findIndex(r=>r[1]===originalId);
  if(i>=0)return {id:rows[i][0],row:i+2};
  const max=rows.reduce((n,r)=>Math.max(n,/^P[0-9]+$/.test(r[0])?Number(r[0].slice(1)):0),0);
  const id='P'+String(max+1).padStart(4,'0');sheet.appendRow([id,originalId,'','',version]);
  return {id,row:sheet.getLastRow()};
}
function syncAnalysis_(ss) {
  const raw=table_(ss,'Responses',RESPONSE_HEADERS),sheet=derivedSheet_(ss,'Analysis',ANALYSIS_HEADERS);
  const lookup=new Map(table_(ss,'Participants',PARTICIPANT_HEADERS).map(r=>[r.original_participant_id,{id:r.participant_id,gender:r.gender}]));
  const rows=raw.map(r=>{
    if(!lookup.has(r.participant_id))lookup.set(r.participant_id,{id:participant_(ss,r.participant_id,r.version).id,gender:''});
    return [lookup.get(r.participant_id).id,r.stimulus_id,r.question_id,r.rating,r.version,lookup.get(r.participant_id).gender].map(textCell_);
  });
  if(sheet.getMaxRows()<rows.length+1)sheet.insertRowsAfter(sheet.getMaxRows(),rows.length+1-sheet.getMaxRows());
  if(rows.length)sheet.getRange(2,1,rows.length,ANALYSIS_HEADERS.length).setValues(rows);
  // Only the derived analysis view is rebuilt. Responses and Sessions are never rewritten here.
  if(sheet.getLastRow()>rows.length+1)sheet.getRange(rows.length+2,1,sheet.getLastRow()-rows.length-1,ANALYSIS_HEADERS.length).clearContent();
  SpreadsheetApp.flush();
}
function upgradeQuestionnaire_() {
  const props=PropertiesService.getScriptProperties();
  if(props.getProperty('STUDY_Q1_GENDER_V2')==='done')return;
  const ss=spreadsheet_(),questions=ss.getSheetByName('Questions');
  if(!ss.getSheetByName('Questions_previous')) {
    const old=questions.getDataRange().getValues(),backup=ss.insertSheet('Questions_previous');
    backup.getRange(1,1,old.length,old[0].length).setValues(old);backup.setFrozenRows(1);
  }
  questions.getDataRange().clearContent();
  questions.getRange(1,1,1,QUESTION_HEADERS.length).setValues([QUESTION_HEADERS]);
  questions.getRange(2,1,StudyCore.QUESTIONS.length,QUESTION_HEADERS.length).setValues(StudyCore.QUESTIONS.map(q=>[q.id,q.label,q.low,q.high,true,q.type,q.block]));
  questions.setColumnWidths(6,2,120);
  const settings=ss.getSheetByName('Settings'),settingsRows=settings.getDataRange().getValues();
  const guide=settingsRows.findIndex(r=>r[0]==='editing_guide');
  if(guide>=0)settings.getRange(guide+1,2).setValues([['Stimuli.text＝本文。Questions.label＝質問。binaryのlow/high＝0/1の選択肢、likert7のlow/high＝1/7点の説明。block Q1は先頭固定、Q2はランダム。']]);
  const sessions=ss.getSheetByName('Sessions');
  derivedSheet_(ss,'Participants',PARTICIPANT_HEADERS);
  for(let row=2;row<=sessions.getLastRow();row++) {
    const s=readState_(sessions,row),p=participant_(ss,s.id,s.version);
    if(s.demographics)ss.getSheetByName('Participants').getRange(p.row,3,1,2).setValues([[{female:'女',male:'男',other:'その他'}[s.demographics.gender]||'',textCell_(s.demographics.other||'')]]);
  }
  syncAnalysis_(ss);props.setProperty('STUDY_Q1_GENDER_V2','done');SpreadsheetApp.flush();
}
function saveDemographics(token,value) {
  tokenCheck_(token);const clean=StudyCore.validateDemographics(value);
  return locked_(()=>{
    const ss=spreadsheet_(),sheet=ss.getSheetByName('Sessions'),row=findRow_(sheet,token);
    if(!row)throw new Error('回答セッションが見つかりません。');
    const state=readState_(sheet,row);
    if(state.demographics && JSON.stringify(state.demographics)!==JSON.stringify(clean))throw new Error('性別はすでに登録されています。');
    state.demographics=clean;
    const p=participant_(ss,state.id,state.version);state.shortId=p.id;
    ss.getSheetByName('Participants').getRange(p.row,3,1,2).setValues([[{female:'女',male:'男',other:'その他'}[clean.gender],textCell_(clean.other)]]);
    sheet.getRange(row,1,1,SESSION_HEADERS.length).setValues([rowFor_(state)]);
    SpreadsheetApp.flush();return state;
  });
}
