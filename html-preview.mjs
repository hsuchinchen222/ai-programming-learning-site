// Narrow teaching renderer, not an arbitrary HTML hosting service.
const ALLOWED=new Set('main section article header footer nav h1 h2 h3 h4 h5 h6 p ul ol li strong em code pre blockquote br hr span div a'.split(' '));
const escape=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export function htmlPreview(source,doc){
  if(typeof source!=='string'||source.length>2000)throw new Error('本練習最多2000個字元。');
  const template=doc.createElement('template');template.innerHTML=source;
  const omitted=new Set(),headings=[];let paragraphs=0,items=0;
  function render(node,depth=0){
    if(node.nodeType===3)return escape(node.textContent);
    if(node.nodeType!==1)return '';
    const tag=node.localName;
    if(depth>30||node.namespaceURI!=='http://www.w3.org/1999/xhtml'||!ALLOWED.has(tag)){omitted.add(tag);return '';}
    let attrs='';
    for(const attr of node.attributes){
      if(['id','class','title','lang'].includes(attr.name))attrs+=` ${attr.name}="${escape(attr.value)}"`;
      else if(tag==='a'&&attr.name==='href'&&/^#[A-Za-z][A-Za-z0-9_-]*$/.test(attr.value))attrs+=` href="about:srcdoc${escape(attr.value)}"`;
      else omitted.add(`${tag}.${attr.name}`);
    }
    if(/^h[1-6]$/.test(tag))headings.push({level:Number(tag[1]),text:node.textContent.slice(0,120)});
    if(tag==='p')paragraphs++;if(tag==='li')items++;
    const content=Array.from(node.childNodes).map(child=>render(child,depth+1)).join('');
    return ['br','hr'].includes(tag)?`<${tag}${attrs}>`:`<${tag}${attrs}>${content}</${tag}>`;
  }
  const body=Array.from(template.content.childNodes).map(node=>render(node)).join('');
  const document=`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HTML練習預覽</title><style>body{font-family:system-ui,sans-serif;line-height:1.6;padding:12px;color:#20352b;background:#fff;overflow-wrap:anywhere}pre{white-space:pre-wrap}a{color:#236746}</style></head><body>${body}</body></html>`;
  return {document,headings,paragraphs,items,omitted:[...omitted]};
}
