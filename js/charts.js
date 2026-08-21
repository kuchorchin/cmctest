/* =====================================================================
   4. CHARTS
   ===================================================================== */
function sparkline(values, color){
  if(!values.length) values = [0,0];
  const w=132,h=34,p=3, max=Math.max(...values,1), min=Math.min(...values,0), span=(max-min)||1;
  const d = values.map((v,i)=>{
    const x = p + i*(w-p*2)/Math.max(1,values.length-1);
    const y = h - p - ((v-min)/span)*(h-p*2);
    return (i?'L':'M')+x.toFixed(1)+' '+y.toFixed(1);
  }).join(' ');
  return `<svg width="100%" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <path d="${d}" fill="none" stroke="${color||'var(--ink)'}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function lineChart(id, values, labels){
  if(!labels.length) return `<div class="empty">No periods to chart yet</div>`;
  const w=760,h=250,L=52,R=14,T=16,B=30;
  const max = Math.max(...values,1)*1.12;
  const xAt = i => L + i*(w-L-R)/Math.max(1,labels.length-1);
  const yAt = v => T + (1 - v/max)*(h-T-B);
  let grid='';
  for(let i=0;i<=4;i++){
    const v = max*i/4, y = yAt(v);
    grid += `<line x1="${L}" y1="${y.toFixed(1)}" x2="${w-R}" y2="${y.toFixed(1)}" stroke="var(--line-soft)"/>
      <text x="${L-10}" y="${(y+4).toFixed(1)}" text-anchor="end" font-size="10.5" fill="var(--muted)" font-family="IBM Plex Mono,monospace">${v>=1000?'$'+Math.round(v/1000)+'k':'$'+Math.round(v)}</text>`;
  }
  const xlab = labels.map((l,i)=>`<text x="${xAt(i).toFixed(1)}" y="${h-8}" text-anchor="middle" font-size="10.5" fill="var(--muted)" font-family="IBM Plex Mono,monospace">${esc(l)}</text>`).join('');
  const path = values.map((v,i)=>(i?'L':'M')+xAt(i).toFixed(1)+' '+yAt(v).toFixed(1)).join(' ');
  const dots = values.map((v,i)=>`<circle class="hot" data-i="${i}" cx="${xAt(i).toFixed(1)}" cy="${yAt(v).toFixed(1)}" r="4" fill="var(--card)" stroke="var(--ink)" stroke-width="1.8" opacity="0"/>`).join('');
  const step = (w-L-R)/Math.max(1,labels.length-1);
  const hits = labels.map((l,i)=>`<rect data-i="${i}" x="${(xAt(i)-step/2).toFixed(1)}" y="${T}" width="${step.toFixed(1)}" height="${h-T-B}" fill="transparent"/>`).join('');
  return `<div class="chart-wrap" id="${id}" data-values='${JSON.stringify(values)}' data-labels='${esc(JSON.stringify(labels))}'>
    <svg viewBox="0 0 ${w} ${h}" width="100%" style="display:block;overflow:visible">
      ${grid}${xlab}<path d="${path}" fill="none" stroke="var(--ink)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>${dots}<g class="hits">${hits}</g>
    </svg><div class="chart-tip"></div></div>`;
}
function bindChart(id){
  const wrap = document.getElementById(id); if(!wrap) return;
  const values = JSON.parse(wrap.dataset.values), labels = JSON.parse(wrap.dataset.labels);
  const tip = wrap.querySelector('.chart-tip');
  wrap.querySelectorAll('.hits rect').forEach(r=>{
    r.addEventListener('mousemove', () => {
      const i = +r.dataset.i;
      wrap.querySelectorAll('.hot').forEach(c=>c.setAttribute('opacity', +c.dataset.i===i?'1':'0'));
      const box = wrap.getBoundingClientRect();
      const dbox = wrap.querySelector(`.hot[data-i="${i}"]`).getBoundingClientRect();
      tip.innerHTML = `<b>${money(values[i])}</b> · ${esc(labels[i])}`;
      tip.style.left = (dbox.left-box.left+dbox.width/2)+'px';
      tip.style.top = (dbox.top-box.top)+'px';
      tip.style.opacity = '1';
    });
  });
  wrap.addEventListener('mouseleave', ()=>{
    tip.style.opacity='0';
    wrap.querySelectorAll('.hot').forEach(c=>c.setAttribute('opacity','0'));
  });
}
function donut(parts, top, bottom){
  const size=118, stroke=15, r=(size-stroke)/2, C=2*Math.PI*r;
  const total = parts.reduce((a,p)=>a+p.value,0) || 1;
  let off = 0;
  const arcs = parts.map(p=>{
    const len = p.value/total*C;
    const el = `<circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${p.color}" stroke-width="${stroke}"
      stroke-dasharray="${len.toFixed(2)} ${(C-len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"
      transform="rotate(-90 ${size/2} ${size/2})"/>`;
    off += len; return el;
  }).join('');
  return `<div class="donut-wrap"><div style="position:relative;flex:none">
    <svg width="${size}" height="${size}">
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--line-soft)" stroke-width="${stroke}"/>${arcs}</svg>
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
      <div class="serif" style="font-size:24px;line-height:1">${top}</div>
      <div class="eyebrow" style="margin-top:2px">${bottom}</div></div></div>
    <div class="legend">${parts.map(p=>`<div class="legend-row"><span class="legend-key" style="background:${p.color}"></span>${p.label}<span class="v">${p.display}</span></div>`).join('')}</div></div>`;
}
function statCard(label, value, deltaHtml, spark, glyph){
  return `<div class="card stat"><div class="label"><span class="chip">${glyph}</span>${label}</div>
    <div class="value num">${value}</div>${deltaHtml}${sparkline(spark,'var(--taupe-deep)')}</div>`;
}
function emptyState(t,b){ return `<div class="empty"><b>${esc(t)}</b>${esc(b)}</div>`; }

