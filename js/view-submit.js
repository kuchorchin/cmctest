/* =====================================================================
   11. SUBMIT — Phase 1 and Phase 2
   ===================================================================== */
function viewSubmit(){
  const op = openPeriod();
  if(!op){
    setHead('Submit a file','');
    $('#views').innerHTML = `<div class="card">${emptyState('No period is open right now','The owner opens a period when it is time to collect files.')}</div>`;
    return;
  }
  const existing = rowsFor(STATE.me.id, op.id)[0];
  setHead('Submit a file', `${op.label} · due ${shortTime(op.due_at)}.`);

  $('#views').innerHTML = `
    <div class="grid g-2-1">
      <div class="card">
        <div class="card-head"><h3>${existing?'Replace your file':'Upload your sales file'}</h3>
          <div class="right"><span class="eyebrow">${esc(op.label)}</span></div></div>
        ${existing ? `<div class="note" style="margin-bottom:14px"><b>You already submitted ${esc(existing.file_name)}.</b>
          <span>Uploading again replaces it, and the clock starts over — the new time is what counts.</span></div>` : ''}
        <div class="drop" id="drop">
          <h4>Drop your file here</h4>
          <p>.csv or .xlsx — one row per sale</p>
          <div class="drop-actions">
            <button class="btn small" id="pick">Choose a file</button>
            <button class="btn ghost small" id="tmpl">Download the template</button>
          </div>
          <input type="file" id="file" accept=".csv,.xlsx,.xls" hidden>
        </div>
        <div id="result"></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>What happens next</h3></div>
        <div class="steps">
          <div class="step" data-step="1"><div class="step-dot">1</div><div><b>File read</b><small>Your sale rows are pulled out here in your browser.</small></div></div>
          <div class="step" data-step="2"><div class="step-dot">2</div><div><b>Original stored</b><small>The untouched file is kept, so anything can be checked later.</small></div></div>
          <div class="step" data-step="3"><div class="step-dot">3</div><div><b>Time recorded</b><small>The server writes the timestamp and decides on time or late.</small></div></div>
          <div class="step" data-step="4"><div class="step-dot">4</div><div><b>Total updated</b><small>Your commission moves on your dashboard.</small></div></div>
        </div>
      </div>
    </div>`;

  const drop = $('#drop'), input = $('#file');
  $('#pick').onclick = () => input.click();
  $('#tmpl').onclick = downloadTemplate;
  input.onchange = e => { if(e.target.files[0]) submitFile(e.target.files[0], op); };
  ['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('over')}));
  ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('over')}));
  drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if(f) submitFile(f, op); });
}
function lightStep(n){ const el = document.querySelector(`.step[data-step="${n}"]`); if(el) el.classList.add('on'); }

