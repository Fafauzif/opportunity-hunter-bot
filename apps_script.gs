/** Opportunity Hunter 2.1.0. Existing v2: replace code, run refreshOpportunityViews, redeploy the existing deployment. */
const APP_VERSION = '2.1.0';
const DEFAULT_TIMEZONE = 'Asia/Jakarta';
const V2_SCHEMA = 2;
const SHEET_NAMES = Object.freeze({OPPORTUNITIES:'Opportunities',REJECTED:'Rejected',RUN_LOGS:'Run Logs',SETTINGS:'Settings'});
const OPPORTUNITY_COLUMNS = Object.freeze([
  ['opportunity_id', 'Opportunity ID'],
  ['date_found', 'Date Found'],
  ['last_seen', 'Last Seen'],
  ['alert_level', 'Alert Level'],
  ['match_score', 'Match Score'],
  ['title', 'Title'],
  ['organizer', 'Organizer'],
  ['category', 'Category'],
  ['subcategory', 'Subcategory'],
  ['summary', 'What Is This Opportunity?'],
  ['why_relevant', 'Why It May Matter'],
  ['opportunity_type', 'Opportunity Type'],
  ['format', 'Format'],
  ['location', 'Location'],
  ['host_country', 'Host Country'],
  ['language', 'Language'],
  ['official_source_status', 'Official Source Status'],
  ['official_url', 'Official URL'],
  ['application_url', 'Application URL'],
  ['source_url', 'Source URL'],
  ['source_type', 'Source Type'],
  ['source_domain', 'Source Domain'],
  ['opening_date', 'Opening Date'],
  ['start_date', 'Start Date'],
  ['end_date', 'End Date'],
  ['deadline_raw', 'Deadline Raw'],
  ['deadline_date', 'Deadline Date'],
  ['deadline_timezone', 'Deadline Timezone'],
  ['days_remaining', 'Days Remaining'],
  ['deadline_status', 'Deadline Status'],
  ['eligibility_status', 'Eligibility Status'],
  ['undergraduate_eligible', 'Undergraduate Eligible'],
  ['indonesian_eligible', 'Indonesian Eligible'],
  ['age_requirement', 'Age Requirement'],
  ['education_requirement', 'Education Requirement'],
  ['experience_requirement', 'Experience Requirement'],
  ['nationality_requirement', 'Nationality Requirement'],
  ['team_format', 'Individual / Team'],
  ['team_size', 'Team Size'],
  ['application_requirements', 'Application Requirements'],
  ['application_fee_raw', 'Application Fee Raw'],
  ['application_fee_idr', 'Application Fee IDR'],
  ['registration_fee_raw', 'Registration Fee Raw'],
  ['registration_fee_idr', 'Registration Fee IDR'],
  ['estimated_personal_cost_idr', 'Estimated Personal Cost IDR'],
  ['funding_status', 'Funding Status'],
  ['funding_coverage', 'Funding Coverage'],
  ['prize_benefits', 'Prize / Benefits'],
  ['travel_covered', 'Travel Covered'],
  ['accommodation_covered', 'Accommodation Covered'],
  ['meals_covered', 'Meals Covered'],
  ['visa_covered', 'Visa Covered'],
  ['eligibility_evidence', 'Eligibility Evidence'],
  ['funding_evidence', 'Funding Evidence'],
  ['deadline_evidence', 'Deadline Evidence'],
  ['confidence', 'AI Confidence'],
  ['warning_flags', 'Warning Flags'],
  ['verification_status', 'Verification Status'],
  ['first_source_query', 'First Source Query'],
  ['run_id', 'Run ID'],
  ['application_status', 'Application Status'],
  ['personal_priority', 'Personal Priority'],
  ['applied_date', 'Applied Date'],
  ['personal_notes', 'Personal Notes'],
  ['last_bot_update', 'Last Bot Update']
]);

const REJECTED_COLUMNS = Object.freeze([
  ['opportunity_id', 'Opportunity ID'],
  ['date_found', 'Date Found'],
  ['last_seen', 'Last Seen'],
  ['title', 'Title'],
  ['organizer', 'Organizer'],
  ['category', 'Category'],
  ['source_url', 'Source URL'],
  ['official_url', 'Official URL'],
  ['deadline_date', 'Deadline Date'],
  ['rejection_reason', 'Rejection Reason'],
  ['rejection_evidence', 'Rejection Evidence'],
  ['warning_flags', 'Warning Flags'],
  ['run_id', 'Run ID'],
  ['last_bot_update', 'Last Bot Update']
]);

const RUN_LOG_COLUMNS = Object.freeze([
  ['run_id', 'Run ID'],
  ['started_at', 'Started At'],
  ['finished_at', 'Finished At'],
  ['status', 'Status'],
  ['searches_attempted', 'Searches Attempted'],
  ['searches_succeeded', 'Searches Succeeded'],
  ['candidates_found', 'Candidates Found'],
  ['candidates_deduplicated', 'Candidates Deduplicated'],
  ['pages_fetched', 'Pages Fetched'],
  ['gemini_calls', 'Gemini Calls'],
  ['opportunities_inserted', 'Opportunities Inserted'],
  ['opportunities_updated', 'Opportunities Updated'],
  ['rejected_logged', 'Rejected Logged'],
  ['telegram_alerts_sent', 'Telegram Alerts Sent'],
  ['errors', 'Errors'],
  ['estimated_exa_cost_usd', 'Estimated Exa Cost USD'],
  ['notes', 'Notes']
]);

const V2_EXTRA_COLUMNS = [
  ['primary_type','Primary Type'], ['edition_year','Edition Year'], ['track','Track'],
  ['registration_deadline','Registration Deadline'], ['submission_deadline','Submission Deadline'],
  ['deadline_precision','Deadline Precision'], ['main_deliverable','Main Deliverable'],
  ['rounds','Rounds'], ['judging_rules','Judging Rules'], ['ai_ip_rules','AI and IP Rules'],
  ['residence_requirement','Residence Requirement'], ['university_requirement','University Requirement'],
  ['participation_fee_idr','Participation Fee IDR'], ['entry_fee_status','Entry Fee Status'],
  ['entry_fee_evidence','Entry Fee Evidence'], ['entry_cost_idr','Total Entry Cost IDR'],
  ['record_status','Record Status'], ['review_reason','Review Reason'], ['last_checked','Last Source Check'],
  ['extraction_model','Extraction Model'], ['schema_version','Schema Version'], ['id_aliases','ID Aliases']
];
const V2_QUEUE_HEADERS = ['Candidate ID','URL','Title','Family','Query','Kind','State','Next Check','Last Checked','Attempts','Detail'];
const V2_APP_HEADERS = ['Opportunity ID','Title','Status','Next Action','Personal Due Date','Teammates','Priority','Applied Date','Notes'];
const V2_VIEW_HEADERS = ['Competition','What is this?','Entry Deadline','Eligibility','Solo / Team','Format / Location','Entry Cost','What to Submit','Apply'];
const V2_CATEGORIES = ['Business Cases','Marketing','Essays & Policy','Pitch & Innovation','Speaking & Debate','Programs'];
const V2_BROWSE_VIEWS = ['All Opportunities'].concat(V2_CATEGORIES);
const V2_SETTING_DEFAULTS = {
  enabled:true, include_programs:false, review_enabled:true, review_monthly_budget_usd:1,
  application_fee_limit_idr:300000, personal_cost_guideline_idr:1000000, telegram_score_threshold:75,
  profile:JSON.stringify({nationality:'Indonesia',education:'Current undergraduate',age:null,university:'',university_country:'',residence:'',interests:'Business, marketing, writing, policy, pitching and innovation competitions'})
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Opportunity Hunter')
    .addItem('Legacy v1: upgrade database (backup first)','upgradeOpportunityHunter')
    .addItem('Open info sidebar','openSelectedDetails')
    .addItem('Save selected opportunity','saveSelectedOpportunity')
    .addItem('Refresh all opportunity views','refreshOpportunityViews')
    .addItem('Settings and run checks','showHunterSettings')
    .addItem('Show background data','showBackgroundData')
    .addToUi();
}

