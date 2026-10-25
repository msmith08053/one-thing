// One Thing — app logic
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { CONFIG } from './config.js';

// ---------- Small helpers ----------------------------------------------------
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const main = () => $('#main');
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const PRI = { 0: 'Low', 1: 'Normal', 2: 'High' };

function parseDay(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function fmtDay(s, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
  return parseDay(s).toLocaleDateString(undefined, opts);
}
function dueLabel(due, today) {
  if (!due) return '';
  const diff = Math.round((parseDay(due) - parseDay(today)) / 86400000);
  if (diff < 0) return `<span class="badge red">Overdue</span>`;
  if (diff === 0) return `<span class="badge amber">Due today</span>`;
  if (diff === 1) return `<span class="badge amber">Due tomorrow</span>`;
  return `<span class="badge">Due ${esc(fmtDay(due))}</span>`;
}
function localISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let toastTimer;
function toast(msg, action) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ''}`;
  t.hidden = false;
  if (action) t.querySelector('button').onclick = () => { t.hidden = true; action.run(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, action ? 6000 : 3000);
}

// ---------- State ------------------------------------------------------------
const S = {
  status: null,       // { setup, member, person, names, add_pref }
  board: null,        // from get_board()
  tab: 'today',
  allFilter: 'open',
  addOwner: null,
  addPri: 1,
};
const me = () => S.status?.person;                       // 'p1' | 'p2' | 'shared'
const isPerson = (p) => p === 'p1' || p === 'p2';
const nameOf = (p) => p === 'both' ? 'Both of us' : (S.status?.names?.[p] ?? p);
const other = (p) => (p === 'p1' ? 'p2' : 'p1');

// ---------- Boot -------------------------------------------------------------
let sb;

async function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

  if (!CONFIG.SUPABASE_URL || CONFIG.SUPABASE_URL.includes('YOUR-') || CONFIG.SUPABASE_KEY.includes('YOUR-')) {
    main().innerHTML = `<div class="panel"><h1>Almost there</h1><p>Open <code>config.js</code> and paste in your Supabase URL and key (setup guide, step 6).</p></div>`;
    return;
  }
  sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    const { error } = await sb.auth.signInAnonymously();
    if (error) {
      main().innerHTML = `<div class="panel"><h1>Can't sign in</h1><p>${esc(error.message)}</p>
        <p class="muted">In Supabase, turn on <b>Allow anonymous sign-ins</b> (setup guide, step 1).</p></div>`;
      return;
    }
  }
  await refreshStatus();
  if (!S.status.setup) return renderSetup();
  if (!S.status.member) return renderJoin();
  startApp();
}

async function refreshStatus() {
  const { data, error } = await sb.rpc('household_status');
  if (error) throw error;
  S.status = data;
}

async function rpc(fn, args) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) { toast(error.message); throw error; }
  if (data?.error) { toast(data.error); return null; }
  return data;
}

async function notify(body) {
  try { await sb.functions.invoke('notify', { body }); } catch (e) { console.warn('notify failed', e); }
}

// ---------- First run: set up / join ----------------------------------------
function renderSetup() {
  main().innerHTML = `
  <div class="panel">
    <h1>One Thing</h1>
    <p class="lead">One task each, every day.</p>
    <form id="setupForm" class="stack">
      <h2>Set up your household</h2>
      <label>Your name<input name="n1" required autocomplete="given-name"></label>
      <label>Your partner's name<input name="n2" required></label>
      <label>Household passcode <span class="muted">(6+ characters; your partner uses it to join)</span>
        <input name="pass" type="password" minlength="6" required autocomplete="new-password"></label>
      <button class="primary" type="submit">Create household</button>
    </form>
    <p class="muted small">Already set up on another phone? <a href="#" id="toJoin">Join instead</a></p>
  </div>`;
  $('#toJoin').onclick = (e) => { e.preventDefault(); renderJoin(); };
  $('#setupForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const r = await rpc('setup_household', { p_passcode: f.get('pass'), p_name1: f.get('n1'), p_name2: f.get('n2'), p_me: 'p1' });
    if (r) { S.status = r; startApp(); }
  };
}

function renderJoin() {
  main().innerHTML = `
  <div class="panel">
    <h1>One Thing</h1>
    <form id="joinForm" class="stack">
      <h2>Join your household</h2>
      <label>Household passcode<input name="pass" type="password" required autocomplete="current-password"></label>
      <button class="primary" type="submit">Join</button>
    </form>
  </div>`;
  $('#joinForm').onsubmit = async (e) => {
    e.preventDefault();
    const r = await rpc('join_household', { p_passcode: new FormData(e.target).get('pass'), p_person: 'shared' });
    if (r) { S.status = r; renderWho(true); }
  };
}

function renderWho(first) {
  main().innerHTML = `
  <div class="panel stack">
    <h2>Who uses this device?</h2>
    <button class="big" data-p="p1">${esc(nameOf('p1'))}</button>
    <button class="big" data-p="p2">${esc(nameOf('p2'))}</button>
    <button class="big ghost" data-p="shared">Shared screen (wall display)</button>
  </div>`;
  main().querySelectorAll('[data-p]').forEach((b) => b.onclick = async () => {
    const r = await rpc('set_person', { p_person: b.dataset.p });
    if (r) { S.status = r; first ? startApp() : (S.tab = 'settings', render()); }
  });
}

// ---------- Main app ---------------------------------------------------------
let started = false;
function startApp() {
  $('#tabs').hidden = false;
  if (!started) {
    started = true;
    $('#tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]'); if (!b) return;
      S.tab = b.dataset.tab; render();
    });
    main().addEventListener('click', onMainClick);

    // Live sync: any change to tasks or picks → reload the board.
    let t;
    const reload = () => { clearTimeout(t); t = setTimeout(() => { loadBoard(); if (S.tab === 'all') renderAll(); }, 300); };
    sb.channel('one-thing')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'picks' }, reload)
      .subscribe();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) loadBoard(); });
    setInterval(loadBoard, 5 * 60 * 1000); // catches the 4 a.m. rollover
    resyncPush();
  }
  render();
  loadBoard();
}

function render() {
  document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
  if (S.tab === 'today') { renderToday(); loadBoard(); }
  else if (S.tab === 'add') renderAdd();
  else if (S.tab === 'all') renderAll();
  else renderSettings();
}

async function loadBoard() {
  if (!S.status?.member) return;
  const { data, error } = await sb.rpc('get_board');
  if (error) { console.warn(error); return; }
  S.board = data;
  S.status.names = data.names;
  if (S.tab === 'today') renderToday();
}

// ---------- Today ------------------------------------------------------------
function renderToday() {
  const b = S.board;
  if (!b) { main().innerHTML = `<div class="center muted">Loading…</div>`; return; }
  const order = isPerson(me()) ? [me(), other(me())] : ['p1', 'p2'];
  const showInstall = isIOS && !isStandalone() && store.get('hideInstall') !== '1';
  main().innerHTML = `
    <header class="top">
      <div>
        <div class="eyebrow">${esc(fmtDay(b.day, { weekday: 'long', month: 'long', day: 'numeric' }))}</div>
        <h1>Today</h1>
      </div>
      <div class="weekdone">${b.week_done ? `<b>${b.week_done}</b> done this week` : ''}</div>
    </header>
    ${showInstall ? `<div class="banner">To get notifications, tap <b>Share</b> → <b>Add to Home Screen</b>, then open One Thing from your home screen. <button data-act="hideInstall" class="link">Hide</button></div>` : ''}
    <section class="cards">${order.map((p) => card(p, b[p], b.day)).join('')}</section>`;
}

function card(p, c, day) {
  const open = c.items.filter((i) => i.kind !== 'done');
  const done = c.items.filter((i) => i.kind === 'done');
  let footer = '';
  if (c.can_another) footer = `<button class="another" data-act="another" data-p="${p}">${done.length ? 'Give me another' : 'Give me one'}</button>`;
  else if (!open.length && done.length) footer = `<div class="clear">Done for today 🎉</div>`;
  else if (!open.length) footer = `<div class="clear">${c.open_count ? 'Nothing for today.' : 'All clear ✨'}</div>`;
  return `
  <article class="card ${p === me() ? 'mine' : ''}">
    <div class="card-head">
      <h2>${esc(nameOf(p))}</h2>
      <span class="chip ${c.swap_used ? 'used' : ''}">${c.swap_used ? 'Swap used' : '1 swap left'}</span>
    </div>
    ${open.map((t) => taskRow(p, t, c, day)).join('')}
    ${done.map((t) => doneRow(t)).join('')}
    ${footer}
  </article>`;
}

function taskRow(p, t, c, day) {
  const badges = [
    t.kind === 'urgent' && t.priority === 2 ? `<span class="badge red">High</span>` : '',
    dueLabel(t.due_date, day),
    t.owner === 'both' ? `<span class="badge blue">Together</span>` : '',
    t.kind === 'pick' && t.days >= 1 ? `<span class="badge">Day ${t.days + 1}</span>` : '',
  ].join('');
  const canSwap = !c.swap_used && t.kind !== 'shared';
  const nudge = t.kind === 'pick' && t.days >= 3
    ? `<div class="nudge">This one's been here ${t.days + 1} days. Too big?
         <button class="link" data-act="split" data-p="${p}" data-id="${t.id}" data-title="${esc(t.title)}">Break it into a smaller first step</button></div>`
    : '';
  return `
  <div class="task ${t.kind}">
    <div class="task-main">
      <div class="title">${esc(t.title)}</div>
      ${badges ? `<div class="badges">${badges}</div>` : ''}
      ${t.notes ? `<div class="notes">${esc(t.notes)}</div>` : ''}
      ${nudge}
    </div>
    <div class="actions">
      <button class="check" aria-label="Done" data-act="done" data-p="${p}" data-id="${t.id}" data-title="${esc(t.title)}">✓</button>
      <button class="cross" aria-label="Not today (swap)" data-act="swap" data-p="${p}" data-id="${t.id}" data-title="${esc(t.title)}" ${canSwap ? '' : 'disabled'}>✗</button>
    </div>
  </div>`;
}

function doneRow(t) {
  return `
  <div class="task done">
    <div class="task-main"><div class="title">${esc(t.title)}</div></div>
    <div class="actions"><span class="donemark" aria-label="Done">✓</span>
      <button class="link small" data-act="undo" data-id="${t.id}">Undo</button></div>
  </div>`;
}

async function onMainClick(e) {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const { act, p, id, title } = b.dataset;

  if (act === 'hideInstall') { store.set('hideInstall', '1'); return renderToday(); }

  if (act === 'done') {
    b.disabled = true;
    const r = await rpc('complete_task', { p_task: id, p_by: p });
    if (!r) return;
    S.board = r; renderToday();
    let undone = false;
    toast('Nice. Crossed off ✓', { label: 'Undo', run: async () => {
      undone = true;
      const u = await rpc('uncomplete_task', { p_task: id }); if (u) { S.board = u; renderToday(); }
    } });
    // Partner cheer after the undo window closes.
    setTimeout(() => { if (!undone && isPerson(p)) notify({ event: 'done', task_id: id }); }, 6500);
  }

  if (act === 'undo') {
    const r = await rpc('uncomplete_task', { p_task: id }); if (r) { S.board = r; renderToday(); }
  }

  if (act === 'swap') {
    if (!confirm(`Not today for "${title}"?\n\nThis uses ${nameOf(p)}'s one swap for today. It goes back in the pile for another day.`)) return;
    const r = await rpc('swap_task', { p, p_task: id }); if (r) { S.board = r; renderToday(); toast('Swapped. Fresh one up.'); }
  }

  if (act === 'another') {
    const r = await rpc('next_task', { p }); if (r) { S.board = r; renderToday(); }
  }

  if (act === 'split') {
    const step = prompt(`"${title}" is big. What's the smallest first step?\n(e.g. "find the form", "open the email")`);
    if (!step || !step.trim()) return;
    const r = await rpc('split_task', { p, p_task: id, p_title: step.trim() });
    if (r) { S.board = r; renderToday(); toast('Smaller step is on your card. The big one waits in the list.'); }
  }
}

