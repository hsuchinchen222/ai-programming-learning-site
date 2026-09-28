// A fixed fictional site for URL resolution practice. No navigation or network.
export const LINK_BASES=['https://study.example/club/index.html','https://study.example/club/pages/about.html'];
export const LINK_PAGES={
  '/club/index.html':['prepare','schedule'],
  '/club/pages/about.html':['team'],
  '/club/pages/contact.html':['email']
};
export function resolveLessonLink(value,base=LINK_BASES[0]) {
  if(!LINK_BASES.includes(base))throw new Error('請選擇教材提供的目前頁面。');
  if(typeof value!=='string'||value.length>2000)throw new Error('href最多2000字元。');
  const href=value.trim();
  if(!href)throw new Error('先填一個href，例如pages/about.html或#prepare。空值的導覽行為不在這次練習範圍。');
  if(/[\\\u0000-\u001f\u007f]/.test(href))throw new Error('本練習請用URL的正斜線 /，不要用Windows反斜線或控制字元。');
  let url;
  try{url=new URL(href,base);}catch{throw new Error('這段文字無法解析成URL，請檢查網址格式。');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('本練習只解析不含帳密的HTTP／HTTPS位置；不執行腳本、郵件或本機檔案連結。');
  const kind=href.startsWith('#')?'頁內片段':href.startsWith('?')?'目前路徑的查詢':href.startsWith('//')?'沿用協定的網址':/^[a-z][a-z0-9+.-]*:/i.test(href)?'完整網址':href.startsWith('/')?'從網站根目錄開始':'相對目前目錄';
  const knownOrigin=url.origin==='https://study.example';
  const anchors=knownOrigin&&Object.hasOwn(LINK_PAGES,url.pathname)?LINK_PAGES[url.pathname]:null;
  let fragment=url.hash.slice(1);
  try{fragment=decodeURIComponent(fragment);}catch{}
  const status=!knownOrigin?'教材未驗證這個網站':anchors===null?'教材檔案清單中沒有這個路徑':fragment&&!anchors.includes(fragment)?'檔案在清單中，但沒有這個id':'教材清單中找到對應位置';
  return {href:url.href,kind,origin:url.origin,path:url.pathname,query:url.search,fragment,status};
}
