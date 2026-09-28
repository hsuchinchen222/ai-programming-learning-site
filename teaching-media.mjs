const escape = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sessions = new Map();
let playback=null;
const videoUrls=new Map();
const reduced=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
export function stopMedia(){for(const [v,url] of videoUrls){if(!v.isConnected){URL.revokeObjectURL(url);videoUrls.delete(v);}}if(playback){clearInterval(playback.timer);playback=null;}if(typeof document!=='undefined'){document.querySelectorAll('video').forEach(v=>v.pause());document.querySelectorAll('[data-action="media-play"]').forEach(b=>{b.textContent='播放狀態變化';b.setAttribute('aria-pressed','false');});}}
if(typeof document!=='undefined'){
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopMedia();});
 document.addEventListener('toggle',e=>{if(e.target.tagName==='DETAILS'&&!e.target.open)stopMedia();},true);
 document.addEventListener('error',e=>{if(e.target.tagName==='VIDEO'){const note=e.target.closest('[data-media-panel]')?.querySelector('[data-video-status]');if(note)note.textContent='影片目前無法播放；請展開下方文字操作對照，仍可繼續試做。';}},true);
 if(typeof matchMedia==='function')matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',()=>stopMedia());
}

export function initialMediaState(){return {caseIndex:0,frame:0,revealed:false,prediction:''};}
export function mediaTransition(media,state,action,value){
 const next={...state};
 if(action==='case'){const n=Number(value);if(Number.isInteger(n)&&n>=0&&n<media.cases.length)return {...initialMediaState(),caseIndex:n};return next;}
 if(action==='prediction'){next.prediction=String(value).slice(0,1000);return next;}
 if(action==='reset')return {...initialMediaState(),caseIndex:state.caseIndex};
 if(action==='reveal'){next.revealed=true;return next;}
 if(action==='next'&&state.revealed)next.frame=Math.min(media.cases[state.caseIndex].frames.length-1,state.frame+1);
 if(action==='previous')next.frame=Math.max(0,state.frame-1);
 return next;
}
function stateFor(id){if(!sessions.has(id))sessions.set(id,initialMediaState());return sessions.get(id);}
export function mediaPanel(lesson,state=stateFor(lesson.id)){
 const m=lesson.media;if(!m)return '';if(m.kind==='screencast'||m.kind==='explainer')return videoPanel(lesson);
 const c=m.cases[state.caseIndex], f=c.frames[state.frame], e=escape;
 const button=(action,label,disabled=false)=>`<button type="button" class="button secondary" data-action="media-${action}" data-id="${e(lesson.id)}" ${disabled?'disabled':''}>${label}</button>`;
 return `<section class="media-panel" data-media-panel="${e(lesson.id)}" aria-label="${e(m.title)}" tabindex="-1"><h3>${e(m.title)}</h3><p>${e(m.intro)}</p><p class="mode-note">${e(m.source)} · 可自行掌握節奏。這是選定情境，不是任意程式的即時追蹤器；觀看不算通過。圖解操作與預測重開頁面後會重設，課程草稿照常保存。</p><label for="media-case-${e(lesson.id)}">換一個情境</label><select class="select" id="media-case-${e(lesson.id)}" data-media-case="${e(lesson.id)}">${m.cases.map((x,i)=>`<option value="${i}" ${i===state.caseIndex?'selected':''}>${e(x.label)}</option>`).join('')}</select><p><strong>先預測：</strong>${e(c.prediction)}</p><label for="media-predict-${e(lesson.id)}">先寫下你的預測（不評分，可先在心裡想）</label><input class="search" id="media-predict-${e(lesson.id)}" maxlength="1000" data-media-prediction="${e(lesson.id)}" value="${e(state.prediction)}">${state.revealed?'':button('reveal','我想好了，開始逐步對照')}<div class="media-code" aria-label="${m.codeLanguage==='python'?'範例程式':'流程示意，非可執行程式'}">${c.code.split('\n').map((line,i)=>`<div class="media-line ${state.revealed&&f.line===i+1?'current':''}"><span class="media-number">${i+1}</span><code>${e(line)||' '}</code>${state.revealed&&f.line===i+1?'<span class="media-mark">◀ 本步</span>':''}</div>`).join('')}</div>${state.revealed?`<div class="media-state" role="status" aria-live="polite" aria-atomic="true"><strong>狀態 ${state.frame+1} / ${c.frames.length} · ${f.line?'對照第 '+f.line+' 行':'流程對照'}</strong><p>${e(f.caption)}</p><dl class="media-cells">${f.cells.map(x=>`<div><dt>${e(x.label)}</dt><dd>${e(x.value)}</dd></div>`).join('')}</dl></div><div class="button-row">${button('previous','上一個狀態',state.frame===0)}${button('next','下一個狀態',state.frame===c.frames.length-1)}${button('reset','重新預測')}${m.motion?`<button type="button" class="button secondary" data-action="media-play" data-id="${e(lesson.id)}" aria-pressed="${playback?.id===lesson.id}">${playback?.id===lesson.id?'暫停動畫':'播放狀態變化'}</button><p class="mode-note" data-motion-status>${reduced()?'已啟用減少動態，請用上／下一個狀態。':'每個狀態停留6秒，播到最後即停止；可隨時暫停或逐步看。'}</p>`:''}</div>${state.frame===c.frames.length-1?`<div class="callout"><strong>對照你的預測</strong><p>${e(c.answer)}</p><p>${e(m.transfer)}</p><p>可以換另一個情境，先說出會改變什麼；最後到試做區自己驗證。</p></div>`:''}`:''}<details class="media-text"><summary>直接看完整文字對照（不用操作圖解）</summary><ol>${c.frames.map(x=>`<li><strong>${e(x.caption)}</strong><p>${x.cells.map(v=>`${e(v.label)}：${e(v.value)}`).join('；')}</p></li>`).join('')}</ol><p>${e(c.answer)}</p><p>${e(m.transfer)}</p></details><details><summary>回看本課原示範與逐步說明</summary><pre class="teaching-code">${e(lesson.example)}</pre><ol>${lesson.steps.map(x=>`<li><strong>${e(x.label)}</strong> ${e(x.detail)}</li>`).join('')}</ol></details></section>`;
}
export function renderMedia(lesson){if(!lesson.media)return '';const m=lesson.media,panel=mediaPanel(lesson);const optional=(body,descriptor,label)=>descriptor.collapsed?`<details class="media-optional"><summary>${label}：${escape(descriptor.title)}</summary>${body}</details>`:body;return (m.video?optional(videoPanel(lesson,m.video),m.video,'需要影片時再看'):'')+optional(panel,m,m.kind==='state-diagram'?'需要圖解時再看':'需要影片時再看');}
function refreshPanel(box,lesson,action,animate=false){
 box.outerHTML=mediaPanel(lesson);const panel=document.querySelector(`[data-media-panel="${lesson.id}"]`);
 if(animate&&!reduced())panel.querySelector('.media-state')?.classList.add('media-moving');
 const same=panel.querySelector(`[data-action="${action}"]:not([disabled])`);(same||panel).focus({preventScroll:true});
}
export function handleMediaClick(button,lesson){
 const action=button.dataset.action;if(!action?.startsWith('media-')||!lesson?.media)return false;
 const box=button.closest('[data-media-panel]');if(!box)return false;
 if(action==='media-video-load'){
  const video=box.querySelector('video');button.disabled=true;
  box.querySelector('[data-video-status]').textContent='正在載入本機影片…';
  // Only load after the learner requests it. HTTPS hosts with Range support use
  // native streaming (including WebKit); simple local servers retain Blob seek.
  (async()=>{
   const file=(lesson.media.video||lesson.media).file;
   let url;
   if(document.location?.protocol==='https:'){
    const head=await fetch(file,{method:'HEAD'});
    if(!head.ok)throw Error('media unavailable');
    if(head.headers.get('accept-ranges')?.toLowerCase()==='bytes')url=file;
   }
   if(!url){
    const response=await fetch(file);if(!response.ok)throw Error('media unavailable');
    const blob=await response.blob();if(!video.isConnected)return;
    url=URL.createObjectURL(blob);videoUrls.set(video,url);
   }
   if(!video.isConnected)return;video.src=url;video.load();
   box.querySelector('[data-video-status]').textContent='影片已載入；請使用播放器播放、暫停或拖曳。無旁白，繁中字幕可在播放器切換。';button.hidden=true;
  })().catch(()=>{box.querySelector('[data-video-status]').textContent='影片目前無法播放；請展開下方文字操作對照，仍可繼續試做。';button.disabled=false;});return true;
 }
 if(action==='media-play'){
  if(playback?.id===lesson.id){stopMedia();return true;}
  stopMedia();
  if(reduced()){box.querySelector('[data-motion-status]').textContent='已啟用減少動態；請用上／下一個狀態，完整文字也在下方。';return true;}
  let state=stateFor(lesson.id);if(state.frame===lesson.media.cases[state.caseIndex].frames.length-1)state={...state,frame:0};
  sessions.set(lesson.id,{...state,revealed:true});
  playback={id:lesson.id,timer:setInterval(()=>{
   const panel=document.querySelector(`[data-media-panel="${lesson.id}"]`);if(!panel){stopMedia();return;}
   const before=stateFor(lesson.id),next=mediaTransition(lesson.media,before,'next');sessions.set(lesson.id,next);
   if(next.frame===lesson.media.cases[next.caseIndex].frames.length-1)stopMedia();
   // Only update the changing visual, never steal focus during timed playback.
   const holder=document.createElement('div');holder.innerHTML=mediaPanel(lesson);
   panel.querySelector('.media-state').replaceWith(holder.querySelector('.media-state'));
   panel.querySelector('.media-state').classList.add('media-moving');
   panel.querySelector('[data-action="media-previous"]').disabled=next.frame===0;
   panel.querySelector('[data-action="media-next"]').disabled=next.frame===lesson.media.cases[next.caseIndex].frames.length-1;
   const old=panel.querySelector('.media-end');if(old)old.remove();
   if(next.frame===lesson.media.cases[next.caseIndex].frames.length-1){const end=document.createElement('div');end.className='callout media-end';end.textContent=lesson.media.cases[next.caseIndex].answer+' '+lesson.media.transfer;panel.querySelector('.media-state').after(end);}
   panel.querySelector('.media-code').replaceWith(holder.querySelector('.media-code'));
  },lesson.media.motion.secondsPerState*1000)};
  refreshPanel(box,lesson,action,true);return true;
 }
 stopMedia();sessions.set(lesson.id,mediaTransition(lesson.media,stateFor(lesson.id),action.slice(6)));
 refreshPanel(box,lesson,action,action==='media-next'||action==='media-previous');return true;
}
export function handleMediaInput(target,lesson){
 if(!lesson?.media||lesson.media.kind!=='state-diagram')return false;
 if(target.dataset.mediaPrediction){sessions.set(lesson.id,mediaTransition(lesson.media,stateFor(lesson.id),'prediction',target.value));return true;}
 if(target.dataset.mediaCase){stopMedia();const box=target.closest('[data-media-panel]');sessions.set(lesson.id,mediaTransition(lesson.media,stateFor(lesson.id),'case',target.value));box.outerHTML=mediaPanel(lesson);document.getElementById('media-case-'+lesson.id).focus({preventScroll:true});return true;}
 return false;
}
export function videoPanel(lesson,m=lesson.media){
 const e=escape,concept=m.kind==='explainer';
 return `<section class="media-panel" data-media-panel="${e(lesson.id)}-video" aria-label="${e(m.title)}"><span class="eyebrow">${concept?'概念短片':'真實操作錄影'} · ${m.durationSeconds}秒 · 繁中字幕 · 無旁白</span><h3>${e(m.title)}</h3><p>${e(m.intro)}</p><video controls playsinline preload="none" poster="${e(m.poster)}" aria-label="${e(m.title)}"><track kind="captions" src="${e(m.captions)}" srclang="zh-Hant" label="繁體中文" default></video><button type="button" class="button secondary" data-action="media-video-load" data-id="${e(lesson.id)}">載入本機示範影片</button><p data-video-status role="status">影片不會自動下載或播放。可直接閱讀下方操作對照。</p><p>${e(m.transfer)}</p><details><summary>文字操作對照（影片無法播放時也能學）</summary><ol>${m.transcript.map(x=>`<li><strong>${e(x.time)}</strong> ${e(x.text)}</li>`).join('')}</ol></details><p class="mode-note">${e(m.source)} · ${e(m.recordedAt)}。${concept?'這是概念示意，並非軟體的實際執行畫面。':'這是真實操作示範。'}觀看不算通過。${e(m.contextNote||'')}</p></section>`;
}
