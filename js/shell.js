/* =====================================================================
   5. SHELL
   ===================================================================== */
function navItems(){
  return isOwner()
    ? [{id:'overview',label:'Overview'},{id:'team',label:'Team'},
       {id:'submissions',label:'Submissions'},{id:'settings',label:'Settings'}]
    : [{id:'overview',label:'My dashboard'},{id:'submit',label:'Submit a file'},
       {id:'submissions',label:'My submissions'}];
}
function renderApp(){
  const me = STATE.me;
  $('#meAvatar').textContent = initials(me.full_name);
  $('#meName').textContent = me.full_name;
  $('#meRole').textContent = isOwner() ? 'Owner · full access' : 'Sees own data only.';
  $('#orgLine').textContent = isOwner() ? `${staff().length} accounts` : me.job_title;

  $('#periodSel').innerHTML = STATE.periods.map(p =>
    `<option value="${p.id}" ${p.id===STATE.period?'selected':''}>${esc(p.label)}${p.is_open?' · open':''}</option>`).join('');
  $('#periodSel').onchange = e => { STATE.period = e.target.value; renderView(); };

  const op = openPeriod();
  const iOwe = !isOwner() && op && !rowsFor(me.id, op.id).length;
  const owed = isOwner() && op ? missingFor(op.id) : [];

  $('#nav').innerHTML = navItems().map(n=>`<button class="nav-item" data-view="${n.id}" aria-current="${n.id===STATE.view}">
    ${n.label}${(n.id==='submit'&&iOwe)||(n.id==='submissions'&&owed.length)?'<span class="dot"></span>':''}</button>`).join('');
  $('#nav').querySelectorAll('.nav-item').forEach(b=>{
    b.onclick = () => { STATE.view = b.dataset.view; STATE.inspecting = null; renderApp(); };
  });

  $('#sidePeriod').innerHTML = op ? `<span class="eyebrow">Open period</span><b>${esc(op.label)}</b>
    <small>Due ${shortDate(op.due_at)} at ${new Date(op.due_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}.
    ${isOwner() ? (owed.length ? `${owed.length} outstanding.` : 'All files are in.')
                : (iOwe ? 'Yours is not in yet.' : 'Yours is in.')}</small>`
    : `<span class="eyebrow">No open period</span><b>Nothing to collect</b>
       <small>${isOwner()?'Open one under Settings.':'The owner has not opened a period.'}</small>`;

  $('#search').value = STATE.query;
  $('#search').oninput = e => { STATE.query = e.target.value; if(STATE.view==='submissions') renderView(); };
  renderView();
}
function setHead(t,s){ $('#viewTitle').textContent = t; $('#viewSub').textContent = s; }
function renderView(){
  const v = STATE.view;
  if(v==='overview')         isOwner() ? viewOwnerOverview() : viewPerson(STATE.me.id, false);
  else if(v==='team')        STATE.inspecting ? viewPerson(STATE.inspecting, true) : viewTeam();
  else if(v==='submissions') viewSubmissions();
  else if(v==='settings')    viewSettings();
  else if(v==='submit')      viewSubmit();
  $('#periodSel').value = STATE.period || '';
  wireGoto();
}
function wireGoto(){
  document.querySelectorAll('[data-goto]').forEach(b=>{
    b.onclick = () => { STATE.view = b.dataset.goto; STATE.inspecting = null; renderApp(); };
  });
  document.querySelectorAll('[data-back]').forEach(b=>{
    b.onclick = () => { STATE.inspecting = null; renderApp(); };
  });
}

