export const CONTENT_VERSION = '2026-09-pilot-1';
export const REVIEW_DAYS = [1, 3, 7];
// Legacy import fixture IDs only; active project ownership is content/projects.json.
export const PROJECT_IDS = ['project:study', 'project:summary', 'project:classifier'];
const text = (x, max = 10000) => typeof x === 'string' ? x.slice(0, max) : '';
const bool = x => x === true;
const finite = x => Number.isFinite(x) && x >= 0 ? x : 0;

export function cleanRecord(value, includeHistory=true) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('課程紀錄必須是物件。');
  const r = { read:bool(value.read), reflection:text(value.reflection), quizCorrect:bool(value.quizCorrect), codePass:bool(value.codePass), completed:bool(value.completed), step:Math.min(3, Math.floor(finite(value.step))), updatedAt:finite(value.updatedAt) };
  // Resume context belongs to the existing record/backup, never to completion.
  if(['programming','ai'].includes(value.navigationPath)) {
    r.navigationPath=value.navigationPath;r.lastVisitedAt=finite(value.lastVisitedAt);
  }
  if (typeof value.code === 'string') r.code = text(value.code, 50000);
  if (value.promptDraft && typeof value.promptDraft === 'object') r.promptDraft = Object.fromEntries(['task','reader','format','rule'].map(k=>[k,text(value.promptDraft[k],2000)]));
  if (value.study && typeof value.study === 'object') {
    const s=value.study, activities={};
    for(const [id,a] of Object.entries(s.activities||{}).slice(0,100)) {
      if(!/^[a-z0-9-]+$/.test(id)||!a||typeof a!=='object') continue;
      activities[id]={choice:text(a.choice,1000),...(typeof a.draft==='string'?{draft:text(a.draft,1000)}:{}),...(a.pending===true?{pending:true}:{}),correct:bool(a.correct)&&a.pending!==true,attempts:Math.min(100000,finite(a.attempts)),hints:Math.min(3,finite(a.hints))};
    }
    r.study={version:text(s.version,80),activities,labDraft:Object.fromEntries(Object.entries(s.labDraft||{}).filter(([k])=>["values","threshold","missing","x","y","weight","bias","rate","steps"].includes(k)).map(([k,v])=>[k,text(v,2000)])),checks:Array.isArray(s.checks)?s.checks.filter(x=>typeof x==='string').slice(0,20):[],completedVersion:text(s.completedVersion,80),completedAt:finite(s.completedAt),reviewStage:Math.min(3,Math.floor(finite(s.reviewStage))),dueAt:finite(s.dueAt),lastReviewedAt:finite(s.lastReviewedAt),codeVersion:text(s.codeVersion,80),checkedCode:text(s.checkedCode,50000),codePassed:bool(s.codePassed),evidence:text(s.evidence,20000)};
  }
  if(value.project && typeof value.project==='object') {
    const p=value.project;
    r.project={prompt:text(p.prompt),source:text(p.source),reason:text(p.reason),candidate:text(p.candidate,30),checks:Array.isArray(p.checks)?p.checks.filter(x=>typeof x==='string').slice(0,10):[],trainingMode:text(p.trainingMode,20),result:p.result&&typeof p.result==='object'&&Number.isFinite(p.result.threshold)&&Number.isFinite(p.result.accuracy)&&['full','low'].includes(p.result.mode)?{threshold:Number(p.result.threshold),accuracy:Number(p.result.accuracy),mode:text(p.result.mode,20)}:null};
  }
  if (value.history !== undefined) {
    if(!includeHistory || !Array.isArray(value.history))throw new Error('歷史學習紀錄格式不正確；未取代進度。');
    r.history=value.history.map(entry=>cleanRecord(entry,false));
  }
  if(r.study){r.study.completionArchived=bool(value.study.completionArchived);r.study.projectSnapshot=text(value.study.projectSnapshot,120000);r.study.needsReinforcement=bool(value.study.needsReinforcement);r.study.reinforcementReason=text(value.study.reinforcementReason,1000);}
  return r;
}

