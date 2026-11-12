/** Google Apps Script backend. Run doGet() once as the study owner to initialize. */
const STUDY_TITLE = '記事印象調査（グループ内試用）';
const STUDY_IS_DEMO = true;
const SESSION_HEADERS = ['token', 'block_id', 'slot', 'created_at', 'updated_at', 'status', 'payload_json'];
const BLOCK_HEADERS = ['block_id', 'bank_version', 'seed', 'schedules_json'];
const STIMULUS_HEADERS = ['id', 'category', 'justice', 'envy', 'sexual', 'text'];
const RESPONSE_HEADERS = ['participant_id','bank_version','status','block_id','slot','seed','presentation_order','stimulus_id','category','justice','envy','sexual','question_id','rating','completed_at','question_text','scale_low','scale_high'];

function doGet() {
  if (!PropertiesService.getScriptProperties().getProperty('STUDY_SHEET_ID')) locked_(() => setupStudy_());
  return HtmlService.createHtmlOutputFromFile('Index').setTitle(STUDY_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function setupStudy_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('STUDY_SHEET_ID')) {
    console.log('既存の調査シート: ' + SpreadsheetApp.openById(props.getProperty('STUDY_SHEET_ID')).getUrl());
    return;
  }
  const ss = SpreadsheetApp.create(STUDY_TITLE + ' — 回答データ');
  const stimuli = ss.getSheets()[0]; stimuli.setName('Stimuli');
  stimuli.getRange(1, 1, 1, STIMULUS_HEADERS.length).setValues([STIMULUS_HEADERS]);
  stimuli.getRange(2, 1, DEMO_BANK.length, STIMULUS_HEADERS.length)
    .setValues(DEMO_BANK.map(x => STIMULUS_HEADERS.map(k => x[k])));
  ss.insertSheet('Sessions').getRange(1, 1, 1, SESSION_HEADERS.length).setValues([SESSION_HEADERS]);
  ss.insertSheet('Blocks').getRange(1, 1, 1, BLOCK_HEADERS.length).setValues([BLOCK_HEADERS]);
  responseSheet_(ss);
  [stimuli, ss.getSheetByName('Sessions'), ss.getSheetByName('Blocks')].forEach(s => s.setFrozenRows(1));
  props.setProperty('STUDY_SHEET_ID', ss.getId());
  console.log('調査シート: ' + ss.getUrl());
}

function spreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('STUDY_SHEET_ID');
  if (!id) throw new Error('管理者がsetupStudy_を実行する必要があります。');
  return SpreadsheetApp.openById(id);
}
function tokenCheck_(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{48}$/.test(token)) throw new Error('回答セッションが不正です。');
}
function bank_(ss) {
  const rows = ss.getSheetByName('Stimuli').getDataRange().getValues();
  const header = rows.shift().map(String);
  if (STIMULUS_HEADERS.some(h => !header.includes(h))) throw new Error('Stimuliの列名が不正です。');
  const bank = rows.filter(r => r.some(v => v !== '')).map(r => Object.fromEntries(STIMULUS_HEADERS.map(h => [h, String(r[header.indexOf(h)])])));
  StudyCore.validateBank(bank);
  return bank;
}
function fingerprint_(bank) {
  const canonical = bank.slice().sort((a, b) => a.id.localeCompare(b.id));
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify([canonical, StudyCore.QUESTIONS, STUDY_IS_DEMO]));
  return bytes.map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('').slice(0, 20);
}
function locked_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function sessionRows_(sheet) {
  return sheet.getLastRow() <= 1 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, SESSION_HEADERS.length).getValues();
}
function rowFor_(state) {
  const json = JSON.stringify(state);
  if (json.length > 45000) throw new Error('保存データが大きすぎます。刺激文の長さを確認してください。');
  return [state.token, state.blockId, state.slot, state.createdAt, state.updatedAt, state.status, json];
}

function getStudyInfo() {
  return { title: STUDY_TITLE, demo: STUDY_IS_DEMO, questions: StudyCore.QUESTIONS };
}

