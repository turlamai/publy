// Inline the reviewed theme using the browser DOM without attaching article markup to the host document.
// The preview producer emits escaped Markdown, safe local raster data and no active links.
const tags = new Set("DIV H1 H2 H3 H4 H5 H6 P SPAN STRONG EM S DEL BLOCKQUOTE UL OL LI PRE CODE TABLE THEAD TBODY TR TH TD HR BR IMG".split(" "));
export function richClipboard(fragment, css, document) {
 const doc=document.implementation.createHTMLDocument("");
 const root=doc.createElement("div");root.innerHTML=fragment;
 for(const el of Array.from(root.querySelectorAll("*"))){
  if(!tags.has(el.tagName)){el.replaceWith(doc.createTextNode(el.textContent??""));continue;}
  for(const attr of Array.from(el.attributes)){
   if(attr.name==="src"&&el.tagName==="IMG"&&/^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=]+$/i.test(attr.value))continue;
   if(["id","class","alt","start"].includes(attr.name))continue;
   el.removeAttribute(attr.name);
  }
 }
 // Parse reviewed styles in a constructed sheet (never insert a style into the active page).
 const sheet=new CSSStyleSheet();sheet.replaceSync(css);
 const allowed=new Set("color background-color font-family font-size font-weight font-style line-height letter-spacing text-align text-decoration text-indent white-space word-break overflow-wrap overflow-x display width max-width height margin margin-top margin-right margin-bottom margin-left padding padding-top padding-right padding-bottom padding-left border border-top border-right border-bottom border-left border-color border-width border-style border-radius border-collapse border-spacing vertical-align list-style list-style-type".split(" "));
 const rules=[];
 for(const rule of sheet.cssRules){if(!rule.selectorText||!rule.style)continue;
  for(const selector of rule.selectorText.split(",")){const s=selector.trim();if(!s.startsWith("#publy")&&!s.startsWith(".hljs"))continue;
   // Built-in styles use ID/class/type selectors and ordinary descendant selectors.
   if(/[:\[\]+~]/.test(s))continue;
   const specificity=(s.match(/#/g)?.length??0)*10000+(s.match(/\./g)?.length??0)*100+(s.match(/(?:^|[ >])\w+/g)?.length??0);
   rules.push({selector:s,style:rule.style,specificity,order:rules.length});
  }
 }
 rules.sort((a,b)=>a.specificity-b.specificity||a.order-b.order);
 for(const el of root.querySelectorAll("*")){
  for(const rule of rules){if(!el.matches(rule.selector))continue;
   for(const name of rule.style){const value=rule.style.getPropertyValue(name);if(!allowed.has(name)||/url\s*\(|var\s*\(|expression\s*\(/i.test(value))continue;el.style.setProperty(name,value,rule.style.getPropertyPriority(name));}
  }
 }
 return {html:root.innerHTML,text:root.textContent??""};
}
