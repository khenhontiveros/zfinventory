// Collected from user-tested ZONEFIT Staple Tee capture bookmarklet.
// Supplier quantities may still need verification.
window.zonefitCollectVariants = function(root){
  const sizes=['XSM','SML','MED','LRG','XLG','2XL','3XL','4XL','5XL'];
  const aliases={'XS':'XSM','S':'SML','M':'MED','L':'LRG','XL':'XLG','XXL':'2XL'};
  const records=new Map(), diagnostics={tables:0,tableRows:0,quantityLabels:0,matchedCells:0,method:[]};
  function canon(s){const t=String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');return aliases[t]||t}
  function cleanColor(v){
    let t=String(v||'').replace(/\s+/g,' ').trim().replace(/\b(?:NEW COLOURS?|COMING SOON|OUTLET)\b/gi,'').trim();
    t=t.replace(/^[^A-Za-z]+/,'').replace(/\s*(?:\d+\s*AVAIL\.?|No restock planned).*$/i,'').trim();
    if(!t||t.length>55||/^(COLOU?R|TOTALS|SIZE|ENTER QUANTITY|QUANTITY)$/i.test(t))return '';
    return t.split(' ').map(w=>w.length===1?w.toUpperCase():w[0].toUpperCase()+w.slice(1).toLowerCase()).join(' ');
  }
  function parseStock(input,allowBare){
    const text=String(input||'').replace(/\s+/g,' ').trim();
    if(!text)return null;
    let m=text.match(/(?:^|\b)([\d,]+)\s*(\+?)\s*(?:AVAIL(?:ABLE)?\.?|IN\s*STOCK\b|(?:UNITS?|PIECES?)\s*(?:LEFT|AVAILABLE)|LEFT\s+IN\s+STOCK)/i);
    if(!m)m=text.match(/(?:stock\s*level|stock\s*qty|stock\s*quantity|available\s*qty|available\s*stock)\s*[:=]\s*([\d,]+)\s*(\+?)/i);
    if(!m&&allowBare)m=text.match(/^\s*([\d,]+)\s*(\+?)\s*$/);
    if(m){const n=Number(m[1].replace(/,/g,''));if(!Number.isFinite(n))return null;return {label:n.toLocaleString('en-AU')+(m[2]||''),minQty:n,status:n>0?'in_stock':'out_of_stock',isMinimum:!!m[2]}}
    if(/\b(?:OUT\s*OF\s*STOCK|SOLD\s*OUT|UNAVAILABLE|NO\s*STOCK|NOT\s*AVAILABLE)\b/i.test(text))return {label:'0',minQty:0,status:'out_of_stock',isMinimum:false};
    if(/\b(?:COMING\s*SOON|BACK\s*ORDER|PRE\s*ORDER)\b/i.test(text))return {label:'Soon',minQty:null,status:'coming_soon',isMinimum:false};
    if(/\b(?:IN\s*STOCK|AVAILABLE)\b/i.test(text))return {label:'Available',minQty:null,status:'in_stock',isMinimum:false};
    return null;
  }
  function put(color,size,parsed,method){
    const c=cleanColor(color),s=canon(size);
    if(!c||!sizes.includes(s)||!parsed)return;
    const key=c.toLowerCase()+'|'+s,old=records.get(key);
    if(!old || ((old.minQty===null && parsed.minQty!==null) || (old.method!=='table' && method==='table'))){
      records.set(key,{colour:c,size:s,quantity:parsed.label,minQty:parsed.minQty,status:parsed.status,isMinimum:parsed.isMinimum,method:method});
    }
    diagnostics.matchedCells++;
  }
  const tables=Array.from(root.querySelectorAll('table'));
  diagnostics.tables=tables.length;
  for(const table of tables){
    const rows=Array.from(table.querySelectorAll('tr'));
    const headIndex=rows.findIndex(tr=>{
      const texts=Array.from(tr.children).map(x=>(x.textContent||'').trim().toUpperCase());
      return texts.filter(x=>sizes.includes(canon(x))).length>=2;
    });
    if(headIndex<0)continue;
    const header=Array.from(rows[headIndex].children).map(x=>canon((x.textContent||'').trim()));
    const heads=header.map((name,i)=>({name,i})).filter(x=>sizes.includes(x.name));
    for(const row of rows.slice(headIndex+1)){
      const cells=Array.from(row.children).filter(x=>/^(TH|TD)$/.test(x.tagName));
      if(cells.length<2)continue;
      let colCell=cells[0];
      const alt=colCell.querySelector('img[alt]')?.getAttribute('alt');
      const colour=cleanColor(alt||colCell.getAttribute('data-colour')||colCell.textContent||'');
      if(!colour)continue;
      diagnostics.tableRows++;
      for(const head of heads){
        const cell=cells[head.i];
        if(!cell)continue;
        const raw=cell.textContent||cell.getAttribute('data-stock')||'';
        put(colour,head.name,parseStock(raw,true),'table');
      }
    }
    diagnostics.method.push('table');
  }
  const inputs=Array.from(root.querySelectorAll('[aria-label*="Quantity for"], [title*="Quantity for"], label, input'));
  for(const input of inputs){
    const label=String(input.getAttribute('aria-label')||input.getAttribute('title')||(/Quantity\s+for/i.test(input.textContent||'')?input.textContent:'')||'');
    const m=label.match(/Quantity\s+for\s+(XSM|SML|MED|LRG|XLG|2XL|3XL|4XL|5XL|XS|S|M|L|XL|XXL)\s+([A-Z][A-Z0-9\s\-\/'’]{1,55})/i);
    if(!m)continue;
    diagnostics.quantityLabels++;
    let found=null;
    for(let a=input,p=0;a&&p<5;a=a.parentElement,p++){
      const text=(a.textContent||'').replace(/\s+/g,' ').trim();
      if(text.length>380)continue;
      const val=parseStock(text,false);
      if(val){found=val;break}
      const stockAttribute=a.getAttribute('data-stock')||a.getAttribute('data-quantity')||'';
      const fromAttribute=parseStock(stockAttribute,true);
      if(fromAttribute){found=fromAttribute;break}
    }
    put(m[2],m[1],found,'label');
  }
  const raw=(root.body?.textContent||root.documentElement?.textContent||'').replace(/[\u00a0\t]+/g,' ').replace(/\s+/g,' ');
  const regex=/Quantity\s+for\s+(XSM|SML|MED|LRG|XLG|2XL|3XL|4XL|5XL|XS|S|M|L|XL|XXL)\s+([A-Z][A-Z0-9\s\-\/'’]{1,50}?)(?=\s*(?:\[\s*Input|\d[\d,]*\s*\+?\s*AVAIL|OUT\s*OF\s*STOCK|SOLD\s*OUT))/gi;
  let m;
  while((m=regex.exec(raw))!==null){
    const beforeNext=raw.indexOf('Quantity for ',regex.lastIndex);
    const end=beforeNext<0?Math.min(raw.length,regex.lastIndex+105):Math.min(beforeNext,regex.lastIndex+105);
    const part=raw.slice(regex.lastIndex,end);
    put(m[2],m[1],parseStock(part,false),'text');
  }
  if(records.size)diagnostics.method.push('label/text');
  const lines=(root.body?.innerText||root.body?.textContent||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  let cols=null,splitter=null;
  for(const line of lines){
    const separator=line.includes('\t')?'\t':line.includes('|')?'\\|':null;
    if(!separator)continue;
    const rx=separator==='\t'?/\t/:/\|/;
    const parts=line.split(rx).map(v=>v.trim());
    if(parts.length<3)continue;
    const normalized=parts.map(canon);
    if(normalized.filter(x=>sizes.includes(x)).length>=2){cols=normalized;splitter=separator;continue}
    if(!cols||separator!==splitter)continue;
    const colour=cleanColor(parts[0]);
    if(!colour)continue;
    cols.forEach((size,i)=>{if(sizes.includes(size)&&parts[i])put(colour,size,parseStock(parts[i],true),'pasted-table')});
  }
  if(cols)diagnostics.method.push('pasted-table');
  return {records:Array.from(records.values()),diagnostics};
};
