import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const source = fs.readFileSync(new URL("../platforms/bilibili.mjs", import.meta.url), "utf8");
function fixture(declaration, initial="内容无需标注", available=["内容无需标注","含AI生成内容"]) {
  let clicks=0;
  const input={value:initial,placeholder:"请选择符合您视频内容的创作声明",closest:()=>select};
  const options=available.map(label=>({innerText:label,__vue__:{selectOptionClick(){clicks++;input.value=label;select.__vue__.selectedLabel=label;}}}));
  const select={__vue__:{selectedLabel:initial},querySelectorAll:()=>options};
  const container={innerText:"内容为自制",__vue__:{isAuthChecked:true}};
  const document={querySelectorAll(selector){if(selector==="input")return [input];if(selector===".creation-statement-container")return [container];return options;}};
  const context={pkg:{platformTitle:{bilibili:"A"},bilibiliTags:[],bilibiliAllowedAutoTags:[],cover:{},contentTypeDeclaration:declaration},videoPath:"a.mp4",wait:async()=>{},js:async expression=>vm.runInNewContext(expression,{document})};
  vm.runInNewContext(source+'\ninspectBilibili=async()=>({gates:{original:{ok:'+JSON.stringify(available.includes(declaration==="含AI生成内容"?"含AI生成内容":"内容无需标注"))+' && true,evidence:{}}}});globalThis.ensure=ensureBilibiliDeclarationV2;',context);
  return {context,input,getClicks:()=>clicks};
}
test("explicit AI declaration selects AI option, not no-mark",async()=>{const f=fixture("含AI生成内容");await f.context.ensure();assert.equal(f.input.value,"含AI生成内容");assert.equal(f.getClicks(),1);});
test("non-AI legacy package retains no-mark default without clicking",async()=>{const f=fixture(undefined);await f.context.ensure();assert.equal(f.input.value,"内容无需标注");assert.equal(f.getClicks(),0);});
test("AI declaration already selected is a no-op",async()=>{const f=fixture("含AI生成内容","含AI生成内容");await f.context.ensure();assert.equal(f.getClicks(),0);});
test("missing AI option fails closed, no false no-mark fallback",async()=>{const f=fixture("含AI生成内容","内容无需标注",["内容无需标注"]);const r=await f.context.ensure();assert.equal(r.ok,false);assert.equal(f.input.value,"内容无需标注");assert.equal(f.getClicks(),0);});
test("original gate uses expected creation mark plus self-made",()=>{assert.match(source,/original:state\.creationMarked&&state\.selfMade/);assert.match(source,/expectedLabel:bilibiliCreationLabel/);});

test("multiline description uses native Quill and delayed page verification",async()=>{
  const value="第一段\n第二段\n含AI生成的示意画面。";
  const editor={className:"ql-editor",innerText:"旧稿",focus(){},parentElement:{}};
  editor.parentElement.__quill={setText(text,origin){assert.equal(origin,"user");editor.innerText=text;}};
  const document={querySelectorAll:()=>[editor]};
  const context={pkg:{platformTitle:{bilibili:"A"},bilibiliDescription:value,bilibiliTags:[],bilibiliAllowedAutoTags:[],cover:{}},videoPath:"a.mp4",wait:async()=>{},js:async expression=>vm.runInNewContext(expression,{document})};
  vm.runInNewContext(source+'\ninspectBilibili=async()=>({gates:{description:{ok:true,evidence:{}}}});globalThis.setDescription=setBilibiliDescriptionV2;',context);
  const result=await context.setDescription();
  assert.equal(editor.innerText,value);assert.equal(result.nativeQuillCommand,true);
});
test("description missing native Quill fails closed, keeps existing text",async()=>{
  const editor={className:"ql-editor",innerText:"旧稿",focus(){},parentElement:{}};
  const document={querySelectorAll:()=>[editor]};
  const context={pkg:{platformTitle:{bilibili:"A"},bilibiliDescription:"新稿",bilibiliTags:[],bilibiliAllowedAutoTags:[],cover:{}},videoPath:"a.mp4",wait:async()=>{},js:async expression=>vm.runInNewContext(expression,{document})};
  vm.runInNewContext(source+'\ninspectBilibili=async()=>({gates:{description:{ok:false,evidence:{}}}});globalThis.setDescription=setBilibiliDescriptionV2;',context);
  const result=await context.setDescription();assert.equal(result.ok,false);assert.equal(editor.innerText,"旧稿");
});

function currentNativeRightsFixture({initial='内容无需标注',checked=true,resetOnMarkChange=true,missingRights=false}={}) {
  let rights=checked,pendingReset=false,rightsClicks=0;
  const input={value:initial,placeholder:"请选择符合您视频内容的创作声明",closest:()=>select};
  const select={__vue__:{selectedLabel:initial},querySelectorAll:()=>options};
  const options=['内容无需标注','含AI生成内容'].map(label=>({innerText:label,__vue__:{selectOptionClick(){input.value=label;select.__vue__.selectedLabel=label;pendingReset=resetOnMarkChange;}}}));
  const auth={innerText:'内容为自制：未经作者允许，禁止转载',querySelector:()=>rights?{}:null,getAttribute:()=>null,click(){rights=!rights;rightsClicks++;}};
  const document={querySelectorAll(selector){if(selector==='input')return [input];if(selector==='.auth-content')return missingRights?[]:[auth];if(selector==='.creation-statement-container')return [];return options;}};
  const context={pkg:{platformTitle:{bilibili:'A'},bilibiliTags:[],bilibiliAllowedAutoTags:[],cover:{},contentTypeDeclaration:'含AI生成内容'},videoPath:'a.mp4',wait:async()=>{if(pendingReset){rights=false;pendingReset=false;}},js:async expression=>vm.runInNewContext(expression,{document})};
  vm.runInNewContext(source+'\nglobalThis.ensure=ensureBilibiliDeclarationV2;',context);
  context.inspectBilibili=async()=>({gates:{original:{ok:input.value==='含AI生成内容'&&rights&&!missingRights,evidence:{creation:input.value,selfMade:rights}}}});
  return {context,getRights:()=>rights,getClicks:()=>rightsClicks};
}
test('AI select resets rights on next render; restoration waits and remains idempotent',async()=>{
  const f=currentNativeRightsFixture();
  assert.equal((await f.context.ensure()).ok,true);
  assert.equal(f.getRights(),true);assert.equal(f.getClicks(),1);
  assert.equal((await f.context.ensure()).ok,true);assert.equal(f.getClicks(),1);
});
test('current native selected rights without old Vue container are preserved',async()=>{
  const f=currentNativeRightsFixture({initial:'含AI生成内容'});
  assert.equal((await f.context.ensure()).ok,true);assert.equal(f.getClicks(),0);
});
test('missing native rights control cannot satisfy original gate',async()=>{
  const f=currentNativeRightsFixture({initial:'含AI生成内容',checked:false,missingRights:true});
  assert.equal((await f.context.ensure()).ok,false);assert.equal(f.getClicks(),0);
});