function v2Columns_() { return OPPORTUNITY_COLUMNS.concat(V2_EXTRA_COLUMNS); }
function v2Props_() { return PropertiesService.getScriptProperties(); }
function v2Now_() { return Utilities.formatDate(new Date(),DEFAULT_TIMEZONE,'yyyy-MM-dd HH:mm:ss'); }
function v2Today_() { return Utilities.formatDate(new Date(),DEFAULT_TIMEZONE,'yyyy-MM-dd'); }
function v2Hash_(value) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(value),Utilities.Charset.UTF_8).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('').slice(0,32); }
function v2Safe_(v) {
  if(v===null || v===undefined) return '';
  if(v instanceof Date) return v;
  if(typeof v==='number') return Number.isFinite(v)?v:'';
  if(typeof v==='boolean') return v;
  let s=(Array.isArray(v)?v.join(' | '):typeof v==='object'?JSON.stringify(v):String(v)).slice(0,45000);
  return /^[=+\-@]/.test(s)?"'"+s:s;
}
function v2Url_(v) { const s=String(v||'').trim(); return /^https?:\/\/[^\s"<>]+$/i.test(s) && !/^https?:\/\/[^/]*@/.test(s)?s:''; }
function v2Canonical_(v) {
  const s=v2Url_(v); if(!s) return '';
  const m=s.split('#')[0].match(/^(https?):\/\/([^/?#]+)([^?#]*)(?:\?(.*))?$/i); if(!m)return '';
  const base=m[1].toLowerCase()+'://'+m[2].toLowerCase().replace(/^www\./,'')+(m[3].replace(/\/+$/,'')||'/');
  const qs=(m[4]||'').split('&').filter(Boolean).filter(function(q){let k=q.split('=')[0];try{k=decodeURIComponent(k);}catch(e){}return !/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$|source$)/i.test(k);}).sort();
  return base+(qs.length?'?'+qs.join('&'):'');
}
function v2ISO_(v) {
  if(v instanceof Date && !isNaN(v.getTime())) return Utilities.formatDate(v,DEFAULT_TIMEZONE,'yyyy-MM-dd');
  if(typeof v==='number' && v>20000 && v<100000) return new Date(Date.UTC(1899,11,30)+Math.floor(v)*86400000).toISOString().slice(0,10);
  const s=String(v||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return '';
  const d=new Date(s+'T12:00:00Z');return !isNaN(d.getTime())&&d.toISOString().slice(0,10)===s?s:'';
}
function v2Date_(v) { const s=v2ISO_(v);return s?new Date(s+'T12:00:00Z'):''; }
function v2Text_(v) { return v instanceof Date?Utilities.formatDate(v,DEFAULT_TIMEZONE,'yyyy-MM-dd HH:mm:ss'):String(v===null||v===undefined?'':v); }
function v2Norm_(v) { return String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
function v2Headers_(sheet) { return sheet.getLastColumn()?sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0]:[]; }
function v2Capacity_(sheet,rows,cols) {if(rows>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),rows-sheet.getMaxRows());if(cols>sheet.getMaxColumns())sheet.insertColumnsAfter(sheet.getMaxColumns(),cols-sheet.getMaxColumns());}
function v2Rows_(sheet) {
  const h=v2Headers_(sheet);if(sheet.getLastRow()<2)return [];
  return sheet.getRange(2,1,sheet.getLastRow()-1,h.length).getValues().map(function(r,i){let o={_row:i+2};h.forEach(function(k,j){if(k)o[k]=r[j];});return o;});
}
function v2Ensure_(ss,name,headers) {
  let sheet=ss.getSheetByName(name);if(!sheet)sheet=ss.insertSheet(name);
  let have=v2Headers_(sheet);if(!have.length){v2Capacity_(sheet,1,headers.length);sheet.getRange(1,1,1,headers.length).setValues([headers]);have=headers.slice();}
  const missing=headers.filter(function(h){return have.indexOf(h)<0;});
  if(missing.length){v2Capacity_(sheet,1,have.length+missing.length);sheet.getRange(1,have.length+1,1,missing.length).setValues([missing]);}
  sheet.setFrozenRows(1);return sheet;
}
function v2Append_(sheet,obj) { const h=v2Headers_(sheet);sheet.appendRow(h.map(function(k){return v2Safe_(obj[k]);})); }
function v2Write_(sheet,row,obj) {
  const h=v2Headers_(sheet),range=sheet.getRange(row,1,1,h.length),old=range.getValues()[0],formulas=range.getFormulas()[0];
  range.setValues([h.map(function(k,i){return Object.prototype.hasOwnProperty.call(obj,k)?v2Safe_(obj[k]):formulas[i]||v2Safe_(old[i]);})]);
}
function v2SS_() { const id=v2Props_().getProperty('SPREADSHEET_ID');if(!id)throw new Error('Run upgradeOpportunityHunter from the bound spreadsheet first');return SpreadsheetApp.openById(id); }
function v2Locked_(fn) {const lock=LockService.getScriptLock();lock.waitLock(30000);try{return fn();}finally{lock.releaseLock();}}
function v2StateSheet_(ss) {return v2Ensure_(ss,'Bot State',['Key','Value','Updated']);}
function v2State_(ss,key,fallback) {const r=v2Rows_(v2StateSheet_(ss)).find(function(r){return r.Key===key;});if(!r)return fallback;try{return JSON.parse(r.Value);}catch(e){return fallback;}}
function v2SetState_(ss,key,value) {const s=v2StateSheet_(ss),r=v2Rows_(s).find(function(r){return r.Key===key;});const o={Key:key,Value:JSON.stringify(value),Updated:v2Now_()};if(r)v2Write_(s,r._row,o);else v2Append_(s,o);}

function v2Preferences_(ss) {
  const rows=v2Rows_(ss.getSheetByName('Settings'));const result={};
  Object.keys(V2_SETTING_DEFAULTS).forEach(function(k){
    const found=rows.find(function(r){return r.Setting===k;});let value=found?found.Value:V2_SETTING_DEFAULTS[k];
    if(typeof V2_SETTING_DEFAULTS[k]==='boolean')value=value===true||String(value).toLowerCase()==='true';
    else if(typeof V2_SETTING_DEFAULTS[k]==='number'){
      value=Number(value);if(!Number.isFinite(value)||value<0)throw new Error('Invalid Settings value: '+k);
      if(k==='review_monthly_budget_usd'&&value>20)throw new Error('Reviewer budget above $20 requires changing the code guard');
    }else if(k==='profile'){
      try{value=JSON.parse(String(value));if(!value||Array.isArray(value)||typeof value!=='object')throw new Error();}
      catch(e){throw new Error('Settings profile must be a JSON object');}
    }
    result[k]=value;
  });return result;
}
function v2EnsureSettings_(ss) {
  const s=v2Ensure_(ss,'Settings',['Setting','Value','Explanation']);let rows=v2Rows_(s);
  const explanations={enabled:'TRUE runs discovery; FALSE pauses scheduled discovery. Verification still works.',include_programs:'FALSE keeps searches competition-first. Programs already saved remain accessible.',review_enabled:'Enable selective OpenRouter reviews when the GitHub secret exists.',review_monthly_budget_usd:'Monthly bot reviewer allowance in USD. Set 0 to prohibit paid reviewer calls.',application_fee_limit_idr:'Maximum known mandatory entry cost. Unknown costs stay reviewable.',personal_cost_guideline_idr:'Personal expense guideline; offline finalist costs need checking.',telegram_score_threshold:'Minimum fit score, plus eligibility, cost and deadline gates.',profile:'Edit JSON values carefully. null/blank means unknown; do not invent age/enrollment facts.'};
  Object.keys(V2_SETTING_DEFAULTS).forEach(function(k){if(!rows.some(function(r){return r.Setting===k;}))v2Append_(s,{Setting:k,Value:V2_SETTING_DEFAULTS[k],Explanation:explanations[k]});});
  s.setColumnWidth(1,240);s.setColumnWidth(2,420);s.setColumnWidth(3,540);s.getDataRange().setWrap(true);
}
function v2SettingStatus_(ss,key,value,explanation) {const s=ss.getSheetByName('Settings'),r=v2Rows_(s).find(function(r){return r.Setting===key;});const o={Setting:key,Value:value,Explanation:explanation||''};if(r)v2Write_(s,r._row,o);else v2Append_(s,o);}

function v2LegacyType_(r) {
  if(r['Primary Type'])return r['Primary Type'];
  const s=String(r['Opportunity Type']||'');
  if(/competit|contest|challenge|hackathon/i.test(s))return 'Competition';
  if(/scholarship/i.test(s))return 'Scholarship';
  if(/fellow/i.test(s))return 'Fellowship';
  if(/exchange/i.test(s))return 'Exchange';
  if(/leadership|ambassador/i.test(s))return 'Leadership Program';
  if(/conference|summit|forum|MUN/i.test(s))return 'Conference';return 'Other';
}
function v2Category_(r) {
  if(v2LegacyType_(r)!=='Competition')return 'Programs';
  const cat=String(r.Category||'');if(V2_CATEGORIES.indexOf(cat)>=0)return cat;
  const text=cat+' '+String(r.Subcategory||'')+' '+String(r.Title||'');
  if(/essay|writing|policy|research|esai|karya tulis/i.test(text))return 'Essays & Policy';
  if(/case|consult|strategy/i.test(text))return 'Business Cases';
  if(/marketing|brand|advertis/i.test(text))return 'Marketing';
  if(/speech|speak|debate|MUN|presentation/i.test(text))return 'Speaking & Debate';
  return 'Pitch & Innovation';
}
function v2MigrationRows_(headers,rows) {
  const h=headers.slice();const blank=h[0]===''&&rows.some(function(r){return /^[a-f0-9]{32}$/i.test(String(r[0]||''));});
  if(blank)h[0]='Legacy Opportunity ID';
  const legacyCol=h.indexOf('Legacy Opportunity ID');
  const idCol=h.indexOf('Opportunity ID');if(idCol<0)throw new Error('Opportunity ID column was not created');
  const aliasCol=h.indexOf('ID Aliases'),warnCol=h.indexOf('Warning Flags');const seen={};
  const migrated=rows.map(function(row,index){const r=row.slice();while(r.length<h.length)r.push('');
    const legacy=legacyCol>=0?String(r[legacyCol]||''):'',current=String(r[idCol]||'');let id=current||legacy;
    const aliases=String(aliasCol>=0?r[aliasCol]||'':'').split(' | ').filter(Boolean);
    if(legacy&&current&&legacy!==current){aliases.push(legacy);if(warnCol>=0)r[warnCol]=[r[warnCol],'ID_ALIAS_CONFLICT_REVIEW'].filter(Boolean).join(' | ');}
    if(!id)id=v2Hash_('migration|'+index+'|'+r.join('|'));
    if(seen[id]){aliases.push(id);id=v2Hash_(id+'|row|'+index);if(warnCol>=0)r[warnCol]=[r[warnCol],'DUPLICATE_ID_REVIEW'].filter(Boolean).join(' | ');}
    seen[id]=true;r[idCol]=id;if(aliasCol>=0)r[aliasCol]=Array.from(new Set(aliases)).join(' | ');if(warnCol>=0)r[warnCol]=Array.from(new Set(String(r[warnCol]||'').split(' | ').filter(Boolean))).join(' | ');return r;
  });return {headers:h,rows:migrated};
}

function upgradeOpportunityHunter() {
  const ss=SpreadsheetApp.getActiveSpreadsheet();if(!ss)throw new Error('Open this project through Extensions > Apps Script in your existing sheet');
  const result=v2Locked_(function(){
    const existing=ss.getSheetByName('Opportunities');if(!existing)throw new Error('Expected existing Opportunities tab. Open the correct spreadsheet.');
    const props=v2Props_();
    // Back up all tabs, including user edits, before any migration changes.
    if(props.getProperty('V2_SCHEMA')!=='2'){
      if(!props.getProperty('V2_BACKUP_URL')){
        const backup=ss.copy(ss.getName()+' - before Opportunity Hunter v2 - '+v2Now_().replace(/[:]/g,'-'));
        props.setProperty('V2_BACKUP_URL',backup.getUrl());
      }
    }
    props.setProperties({SPREADSHEET_ID:ss.getId(),TIMEZONE:DEFAULT_TIMEZONE},false);
    // Preserve the existing webhook secret; never rotate it during upgrade.
    if(!props.getProperty('WEBHOOK_SECRET'))throw new Error('Existing WEBHOOK_SECRET missing. Restore the old project properties before continuing.');
    v2Ensure_(ss,'Opportunities',v2Columns_().map(function(c){return c[1];}));
    const h=v2Headers_(existing),rows=existing.getLastRow()>1?existing.getRange(2,1,existing.getLastRow()-1,h.length).getValues():[];
    const fixed=v2MigrationRows_(h,rows);
    existing.getRange(1,1,1,fixed.headers.length).setValues([fixed.headers]);
    // Write only the repaired identity columns. Preserve formulas and unrelated
    // user columns rather than round-tripping the entire table as raw values.
    if(fixed.rows.length)['Opportunity ID','ID Aliases','Warning Flags'].forEach(function(name){const col=fixed.headers.indexOf(name);if(col>=0)existing.getRange(2,col+1,fixed.rows.length,1).setValues(fixed.rows.map(function(r){return [v2Safe_(r[col])];}));});
    v2Ensure_(ss,'Rejected',REJECTED_COLUMNS.map(function(c){return c[1];}));
    v2Ensure_(ss,'Run Logs',RUN_LOG_COLUMNS.map(function(c){return c[1];}));
    v2EnsureSettings_(ss);v2StateSheet_(ss);
    v2Ensure_(ss,'Bot Queue',V2_QUEUE_HEADERS);
    v2Ensure_(ss,'Bot History',['Timestamp','Opportunity ID','Field','Previous Value','New Value','Source','Run ID']);
    v2Ensure_(ss,'Benchmark',['Title','Official URL','Edition','Expected Category','Notes']);
    const apps=v2ViewSheet_(ss,'My Applications');if(!v2Headers_(apps).length)apps.getRange(1,1,1,V2_APP_HEADERS.length).setValues([V2_APP_HEADERS]);
    v2Ensure_(ss,apps.getName(),V2_APP_HEADERS);
    const applicationIds=new Set(v2Rows_(apps).map(function(r){return r['Opportunity ID'];}));
    const data=v2Rows_(existing),appAdds=[];
    data.forEach(function(r){
      const changed={};
      if(!r['Primary Type'])changed['Primary Type']=v2LegacyType_(r);
      if(!r['Edition Year']){const y=String(r.Title||'').match(/\b20\d{2}\b/);if(y)changed['Edition Year']=y[0];}
      if(r['Verification Status']==='Verified')changed['Verification Status']='Official source extracted (legacy; review restrictions)';
      Object.keys(changed).forEach(function(k){r[k]=changed[k];});
      const meaningful=(r['Application Status']&&r['Application Status']!=='New')||r['Personal Priority']||r['Applied Date']||r['Personal Notes'];
      if(meaningful&&!applicationIds.has(r['Opportunity ID'])){
        appAdds.push({'Opportunity ID':r['Opportunity ID'],Title:r.Title,Status:r['Application Status']||'New',Priority:r['Personal Priority'],'Applied Date':r['Applied Date'],Notes:r['Personal Notes']});applicationIds.add(r['Opportunity ID']);
      }
    });
    if(data.length)['Primary Type','Edition Year','Verification Status'].forEach(function(name){const col=fixed.headers.indexOf(name);existing.getRange(2,col+1,data.length,1).setValues(data.map(function(r){return [v2Safe_(r[name])];}));});
    if(appAdds.length){v2Capacity_(apps,apps.getLastRow()+appAdds.length,V2_APP_HEADERS.length);apps.getRange(apps.getLastRow()+1,1,appAdds.length,V2_APP_HEADERS.length).setValues(appAdds.map(function(r){return V2_APP_HEADERS.map(function(k){return v2Safe_(r[k]);});}));}
    // Initial monitoring covers accepted and rejected URLs; it does not reject
    // the same reused annual URL forever. Records are never removed here.
    const queued=new Set(v2Rows_(ss.getSheetByName('Bot Queue')).map(function(r){return v2Canonical_(r.URL);}));const queueAdds=[];let added=0;
    data.concat(v2Rows_(ss.getSheetByName('Rejected'))).forEach(function(r){
      const url=v2Url_(r['Official URL']||r['Source URL']);const canonical=v2Canonical_(url);
      if(canonical&&!queued.has(canonical)){
        const oldCompetitionCategory=/essay|writing|policy|case|marketing|speak|pitch|entrepreneur|innovation|debate/i.test(String(r.Category||''));
        const family=!r['Opportunity Type']&&oldCompetitionCategory?v2Category_(Object.assign({},r,{'Primary Type':'Competition'})):v2Category_(r);
        queued.add(canonical);queueAdds.push({'Candidate ID':v2Hash_(canonical),URL:url,Title:r.Title,Family:family,Query:'Imported organizer/event monitor',Kind:'refresh',State:'PENDING','Next Check':v2Today_(),Attempts:0});added++;
      }
    });
    if(queueAdds.length){const q=ss.getSheetByName('Bot Queue');v2Capacity_(q,q.getLastRow()+queueAdds.length,V2_QUEUE_HEADERS.length);q.getRange(q.getLastRow()+1,1,queueAdds.length,V2_QUEUE_HEADERS.length).setValues(queueAdds.map(function(r){return V2_QUEUE_HEADERS.map(function(k){return v2Safe_(r[k]);});}));}
    const bench=ss.getSheetByName('Benchmark');
    if(bench.getLastRow()===1){const seeds=data.filter(function(r){return v2LegacyType_(r)==='Competition'&&v2Url_(r['Official URL']||r['Source URL']);}).slice(0,20);if(seeds.length)bench.getRange(2,1,seeds.length,5).setValues(seeds.map(function(r){return [v2Safe_(r.Title),r['Official URL']||r['Source URL'],String(r['Edition Year']||''),v2Category_(r),'Imported saved reference: presence check only, not an independent recall benchmark.'];}));}
    v2SettingStatus_(ss,'Backup before upgrade',props.getProperty('V2_BACKUP_URL'),'Open this copy to recover the original data; do not delete it until satisfied.');
    v2SettingStatus_(ss,'Schema version',2,'Required by the v2 GitHub workflow.');
    const refreshed=v2Refresh_(ss);props.setProperty('V2_SCHEMA','2');return {queued:added,views:refreshed.views};
  });
  SpreadsheetApp.getUi().alert('Upgrade complete. '+result.views+' category views refreshed. '+result.queued+' monitoring URLs added. Next: Deploy > Manage deployments > Edit existing deployment > New version > Deploy. Then run verify in GitHub.');
}

function v2ViewSheet_(ss,name) {
  const props=v2Props_(),key='V2_VIEW_'+name;const id=props.getProperty(key);
  let s=id?ss.getSheets().find(function(s){return String(s.getSheetId())===id;}):null;
  if(s)return s;
  let use=name;if(ss.getSheetByName(use))use=name+' (Bot v2)';
  if(ss.getSheetByName(use))throw new Error('Unowned sheet name conflict: '+use+'. Rename your existing tab before upgrading.');
  s=ss.insertSheet(use);props.setProperty(key,String(s.getSheetId()));return s;
}
function v2UpdateDeadlines_(ss) {
  const s=ss.getSheetByName('Opportunities'),h=v2Headers_(s);if(s.getLastRow()<2)return;
  const rows=s.getRange(2,1,s.getLastRow()-1,h.length).getValues(),i=h.indexOf('Deadline Date'),d=h.indexOf('Days Remaining'),st=h.indexOf('Deadline Status'),rs=h.indexOf('Record Status'),al=h.indexOf('Alert Level');
  const today=Date.parse(v2Today_()+'T12:00:00Z');
  rows.forEach(function(r){const iso=v2ISO_(r[i]);if(!iso){r[d]='';r[st]='UNKNOWN';return;}const days=Math.round((Date.parse(iso+'T12:00:00Z')-today)/86400000);r[d]=days;r[st]=days<0?'EXPIRED':days<7?'URGENT':'FUTURE';if(days<0){r[rs]='CLOSED';if(r[al]==='PRIORITY')r[al]='REVIEW';}});
  // Only calculated columns are written; don't overwrite manual/source cells.
  [d,st,rs,al].forEach(function(col){s.getRange(2,col+1,rows.length,1).setValues(rows.map(function(r){return [r[col]];}));});
}
function v2LinkFormula_(url,label) {return '=HYPERLINK("'+v2Url_(url).replace(/"/g,'""')+'","'+String(label).replace(/"/g,'""')+'")';}
function v2Labeled_(r,fields) {
  return fields.filter(function(f){return v2Text_(r[f[0]]).trim();}).map(function(f){return f[1]+': '+v2Text_(r[f[0]]);}).join('\n');
}
function v2EligibilityText_(r) {
  const status=v2Text_(r['Eligibility Status'])||'Eligibility unclear';
  const rules=v2Labeled_(r,[['Education Requirement','Education'],['Nationality Requirement','Nationality'],['Age Requirement','Age'],['Residence Requirement','Residence'],['University Requirement','University'],['Experience Requirement','Experience']]);
  return status+'\n'+(rules||v2Text_(r['Eligibility Evidence'])||'Restrictions not yet documented; check the source.')+(r['Review Reason']?'\nCheck: '+v2Text_(r['Review Reason']):'');
}
function v2CostText_(r) {
  const value=r['Total Entry Cost IDR'],known=value!==''&&value!==null&&value!==undefined&&Number.isFinite(Number(value))&&Number(value)>=0;
  const fee=known?'Entry: Rp'+Number(value).toLocaleString('en-US'):r['Entry Fee Status']==='Free'?'Entry: Free':'Entry cost unknown';
  const personal=r['Estimated Personal Cost IDR'],personalKnown=personal!==''&&personal!==null&&personal!==undefined&&Number.isFinite(Number(personal))&&Number(personal)>=0;
  const raw=v2Labeled_(r,[['Application Fee Raw','Application'],['Registration Fee Raw','Registration']]);
  const travel=/offline|hybrid/i.test(String(r.Format||''))||/offline|in.person|travel/i.test(String(r.Rounds||''));
  return fee+(raw?'\n'+raw:'')+(personalKnown?'\nPersonal estimate: Rp'+Number(personal).toLocaleString('en-US'):travel?'\nTravel / personal costs unknown':'')+(r.Rounds?'\nRounds: '+v2Text_(r.Rounds):'');
}
function v2ActionTier_(r) {
  if(r['Record Status']==='CLOSED'||r['Record Status']==='REJECTED'||r['Deadline Status']==='EXPIRED')return 3;
  const deadline=v2ISO_(r['Deadline Date']);
  if(r['Alert Level']==='PRIORITY'&&deadline)return 0;
  return deadline&&/^(Eligible|Probably Eligible)$/.test(String(r['Eligibility Status']))&&!r['Review Reason']&&!r['Warning Flags']?1:2;
}
function v2Refresh_(ss) {
  v2UpdateDeadlines_(ss);const rows=v2Rows_(ss.getSheetByName('Opportunities'));
  V2_BROWSE_VIEWS.forEach(function(cat){
    const overview=cat==='All Opportunities',width=overview?11:9,deadlineCol=overview?5:3;
    const headers=overview?['Competition','Category','Status'].concat(V2_VIEW_HEADERS.slice(1)):V2_VIEW_HEADERS;
    const s=v2ViewSheet_(ss,cat);s.clearContents();s.clearNotes();s.setConditionalFormatRules([]);
    const active=rows.filter(function(r){return overview||v2Category_(r)===cat&&r['Deadline Status']!=='EXPIRED'&&r['Record Status']!=='REJECTED'&&r['Record Status']!=='CLOSED';}).sort(function(a,b){return v2ActionTier_(a)-v2ActionTier_(b)||(v2ISO_(a['Deadline Date'])||'9999').localeCompare(v2ISO_(b['Deadline Date'])||'9999')||Number(b['Match Score']||0)-Number(a['Match Score']||0);});
    v2Capacity_(s,active.length+4,width);
    // The A:I banners span the whole view. A frozen A column would split
    // those merged cells. Clear an existing column freeze before merging.
    s.setFrozenColumns(0);
    s.getRange(1,1,1,width).merge().setValue(cat+' — '+active.length+' opportunities');
    s.getRange(2,1,1,width).merge().setValue(overview?'Every saved record, including closed / rejected entries. Filter Category or Status to narrow the list. More context: Opportunity Hunter → Open info sidebar.':'Read the opportunity in its row. More context: select a row → Opportunity Hunter → Open info sidebar. Save progress in My Applications.');
    s.getRange(1,1,1,width).setBackground('#123b46').setFontColor('#ffffff').setFontWeight('bold').setFontSize(15);
    s.getRange(2,1,1,width).setBackground('#eaf3f2').setFontColor('#234b50').setFontSize(10);
    s.setRowHeights(1,1,38);s.setRowHeights(2,1,34);s.setRowHeights(3,1,32);
    s.getRange(3,1,1,width).setValues([headers]);
    if(active.length){
      const values=active.map(function(r){
        const description=v2Text_(r['What Is This Opportunity?'])||'Description not yet available; check the organizer source.';
        const summary=description+(r['Why It May Matter']?'\n\nWhy it may fit: '+v2Text_(r['Why It May Matter']):'')+(r['Prize / Benefits']?'\n\nPrize / benefits: '+v2Text_(r['Prize / Benefits']):'');
        const submit=v2Labeled_(r,[['Main Deliverable','Deliverable'],['Application Requirements','Requirements'],['Rounds','Rounds']])||'Submission requirements not yet documented; check the source.';
        const team=v2Labeled_(r,[['Individual / Team','Format'],['Team Size','Size']])||'Unknown';
        const result=[v2Safe_(r.Title),v2Safe_(summary),v2Date_(r['Deadline Date'])||'Unknown — needs checking',v2Safe_(v2EligibilityText_(r)),v2Safe_(team),v2Safe_((r.Format||'Unknown')+(r.Location?'\n'+r.Location:'')),v2Safe_(v2CostText_(r)),v2Safe_(submit),''];
        if(overview)result.splice(1,0,v2Category_(r),r['Deadline Status']==='EXPIRED'?'Closed / expired':r['Record Status']==='REJECTED'?'Rejected':r['Record Status']==='CLOSED'?'Closed':r['Alert Level']==='PRIORITY'?'Priority':v2ActionTier_(r)===2?'Needs review':'Active');
        return result;
      });s.getRange(4,1,values.length,width).setValues(values);
      s.getRange(4,width,active.length,1).setFormulas(active.map(function(r){const direct=v2Url_(r['Application URL']),url=direct||v2Url_(r['Official URL'])||v2Url_(r['Source URL']);return [url?v2LinkFormula_(url,direct?'Apply':'Source'):'Source unavailable'];}));
      s.getRange(4,1,active.length,1).setNotes(active.map(function(r){return [String(r['Opportunity ID'])];}));
      const body=s.getRange(4,1,active.length,width);body.setFontColor('#18333b').setFontSize(11).setVerticalAlignment('top');
      body.setBackgrounds(active.map(function(r,i){return Array(width).fill(i%2?'#f2f7f7':'#ffffff');}));
      s.getRange(4,1,active.length,1).setFontWeight('bold');
      s.getRange(4,deadlineCol,active.length,1).setNumberFormat('dd mmm yyyy').setBackgrounds(active.map(function(r){return [r['Deadline Status']==='EXPIRED'?'#e9ecef':!v2ISO_(r['Deadline Date'])?'#fff1d2':Number(r['Days Remaining'])<7?'#ffe3dc':'#e9f3ed'];}));
    }
    if(s.getFilter())s.getFilter().remove();s.getRange(3,1,Math.max(active.length+1,2),width).createFilter();
    s.setFrozenRows(3);s.setTabColor(cat==='Programs'?'#8794a4':'#146b68');
    const widths=[260,440,135,330,140,180,240,330,90];if(overview)widths.splice(1,0,155,130);
    widths.forEach(function(w,i){s.setColumnWidth(i+1,w);});
    s.getRange(3,1,1,width).setBackground('#123b46').setFontColor('#ffffff').setFontWeight('bold');
    s.getDataRange().setWrap(true);if(active.length){s.setRowHeights(4,active.length,140);s.autoResizeRows(4,active.length);}
    // Generated cells are guarded with a warning rather than an ownership lock.
    if(!s.getProtections(SpreadsheetApp.ProtectionType.SHEET).length)s.protect().setDescription('Generated category view; edit My Applications instead').setWarningOnly(true);
  });
  const details=v2ViewSheet_(ss,'Details');if(!details.getRange('A1').getValue())v2RenderDetails_(ss,'');
  const apps=v2ViewSheet_(ss,'My Applications');apps.setFrozenRows(1);apps.getRange(1,1,1,9).setBackground('#123b46').setFontColor('white').setFontWeight('bold');
  apps.setColumnWidth(1,100);apps.setColumnWidth(2,300);apps.setColumnWidth(4,300);apps.setColumnWidth(9,400);apps.getDataRange().setWrap(true);
  const status=SpreadsheetApp.newDataValidation().requireValueInList(['Shortlisted','Preparing','Submitted','Finalist','Won','Not Selected','Withdrawn'],true).setAllowInvalid(true).build();apps.getRange(2,3,Math.max(apps.getMaxRows()-1,1),1).setDataValidation(status);
  if(apps.getLastRow()>1){apps.getRange(2,5,apps.getLastRow()-1,1).setNumberFormat('dd mmm yyyy');apps.getRange(2,8,apps.getLastRow()-1,1).setNumberFormat('dd mmm yyyy');}
  // Category tabs first, operations in the background. Never hide the user's own tabs.
  V2_BROWSE_VIEWS.forEach(function(name,i){ss.setActiveSheet(v2ViewSheet_(ss,name));ss.moveActiveSheet(i+1);});
  ['Opportunities','Rejected','Run Logs','Bot State','Bot Queue','Bot History',v2ViewSheet_(ss,'Details').getName()].forEach(function(name){const s=ss.getSheetByName(name);if(s&&!s.isSheetHidden())s.hideSheet();});
  ss.setActiveSheet(v2ViewSheet_(ss,'All Opportunities'));
  const benchmark=v2Benchmark_(ss,rows);
  return Object.assign({ok:true,views:V2_BROWSE_VIEWS.length,benchmark:benchmark},v2QueueStatus_(ss));
}
function refreshOpportunityViews() {return v2Locked_(function(){return v2Refresh_(v2SS_());});}
function v2SelectedId_(ss) {
  const s=ss.getActiveSheet(),range=s.getActiveRange();if(!range)throw new Error('Select an opportunity row first');
  if(s.getSheetId()===v2ViewSheet_(ss,'My Applications').getSheetId()&&range.getRow()>1)return String(s.getRange(range.getRow(),1).getValue());
  if(V2_BROWSE_VIEWS.some(function(c){return v2ViewSheet_(ss,c).getSheetId()===s.getSheetId();})&&range.getRow()>3){
    // v2.0 stored IDs on column I. Keep that layout readable until refresh.
    const current=s.getRange(3,2).getValue()==='What is this?'||s.getRange(3,2).getValue()==='Category';
    const id=s.getRange(range.getRow(),current?1:9).getNote();if(id)return id;
  }
  throw new Error('Select a data row in a category tab or My Applications');
}
function v2RenderDetails_(ss,id) {
  const s=v2ViewSheet_(ss,'Details'),r=v2Rows_(ss.getSheetByName('Opportunities')).find(function(r){return r['Opportunity ID']===id;});
  s.clearContents();s.getRange('A1:B1').merge().setValue(r?r.Title:'Opportunity details');s.getRange('A2').setValue('Opportunity ID');s.getRange('B2').setValue(id||'Select a category row, then use the Opportunity Hunter menu');
  if(r){
    const fields=['Organizer','Primary Type','Category','Edition Year','Track','What Is This Opportunity?','Eligibility Status','Age Requirement','Education Requirement','Nationality Requirement','Residence Requirement','University Requirement','Experience Requirement','Eligibility Evidence','Opening Date','Registration Deadline','Submission Deadline','Deadline Date','Deadline Raw','Deadline Timezone','Deadline Precision','Days Remaining','Deadline Status','Individual / Team','Team Size','Main Deliverable','Application Requirements','Rounds','Judging Rules','AI and IP Rules','Format','Location','Application Fee Raw','Application Fee IDR','Registration Fee Raw','Registration Fee IDR','Participation Fee IDR','Entry Fee Status','Entry Fee Evidence','Total Entry Cost IDR','Estimated Personal Cost IDR','Funding Status','Funding Coverage','Prize / Benefits','Official Source Status','Official URL','Application URL','Source URL','Deadline Evidence','Funding Evidence','Last Source Check','Review Reason','Warning Flags','Verification Status','Match Score','AI Confidence','Extraction Model','ID Aliases'];
    s.getRange(4,1,fields.length,2).setValues(fields.map(function(f){return [f,v2Safe_(r[f])];}));
  }
  s.setColumnWidth(1,240);s.setColumnWidth(2,850);s.getDataRange().setWrap(true);s.setFrozenRows(2);s.getRange('A1:B1').setFontWeight('bold').setBackground('#123b46').setFontColor('white');
  return s;
}
function getSelectedOpportunityDetails() {
  const ss=SpreadsheetApp.getActiveSpreadsheet()||v2SS_(),id=v2SelectedId_(ss);
  const r=v2Rows_(ss.getSheetByName('Opportunities')).find(function(row){return row['Opportunity ID']===id;});
  if(!r)throw new Error('This opportunity is no longer in the database. Refresh the view and select a data row.');
  const groups=[
    ['Overview',['Organizer','Primary Type','Edition Year','Track','What Is This Opportunity?','Why It May Matter','Prize / Benefits']],
    ['Eligibility',['Eligibility Status','Undergraduate Eligible','Indonesian Eligible','Age Requirement','Education Requirement','Nationality Requirement','Residence Requirement','University Requirement','Experience Requirement','Eligibility Evidence']],
    ['Dates',['Opening Date','Registration Deadline','Submission Deadline','Deadline Date','Deadline Raw','Deadline Timezone','Deadline Precision','Start Date','End Date','Deadline Evidence']],
    ['Fees and personal costs',['Entry Fee Status','Total Entry Cost IDR','Application Fee Raw','Application Fee IDR','Registration Fee Raw','Registration Fee IDR','Participation Fee IDR','Estimated Personal Cost IDR','Entry Fee Evidence','Funding Status','Funding Coverage','Funding Evidence']],
    ['Entry and rounds',['Individual / Team','Team Size','Main Deliverable','Application Requirements','Rounds','Judging Rules','AI and IP Rules','Format','Location','Host Country','Language']],
    ['Source checks',['Official Source Status','Last Source Check','Verification Status','Review Reason','Warning Flags','Match Score','AI Confidence','Extraction Model']]
  ];
  return {id:id,title:v2Text_(r.Title),category:v2Category_(r),groups:groups.map(function(group){return {title:group[0],fields:group[1].filter(function(k){return v2Text_(r[k]).trim();}).map(function(k){return {label:k,value:/IDR$/.test(k)&&Number(r[k])<0?'Unknown':v2Text_(r[k])};})};}),
    links:['Application URL','Official URL','Source URL'].filter(function(k){return v2Url_(r[k]);}).map(function(k){return {label:k.replace(' URL',''),url:v2Url_(r[k])};})};
}
function openSelectedDetails() {
  SpreadsheetApp.getUi().showSidebar(HtmlService.createHtmlOutput(v2SidebarHTML_()).setTitle('Opportunity info'));
}
function v2SidebarHTML_() {
  // Kept inside the .gs file so installation does not require a second HTML file.
  return String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--ink:#18333b;--muted:#52686e;--teal:#146b68;--line:#d8e4e3;--paper:#f2f7f7}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.55 Arial,sans-serif}
header{padding:20px 16px 16px;background:#123b46;color:white}header p{margin:0 0 6px;color:#b8d9d7;font-size:12px;letter-spacing:.07em;text-transform:uppercase}
h1{font-size:21px;line-height:1.3;margin:0;overflow-wrap:anywhere}.controls{padding:14px 16px;background:white;border-bottom:1px solid var(--line)}
button{width:100%;min-height:44px;border:0;border-radius:7px;padding:10px;background:var(--teal);color:white;font:700 14px Arial,sans-serif;cursor:pointer}
button:hover{background:#105653}button:disabled{opacity:.65;cursor:wait}button:focus-visible,a:focus-visible,summary:focus-visible{outline:3px solid #ca8300;outline-offset:3px}
.hint{margin:9px 0 0;color:var(--muted);font-size:12px}.status{padding:12px 16px;color:var(--muted)}.status.error{color:#a03124;background:#fff0eb}
main{padding:0 12px 20px}details{margin:0 0 10px;background:white;border:1px solid var(--line);border-radius:9px;overflow:hidden}
summary{padding:13px;font-weight:bold;cursor:pointer;background:#fbfdfd}dl{margin:0;padding:0 13px 13px}dt{font-size:12px;font-weight:bold;color:var(--muted);margin-top:13px}dd{margin:3px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}
.links{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}.links a{display:inline-flex;align-items:center;min-height:40px;padding:7px 11px;border:1px solid #a9ceca;border-radius:6px;color:#105b58;background:white;text-decoration:none;font-weight:bold;font-size:12px}
.empty{padding:14px;color:var(--muted)}
</style></head><body>
<header><p id="category">Opportunity Hunter</p><h1 id="title">Explore an opportunity</h1></header>
<div class="controls"><button id="load" type="button">Load selected row</button><p class="hint">Select a row in All Opportunities, a category, or My Applications, then load it here.</p></div>
<div id="status" class="status" role="status" aria-live="polite">Loading your selection…</div><main id="content"></main>
<script>
const button=document.getElementById('load'),status=document.getElementById('status'),content=document.getElementById('content');
function node(tag,text){const item=document.createElement(tag);if(text!==undefined)item.textContent=text;return item;}
function show(data){
  button.disabled=false;status.className='status';status.textContent='Showing the selected opportunity.';
  document.getElementById('title').textContent=data.title;document.getElementById('category').textContent=data.category;content.replaceChildren();
  const links=node('nav');links.className='links';links.setAttribute('aria-label','Opportunity sources');
  data.links.forEach(function(link){const url=String(link.url||'').toLowerCase();if(url.indexOf('https://')!==0&&url.indexOf('http://')!==0)return;const a=node('a',link.label);a.href=link.url;a.target='_blank';a.rel='noopener noreferrer';links.appendChild(a);});content.appendChild(links);
  data.groups.forEach(function(group,index){const box=node('details');box.open=index<3;box.appendChild(node('summary',group.title));const list=node('dl');
    group.fields.forEach(function(field){list.appendChild(node('dt',field.label));list.appendChild(node('dd',field.value));});
    if(!group.fields.length){const empty=node('p','Not yet documented in the source record.');empty.className='empty';box.appendChild(empty);}else box.appendChild(list);content.appendChild(box);
  });
}
function failed(error){button.disabled=false;content.replaceChildren();document.getElementById('title').textContent='Select an opportunity';document.getElementById('category').textContent='Opportunity Hunter';status.className='status error';status.textContent=error.message||'Could not load that row. Select a data row and try again.';}
function load(){button.disabled=true;status.className='status';status.textContent='Loading your selection…';content.replaceChildren();google.script.run.withSuccessHandler(show).withFailureHandler(failed).getSelectedOpportunityDetails();}
button.addEventListener('click',load);load();
</script></body></html>`;
}
function saveSelectedOpportunity() {const ss=v2SS_(),id=v2SelectedId_(ss);v2Locked_(function(){const s=v2ViewSheet_(ss,'My Applications');if(!v2Rows_(s).some(function(r){return r['Opportunity ID']===id;})){const r=v2Rows_(ss.getSheetByName('Opportunities')).find(function(r){return r['Opportunity ID']===id;});if(!r)throw new Error('Opportunity no longer found');v2Append_(s,{'Opportunity ID':id,Title:r.Title,Status:'Shortlisted'});}ss.setActiveSheet(s);});}
function onEdit(e) {if(!e||!e.range)return;const ss=e.source,s=e.range.getSheet();const id=v2Props_().getProperty('V2_VIEW_Details');if(String(s.getSheetId())===id&&e.range.getA1Notation()==='B2')v2RenderDetails_(ss,String(e.range.getValue()));}
function showHunterSettings() {const ss=v2SS_();ss.getSheetByName('Settings').showSheet();ss.setActiveSheet(ss.getSheetByName('Settings'));}
function showBackgroundData() {const ss=v2SS_();['Opportunities','Rejected','Run Logs','Bot Queue','Bot History','Benchmark',v2ViewSheet_(ss,'Details').getName()].forEach(function(n){const s=ss.getSheetByName(n);if(s)s.showSheet();});}

function doGet() {return v2JSON_({ok:true,version:APP_VERSION,schema_version:Number(v2Props_().getProperty('V2_SCHEMA')||0)});}
function v2JSON_(v) {return ContentService.createTextOutput(JSON.stringify(v)).setMimeType(ContentService.MimeType.JSON);}
function v2Authorized_(secret) {const expected=v2Props_().getProperty('WEBHOOK_SECRET');if(!expected||!secret)return false;const a=String(expected),b=String(secret);let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;}
function doPost(e) {
  try{
    if(!e||!e.postData||e.postData.contents.length>1000000)throw new Error('Invalid request size');
    const p=JSON.parse(e.postData.contents);if(!v2Authorized_(p.secret))return v2JSON_({ok:false,error:'UNAUTHORIZED',message:'Check the existing webhook secret'});
    if(p.action==='health_check')return doGet();
    if(v2Props_().getProperty('V2_SCHEMA')!=='2')throw new Error('Run upgradeOpportunityHunter first');
    return v2JSON_(v2Locked_(function(){return v2Dispatch_(v2SS_(),p);}));
  }catch(error){return v2JSON_({ok:false,error:'SHEETS_ERROR',message:String(error.message||error).slice(0,250)});}
}

function v2Enqueue_(ss,items) {
  if(!Array.isArray(items)||items.length>100)throw new Error('Queue request exceeds 100 rows');
  const s=ss.getSheetByName('Bot Queue'),rows=v2Rows_(s),byUrl={};rows.forEach(function(r){byUrl[v2Canonical_(r.URL)]=r;});
  let inserted=0;items.forEach(function(item){const url=v2Url_(item.url),canonical=v2Canonical_(url);if(!canonical)return;
    if(byUrl[canonical])return; // Due checks decide revisits; discovery doesn't reset cooldown.
    const row={'Candidate ID':v2Hash_(canonical),URL:url,Title:String(item.title||'').slice(0,500),Family:V2_CATEGORIES.indexOf(item.family)>=0?item.family:'Business Cases',Query:String(item.query||'').slice(0,2000),Kind:item.kind==='refresh'?'refresh':'discovery',State:'PENDING','Next Check':v2Today_(),Attempts:0};
    v2Append_(s,row);byUrl[canonical]=row;inserted++;
  });return {ok:true,inserted:inserted};
}
function v2QueueRows_(ss) {
  const programs=v2Preferences_(ss).include_programs;
  return v2Rows_(ss.getSheetByName('Bot Queue')).filter(function(r){return programs||r.Family!=='Programs';});
}
function v2QueueDate_(row) {
  // getValues() can return native Date objects or serials, not only ISO text.
  // Missing/invalid dates remain due so a malformed cell cannot strand work.
  return v2ISO_(row['Next Check']);
}
function v2QueueStatus_(ss) {
  const today=v2Today_(),rows=v2QueueRows_(ss);
  const due=rows.filter(function(r){return v2QueueDate_(r)<=today;}).length;
  const waiting=rows.filter(function(r){return r.State!=='DONE'&&v2QueueDate_(r)>today;}).length;
  return {queue_remaining:due+waiting,queue_due_now:due,queue_waiting:waiting};
}
function v2Due_(ss) {
  const today=v2Today_(),rows=v2QueueRows_(ss).filter(function(r){return v2QueueDate_(r)<=today;});
  // Stable round-robin families prevents old program monitors from dominating.
  const groups={};rows.sort(function(a,b){return v2QueueDate_(a).localeCompare(v2QueueDate_(b));}).forEach(function(r){const kind=r.State==='DONE'?'refresh':r.Kind;const k=r.Family+'|'+kind;(groups[k]||(groups[k]=[])).push(r);});
  const out=[];while(out.length<250&&Object.keys(groups).some(function(k){return groups[k].length;}))Object.keys(groups).forEach(function(k){if(groups[k].length&&out.length<250)out.push(groups[k].shift());});
  return out.map(function(r){return {url:r.URL,title:r.Title,family:r.Family,query:r.Query,kind:r.State==='DONE'?'refresh':r.Kind};});
}
function v2SameEdition_(a,b) {return String(a['Edition Year']||'')===String(b['Edition Year']||'')&&v2Norm_(a.Track)===v2Norm_(b.Track);}
function v2Save_(ss,p) {
  const memo=p.operation_id?'operation:'+p.operation_id:'';if(memo){const done=v2State_(ss,memo,null);if(done)return done;}
  const record=p.record;if(!record||!record.opportunity_id||!record.title)throw new Error('Record needs ID and title');
  const obj={};v2Columns_().forEach(function(c){if(Object.prototype.hasOwnProperty.call(record,c[0]))obj[c[1]]=record[c[0]];});obj['Primary Type']=record.opportunity_type;
  const now=v2Now_();obj['Last Seen']=now;obj['Last Bot Update']=now;obj['Last Source Check']=now;
  ['Deadline Date','Registration Deadline','Submission Deadline','Opening Date','Start Date','End Date'].forEach(function(k){if(obj[k])obj[k]=v2Date_(obj[k]);});
  const s=ss.getSheetByName('Opportunities'),rows=v2Rows_(s);
  let existing=rows.find(function(r){return r['Opportunity ID']===obj['Opportunity ID'];});
  if(!existing)existing=rows.find(function(r){
    if(!v2SameEdition_(r,obj)||v2Norm_(r.Title)!==v2Norm_(obj.Title))return false;
    const old=['Official URL','Application URL','Source URL'].map(function(k){return v2Canonical_(r[k]);}).filter(Boolean);
    return ['Official URL','Application URL','Source URL'].some(function(k){return old.indexOf(v2Canonical_(obj[k]))>=0;});
  });
  let changed=false;
  if(existing){
    const oldDate=v2ISO_(existing['Deadline Date']),newDate=v2ISO_(obj['Deadline Date']);
    if(oldDate!==newDate){changed=true;v2Append_(ss.getSheetByName('Bot History'),{Timestamp:now,'Opportunity ID':existing['Opportunity ID'],Field:'Deadline Date','Previous Value':oldDate,'New Value':newDate,Source:record.source_url,'Run ID':record.run_id});}
    if(obj['Opportunity ID']!==existing['Opportunity ID'])obj['ID Aliases']=Array.from(new Set(String(existing['ID Aliases']||'').split(' | ').concat([obj['Opportunity ID']]).filter(Boolean))).join(' | ');
    obj['Opportunity ID']=existing['Opportunity ID'];delete obj['Date Found'];v2Write_(s,existing._row,obj);
  }else {obj['Application Status']='New';v2Append_(s,obj);}
  if(record.record_status==='REJECTED'||record.record_status==='CLOSED'){
    const reject={};REJECTED_COLUMNS.forEach(function(c){reject[c[1]]=record[c[0]];});reject['Opportunity ID']=obj['Opportunity ID'];reject['Last Seen']=now;reject['Last Bot Update']=now;
    const rej=ss.getSheetByName('Rejected'),prior=v2Rows_(rej).find(function(r){return r['Opportunity ID']===obj['Opportunity ID'];});if(prior)v2Write_(rej,prior._row,reject);else v2Append_(rej,reject);
  }
  const result={ok:true,opportunity_id:obj['Opportunity ID'],inserted:existing?0:1,updated:existing?1:0,changed_deadline:changed};if(memo)v2SetState_(ss,memo,result);return result;
}
function v2Benchmark_(ss,rows) {
  return v2Rows_(ss.getSheetByName('Benchmark')).filter(function(r){return r['Official URL'];}).map(function(b){
    const url=v2Canonical_(b['Official URL']);const found=rows.filter(function(r){return ['Official URL','Application URL','Source URL'].some(function(k){return v2Canonical_(r[k])===url;})&&(!b.Edition||String(r['Edition Year'])===String(b.Edition));});
    const q=v2Rows_(ss.getSheetByName('Bot Queue')).find(function(r){return v2Canonical_(r.URL)===url;});
    return {title:b.Title,edition:String(b.Edition||''),found:found.length>0,stage:found.length?'Stored: '+found[0]['Record Status']:q?q.State+': '+q.Detail:'Not discovered; add source/query or inspect indexing'};
  });
}
function v2Dispatch_(ss,p) {
  switch(p.action){
    case 'runtime': {const settings=v2Preferences_(ss);return {ok:true,settings:settings,enabled:settings.enabled,query_cursor:v2State_(ss,'query_cursor',0)};}
    case 'set_cursor': {const key='cursor:'+p.request_id;if(!v2State_(ss,key,false)){v2SetState_(ss,'query_cursor',Number(p.cursor)||0);v2SetState_(ss,key,true);}return {ok:true};}
    case 'enqueue':return v2Enqueue_(ss,p.items);
    case 'queue_due':return {ok:true,items:v2Due_(ss)};
    case 'queue_result':{
      const s=ss.getSheetByName('Bot Queue'),r=v2Rows_(s).find(function(r){return v2Canonical_(r.URL)===v2Canonical_(p.url);});if(!r)throw new Error('Queue URL missing');
      const next=new Date();next.setDate(next.getDate()+Math.max(1,Math.min(90,Number(p.revisit_days)||1)));
      v2Write_(s,r._row,{State:p.outcome==='DONE'?'DONE':'RETRY','Next Check':Utilities.formatDate(next,DEFAULT_TIMEZONE,'yyyy-MM-dd'),'Last Checked':v2Now_(),Attempts:Number(r.Attempts||0)+1,Detail:String(p.detail||'').slice(0,1000)});return {ok:true};
    }
    case 'save_record':return v2Save_(ss,p);
    case 'reserve_review':{
      const month=v2Today_().slice(0,7);if(p.month!==month)throw new Error('Reviewer month mismatch');
      const key='review:'+month+':'+p.request_id,prior=v2State_(ss,key,null);if(prior)return {ok:true,allowed:true};
      const amount=Number(p.amount),cap=Math.min(Number(p.budget),v2Preferences_(ss).review_monthly_budget_usd);
      if(!Number.isFinite(amount)||amount<=0||!Number.isFinite(cap)||cap<0)throw new Error('Invalid reviewer reservation');
      let spent=0;v2Rows_(v2StateSheet_(ss)).filter(function(r){return String(r.Key).indexOf('review:'+month+':')===0;}).forEach(function(r){spent+=Number(JSON.parse(r.Value).amount)||0;});
      if(spent+amount>cap)return {ok:true,allowed:false,spent:spent};v2SetState_(ss,key,{amount:amount,reserved:amount,settled:false});return {ok:true,allowed:true};
    }
    case 'settle_review':{
      const s=v2StateSheet_(ss),r=v2Rows_(s).find(function(r){return String(r.Key).indexOf('review:')===0&&String(r.Key).endsWith(':'+p.request_id);});
      if(!r)throw new Error('Reservation missing');const old=JSON.parse(r.Value),amount=Number(p.amount);if(!Number.isFinite(amount)||amount<0)throw new Error('Invalid actual usage');
      v2SetState_(ss,r.Key,{amount:amount,reserved:old.reserved,settled:true});return {ok:true};
    }
    case 'claim_alert':{const key='alert:'+p.notification_id;if(v2State_(ss,key,null))return {ok:true,allowed:false};v2SetState_(ss,key,{state:'CLAIMED',at:v2Now_()});return {ok:true,allowed:true};}
    case 'complete_alert':v2SetState_(ss,'alert:'+p.notification_id,{state:'SENT',at:v2Now_()});return {ok:true};
    case 'refresh_views':return v2Refresh_(ss);
    case 'finish_run':{
      const run=p.run||{},s=ss.getSheetByName('Run Logs'),obj={};RUN_LOG_COLUMNS.forEach(function(c){obj[c[1]]=run[c[0]];});
      if(!run.run_id)throw new Error('Run ID missing');const prior=v2Rows_(s).find(function(r){return r['Run ID']===run.run_id;});if(prior)v2Write_(s,prior._row,obj);else v2Append_(s,obj);
      v2SettingStatus_(ss,'Last run',run.finished_at||v2Now_(),run.status||'');
      v2SettingStatus_(ss,'Last coverage',JSON.stringify(run.coverage||{}),'Attempted/succeeded searches and processed pages by family. A run success is not a recall guarantee.');
      v2SettingStatus_(ss,'Last warnings',(run.errors||[]).join(' | '),'Check GitHub run-report.json for details.');
      return {ok:true};
    }
    default:throw new Error('Unknown v2 action. Make sure both the repo and deployment use version 2.');
  }
}
