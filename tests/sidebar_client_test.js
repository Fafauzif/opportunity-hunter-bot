/* Exercise the exact embedded sidebar script without a Google account or browser. */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const server=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'..','apps_script.gs'),'utf8'),server);
const html=server.v2SidebarHTML_(),script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
class Element {
  constructor(tag){this.tag=tag;this.children=[];this.textContent='';this.attributes={};this.events={};}
  appendChild(child){this.children.push(child);return child;}
  replaceChildren(){this.children=[];}
  setAttribute(key,value){this.attributes[key]=value;}
  addEventListener(type,fn){this.events[type]=fn;}
}
const elements=Object.fromEntries(['load','status','content','title','category'].map(id=>[id,new Element(id)]));
const requests=[],run={withSuccessHandler(fn){this.success=fn;return this;},withFailureHandler(fn){this.failure=fn;return this;},getSelectedOpportunityDetails(){requests.push({success:this.success,failure:this.failure});}};
const client=vm.createContext({document:{getElementById:id=>elements[id],createElement:tag=>new Element(tag)},google:{script:{run}}});
vm.runInContext(script,client);
assert.equal(requests.length,1);assert.equal(elements.load.disabled,true);
const data={title:'Student Strategy Challenge',category:'Business Cases',links:[{label:'Official',url:'https://example.org/rules'},{label:'Unsafe',url:'javascript:alert(1)'}],groups:[{title:'Overview',fields:[{label:'Description',value:'<img src=x onerror=alert(1)>'}]}]};
requests.shift().success(data);
assert.equal(elements.load.disabled,false);assert.equal(elements.title.textContent,data.title);
assert.equal(elements.content.children[0].children.length,1);assert.equal(elements.content.children[0].children[0].rel,'noopener noreferrer');
const description=elements.content.children[1].children[1].children[1];assert.equal(description.textContent,data.groups[0].fields[0].value);assert.equal(description.children.length,0);
elements.load.events.click();assert.equal(elements.load.disabled,true);assert.equal(elements.content.children.length,0);
requests.shift().failure({message:'Select a data row'});
assert.equal(elements.load.disabled,false);assert.equal(elements.status.textContent,'Select a data row');assert.equal(elements.content.children.length,0);
elements.load.events.click();requests.shift().success({...data,title:'Another opportunity'});assert.equal(elements.title.textContent,'Another opportunity');
console.log('PASS sidebar initial load, reload, selection error, recovery, text escaping and safe source links');
