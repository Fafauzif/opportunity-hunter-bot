/* Offline Apps Script emulator. It checks data behavior, not Google's live UI. */
const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');
const assert = require('assert/strict');

function col(s) { return [...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0); }
class Range {
  constructor(sheet,r,c,nr=1,nc=1){assert(r+nr-1<=sheet.getMaxRows(),'row range exceeds grid');assert(c+nc-1<=sheet.getMaxColumns(),'column range exceeds grid');Object.assign(this,{sheet,r,c,nr,nc});}
  getValues(){return Array.from({length:this.nr},(_,i)=>Array.from({length:this.nc},(_,j)=>this.sheet.cells[this.r+i-1]?.[this.c+j-1]??''));}
  getDisplayValues(){return this.getValues().map(row=>row.map(v=>v instanceof Date?v.toISOString().slice(0,10):String(v)));}
  setValues(rows){assert.equal(rows.length,this.nr);for(const row of rows)assert.equal(row.length,this.nc);rows.forEach((row,i)=>row.forEach((v,j)=>{this.sheet.cells[this.r+i-1]??=[];this.sheet.cells[this.r+i-1][this.c+j-1]=v;}));return this;}
  getValue(){return this.getValues()[0][0];}
  getFormulas(){return this.getValues().map(row=>row.map(v=>typeof v==='string'&&v.startsWith('=')?v:''));}
  setValue(v){return new Range(this.sheet,this.r,this.c).setValues([[v]]);}
  setFormulas(rows){return this.setValues(rows);}
  setNotes(rows){rows.forEach((row,i)=>row.forEach((v,j)=>this.sheet.notes[`${this.r+i},${this.c+j}`]=v));return this;}
  getNote(){return this.sheet.notes[`${this.r},${this.c}`]||'';}
  getRow(){return this.r;}
  getColumn(){return this.c;}
  getSheet(){return this.sheet;}
  getA1Notation(){return this.r===2&&this.c===2?'B2':'A1';}
  createFilter(){this.sheet.filter={remove:()=>{this.sheet.filter=null;}};return this.sheet.filter;}
  merge(){return this;}
  setWrap(){return this;}
  setFontWeight(){return this;}
  setBackground(){return this;}
  setFontColor(){return this;}
  setNumberFormat(){return this;}
  setDataValidation(){return this;}
}
let nextId=1;
class Sheet {
  constructor(name,cells=[]){Object.assign(this,{name,cells,notes:{},id:nextId++,hidden:false,protections:[]});}
  getName(){return this.name;}
  getSheetId(){return this.id;}
  getLastRow(){let last=0;this.cells.forEach((r,i)=>{if(r?.some(v=>v!==''&&v!==undefined&&v!==null))last=i+1;});return last;}
  getLastColumn(){return Math.max(0,...this.cells.map(r=>{let n=0;(r||[]).forEach((v,i)=>{if(v!==''&&v!==undefined&&v!==null)n=i+1;});return n;}));}
  getMaxRows(){return Math.max(1000,this.cells.length,this.maxRows||0);}
  getMaxColumns(){return Math.max(26,this.getLastColumn(),this.maxCols||0);}
  insertRowsAfter(n,count){this.maxRows=n+count;return this;}
  insertColumnsAfter(n,count){this.maxCols=n+count;return this;}
  getRange(r,c,nr=1,nc=1){if(typeof r==='string'){const m=r.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);assert(m,r);return new Range(this,Number(m[2]),col(m[1]),m[4]?Number(m[4])-Number(m[2])+1:1,m[3]?col(m[3])-col(m[1])+1:1);}return new Range(this,r,c,nr,nc);}
  getDataRange(){return this.getRange(1,1,Math.max(this.getLastRow(),1),Math.max(this.getLastColumn(),1));}
  appendRow(row){this.cells[this.getLastRow()]=row.slice();return this;}
  clearContents(){this.cells=[];return this;}
  clearNotes(){this.notes={};return this;}
  setFrozenRows(){return this;}
  setFrozenColumns(){return this;}
  setColumnWidth(){return this;}
  setRowHeights(){return this;}
  setConditionalFormatRules(){return this;}
  setTabColor(){return this;}
  getFilter(){return this.filter;}
  getProtections(){return this.protections;}
  protect(){const p={setDescription(){return this;},setWarningOnly(){return this;}};this.protections.push(p);return p;}
  isSheetHidden(){return this.hidden;}
  hideSheet(){this.hidden=true;return this;}
  showSheet(){this.hidden=false;return this;}
  getActiveRange(){return this.selection;}
}
class Workbook {
  constructor(){this.sheets=[];this.backups=[];this.id='test-sheet';}
  getSheetByName(n){return this.sheets.find(s=>s.name===n)||null;}
  insertSheet(n){assert(!this.getSheetByName(n));const s=new Sheet(n);this.sheets.push(s);return s;}
  getSheets(){return this.sheets;}
  getId(){return this.id;}
  getName(){return 'Test opportunity database';}
  copy(n){this.backups.push({name:n,cells:JSON.stringify(this.sheets.map(s=>({name:s.name,cells:s.cells})))});return {getUrl:()=>`https://example.org/backup/${this.backups.length}`};}
  setActiveSheet(s){this.active=s;return s;}
  getActiveSheet(){return this.active;}
  moveActiveSheet(n){this.sheets.splice(this.sheets.indexOf(this.active),1);this.sheets.splice(n-1,0,this.active);}
}
const workbook=new Workbook();
const props={SPREADSHEET_ID:'test-sheet',WEBHOOK_SECRET:'test-webhook-secret'};
const builder={whenDateBefore(){return this;},setBackground(){return this;},setRanges(){return this;},requireValueInList(){return this;},setAllowInvalid(){return this;},build(){return {};}};
const sandbox={Date,JSON,Set,Map,console,Number,String,Array,Math,Object,RegExp,Error,
  SpreadsheetApp:{getActiveSpreadsheet:()=>workbook,openById:()=>workbook,getUi:()=>({alert(){}}),ProtectionType:{SHEET:'SHEET'},newConditionalFormatRule:()=>Object.create(builder),newDataValidation:()=>Object.create(builder)},
  LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||null,setProperty(k,v){props[k]=String(v);},setProperties(o){Object.assign(props,o);}})},
  Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,v)=>[...crypto.createHash('sha256').update(String(v)).digest()],formatDate:(d,tz,fmt)=>{const iso=new Date(d.getTime()+7*3600000).toISOString();return fmt==='yyyy-MM-dd'?iso.slice(0,10):iso.slice(0,19).replace('T',' ');}},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({text:s,setMimeType(){return this;}})}
};
const context=vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(require('path').join(__dirname,'..','apps_script.gs'),'utf8'),context);
function call(name,...args){return sandbox[name](...args);}
function evaluate(s){return vm.runInContext(s,context);}
let checks=0;
function check(name,fn){fn();checks++;console.log('PASS '+name);}

