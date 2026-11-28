/* Local publication preview; never submits content to a remote service. */
(() => {
 const P=Prototype,{ $, $$, text, esc, link, match, go, modal, status, save, read, copy }=P;
 const file=location.pathname.split('/').pop();
 const links=document.createElement('nav');links.className='proto-context';links.setAttribute('aria-label','Publy 页面');links.innerHTML=[['preview-article','文章'],['preview-cards','图片消息'],['history','发布历史'],['settings','设置']].map(([f,t])=>`<a href="${f}.html"${file===f+'.html'?' aria-current="page"':''}>${t}</a>`).join('');$('.tabbar')?.after(links);
 $$('button[title*="发布历史"]').forEach(b=>link(b,()=>go('history.html')));
 $$('button[title="关闭"]').forEach(b=>link(b,()=>go('preview-article.html')));
 $$('button[title*="重新渲染"]').forEach(b=>link(b,()=>{const strip=$('.strip');if(strip)strip.textContent='预览已更新 · 本地示例，未投递';status('本地预览已重新渲染')}));
 $$('button[title*="复制排版"]').forEach(b=>link(b,async()=>{const paper=$('.paper')||$('.cardgrid');if(!paper)return;try{if(!window.ClipboardItem)throw Error('unsupported');await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([paper.outerHTML],{type:'text/html'}),'text/plain':new Blob([text(paper)],{type:'text/plain'})})]);status('已复制富文本')}catch{copy(text(paper))}}));
 $('.segpill button').forEach(b=>{b.setAttribute('aria-pressed',String(b.classList.contains('on')));link(b,()=>{$('.segpill button').forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-pressed',String(x===b))});const paper=$('.paper');const width=parseInt(text(b),10);if(paper&&Number.isFinite(width)){paper.style.width=width+'px';paper.style.maxWidth='100%'}})});
 $$('button').filter(b=>text(b).includes('投递')&&!b.disabled).forEach(b=>link(b,()=>modal('投递选项','本次选择与 CLI 参数一致；不会读取或修改笔记属性。目标：TuringLambdaAI 草稿箱。',[{label:'类型',name:'format',options:['文章','图片配文','文字卡片']},{label:'标题',name:'title',value:'居家咖啡指南',required:true},{label:'作者',name:'author',value:''},{label:'摘要',name:'digest',value:''},{label:'配文',name:'caption',type:'textarea',value:''}],()=>go('preflight.html'),'检查本次投递')));
 if(file==='preflight.html'){
   let cover=false,checked=false,sent=false;const send=$('button.primary'),row=$('.pf.is-fail'),strip=$('.strip'),summary=$('.sumline');
   // The sample has exactly one blocking item. Selecting a cover requires a fresh check.
   function update(){
     const ready=cover&&checked;
     if(row){row.classList.toggle('is-fail',!ready);row.classList.toggle('is-pass',ready);$('.ic',row).textContent=ready?'✓':'✕';$('.dd',row).textContent=ready?'已检查内置封面样例 cover-sample.svg。':cover?'已选择内置封面，等待重新检查。':'示例封面文件不存在，请选择封面。';}
     if(strip){strip.classList.toggle('is-error',!ready);strip.textContent=ready?'检查通过 · 2 项建议复核 · 尚未投递':cover?'封面已选择，请重新检查。':'素材未就绪，草稿未发送。修复 1 项后重新检查。';}
     if(summary){$('.n-fail',summary).textContent=(ready?0:1)+' 项需修复';$('.n-pass',summary).textContent=(ready?4:3)+' 项通过';}
     if(send){send.disabled=!ready||sent;send.title=sent?'本次演示已完成':ready?'模拟投递，不联网':'存在未检查或未修复项';}
   }
   match('button',/^选择封面/,()=>modal('选择示例封面','使用内置封面演示通过检查；不读取真实附件。',[{label:'封面',name:'cover',options:['cover-sample.svg']}],()=>{cover=true;checked=false;update();status('已选择本地封面样例。请重新检查。')},'使用'));
   $$('button[title*="检查"]').forEach(b=>link(b,()=>{checked=cover;update();status(checked?'本地检查通过，仍有 2 项建议复核':'封面尚未选择，投递仍被拦截');}));
   if(send)link(send,()=>{if(!cover||!checked||sent)return;modal('模拟投递草稿箱？','1 项封面问题已修复，2 项警告仍需复核。此原型不连接服务，不创建真实草稿。',[],()=>{sent=true;update();send.textContent='模拟投递已完成';if(strip)strip.textContent='模拟投递完成 · 未创建真实草稿';status('模拟投递完成 · 未联网 · 未创建真实草稿')},'模拟投递');});
   update();
 }
 if(file==='preview-article.html'){const strip=$('.strip');if(strip)strip.textContent='本地预览样例 · 未向真实草稿箱投递';}
 if(file==='preview-cards.html'){
   const skeletons=$$('.card.skel');skeletons.forEach((el,i)=>{el.classList.remove('skel');el.replaceChildren();const pg=document.createElement('span');pg.className='pg';pg.textContent=(i+7)+' / 9';const title=document.createElement('div');title.className='pt';title.textContent=['处理法影响风味','记录你的冲煮参数','下一杯，做一次小实验'][i];el.append(pg,title)});const counter=$('.counter');if(counter)counter.textContent='本地卡片示例 · 9 / 9';
 }
 match('button',/^取消任务$/,b=>modal('取消本地演示任务？','只改变本页示例记录，不取消真实排期。',[],()=>{const row=b.closest('.ti');$('.sub',row).textContent='演示排期已取消';b.remove()},'取消排期'));
 match('button',/^查询结果$/,b=>modal('查询演示结果','示例任务结果未知。原型未连接服务，不能核实真实草稿状态；请保留未知状态。'));
 match('button',/^重试原请求$/,()=>modal('重试原请求（演示）','复用示例请求标识；不会发出网络请求或创建草稿。',[],()=>status('已演示原请求重试；结果仍为未知'),'演示重试'));
 $$('button[title="刷新"]').forEach(b=>link(b,()=>status('示例历史已刷新 · 未联网')));
 if(file==='settings.html'){
   const inputs=$$('.dbody .input');inputs.forEach((div,i)=>{const input=document.createElement('input');input.className=div.className;input.type=i===1?'password':'text';input.setAttribute('aria-label',['演示服务地址','演示 API key','媒体目录'][i]||'设置');input.value=i===1?'':text(div);input.placeholder=i===1?'仅输入 demo-key':'';div.replaceWith(input)});
   const result=$('.connres');if(result)result.textContent='未连接 · 本地演示';
   match('button',/^测试连接$/,()=>{const key=$('input[type=password]');if(key.value!=='demo-key'){status('请输入 demo-key 体验演示，不要输入真实密钥');key.focus();return}key.value='';result.textContent='演示连接成功 · 未调用真实服务';});P.switches('.switch');
   $$('.drop').forEach(div=>link(div,()=>modal('设置偏好','只保存原型中的非敏感显示偏好。',[{label:'值',name:'value',value:text(div),required:true}],d=>{div.textContent=d.value;save('display-preference',d.value)},'保存')));
 }
 if(file==='empty-state.html'){const b=document.createElement('button');b.className='tbtn';b.textContent='打开示例笔记';link(b,()=>go('preview-article.html'));$('.panel .empty')?.append(b)}
 $$('a[href="#"]').forEach(a=>link(a,()=>modal(text(a),'脚注引用示例，未配置线上来源。')));
 document.addEventListener('keydown',e=>{if(!e.isComposing&&!e.repeat&&e.key==='Escape'&&file==='settings.html'&&!$('dialog[open]'))go('preview-article.html')});
})();
