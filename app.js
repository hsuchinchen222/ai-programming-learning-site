import {pendingRequirements,learnerErrorLocation,recallQuestion} from './learner-support.mjs?v=2026-09-video-assisted-1';
import {renderMedia,handleMediaClick,handleMediaInput,stopMedia} from './teaching-media.mjs?v=2026-09-video-assisted-1';
import { journeySteps, pathPosition, missingPrerequisites, recommend, nextMilestone, selectedJourney, recommendAcross, journeyForNode, recentPath } from './guided-journey.mjs?v=2026-09-video-assisted-1';
import { LINK_BASES, LINK_PAGES, resolveLessonLink } from './link-lab.mjs?v=2026-09-video-assisted-1';
import { trajectorySamples, hanoiFrames, routeComparison, quantizationRows, boxOverlap, gradientTrace, describeNumbers, analyzeTable, cosine, binaryMetrics, regressionScores } from './learning-labs.mjs?v=2026-09-video-assisted-1';
import { archiveCompletedRecord, currentProjectState, finishProject, currentLessonState, markReinforcement, editActivityDraft, checkShortAnswer, CONTENT_VERSION, parseBackup, makeBackup, replaceProgress, studyRecord, activityAnswer, canFinish, finishLesson, reviewAgain, CLASSIFIER_DATA, trainThreshold, evaluateThreshold } from './learning-core.mjs?v=2026-09-video-assisted-1';
import { htmlPreview } from './html-preview.mjs?v=2026-09-video-assisted-1';
let lessons = new Map();
const recallRevealed=new Set();
let storageProblem = '';
const DATA_URL = './runtime-index.json?v=2026-09-video-assisted-1';
const STORAGE_KEY = 'xuedong-study-progress-v1';
const main = document.getElementById('main');
const toast = document.getElementById('toast');
let data;
let byId;
let progress = loadProgress();
let worker = null;
let workerReady = null;
let workerRun = null;
let workerCounter = 0;
let pendingImport = null;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct = (done, total) => total ? Math.round(done / total * 100) : 0;
const unitHref = (id) => `#unit/${encodeURIComponent(id)}`;
const sourceHref = (id) => `#source/${encodeURIComponent(id)}`;

function loadProgress() {
  try {
    const raw=localStorage.getItem(STORAGE_KEY);if(!raw)return {};
    const parsed=JSON.parse(raw);
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('格式錯誤');
    return parsed;
  }catch{storageProblem='原有紀錄無法讀取。為避免覆寫，已暫停自動儲存；請到我的進度匯入有效備份。';return {};}
}
function saveProgress() {
  if(storageProblem.startsWith('原有紀錄')){showSaveWarning(storageProblem);return false;}
  try {localStorage.setItem(STORAGE_KEY,JSON.stringify(progress));storageProblem='';showSaveWarning('');return true;}
  catch {storageProblem='尚未保存到瀏覽器：儲存空間不足或權限受限。請到「我的進度」匯出目前紀錄；重新整理可能遺失本次變更。';showSaveWarning(storageProblem);announce('儲存失敗，請先匯出備份。');return false;}
}
function showSaveWarning(message){
  let warning=document.getElementById('save-warning');
  if(!warning){warning=document.createElement('div');warning.id='save-warning';warning.className='save-warning';warning.setAttribute('role','alert');document.querySelector('.topbar').after(warning);}
  warning.textContent=message;warning.hidden=!message;
}
function record(id) {
  if (!progress[id]) progress[id] = { read:false, reflection:'', quizCorrect:false, codePass:false, completed:false, step:0 };
  return progress[id];
}
function completed(id) {const l=lessonFor(id),p=projectFor(id);return l?currentLessonState(l,progress[id])==='completed':p?currentProjectState(p,progress[id])==='completed':!!progress[id]?.completed;}
function announce(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(announce.timer);
  announce.timer = setTimeout(() => toast.classList.remove('show'), 3800);
}
function unitsFor(track) { return data.units.filter(x => x.track === track); }
function source(id) { return data.sources.find(x => x.id === id); }
function doneCount(units) { return units.filter(x => completed(x.id)).length; }
const pathHref=id=>id.startsWith('project:')?'#project/'+id.slice(8):unitHref(id);
const nodeFor=id=>lessonFor(id)||projectFor(id);
const nodeTitle=id=>nodeFor(id)?.title||byId.get(id)?.titleZh||id;
const guidedNodes=()=>new Map([...lessons,...Object.values(projectInfo).map(p=>[p.id,p])]);
const activeJourney=()=>new URLSearchParams(location.search).get('path')==='core'?data.journey:selectedJourney(data.journey,new URLSearchParams(location.search).get('path')||recentPath(progress),completed);
const coreComplete=()=>journeySteps(data.journey).every(completed);
const recommendedId=()=>recommendAcross(data.journey,activeJourney(),guidedNodes(),completed);
function pathwayCards(){return `<section class="progress-card"><h2>${coreComplete()?'核心之後，繼續做出作品':'核心之後的兩條路線'}</h2><p>兩條路線共用同一份學習紀錄，已通過的共享課不必重做。可隨時切換；未備齊時會先帶回需要的基礎。</p><div class="pathway-cards">${(data.journey.pathways||[]).map(p=>{const next=recommendAcross(data.journey,p,guidedNodes(),completed),pos=next&&pathPosition(p,next);return `<article><h3>${esc(p.title)}</h3><p>${esc(p.description)}</p><p>${next?`目前：${esc(pos?.phase.title||'先完成核心基礎')}<br>下一步：${esc(nodeTitle(next))}`:'本路線練習已通過，可回看作品與複習。'}</p><a class="button secondary" href="?path=${p.id}#journey">${activeJourney().id===p.id?'查看目前路線':'切換到這條路線'} →</a></article>`;}).join('')}</div><p><a href="?path=core#journey">回看核心路線</a> · <a href="#projects">回看作品</a></p></section>`;}

function guidedNextMarkup(){const id=recommendedId();return id?`<a class="button primary" href="${pathHref(id)}">${progress[id]?.updatedAt?'繼續這一步':'開始這一步'}：${esc(nodeTitle(id))} →</a>`:'<a class="button primary" href="#journey">查看已完成路線與進階方向 →</a>';}
function readinessMarkup(id){
 const missing=missingPrerequisites(guidedNodes(),id,completed);
 if(!missing.length)return '';
 const first=missing[0];
 return `<details class="callout blue readiness" open><summary>這裡會用到前面的知識</summary><p>目前還有 ${missing.length} 堂先備沒有本版通過紀錄。你可以先閱讀；建議先從「${esc(nodeTitle(first))}」補起，草稿與舊成果保留。</p><p>${missing.slice(0,3).map(x=>`<a href="${pathHref(x)}">${esc(nodeTitle(x))}</a>`).join(' · ')}</p><a class="button secondary" href="${pathHref(first)}">先補這個基礎 →</a> <a class="text-link" href="#home">回推薦路線</a></details>`;
}
function rememberJourney(id){
 const path=activeJourney();if(path.id==='zero-to-builder')return;
 const r=record(id);r.navigationPath=path.id;r.lastVisitedAt=Date.now();saveProgress();
}
function journeyContext(id){
 const owner=journeyForNode(data.journey,activeJourney(),id),pos=owner&&pathPosition(owner,id);
 if(!pos)return '<p class="mode-note">探索資料庫中的選讀課程；不必為了完成入門路線把這裡全部學完。 <a href="#home">回推薦學習</a></p>'+readinessMarkup(id);
 const next=journeySteps(owner)[journeySteps(owner).indexOf(id)+1];
 return `<div class="guided-position"><span class="chip">${esc(pos.phase.title)} · 第 ${pos.step+1} / ${pos.total} 步</span><p>${esc(pos.phase.outcome)}</p><details><summary>這一步之後會接什麼</summary><p>${next?`${esc(nodeTitle(next))}：${esc(nodeFor(next)?.teaching?.whyNow||'整合前面所學。')}`:'這個階段已到能力出口；回路線可繼續另一條路或選讀進階主題。'}</p></details><a class="text-link" href="#journey">查看學習路線</a></div>${readinessMarkup(id)}`;
}
function reviewSummary(){
 const due=[...lessons.values()].filter(l=>completed(l.id)&&progress[l.id]?.study?.dueAt<=Date.now());
 return due.length?`<div class="callout"><strong>今天可做一個短回想</strong><p>先回想「${esc(due[0].title)}」，不用一次補完所有複習；沒有逾期懲罰。</p><a href="#recall/${due[0].id}">開始短回想 →</a></div>`:'';
}
function guidedOverview(showAction=true){
 const journey=activeJourney(),id=recommendedId(),owner=id&&journeyForNode(data.journey,journey,id),pos=id&&owner&&pathPosition(owner,id),milestone=id&&nextMilestone(owner||journey,id,completed);
 if(!id)return `<section class="progress-card"><h2>這條路線的練習已通過</h2><p>你已留下核心練習與作品證據；這不代表所有情境都已掌握。可以回看作品、做短複習，或選一個進階方向。</p>${guidedNextMarkup()}</section>`;
 const last=progress[id]?.updatedAt,recall=nodeFor(id)?.teaching?.recall;
 return `<section class="progress-card"><span class="eyebrow">${esc(pos?.phase.title||'先補基礎')}</span><h2>現在這一步：${esc(nodeTitle(id))}</h2><p>${esc(nodeFor(id)?.teaching?.whyNow||'繼續建立基礎。')}</p>${milestone?`<p><strong>${milestone.lessons?`再完成 ${milestone.lessons} 堂課，就能開始`:'現在可以開始'}「${esc(nodeTitle(milestone.id))}」</strong></p>`:''}${last&&Date.now()-last>3*86400000?`<div class="callout">隔了一段時間，先回想：${esc(recall)}想不起來可用課內救援，不必重頭學。</div>`:''}${showAction?guidedNextMarkup():""}<p><a class="text-link" href="#journey">查看本階段與後續安排</a></p></section>`;
}
function renderJourney(){
 const journey=activeJourney();
 main.innerHTML=`${breadcrumb([{label:'首頁',href:'#home'},{label:'引導路線'}])}<div class="page-head"><h1>${esc(journey.title)}</h1><p>${journey.description?esc(journey.description):'一次一步，先練核心，再走向程式與AI的後續作品。'}</p></div>${guidedOverview()}${journey.phases.map(phase=>`<details class="progress-card" ${phase.steps.includes(recommendedId())?'open':''}><summary><strong>${esc(phase.title)}</strong></summary><p>${esc(phase.outcome)}</p><ol class="journey-list">${phase.steps.map(id=>`<li><a href="${pathHref(id)}">${esc(nodeTitle(id))}</a><span>${completed(id)?'本版練習已通過':(progress[id]?.study?.needsReinforcement?'待補':'尚待練習')}</span></li>`).join('')}</ol></details>`).join('')}${pathwayCards()}<details class="progress-card"><summary>想深入其他方向：探索資料庫</summary><p>神經網路、進階演算法、其他語言與完整外部專案可按興趣選讀。來源目錄不是待辦清單，也不代表這些能力都已教完。</p><a href="#track/program">程式選讀</a> · <a href="#track/ai">AI選讀</a></details>`;setContext('引導路線 · 一次一步');
}

function bar(done, total) { return `<div class="progress-track" role="progressbar" aria-valuenow="${done}" aria-valuemin="0" aria-valuemax="${total}" aria-label="已完成 ${done}／${total} 課"><div class="progress-fill" style="width:${pct(done,total)}%"></div></div>`; }
function readTime(id) {const t=lessonFor(id)?.teaching;return t?`核心約 ${t.estimatedMinutes[0]}–${t.estimatedMinutes[1]} 分鐘（估算）`:'時間依內容與起點而異・尚未計時';}

function breadcrumb(parts) {
  return `<div class="breadcrumb">${parts.map((p, i) => p.href ? `<a href="${p.href}">${esc(p.label)}</a>` : `<span>${esc(p.label)}</span>`).join('<span aria-hidden="true">/</span>')}</div>`;
}

function renderHome() {
 const id=recommendedId(),fresh=!Object.values(progress).some(r=>r.updatedAt||r.completed);
 main.innerHTML=`<section class="hero"><div class="hero-main"><span class="eyebrow">${fresh?'從完全不會開始':coreComplete()?'核心之後，讓能力繼續長出來':'接著上次的一小步'}</span><h1>${fresh?'先試一次，不用先選課。':coreComplete()?'接著做更完整的程式與AI作品。':'知道現在在哪，再往前走。'}</h1><p>${coreComplete()?"接著練資料清理、測試、API與AI評估。系統依目前路線推薦下一步，共享課程會沿用你的通過紀錄。":"從寫下一句程式開始，逐步整理資料、做出工具，再學會和AI合作與查核。每一步都有示範、試做與卡住時的幫助。"}</p><div class="button-row">${fresh&&id?`<a class="button primary" href="${pathHref(id)}">開始第一步：認識練習桌 →</a>`:guidedNextMarkup()}</div><p class="mode-note">免帳號、免金鑰。先看懂，再動手；不用一次記住全部。</p></div><div class="hero-side"><strong>你將做出什麼</strong><p>${coreComplete()?"程式路線做資料清理、查詢與服務核心；AI路線做候選評估、文件查找與受控工具流程。全部先在本機練習。":"先做學習紀錄小幫手；接著整理可查核的摘要練習包；最後從需求自己寫出JSON報表工具。"}</p><a class="text-link" href="#journey">看看學習路線 →</a></div></section>${fresh?'':guidedOverview(false)}${coreComplete()?pathwayCards():''}${reviewSummary()}<section class="progress-card"><h2>卡住時，有下一個小動作</h2><p>課內可選「看不懂題目」「不懂符號」「忘記前課」或更小的例子。可以記為待補，草稿與舊成果都會保留。</p><details><summary>第一次使用：執行、保存與備份</summary><p>在試做的編輯框改程式，按「執行看看」觀察結果；「檢查本題」才會判斷題目要求。關閉前確認沒有儲存失敗警告。</p><p>進度屬於目前瀏覽器與網址。平常固定使用啟動器網址，換瀏覽器或清除資料前，到「我的進度」匯出JSON；下載沒出現時可複製文字備份。Python虛擬檔案不會自動下載到電腦。</p><a href="#progress">前往進度與備份</a></details></section><details class="progress-card"><summary>想先查某個主題？探索資料庫</summary><p>這裡依來源整理，適合查找；不是新手必修順序。</p><div class="button-row"><a class="button secondary" href="#track/program">程式主題</a><a class="button secondary" href="#track/ai">AI主題</a><a class="text-link" href="#sources">來源與原文</a></div></details>`;setContext('引導學習 · 下一步很清楚');
}
function trackCard(id, number, title, description, units, next) {
  const done = doneCount(units);
  return `<article class="track-card ${id === 'ai'?'ai':''}"><span class="track-number">LEARNING PATH ${number}</span><h3>${title}</h3><p>${description}</p><div class="track-bottom"><a class="button ${id==='ai'?'secondary':'primary'}" href="#track/${id}">查看課程 →</a><span>${done} / ${units.length} 已完成</span></div>${bar(done,units.length)}</article>`;
}