export function parseBackup(raw, validIds) {
  if(raw.length>5_000_000) throw new Error('備份超過 5 MB，請確認檔案。');
  const p=JSON.parse(raw);
  if(!p || ![1,2].includes(p.schemaVersion) || !p.progress || typeof p.progress!=='object'||Array.isArray(p.progress)) throw new Error('備份格式或版本不支援。');
  const clean={}, unknown=[];
  for(const [id,r] of Object.entries(p.progress)) {
    if(!validIds.has(id)){unknown.push(id);continue;}
    clean[id]=cleanRecord(r);
  }
  if(Object.keys(p.progress).length && !Object.keys(clean).length) throw new Error('找不到可對應的課程，未取代資料。');
  return {progress:clean,unknown,version:p.schemaVersion};
}

export function makeBackup(progress, now=Date.now()) {
  return {schemaVersion:2,exportedAt:new Date(now).toISOString(),progress};
}

export function replaceProgress(storage,key,next,current) {
  const rollback=JSON.stringify(makeBackup(current));
  // If either write fails, the caller must retain its current in-memory progress.
  storage.setItem(key+'-before-import',rollback);
  storage.setItem(key,JSON.stringify(next));
  return next;
}

export function studyRecord(r,version=CONTENT_VERSION) {
  if(!r.study || r.study.version!==version) {
    const previous=r.study||{};
    // Preserve the exact previous learner work before changing the active contract.
    if(r.study){
      const {history,...snapshot}=r;
      r.history=[...(history||[]),JSON.parse(JSON.stringify(snapshot))];
    }
    r.study={version,activities:{},checks:[],completedVersion:previous.completedVersion||'',completedAt:previous.completedAt||0,reviewStage:0,dueAt:0,lastReviewedAt:0,codeVersion:'',checkedCode:'',codePassed:false,evidence:previous.evidence||''};
  }
  return r.study;
}

export function activityAnswer(state,id,choice,correct) {
  const old=state.activities[id]||{};
  state.activities[id]={choice,draft:choice,correct,attempts:(old.attempts||0)+1,hints:old.hints||0};
}

export function checkShortAnswer(question, value) {
  if(question.type !== 'input' || typeof value !== 'string' || !Array.isArray(question.accepted)) return false;
  const normalize=v=>question.caseSensitive===true?String(v).trim():String(v).trim().toLowerCase();
  return question.accepted.some(answer=>normalize(answer)===normalize(value));
}

export function canFinish(lesson,r) {
  const s=r.study;
  return !!s && s.version===lesson.version && lesson.activities.concat(lesson.review).every(a=>s.activities[a.id]?.correct) && lesson.checks.every((_,i)=>s.checks.includes(String(i))) && (!lesson.code || (s.codePassed && s.codeVersion===lesson.version && s.checkedCode===r.code));
}

export function finishLesson(lesson,r,now=Date.now()) {
  if(!canFinish(lesson,r)) return false;
  const s=r.study;
  s.needsReinforcement=false;s.reinforcementReason='';s.completionArchived=false;
  r.completed=true;
  if(s.completedVersion!==lesson.version) {
    s.completedVersion=lesson.version;s.completedAt=now;s.reviewStage=0;s.dueAt=now+86400000;
  }
  return true;
}

export function reviewAgain(r,correct,now=Date.now()) {
  const s=r.study;
  if(!s || !s.completedVersion || now<s.dueAt) return false;
  s.lastReviewedAt=now;
  if(correct)s.reviewStage=Math.min(3,s.reviewStage+1);else {s.reviewStage=0;markReinforcement(r,'回想時還不確定，重新練習後再往下。');}
  s.dueAt=now+(REVIEW_DAYS[Math.min(s.reviewStage,2)])*86400000;
  return true;
}

export function markReinforcement(r,reason='想再練一次') {
  const s=r.study;if(!s)return false;
  archiveCompletedRecord(r);
  s.needsReinforcement=true;s.reinforcementReason=String(reason).slice(0,1000);
  // Keep drafts, attempts, hints and historical completion; invalidate current claims.
  for(const a of Object.values(s.activities||{})){a.correct=false;a.pending=true;}
  s.codePassed=false;
  return true;
}

