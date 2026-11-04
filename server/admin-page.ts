/** The /_/ admin page: one self-contained HTML document, no libraries. */
export const ADMIN_PAGE = /* html */ `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Intent admin</title>
<style>
:root{--bg:#f4f5f8;--card:#fff;--ink:#1d1f2a;--soft:#5a5f70;--line:#e3e5ec;--brand:#6a4be0;--danger:#b4232a;--sand:#eef0f5}
@media (prefers-color-scheme:dark){:root{--bg:#14151b;--card:#1c1e26;--ink:#eef0f6;--soft:#a9aec0;--line:#2f3240;--brand:#a48cff;--danger:#f08a80;--sand:#1a1c24}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1040px;margin:0 auto;padding:24px 16px 64px}h1{font-size:22px;margin:0}h2{font-size:17px;margin:0 0 12px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:24px}.muted{color:var(--soft)}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:16px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}.stat b{display:block;font-size:22px;font-variant-numeric:tabular-nums}
.stat span{color:var(--soft);font-size:14px}button,.btn{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:10px;padding:8px 14px;cursor:pointer;text-decoration:none;display:inline-block}
button.primary,.btn.primary{background:var(--brand);border-color:var(--brand);color:#fff}button.danger{color:var(--danger)}
input{font:inherit;width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--ink);margin:6px 0 12px}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:8px 6px;border-bottom:1px solid var(--line);white-space:nowrap}
th{color:var(--soft);font-weight:600}.scroll{overflow-x:auto}.mono{font-family:ui-monospace,Menlo,monospace}.err{color:var(--danger);min-height:1.5em}
.auth{max-width:380px;margin:12vh auto}.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}[hidden]{display:none!important}
</style></head><body><main>
<section id="auth" class="auth card" hidden>
  <h1 id="auth-title">Intent admin</h1><p class="muted" id="auth-note"></p>
  <form id="auth-form"><label>Password<input id="pw" type="password" autocomplete="current-password" required minlength="8"></label>
  <p class="err" id="auth-err"></p><button class="primary" type="submit" id="auth-btn">Sign in</button></form>
</section>
<section id="app" hidden>
  <header><div><h1>Intent admin</h1><div class="muted" id="sub"></div></div>
  <div class="row"><a class="btn" href="/">Open app</a><a class="btn primary" href="/_/api/backup">Download backup</a><button id="logout">Sign out</button></div></header>
  <div class="card"><h2>Instance</h2><div class="grid" id="stats"></div></div>
  <div class="card"><h2>Users</h2><div class="scroll"><table><thead><tr><th>User</th><th>Account</th><th>Tasks</th><th>Memories</th><th>Last active</th><th></th></tr></thead><tbody id="users"></tbody></table></div></div>
  <div class="card"><h2>Recent requests</h2><div class="scroll"><table><thead><tr><th>Time</th><th>Method</th><th>Path</th><th>Status</th><th>ms</th></tr></thead><tbody id="logs"></tbody></table></div></div>
</section>
</main><script>
const $=s=>document.querySelector(s);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const api=(p,o={})=>fetch('/_/api/'+p,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...o});
const token=new URLSearchParams(location.hash.slice(1)).get('setup');
async function boot(){const s=await (await api('state')).json();if(s.authed)return show();$('#auth').hidden=false;
 if(s.setupNeeded){$('#auth-title').textContent='Set the admin password';$('#auth-btn').textContent='Save password';$('#pw').autocomplete='new-password';
  $('#auth-note').textContent=token?'First run. Choose a password of at least 8 characters.':'Open the setup link printed in the server log to create the admin password.';if(!token)$('#auth-form').hidden=true;}
 $('#auth-form').onsubmit=async e=>{e.preventDefault();const body=JSON.stringify(s.setupNeeded?{token,password:$('#pw').value}:{password:$('#pw').value});
  const r=await api(s.setupNeeded?'setup':'login',{method:'POST',body});if(r.ok){history.replaceState(null,'','/_/');$('#auth').hidden=true;show();}else $('#auth-err').textContent=(await r.json()).error||'Failed';};}
const ago=t=>{if(!t)return '';const s=(Date.now()-new Date(t))/1000;return s<60?'just now':s<3600?Math.round(s/60)+' min ago':s<86400?Math.round(s/3600)+' h ago':Math.round(s/86400)+' d ago'};
const dur=s=>s<3600?Math.round(s/60)+' min':s<86400?(s/3600).toFixed(1)+' h':(s/86400).toFixed(1)+' d';
async function show(){$('#app').hidden=false;const r=await api('stats');if(r.status===401)return location.reload();const s=await r.json();
 $('#sub').textContent='v'+s.version+' · '+s.runtime+' · '+s.platform+' · '+s.provider+' / '+s.model;
 const cards=[['Memory (RSS)',s.rssMB+' MB'],['Heap',s.heapMB+' MB'],['Uptime',dur(s.uptimeSec)],['Database',s.dbKB+' KB'],['Users',s.counts.users],['Accounts',s.counts.accounts],['Tasks',s.counts.things],['Timeline entries',s.counts.entries],['Memories',s.counts.memories]];
 $('#stats').innerHTML=cards.map(([k,v])=>'<div class="stat"><b>'+esc(v)+'</b><span>'+esc(k)+'</span></div>').join('');
 const users=await (await api('users')).json();
 $('#users').innerHTML=users.map(u=>'<tr><td class="mono">'+esc(u.userId.slice(0,10))+'…</td><td>'+esc(u.username||'—')+'</td><td>'+u.things+'</td><td>'+u.memories+'</td><td>'+esc(ago(u.lastActive))+'</td><td><button class="danger" data-id="'+esc(u.userId)+'">Delete</button></td></tr>').join('')||'<tr><td colspan="6" class="muted">No users yet.</td></tr>';
 document.querySelectorAll('[data-id]').forEach(b=>b.onclick=async()=>{if(b.dataset.confirm!=='1'){b.dataset.confirm='1';b.textContent='Confirm delete';return;}await api('users/'+b.dataset.id,{method:'DELETE'});show();});
 const logs=await (await api('logs')).json();
 $('#logs').innerHTML=logs.slice(0,100).map(l=>'<tr><td>'+esc(new Date(l.at).toLocaleTimeString())+'</td><td>'+esc(l.method)+'</td><td class="mono">'+esc(l.path)+'</td><td>'+l.status+'</td><td>'+l.ms+'</td></tr>').join('')||'<tr><td colspan="5" class="muted">No requests yet.</td></tr>';}
$('#logout').onclick=async()=>{await api('logout',{method:'POST'});location.reload();};
setInterval(()=>{if(!$('#app').hidden)show();},15000);boot();
</script></body></html>`;
