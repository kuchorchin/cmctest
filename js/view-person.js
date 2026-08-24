/* =====================================================================
   7. ONE PERSON'S DASHBOARD
   ===================================================================== */
function viewPerson(userId, asOwner){
  const who = STATE.profiles.find(p=>p.id===userId);
  if(!who){ $('#views').innerHTML = `<div class="card">${emptyState('Person not found','')}</div>`; return; }
  const pid = STATE.period, per = periodById(pid);
  const cps = chartPeriods();
  const idx = cps.findIndex(p=>p.id===pid);
  const prev = idx>0 ? cps[idx-1] : null;
  const t = totals(userId,pid), tPrev = prev ? totals(userId,prev.id) : null;
  const tim = timing(userId);
  const series = cps.map(p=>totals(userId,p.id).commission);
  const subs = rowsFor(userId,pid);
  const op = openPeriod();

  setHead(asOwner ? who.full_name : `Hello, ${who.full_name.split(' ')[0]}`,
    asOwner ? `${who.job_title} · ${per?.label||''}`
            : `Your numbers for ${per?.label||'—'}. Only you and the owner can see this page.`);

  const delta = (now,before) => {
    if(!before) return '<span class="delta">Nothing to compare yet</span>';
    const d = (now-before)/before*100;
    return `<span class="delta"><span class="${d>=0?'up':'down'}">${d>=0?'↑':'↓'} ${Math.abs(d).toFixed(1)}%</span> vs ${esc(prev.label.split(' ')[0])}</span>`;
  };

  $('#views').innerHTML = `
    ${asOwner ? `<div class="note"><b>Viewing as owner.</b><span>${esc(who.full_name.split(' ')[0])} sees this same page, and nothing about anyone else.
      <button class="btn ghost small" data-back="1" style="margin-left:8px">Back to team</button></span></div>` : ''}
    ${!asOwner && op && !rowsFor(userId,op.id).length ? `<div class="note"><b>Your ${esc(op.label)} file isn't in yet.</b>
      <span>Due ${shortDate(op.due_at)}.<button class="btn small" data-goto="submit" style="margin-left:8px">Submit it now</button></span></div>` : ''}

    <div class="grid g4">
      ${statCard('Commission', money(t.commission), delta(t.commission,tPrev?.commission), series, '◇')}
      ${statCard('Sales', money(t.sales), delta(t.sales,tPrev?.sales), cps.map(p=>totals(userId,p.id).sales), '△')}
      ${statCard('Deals in the file', String(t.deals), `<span class="delta">${t.files} file${t.files===1?'':'s'} this period</span>`,
        cps.map(p=>totals(userId,p.id).deals), '▤')}
      ${statCard('On time', tim.pct+'%', `<span class="delta">${tim.late} late of ${tim.total}</span>`,
        cps.map(p=>{const l=rowsFor(userId,p.id);
          return l.length ? Math.round(l.filter(x=>!x.is_late).length/l.length*100) : 0;}), '◷')}
    </div>

    <div class="grid g-2-1">
      <div class="card">
        <div class="card-head"><h3>Commission over time</h3>
          <div class="right"><span class="eyebrow">Rate ${(Number(who.commission_rate)*100).toFixed(1)}%</span></div></div>
        ${lineChart('personChart', series, cps.map(p=>p.label.split(' ')[0].slice(0,3)+' '+p.id.slice(2,4)))}
      </div>
      <div class="card">
        <div class="card-head"><h3>Timing</h3></div>
        ${donut([{label:'On time',value:tim.onTime,color:'var(--ink)',display:tim.onTime},
                 {label:'Late',value:tim.late,color:'var(--taupe)',display:tim.late}], tim.pct+'%','on time')}
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3>What was in the ${esc(per?.label||'')} ${subs.length===1?'file':'files'}</h3>
        <div class="right"><span class="eyebrow" id="rowsMeta">${subs.length
          ? subs.reduce((a,r)=>a+Number(r.row_count||0),0)+' rows across '+subs.length+' file'+(subs.length===1?'':'s')
          : 'nothing yet'}</span></div></div>
      <div id="dealArea">${subs.length ? '<div class="loading"><div class="spinner"></div>Reading rows…</div>'
        : emptyState('No file for this period','Submit one and the rows will be listed here.')}</div>
    </div>`;
  bindChart('personChart');
  if(subs.length) loadDeals(subs, who);
}

async function loadDeals(subs, who){
  const { data, error } = await sb.from('sale_rows')
    .select('sale_date, customer, amount, rate')
    .in('submission_id', subs.map(s=>s.submission_id))
    .order('sale_date');
  const area = $('#dealArea'); if(!area) return;
  if(error){ area.innerHTML = emptyState('Could not load the rows', error.message); return; }
  if(!data.length){ area.innerHTML = emptyState('The file had no readable rows','It was recorded, but no sale amounts were found in it.'); return; }
  const rate = Number(who.commission_rate);
  area.innerHTML = `<table>
    <thead><tr><th>Date</th><th>Customer</th><th>Sale</th><th>Commission</th></tr></thead>
    <tbody>${data.map(r=>`<tr>
      <td class="mono">${r.sale_date ? new Date(r.sale_date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'2-digit'}) : '—'}</td>
      <td>${esc(r.customer||'—')}</td>
      <td class="num">${money(r.amount)}</td>
      <td class="num">${money2(Number(r.amount)*(r.rate!=null?Number(r.rate):rate))}</td></tr>`).join('')}
      <tr><td colspan="2"><b>Total</b></td>
        <td class="num"><b>${money(subs.reduce((a,s)=>a+Number(s.sales_total||0),0))}</b></td>
        <td class="num"><b>${money2(subs.reduce((a,s)=>a+Number(s.commission||0),0))}</b></td></tr></tbody></table>`;
}

