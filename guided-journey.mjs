// Derived navigation only. Authored order lives solely in content/journey.json.
export const journeySteps = journey => journey.phases.flatMap(phase=>phase.steps);
export function pathPosition(journey,id) {
  for(let index=0;index<journey.phases.length;index++){
    const phase=journey.phases[index],step=phase.steps.indexOf(id);
    if(step>=0)return {phase,index,step,total:phase.steps.length};
  }
  return null;
}
export function missingPrerequisites(nodes,id,isComplete) {
  const missing=[],seen=new Set();
  function visit(key){
    if(seen.has(key))return;seen.add(key);
    for(const required of nodes.get(key)?.prerequisiteIds||[]){
      visit(required);
      if(!isComplete(required)&&!missing.includes(required))missing.push(required);
    }
  }
  visit(id);return missing;
}
export function recommend(journey,nodes,isComplete) {
  const steps=journeySteps(journey);
  const unresolved=steps.find(id=>!isComplete(id));
  if(!unresolved)return null;
  const missing=missingPrerequisites(nodes,unresolved,isComplete);
  return missing.find(id=>steps.includes(id))||unresolved;
}
export function nextMilestone(journey,from,isComplete) {
  const steps=journeySteps(journey),start=Math.max(0,steps.indexOf(from));
  const project=steps.slice(start).find(id=>id.startsWith('project:')&&!isComplete(id));
  if(!project)return null;
  return {id:project,lessons:steps.slice(start,steps.indexOf(project)).filter(id=>!id.startsWith('project:')&&!isComplete(id)).length};
}

// Pathways consume the same lessons/projects. Selection is URL context, never a
// second progress record. Shared completions are read from the existing owner.
export function selectedJourney(core, requested, isComplete) {
  const path=(core.pathways||[]).find(p=>p.id===requested);
  if(path)return path;
  return journeySteps(core).every(isComplete)?core.pathways?.[0]||core:core;
}
export function recommendAcross(core,path,nodes,isComplete){
  const coreNext=recommend(core,nodes,isComplete);
  if(coreNext)return coreNext;
  const unresolved=journeySteps(path).find(id=>!isComplete(id));
  if(!unresolved)return null;
  return missingPrerequisites(nodes,unresolved,isComplete)[0]||unresolved;
}
export function journeyForNode(core,selected,id){
  return pathPosition(selected,id)?selected:pathPosition(core,id)?core:
    (core.pathways||[]).find(p=>pathPosition(p,id))||null;
}
export function recentPath(progress){
  return Object.values(progress).filter(r=>['programming','ai'].includes(r.navigationPath))
    .sort((a,b)=>(b.lastVisitedAt||0)-(a.lastVisitedAt||0))[0]?.navigationPath;
}
