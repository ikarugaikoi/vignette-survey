const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
function runtime() {
  const sheets = new Map(), props = new Map(); let locked = false;
  function newSheet(name) {
    const sheet = { name, rows: [], maxRows: 1000,
      setName(n) { sheets.delete(this.name); this.name=n; sheets.set(n,this); },
      getRange(row,col,nr=1,nc=1) { return { getValues: () => Array.from({length:nr},(_,r)=>Array.from({length:nc},(_,c)=>sheet.rows[row-1+r]?.[col-1+c]??'')), setValues(values) { values.forEach((line,r)=>line.forEach((v,c)=>{(sheet.rows[row-1+r] ||= [])[col-1+c]=v;})); } }; },
      getDataRange() {return this.getRange(1,1,this.rows.length,Math.max(...this.rows.map(r=>r.length)));},
      getLastRow(){return this.rows.length;},appendRow(row){this.rows.push(row.slice());},setFrozenRows(){},getMaxRows(){return this.maxRows;},insertRowsAfter(_,n){this.maxRows+=n;}
    }; sheets.set(name,sheet);return sheet;
  }
  const ss={getSheets:()=>Array.from(sheets.values()),insertSheet:newSheet,getSheetByName:n=>sheets.get(n),getId:()=> 'test-sheet',getUrl:()=> 'test://sheet'};
  const context=vm.createContext({console,Date,JSON,Math,Set,Map,PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k),setProperty:(k,v)=>props.set(k,v)})},SpreadsheetApp:{create:()=>{newSheet('Sheet1');return ss;},openById:()=>ss,flush(){}},Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,s)=>Array.from(crypto.createHash('sha256').update(s).digest()),formatDate:()=> '20261113_000000'},LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true;},releaseLock(){locked=false;}})}});
  for(const f of ['core.js','demo-bank.js','Code.gs'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',f),'utf8'),context,{filename:f});
  context.setupStudy_();return {context,sheets,ss};
}
const tok=n=>n.toString(16).padStart(48,'0');
test('backend persists assignments, resumes, creates a fresh randomized block after four allocations',()=>{
  const {context:c,sheets}=runtime(); const sessions=Array.from({length:5},(_,i)=>c.startSession(tok(i+1)));
  assert.equal(new Set(sessions.slice(0,4).flatMap(s=>s.items.map(x=>x.id))).size,108);
  assert.equal(sessions[0].blockId,sessions[3].blockId);assert.notEqual(sessions[3].blockId,sessions[4].blockId);
  const old=JSON.stringify(sessions[0]);assert.equal(JSON.stringify(c.startSession(tok(1))),old);
  assert.equal(sheets.get('Sessions').rows.length,6);assert.equal(sheets.get('Blocks').rows.length,3);
});
test('backend validates save, detects stale writes, and makes final submission idempotent',()=>{
  const {context:c,sheets}=runtime();const s=c.startSession(tok(1));const answers=Object.fromEntries(s.items.map(x=>[x.id,Object.fromEntries(s.questions.map(q=>[q.id,5]))]));
  assert.throws(()=>c.saveSession(tok(1),0,{},27,true));assert.throws(()=>c.saveSession(tok(1),0,answers,28,false));
  const updated=c.saveSession(tok(1),0,answers,3,false);assert.equal(updated.revision,1);
  assert.throws(()=>c.saveSession(tok(1),0,answers,3,false));
  const done=c.saveSession(tok(1),1,answers,27,true);assert.equal(done.status,'submitted');
  const retry=c.saveSession(tok(1),1,answers,27,true);assert.equal(JSON.stringify(retry),JSON.stringify(done));
  assert.equal(sheets.get('Sessions').rows.length,2);
  assert.equal(sheets.get('Responses').rows.length,82);
  const live=sheets.get('Responses').rows;
  assert.equal(live[0][15],'question_text');
  assert.equal(live[3][12],'intimacy_imagery');
  assert.match(live[3][15],/身体的に親密な場面/);
  assert.throws(()=>c.startSession('bad-token'));assert.throws(()=>c.saveSession(tok(2),0,answers,0,false));
  c.exportResponses_();const exported=Array.from(sheets.values()).find(x=>x.name.startsWith('Responses_'));assert.equal(exported.rows.length,82);
  assert.ok(!exported.rows[0].includes('token'));
});
test('changing materials starts a new version but preserves existing sessions',()=>{
  const {context:c,sheets}=runtime();const old=c.startSession(tok(1));
  sheets.get('Stimuli').rows[1][5]+=' 追記。';const newer=c.startSession(tok(2));
  assert.notEqual(old.version,newer.version);assert.notEqual(old.blockId,newer.blockId);
  assert.equal(JSON.stringify(c.startSession(tok(1))),JSON.stringify(old));
});

test('a response-table write failure can be retried without duplicating a completed submission',()=>{
  const {context:c,sheets}=runtime();const s=c.startSession(tok(1));
  const answers=Object.fromEntries(s.items.map(x=>[x.id,Object.fromEntries(s.questions.map(q=>[q.id,4]))]));
  const sheet=sheets.get('Responses'),original=sheet.getRange;let fail=true;
  sheet.getRange=function(...args){const range=original.apply(this,args),write=range.setValues;range.setValues=function(values){if(fail&&args[0]>1){fail=false;throw new Error('Simulated write outage');}return write.call(this,values);};return range;};
  assert.throws(()=>c.saveSession(tok(1),0,answers,27,true),/Simulated write outage/);
  assert.equal(JSON.parse(sheets.get('Sessions').rows[1][6]).status,'submitted');
  assert.equal(sheet.rows.length,1);
  const done=c.saveSession(tok(1),0,answers,27,true);assert.equal(done.status,'submitted');
  c.saveSession(tok(1),0,answers,27,true);assert.equal(sheet.rows.length,82);
});
