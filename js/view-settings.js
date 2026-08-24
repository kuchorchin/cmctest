/* =====================================================================
   10. SETTINGS (owner only)
   ===================================================================== */
function viewSettings(){
  setHead('Settings', 'Rates, roles and deadlines. Everything here recalculates the dashboards.');
  $('#views').innerHTML = `
    <div class="card">
      <div class="card-head"><h3>People</h3><div class="right"><span class="eyebrow">${staff().length} active accounts</span></div></div>
      <table><thead><tr><th>Name</th><th>Job title</th><th>Rate %</th><th>Role</th><th></th></tr></thead>
        <tbody>${STATE.profiles.map(p=>`<tr data-row="${p.id}">
          <td><span class="cell-person"><span class="avatar">${initials(p.full_name)}</span>
            <input class="mini wide" data-f="full_name" value="${esc(p.full_name)}"></span></td>
          <td><input class="mini wide" data-f="job_title" value="${esc(p.job_title)}"></td>
          <td><input class="mini num" type="number" step="0.1" min="0" max="100" data-f="rate" value="${(Number(p.commission_rate)*100).toFixed(1)}"></td>
          <td><select class="mini wide" data-f="role">
            <option value="rep" ${p.role==='rep'?'selected':''}>Sales</option>
            <option value="owner" ${p.role==='owner'?'selected':''}>Owner</option></select></td>
          <td><button class="btn ghost small save-person">Save</button>
            ${p.id===STATE.me.id?'<div class="eyebrow" style="margin-top:4px">you</div>':''}</td>
        </tr>`).join('')}</tbody></table>
      <div class="note" style="margin-top:16px"><span><b>To add someone:</b> invite them from your Supabase dashboard under
        Authentication &rarr; Users &rarr; Invite. They arrive here as a sales account. Only you can change a role —
        if an employee edits their own role in their browser, the database puts it straight back.</span></div>
    </div>

    <div class="card">
      <div class="card-head"><h3>Periods and deadlines</h3></div>
      <table><thead><tr><th>Period</th><th>Deadline</th><th>People in</th><th>Status</th><th></th></tr></thead>
        <tbody>${STATE.periods.slice(0,14).map(p=>`<tr data-period="${p.id}">
          <td><b style="font-weight:500">${esc(p.label)}</b><div class="mono" style="color:var(--muted)">${p.id}</div></td>
          <td><input class="mini wide" type="datetime-local" data-f="due" value="${toLocalInput(p.due_at)}"></td>
          <td class="num">${new Set(rowsFor(null,p.id).map(r=>r.user_id)).size} of ${reps().length}<div class="mono" style="color:var(--muted)">${rowsFor(null,p.id).length} file${rowsFor(null,p.id).length===1?'':'s'}</div></td>
          <td>${p.is_open?'<span class="badge ok">Open</span>':'<span class="badge neutral">Closed</span>'}</td>
          <td><button class="btn ghost small save-period">Save</button>
            <button class="btn ghost small toggle-period" style="margin-left:6px">${p.is_open?'Close':'Open'}</button></td>
        </tr>`).join('')}</tbody></table>
      <div class="note" style="margin-top:16px"><span>Only an open period accepts uploads. Closing one freezes its numbers —
        employees can no longer add or replace files for it.</span></div>
    </div>

    <div class="card">
      <div class="card-head"><h3>What a sales file needs</h3></div>
      <p style="color:var(--ink-2);font-size:13px;margin-bottom:14px">These headings are what the reader looks for. Extra columns are ignored.</p>
      <table><thead><tr><th>Column</th><th>Required</th><th>Also accepts</th></tr></thead><tbody>
        <tr><td><b>Date</b></td><td>Yes</td><td class="mono">sale date, closed</td></tr>
        <tr><td><b>Customer</b></td><td>Yes</td><td class="mono">client, account</td></tr>
        <tr><td><b>Sale Amount</b></td><td>Yes</td><td class="mono">amount, sale, total, revenue</td></tr>
        <tr><td><b>Commission Rate</b></td><td>No</td><td class="mono">rate — otherwise the person's rate is used</td></tr>
      </tbody></table>
      <div style="margin-top:16px"><button class="btn ghost small" id="dlTemplate">Download the template</button></div>
    </div>`;

  document.querySelectorAll('.save-person').forEach(btn=>{
    btn.onclick = async () => {
      const tr = btn.closest('tr'), id = tr.dataset.row;
      const g = f => tr.querySelector(`[data-f="${f}"]`).value;
      const rate = parseFloat(g('rate'));
      if(isNaN(rate) || rate < 0 || rate > 100) return toast('Rate must be between 0 and 100.', true);
      btn.disabled = true;
      const { error } = await sb.from('profiles').update({
        full_name: g('full_name').trim(),
        job_title: g('job_title').trim(),
        commission_rate: rate/100,
        role: g('role'),
      }).eq('id', id);
      btn.disabled = false;
      if(error) return fail('Saving', error);
      toast('Saved');
      await loadAll();
    };
  });
  document.querySelectorAll('.save-period').forEach(btn=>{
    btn.onclick = async () => {
      const tr = btn.closest('tr'), id = tr.dataset.period;
      const val = tr.querySelector('[data-f="due"]').value;
      if(!val) return toast('Pick a date and time.', true);
      btn.disabled = true;
      const { error } = await sb.from('periods').update({ due_at: new Date(val).toISOString() }).eq('id', id);
      btn.disabled = false;
      if(error) return fail('Saving the deadline', error);
      toast('Deadline updated');
      await loadAll();
    };
  });
  document.querySelectorAll('.toggle-period').forEach(btn=>{
    btn.onclick = async () => {
      const id = btn.closest('tr').dataset.period;
      const p = periodById(id);
      btn.disabled = true;
      const { error } = await sb.from('periods').update({ is_open: !p.is_open }).eq('id', id);
      btn.disabled = false;
      if(error) return fail('Changing the period', error);
      await loadAll();
    };
  });
  $('#dlTemplate').onclick = downloadTemplate;
}
function toLocalInput(iso){
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const TEMPLATE_CSV = `Date,Customer,Product,Sale Amount
2026-08-04,Northwind Traders,Starter package,4250
2026-08-06,Oakfield Clinic,Annual plan,11800
2026-08-13,Meridian Freight,Fleet bundle,14900`;
function downloadTemplate(){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([TEMPLATE_CSV], {type:'text/csv'}));
  a.download = 'sales-template.csv'; a.click();
  URL.revokeObjectURL(a.href);
  toast('Template downloaded');
}

