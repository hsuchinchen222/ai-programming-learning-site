// Derived presentation only: lesson questions, grading and schedules retain their owners.
export function pendingRequirements(lesson,record={}) {
 const s=record.study||{},items=[];
 for(const [step,questions] of [[1,lesson.activities],[3,lesson.review]])for(const q of questions)if(!s.activities?.[q.id]?.correct||s.activities[q.id].pending)items.push({step,target:'activity-'+q.id,label:q.prompt});
 if(lesson.code&&!(s.codePassed&&s.codeVersion===lesson.version&&s.checkedCode===record.code))items.push({step:1,target:'code-editor',label:'檢查目前的程式草稿'});
 if(lesson.checks.some((_,i)=>!s.checks?.includes(String(i))))items.push({step:2,target:'self-checks',label:'用自己的話完成自我對照'});
 return items;
}
export function learnerErrorLocation(error,code) {
 const matches=[...String(error).matchAll(/File "<(?:你的程式|unknown)>", line (\d+)/g)];
 const line=matches.length?Number(matches.at(-1)[1]):null,lines=String(code).split('\n');
 return line&&line<=lines.length?{line,source:lines[line-1]}:null;
}
export function recallQuestion(lesson,record={}) {
 // Repeat weak concepts first; tie order remains authored, no second question bank.
 const questions=lesson.review||[],a=record.study?.activities||{};
 return [...questions].sort((x,y)=>((a[y.id]?.hints||0)+(a[y.id]?.attempts||0))-((a[x.id]?.hints||0)+(a[x.id]?.attempts||0)))[0];
}
