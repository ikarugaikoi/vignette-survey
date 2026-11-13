const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
function runtime() {
  const sheets = new Map(), props = new Map(); let locked = false;
  function newSheet(name) {
    const sheet = { name, rows: [], maxRows: 1000,
      getLastColumn(){return Math.max(1,...this.rows.map(r=>r.length));}, setColumnWidth(){},setColumnWidths(){},setName(n) { sheets.delete(this.name); this.name=n; sheets.set(n,this); },
      getRange(row,col,nr=1,nc=1) { return { setBackground(){return this;},setFontWeight(){return this;},setWrap(){return this;},setFontColor(){return this;},insertCheckboxes(){return this;},clearContent(){for(let r=row-1;r<row-1+nr;r++)for(let c=col-1;c<col-1+nc;c++)if(sheet.rows[r])sheet.rows[r][c]='';return this;},getValues: () => Array.from({length:nr},(_,r)=>Array.from({length:nc},(_,c)=>sheet.rows[row-1+r]?.[col-1+c]??'')), setValues(values) { values.forEach((line,r)=>line.forEach((v,c)=>{(sheet.rows[row-1+r] ||= [])[col-1+c]=v;})); } }; },
      getDataRange() {return this.getRange(1,1,this.rows.length,Math.max(...this.rows.map(r=>r.length)));},
      getLastRow(){return this.rows.length;},appendRow(row){this.rows.push(row.slice());},setFrozenRows(){},getMaxRows(){return this.maxRows;},insertRowsAfter(_,n){this.maxRows+=n;}
    }; sheets.set(name,sheet);return sheet;
  }
  const ss={getSheets:()=>Array.from(sheets.values()),insertSheet:newSheet,getSheetByName:n=>sheets.get(n),getId:()=> 'test-sheet',getUrl:()=> 'test://sheet'};
  const context=vm.createContext({console,Date,JSON,Math,Set,Map,PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k),setProperty:(k,v)=>props.set(k,v)})},SpreadsheetApp:{create:()=>{newSheet('Sheet1');return ss;},openById:()=>ss,flush(){}},Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,s)=>Array.from(crypto.createHash('sha256').update(s).digest()),formatDate:()=> '20261113_000000'},LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true;},releaseLock(){locked=false;}})}});
  for(const f of ['core.js','demo-bank.js','Code.gs'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',f),'utf8'),context,{filename:f});
  context.setupStudy_();context.upgradeQuestionnaire_();return {context,sheets,ss,props};
}

module.exports={runtime};