check('formula injection escaping',()=>assert.equal(call('v2Safe_','=IMPORTXML("bad")'),'\'=IMPORTXML("bad")'));
check('case-sensitive URL path preserved',()=>assert.equal(call('v2Canonical_','https://www.EXAMPLE.org/Event/?b=2&utm_source=x&a=1#x'),'https://example.org/Event?a=1&b=2'));
check('invalid calendar date rejected',()=>assert.equal(call('v2ISO_','2026-02-30'),''));
check('legacy IDs and aliases migrate idempotently',()=>{
  const h=['','Title','Opportunity ID','ID Aliases','Warning Flags'];
  const a='a'.repeat(32),b='b'.repeat(32),c='c'.repeat(32);
  const first=call('v2MigrationRows_',h,[[a,'One','','',''],[b,'Two',c,'','']]);
  assert.equal(first.rows[0][2],a);assert.equal(first.rows[1][2],c);assert(first.rows[1][3].includes(b));
  const again=call('v2MigrationRows_',first.headers,first.rows);
  assert.equal(JSON.stringify(first),JSON.stringify(again));
});
check('duplicate canonical IDs are separated without dropping rows',()=>{
  const fixed=call('v2MigrationRows_',['Title','Opportunity ID','ID Aliases','Warning Flags'],[['One','same','',''],['Two','same','','']]);
  assert.notEqual(fixed.rows[0][1],fixed.rows[1][1]);assert.equal(fixed.rows.length,2);
});

