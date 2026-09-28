// Deterministic teaching calculations. No network, model, eval or external dependency.
export function hanoiFrames(value) {
  const n=Number(value);
  if(String(value).trim()===''||!Number.isInteger(n)||n<0||n>5)throw new Error('請填入 0 到 5 的整數盤數；步數會隨盤數快速增加。');
  const pegs=[Array.from({length:n},(_,i)=>n-i),[],[]];
  const frames=[{pegs:pegs.map(p=>p.slice()),move:null}];
  function move(count,from,to,spare){
    if(count===0)return;
    move(count-1,from,spare,to);
    const disk=pegs[from].pop();pegs[to].push(disk);
    frames.push({pegs:pegs.map(p=>p.slice()),move:{disk,from,to}});
    move(count-1,spare,to,from);
  }
  move(n,0,2,1);
  return frames;
}
export function routeComparison(text) {
  const weights=String(text).trim().split(/[,，\s]+/).filter(Boolean).map(Number);
  if(weights.length!==5||weights.some(w=>!Number.isFinite(w)||w<0||w>100))throw new Error('請依序填入五個 0 到 100 的路段成本。Dijkstra 本實驗不接受負權重。');
  const pairs=[['A','B'],['A','C'],['B','C'],['B','D'],['C','D']];
  const edges=pairs.map(([from,to],i)=>({from,to,weight:weights[i]}));
  const nodes=['A','B','C','D'],adj=node=>edges.filter(e=>e.from===node);
  const reconstruct=parent=>{let path=['D'];while(path[0]!=='A')path.unshift(parent[path[0]]);return path;};
  const cost=path=>path.slice(1).reduce((s,n,i)=>s+edges.find(e=>e.from===path[i]&&e.to===n).weight,0);
  const queue=['A'],seen=new Set(['A']),bp={},bs=[];
  while(queue.length){const node=queue.shift();if(node!=='D')for(const e of adj(node)){if(!seen.has(e.to)){seen.add(e.to);bp[e.to]=node;queue.push(e.to);}}bs.push({node,frontier:queue.join(', ')||'空'});if(node==='D')break;}
  const dist={A:0,B:Infinity,C:Infinity,D:Infinity},done=new Set(),dp={},ds=[];
  while(done.size<nodes.length){
    const node=nodes.filter(n=>!done.has(n)).sort((a,b)=>dist[a]-dist[b]||a.localeCompare(b))[0];done.add(node);
    if(node!=='D')for(const e of adj(node)){if(!done.has(e.to)&&dist[node]+e.weight<dist[e.to]){dist[e.to]=dist[node]+e.weight;dp[e.to]=node;}}
    ds.push({node,distance:dist[node],distances:{...dist}});if(node==='D')break;
  }
  const bfsPath=reconstruct(bp),dijkstraPath=reconstruct(dp);
  return {edges,bfs:{path:bfsPath,cost:cost(bfsPath),steps:bs},dijkstra:{path:dijkstraPath,cost:cost(dijkstraPath),steps:ds}};
}
export function trajectorySamples(text) {
  const parts=String(text).trim().split(/[,，\s]+/).filter(Boolean),values=parts.map(Number);
  if(values.length!==3||values.some(v=>!Number.isFinite(v))||values[0]<0||values[0]>100||values[1]<0||values[1]>100||values[2]<0||values[2]>90)throw new Error('請依序輸入速度0–100、高度0–100、角度0–90，以逗號分隔。');
  const [speed,height,angle]=values,rad=angle*Math.PI/180,vx=speed*Math.cos(rad),vy=speed*Math.sin(rad);
  const duration=(vy+Math.sqrt(vy*vy+20*height))/10;
  const rows=Array.from({length:17},(_,i)=>{const t=duration*i/16;return {t,x:vx*t,y:Math.max(0,height+vy*t-5*t*t)};});
  return {duration,rows};
}
export function boxOverlap(first,second) {
  const parse=text=>{
    const parts=String(text).trim().split(/[,，\s]+/).filter(Boolean),v=parts.map(Number);
    if(v.length!==4||v.some(x=>!Number.isFinite(x)||Math.abs(x)>100))throw new Error('每個框需有四個 -100 到 100 的座標：left, top, right, bottom。');
    if(v[2]<=v[0]||v[3]<=v[1])throw new Error('right 必須大於 left，bottom 必須大於 top；請保留正面積。');
    if(v[2]-v[0]<0.001||v[3]-v[1]<0.001)throw new Error('為了清楚顯示，本實驗的寬與高至少需為 0.001。');
    return v;
  };
  const a=parse(first),b=parse(second),left=Math.max(a[0],b[0]),top=Math.max(a[1],b[1]);
  const width=Math.max(0,Math.min(a[2],b[2])-left),height=Math.max(0,Math.min(a[3],b[3])-top);
  const area=v=>(v[2]-v[0])*(v[3]-v[1]),intersection=width*height,areaA=area(a),areaB=area(b),union=areaA+areaB-intersection;
  return {a,b,areaA,areaB,intersection,union,iou:intersection/union,overlap:[left,top,width,height]};
}
export function quantizationRows(text,scale) {
  if(!Number.isFinite(scale)||scale<0.0001||scale>1000)throw new Error('刻度 scale 需介於 0.0001 與 1000。');
  return describeNumbers(text).values.map(value=>{
    const scaled=value/scale,rounded=Math.sign(scaled)*Math.floor(Math.abs(scaled)+0.5),quantized=Math.max(-3,Math.min(3,rounded));
    const restored=quantized*scale;
    return {value,scaled,rounded,quantized,restored,error:Math.abs(value-restored),clipped:rounded!==quantized};
  });
}
export function cosine(a,b) {
  if(!Array.isArray(a)||!Array.isArray(b)||!a.length||a.length!==b.length||[...a,...b].some(x=>!Number.isFinite(x)))throw new Error('向量需為相同維度的有限數字。');
  const norm=v=>Math.hypot(...v),na=norm(a),nb=norm(b);
  if(na===0||nb===0)throw new Error('零向量沒有可定義的方向；請修改查詢。');
  return Math.max(-1,Math.min(1,a.reduce((sum,x,i)=>sum+(x/na)*(b[i]/nb),0)));
}