function startSession(token) {
  tokenCheck_(token);
  return locked_(() => {
    const ss = spreadsheet_(), sheet = ss.getSheetByName('Sessions'), rows = sessionRows_(sheet);
    const existing = rows.find(r => r[0] === token);
    if (existing) return JSON.parse(existing[6]);
    const bank = bank_(ss), version = fingerprint_(bank), blocks = ss.getSheetByName('Blocks');
    if (!STUDY_IS_DEMO && bank.some(x => x.id.startsWith('DEMO-'))) throw new Error('本番用の刺激文へ差し替えてから調査を開始してください。');
    let block = blocks.getLastRow() > 1 ? blocks.getRange(blocks.getLastRow(), 1, 1, 4).getValues()[0] : null;
    let used = block ? rows.filter(r => r[1] === block[0]).length : 0;
    if (!block || block[1] !== version || used >= 4) {
      const id = 'B-' + Utilities.getUuid(), seed = parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 8), 16);
      const schedules = StudyCore.allocateBlock(bank, seed), json = JSON.stringify(schedules);
      if (json.length > 45000) throw new Error('108篇の本文が長すぎます。1篇100字程度の刺激文にしてください。');
      block = [id, version, seed, json]; blocks.appendRow(block); SpreadsheetApp.flush(); used = 0;
    }
    const now = new Date().toISOString();
    const state = { id: 'P-' + Utilities.getUuid(), token, version, blockId: block[0], slot: used,
      seed: Number(block[2]), items: JSON.parse(block[3])[used], questions: StudyCore.QUESTIONS,
      answers: {}, position: 0, revision: 0, status: 'in_progress', createdAt: now, updatedAt: now,
      demo: STUDY_IS_DEMO, mode: 'gas' };
    sheet.appendRow(rowFor_(state)); SpreadsheetApp.flush();
    return state;
  });
}

function saveSession(token, revision, answers, position, finalize) {
  tokenCheck_(token);
  if (!Number.isInteger(revision) || !Number.isInteger(position) || position < 0 || position > 27 || typeof finalize !== 'boolean') throw new Error('保存要求が不正です。');
  return locked_(() => {
    const ss = spreadsheet_(), sheet = ss.getSheetByName('Sessions'), rows = sessionRows_(sheet);
    const i = rows.findIndex(r => r[0] === token);
    if (i < 0) throw new Error('回答セッションが見つかりません。');
    const state = JSON.parse(rows[i][6]);
    if (state.status === 'submitted') { writeSubmittedResponses_(ss, state); return state; }
    if (state.revision !== revision) throw new Error('別のタブまたは保存要求で回答が更新されました。このページを再読み込みしてください。');
    state.answers = StudyCore.validateAnswers(state.items, state.questions, answers, finalize);
    state.position = position; state.revision++; state.updatedAt = new Date().toISOString();
    if (finalize) { state.status = 'submitted'; state.completedAt = state.updatedAt; }
    sheet.getRange(i + 2, 1, 1, SESSION_HEADERS.length).setValues([rowFor_(state)]); SpreadsheetApp.flush();
    if (finalize) writeSubmittedResponses_(ss, state);
    return state;
  });
}

function responseSheet_(ss) {
  let sheet = ss.getSheetByName('Responses');
  if (!sheet) {
    sheet = ss.insertSheet('Responses');
    sheet.getRange(1, 1, 1, RESPONSE_HEADERS.length).setValues([RESPONSE_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}
function writeSubmittedResponses_(ss, state) {
  const sheet = responseSheet_(ss), count = state.items.length * state.questions.length;
  const existing = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().filter(r => r[0] === state.id).length : 0;
  if (existing === count) return;
  if (existing) throw new Error('回答一覧に不完全な記録があります。管理者に回答番号をお知らせください。');
  const rows = state.items.flatMap((x, i) => state.questions.map(q => [
    state.id, state.version, state.status, state.blockId, state.slot + 1, state.seed, i + 1,
    x.id, x.category, x.justice, x.envy, x.sexual, q.id, state.answers[x.id][q.id],
    state.completedAt, q.label, q.low, q.high
  ]));
  const start = sheet.getLastRow() + 1;
  if (sheet.getMaxRows() < start + rows.length - 1) sheet.insertRowsAfter(sheet.getMaxRows(), start + rows.length - 1 - sheet.getMaxRows());
  sheet.getRange(start, 1, rows.length, RESPONSE_HEADERS.length).setValues(rows);
  SpreadsheetApp.flush();
}

/** Run from the Apps Script editor. This private function is not callable by respondents. */
function exportResponses_() {
  return locked_(() => {
    const ss = spreadsheet_(), source = sessionRows_(ss.getSheetByName('Sessions'));
    const rows = [['participant_id','bank_version','status','block_id','slot','seed','presentation_order','stimulus_id','category','justice','envy','sexual','question_id','rating','completed_at','question_text','scale_low','scale_high']];
    source.forEach(row => {
      const s = JSON.parse(row[6]);
      s.items.forEach((x, i) => s.questions.forEach(q => rows.push([
        s.id, s.version, s.status, s.blockId, s.slot + 1, s.seed, i + 1, x.id, x.category,
        x.justice, x.envy, x.sexual, q.id, s.answers[x.id]?.[q.id] ?? '', s.completedAt || '', q.label, q.low, q.high
      ])));
    });
    const name = 'Responses_' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmmss') + '_' + Utilities.getUuid().slice(0, 4);
    const target = ss.insertSheet(name);
    if (target.getMaxRows() < rows.length) target.insertRowsAfter(target.getMaxRows(), rows.length - target.getMaxRows());
    target.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
    target.setFrozenRows(1);
    console.log('回答データを出力しました: ' + name);
  });
}