function renderTrack(track, sourceFilter=null) {
  const label = track === 'program' ? '程式語言' : '人工智慧';
  const description = track === 'program' ? '從 Python 基礎、實戰程式、網頁與資料，到完整電腦科學地圖。' : '從不需寫程式的 Prompt 與 AI 概念，逐步走向 ML、深度學習和 LLM 工程。';
  const units = unitsFor(track);
  main.innerHTML = `${breadcrumb([{label:'首頁',href:'#home'},{label}])}<div class="page-head"><span class="eyebrow">${track==='program'?'PROGRAMMING PATH':'AI PATH'}</span><h1>${label}</h1><p>${description}</p></div>
  <div class="progress-card"><strong>${doneCount(units)} / ${units.length} 課已完成</strong>${bar(doneCount(units),units.length)}<p>這裡用來搜尋與探索，不是建議學習順序。完整資料庫的完成數僅供查找。</p></div>
  ${suggestedPath(track)}<div class="filters"><input id="lesson-search" class="search" type="search" placeholder="搜尋章節或關鍵字" aria-label="搜尋章節"><select id="source-filter" class="select" aria-label="篩選來源"><option value="">全部來源</option>${data.sources.filter(s=>units.some(u=>u.source===s.id)).map(s=>`<option value="${esc(s.id)}" ${sourceFilter===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select><span id="filter-count" class="filter-hint"></span></div>
  <div id="lesson-groups">${renderGroups(units, sourceFilter)}</div>`;
  setContext(`${label} · ${units.length} 個章節`);
  updateFilter();
}
function renderGroups(units, sourceFilter=null) {
  return data.sources.filter(s => units.some(u=>u.source===s.id) && (!sourceFilter || sourceFilter===s.id)).map(s => {
    const list = units.filter(u=>u.source===s.id);
    return `<details class="source-section" data-source="${esc(s.id)}" ${sourceFilter===s.id||s.id==='python30'||s.id==='prompt'?'open':''}><summary><div><strong>${esc(s.name)}</strong><small>${esc(list[0]?.group||'')} · ${list.length} 個章節</small></div><span class="count-pill">${doneCount(list)} / ${list.length} 完成</span></summary><div class="lesson-list">${list.map(u=>lessonRow(u)).join('')}</div></details>`;
  }).join('') || '<div class="empty">目前沒有符合條件的章節。</div>';
}
function lessonRow(u) {
  return `<a class="lesson-link" href="${unitHref(u.id)}" data-title="${esc((u.titleZh+' '+u.title+' '+u.group).toLowerCase())}"><span class="lesson-code">${esc(u.code)}</span><span><strong>${esc(u.titleZh)}</strong><small>${esc(u.title)}</small></span><span class="done">${statusLabel(u.id)}</span></a>`;
}
function updateFilter() {
  const input = document.getElementById('lesson-search');
  const select = document.getElementById('source-filter');
  if (!input || !select) return;
  const q = input.value.trim().toLowerCase();
  let visible = 0;
  document.querySelectorAll('.source-section').forEach(section=>{
    const sourceMatches = !select.value || section.dataset.source===select.value;
    let count=0;
    section.querySelectorAll('.lesson-link').forEach(row=>{
      const ok=sourceMatches && row.dataset.title.includes(q);
      row.hidden=!ok;
      if(ok) count++;
    });
    section.hidden=count===0;
    if(q && count) section.open=true;
    visible+=count;
  });
  document.getElementById('filter-count').textContent=`顯示 ${visible} 個章節`;
}

function renderSource(id) {
  const s = source(id);
  if (!s) return renderNotFound();
  const units=data.units.filter(u=>u.source===id);
  main.innerHTML=`${breadcrumb([{label:'首頁',href:'#home'},{label:'十份來源',href:'#sources'},{label:s.name}])}<div class="page-head"><span class="eyebrow">來源對照 · ${s.sourceUnitCount} 來源單元 · ${units.length} 目錄入口</span><h1>${esc(s.name)}</h1><p>此來源範圍含 ${s.sourceUnitCount} 個來源單元。下方為相容目錄與已撰寫課程入口；未完成擴寫的條目仍是原有精華練習。</p></div><div class="progress-card"><div class="button-row"><a class="button secondary" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">開啟原始資源 ↗</a><a class="button primary" href="${unitHref(units[0].id)}">閱讀此來源第一個入口 →</a></div><p>來源快照：${esc(s.commit.slice(0,12))} · ${esc(s.pushed_at.slice(0,10))} · 授權標記 ${esc(s.license)}</p></div>${sourceMapping(id)}<div class="source-section"><div class="lesson-list">${units.map(lessonRow).join('')}</div></div>`;
  setContext(`${s.name} · 章節對照`);
}
function originalReadingLinks(entry){
  const links=entry.readingLinks||[];
  const anchor=link=>`<a class="source-link" href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">${esc(link.kind)}：${esc(link.title)} ↗</a>`;
  if(!links.length)return `<a class="source-link" href="${esc(entry.url)}" target="_blank" rel="noopener noreferrer">開啟「${esc(entry.title)}」原始章節 ↗</a>`;
  return `${anchor(links[0])}${links.length>1?`<details><summary>其他對應原文（${links.length-1}）</summary>${links.slice(1).map(link=>`<p>${anchor(link)}</p>`).join('')}</details>`:''}<details><summary>來源版本與範圍依據</summary><p>上方原文與下方範圍資料使用相同固定版本；需連線才能開啟。</p><a class="text-link" href="${esc(entry.url)}" target="_blank" rel="noopener noreferrer">查看原始版本依據 ↗</a></details>`;
}
function sourceMapping(sourceId){
  const rows=data.coverage.mapping.filter(x=>x.source===sourceId);
  return `<details class="progress-card"><summary><strong>來源單元對照 · ${rows.length} 筆</strong></summary><p>此表記錄範圍與已撰寫課程的連結；有映射不代表所有教學義務已審核。</p><div class="lesson-list">${rows.map(row=>`<article class="activity"><h3>${esc(row.title)}</h3>${originalReadingLinks(row)}<p>${row.lessonIds.length?row.lessonIds.map(id=>`<a class="text-link" href="${unitHref(id)}">${esc(byId.get(id)?.titleZh||id)}</a>`).join(' · '):'待擴寫；尚未建立新版教學映射。'}</p></article>`).join('')}</div></details>`;
}
function renderSources() {
  main.innerHTML=`${breadcrumb([{label:'首頁',href:'#home'},{label:'十份來源'}])}<div class="page-head"><span class="eyebrow">TRACEABLE CURRICULUM</span><h1>十份來源，全部可查</h1><p>目前範圍含 ${data.coverage.sourceUnitCount} 個來源單元，已撰寫 ${data.coverage.authoredLessonCount} 堂分層互動課；映射與課文數不代表教學審核完成。這裡保留來源版本與原文入口。</p></div><div class="source-grid">${data.sources.map(s=>`<article class="source-card"><span class="chip ${['prompt','genai','ml','ai','karpathy','llm'].includes(s.id)?'blue':''}">${['python30','practical','fcc','ossu'].includes(s.id)?'程式路線':'AI 路線'} · ${s.sourceUnitCount} 來源單元</span><h2>${esc(s.name)}</h2><p>${esc(sourceSummary(s.id))}</p><code>${esc(s.commit.slice(0,12))}</code><div class="source-actions"><a class="text-link" href="${sourceHref(s.id)}">查看章節對照 →</a><a class="text-link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">GitHub ↗</a></div></article>`).join('')}</div>`;
  setContext('十份來源 · 版本與章節對照');
}
function sourceSummary(id) {
  return ({python30:'從完全不會到 Python、資料與 API。',practical:'從會語法走向真實資料、程式組織與測試。',fcc:'涵蓋網頁、JavaScript、Python、資料庫、資料分析與安全等技術主題。',ossu:'把程式、數學、系統、理論、倫理與進階方向放進電腦科學地圖。',prompt:'系統整理提示設計、應用、風險、工具與研究。',genai:'從生成式 AI 基礎走到可使用的應用。',ml:'以專案方式學經典機器學習。',ai:'從符號 AI 延伸到神經網路、視覺、語言與倫理。',karpathy:'親手理解梯度、語言模型、GPT 與 tokenizer。',llm:'從 LLM 基礎走到模型研究與應用部署。'})[id];
}

function renderProgress() {
 const needs=[...lessons.values(),...Object.values(projectInfo)].filter(l=>(l.key?currentProjectState(l,progress[l.id]):currentLessonState(l,progress[l.id]))==='needs-reinforcement');
 main.innerHTML=`${breadcrumb([{label:'首頁',href:'#home'},{label:'我的進度'}])}<div class="page-head"><h1>我的進度</h1><p>看現在的位置、下一個作品與待補內容；不用把整個資料庫當作待辦清單。</p></div>${guidedOverview()}${coreComplete()?pathwayCards():''}${reviewSummary()}<details class="progress-card" ${needs.length?'open':''}><summary>待補內容（${needs.length}）</summary><p>待補保留草稿與歷史成果，不算本版已通過。需要這個基礎的後課會提醒你。</p>${needs.map(l=>`<p><a href="${pathHref(l.id)}">${esc(l.title)}</a></p>`).join('')||'<p>目前沒有待補項目。</p>'}</details><section class="progress-card" id="backup-card"><h2>備份學習紀錄</h2><p>進度只在目前瀏覽器和網址。匯出包含草稿、歷史版本與作品；匯入會先預覽，再取代目前紀錄並保留取代前備份。</p><div class="button-row"><button class="button primary" data-action="export">匯出進度</button><label class="button secondary import-label">匯入進度<input id="import-file" type="file" accept="application/json,.json" aria-label="選擇進度備份檔"></label><button class="button ghost" data-action="reset">清除本機進度</button></div><details class="backup-details"><summary>下載沒有出現？使用文字備份</summary><label for="backup-text">匯出的備份文字</label><textarea id="backup-text" class="text-area" readonly>${esc(JSON.stringify(makeBackup(progress),null,2))}</textarea><button class="button secondary" data-action="copy-backup">複製備份文字</button><label for="import-text">貼上備份文字</label><textarea id="import-text" class="text-area"></textarea><button class="button secondary" data-action="import-text">匯入貼上的備份</button></details><div id="import-confirm" aria-live="polite"></div><button class="button ghost" data-action="restore-before-import">預覽上次取代前的備份</button></section><details class="progress-card"><summary>完整資料庫與最近活動</summary><p>${doneCount(data.units)} / ${data.units.length} 個目錄入口有目前完成紀錄；來源份量不同，不當作能力百分比。</p>${Object.entries(progress).filter(([id])=>byId.has(id)).sort((a,b)=>(b[1].updatedAt||0)-(a[1].updatedAt||0)).slice(0,10).map(([id])=>lessonRow(byId.get(id))).join('')}</details>${progressExtras()}`;setContext('我的進度 · 目前階段與備份');
}

function renderUnit(id, moveFocus=false) {
  const u=byId.get(id); if(!u) return renderNotFound();
  const r=record(id); const s=source(u.source);
  const step=Math.max(0,Math.min(3,Number(r.step)||0));
  rememberJourney(id);const inJourney=!!journeyForNode(data.journey,activeJourney(),id);const label=inJourney?'引導路線':u.track==='program'?'程式語言':'人工智慧';
  main.innerHTML=`${breadcrumb([{label:'首頁',href:'#home'},{label,href:inJourney?'#journey':'#track/'+u.track},{label:u.titleZh}])}<div class="lesson-layout"><div class="lesson-main"><div class="lesson-intro">${journeyContext(id)}<div class="lesson-meta">${inJourney?"":`<span class="chip">${esc(s.name)} · ${esc(u.code)}</span>`}<span class="chip">${readTime(id)}</span>${completed(id)?`<span class="chip">${statusLabel(id)}</span>`:''}${lessonFor(id)?'<span class="chip blue">分層互動課</span>':''}</div><h1>${esc(u.titleZh)}</h1>${inJourney?"":`<p>${esc(u.title)} · ${esc(u.group)}</p>`}</div><div class="step-nav" aria-label="課程步驟">${['理解','試做','看回饋','複習'].map((n,i)=>`<button type="button" aria-current="${i===step?'step':'false'}" class="${i===step?'active':''}" data-action="step" data-step="${i}" data-id="${esc(id)}">${i+1}. ${n}</button>`).join('')}</div><section class="step-panel" id="step-panel" tabindex="-1">${renderStep(u,r,step)}</section></div><aside class="lesson-side"><h2>這一課的路線</h2><ol class="mini-steps">${['理解概念','動手試做','取得回饋','回想複習'].map((x,i)=>`<li class="${i===step?'current':''}"><span class="bullet">${i+1}</span>${x}</li>`).join('')}</ol>${!lessonFor(id)&&u.prerequisite&&!completed(u.prerequisite)?`<div class="callout blue">這課建議先會 <a href="${unitHref(u.prerequisite)}">${esc(byId.get(u.prerequisite)?.titleZh||'Python 基礎')}</a>；你仍可先學概念。</div>`:''}${u.prerequisiteNote?`<p>${esc(u.prerequisiteNote)}</p>`:''}${u.scopeNote?`<p>${esc(u.scopeNote)}</p>`:''}<p><strong>原始教材</strong><br>這一課用原創繁中說明整理來源精華。進階細節與原始範例可回到原教材。</p>${originalReadingLinks(u)}</aside></div>`;
  if(lessonFor(id)){
    const lesson=lessonFor(id);
    if(lesson.teaching)document.getElementById('step-panel').insertAdjacentHTML('afterbegin',teachingSupport(lesson,step>0));
    if(step===0&&lesson.deepDive)document.getElementById('step-panel').insertAdjacentHTML('beforeend',deepDiveMarkup(lesson.deepDive));
    const state=currentLessonState(lessonFor(id),r);
    document.getElementById('step-panel').insertAdjacentHTML('beforeend',`<details class="extension"><summary>想先停一下，或回看舊紀錄</summary><p>${state==='needs-reinforcement'?'這課標為待補；草稿與歷史成果保留，重新完成本版檢查後即可往下。':'可以把這課記成待補，稍後從原處繼續；不會把待補算成通過。'}</p><button class="button secondary" data-action="needs-reinforcement" data-id="${esc(id)}">記為待補，保留草稿</button>${(r.history||[]).map((old,i)=>`<details><summary>歷史版本 ${esc(old.study?.version||'舊版')} · 紀錄 ${i+1}</summary><p>這是之前的成果，不會自動算成本版通過；可複製保留。</p>${old.code?`<h4>當時的程式</h4><pre class="teaching-code">${esc(old.code)}</pre>`:''}${old.reflection?`<h4>當時的筆記</h4><p>${esc(old.reflection)}</p>`:''}<h4>當時的作答草稿</h4>${Object.values(old.study?.activities||{}).map(a=>`<pre class="teaching-code">${esc(a.draft??a.choice??'')}</pre>`).join('')}${old.study?.labDraft?`<h4>當時的實驗輸入</h4><pre class="teaching-code">${Object.values(old.study.labDraft).map(esc).join('\n')}</pre>`:''}</details>`).join('')}</details>`);
  }
  setContext(inJourney?'引導學習 · '+u.titleZh:`${u.titleZh} · ${s.name}`);
  updatePromptLab();
  document.querySelectorAll('[data-action="run-code"],[data-action="check-code"]').forEach(b=>b.disabled=codeBusy);
  if(moveFocus) document.getElementById('step-panel')?.focus();
}

function deepDiveMarkup(d){return `<details class="extension"><summary>${esc(d.title)}</summary><p>這裡含之後才會介紹的語法；現在不需要完成，也不算本課必修。</p>${d.paragraphs.map(p=>`<p>${esc(p)}</p>`).join('')}<pre class="teaching-code">${esc(d.example)}</pre>${d.code?`<p>${esc(d.code.prompt)}</p><pre class="teaching-code">${esc(d.code.starter)}</pre>`:''}<p>${esc(d.extension)}</p></details>`;}
function teachingSupport(l,compact=false){
 const t=l.teaching,terms=t.terms||[],labels=keys=>keys.map(k=>terms.find(x=>x.id===k)?.label||k).join('、');
 const context=`<section class="callout guided-context" aria-label="今天的學習連結"><strong>為什麼現在學這個</strong><p>${esc(t.whyNow)}</p><p><strong>先回想：</strong>${esc(t.recall)}</p><p><strong>今天新增：</strong>${esc(t.introduces.length?labels(t.introduces):"不增加新語法，整合前面所學")}</p>${t.reuses.length?`<p><strong>再次用到：</strong>${esc(labels(t.reuses))}</p>`:''}</section>`;
 return `${compact?`<details class="context-recall"><summary>回想這課的目的與前面所學</summary>${context}</details>`:context}<details class="extension rescue"><summary>卡住了？選一種幫助</summary><details><summary>我看不懂題目</summary><p>${esc(t.rescue.task)}</p></details><details><summary>我不懂某個符號或詞</summary><dl>${terms.map(x=>`<dt>${esc(x.label)}</dt><dd>${esc(x.definition)}</dd>`).join('')}</dl></details><details><summary>我忘記前面學過什麼</summary><p>${esc(t.recall)}</p>${l.prerequisiteIds.map(id=>`<p><a href="${unitHref(id)}">回看：${esc(byId.get(id)?.titleZh||id)}</a></p>`).join('')}</details><details><summary>我不知道從哪一行開始</summary><p>${esc(t.rescue.firstStep)}</p></details><details><summary>我寫了，但錯誤看不懂</summary><p>先看執行結果最後一行的錯誤種類，再展開完整錯誤找你的程式行號。引號、括號要成對；名稱要和建立時相同。先改一處再按執行看看。</p></details><details><summary>我完全沒想法，想看更小的例子</summary><p>先猜這個小例子會發生什麼，再回本題改一個地方。這不是本題答案。</p><pre class="teaching-code">${esc(t.rescue.example)}</pre></details><p>如果今天想先停下來，可在本頁底部記為待補；草稿會保留。</p></details>`;
}

function renderStep(u,r,step) {
  if(lessonFor(u.id))return renderPilotStep(u,r,step);
  if(step===0) return `<h2>先把概念說清楚</h2><div class="prose"><p>${esc(u.explanation)}</p></div><div class="example-box"><span class="label">把它放進生活裡</span><div class="prose">${esc(u.example)}</div></div><div class="callout">今天只抓住一件事：${esc(u.takeaway)}</div>${u.source==='prompt'||['genai-04','genai-05'].includes(u.id)?renderPromptLab(u,r):''}<div class="step-actions"><span class="mode-note">可以先讀原始章節，再回來做練習。</span><button class="button primary" data-action="mark-read" data-id="${esc(u.id)}">我理解了，開始試做 →</button></div>`;
  if(step===1) return `<h2>換你試一次</h2><p class="prose">先不要看提示，用自己的話回答：在下面這個情境中，你會怎麼運用「${esc(u.titleZh)}」？為什麼？</p><div class="example-box"><span class="label">情境</span>${esc(u.example)}</div><label for="reflection"><strong>我的想法</strong></label><textarea id="reflection" class="text-area" data-unit="${esc(u.id)}" placeholder="寫下至少一句你的判斷、理由或下一步……">${esc(r.reflection||'')}</textarea><p class="mode-note">文字只保存在你的瀏覽器；至少寫 15 個字再看參考思路。</p><div class="button-row"><button type="button" class="button secondary" data-action="hint" data-hint="1">給我第一個提示</button><button type="button" class="button secondary" data-action="hint" data-hint="2">再給一個提示</button></div><div id="hint-area"></div>${u.codeExercise?renderCodeExercise(u,r):''}<div class="step-actions"><button class="button ghost" data-action="step" data-step="0" data-id="${esc(u.id)}">← 返回理解</button><button class="button primary" data-action="step" data-step="2" data-id="${esc(u.id)}">查看回饋 →</button></div>`;
  if(step===2) return `<h2>對照你的思路</h2><div class="prose"><p>先看你寫的內容，再對照下面的參考思路。它不是唯一寫法，重點是你能說出原因。</p></div><div class="example-box"><span class="label">你的想法</span><div class="prose">${esc(r.reflection||'尚未寫下想法')}</div></div><div class="example-box"><span class="label">參考思路</span><div class="prose">${esc(u.takeaway)} ${esc(u.example)}</div></div><div class="callout blue"><strong>常見錯誤</strong><br>${esc(errorAdvice(u))}</div>${u.codeExercise?`<div class="feedback ${r.codePass?'good':'bad'}">程式練習：${r.codePass?'已通過':'尚未通過。請回到「試做」執行並對照預期輸出。'}</div>`:''}<div class="step-actions"><button class="button ghost" data-action="step" data-step="1" data-id="${esc(u.id)}">← 返回試做</button><button class="button primary" data-action="step" data-step="3" data-id="${esc(u.id)}">進入複習 →</button></div>`;
  const quiz=quizFor(u);
  const canComplete=!!r.read && (r.reflection||'').trim().length>=15 && !!r.quizCorrect && (!u.codeExercise||!!r.codePass);
  return `<h2>不看筆記，想一次</h2><p class="prose">哪一句最能概括這章真正要掌握的判斷？先自己想，再選答案。</p><div class="answer-list">${quiz.map((option,i)=>`<button type="button" class="answer" data-action="answer" data-id="${esc(u.id)}" data-correct="${option.correct?'1':'0'}">${esc(option.text)}</button>`).join('')}</div><div id="quiz-feedback">${r.quizCorrect?'<div class="feedback good">你已答對。可以再回想一遍，或繼續下一課。</div>':''}</div><div class="callout">完成檢查：已理解 ${r.read?'✓':'○'} · 已寫下自己的想法 ${(r.reflection||'').trim().length>=15?'✓':'○'} · 回想答對 ${r.quizCorrect?'✓':'○'} ${u.codeExercise?'· 程式通過 '+(r.codePass?'✓':'○'):''}</div><div class="step-actions"><button class="button ghost" data-action="step" data-step="2" data-id="${esc(u.id)}">← 查看回饋</button><button class="button primary" data-action="complete" data-id="${esc(u.id)}" ${canComplete?'':'disabled'}>${completed(u.id)?'已完成本課':'完成本課 ✓'}</button></div>${completed(u.id)?nextLessonLink(u):''}`;
}
function errorAdvice(u) {
  if(u.codeExercise) return '只看得到預期輸出還不夠；試著改變輸入，確認你的程式沒有把答案硬寫死。錯誤訊息可從最後一行與行號開始讀。';
  if(u.track==='ai') return '把流暢回答當成正確答案，或只憑單一案例判斷方法有效。請回到資料來源、任務目標與驗證方式。';
  return '只記住術語卻說不出何時使用。回到情境，指出輸入、處理、輸出與可能出錯的地方。';
}
function nextLessonLink(u) {
  const list=data.units.filter(x=>x.source===u.source); const idx=list.findIndex(x=>x.id===u.id); const next=list[idx+1];
  return next?`<p><a class="text-link" href="${unitHref(next.id)}">下一課：${esc(next.titleZh)} →</a></p>`:'<p class="mode-note">你完成了這份來源的最後一章。可以回到路線地圖選下一份教材。</p>';
}
function renderCodeExercise(u,r) {
  const e=lessonFor(u.id)?.code || u.codeExercise;
  return `<div class="lab"><span class="eyebrow">PYTHON 練習區</span><h3>動手執行與檢查</h3><p class="prose">${esc(e.prompt)}</p><label for="code-editor">編輯程式（保留縮排；Tab 鍵移到下一個操作）</label><textarea id="code-editor" class="text-area code" spellcheck="false" data-unit="${esc(u.id)}">${esc(r.code ?? e.starter)}</textarea><div class="button-row"><button type="button" class="button secondary" data-action="run-code" data-id="${esc(u.id)}" ${codeBusy?'disabled':''}>執行看看</button><button type="button" class="button primary" data-action="check-code" data-id="${esc(u.id)}" ${codeBusy?'disabled':''}>檢查本題</button></div><p class="mode-note">執行看看不判對錯；檢查本題才驗證要求。Python 在本機瀏覽器運作，首次載入可能需要數秒。</p><div id="code-output" class="output-box" aria-live="polite">${codeBusy?'Python 正在執行，請稍候。':'執行結果會顯示在這裡。'}</div><div id="code-feedback" aria-live="polite"></div>${e.hints?`<details class="extension" data-code-help="${u.id}"><summary>卡住了？展開本題提示</summary>${e.hints.map(h=>`<p>${esc(h)}</p>`).join('')}</details>`:''}</div>`;
}
function renderPromptLab(u,r) {
  const v=r.promptDraft||{task:'整理公告的時間、地點、攜帶物品與費用',reader:'第一次參加的人',format:'四個欄位',rule:'只根據原文；沒有提到就寫未提供'};
  return `<div class="lab"><span class="eyebrow">互動實驗</span><h3>把模糊要求變成清楚任務</h3><div class="input-grid">${[['task','要做什麼'],['reader','給誰看'],['format','輸出形式'],['rule','限制條件']].map(([k,label])=>`<label>${label}<input id="prompt-${k}" data-prompt-field="${k}" data-unit="${u.id}" value="${esc(v[k])}"></label>`).join('')}</div><div class="lab-output" id="prompt-output" aria-live="polite"></div><p class="mode-note">這裡只整理提示結構，沒有連接模型。草稿會隨進度保存，包含在備份中。</p></div>`;
}
function quizFor(u) {
  const list=data.units.filter(x=>x.source===u.source && x.id!==u.id);
  let seed=0; for(const c of u.id) seed=(seed*31+c.charCodeAt(0))>>>0;
  const other1=list[seed%list.length], other2=list[(seed+Math.floor(list.length/2))%list.length];
  const options=[{text:u.takeaway,correct:true},{text:other1.takeaway,correct:false},{text:other2.takeaway,correct:false}];
  const rotation=seed%3;
  return options.slice(rotation).concat(options.slice(0,rotation));
}
function renderNotFound() { main.innerHTML='<div class="empty"><h1>找不到這個章節</h1><p>可能是連結有誤。請回到學習首頁。</p><a class="button primary" href="#home">回首頁</a></div>'; }
function setContext(text) { document.getElementById('topbar-context').textContent=text; }

function render() {
  stopMedia();
  if(!data) return;
  let hash;try{hash=decodeURIComponent(location.hash.slice(1)||'home');}catch{renderNotFound();return;}
  if(hash==='main'){history.replaceState(null,'','#home');hash='home';}
  const [page,arg]=hash.split('/');
  if(page!=='recall')recallRevealed.clear();
  document.querySelectorAll('.nav a').forEach(a=>a.classList.toggle('active',a.dataset.nav===(page==='track'?arg:(page==='unit'||page==='recall')?(journeyForNode(data.journey,activeJourney(),arg)?'journey':byId.get(arg)?.track):page==='project'?(journeyForNode(data.journey,activeJourney(),'project:'+arg)?'journey':'projects'):page==='source'?'sources':page)));
  if(page==='home') renderHome(); else if(page==='journey') renderJourney(); else if(page==='track'&&['program','ai'].includes(arg)) renderTrack(arg);
  else if(page==='recall') renderRecall(arg); else if(page==='unit') renderUnit(arg); else if(page==='sources') renderSources();
  else if(page==='source') renderSource(arg); else if(page==='progress') renderProgress(); else if(page==='projects') renderProjects(); else if(page==='project') renderProject(arg); else renderNotFound();
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('menu-toggle').setAttribute('aria-expanded','false');
  window.scrollTo({top:0,behavior:'instant'});
  updatePromptLab();
  if(storageProblem)showSaveWarning(storageProblem);
}

function updatePromptLab() {
  const output=document.getElementById('prompt-output'); if(!output) return;
  const get=id=>document.getElementById(id)?.value.trim()||'（尚未填寫）';
  output.textContent=`任務：${get('prompt-task')}\n讀者：${get('prompt-reader')}\n格式：${get('prompt-format')}\n限制：${get('prompt-rule')}\n\n以下是文章：\n[在此貼入來源文字]`;
}
function changeStep(id,step) {
  const r=record(id); r.step=step; r.updatedAt=Date.now(); saveProgress(); renderUnit(id,true);
}
function workerReset(reason) {
  if(worker)worker.terminate();worker=null;workerReady=null;
  if(workerRun){const active=workerRun;workerRun=null;clearTimeout(active.timer);active.reject(new Error(reason||'Python 已重新啟動，請再執行一次。'));}
}
function ensureWorker() {
  if(workerReady)return workerReady;
  worker=new Worker('./pyworker.js?v=2026-09-video-assisted-1',{type:'module'});
  workerReady=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{workerReset();reject(new Error('Python 載入逾時。請確認整個 vendor 資料夾都在，並重新執行。'));},30000);
    worker.onmessage=({data:m})=>{
      if(m.type==='ready'){clearTimeout(timer);resolve();}
      else if(m.type==='load-error'){clearTimeout(timer);workerReset();reject(new Error('本機 Python 無法載入：'+m.message));}
      else if(m.type==='result'&&workerRun?.id===m.id){const active=workerRun;workerRun=null;clearTimeout(active.timer);active.resolve(m);}
    };
    worker.onerror=()=>{clearTimeout(timer);workerReset('Python 執行環境發生錯誤。');reject(new Error('Python 執行環境發生錯誤。'));};
  });
  return workerReady;
}
function validatorFor(id,e){
  if(e.validator)return e.validator;
  if(id==='practical-1')return {kind:'function',name:'total_with_tax',cases:[{args:[100,.05],expected:105},{args:[0,.2],expected:0},{args:[80,0],expected:80},{args:[50,.1],expected:55}]};
  if(id==='practical-6')return {kind:'function',name:'numbers',generator:true,cases:[{args:[],expected:[1,2,3]}]};
  return {kind:'output',expected:e.expected};
}
function explainPythonError(error){
  if(error.includes('SyntaxError'))return '語法還沒完整：檢查引號、括號與冒號，並對照錯誤行號。';
  if(error.includes('IndentationError'))return '縮排不一致：同一區塊使用相同數量的空白。';
  if(error.includes('NameError'))return '這個名字還沒定義：檢查拼字、執行順序，或文字是否少了引號。';
  if(error.includes('TypeError'))return '資料型別不合：先看運算兩側是數字、文字還是其他資料。';
  if(error.includes('IndexError'))return '索引超出範圍：位置從 0 開始，最後位置是數量減 1。';
  if(error.includes('KeyError'))return '字典沒有這個鍵：檢查名稱與實際資料。';
  if(error.includes('ValueError'))return '值不能依指定方式處理：例如把 abc 轉成整數。';
  return '先看訊息最後一行，再找「你的程式」對應的行號；每次只修改一個原因。';
}
async function runCode(id,check=false) {
  if(codeBusy){announce('目前正在執行，完成後再試。');return;}
  const u=byId.get(id),l=lessonFor(id),e=l?.code||(projectFor(id)?.code||u?.codeExercise);
  const editor=document.getElementById('code-editor');if(!e||!editor)return;
  const r=record(id),code=editor.value,s=studyFor(id);r.code=code;r.updatedAt=Date.now();
  if(check){archiveCompletedRecord(r);s.codePassed=false;s.checkedCode='';r.codePass=false;}
  saveProgress();codeBusy=true;
  const current=()=>document.getElementById('code-editor')?.dataset.unit===id&&record(id).code===code;
  const out=(message)=>{if(current())document.getElementById('code-output').textContent=message;};
  document.querySelectorAll('[data-action="run-code"],[data-action="check-code"]').forEach(b=>b.disabled=true);
  document.getElementById('code-feedback').textContent='';out('正在準備本機 Python……');
  try{
    await ensureWorker();out(check?'正在執行與檢查……':'正在執行自由實驗……');
    const result=await new Promise((resolve,reject)=>{
      const runId=++workerCounter;
      const timer=setTimeout(()=>workerReset('執行超過 5 秒，已停止。請檢查無限迴圈；修改後可以重新執行。'),5000);
      workerRun={id:runId,resolve,reject,timer};worker.postMessage({type:'run',id:runId,code,validator:check?validatorFor(id,e):null});
    });
    // A result belongs to the submitted draft, never to edits made while it was running.
    if(r.code!==code)return;
    if(check){s.codePassed=!result.error&&result.passed;s.checkedCode=code;s.codeVersion=l?.version||projectFor(id)?.version||CONTENT_VERSION;r.codePass=s.codePassed;saveProgress();}
    if(!current())return;
    out(result.error?result.error.trim().split('\n').at(-1):(result.output||'（沒有輸出）'));
    const feedback=document.getElementById('code-feedback');
    if(result.error){const location=learnerErrorLocation(result.error,code);feedback.innerHTML=`<div class="feedback bad">${esc(explainPythonError(result.error))}${location?`<p><strong>先看你的第 ${location.line} 行</strong></p><pre class="teaching-code">${esc(location.source)}</pre><p>錯誤可能從這行或前一行開始；一次只改一處，再按「執行看看」。</p>`:""}</div><details><summary>查看完整錯誤與行號</summary><pre class="teaching-code">${esc(result.error)}</pre></details>`;}
    else if(!check)feedback.innerHTML='<div class="feedback good">自由執行完成，這次不判對錯，也不代表通過本題。想確認要求時，按「檢查本題」。</div>';
    else feedback.innerHTML=`<div class="feedback ${result.passed?'good':'bad'}">${result.passed?'本題測試已通過。仍可換例子探索；有限測試不代表所有可能情境都正確。':'尚未通過，請看下方哪個案例需要調整。'}</div><ul>${result.checks.map(t=>`<li>${t.passed?'✓':'✗'} ${esc(t.label)}</li>`).join('')}</ul>${!l&&!e.validator?'<p class="mode-note">這堂保留原版精華題；部分題型仍只檢查指定輸出。</p>':''}`;
    if(check&&e.hints&&!result.passed)feedback.insertAdjacentHTML('beforeend',`<details><summary>需要提示</summary>${e.hints.map(x=>`<p>${esc(x)}</p>`).join('')}</details>`);
  }catch(error){
    if(check&&r.code===code){s.codePassed=false;r.codePass=false;saveProgress();}
    out(error.message);
    if(current())document.getElementById('code-feedback').innerHTML='<div class="feedback bad">這次執行沒有完成，沒有留下通過狀態。修改後可再試。</div>';
  }finally{
    codeBusy=false;document.querySelectorAll('[data-action="run-code"],[data-action="check-code"]').forEach(b=>b.disabled=false);
  }
}