// ---------- Add --------------------------------------------------------------
function renderAdd() {
  if (!S.addOwner && isPerson(me())) S.addOwner = me();
  const ownerBtn = (o) => `<button type="button" class="${S.addOwner === o ? 'on' : ''}" data-owner="${o}">${esc(o === me() ? 'Me' : nameOf(o))}</button>`;
  const priBtn = (v) => `<button type="button" class="${S.addPri === v ? 'on' : ''} pri${v}" data-pri="${v}">${PRI[v]}</button>`;
  main().innerHTML = `
  <header class="top"><h1>Add</h1></header>
  <form id="addForm" class="panel stack">
    <textarea id="addTitle" name="title" rows="3" placeholder="What needs doing?" required enterkeyhint="done"></textarea>
    <p class="hint">Tip: tap the 🎤 on your keyboard and just say it.</p>
    <div class="field"><span class="label">Whose list?</span>
      <div class="seg" id="ownerSeg">${['p1', 'p2', 'both'].map(ownerBtn).join('')}</div></div>
    <div class="field"><span class="label">Priority</span>
      <div class="seg" id="priSeg">${[0, 1, 2].map(priBtn).join('')}</div></div>
    <details>
      <summary>More options</summary>
      <div class="stack">
        <label>Due date<input type="date" name="due"></label>
        <label>Don't show before<input type="date" name="nb"></label>
        <label>Notes<textarea name="notes" rows="2"></textarea></label>
      </div>
    </details>
    <button class="primary" type="submit" id="addBtn" ${S.addOwner ? '' : 'disabled'}>Add task</button>
  </form>`;

  $('#ownerSeg').onclick = (e) => { const b = e.target.closest('[data-owner]'); if (!b) return; S.addOwner = b.dataset.owner; syncSeg(); };
  $('#priSeg').onclick = (e) => { const b = e.target.closest('[data-pri]'); if (!b) return; S.addPri = Number(b.dataset.pri); syncSeg(); };
  function syncSeg() {
    document.querySelectorAll('#ownerSeg button').forEach((x) => x.classList.toggle('on', x.dataset.owner === S.addOwner));
    document.querySelectorAll('#priSeg button').forEach((x) => x.classList.toggle('on', Number(x.dataset.pri) === S.addPri));
    $('#addBtn').disabled = !S.addOwner;
  }
  $('#addTitle').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#addForm').requestSubmit(); } });

  $('#addForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const title = String(f.get('title') || '').trim();
    if (!title || !S.addOwner) return;
    $('#addBtn').disabled = true;
    const row = {
      title, owner: S.addOwner, priority: S.addPri,
      due_date: f.get('due') || null, not_before: f.get('nb') || null,
      notes: String(f.get('notes') || '').trim() || null,
      created_by: isPerson(me()) ? me() : null,
    };
    const { data, error } = await sb.from('tasks').insert(row).select().single();
    $('#addBtn').disabled = false;
    if (error) return toast(error.message);
    if (row.owner !== row.created_by) notify({ event: 'added', task_id: data.id });
    toast(`Added to ${row.owner === me() ? 'your' : row.owner === 'both' ? 'both' : `${nameOf(row.owner)}'s`} list`);
    S.addPri = 1;
    renderAdd();
    loadBoard();
  };
}

// ---------- All tasks --------------------------------------------------------
async function renderAll() {
  main().innerHTML = `
  <header class="top"><h1>All tasks</h1>
    <div class="seg small" id="allSeg">
      <button class="${S.allFilter === 'open' ? 'on' : ''}" data-f="open">To do</button>
      <button class="${S.allFilter === 'done' ? 'on' : ''}" data-f="done">Done</button>
    </div></header>
  <div id="allList" class="center muted">Loading…</div>`;
  $('#allSeg').onclick = (e) => { const b = e.target.closest('[data-f]'); if (!b) return; S.allFilter = b.dataset.f; renderAll(); };

  let q = sb.from('tasks').select('*');
  q = S.allFilter === 'open'
    ? q.is('done_at', null).order('priority', { ascending: false }).order('due_date', { ascending: true, nullsFirst: false }).order('created_at')
    : q.not('done_at', 'is', null).order('done_at', { ascending: false }).limit(100);
  const { data, error } = await q;
  const list = $('#allList'); if (!list) return;
  if (error) { list.textContent = error.message; return; }
  list.className = '';
  if (!data.length) { list.innerHTML = `<p class="center muted">${S.allFilter === 'open' ? 'Nothing on the list.' : 'Nothing finished yet.'}</p>`; return; }

  const today = S.board?.day ?? localISO();
  const row = (t) => `
    <button class="row" data-edit="${t.id}">
      <span class="row-title">${esc(t.title)}</span>
      <span class="badges">
        ${t.priority === 2 ? '<span class="badge red">High</span>' : t.priority === 0 ? '<span class="badge">Low</span>' : ''}
        ${t.done_at ? `<span class="badge green">${esc(new Date(t.done_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))}</span>` : dueLabel(t.due_date, today)}
        ${t.not_before && t.not_before > today && !t.done_at ? `<span class="badge">From ${esc(fmtDay(t.not_before))}</span>` : ''}
      </span>
    </button>`;
  const groups = S.allFilter === 'open' ? ['p1', 'p2', 'both'] : [null];
  list.innerHTML = groups.map((g) => {
    const items = g ? data.filter((t) => t.owner === g) : data;
    if (!items.length) return '';
    return `<section class="group">${g ? `<h3>${esc(nameOf(g))} <span class="muted">${items.length}</span></h3>` : ''}${items.map(row).join('')}</section>`;
  }).join('');
  list.onclick = (e) => { const b = e.target.closest('[data-edit]'); if (b) openEdit(data.find((t) => t.id === b.dataset.edit)); };
}

function openEdit(t) {
  const d = $('#editDialog');
  const opt = (v, label, cur) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(label)}</option>`;
  d.innerHTML = `
  <form method="dialog" class="stack" id="editForm">
    <h2>Edit task</h2>
    <label>Task<textarea name="title" rows="2" required>${esc(t.title)}</textarea></label>
    <div class="two">
      <label>Whose<select name="owner">${['p1', 'p2', 'both'].map((o) => opt(o, nameOf(o), t.owner)).join('')}</select></label>
      <label>Priority<select name="priority">${[2, 1, 0].map((v) => opt(v, PRI[v], t.priority)).join('')}</select></label>
    </div>
    <div class="two">
      <label>Due<input type="date" name="due" value="${esc(t.due_date ?? '')}"></label>
      <label>Not before<input type="date" name="nb" value="${esc(t.not_before ?? '')}"></label>
    </div>
    <label>Notes<textarea name="notes" rows="2">${esc(t.notes ?? '')}</textarea></label>
    <div class="row-buttons">
      <button class="primary" value="save">Save</button>
      <button value="toggle">${t.done_at ? 'Mark not done' : 'Mark done'}</button>
    </div>
    <div class="row-buttons">
      <button value="cancel" class="ghost" formnovalidate>Cancel</button>
      <button value="delete" class="danger" formnovalidate>Delete</button>
    </div>
  </form>`;
  d.showModal();
  d.onclose = async () => {
    const action = d.returnValue; d.returnValue = '';
    const f = new FormData($('#editForm'));
    if (action === 'save') {
      const upd = {
        title: String(f.get('title')).trim(), owner: f.get('owner'), priority: Number(f.get('priority')),
        due_date: f.get('due') || null, not_before: f.get('nb') || null, notes: String(f.get('notes') || '').trim() || null,
      };
      if (!upd.title) return;
      const { error } = await sb.from('tasks').update(upd).eq('id', t.id);
      if (error) return toast(error.message);
      if (upd.owner !== t.owner && upd.owner !== me()) {
        // Treat a reassignment like a new task for the new owner.
        await sb.from('tasks').update({ created_by: isPerson(me()) ? me() : null }).eq('id', t.id);
        notify({ event: 'added', task_id: t.id });
      }
      toast('Saved');
    } else if (action === 'toggle') {
      const by = t.owner === 'both' ? (isPerson(me()) ? me() : 'p1') : t.owner;
      if (t.done_at) await rpc('uncomplete_task', { p_task: t.id });
      else { await rpc('complete_task', { p_task: t.id, p_by: by }); if (isPerson(by)) notify({ event: 'done', task_id: t.id }); }
    } else if (action === 'delete') {
      if (!confirm(`Delete "${t.title}"? This can't be undone.`)) return;
      const { error } = await sb.from('tasks').delete().eq('id', t.id);
      if (error) return toast(error.message);
      toast('Deleted');
    } else return;
    loadBoard();
    if (S.tab === 'all') renderAll();
  };
}

