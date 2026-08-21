/* =====================================================================
   8. TEAM
   ===================================================================== */
function viewTeam(){
  const pid = STATE.period, per = periodById(pid);
  setHead('Team', `Everyone side by side for ${per?.label||'—'}. Click a name to open their dashboard.`);
  const rows = reps().map(r=>({r, ...totals(r.id,pid), tim:timing(r.id), sub:rowsFor(r.id,pid)[0]}))
    .sort((a,b)=>b.commission-a.commission);
  const allTime = reps().map(r=>({r,c:totals(r.id,null).commission})).sort((a,b)=>b.c-a.c);
  const maxC = allTime[0]?.c || 1;
  const lateRows = reps().map(r=>({r,...timing(r.id)})).sort((a,b)=>b.late-a.late);
  const maxT = Math.max(...lateRows.map(x=>x.total),1);

  $('#views').innerHTML = `
    <div class="card">
      <div class="card-head"><h3>Sales staff</h3><div class="right"><span class="eyebrow">${reps().length} people</span></div></div>
      ${!rows.length ? emptyState('Nobody here yet','Invite people from your Supabase dashboard, then set their rate under Settings.') : `
      <table><thead><tr><th>Person</th><th>Rate</th><th>This period</th><th>Sales</th><th>On time</th><th>Commission</th></tr></thead>
      <tbody>${rows.map(x=>`<tr>
        <td><button class="cell-person" data-open="${x.r.id}"><span class="avatar">${initials(x.r.full_name)}</span>
          <span><b style="font-weight:500;display:block">${esc(x.r.full_name)}</b>
          <small style="color:var(--muted);font-size:11.5px">${esc(x.r.job_title)}</small></span></button></td>
        <td class="num">${(Number(x.r.commission_rate)*100).toFixed(1)}%</td>
        <td>${x.sub ? (x.sub.is_late ? `<span class="badge late">Late ${x.sub.days_late}d</span>` : '<span class="badge ok">On time</span>')
                    : '<span class="badge bad">Not submitted</span>'}</td>
        <td class="num">${money(x.sales)}</td><td class="num">${x.tim.pct}%</td>
        <td class="num"><b>${money(x.commission)}</b></td></tr>`).join('')}</tbody></table>`}
    </div>
    <div class="grid g2">
      <div class="card"><div class="card-head"><h3>Commission, all periods</h3></div>
        ${allTime.map(x=>`<div class="bar-row">
          <div class="who-line"><span class="avatar" style="width:24px;height:24px;font-size:9.5px">${initials(x.r.full_name)}</span>${esc(x.r.full_name)}</div>
          <div class="amt">${money(x.c)}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${(x.c/maxC*100).toFixed(1)}%"></div></div></div>`).join('') || emptyState('No data yet','')}
      </div>
      <div class="card"><div class="card-head"><h3>Late files by person</h3></div>
        ${lateRows.map(x=>`<div class="bar-row">
          <div class="who-line"><span class="avatar" style="width:24px;height:24px;font-size:9.5px">${initials(x.r.full_name)}</span>${esc(x.r.full_name)}</div>
          <div class="amt">${x.late} late · ${x.total} files</div>
          <div class="bar-track"><div class="bar-fill" style="width:${(x.late/maxT*100).toFixed(1)}%;background:var(--taupe)"></div></div></div>`).join('') || emptyState('No data yet','')}
      </div>
    </div>`;
  document.querySelectorAll('[data-open]').forEach(b=>{
    b.onclick = () => { STATE.inspecting = b.dataset.open; renderView(); };
  });
}

