/* =====================================================================
   9. SUBMISSIONS
   ===================================================================== */
function viewSubmissions(){
  const owner = isOwner();
  let list = STATE.summary.slice().sort((a,b)=>new Date(b.submitted_at)-new Date(a.submitted_at));
  const q = STATE.query.trim().toLowerCase();
  if(q) list = list.filter(r => r.file_name.toLowerCase().includes(q) || (r.full_name||'').toLowerCase().includes(q));
  const op = openPeriod();
  const missing = owner && op ? missingFor(op.id) : [];

  setHead(owner ? 'Submissions' : 'My submissions',
    owner ? 'Every file received, with the timestamp the server recorded.'
          : 'Every file you have sent, with the timestamp the server recorded.');

  $('#views').innerHTML = `
    ${missing.length ? `<div class="note"><b>${missing.length} file${missing.length===1?'':'s'} outstanding for ${esc(op.label)}.</b>
      <span>${esc(missing.map(m=>m.full_name).join(', '))} — due ${shortDate(op.due_at)}.</span></div>` : ''}
    <div class="card">
      <div class="card-head"><h3>${list.length} file${list.length===1?'':'s'}${q?` matching "${esc(q)}"`:''}</h3>
        <div class="right"><span class="eyebrow">Server-recorded</span></div></div>
      ${list.length ? fileTable(list, owner)
        : emptyState('Nothing here yet', owner?'Files appear the moment someone submits one.':'Submit a file and it will be listed here.')}
    </div>`;
  wireDownloads();
}

function fileTable(list, showPerson){
  if(!list.length) return emptyState('Nothing yet','');
  return `<table><thead><tr>
    ${showPerson?'<th>Person</th>':''}<th>File</th><th>Period</th><th>Received</th><th>Timing</th><th>Commission</th></tr></thead>
    <tbody>${list.map(r=>`<tr>
      ${showPerson?`<td><span class="cell-person"><span class="avatar">${initials(r.full_name)}</span>${esc(r.full_name)}</span></td>`:''}
      <td><button class="dl" data-path="${esc(r.file_path)}" style="font-weight:500;text-align:left;text-decoration:underline;text-underline-offset:3px">${esc(r.file_name)}</button>
        <div class="mono" style="color:var(--muted);margin-top:2px">${Math.max(1,Math.round(r.file_size/1024))} KB · ${r.row_count} rows${r.status==='needs_review'?' · needs review':''}</div></td>
      <td>${esc(periodById(r.period_id)?.label || r.period_id)}</td>
      <td class="mono">${stamp(r.submitted_at)}</td>
      <td>${r.is_late?`<span class="badge late">Late ${r.days_late}d</span>`:'<span class="badge ok">On time</span>'}</td>
      <td class="num"><b>${money(r.commission)}</b></td></tr>`).join('')}</tbody></table>`;
}

function wireDownloads(){
  document.querySelectorAll('.dl').forEach(b=>{
    b.onclick = async () => {
      const { data, error } = await sb.storage.from('submissions').createSignedUrl(b.dataset.path, 60);
      if(error) return fail('Opening the file', error);
      window.open(data.signedUrl, '_blank');
    };
  });
}

