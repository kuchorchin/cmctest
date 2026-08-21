/* =====================================================================
   1. CONNECTION — replace these two lines, then save and reload.
      Supabase dashboard → Settings → API
   ===================================================================== */
const SUPABASE_URL = 'https://zgrctlzcawsamtyqbmhp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpncmN0bHpjYXdzYW10eXFibWhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyOTQ5NzAsImV4cCI6MjEwMjg3MDk3MH0.W_yGJzqVLD3k_WO2NXs4AVsQ8WlQ0zfnXdIJtX26_zQ';

/* ===================================================================== */

const CONFIGURED = !SUPABASE_URL.startsWith('PASTE_') && !SUPABASE_KEY.startsWith('PASTE_');
const sb = CONFIGURED ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const $ = s => document.querySelector(s);
const money = n => '$' + Math.round(Number(n)||0).toLocaleString('en-US');
const money2 = n => '$' + (Number(n)||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const initials = n => (n||'?').trim().split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase();
const esc = s => String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const wait = ms => new Promise(r=>setTimeout(r,ms));

function pad(n){ return String(n).padStart(2,'0'); }
function stamp(d){ d = new Date(d);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; }
function shortDate(d){ return new Date(d).toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'}); }
function shortTime(d){ return new Date(d).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}); }

function toast(msg, isErr){
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('err', !!isErr);
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(()=>t.classList.remove('show'), isErr ? 6000 : 2800);
}
/* Show the database's own words. When a rule blocks something you want to
   know exactly what it said, not a shrug. */
function fail(where, error){
  console.error(where, error);
  toast(where + ': ' + (error?.message || 'something went wrong'), true);
}

const STATE = {
  me:null, profiles:[], periods:[], summary:[],
  view:'overview', period:null, query:'', inspecting:null,
};

