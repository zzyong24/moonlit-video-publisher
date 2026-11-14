import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const xhsSource=fs.readFileSync(new URL('../platforms/xiaohongshu.mjs',import.meta.url),'utf8');
const biliSource=fs.readFileSync(new URL('../platforms/bilibili.mjs',import.meta.url),'utf8');

function originalFixture({checked=false,initialOpen=true,enableAfter=2,closeAfter=2,optimisticToggle=false,completed=false,missingInput=false,missingWrapper=false,missingConfirm=false,holdOpen=false,neverEnabled=false}={}) {
  const state={open:initialOpen&&!completed,checked,toggle:completed||optimisticToggle,enabled:checked&&!neverEnabled,waits:0,acceptedAt:null,confirmedAt:null,clicks:[]};
  const rect=()=>({width:200,height:40});
  const wrapper={getBoundingClientRect:rect,scrollIntoView(){},id:''};
  const input={get checked(){return state.checked},getBoundingClientRect:()=>({width:0,height:0}),closest:()=>missingWrapper?null:wrapper};
  const button={innerText:'声明原创',get disabled(){return !state.enabled},getBoundingClientRect:rect,scrollIntoView(){},getAttribute:()=>null,className:'',id:''};
  const modal={innerText:'原创声明须知 我已阅读 声明原创',getBoundingClientRect:()=>({width:500,height:400}),querySelector(selector){if(selector==='input[type="checkbox"]')return missingInput?null:input;if(selector==='.footerLeft .d-checkbox')return missingWrapper?null:wrapper;return null},querySelectorAll:()=>missingConfirm?[]:[button]};
  const document={querySelectorAll:()=>state.open?[modal]:[]};
  const page={async click(selector){state.clicks.push(selector);if(selector==='#vp2-xhs-original-control'){state.open=true;}else if(selector==='#vp2-xhs-original-agreement'){assert.equal(state.checked,false);state.checked=true;state.acceptedAt=state.waits;}else if(selector==='#vp2-xhs-original-confirm'){assert.equal(state.checked,true);assert.equal(state.enabled,true);state.confirmedAt=state.waits;}else throw new Error('unexpected click '+selector)}};
  const context={pkg:{platformTitle:{xiaohongshu:'Title'},xhsTopics:[],cover:{}},videoPath:'video.mp4',activeTaskSpace:{id:1},taskSpace:async()=>({tabs:async()=>[{url:'https://creator.xiaohongshu.com',label:'editor'}],page:()=>page}),removeExactStaleMask:async()=>{},wait:async()=>{state.waits++;if(state.acceptedAt!==null&&!neverEnabled&&state.waits-state.acceptedAt>=enableAfter)state.enabled=true;if(state.confirmedAt!==null&&!holdOpen&&state.waits-state.confirmedAt>=closeAfter){state.open=false;state.toggle=true}},js:async expression=>expression.includes("target.id='vp2-xhs-original-control'")?{ok:true,selector:'#vp2-xhs-original-control'}:vm.runInNewContext(expression,{document,getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1'})})};
  vm.runInNewContext(xhsSource+'\nglobalThis.ensure=ensureXhsOriginal;globalThis.modalProbe=inspectXhsOriginalModal;',context);
  context.activateXhsTopicLifecycle=async()=>({ok:true});
  // Deliberately optimistic: modal validation must independently reject this transient switch.
  context.inspectXiaohongshu=async()=>({gates:{original:{ok:state.toggle}}});
  return {state,context};
}

test('new original declaration opens switch then completes agreement',async()=>{
  const f=originalFixture({initialOpen:false});assert.equal((await f.context.ensure()).ok,true);assert.deepEqual(f.state.clicks,['#vp2-xhs-original-control','#vp2-xhs-original-agreement','#vp2-xhs-original-confirm']);
});
test('hidden native input uses one visible agreement click and waits for async confirm',async()=>{
  const f=originalFixture();const r=await f.context.ensure();assert.equal(r.ok,true);assert.deepEqual(f.state.clicks,['#vp2-xhs-original-agreement','#vp2-xhs-original-confirm']);assert.ok(f.state.confirmedAt>=2);assert.equal(f.state.open,false);assert.equal(f.state.checked,true);
});
test('already accepted but open dialog still confirms once without toggling agreement',async()=>{
  const f=originalFixture({checked:true,optimisticToggle:true});assert.equal((await f.context.ensure()).ok,true);assert.deepEqual(f.state.clicks,['#vp2-xhs-original-confirm']);
});
test('permanently disabled confirmation cannot pass via transient enabled originality',async()=>{
  const f=originalFixture({optimisticToggle:true,neverEnabled:true});const r=await f.context.ensure();assert.equal(r.ok,false);assert.match(r.reason,/disabled/);assert.deepEqual(f.state.clicks,['#vp2-xhs-original-agreement']);
});
test('confirmation that leaves modal open cannot pass via optimistic toggle',async()=>{
  const f=originalFixture({checked:true,optimisticToggle:true,holdOpen:true});assert.equal((await f.context.ensure()).ok,false);assert.deepEqual(f.state.clicks,['#vp2-xhs-original-confirm']);
});
test('completed original state with no dialog is a no-op',async()=>{
  const f=originalFixture({completed:true});assert.equal((await f.context.ensure()).already,true);assert.deepEqual(f.state.clicks,[]);
});
test('missing native agreement state fails closed without clicks',async()=>{
  const f=originalFixture({missingInput:true});assert.equal((await f.context.ensure()).ok,false);assert.deepEqual(f.state.clicks,[]);
});
test('missing visible agreement control does not click hidden input',async()=>{
  const f=originalFixture({missingWrapper:true});assert.equal((await f.context.ensure()).ok,false);assert.deepEqual(f.state.clicks,[]);
});
test('fresh inspector rejects enabled original toggle when agreement modal remains',async()=>{
  const state={originalEnabled:true,originalDialogOpen:true,activeDialogs:[{text:'原创声明须知'}],selected:[],plainResidue:[],duplicate:[],topicCounts:{},title:'Title',filenameVisible:true,uploaded:true,coverBg:'cover'};
  const ctx={pkg:{platformTitle:{xiaohongshu:'Title'},xhsTopics:[],cover:{}},videoPath:'video.mp4',expectedReceipts:{},PLATFORM_URLS:{xiaohongshu:'url'},js:async()=>state,inspectFinalButtons:async()=>[],okGate:evidence=>({ok:true,evidence}),failedGate:evidence=>({ok:false,evidence})};
  vm.runInNewContext(xhsSource+'\nglobalThis.inspect=inspectXiaohongshu;',ctx);
  const r=await ctx.inspect();assert.equal(r.gates.original.ok,false);assert.equal(r.gates.original.evidence.enabled,true);assert.equal(r.gates.noBlockingDialog.ok,false);
});

function coverState(text='',ok=false){return {gates:{video:{ok:true},cover:{ok,evidence:{urls:[]}},noBlockingDialog:{ok:!text,evidence:{active:text?[{text}]:[]}},title:{ok:true},description:{ok:true},original:{ok:true},tags:{ok:true}},evidence:{pageSample:text}}}
function biliFixture(states){let index=0,sideEffects=0;const ctx={pkg:{platformTitle:{bilibili:'Title'},bilibiliTags:[],bilibiliAllowedAutoTags:[],cover:{uploadCustomCover:true,horizontal4x3Path:'main.png'}},videoPath:'video.mp4',expectedReceipts:{cover:{assetPath:'main.png'}},activeTaskSpace:{id:1},activateBilibiliUploadLifecycle:async()=>{sideEffects++},taskSpace:async()=>({tabs:async()=>[]}),js:async()=>({ok:true}),wait:async()=>{},uploadFile:async()=>{throw new Error('must not upload')},checkpointReceipts:()=>({ok:false,skipped:true}),typedBlocker:(code,message,extra)=>({code,message,...extra})};vm.runInNewContext(biliSource+'\nglobalThis.upload=uploadBilibiliCoverV2;globalThis.mutate=mutateBilibili;',ctx);ctx.activateBilibiliUploadLifecycle=async()=>{sideEffects++};ctx.inspectBilibili=async()=>states[Math.min(index++,states.length-1)];return {ctx,sideEffects:()=>sideEffects}}

test('dual editor is handed off before uploading first cover',async()=>{
  const f=biliFixture([coverState('首页推荐封面（4:3） 个人空间封面（16:9） 双比例同步改动')]);const r=await f.ctx.upload();assert.equal(r.reasonCode,'manual_dual_slot_required');assert.equal(f.sideEffects(),0);
});
test('dual editor revealed after opening stops before file injection',async()=>{
  const f=biliFixture([coverState(),coverState('首页推荐封面（4:3） 个人空间封面（16:9）')]);assert.equal((await f.ctx.upload()).reasonCode,'manual_dual_slot_required');assert.equal(f.sideEffects(),1);
});
test('sync prompt remains explicit recoverable state, not rejected asset or auto-sync',async()=>{
  const f=biliFixture([coverState('检测到个人空间封面（16:9）未修改 不同步，手动编辑 确认同步')]);const r=await f.ctx.mutate();assert.equal(r.blocker.code,'STATE_AMBIGUOUS');assert.equal(r.blocker.evidence.reasonCode,'manual_dual_slot_required');assert.equal(r.blocker.retryable,false);assert.equal(f.sideEffects(),0);
});
test('verified primary without dual editor stays existing no-op route',async()=>{
  const f=biliFixture([coverState('',true)]);assert.equal((await f.ctx.upload()).already,true);assert.equal(f.sideEffects(),0);
});

function modernXhsCoverFixture(){
  const calls={uploads:[],clicks:[],checkpoints:0};
  const ctx={pkg:{platformTitle:{xiaohongshu:'Title'},xhsTopics:[],cover:{uploadCustomCover:true,platformAssets:{xiaohongshu:[{path:'portrait.png',ratio:'3:4'}]}}},videoPath:'video.mp4',wait:async()=>{},uploadFile:async(selector,file)=>calls.uploads.push({selector,file}),click:async selector=>calls.clicks.push(selector),typedBlocker:(code,message,extra)=>({code,message,...extra}),checkpointReceipts:()=>{calls.checkpoints++;return {}},js:async expression=>{
    if(expression.includes('PK cover guide dismiss control'))return {ok:true,dismissed:false};
    if(expression.includes('const el=document.querySelector'))return 'old-cover-url';
    if(expression.includes("return {ok:true,mode:'modern'"))return {ok:true,mode:'modern',selector:'#cover-image'};
    if(expression.includes('xiaohongshu cover input missing'))return {ok:true,selector:'#cover-image'};
    throw new Error('unexpected browser step after modern upload');
  }};
  vm.runInNewContext(xhsSource+'\nglobalThis.upload=uploadXhsCover;globalThis.mutate=mutateXiaohongshu;',ctx);
  ctx.inspectXiaohongshu=async()=>({gates:{video:{ok:true},title:{ok:true},tags:{ok:true}}});ctx.ensureXhsOriginal=async()=>({ok:true,already:true});
  return {ctx,calls};
}
test('modern 3:4 upload stops before completion and never fabricates ratio receipt',async()=>{
  const f=modernXhsCoverFixture();const r=await f.ctx.upload();assert.equal(r.ok,false);assert.equal(r.reasonCode,'manual_crop_ratio_required');assert.equal(r.expectedRatio,'3:4');assert.equal(r.receipt,undefined);assert.equal(f.calls.uploads.length,1);assert.equal(f.calls.uploads[0].file,'portrait.png');assert.deepEqual(f.calls.clicks,[]);
});
test('modern crop confirmation boundary is explicit and writes no accepted checkpoint',async()=>{
  const f=modernXhsCoverFixture();const r=await f.ctx.mutate();assert.equal(r.blocker.code,'STATE_AMBIGUOUS');assert.equal(r.blocker.retryable,false);assert.equal(r.blocker.evidence.reasonCode,'manual_crop_ratio_required');assert.equal(f.calls.checkpoints,0);assert.deepEqual(f.calls.clicks,[]);
});
