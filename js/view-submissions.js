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
  wireRemovals();
}

function fileTable(list, showPerson){
  if(!list.length) return emptyState('Nothing yet','');
  /* A rep may take back their own file; the owner may remove anybody's.
     This mirrors the database rule — the button is only ever the shortcut. */
  const canRemove = r => isOwner() || r.user_id === STATE.me.id;

  return `<table><thead><tr>
    ${showPerson?'<th>Person</th>':''}<th>File</th><th>Period</th><th>Received</th><th>Timing</th><th>Commission</th><th></th></tr></thead>
    <tbody>${list.map(r=>`<tr data-sub="${esc(r.submission_id)}">
      ${showPerson?`<td><span class="cell-person"><span class="avatar">${initials(r.full_name)}</span>${esc(r.full_name)}</span></td>`:''}
      <td><button class="dl" data-path="${esc(r.file_path)}" style="font-weight:500;text-align:left;text-decoration:underline;text-underline-offset:3px">${esc(r.file_name)}</button>
        <div class="mono" style="color:var(--muted);margin-top:2px">${Math.max(1,Math.round(r.file_size/1024))} KB · ${r.row_count} rows${r.status==='needs_review'?' · needs review':''}</div></td>
      <td>${esc(periodById(r.period_id)?.label || r.period_id)}</td>
      <td class="mono">${stamp(r.submitted_at)}</td>
      <td>${r.is_late?`<span class="badge late">Late ${r.days_late}d</span>`:'<span class="badge ok">On time</span>'}</td>
      <td class="num"><b>${money(r.commission)}</b></td>
      <td>${canRemove(r) ? `<button class="btn ghost small rm" data-sub="${esc(r.submission_id)}"
        data-path="${esc(r.file_path)}" data-name="${esc(r.file_name)}">Remove</button>` : ''}</td>
      </tr>`).join('')}</tbody></table>`;
}

/* Two clicks, not a browser dialog: the first arms the button, the second
   does it. Clicking anywhere else disarms. Deleting a submission takes its
   sale rows with it, so the commission total moves immediately. */
function wireRemovals(){
  document.querySelectorAll('.rm').forEach(btn=>{
    btn.onclick = async (e) => {
      e.stopPropagation();
      if(btn.dataset.armed !== '1'){
        document.querySelectorAll('.rm').forEach(disarm);
        btn.dataset.armed = '1';
        btn.textContent = 'Remove for good?';
        btn.style.background = 'var(--bad-bg)';
        btn.style.borderColor = 'var(--bad)';
        btn.style.color = 'var(--bad)';
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Removing…';
      const { error } = await sb.from('submissions').delete().eq('id', btn.dataset.sub);
      if(error){ btn.disabled = false; disarm(btn); return fail('Removing the file', error); }
      /* the row is gone either way; a leftover file in storage is not worth
         blocking the user over, so this failure only gets logged */
      const gone = await sb.storage.from('submissions').remove([btn.dataset.path]);
      if(gone.error) console.warn('Stored file left behind:', gone.error.message);
      toast(`Removed ${btn.dataset.name}`);
      await loadAll();
    };
  });
  document.addEventListener('click', () => document.querySelectorAll('.rm[data-armed="1"]').forEach(disarm), { once:true });
}
function disarm(btn){
  if(btn.dataset.armed !== '1') return;
  btn.dataset.armed = '0';
  btn.textContent = 'Remove';
  btn.style.background = '';
  btn.style.borderColor = '';
  btn.style.color = '';
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