// ---------- Settings ---------------------------------------------------------
function renderSettings() {
  const p = me();
  const pref = isPerson(p) ? S.status.add_pref?.[p] ?? 'all' : null;
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  let pushBlock;
  if (!isPerson(p)) pushBlock = `<p class="muted">The shared screen doesn't get notifications.</p>`;
  else if (isIOS && !isStandalone()) pushBlock = `<p>To get notifications on iPhone, add One Thing to your Home Screen first: tap <b>Share</b> → <b>Add to Home Screen</b>, then open it from the new icon and come back here.</p>`;
  else if (perm === 'unsupported' || !('PushManager' in window)) pushBlock = `<p class="muted">This browser can't receive notifications.</p>`;
  else pushBlock = `
    <p>${perm === 'granted' ? '✅ Notifications are on for this device.' : perm === 'denied' ? 'Notifications are blocked. Turn them on in iPhone Settings → Notifications → One Thing.' : 'Get your task at 7 a.m., a reminder at 7 p.m. if it isn\'t done, and a heads-up when something lands on your list.'}</p>
    <div class="row-buttons">
      ${perm !== 'granted' && perm !== 'denied' ? `<button class="primary" id="pushOn">Turn on notifications</button>` : ''}
      ${perm === 'granted' ? `<button id="pushTest">Send a test</button>` : ''}
    </div>
    <label>Tell me when a task is added to my list
      <select id="addPref">
        <option value="all" ${pref === 'all' ? 'selected' : ''}>Always</option>
        <option value="high" ${pref === 'high' ? 'selected' : ''}>Only High priority</option>
        <option value="off" ${pref === 'off' ? 'selected' : ''}>Never</option>
      </select></label>`;

  main().innerHTML = `
  <header class="top"><h1>Settings</h1></header>
  <div class="panel stack">
    <h2>This device</h2>
    <p>Belongs to <b>${esc(p === 'shared' ? 'the shared screen' : nameOf(p))}</b>. <button class="link" id="changeWho">Change</button></p>
  </div>
  <div class="panel stack">
    <h2>Notifications</h2>
    ${pushBlock}
  </div>
  <form class="panel stack" id="namesForm">
    <h2>Names</h2>
    <div class="two">
      <label>Person 1<input name="n1" value="${esc(nameOf('p1'))}"></label>
      <label>Person 2<input name="n2" value="${esc(nameOf('p2'))}"></label>
    </div>
    <button>Save names</button>
  </form>
  <div class="panel stack">
    <h2>Backup</h2>
    <p class="muted">Saves every task to a file. Worth doing once a month.</p>
    <button id="exportBtn">Export backup</button>
  </div>
  <form class="panel stack" id="passForm">
    <h2>Change household passcode</h2>
    <label>Current passcode<input type="password" name="old" required autocomplete="current-password"></label>
    <label>New passcode<input type="password" name="new" minlength="6" required autocomplete="new-password"></label>
    <button>Change passcode</button>
  </form>
  <p class="center muted small">One Thing · Phase 1</p>`;

  $('#changeWho').onclick = () => renderWho(false);
  $('#pushOn')?.addEventListener('click', enablePush);
  $('#pushTest')?.addEventListener('click', async () => {
    const { data, error } = await sb.functions.invoke('notify', { body: { event: 'test' } });
    if (error) return toast('Test failed: ' + error.message);
    toast(data?.sent ? 'Sent! Check your notifications.' : 'No subscription found. Tap "Turn on notifications" again.');
  });
  $('#addPref')?.addEventListener('change', async (e) => {
    const r = await rpc('set_add_pref', { p_pref: e.target.value }); if (r) { S.status = r; toast('Saved'); }
  });
  $('#namesForm').onsubmit = async (e) => {
    e.preventDefault(); const f = new FormData(e.target);
    const r = await rpc('update_names', { p_name1: f.get('n1'), p_name2: f.get('n2') });
    if (r) { S.status = r; toast('Names saved'); loadBoard(); }
  };
  $('#passForm').onsubmit = async (e) => {
    e.preventDefault(); const f = new FormData(e.target);
    const r = await rpc('change_passcode', { p_old: f.get('old'), p_new: f.get('new') });
    if (r) { e.target.reset(); toast('Passcode changed'); }
  };
  $('#exportBtn').onclick = exportBackup;
}

