/* =====================================================================
   2. AUTH
   ===================================================================== */
async function boot(){
  if(!CONFIGURED){ $('#setup').classList.remove('hidden'); return; }
  const { data:{ session } } = await sb.auth.getSession();
  session ? enterApp() : showLogin();
  sb.auth.onAuthStateChange((event) => {
    if(event === 'SIGNED_OUT') showLogin();
  });
}
function showLogin(){
  $('#app').classList.add('hidden');
  $('#login').classList.remove('hidden');
}
$('#signIn').onclick = async () => {
  const btn = $('#signIn');
  const email = $('#email').value.trim(), password = $('#password').value;
  if(!email || !password){ loginAlert('Enter your email and password.'); return; }
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Signing in';
  const { error } = await sb.auth.signInWithPassword({ email, password });
  btn.disabled = false; btn.textContent = 'Sign in';
  if(error){ loginAlert(error.message); return; }
  loginAlert('');
  enterApp();
};
$('#password').addEventListener('keydown', e => { if(e.key==='Enter') $('#signIn').click(); });
$('#email').addEventListener('keydown', e => { if(e.key==='Enter') $('#password').focus(); });

$('#forgot').onclick = async () => {
  const email = $('#email').value.trim();
  if(!email){ loginAlert('Type your email above first, then press this.'); return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href });
  loginAlert(error ? error.message : 'Check your inbox for a reset link.', !error);
};
function loginAlert(msg, good){
  $('#loginAlert').innerHTML = msg ? `<div class="alert${good?' good':''}">${esc(msg)}</div>` : '';
}
$('#signOut').onclick = async () => { await sb.auth.signOut(); location.reload(); };

async function enterApp(){
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  await loadAll();
}