export function binaryMetrics(rows,threshold) {
  if(!Number.isFinite(threshold)||threshold<0||threshold>1)throw new Error('門檻需介於 0 與 1。');
  const counts={tp:0,fp:0,fn:0,tn:0};
  const predictions=rows.map(({score,label})=>{
    if(!Number.isFinite(score)||score<0||score>1||![0,1].includes(label))throw new Error('分類資料不符合規格。');
    const predicted=score>=threshold?1:0;
    const kind=label===1?(predicted?'tp':'fn'):(predicted?'fp':'tn');counts[kind]++;
    return {score,label,predicted,kind};
  });
  const ratio=(a,b)=>b?a/b:null;
  return {...counts,predictions,precision:ratio(counts.tp,counts.tp+counts.fp),recall:ratio(counts.tp,counts.tp+counts.fn),accuracy:ratio(counts.tp+counts.tn,rows.length)};
}

export function regressionScores(rows,weight,bias) {
  if(![weight,bias].every(x=>Number.isFinite(x)&&Math.abs(x)<=1e6))throw new Error('參數需為有限數字，絕對值不超過一百萬。');
  if(!rows.length)throw new Error('需要資料才能計算誤差。');
  const points=rows.map(([x,y])=>({x,y,predicted:weight*x+bias,residual:y-(weight*x+bias)}));
  const mse=points.reduce((s,p)=>s+p.residual**2,0)/points.length;
  return {points,mse,rmse:Math.sqrt(mse),mae:points.reduce((s,p)=>s+Math.abs(p.residual),0)/points.length};
}
export function describeNumbers(text) {
  const parts=String(text).trim().split(/[,，\s]+/).filter(Boolean);
  if(!parts.length)throw new Error('請輸入至少一個數字；空資料沒有平均值。');
  if(parts.length>100)throw new Error('教學實驗最多 100 筆。');
  const values=parts.map(x=>Number(x));
  if(values.some(x=>!Number.isFinite(x)||Math.abs(x)>1e9))throw new Error('每筆需為有限數字，絕對值不超過十億。');
  const sorted=[...values].sort((a,b)=>a-b),n=values.length,mean=values.reduce((a,b)=>a+b,0)/n;
  const median=n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2;
  const squared=values.reduce((s,x)=>s+(x-mean)**2,0);
  return {values,sorted,count:n,mean,median,populationVariance:squared/n,sampleVariance:n>1?squared/(n-1):null};
}

export function analyzeTable(rows,threshold,missingPolicy) {
  if(!Number.isFinite(threshold))throw new Error('門檻需為數字。');
  if(!['keep','zero'].includes(missingPolicy))throw new Error('未知的缺值處理。');
  const normalized=rows.map(row=>({...row,minutes:row.minutes===null&&missingPolicy==='zero'?0:row.minutes}));
  const known=normalized.filter(row=>Number.isFinite(row.minutes));
  const selected=known.filter(row=>row.minutes>=threshold);
  return {rows:normalized,selected,count:known.length,missing:normalized.length-known.length,mean:known.length?known.reduce((s,r)=>s+r.minutes,0)/known.length:null};
}

// Scalar teaching objective L=(w-3)^2; not training a neural network.
export function gradientTrace(initial,rate,steps) {
  if(!Number.isFinite(initial)||Math.abs(initial)>100)throw new Error('起點需介於 -100 與 100。');
  if(!Number.isFinite(rate)||rate<0||rate>2)throw new Error('學習率需介於 0 與 2。');
  if(!Number.isInteger(steps)||steps<0||steps>20)throw new Error('更新次數需為 0 到 20 的整數。');
  const rows=[];let weight=initial;
  for(let step=0;step<=steps;step++){
    const gradient=2*(weight-3),loss=(weight-3)**2;
    rows.push({step,weight,gradient,loss});weight-=rate*gradient;
  }
  return rows;
}