// ---------- Push notifications -----------------------------------------------
function b64ToBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function saveSubscription(sub) {
  const j = sub.toJSON();
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.from('push_subs').upsert({
    endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, person: me(), uid: user?.id,
  });
  if (error) throw error;
}

async function enablePush() {
  try {
    const perm = await Notification.requestPermission(); // must be first: iOS needs the tap
    if (perm !== 'granted') { toast('Notifications not allowed'); return renderSettings(); }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(CONFIG.VAPID_PUBLIC_KEY) });
    await saveSubscription(sub);
    toast('Notifications on ✓');
  } catch (e) {
    console.error(e); toast('Could not turn on notifications: ' + e.message);
  }
  renderSettings();
}

// Keep this phone's subscription current (iOS can rotate it).
async function resyncPush() {
  try {
    if (!isPerson(me()) || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(CONFIG.VAPID_PUBLIC_KEY) });
    await saveSubscription(sub);
  } catch (e) { console.warn('push resync', e); }
}

// ---------- Backup -----------------------------------------------------------
async function exportBackup() {
  const { data, error } = await sb.from('tasks').select('*').order('created_at');
  if (error) return toast(error.message);
  const json = JSON.stringify({ exported_at: new Date().toISOString(), names: S.status.names, tasks: data }, null, 2);
  const name = `one-thing-backup-${localISO()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'One Thing backup' }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

boot().catch((e) => {
  console.error(e);
  main().innerHTML = `<div class="panel"><h1>Something went wrong</h1><p>${esc(e.message)}</p><button onclick="location.reload()">Try again</button></div>`;
});
