/* =====================================================================
   3. LOADING
      Every query below is filtered by the database, not by this file.
      A rep asking for all profiles gets exactly one row back.
   ===================================================================== */
async function loadAll(){
  const { data:{ user } } = await sb.auth.getUser();
  if(!user){ showLogin(); return; }

  const [prof, per, sum] = await Promise.all([
    sb.from('profiles').select('*').order('full_name'),
    sb.from('periods').select('*').order('id', { ascending:false }),
    sb.from('commission_summary').select('*'),
  ]);
  if(prof.error) return fail('Loading people', prof.error);
  if(per.error)  return fail('Loading periods', per.error);
  if(sum.error)  return fail('Loading numbers', sum.error);

  STATE.profiles = prof.data || [];
  STATE.periods  = per.data || [];
  STATE.summary  = sum.data || [];
  STATE.me = STATE.profiles.find(p => p.id === user.id);

  if(!STATE.me){
    $('#views').innerHTML = `<div class="card"><div class="empty">
      <b>Your account has no profile yet</b>
      Ask the owner to check the setup — the trigger that creates profiles may not have run for you.</div></div>`;
    return;
  }
  if(!STATE.me.is_active){
    $('#views').innerHTML = `<div class="card"><div class="empty">
      <b>This account has been deactivated</b>Speak to the owner.</div></div>`;
    return;
  }

  if(!STATE.period){
    const open = STATE.periods.find(p => p.is_open);
    STATE.period = open ? open.id : (STATE.periods[0]?.id || null);
  }
  renderApp();
}

const isOwner = () => STATE.me?.role === 'owner';
const openPeriod = () => STATE.periods.find(p => p.is_open) || null;
const periodById = id => STATE.periods.find(p => p.id === id);
const nameOf = id => STATE.profiles.find(p=>p.id===id)?.full_name || 'Unknown';
const reps = () => STATE.profiles.filter(p => p.role === 'rep' && p.is_active);
const staff = () => STATE.profiles.filter(p => p.is_active);

function rowsFor(userId, periodId){
  return STATE.summary.filter(r =>
    (!userId || r.user_id === userId) && (!periodId || r.period_id === periodId));
}
function totals(userId, periodId){
  const list = rowsFor(userId, periodId);
  return {
    sales: list.reduce((a,r)=>a+Number(r.sales_total||0),0),
    commission: list.reduce((a,r)=>a+Number(r.commission||0),0),
    files: list.length,
    deals: list.reduce((a,r)=>a+Number(r.row_count||0),0),
  };
}
function timing(userId){
  const list = rowsFor(userId, null);
  const late = list.filter(r=>r.is_late).length;
  return { total:list.length, late, onTime:list.length-late,
           pct: list.length ? Math.round((list.length-late)/list.length*100) : 0 };
}
/* periods worth charting: past or present, oldest first, last 12 */
function chartPeriods(){
  const now = Date.now();
  return STATE.periods
    .filter(p => new Date(p.due_at).getTime() <= now || rowsFor(null,p.id).length)
    .sort((a,b)=> a.id < b.id ? -1 : 1)
    .slice(-12);
}
function missingFor(periodId){
  return reps().filter(r => !rowsFor(r.id, periodId).length);
}

