import { loadPyodide } from './vendor/pyodide/package/pyodide.mjs';
let pyodide;
try {
  const response = await fetch(new URL('./checker.py?v=2026-09-v1-guided-recovery', import.meta.url));
  if (!response.ok) throw new Error('找不到本機檢查程式 checker.py');
  const checker = await response.text();
  pyodide = await loadPyodide({ indexURL: new URL('./vendor/pyodide/package/', import.meta.url).href });
  await pyodide.runPythonAsync(checker);
  self.postMessage({ type: 'ready' });
} catch(error) { self.postMessage({type:'load-error',message:String(error)}); }
self.onmessage = async ({data}) => {
  if (!pyodide || data?.type !== 'run') return;
  try {
    const fn = pyodide.globals.get('_study_evaluate');
    let result;
    try { result = JSON.parse(fn(String(data.code), data.validator ? JSON.stringify(data.validator) : '')); }
    finally { fn.destroy(); }
    self.postMessage({type:'result',id:data.id,...result});
  } catch(error) { self.postMessage({type:'result',id:data.id,output:'',error:String(error),passed:false,checks:[]}); }
};