let projectInfo = {};
const projectIds=()=>Object.values(projectInfo).map(p=>p.id);
const projectFor=id=>projectInfo[id?.split(':')[1]];
let tracePositions = {};
let orderDrafts = {};
let codeBusy = false;


function lessonFor(id){return lessons.get(id);}
function studyFor(id){const r=record(id),old=r.study;const s=studyRecord(r,lessonFor(id)?.version||projectFor(id)?.version||CONTENT_VERSION);if(old&&old!==s)saveProgress();return s;}
function getOrder(l,a,s){
  const draft=orderDrafts[l.id+':'+a.id];if(draft)return draft;
  try{const saved=JSON.parse(s.activities[a.id]?.choice||'null');if(Array.isArray(saved)&&saved.length===a.lines.length&&new Set(saved).size===a.lines.length&&saved.every(x=>a.lines.includes(x)))return saved;}catch{}
  return [...a.lines];
}
function statusLabel(id){
  const r=progress[id], l=lessonFor(id);
  if(l&&currentLessonState(l,r)==='needs-reinforcement')return '待補・舊成果保留';
  if(l&&currentLessonState(l,r)==='completed')return '本版練習已通過';
  if(r?.completed)return l?'原版已完成・新版待練習':'已完成精華活動';
  return r?.updatedAt?'繼續 →':'開始 →';
}
function suggestedPath(){return `<div class="callout blue"><strong>這是探索資料庫，依來源分組</strong><p>若想讓網站一步一步帶著走，回到引導路線即可，不需要在這裡選下一堂。</p><a class="button secondary" href="#home">回推薦學習 →</a></div>`;}
function renderTrace(l){
  if(l.media)return renderMedia(l);
  const pos=Math.min(tracePositions[l.id]||0,l.steps.length-1);
  return `<div class="lab"><h3>一步一步看</h3><p class="mode-note">這是教材預先編排的逐步示範。${l.code?'自由修改的程式請使用試做區執行。':'接著到試做區完成本課活動。'}</p><pre class="teaching-code">${esc(l.example)}</pre><div class="trace-state" role="status"><strong>${esc(l.steps[pos].label)}</strong><p>${esc(l.steps[pos].detail)}</p><span>步驟 ${pos+1} / ${l.steps.length}</span></div><div class="button-row"><button class="button secondary" data-action="trace" data-id="${l.id}" data-delta="-1" ${pos===0?'disabled':''}>上一步</button><button class="button primary" data-action="trace" data-id="${l.id}" data-delta="1" ${pos===l.steps.length-1?'disabled':''}>下一步</button></div></div>`;
}
function feedbackFor(a,result){if(result.pending)return '草稿已修改，請重新檢查。';return a.type==='input'?a.feedback[result.correct?'correct':'incorrect']:a.type==='order'?(typeof a.feedback==='string'?a.feedback:a.feedback[result.correct?'correct':'incorrect']):a.feedback[Number(result.choice)];}
function activityMarkup(l,a,s){
  const result=s.activities[a.id];
  let controls;
  if(a.type==='input'){
    controls=`<label for="answer-${a.id}">你的答案</label><input class="search" id="answer-${a.id}" value="${esc(result?.draft??result?.choice??'')}" data-learning-input="${a.id}" data-unit="${l.id}" autocomplete="off"><button class="button primary" data-action="input-check" data-id="${l.id}" data-question="${a.id}">檢查答案</button>`;
  }else if(a.type==='order'){
    const order=getOrder(l,a,s);
    controls=`<ol class="order-list">${order.map((line,i)=>`<li><code>${esc(line)}</code><span><button class="button secondary" data-action="order-move" data-id="${l.id}" data-question="${a.id}" data-index="${i}" data-delta="-1" aria-label="將第 ${i+1} 行上移" ${i===0?'disabled':''}>↑</button><button class="button secondary" data-action="order-move" data-id="${l.id}" data-question="${a.id}" data-index="${i}" data-delta="1" aria-label="將第 ${i+1} 行下移" ${i===order.length-1?'disabled':''}>↓</button></span></li>`).join('')}</ol><button class="button primary" data-action="order-check" data-id="${l.id}" data-question="${a.id}">檢查順序</button>`;
  }else{
    controls=`<div class="answer-list">${a.options.map((o,i)=>`<button type="button" class="answer ${result?.choice===String(i)?(result.correct?'correct':'wrong'):''}" aria-pressed="${result?.choice===String(i)}" data-action="learning-answer" data-id="${l.id}" data-question="${a.id}" data-choice="${i}">${esc(o)}</button>`).join('')}</div>`;
  }
  const hasAnswer=result&&result.attempts>0&&!result.pending;
  const feedback=hasAnswer?(feedbackFor(a,result)):'';
  return `<article class="activity" id="activity-${a.id}" tabindex="-1"><h3>${esc(a.prompt)}</h3>${controls}${result?.pending?'<div class="feedback" role="status">草稿已修改，請重新檢查。</div>':''}${hasAnswer?`<div class="feedback ${result.correct?'good':'bad'}" role="status">${result.correct?'✓ 這次答對':'再試一次'}：${esc(feedback)}</div>`:''}<button class="button ghost" data-action="learning-hint" data-id="${l.id}" data-question="${a.id}" ${(result?.hints||0)>=a.hints.length?'disabled':''}>${result?.hints?'下一個提示':'需要一點提示'}</button>${a.hints.slice(0,result?.hints||0).map(h=>`<p class="hint-block">${esc(h)}</p>`).join('')}</article>`;
}
function checksMarkup(l,s){
  return `<div class="callout" id="self-checks" tabindex="-1"><strong>用自己的話確認</strong><p>以下是自我對照，不是 AI 批改；不以字數判斷理解程度。</p>${l.checks.map((check,i)=>`<label class="check-row"><input type="checkbox" data-learning-check="${i}" data-unit="${l.id}" ${s.checks.includes(String(i))?'checked':''}>${esc(check)}</label>`).join('')}</div>`;
}
function renderPilotStep(u,r,step){
  const l=lessonFor(u.id),s=studyFor(u.id);
  const videoFirst=Boolean(l.media?.video||['screencast','explainer'].includes(l.media?.kind));
  const action=(n,label)=>`<button class="button ${n>step?'primary':'ghost'}" data-action="step" data-step="${n}" data-id="${u.id}">${label}</button>`;
  if(step===0)return `<h2>這課結束後，你能做到</h2><p class="prose">${esc(l.goal)}</p><div class="example-box"><span class="label">先從一個生活問題開始</span>${esc(l.story)}</div>${l.prerequisiteIds?.length?`<p class="mode-note">想補基礎：${l.prerequisiteIds.map(id=>`<a href="${unitHref(id)}">${esc(byId.get(id)?.titleZh||id)}</a>`).join(' · ')}。可以先看本課說明，再按需要回頭。</p>`:''}${l.prerequisites.length?`<details class="prereq"><summary>先備小補充：看不懂時再展開</summary><ul>${l.prerequisites.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></details>`:''}${videoFirst?renderTrace(l):''}<div class="prose">${l.paragraphs.map(x=>`<p>${esc(x)}</p>`).join('')}</div>${videoFirst?'':renderTrace(l)}<div class="callout blue"><strong>容易混淆的地方</strong><p>${esc(l.misconception)}</p></div>${l.lab==='prompt'?renderPromptLab(u,r):''}<div class="step-actions"><span class="mode-note">先理解，再用小題確認。不需要一開始就全記住。</span>${action(1,'開始試做 →')}</div>`;
  if(step===1)return `<h2>先猜一猜，再動手</h2>${l.teaching?`<details class="extension"><summary>回看本課示範（不會清除作答）</summary><pre class="teaching-code">${esc(l.example)}</pre></details>`:""}${l.activities.map(a=>activityMarkup(l,a,s)).join('')}${renderLessonLab(l,r)}${l.code?renderCodeExercise(u,r):''}<details class="extension"><summary>想多做一點：延伸挑戰</summary><p>${esc(l.extension)}</p></details><div class="step-actions">${action(0,'← 回到理解')}${action(2,'對照思路 →')}</div>`;
  if(step===2)return `<h2>看看哪裡已經懂了</h2><p class="prose">回饋來自本題規則和預先撰寫的解析；沒有把你的筆記送給 AI。</p>${l.activities.map(a=>{const v=s.activities[a.id];return `<div class="example-box"><strong>${esc(a.prompt)}</strong><p>${v?.attempts?esc(feedbackFor(a,v)):'尚未作答。你可以先閱讀解析，再回去練習。'}</p><span class="chip">${v?.correct?'這次已答對':'待練習'}${v?.hints?' · 使用過提示':''}</span></div>`}).join('')}<div class="callout blue"><strong>本課常見誤解</strong><p>${esc(l.misconception)}</p></div>${l.code?`<p class="feedback ${s.codePassed?'good':'bad'}">程式檢查：${s.codePassed?'已通過本題測試；不代表所有可能輸入都正確。':'尚未通過目前草稿，回試做後按「檢查本題」。'}</p>`:''}${checksMarkup(l,s)}<label for="reflection">選填：用自己的話記下「原本以為……現在知道……」</label><textarea id="reflection" class="text-area" data-unit="${u.id}" placeholder="供你回顧，不自動評分。">${esc(r.reflection||'')}</textarea><div class="step-actions">${action(1,'← 回去再試')}${action(3,'換情境複習 →')}</div>`;
  const complete=currentLessonState(l,r)==='completed';
  const due=complete&&s.dueAt<=Date.now();
  const needed=[...l.activities,...l.review].filter(a=>!s.activities[a.id]?.correct).length;
  return `<h2>換個情境，還會用嗎？</h2><p class="prose">先不看前面的例子。這裡確認的是當次練習，不是永久掌握證明。</p>${l.review.map(a=>activityMarkup(l,a,s)).join('')}${checksMarkup(l,s)}<div class="callout" id="completion-status">${completionChecklist(l,r)}</div><div class="step-actions">${action(2,'← 看回饋')}<button class="button primary" data-action="finish-pilot" data-id="${u.id}" ${canFinish(l,r)?'':'disabled'}>${complete?'更新本課練習紀錄':'完成這次練習 ✓'}</button></div>${complete?`<p class="mode-note">已完成新版練習。下次複習：${new Date(s.dueAt).toLocaleDateString('zh-TW')}。提示使用與錯誤次數保留在學習紀錄。</p>${nextPilotLink(u)}${due?`<div class="callout"><a class="button secondary" href="#recall/${u.id}">先不看答案，做一次短回想 →</a></div>`:''}`:''}`;
}
function nextPilotLink(){const id=recommendedId();return `<div class="callout"><strong>把這一步接到下一步</strong><p>${id?esc(nodeFor(id)?.teaching?.whyNow||'先補齊目前需要的基礎。'):'目前路線已通過，可以切換另一條路線、回看作品或做短回想。'}</p>${guidedNextMarkup()}</div>`;}

function renderDataLab(l){
  const draft=studyFor(l.id).labDraft||{},lab=l.lab;
  if(lab.kind==='links')return `<div class="lab"><h3>先猜目的地，再改href</h3><p>${esc(lab.prompt)}</p><label for="lab-x">目前頁面（虛構網站）</label><select id="lab-x" class="select" data-lab-field="x" data-unit="${l.id}">${LINK_BASES.map(base=>`<option value="${base}" ${(draft.x??LINK_BASES[0])===base?'selected':''}>${base}</option>`).join('')}</select><label for="lab-values">href內容</label><input id="lab-values" class="search" maxlength="2000" data-lab-field="values" data-unit="${l.id}" value="${esc(draft.values??'pages/about.html')}"><div id="data-lab-result" aria-live="polite">${dataLabResult(l,draft)}</div><details><summary>虛構檔案與頁內id清單</summary><ul>${Object.entries(LINK_PAGES).map(([path,ids])=>`<li>${esc(path)}：${ids.map(esc).join('、')}</li>`).join('')}</ul></details><p class="mode-note">只在本機計算位置，不開啟或下載目標。清單比對不是HTTP檢查；查詢字串的伺服器行為也沒有模擬。本練習沒有base元素。</p></div>`;
  if(lab.kind==='html')return `<div class="lab"><h3>改標記，看內容結構</h3><p>${esc(lab.prompt)}</p><label for="lab-values">HTML內容片段（最多2000字元）</label><textarea id="lab-values" class="code-editor" maxlength="2000" rows="10" spellcheck="false" data-lab-field="values" data-unit="${l.id}">${esc(draft.values??lab.source)}</textarea><div id="data-lab-result" aria-live="polite">${dataLabResult(l,draft)}</div><p class="mode-note">只預覽標題、段落、清單等內容片段。腳本、外部資源、表單及自訂樣式不在本練習範圍。預覽不是完整HTML驗證，也不自動代表已掌握。</p></div>`;
  if(lab.kind==='trajectory')return `<div class="lab"><h3>改條件，看球怎麼走</h3><p>${esc(lab.prompt)}</p><label for="lab-values">速度（公尺／秒）、高度（公尺）、角度（度），逗號分隔</label><input id="lab-values" class="search" data-lab-field="values" data-unit="${l.id}" value="${esc(draft.values??'10,5,0')}"><div id="data-lab-result" aria-live="polite">${dataLabResult(l,draft)}</div><p class="mode-note">固定g=10、無空氣阻力的本機教學模型；圓點相隔相同時間，折線是取樣連線。不是你在Python區所寫程式的執行畫面。</p></div>`;
  if(lab.kind==='hanoi')return `<div class="lab"><h3>先猜下一片，再逐步搬動</h3><p>${esc(lab.prompt)}</p><label for="lab-values">盤數（0 到 5）</label><input id="lab-values" class="search" type="number" min="0" max="5" step="1" data-lab-field="values" data-unit="${l.id}" value="${esc(draft.values??'3')}"><div id="data-lab-result" aria-live="polite">${dataLabResult(l,draft)}</div><div class="button-row"><button class="button secondary" data-action="hanoi-step" data-id="${l.id}" data-delta="-1">前一張照片</button><button class="button primary" data-action="hanoi-step" data-id="${l.id}" data-delta="1">下一張照片</button></div><p class="mode-note">本機計算的標準遞迴示範；每按一次才移動，不自動播放。這不是你在試做區所寫程式的執行畫面。</p></div>`;
  if(lab.kind==='routes')return `<div class="lab"><h3>同一張路線圖，兩種目標</h3><p>${esc(lab.prompt)}</p><label for="lab-values">路段成本：A→B、A→C、B→C、B→D、C→D</label><input id="lab-values" class="search" data-lab-field="values" data-unit="${l.id}" value="${esc(draft.values??'1,4,2,6,1')}"><div id="data-lab-result" aria-live="polite">${dataLabResult(l,draft)}</div><p class="mode-note">固定有向圖，成本限制 0–100。BFS 依 B、C 的順序加入佇列；Dijkstra 同距離按節點字母排序。本實驗比較目標差異，不是所有圖演算法的模擬器。</p></div>`;
  if(lab.kind==='quantization')return `<div class="lab"><h3>改刻度，看捨入與截斷誤差</h3><p>${esc(lab.prompt)}</p><label for="lab-values">原始數值（逗號分隔）</label><input id="lab-values" class="search" data-lab-field="values" data-unit="${l.id}" value="${esc(draft.values??'0.6,1.8,-0.6')}"><label for="lab-weight">刻度 scale</label><input id="lab-weight" class="search" type="number" step="0.05" data-lab-field="weight" data-unit="${l.id}" value="${esc(draft.weight??'0.5')}"><div id="data-lab-result" aria-live="polite">${dataLabResult(l,draft)}</div><p class="mode-note">固定整數範圍 [-3,3]。本實驗半格平手朝遠離0方向捨入，與 Python round 的半偶數規則不同；沒有實際量化模型權重。</p></div>`;
  if(lab.kind==='boxes')return `<div class="lab"><h3>移動框的位置，看見交集與聯集</h3><p>${esc(lab.prompt)}</p>${[['x','框 A 座標','0,0,2,2'],['y','框 B 座標','1,0,3,2']].map(([key,label,value])=>`<label for="lab-${key}">${label}（left, top, right, bottom）</label><input id="lab-${key}" class="search" data-lab-field="${key}" data-unit="${l.id}" value="${esc(draft[key]??value)}">`).join('')}<div id="data-lab-result" aria-live="polite">${dataLabResult(l,draft)}</div><p class="mode-note">綠色實線是 A，藍色虛線是 B，交集用較深的綠色標示；數值也完整列在下方。這是幾何示意，不是影像偵測模型。</p></div>`;
  if(lab.kind==='gradient')return `<div class="lab"><h3>學習率實驗：走向最低點</h3><p>${esc(lab.prompt)}</p>${[['weight','起點 w','0','0.1'],['rate','學習率 eta','0.1','0.1'],['steps','更新次數','3','1']].map(([key,label,value,step])=>`<label for="lab-${key}">${label}</label><input id="lab-${key}" class="search" type="number" step="${step}" data-lab-field="${key}" data-unit="${l.id}" value="${esc(draft[key]??value)}">`).join('')}<div id="data-lab-result" aria-live="polite">${dataLabResult(l,draft)}</div><p class="mode-note">單參數函數 L=(w−3)² 的確定性計算；不是已訓練大型神經網路。試學習率0、0.5、1、1.1，先猜再看。</p></div>`;
  if(lab.kind==='regression'||lab.kind==='confusion'){
    const fields=lab.kind==='regression'?[['weight','斜率 w','0'],['bias','截距 b','0']]:[['threshold','分類門檻','0.5']];
    return `<div class="lab"><h3>${lab.kind==='regression'?'改一條線，看每筆誤差':'移動門檻，看誤報與漏報'}</h3><p>${esc(lab.prompt)}</p>${fields.map(([key,label,value])=>`<label for="lab-${key}">${label}</label><input id="lab-${key}" class="search" type="number" step="0.1" data-lab-field="${key}" data-unit="${l.id}" value="${esc(draft[key]??value)}">`).join('')}<div id="data-lab-result" aria-live="polite">${dataLabResult(l,draft)}</div><p class="mode-note">虛構固定資料，本機計算；這個實驗不是模型泛化評估。</p></div>`;
  }
  if(lab.kind==='vector')return `<div class="lab"><h3>向量方向實驗</h3><p>${esc(lab.prompt)}</p>${['x','y'].map((axis,i)=>`<label for="lab-${axis}">查詢向量 ${axis}</label><input id="lab-${axis}" class="search" type="number" step="0.1" data-lab-field="${axis}" data-unit="${l.id}" value="${esc(draft[axis]??(i===0?'1':'0'))}">`).join('')}<div id="data-lab-result" aria-live="polite">${dataLabResult(l,draft)}</div></div>`;
  if(lab.kind==='statistics')return `<div class="lab"><h3>改資料，看中心與分散</h3><p>${esc(lab.prompt)}</p><label for="lab-values">數值（逗號或空格分隔）</label><input id="lab-values" class="search" data-lab-field="values" data-unit="${l.id}" value="${esc(draft.values??lab.values)}"><div id="data-lab-result" aria-live="polite">${dataLabResult(l,draft)}</div></div>`;
  return `<div class="lab"><h3>表格實驗：改一個假設</h3><p>${esc(lab.prompt)}</p><label for="lab-threshold">保留分鐘大於等於</label><input id="lab-threshold" class="search" type="number" data-lab-field="threshold" data-unit="${l.id}" value="${esc(draft.threshold??30)}"><label for="lab-missing">缺值處理</label><select id="lab-missing" class="select" data-lab-field="missing" data-unit="${l.id}"><option value="keep" ${draft.missing!=='zero'?'selected':''}>保留缺值，平均只計已知資料</option><option value="zero" ${draft.missing==='zero'?'selected':''}>假設缺值為 0，觀察影響</option></select><div id="data-lab-result" aria-live="polite">${dataLabResult(l,draft)}</div><p class="mode-note">本機確定性表格運算；沒有執行 Pandas 或連接資料庫。填 0 是待判斷的假設，不是建議。</p></div>`;
}
function dataLabResult(l,draft){
  const fmt=x=>x===null?'資料不足':Number(x.toFixed(4)).toString();
  try{
    if(l.lab.kind==='links'){
      const r=resolveLessonLink(draft.values??'pages/about.html',draft.x??LINK_BASES[0]);
      return `<p><strong>${esc(r.kind)}</strong></p><p>解析後的位置：<code>${esc(r.href)}</code></p><dl><dt>網站來源</dt><dd>${esc(r.origin)}</dd><dt>路徑</dt><dd>${esc(r.path)}</dd><dt>查詢</dt><dd>${esc(r.query)||'無'}</dd><dt>頁內id</dt><dd>${esc(r.fragment)||'無'}</dd></dl><p>${esc(r.status)}</p>`;
    }
    if(l.lab.kind==='html'){
      const r=htmlPreview(draft.values??l.lab.source,document);
      return `<iframe title="你的HTML內容預覽" sandbox="" referrerpolicy="no-referrer" srcdoc="${esc(r.document)}" style="width:100%;height:300px;border:1px solid #a8b7aa;background:white"></iframe><p>讀到 ${r.headings.length} 個標題、${r.paragraphs} 個段落、${r.items} 個清單項目。</p><ol aria-label="標題結構">${r.headings.map(h=>`<li>h${h.level}：${esc(h.text)||'（空標題）'}</li>`).join('')}</ol>${r.omitted.length?`<p class="feedback">本練習未預覽：${esc(r.omitted.join('、'))}。請保留本課支援的內容標記。</p>`:''}`;
    }
    if(l.lab.kind==='trajectory'){
      const r=trajectorySamples(draft.values??'10,5,0'),maxX=Math.max(1,...r.rows.map(p=>p.x)),maxY=Math.max(1,...r.rows.map(p=>p.y));
      const scale=Math.min(410/maxX,160/maxY),px=x=>40+x*scale,py=y=>190-y*scale;
      return `<svg viewBox="0 0 480 225" role="img" aria-label="球的軌跡，等時間圓點，完整座標見下方表格" style="display:block;width:100%;max-width:600px;height:auto"><path d="M40 20 V190 H460" fill="none" stroke="currentColor"/><text x="8" y="15" fill="currentColor">y 公尺</text><text x="395" y="218" fill="currentColor">x 公尺</text><polyline points="${r.rows.map(p=>`${px(p.x)},${py(p.y)}`).join(' ')}" fill="none" stroke="#236746" stroke-width="2"/>${r.rows.map(p=>`<circle cx="${px(p.x)}" cy="${py(p.y)}" r="3" fill="#236746"/>`).join('')}</svg><p>落地時間：${fmt(r.duration)} 秒；水平距離：${fmt(r.rows.at(-1).x)} 公尺。兩軸等比例，圖會隨資料縮放；改參數時請一起看數值。</p><details><summary>展開17個等時間座標點</summary><div class="table-scroll"><table><caption>含起始與落地，顯示四位小數</caption><thead><tr><th>時間（秒）</th><th>x（公尺）</th><th>y（公尺）</th></tr></thead><tbody>${r.rows.map(p=>`<tr><td>${fmt(p.t)}</td><td>${fmt(p.x)}</td><td>${fmt(p.y)}</td></tr>`).join('')}</tbody></table></div></details>`;
    }
    if(l.lab.kind==='hanoi'){
      const frames=hanoiFrames(draft.values??'3'),step=Math.max(0,Math.min(frames.length-1,Math.trunc(Number(draft.steps)||0))),frame=frames[step],names=['A','B','C'];
      const picture=`<svg viewBox="0 0 360 180" role="img" aria-label="河內塔第 ${step} 次移動後，各柱內容完整列於下表" style="width:100%;max-width:480px;display:block;margin:auto">${frame.pegs.map((pole,i)=>{const x=60+i*120;return `<line x1="${x}" y1="25" x2="${x}" y2="145" stroke="currentColor" stroke-width="3"/><line x1="${x-52}" y1="145" x2="${x+52}" y2="145" stroke="currentColor" stroke-width="3"/>${pole.map((disk,j)=>{const width=20+disk*15,y=124-j*20;return `<rect x="${x-width/2}" y="${y}" width="${width}" height="18" rx="4" fill="#dcebd8" stroke="#355342"/><text x="${x}" y="${y+14}" text-anchor="middle" fill="#243c30" font-size="14">${disk}</text>`;}).join('')}<text x="${x}" y="169" text-anchor="middle" fill="currentColor">${names[i]}</text>`;}).join('')}</svg>`;
      return `${picture}<p><strong>移動 ${step} / ${frames.length-1}</strong> · ${frame.move?`把盤 ${frame.move.disk} 從 ${names[frame.move.from]} 搬到 ${names[frame.move.to]}`:'初始照片，尚未移動。'}${step===frames.length-1?' 已到終點。':''}</p><table><caption>目前照片：由底到頂，最後一個數字是最上面</caption><thead><tr><th>柱子</th><th>盤子</th></tr></thead><tbody>${frame.pegs.map((p,i)=>`<tr><th>${names[i]}</th><td>${p.join(' → ')||'空'}</td></tr>`).join('')}</tbody></table><p>先預測下一片從哪根柱子搬到哪裡，再按下一張。改變盤數會回到初始照片。</p>`;
    }
    if(l.lab.kind==='routes'){
      const r=routeComparison(draft.values??'1,4,2,6,1');
      const positions={A:[28,100],B:[140,25],C:[140,175],D:[252,100]};
      const picture=`<svg viewBox="0 0 280 200" role="img" aria-label="有向路線：A到B、A到C、B到C、B到D、C到D，成本列於下表" style="width:100%;max-width:360px;display:block;margin:auto"><defs><marker id="route-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="currentColor"/></marker></defs>${r.edges.map(e=>{const [x1,y1]=positions[e.from],[x2,y2]=positions[e.to],length=Math.hypot(x2-x1,y2-y1),dx=(x2-x1)/length,dy=(y2-y1)/length;return `<line x1="${x1+dx*17}" y1="${y1+dy*17}" x2="${x2-dx*19}" y2="${y2-dy*19}" stroke="currentColor" stroke-width="2" marker-end="url(#route-arrow)"/>`;}).join('')}${Object.entries(positions).map(([n,[x,y]])=>`<circle cx="${x}" cy="${y}" r="16" fill="#fff" stroke="currentColor"/><text x="${x}" y="${y+5}" text-anchor="middle" fill="currentColor">${n}</text>`).join('')}</svg>`;
      const rows=r.edges.map(e=>`<tr><th>${e.from} → ${e.to}</th><td>${fmt(e.weight)}</td></tr>`).join('');
      return `${picture}<table><caption>箭頭方向與成本（只能順著箭頭走）</caption><thead><tr><th>路段</th><th>成本</th></tr></thead><tbody>${rows}</tbody></table><p><strong>BFS：</strong>${r.bfs.path.join(' → ')}，${r.bfs.path.length-1} 段，成本 ${fmt(r.bfs.cost)}。</p><p><strong>Dijkstra：</strong>${r.dijkstra.path.join(' → ')}，${r.dijkstra.path.length-1} 段，成本 ${fmt(r.dijkstra.cost)}。</p><details><summary>展開搜尋過程</summary><table><caption>BFS 每次取出節點後的佇列</caption><thead><tr><th>取出</th><th>待處理佇列</th></tr></thead><tbody>${r.bfs.steps.map(s=>`<tr><th>${s.node}</th><td>${s.frontier}</td></tr>`).join('')}</tbody></table><div class="table-scroll"><table><caption>Dijkstra 每次確定節點後，已知最小成本估計</caption><thead><tr><th>確定節點</th><th>A</th><th>B</th><th>C</th><th>D</th></tr></thead><tbody>${r.dijkstra.steps.map(s=>`<tr><th>${s.node}</th>${['A','B','C','D'].map(n=>`<td>${Number.isFinite(s.distances[n])?fmt(s.distances[n]):'尚未發現'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
    }
    if(l.lab.kind==='quantization'){
      const scale=draft.weight??'0.5';if(String(scale).trim()==='')throw new Error('請填入刻度 scale。');
      const rows=quantizationRows(draft.values??'0.6,1.8,-0.6',Number(scale));
      return `<div class="table-scroll"><table><caption>q = 截斷(捨入(x / scale))；還原值 = q × scale</caption><thead><tr><th>原值</th><th>捨入後</th><th>q</th><th>還原</th><th>絕對誤差</th><th>截斷</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${fmt(r.value)}</td><td>${fmt(r.rounded)}</td><td>${r.quantized}</td><td>${fmt(r.restored)}</td><td>${fmt(r.error)}</td><td>${r.clipped?'有，超出範圍':'無'}</td></tr>`).join('')}</tbody></table></div><p>平均絕對誤差：${fmt(rows.reduce((s,r)=>s+r.error,0)/rows.length)}。這是這批數值的誤差，不是模型答題錯誤率。</p>`;
    }
    if(l.lab.kind==='boxes'){
      const r=boxOverlap(draft.x??'0,0,2,2',draft.y??'1,0,3,2');
      const left=Math.min(r.a[0],r.b[0]),top=Math.min(r.a[1],r.b[1]),width=Math.max(r.a[2],r.b[2])-left,height=Math.max(r.a[3],r.b[3])-top;
      const scale=230/Math.max(width,height),px=x=>20+(x-left)*scale,py=y=>20+(y-top)*scale;
      const rect=(v,color,dash)=>`<rect x="${px(v[0])}" y="${py(v[1])}" width="${(v[2]-v[0])*scale}" height="${(v[3]-v[1])*scale}" fill="none" stroke="${color}" stroke-width="3" ${dash?'stroke-dasharray="7 4"':''}/>`;
      return `<svg viewBox="0 0 270 270" role="img" aria-label="框 A 與框 B 的重疊示意，IoU ${fmt(r.iou)}" style="display:block;width:100%;max-width:320px;height:auto;background:#fff"><rect x="${px(r.overlap[0])}" y="${py(r.overlap[1])}" width="${r.overlap[2]*scale}" height="${r.overlap[3]*scale}" fill="#b7d9c3"/>${rect(r.a,'#236746',false)}${rect(r.b,'#245b82',true)}</svg><p>A 面積 ${fmt(r.areaA)}；B 面積 ${fmt(r.areaB)}；交集 ${fmt(r.intersection)}；聯集 ${fmt(r.union)}。</p><p><strong>IoU = ${fmt(r.intersection)} / ${fmt(r.union)} = ${fmt(r.iou)}</strong></p><p class="mode-note">圖形依兩框範圍等比例縮放；上方為較小的 y。只碰邊時交集面積為0。</p>`;
    }
    if(l.lab.kind==='gradient'){
      const raw=[draft.weight??'0',draft.rate??'0.1',draft.steps??'3'];if(raw.some(x=>String(x).trim()===''))throw new Error('請填入起點、學習率與次數。');
      const rows=gradientTrace(...raw.map(Number));
      return `<div class="table-scroll"><table><caption>每次更新：w ← w − eta × 梯度</caption><thead><tr><th>步</th><th>w</th><th>梯度 2(w−3)</th><th>損失 (w−3)²</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.step}</td><td>${fmt(r.weight)}</td><td>${fmt(r.gradient)}</td><td>${fmt(r.loss)}</td></tr>`).join('')}</tbody></table></div><p>第0步是起點；理論最低點w=3、損失0。表格顯示四位小數，顯示0不代表浮點數恰為0。</p>`;
    }
    if(l.lab.kind==='regression'){
      const raw=[draft.weight??'0',draft.bias??'0'];if(raw.some(x=>String(x).trim()===''))throw new Error('請填入斜率與截距。');
      const r=regressionScores(l.lab.rows,...raw.map(Number));
      return `<div class="table-scroll"><table><caption>每筆資料的預測與殘差</caption><thead><tr><th>x</th><th>實際 y</th><th>預測</th><th>殘差 y−預測</th></tr></thead><tbody>${r.points.map(p=>`<tr><td>${p.x}</td><td>${p.y}</td><td>${fmt(p.predicted)}</td><td>${fmt(p.residual)}</td></tr>`).join('')}</tbody></table></div><p>MSE=${fmt(r.mse)}；RMSE=${fmt(r.rmse)}；MAE=${fmt(r.mae)}。</p><p>先試 w=2、b=0，再改 b=1；訓練點誤差為零也不保證未見資料正確。</p>`;
    }
    if(l.lab.kind==='confusion'){
      const raw=draft.threshold??'0.5';if(String(raw).trim()==='')throw new Error('請填入門檻。');
      const r=binaryMetrics(l.lab.rows,Number(raw));
      return `<div class="table-scroll"><table><caption>逐筆分類結果</caption><thead><tr><th>分數</th><th>實際</th><th>預測</th><th>結果</th></tr></thead><tbody>${r.predictions.map(p=>`<tr><td>${p.score}</td><td>${p.label}</td><td>${p.predicted}</td><td>${p.kind.toUpperCase()}</td></tr>`).join('')}</tbody></table></div><p>TP=${r.tp}，FP=${r.fp}，FN=${r.fn}，TN=${r.tn}</p><p>precision=${fmt(r.precision)}；recall=${fmt(r.recall)}；accuracy=${fmt(r.accuracy)}。</p><p>分母為零時顯示資料不足，不當成完美。試 0.3、0.7、1，比較錯誤代價。</p>`;
    }
    if(l.lab.kind==='vector'){
      const raw=[draft.x??'1',draft.y??'0'];if(raw.some(x=>String(x).trim()===''))throw new Error('請填入兩個座標。');
      const query=raw.map(Number),rows=[['A',[2,0]],['B',[0,1]],['C',[-1,0]]].map(([name,vector])=>({name,vector,score:cosine(query,vector)})).sort((a,b)=>b.score-a.score);
      return `<div class="table-scroll"><table><caption>人工向量的餘弦排名（顯示四位小數，同分不表示真實性相同）</caption><thead><tr><th>候選</th><th>向量</th><th>餘弦相似度</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${row.name}</td><td>(${row.vector.join(', ')})</td><td>${fmt(row.score)}</td></tr>`).join('')}</tbody></table></div><p>試 (1,1)、(-1,0)、(0,0)。本實驗只計算方向，不包含語意模型或來源查核。</p>`;
    }
    if(l.lab.kind==='statistics'){
      const r=describeNumbers(draft.values??l.lab.values);
      return `<p>排序：${r.sorted.map(fmt).join('、')}</p><p>筆數 ${r.count}；平均 ${fmt(r.mean)}；中位數 ${fmt(r.median)}</p><p>全體變異數 ${fmt(r.populationVariance)}；樣本變異數 ${fmt(r.sampleVariance)}</p><p>把最大值調高：先猜平均和中位數誰改變較多，再觀察。顯示最多四位小數。</p>`;
    }
    const raw=draft.threshold??'30';if(String(raw).trim()==='')throw new Error('請輸入篩選門檻。');
    const r=analyzeTable(l.lab.rows,Number(raw),draft.missing||'keep');
    return `<div class="table-scroll"><table><caption>套用缺值假設後的資料</caption><thead><tr><th>識別鍵</th><th>分鐘</th><th>通過篩選</th></tr></thead><tbody>${r.rows.map(row=>`<tr><td>${esc(row.id)}</td><td>${row.minutes===null?'缺值':esc(row.minutes)}</td><td>${r.selected.includes(row)?'是':'否'}</td></tr>`).join('')}</tbody></table></div><p>篩選保留 ${r.selected.length} 筆。篩選前的已知分鐘平均 ${fmt(r.mean)}，分母 ${r.count}；仍缺值 ${r.missing} 筆。</p>`;
  }catch(error){return `<p class="feedback bad">${esc(error.message)}</p>`;}
}
function renderLessonLab(l,r){
  if(l.lab&&typeof l.lab==='object')return renderDataLab(l);
  if(l.lab==='condition')return `<div class="lab"><h3>分數實驗：改一個值，看走哪條路</h3><label for="score-lab">分數（0–100）</label><input id="score-lab" type="range" min="0" max="100" value="85"><output id="score-result" for="score-lab" aria-live="polite">85 分 → 優良；第一個條件 >= 80 成立。</output><p class="mode-note">試 59、60、79、80；這是固定規則示範，程式練習在下方。</p></div>`;
  if(l.lab==='loop'||l.lab==='trace')return l.media?`<details class="media-optional"><summary>需要時回看圖解，再繼續自己做</summary>${renderMedia(l)}</details>`:renderTrace(l);
  if(l.lab==='prompt')return renderPromptLab(byId.get(l.id),r);
  if(l.lab==='examples')return `<div class="lab"><h3>比較示例集</h3><label for="example-set">示例版本</label><select id="example-set" class="select"><option value="consistent">規則一致</option><option value="conflict">含矛盾標籤</option></select><div id="example-preview" class="lab-output">內容好 → 正面\n音量太小 → 負面\n內容好但太快 → 混合\n觀察：標籤有一致規則，可用未見句檢查。</div><p class="mode-note">固定教學範例，非即時 AI 回覆。</p></div>`;
  if(l.lab==='authority')return `<div class="lab"><h3>行動邊界練習</h3><p>使用者只授權「整理公告」，文件卻要求寄出所有筆記。</p><details><summary>對照三種下一步及後果</summary><ul><li>整理活動時間：在任務內，可繼續。</li><li>寄出筆記：超出任務，不執行；若有真實需求，先由使用者明確決定。</li><li>刪掉全部筆記：不是必要修復，也未獲授權。</li></ul></details><p>接著回到上方題目，說明你的選擇。</p></div>`;
  if(l.lab==='classifier')return classifierMarkup(l.id);
  if(l.lab==='rag')return `<div class="lab"><h3>選取檢索證據</h3><label for="rag-doc">要放進回答的資料</label><select class="select" id="rag-doc"><option value="old">A｜2024 舊規定</option><option value="current">B｜2026 現行規定</option><option value="other">C｜其他商家</option></select><div id="rag-preview" class="lab-output">A：30 天內可退款。風險：這是過期規定，不能支持目前的答案。</div><p class="mode-note">預寫文件與解析，模擬 RAG 步驟；沒有執行向量搜尋或 LLM。</p></div>`;
  return '';
}
function classifierMarkup(id){
  const p=record(id).project||{},result=p.result;
  return `<div class="lab"><h3>從資料學一個門檻</h3><p>特徵是氣溫；標籤 1 表示選冷飲、0 表示不選。都是虛構資料。</p><label for="training-mode">訓練資料範圍</label><select id="training-mode" data-unit="${id}" class="select"><option value="full" ${p.trainingMode!=='low'?'selected':''}>完整訓練集（六筆）</option><option value="low" ${p.trainingMode==='low'?'selected':''}>只有低溫資料（三筆）</option></select><p>完整訓練：(12,0)、(16,0)、(20,0)、(26,1)、(30,1)、(34,1)</p><p>保留測試：(14,0)、(22,0)、(24,1)、(28,1)、(32,0)、(18,0)</p><button class="button primary" data-action="train-model" data-id="${id}">用訓練資料學門檻，再評估</button><div id="classifier-result" aria-live="polite">${result?classifierResult(result):'<p>尚未訓練；先預測：只有低溫資料會漏掉什麼？</p>'}</div></div>`;
}
function classifierResult(result){
  const rows=evaluateThreshold(result.threshold,CLASSIFIER_DATA.test),train=CLASSIFIER_DATA.training.filter(([x])=>result.mode!=='low'||x<=20),training=evaluateThreshold(result.threshold,train),accuracy=rows.filter(x=>x.correct).length/rows.length;
  return `<p><strong>學到門檻：${result.threshold}°C</strong>；氣溫 ≥ 門檻，預測選冷飲。</p><p>訓練答對 ${training.filter(x=>x.correct).length}/${train.length}；保留測試答對 ${rows.filter(x=>x.correct).length}/${rows.length}（${Math.round(accuracy*100)}%）。</p><div class="table-scroll"><table><caption>每筆測試資料與結果（未用於選門檻）</caption><thead><tr><th>氣溫</th><th>實際標籤</th><th>預測</th><th>結果</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${x.x}</td><td>${x.actual}</td><td>${x.predicted}</td><td>${x.correct?'✓ 正確':'✗ 失敗'}</td></tr>`).join('')}</tbody></table></div><p class="callout">32°C 的例子不選冷飲，這個簡單規則無法解釋。查看多次測試結果後再挑模型，這份測試集就不再是全新的獨立驗證。</p>`;
}

function handleLearningAction(button){
  const action=button.dataset.action,id=button.dataset.id,l=lessonFor(id);
  if(handleMediaClick(button,l))return true;
  if(action==='recall-reveal'){if(completed(id)){recallRevealed.add(id);renderRecall(id);document.getElementById('recall-answer')?.focus();}return true;}
  if(action==='recall-rate'){
    if(!recallRevealed.has(id)||!completed(id))return true;
    const r=record(id);archiveCompletedRecord(r);
    if(reviewAgain(r,button.dataset.correct==='1')){r.updatedAt=Date.now();saveProgress();}
    recallRevealed.delete(id);renderRecall(id);return true;
  }
  if(action==='resume-requirement'){
    const target=pendingRequirements(l,record(id)).find(x=>x.target===button.dataset.target);
    if(!target)return true;
    record(id).step=target.step;saveProgress();renderUnit(id);
    const el=document.getElementById(target.target);el?.focus();el?.scrollIntoView({block:'center'});return true;
  }
  const actions=['needs-reinforcement','hanoi-step','trace','input-check','learning-answer','learning-hint','order-move','order-check','finish-pilot','review-result','train-model','save-project','export-project','restore-before-import'];
  if(!actions.includes(action))return false;
  if(action==='restore-before-import'){
    try{const raw=localStorage.getItem(STORAGE_KEY+'-before-import');if(!raw){announce('尚無取代前備份。');return true;}importProgressText(raw);}catch(error){announce('無法讀取備份：'+error.message);}return true;
  }
  if(action==='train-model'){
    const r=record(id);r.project||={};const mode=document.getElementById('training-mode').value;const train=CLASSIFIER_DATA.training.filter(([x])=>mode!=='low'||x<=20),result=trainThreshold(train);r.project.trainingMode=mode;r.project.result={...result,mode};r.updatedAt=Date.now();saveProgress();document.getElementById('classifier-result').innerHTML=classifierResult(r.project.result);return true;
  }
  if(action==='save-project'){saveProject(id);return true;}
  if(action==='export-project'){exportProject(id);return true;}
  if(action==='needs-reinforcement'&&projectFor(id)){const r=record(id);studyFor(id);markReinforcement(r);r.updatedAt=Date.now();saveProgress();renderProject(projectFor(id).key);return true;}
  if(!l)return true;
  const r=record(id),s=studyFor(id),questions=l.activities.concat(l.review),a=questions.find(x=>x.id===button.dataset.question);
  if(['learning-answer','input-check','order-move','order-check','review-result'].includes(action))archiveCompletedRecord(r);
  if(action==='needs-reinforcement'){markReinforcement(r);r.updatedAt=Date.now();saveProgress();renderUnit(id);return true;}
  if(action==='hanoi-step'&&l.lab?.kind==='hanoi'){
    s.labDraft||={};
    try{const frames=hanoiFrames(s.labDraft.values??'3');s.labDraft.steps=String(Math.max(0,Math.min(frames.length-1,(Number(s.labDraft.steps)||0)+Number(button.dataset.delta))));r.updatedAt=Date.now();saveProgress();document.getElementById('data-lab-result').innerHTML=dataLabResult(l,s.labDraft);}catch(error){announce(error.message);}
    return true;
  }
  if(action==='trace'){
    tracePositions[id]=Math.max(0,Math.min(l.steps.length-1,(tracePositions[id]||0)+Number(button.dataset.delta)));
    const box=button.closest('.lab');box.outerHTML=renderTrace(l);document.querySelector('.trace-state')?.scrollIntoView({block:'nearest'});return true;
  }
  if(action==='order-move'&&a){
    const key=id+':'+a.id,order=getOrder(l,a,s);const i=Number(button.dataset.index),j=i+Number(button.dataset.delta);
    if(j>=0&&j<order.length){[order[i],order[j]]=[order[j],order[i]];orderDrafts[key]=order;const old=s.activities[a.id]||{};s.activities[a.id]={...old,choice:JSON.stringify(order),correct:false,pending:true};saveProgress();}
  }
  if(action==='order-check'&&a){const order=getOrder(l,a,s);activityAnswer(s,a.id,JSON.stringify(order),JSON.stringify(order)===JSON.stringify(a.answer));}
  if(action==='input-check'&&a){const value=document.getElementById('answer-'+a.id).value;activityAnswer(s,a.id,value,checkShortAnswer(a,value));}
  if(action==='learning-answer'&&a)activityAnswer(s,a.id,button.dataset.choice,Number(button.dataset.choice)===a.answer);
  if(action==='learning-hint'&&a){s.activities[a.id]||={choice:'',correct:false,attempts:0,hints:0};s.activities[a.id].hints=Math.min(a.hints.length,(s.activities[a.id].hints||0)+1);}
  if(action==='finish-pilot'){
    if(!finishLesson(l,r)){announce('請先完成活動、程式檢查與自我對照。');return true;}
    if(saveProgress())announce('已保存這次練習。隔日、第 3 日、第 7 日逐步回想；不必一次背完。');renderUnit(id);return true;
  }
  if(action==='review-result')reviewAgain(r,button.dataset.correct==='1');
  r.updatedAt=Date.now();saveProgress();
  if(a){const box=document.getElementById('activity-'+a.id);box.outerHTML=activityMarkup(l,a,s);document.getElementById('activity-'+a.id)?.focus();refreshFinishButton(id);}
  else renderUnit(id);
  return true;
}
function refreshFinishButton(id){
  const l=lessonFor(id),r=record(id),s=studyFor(id),b=main.querySelector('[data-action="finish-pilot"]');if(b)b.disabled=!canFinish(l,r);
  const status=document.getElementById('completion-status');if(status)status.innerHTML=completionChecklist(l,r);
}
function progressExtras(){
  const now=Date.now(),due=[...lessons.values()].filter(l=>currentLessonState(l,progress[l.id])==='completed'&&progress[l.id].study.dueAt<=now);
  const learned=[...lessons.values()].filter(l=>currentLessonState(l,progress[l.id])==='completed');
  const struggled=[...lessons.values()].filter(l=>Object.values(progress[l.id]?.study?.activities||{}).some(a=>a.attempts>1||a.hints>0));
  return `<section class="progress-card"><h2>新版練習與回想</h2><p>目前有 ${learned.length} 堂本版練習通過。這是活動紀錄，不是能力認證；原有完成紀錄仍保留。</p><h3>今天可複習</h3>${due.length?due.map(l=>`<p><a class="text-link" href="#recall/${l.id}">${esc(byId.get(l.id).titleZh)} →</a></p>`).join(''):'<p>目前沒有到期項目。完成示範課後，網站會在你下次開啟時提醒。</p>'}<details><summary>曾使用提示或多次嘗試的概念（${struggled.length}）</summary>${struggled.map(l=>`<p><a href="${unitHref(l.id)}">${esc(byId.get(l.id).titleZh)}</a>：${Object.values(progress[l.id].study.activities).reduce((n,a)=>n+(a.attempts||0),0)} 次作答；${Object.values(progress[l.id].study.activities).reduce((n,a)=>n+(a.hints||0),0)} 次提示</p>`).join('')||'<p>目前沒有紀錄。</p>'}</details></section><section class="progress-card"><h2>我的小作品</h2>${Object.entries(projectInfo).map(([key,p])=>`<p><a class="text-link" href="#project/${key}">${p.title} →</a> · ${completed('project:'+key)?'本版作品已通過檢查':'尚待本版檢查與保存'}</p>`).join('')}<p>作品完成是本機實作／自評紀錄；不等於經獨立教師審核。</p></section>`;
}

function renderProjects(){
  main.innerHTML=`${breadcrumb([{label:'首頁',href:'#home'},{label:'小作品'}])}<div class="page-head"><span class="eyebrow">MAKE SOMETHING</span><h1>把學到的，做成自己的作品</h1><p>引導路線會在基礎齊備時帶入作品；這裡保留所有作品供回看與選讀。免金鑰、免帳號。</p></div><div class="source-grid">${Object.entries(projectInfo).map(([key,p])=>`<article class="source-card"><h2>${p.title}</h2><p>${p.intro}</p><a class="button primary" href="#project/${key}">開始這個作品 →</a></article>`).join('')}</div>`;setContext('小作品 · 從理解到應用');
}

function projectHistoryMarkup(r){
 return (r.history||[]).length?`<details class="extension"><summary>回看之前的作品與草稿（${r.history.length}）</summary>${r.history.map((old,i)=>`<details><summary>紀錄 ${i+1} · ${esc(old.study?.version||'舊版')}</summary><p>這是保留的歷史內容，可選取複製；不會取代目前草稿或自動算成本版通過。</p>${old.code?`<h3>當時的程式</h3><pre class="teaching-code">${esc(old.code)}</pre>`:''}${['prompt','source','reason','candidate'].map(k=>old.project?.[k]?`<h3>${({prompt:'當時的提示',source:'來源筆記',reason:'說明與限制',candidate:'候選選擇'})[k]}</h3><pre class="teaching-code">${esc(old.project[k])}</pre>`:'').join('')}${old.project?.result?`<h3>當時的實驗結果</h3><pre class="teaching-code">${esc(JSON.stringify(old.project.result,null,2))}</pre>`:''}</details>`).join('')}</details>`:'';
}
function renderProject(key){
  const p=projectInfo[key];if(!p)return renderNotFound();const id='project:'+key,r=record(id),s=studyFor(id),v=r.project||{};rememberJourney(id);
  const body=p.code?renderCodeExercise({id,codeExercise:p.code},r):key==='classifier'?classifierMarkup(id):`<div class="example-box"><strong>原始公告（固定測試資料）</strong><p>讀書會於 9 月 28 日下午 2 點在 A303 舉行，請自備筆電。沒有提到費用。</p></div><label for="project-prompt">你的 Prompt：說清任務、欄位與缺值處理</label><textarea id="project-prompt" class="text-area" data-project-field="prompt" data-unit="${id}">${esc(v.prompt||'')}</textarea><label for="project-source">來源筆記：指出使用哪段資料</label><textarea id="project-source" class="text-area" data-project-field="source" data-unit="${id}">${esc(v.source||'')}</textarea><label for="project-candidate">選擇候選答案（預寫範例，非即時 AI）</label><select id="project-candidate" class="select" data-project-field="candidate" data-unit="${id}"><option value="">請選擇</option><option value="unsupported" ${v.candidate==='unsupported'?'selected':''}>A：下午兩點在 A303，免費參加</option><option value="supported" ${v.candidate==='supported'?'selected':''}>B：下午兩點在 A303，自備筆電，費用未提供</option></select>`;
  main.innerHTML=`${breadcrumb([{label:'首頁',href:'#home'},{label:'小作品',href:'#projects'},{label:p.title}])}<div class="page-head"><span class="eyebrow">BUILD & EXPLAIN</span><h1>${p.title}</h1><p>${p.intro}</p>${p.teaching?`<p class="mode-note">作品約 ${p.teaching.estimatedMinutes[0]}–${p.teaching.estimatedMinutes[1]} 分鐘（估算，可分次做）</p>`:''}</div><details class="progress-card"><summary>先備課程與完成條件</summary><p>${p.prerequisiteIds.map(x=>`<a href="${unitHref(x)}">${esc(byId.get(x).titleZh)}</a>`).join(' · ')}</p><p>${p.code?'通過不同資料的函式檢查，並解釋輸入、處理、輸出。':key==='summary'?'保留來源和提示，辨認無根據的免費主張，說明修改理由。':'實際訓練並評估，指出錯誤例與資料限制。'}</p></details>${journeyContext(id)}<section class="step-panel">${p.teaching?teachingSupport(p):""}${body}<label for="project-reason">你的說明：做了什麼、怎麼檢查、還有什麼限制？</label><textarea id="project-reason" class="text-area" data-project-field="reason" data-unit="${id}">${esc(v.reason||'')}</textarea><div class="callout"><strong>自行對照，未由 AI 評分</strong>${['我已用不同例子檢查，或指出候選答案中的問題。','我能說明結果依據與至少一個限制。'].map((x,i)=>`<label class="check-row"><input type="checkbox" data-project-check="${i}" data-unit="${id}" ${(v.checks||[]).includes(String(i))?'checked':''}>${x}</label>`).join('')}</div><div class="button-row"><button class="button primary" data-action="save-project" data-id="${id}">保存作品與自評</button><button class="button secondary" data-action="export-project" data-id="${id}">匯出作品文字</button></div><button class="button ghost" data-action="needs-reinforcement" data-id="${id}">記為待補，保留作品草稿</button><p id="project-feedback" role="status">${completed(id)?'目前作品已通過檢查；保存狀態請留意上方通知。':r.completed?'歷史作品保留；目前修改需重新檢查並保存。':''}</p>${completed(id)?`<div id="project-next">${nextPilotLink()}</div>`:""}${projectHistoryMarkup(r)}<details id="project-export"><summary>作品文字（可複製保存）</summary><textarea id="project-export-text" class="text-area" readonly aria-label="作品匯出文字"></textarea></details></section>`;setContext(p.title+' · 小作品');
}
function saveProject(id){
  const r=record(id),p=r.project||{},key=id.split(':')[1],s=studyFor(id),feedback=document.getElementById('project-feedback');
  let error='';
  if(!p.reason?.trim()||(p.checks||[]).length<2)error='請寫下自己的說明，並完成兩項自我對照。這不會自動評分文字品質。';
  else if(projectFor(id)?.code&&(!s.codePassed||s.checkedCode!==r.code||s.codeVersion!==projectFor(id).version))error='請先讓目前程式通過「檢查本題」。';
  else if(key==='summary'&&(!p.prompt?.trim()||!p.source?.trim()||p.candidate!=='supported'))error='請保留 Prompt 與來源，並選出有證據支持的答案；「免費」沒有原文依據。';
  else if(key==='classifier'&&!p.result)error='請先實際訓練並檢查測試結果。';
  if(error){feedback.textContent=error;return;}
  if(!finishProject(projectFor(id),r)){feedback.textContent='目前資料尚未符合保存條件，請重新檢查。';return;}s.evidence=p.reason;
  if(saveProgress()){feedback.textContent='已保存作品與自評。這是實作紀錄，不是獨立審核或能力認證。';document.getElementById('project-next')?.remove();feedback.insertAdjacentHTML('afterend',`<div id="project-next">${nextPilotLink()}</div>`);}
  else feedback.textContent='尚未保存到瀏覽器，請立即匯出作品文字。';
}
function exportProject(id){
  const r=record(id),key=id.split(':')[1],p=r.project||{};
  const lines=[projectInfo[key].title,'',`檢查狀態：${completed(id)?'目前內容已通過檢查與自評':r.completed?'歷史完成保留，目前為草稿':'草稿'}`,storageProblem?'瀏覽器保存未確認，請另存這份匯出文字。':'請另存這份文字；它包含目前的作品內容。','',p.prompt?'Prompt：\n'+p.prompt:'',p.source?'來源筆記：\n'+p.source:'',key==='summary'?'固定來源：讀書會於 9 月 28 日下午 2 點在 A303 舉行，請自備筆電；費用未提供。\n候選選擇：'+(p.candidate||'未選'):'',r.code?'程式：\n'+r.code:'',p.result?'實驗結果：\n'+JSON.stringify(p.result,null,2):'','說明與限制：\n'+(p.reason||''),'','僅供學習；自評不等於獨立審核。'];
  const text=lines.filter(Boolean).join('\n\n');document.getElementById('project-export-text').value=text;document.getElementById('project-export').open=true;downloadText(text,projectInfo[key].title+'.txt','text/plain');
}
function downloadText(text,filename,type='application/json'){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}

document.addEventListener('input',event=>{
  const t=event.target;
  if(t.id==='score-lab'){const score=Number(t.value);document.getElementById('score-result').textContent=`${score} 分 → ${score>=80?'優良；第一個條件 >= 80 成立。':score>=60?'及格；>= 80 不成立，>= 60 成立。':'再努力；兩個條件都不成立，走 else。'}`;}
  if(t.dataset.projectField){const r=record(t.dataset.unit);archiveCompletedRecord(r);r.project||={};r.project[t.dataset.projectField]=t.value;r.updatedAt=Date.now();saveProgress();}
});
document.addEventListener('change',event=>{
  const t=event.target;
  if(t.dataset.learningCheck!==undefined){archiveCompletedRecord(record(t.dataset.unit));const s=studyFor(t.dataset.unit);s.checks=s.checks.filter(x=>x!==t.dataset.learningCheck);if(t.checked)s.checks.push(t.dataset.learningCheck);saveProgress();refreshFinishButton(t.dataset.unit);}
  if(t.dataset.projectCheck!==undefined){const r=record(t.dataset.unit);archiveCompletedRecord(r);r.project||={};r.project.checks=(r.project.checks||[]).filter(x=>x!==t.dataset.projectCheck);if(t.checked)r.project.checks.push(t.dataset.projectCheck);saveProgress();}
  if(t.id==='example-set')document.getElementById('example-preview').textContent=t.value==='consistent'?'內容好 → 正面\n音量太小 → 負面\n內容好但太快 → 混合\n觀察：規則一致，再用新句測試。':'內容好但太快 → 正面\n內容好但太快 → 負面\n同一句標記互相矛盾，先定義規則，不是一直堆更多示例。';
  if(t.id==='rag-doc')document.getElementById('rag-preview').textContent=({old:'A：30 天內可退款。風險：過期規定不能支持目前的答案。',current:'B：7 天內可申請，需收據。第 5 天有收據可申請，但不是保證核准。',other:'C：其他商家不接受退款。對象不同，不能套用。'})[t.value];
  if(t.id==='training-mode'){const r=record(t.dataset.unit);archiveCompletedRecord(r);r.project||={};r.project.trainingMode=t.value;r.project.result=null;saveProgress();document.getElementById('classifier-result').innerHTML='<p>資料範圍已改變，請重新訓練；先前結果不沿用。</p>';}
});

document.addEventListener('toggle',event=>{const el=event.target;if(!el.dataset?.codeHelp||!el.open)return;const s=studyFor(el.dataset.codeHelp);const a=s.activities['code-help']||={};a.hints=(a.hints||0)+1;saveProgress();},true);

document.addEventListener('click',(event)=>{
  const skip=event.target.closest('.skip-link');if(skip){event.preventDefault();main.focus();main.scrollIntoView({block:'start'});return;}
  const button=event.target.closest('[data-action]'); if(!button||!data) return;
  if(handleLearningAction(button))return;
  const action=button.dataset.action,id=button.dataset.id;
  if(action==='step'){changeStep(id,Number(button.dataset.step));return;}
  if(action==='mark-read'){const r=record(id);r.read=true;r.updatedAt=Date.now();saveProgress();changeStep(id,1);return;}
  if(action==='hint'){const u=byId.get(location.hash.slice(6));const box=document.getElementById('hint-area');if(!u||!box)return;box.innerHTML+=`<div class="hint-block">${button.dataset.hint==='1'?`提示 1：${esc(u.explanation.split('；')[0])}`:`提示 2：${esc(u.takeaway)}`}</div>`;button.disabled=true;return;}
  if(action==='run-code'||action==='check-code'){runCode(id,action==='check-code');return;}
  if(action==='code-hint'){const u=byId.get(id);const box=document.getElementById('code-hint-area');if(u&&box){box.innerHTML+=`<div class="hint-block">${esc(u.codeExercise.hints[Number(button.dataset.hint)])}</div>`;button.disabled=true;}return;}
  if(action==='answer'){const r=record(id),correct=button.dataset.correct==='1';document.querySelectorAll('.answer').forEach(x=>x.classList.remove('selected','wrong'));button.classList.add(correct?'correct':'wrong');const box=document.getElementById('quiz-feedback');if(correct){r.quizCorrect=true;r.updatedAt=Date.now();saveProgress();box.innerHTML='<div class="feedback good">答對了。試著不看文字，再說一次這個判斷為什麼成立。</div>';setTimeout(()=>renderUnit(id),450);}else{box.innerHTML=`<div class="feedback bad">再想想：這句描述的是別的主題。本章重點是「${esc(byId.get(id).titleZh)}」。你可以回看例子，或再選一次。</div>`;}return;}
  if(action==='complete'){const u=byId.get(id),r=record(id);if(!r.read||(r.reflection||'').trim().length<15||!r.quizCorrect||(u.codeExercise&&!r.codePass)){announce('還有一個練習沒完成，請依上方檢查表補齊。');return;}r.completed=true;r.updatedAt=Date.now();if(saveProgress())announce('已保存精華活動紀錄；不代表已獨立掌握。');renderUnit(id);return;}
  if(action==='export'){const payload=makeBackup(progress);const json=JSON.stringify(payload,null,2);const backup=document.getElementById('backup-text');backup.value=json;backup.closest('details').open=true;const blob=new Blob([json],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`學懂AI與程式-進度-${new Date().toISOString().slice(0,10)}.json`;a.style.display='none';document.body.appendChild(a);a.click();a.remove();announce('備份文字已產生；若瀏覽器允許，檔案也會自動下載。');setTimeout(()=>URL.revokeObjectURL(a.href),10000);return;}
  if(action==='copy-backup'){const value=document.getElementById('backup-text').value;if(!value){announce('請先按「匯出進度」。');return;}navigator.clipboard.writeText(value).then(()=>announce('備份文字已複製。')).catch(()=>{document.getElementById('backup-text').select();announce('請按 Ctrl+C 複製已選取的備份文字。');});return;}
  if(action==='import-text'){try{importProgressText(document.getElementById('import-text').value);}catch(error){announce('匯入失敗：'+error.message);}return;}
  if(action==='confirm-import'){if(!pendingImport)return;try{progress=replaceProgress(localStorage,STORAGE_KEY,pendingImport,progress);pendingImport=null;storageProblem='';showSaveWarning('');renderProgress();announce('進度已匯入，取代前紀錄也已保留。');}catch{announce('匯入未完成，原進度保留。請先匯出備份並檢查儲存空間。');}return;}
  if(action==='cancel-import'){pendingImport=null;document.getElementById('import-confirm').innerHTML='';announce('已取消匯入。');return;}
  if(action==='reset'){if(confirm('確定清除這台瀏覽器的所有學習進度與筆記嗎？建議先匯出備份。')){try{progress=replaceProgress(localStorage,STORAGE_KEY,{},progress);renderProgress();announce('本機進度已清除，取代前備份保留。');}catch{announce('未能清除，原資料保留。');}}return;}
});
document.addEventListener('input',(event)=>{
  const t=event.target;
  if(t.dataset.learningInput){
    const id=t.dataset.unit,s=studyFor(id),key=t.dataset.learningInput;
    archiveCompletedRecord(record(id));editActivityDraft(s,key,t.value);const article=t.closest('.activity');let note=article.querySelector('.feedback');if(!note){note=document.createElement('div');note.setAttribute('role','status');article.append(note);}note.className='feedback';note.textContent='草稿已修改，請重新檢查。';record(id).updatedAt=Date.now();saveProgress();refreshFinishButton(id);return;
  }
  if(t.dataset.labField){
    const l=lessonFor(t.dataset.unit),state=studyFor(l.id);archiveCompletedRecord(record(l.id));state.labDraft||={};state.labDraft[t.dataset.labField]=t.value;
    if(l.lab.kind==='hanoi'&&t.dataset.labField==='values')state.labDraft.steps='0';
    record(l.id).updatedAt=Date.now();saveProgress();
    const result=document.getElementById('data-lab-result'),details=result.querySelector('details');
    if(details)result.dataset.detailsOpen=String(details.open);
    result.innerHTML=dataLabResult(l,state.labDraft);
    const updatedDetails=result.querySelector('details');if(updatedDetails)updatedDetails.open=result.dataset.detailsOpen==='true';
    return;
  }
  if(t.id==='lesson-search'){updateFilter();return;}
  if(t.dataset.promptField){const r=record(t.dataset.unit);archiveCompletedRecord(r);r.promptDraft=Object.fromEntries(['task','reader','format','rule'].map(k=>[k,document.getElementById('prompt-'+k)?.value||'']));r.updatedAt=Date.now();saveProgress();updatePromptLab();return;}
  if(t.id==='reflection'){const r=record(t.dataset.unit);archiveCompletedRecord(r);r.reflection=t.value;r.updatedAt=Date.now();saveProgress();return;}
  if(t.id==='code-editor'){const r=record(t.dataset.unit);archiveCompletedRecord(r);r.code=t.value;r.codePass=false;if(r.study){r.study.codePassed=false;r.study.checkedCode='';}r.updatedAt=Date.now();saveProgress();const feedback=document.getElementById('code-feedback');if(feedback)feedback.textContent='草稿已修改，需重新檢查。';return;}
});
document.addEventListener('change',async(event)=>{
  const t=event.target;
  if(t.id==='source-filter'){updateFilter();return;}
  if(t.id==='import-file'&&t.files?.[0]){
    try{
      importProgressText(await t.files[0].text());
    }catch(error){announce('匯入失敗：'+error.message);}finally{t.value='';}
  }
});
function importProgressText(raw) {
  if(codeBusy)throw new Error('Python 執行中，請等待完成後再匯入。');
  const result=parseBackup(raw,new Set([...byId.keys(),...projectIds()]));
  pendingImport=result.progress;
  document.getElementById('import-confirm').innerHTML=`<div class="callout blue"><strong>準備匯入 ${Object.keys(result.progress).length} 筆紀錄（備份版本 ${result.version}）</strong><p>確認後取代目前紀錄；先保存取代前備份，任一儲存失敗都不更新畫面中的進度。${result.unknown.length?`忽略 ${result.unknown.length} 筆不認識的單元。`:''}</p><div class="button-row"><button type="button" class="button primary" data-action="confirm-import">確認取代進度</button><button type="button" class="button secondary" data-action="cancel-import">取消</button></div></div>`;
}
document.getElementById('menu-toggle').addEventListener('click',()=>{const sidebar=document.getElementById('sidebar');const opened=sidebar.classList.toggle('open');const toggle=document.getElementById('menu-toggle');toggle.setAttribute('aria-expanded',String(opened));toggle.setAttribute('aria-label',opened?'關閉導覽選單':'開啟導覽選單');if(opened)sidebar.querySelector('a')?.focus();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.getElementById('sidebar').classList.contains('open')){document.getElementById('sidebar').classList.remove('open');const toggle=document.getElementById('menu-toggle');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','開啟導覽選單');toggle.focus();}});
window.addEventListener('hashchange',()=>{document.getElementById('sidebar').classList.remove('open');const toggle=document.getElementById('menu-toggle');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','開啟導覽選單');render();});

try{
  const response=await fetch(DATA_URL);if(!response.ok)throw new Error('課程資料無法載入。');
  data=await response.json();byId=new Map(data.units.map(u=>[u.id,u]));projectInfo=Object.fromEntries(data.projects.map(p=>[p.key,p]));
  const lessonResponse=await fetch('./lessons.json?v=2026-09-video-assisted-1');if(!lessonResponse.ok)throw new Error('新版課程資料無法載入');
  lessons=new Map((await lessonResponse.json()).map(l=>[l.id,l]));
  if(!storageProblem){try{progress=parseBackup(JSON.stringify({schemaVersion:2,progress}),new Set([...byId.keys(),...projectIds()])).progress;}catch{storageProblem='原有紀錄無法讀取。為避免覆寫，已暫停自動儲存；請匯入有效備份。';progress={};}}
  if(!location.hash)location.hash='#home';else render();
}catch(error){main.innerHTML=`<div class="empty"><h1>網站還沒啟動</h1><p>${esc(error.message)}。請使用「啟動網站.cmd」開啟，不要直接雙擊 index.html。</p></div>`;}

document.addEventListener('input',event=>{const t=event.target;if(t.dataset.mediaPrediction)handleMediaInput(t,lessonFor(t.dataset.mediaPrediction));});
document.addEventListener('change',event=>{const t=event.target;if(t.dataset.mediaCase)handleMediaInput(t,lessonFor(t.dataset.mediaCase));});

function completionChecklist(l,r){
 const items=pendingRequirements(l,r);
 return items.length?`<strong>完成前，還差這些小步驟</strong><p>按一項直接回到作答位置，草稿會保留。</p><ul class="remaining-list">${items.map(x=>`<li><button class="button ghost" data-action="resume-requirement" data-id="${l.id}" data-target="${esc(x.target)}">${esc(x.label)} →</button></li>`).join('')}</ul>`:'本課活動、目前程式與自我對照已齊備，可以保存這次練習。';
}
function renderRecall(id){
 const l=lessonFor(id),r=progress[id];if(!l)return renderNotFound();
 const due=completed(id)&&r.study.dueAt<=Date.now(),q=recallQuestion(l,r),shown=recallRevealed.has(id);
 main.innerHTML=`${breadcrumb([{label:'首頁',href:'#home'},{label:'短回想'}])}<section class="progress-card recall-card"><span class="eyebrow">一次回想一個重點</span><h1>${esc(l.title)}</h1>${due&&q?`<p>先用自己的話回答，再想一個不同例子。不需要重做整堂，也不用一次補完所有複習。</p><h2>${esc(q.prompt)}</h2>${q.options?`<ul>${q.options.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}${shown?`<div class="callout" id="recall-answer" tabindex="-1"><h2>現在對照思路</h2><p>${esc(q.explanation||(Array.isArray(q.feedback)?q.feedback[q.answer]:typeof q.feedback==='string'?q.feedback:q.feedback?.correct)||l.misconception)}</p><p>${esc(q.type==='input'?q.accepted.join('／'):q.options?.[q.answer]||'')}</p></div><p>這是自評回想，沒有AI批改；看過答案不等於已掌握。</p><div class="button-row"><button class="button secondary" data-action="recall-rate" data-id="${id}" data-correct="1">能解釋，也能換例子</button><button class="button secondary" data-action="recall-rate" data-id="${id}" data-correct="0">還需要再練</button></div>`:`<button class="button primary" data-action="recall-reveal" data-id="${id}">想過了，對照思路</button>`}`:`<p>${completed(id)?'目前沒有到期回想；若剛完成自評，保存結果請留意頁面上方通知。': '這課還需要練習；先回到原課，草稿與歷史成果都保留。'}</p><a class="button secondary" href="${unitHref(id)}">回到這課繼續練 →</a>${guidedNextMarkup()}`}<p><a href="#home">先繼續今天的學習 →</a></p></section>`;setContext('短回想 · 先想再對照');
}
