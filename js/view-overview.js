/* =====================================================================
   6. OWNER OVERVIEW
   ===================================================================== */
function viewOwnerOverview(){
  const pid = STATE.period, per = periodById(pid);
  const cps = chartPeriods();
  const idx = cps.findIndex(p=>p.id===pid);
  const prev = idx > 0 ? cps[idx-1] : null;
  const t = totals(null,pid), tPrev = prev ? totals(null,prev.id) : null;
  const tim = timing(null);
  const missing = missingFor(pid);
  const series = cps.map(p=>totals(null,p.id).commission);

  setHead('Overview', per ? `Everyone's numbers for ${per.label}.` : 'No period selected.');

  const delta = (now, before) => {
    if(!before) return '<span class="delta">Nothing to compare yet</span>';
    const d = (now-before)/before*100;
    return `<span class="delta"><span class="${d>=0?'up':'down'}">${d>=0?'↑':'↓'} ${Math.abs(d).toFixed(1)}%</span> vs ${esc(prev.label.split(' ')[0])}</span>`;
  };
  const leaders = reps().map(r=>({r, ...totals(r.id,pid)})).sort((a,b)=>b.commission-a.commission);
  const top = leaders[0]?.commission || 1;

  $('#views').innerHTML = `
    <div class="grid g4">
      ${statCard('Commission owed', money(t.commission), delta(t.commission, tPrev?.commission), series, '◇')}
      ${statCard('Sales booked', money(t.sales), delta(t.sales, tPrev?.sales), cps.map(p=>totals(null,p.id).sales), '△')}
      ${statCard('Files received', `${t.files} of ${reps().length}`,
        missing.length ? `<span class="delta">Waiting on ${esc(missing.map(m=>m.full_name.split(' ')[0]).join(', '))}</span>`
                       : '<span class="delta"><span class="up">Everyone submitted</span></span>',
        cps.map(p=>totals(null,p.id).files), '▤')}
      ${statCard('On time, all-time', tim.pct+'%', `<span class="delta">${tim.late} late of ${tim.total} files</span>`,
        cps.map(p=>{const l=rowsFor(null,p.id);return l.length?l.filter(r=>!r.is_late).length/l.length*100:0;}), '◷')}
    </div>

    <div class="card">
      <div class="card-head"><h3>Commission over time</h3>
        <div class="right"><span class="eyebrow">Whole team</span></div></div>
      ${lineChart('teamChart', series, cps.map(p=>p.label.split(' ')[0].slice(0,3)+' '+p.id.slice(2,4)))}
    </div>

    <div class="grid g-2-1">
      <div class="card">
        <div class="card-head"><h3>Who earned what</h3><div class="right"><span class="eyebrow">${esc(per?.label||'')}</span></div></div>
        ${!leaders.length ? emptyState('No sales staff yet','Add people under Settings.')
          : leaders.map(l=>`<div class="bar-row">
              <div class="who-line"><span class="avatar" style="width:24px;height:24px;font-size:9.5px">${initials(l.r.full_name)}</span>${esc(l.r.full_name)}
                ${l.files?'':'<span class="badge neutral" style="margin-left:6px">No file</span>'}</div>
              <div class="amt">${money(l.commission)}</div>
              <div class="bar-track"><div class="bar-fill" style="width:${(l.commission/top*100).toFixed(1)}%"></div></div>
            </div>`).join('')}
      </div>
      <div class="card">
        <div class="card-head"><h3>Submission timing</h3></div>
        ${donut([{label:'On time',value:tim.onTime,color:'var(--ink)',display:tim.onTime},
                 {label:'Late',value:tim.late,color:'var(--taupe)',display:tim.late}], tim.pct+'%','on time')}
        <div class="note" style="margin-top:16px"><span>The database stamps the arrival time and compares it to the deadline. Nobody marks themselves late.</span></div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3>Recent files</h3>
        <div class="right"><button class="btn ghost small" data-goto="submissions">View all</button></div></div>
      ${fileTable(STATE.summary.slice().sort((a,b)=>new Date(b.submitted_at)-new Date(a.submitted_at)).slice(0,6), true)}
    </div>`;
  bindChart('teamChart');
  wireDownloads();
}