async function submitFile(file, period){
  const me = STATE.me, result = $('#result');
  document.querySelectorAll('.step').forEach(s=>s.classList.remove('on'));
  result.innerHTML = `<div class="loading"><div class="spinner"></div>Reading ${esc(file.name)}…</div>`;

  // --- read the file ---
  let parsed;
  try { parsed = await readFile(file); }
  catch(err){
    result.innerHTML = `<div class="alert" style="margin-top:14px">${esc(err.message)}
      <div style="margin-top:10px"><button class="btn ghost small" id="tmpl2">Download the template</button></div></div>`;
    $('#tmpl2').onclick = downloadTemplate;
    return;
  }
  lightStep(1);

  const salesTotal = parsed.rows.reduce((a,r)=>a+r.amount,0);
  const before = totals(me.id, null).commission;

  // --- store the original file ---
  const safe = file.name.replace(/[^\w.\-]+/g,'_');
  const path = `${me.id}/${period.id}/${Date.now()}-${safe}`;
  const up = await sb.storage.from('submissions').upload(path, file, { upsert:false });
  if(up.error) return failResult(result, 'Uploading the file', up.error);
  lightStep(2);

  // --- replace any earlier submission for this period ---
  const old = rowsFor(me.id, period.id)[0];
  if(old){
    const del = await sb.from('submissions').delete().eq('id', old.submission_id);
    if(del.error) return failResult(result, 'Replacing your earlier file', del.error);
    await sb.storage.from('submissions').remove([old.file_path]);
  }

  // --- record it. the server sets who, when, and late. ---
  const ins = await sb.from('submissions').insert({
    user_id: me.id,
    period_id: period.id,
    file_name: file.name,
    file_path: path,
    file_size: file.size,
    row_count: parsed.rows.length,
    sales_total: salesTotal,
    status: parsed.rows.length ? 'read' : 'needs_review',
  }).select().single();
  if(ins.error) return failResult(result, 'Recording your submission', ins.error);
  const sub = ins.data;
  lightStep(3);

  // --- write the rows, in batches ---
  const payload = parsed.rows.map(r => ({
    submission_id: sub.id, user_id: me.id, period_id: period.id,
    sale_date: r.date ? r.date.toISOString().slice(0,10) : null,
    customer: r.customer || null, amount: r.amount, rate: r.rate,
  }));
  for(let i=0;i<payload.length;i+=400){
    const chunk = await sb.from('sale_rows').insert(payload.slice(i,i+400));
    if(chunk.error) return failResult(result, 'Saving the sale rows', chunk.error);
  }
  lightStep(4);

  await loadAll();
  const after = totals(me.id, null).commission;

  result.innerHTML = `
    <div class="receipt"><span class="eyebrow">Submission receipt</span><div class="mono">
      <div class="receipt-line"><span>who</span><span>${esc(me.full_name)}</span></div>
      <div class="receipt-line"><span>what</span><span>${esc(file.name)} · ${Math.max(1,Math.round(file.size/1024))} KB</span></div>
      <div class="receipt-line"><span>when</span><span>${stamp(sub.submitted_at)}</span></div>
      <div class="receipt-line"><span>due</span><span>${stamp(period.due_at)}</span></div>
      <div class="receipt-line"><span>timing</span><span>${sub.is_late?'LATE by '+sub.days_late+' day'+(sub.days_late===1?'':'s'):'ON TIME'}</span></div>
      <div class="receipt-line"><span>rows</span><span>${parsed.rows.length} read</span></div>
      <div class="receipt-line"><span>ref</span><span>${sub.id}</span></div>
    </div></div>
    <div class="card" style="margin-top:14px;padding:16px;background:var(--paper)">
      <div class="card-head"><h3>Read from your file</h3>
        <div class="right"><span class="eyebrow">${parsed.rows.length} rows</span></div></div>
      <table><thead><tr><th>Date</th><th>Customer</th><th>Sale</th></tr></thead><tbody>
        ${parsed.rows.slice(0,6).map(r=>`<tr>
          <td class="mono">${r.date?r.date.toLocaleDateString('en-US',{month:'short',day:'2-digit'}):'—'}</td>
          <td>${esc(r.customer||'—')}</td><td class="num">${money(r.amount)}</td></tr>`).join('')}
        ${parsed.rows.length>6?`<tr><td colspan="3" style="color:var(--muted)">+ ${parsed.rows.length-6} more rows</td></tr>`:''}
        <tr><td colspan="2"><b>Sales in this file</b></td><td class="num"><b>${money(salesTotal)}</b></td></tr>
      </tbody></table>
      <div class="note" style="margin-top:14px;background:#fff"><span><b>Running total updated.</b>
        Your commission went from ${money(before)} to <b>${money(after)}</b>.
        <button class="btn small" data-goto="overview" style="margin-left:8px">See my dashboard</button></span></div>
    </div>`;
  wireGoto();
  toast(sub.is_late ? `Recorded — late by ${sub.days_late} days` : 'Recorded — on time');
}

function failResult(el, where, error){
  fail(where, error);
  el.innerHTML = `<div class="alert" style="margin-top:14px"><b>${esc(where)} failed.</b><br>${esc(error.message)}</div>`;
}