const snapshotArg=process.argv.indexOf('--snapshot');
if(snapshotArg>=0){
  const data=JSON.parse(fs.readFileSync(process.argv[snapshotArg+1],'utf8'));
  for(const tab of data){
    const s=workbook.insertSheet(tab.name);
    for(const row of tab.rows)for(const [ref,raw]of Object.entries(row)){
      const m=ref.match(/^([A-Z]+)(\d+)$/),r=Number(m[2]),c=col(m[1]);s.cells[r-1]??=[];
      const header=s.cells[0]?.[c-1]||'';let value=raw;
      if(r>1&&/^(Date Found|Last Seen|Opening Date|Start Date|End Date|Deadline Date|Last Bot Update|Started At|Finished At|Next Check|Last Checked)$/.test(header)&&/^\d+(\.\d+)?$/.test(raw))value=new Date(Date.UTC(1899,11,30)+Number(raw)*86400000);
      s.cells[r-1][c-1]=value;
    }
  }
  check('snapshot queue dates are eligible before migration or rewriting cells',()=>{
    const rows=call('v2QueueRows_',workbook),today=call('v2Today_');
    const expected=rows.filter(r=>call('v2ISO_',r['Next Check'])<=today).length;
    const legacy=rows.filter(r=>String(r['Next Check']||'')<=today).length;
    const due=call('v2Due_',workbook);
    assert.equal(due.length,Math.min(expected,250));
    assert.equal(call('v2QueueStatus_',workbook).queue_due_now,expected);
    console.log(JSON.stringify({snapshot_queue_rows:call('v2Rows_',workbook.getSheetByName('Bot Queue')).length,enabled_queue_rows:rows.length,legacy_due_count:legacy,fixed_due_count:expected,returned_this_request:due.length}));
  });
}else{
  const h=evaluate('OPPORTUNITY_COLUMNS.map(c=>c[1])');
  const s=workbook.insertSheet('Opportunities');s.cells=[h];
  const row=h.map(()=>''),set=(k,v)=>row[h.indexOf(k)]=v;
  set('Opportunity ID','a'.repeat(32));set('Title','Case Competition 2027');set('Opportunity Type','Competition');set('Category','Marketing & Business Cases');set('Deadline Date','2027-05-01');set('Application Status','Preparing');set('Personal Notes','Do not lose my note');set('Source URL','https://example.org/case');s.cells.push(row);
}
const originalMain=workbook.getSheetByName('Opportunities'),beforeCount=originalMain.getLastRow()-1;
const originalTitles=call('v2Rows_',originalMain).map(r=>r.Title);
check('full upgrade backs up before mutation and keeps webhook secret',()=>{
  call('upgradeOpportunityHunter');assert.equal(workbook.backups.length,1);assert.equal(props.WEBHOOK_SECRET,'test-webhook-secret');assert.equal(props.V2_SCHEMA,'2');
  const health=JSON.parse(call('doGet').text);assert.equal(health.version,'2.0.1');assert.equal(health.schema_version,2);
});
check('all main records and titles preserved',()=>{
  assert.equal(originalMain.getLastRow()-1,beforeCount);assert.equal(JSON.stringify(call('v2Rows_',originalMain).map(r=>r.Title)),JSON.stringify(originalTitles));
});
check('all records have unique canonical IDs after migration',()=>{
  const ids=call('v2Rows_',originalMain).map(r=>r['Opportunity ID']);assert(ids.every(Boolean));assert.equal(new Set(ids).size,ids.length);
});
check('category views have exactly nine columns',()=>{
  for(const cat of evaluate('V2_CATEGORIES'))assert.equal(call('v2ViewSheet_',workbook,cat).getLastColumn(),9);
});
check('rerunning upgrade creates no duplicate rows, queue or backups',()=>{
  const queueCount=workbook.getSheetByName('Bot Queue').getLastRow(),appCount=call('v2ViewSheet_',workbook,'My Applications').getLastRow();
  call('upgradeOpportunityHunter');assert.equal(originalMain.getLastRow()-1,beforeCount);assert.equal(workbook.getSheetByName('Bot Queue').getLastRow(),queueCount);assert.equal(call('v2ViewSheet_',workbook,'My Applications').getLastRow(),appCount);assert.equal(workbook.backups.length,1);
});
check('manual progress migrated and preserved through refresh',()=>{
  const apps=call('v2ViewSheet_',workbook,'My Applications');
  const record=call('v2Rows_',originalMain)[0];
  const existing=call('v2Rows_',apps).find(r=>r['Opportunity ID']===record['Opportunity ID']);
  if(existing)call('v2Write_',apps,existing._row,{Notes:'Keep this user note',Status:'Preparing'});
  else call('v2Append_',apps,{'Opportunity ID':record['Opportunity ID'],Title:record.Title,Notes:'Keep this user note',Status:'Preparing'});
  call('v2Refresh_',workbook);
  assert.equal(call('v2Rows_',apps).find(r=>r['Opportunity ID']===record['Opportunity ID']).Notes,'Keep this user note');
});
check('unrelated formulas survive record updates',()=>{
  const h=call('v2Headers_',originalMain),column=h.length+1;
  call('v2Capacity_',originalMain,2,column);
  originalMain.getRange(1,column).setValue('User Formula');originalMain.getRange(2,column).setValue('=1+2');
  call('v2Write_',originalMain,2,{'Last Bot Update':'test-update'});
  assert.equal(originalMain.getRange(2,column).getValue(),'=1+2');
});
check('monthly reservations persist and reject overspend',()=>{
  const month=call('v2Today_').slice(0,7);
  let a=call('v2Dispatch_',workbook,{action:'reserve_review',month,request_id:'test-1',amount:.6,budget:1});assert(a.allowed);
  let duplicate=call('v2Dispatch_',workbook,{action:'reserve_review',month,request_id:'test-1',amount:.6,budget:1});assert(duplicate.allowed);
  let b=call('v2Dispatch_',workbook,{action:'reserve_review',month,request_id:'test-2',amount:.6,budget:1});assert(!b.allowed);
  call('v2Dispatch_',workbook,{action:'settle_review',request_id:'test-1',amount:.1});
  assert(call('v2Dispatch_',workbook,{action:'reserve_review',month,request_id:'test-2',amount:.6,budget:1}).allowed);
});
check('old edition is not overwritten by same URL new edition',()=>{
  const base={title:'Test Annual Competition',organizer:'Test Organizer',source_url:'https://example.org/annual',category:'Business Cases',opportunity_type:'Competition',record_status:'ACTIVE',deadline_date:'2027-01-01',edition_year:'2027',track:'',opportunity_id:'edition-one'};
  call('v2Save_',workbook,{record:base,operation_id:'test-save-1'});
  call('v2Save_',workbook,{record:{...base,opportunity_id:'edition-two',edition_year:'2028',deadline_date:'2028-01-01'},operation_id:'test-save-2'});
  assert(call('v2Rows_',originalMain).some(r=>r['Opportunity ID']==='edition-one'));
  assert(call('v2Rows_',originalMain).some(r=>r['Opportunity ID']==='edition-two'));
});
check('idempotent save does not duplicate rows',()=>{
  const n=originalMain.getLastRow();call('v2Save_',workbook,{operation_id:'test-save-1'});assert.equal(originalMain.getLastRow(),n);
});
check('notes stay attached to IDs after sorting category view',()=>{
  const s=call('v2ViewSheet_',workbook,'Business Cases');if(s.getLastRow()<4)return;
  let id=s.notes['4,9'];
  if(s.getLastRow()>4){id=s.notes['5,9'];[s.cells[3],s.cells[4]]=[s.cells[4],s.cells[3]];[s.notes['4,9'],s.notes['5,9']]=[s.notes['5,9'],s.notes['4,9']];}
  s.selection=s.getRange(4,1);workbook.setActiveSheet(s);assert.equal(call('v2SelectedId_',workbook),id);
});
check('queue accepts native Sheets dates, serial dates and ISO text',()=>{
  const queue=workbook.getSheetByName('Bot Queue'),saved=queue.cells;
  const today=call('v2Today_'),native=new Date(today+'T00:00:00+07:00');
  const serial=(Date.parse(today+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000;
  queue.cells=[evaluate('V2_QUEUE_HEADERS')];
  try{
    [native,serial,today,''].forEach((date,i)=>call('v2Append_',queue,{URL:'https://example.org/due-'+i,Family:'Business Cases',Kind:'discovery',State:'PENDING','Next Check':date}));
    call('v2Append_',queue,{URL:'https://example.org/future',Family:'Business Cases',Kind:'discovery',State:'PENDING','Next Check':new Date('2099-01-01T00:00:00+07:00')});
    call('v2Append_',queue,{URL:'https://example.org/program',Family:'Programs',Kind:'discovery',State:'PENDING','Next Check':native});
    const urls=call('v2Due_',workbook).map(r=>r.url);
    assert.equal(urls.length,4);for(let i=0;i<4;i++)assert(urls.includes('https://example.org/due-'+i));
  }finally{queue.cells=saved;}
});
check('queue counts distinguish due work from retries and completed cooldowns',()=>{
  const queue=workbook.getSheetByName('Bot Queue'),saved=queue.cells;
  queue.cells=[evaluate('V2_QUEUE_HEADERS')];
  try{
    const today=call('v2Today_');
    const add=(suffix,state,date,family='Business Cases')=>call('v2Append_',queue,{URL:'https://example.org/'+suffix,Family:family,Kind:'discovery',State:state,'Next Check':new Date(date+'T00:00:00+07:00')});
    add('due-new','PENDING',today);add('due-revisit','DONE',today);
    add('retry-later','RETRY','2099-01-01');add('new-later','PENDING','2099-01-01');
    add('completed-later','DONE','2099-01-01');add('excluded-program','PENDING',today,'Programs');
    const status=call('v2Refresh_',workbook);
    assert.equal(status.queue_remaining,4);assert.equal(status.queue_due_now,2);assert.equal(status.queue_waiting,2);
    const due=call('v2Due_',workbook);assert.equal(due.length,2);
    assert.equal(due.find(r=>r.url.endsWith('/due-revisit')).kind,'refresh');
    call('v2Dispatch_',workbook,{action:'queue_result',url:'https://example.org/due-new',outcome:'DONE',detail:'Event processed',revisit_days:7});
    assert.equal(call('v2Due_',workbook).length,1);
    const remaining=call('v2QueueStatus_',workbook);assert.equal(remaining.queue_due_now,1);assert.equal(remaining.queue_waiting,2);
  }finally{queue.cells=saved;}
});
console.log(JSON.stringify({checks,original_opportunities:beforeCount,migration:'passed in offline emulator',native_google_ui:'not executed'}));