export function currentLessonState(lesson,r) {
  if(!r)return 'not-started';
  const s=r.study;
  if(s?.needsReinforcement)return 'needs-reinforcement';
  if(s?.completedVersion===lesson.version){return canFinish(lesson,r)?'completed':'needs-reinforcement';}
  return r.updatedAt||r.completed||r.code!==undefined||s?'in-progress':'not-started';
}

// A tiny real model: learn a one-dimensional threshold only from labeled training data.
export const CLASSIFIER_DATA = {
  training:[[12,0],[16,0],[20,0],[26,1],[30,1],[34,1]],
  test:[[14,0],[22,0],[24,1],[28,1],[32,0],[18,0]]
};
export function trainThreshold(rows) {
  if(!rows.length)throw new Error('至少需要一筆訓練資料。');
  const xs=[...new Set(rows.map(x=>x[0]))].sort((a,b)=>a-b);
  const candidates=[xs[0]-1,...xs.slice(1).map((x,i)=>(x+xs[i])/2),xs.at(-1)+1];
  let best={threshold:candidates[0],correct:-1};
  for(const threshold of candidates){const correct=rows.filter(([x,y])=>Number(x>=threshold)===y).length;if(correct>best.correct)best={threshold,correct};}
  return {...best,accuracy:best.correct/rows.length};
}
export function evaluateThreshold(threshold,rows){return rows.map(([x,y])=>({x,actual:y,predicted:Number(x>=threshold),correct:Number(x>=threshold)===y}));}

export function editActivityDraft(state,id,draft) {
  const old=state.activities[id]||{};
  state.activities[id]={...old,draft,correct:false,pending:true};
}

// Completion is tied to the actual saved project fields and code, not the old boolean.
export function projectSnapshot(r) {
  const p=r.project||{};
  return JSON.stringify({code:r.code||'',prompt:p.prompt||'',source:p.source||'',reason:p.reason||'',candidate:p.candidate||'',checks:[...(p.checks||[])].sort(),trainingMode:p.trainingMode||'',result:p.result?{threshold:p.result.threshold,accuracy:p.result.accuracy,mode:p.result.mode}:null});
}
export function canFinishProject(project,r) {
  const p=r?.project,s=r?.study;
  if(!p||!s||s.version!==project.version||!p.reason?.trim()||!['0','1'].every(x=>p.checks?.includes(x)))return false;
  if(project.code&&(!s.codePassed||s.codeVersion!==project.version||s.checkedCode!==r.code))return false;
  if(project.key==='summary'&&(!p.prompt?.trim()||!p.source?.trim()||p.candidate!=='supported'))return false;
  if(project.key==='classifier'&&(!p.result||p.result.mode!==p.trainingMode))return false;
  return true;
}
export function currentProjectState(project,r) {
  if(!r)return 'not-started';
  if(r.study?.needsReinforcement)return 'needs-reinforcement';
  if(r.study?.completedVersion===project.version)return canFinishProject(project,r)&&r.study.projectSnapshot===projectSnapshot(r)?'completed':'needs-reinforcement';
  return r.updatedAt||r.completed||r.project||r.code!==undefined?'in-progress':'not-started';
}
export function finishProject(project,r,now=Date.now()) {
  if(!canFinishProject(project,r))return false;
  r.completed=true;r.updatedAt=now;r.study.completedVersion=project.version;r.study.completedAt=now;
  r.study.projectSnapshot=projectSnapshot(r);r.study.completionArchived=false;r.study.needsReinforcement=false;r.study.reinforcementReason='';
  return true;
}

export function archiveCompletedRecord(r) {
  const s=r?.study;
  if(!s||s.completedVersion!==s.version||!s.completedVersion||s.completionArchived)return false;
  const {history,...snapshot}=r;
  r.history=[...(history||[]),JSON.parse(JSON.stringify(snapshot))];
  s.completionArchived=true;
  return true;
}
