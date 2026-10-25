// One Thing — app logic (v2: Our Home)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { CONFIG } from './config.js';
import { SPOTS, roomSVG, itemThumb, isEvening } from './room.js';

// ---------- Small helpers ----------------------------------------------------
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const main = () => $('#main');
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const PRI = { 0: 'Low', 1: 'Normal', 2: 'High' };
const STAR = `<svg class="star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z" fill="#F2B705" stroke="#C98F00" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
const ICON = {
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.5"/><rect x="14" y="5" width="4" height="14" rx="1.5"/></svg>`,
  cross: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`,
};

function parseDay(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function fmtDay(s, opts = { weekday: 'short', month: 'short', day: 'numeric' }) { return parseDay(s).toLocaleDateString(undefined, opts); }
function localISO(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function dueLabel(due, today) {
  if (!due) return '';
  const diff = Math.round((parseDay(due) - parseDay(today)) / 86400000);
  if (diff < 0) return `<span class="badge red">Overdue</span>`;
  if (diff === 0) return `<span class="badge amber">Due today</span>`;
  if (diff === 1) return `<span class="badge amber">Due tomorrow</span>`;
  return `<span class="badge">Due ${esc(fmtDay(due))}</span>`;
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

// Floating "+10 Stars!" with a little confetti pop.
function celebrate(text, fromEl) {
  const fx = $('#fx');
  const r = fromEl?.getBoundingClientRect?.() ?? { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const pill = document.createElement('div');
  pill.className = 'burst'; pill.innerHTML = `${STAR}<span>${esc(text)}</span>`;
  pill.style.left = x + 'px'; pill.style.top = y + 'px';
  fx.appendChild(pill);
  if (!reducedMotion()) {
    const colors = ['#8CC9B0', '#F7B7A3', '#FFD98A', '#6FA3D6', '#F4A9A8', '#C7B8EA'];
    for (let i = 0; i < 16; i++) {
      const c = document.createElement('i');
      const a = (Math.PI * 2 * i) / 16 + Math.random() * 0.4;
      const d = 50 + Math.random() * 60;
      c.className = 'confetti';
      c.style.left = x + 'px'; c.style.top = y + 'px';
      c.style.setProperty('--dx', Math.cos(a) * d + 'px');
      c.style.setProperty('--dy', Math.sin(a) * d - 30 + 'px');
      c.style.background = colors[i % colors.length];
      fx.appendChild(c);
      setTimeout(() => c.remove(), 1100);
    }
  }
  setTimeout(() => pill.remove(), 1600);
}

// ---------- State ------------------------------------------------------------
const S = {
  status: null, board: null, home: null,
  tab: 'today', moreTab: 'all', allFilter: 'open',
  addOwner: null, addPri: 1, storeCat: 'all', storeSpot: null,
};
const me = () => S.status?.person;                       // 'p1' | 'p2' | 'shared'
const isPerson = (p) => p === 'p1' || p === 'p2';
const nameOf = (p) => p === 'both' ? 'Both of us' : p === 'wall' ? 'The wall display' : (S.status?.names?.[p] ?? p);
const other = (p) => (p === 'p1' ? 'p2' : 'p1');
const placedMap = () => Object.fromEntries((S.home?.owned ?? []).filter((o) => o.spot).map((o) => [o.spot, o.item_id]));

const starPill = () => `<div class="stars" aria-label="${S.home ? S.home.stars : 0} Stars">${STAR}<span>${S.home ? S.home.stars : '–'}</span></div>`;
const levelChip = () => S.home ? `<div class="lvl" aria-label="Level ${S.home.level}">Lv ${S.home.level}</div>` : '';
const header = (eyebrow, title) => `
  <header class="top">
    <div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1></div>
    <div class="top-right">${levelChip()}${starPill()}</div>
  </header>`;

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
  <div class="panel welcome">
    <h1>One Thing</h1>
    <p class="lead">One task each, every day — and a home you build together.</p>
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
  <div class="panel welcome">
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
  <div class="panel stack welcome">
    <h2>Who uses this device?</h2>
    <button class="big p1" data-p="p1">${esc(nameOf('p1'))}</button>
    <button class="big p2" data-p="p2">${esc(nameOf('p2'))}</button>
    <button class="big ghost" data-p="shared">Shared screen (wall display)</button>
  </div>`;
  main().querySelectorAll('[data-p]').forEach((b) => b.onclick = async () => {
    const r = await rpc('set_person', { p_person: b.dataset.p });
    if (r) { S.status = r; first ? startApp() : (S.tab = 'more', S.moreTab = 'settings', render()); }
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
      if (b.dataset.tab !== 'store') S.storeSpot = null;
      S.tab = b.dataset.tab; render();
    });
    main().addEventListener('click', onMainClick);

    // Live sync: tasks/picks → board; owned/ledger → home.
    let tb, th;
    const reloadBoard = () => { clearTimeout(tb); tb = setTimeout(() => { loadBoard(); if (S.tab === 'more' && S.moreTab === 'all') renderAll(); }, 300); };
    const reloadHome = () => { clearTimeout(th); th = setTimeout(loadHome, 300); };
    sb.channel('one-thing')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, reloadBoard)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'picks' }, reloadBoard)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'owned' }, reloadHome)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ledger' }, reloadHome)
      .subscribe();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { loadBoard(); loadHome(); } });
    setInterval(() => { loadBoard(); loadHome(); }, 5 * 60 * 1000); // 4 a.m. rollover + evening mode
    resyncPush();
  }
  render();
  loadBoard();
  loadHome();
}

function render() {
  document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
  document.body.dataset.tab = S.tab;
  renderScene();
  if (S.tab === 'today') { renderToday(); loadBoard(); }
  else if (S.tab === 'home') { renderHome(); loadHome(); }
  else if (S.tab === 'add') renderAdd();
  else if (S.tab === 'store') { renderStore(); loadHome(); }
  else renderMore();
}

// The room behind the Today screen.
function renderScene() {
  const scene = $('#scene');
  if (S.tab !== 'today') { scene.innerHTML = ''; return; }
  scene.innerHTML = roomSVG(placedMap(), { night: isEvening(), slice: true }) + `<div class="veil"></div>`;
}

async function loadBoard() {
  if (!S.status?.member) return;
  const { data, error } = await sb.rpc('get_board');
  if (error) { console.warn(error); return; }
  S.board = data;
  S.status.names = data.names;
  if (S.tab === 'today') renderToday();
}

async function loadHome() {
  if (!S.status?.member) return;
  const { data, error } = await sb.rpc('get_home');
  if (error) { console.warn(error); return; }
  const prevLevel = S.home?.level;
  S.home = data;
  // Keep every Stars / level badge on screen current, whatever the tab.
  document.querySelectorAll('.stars').forEach((e) => { e.querySelector('span').textContent = data.stars; e.setAttribute('aria-label', `${data.stars} Stars`); });
  document.querySelectorAll('.lvl').forEach((e) => { e.textContent = `Lv ${data.level}`; });
  if (S.tab === 'today') { renderScene(); renderToday(); }
  else if (S.tab === 'home') renderHome();
  else if (S.tab === 'store') renderStore();
  // A level-up this device hasn't celebrated yet (maybe your partner earned it).
  const seen = Number(store.get('seenLevel') || 0);
  if (!seen) store.set('seenLevel', String(data.level));
  else if (data.level > seen) showLevelUp(data.level);
  else if (prevLevel && data.level < prevLevel) store.set('seenLevel', String(data.level));
}

// ---------- Today ------------------------------------------------------------
function renderToday() {
  const b = S.board;
  if (!b) { main().innerHTML = `<div class="center muted">Loading…</div>`; return; }
  const order = isPerson(me()) ? [me(), other(me())] : ['p1', 'p2'];
  const showInstall = isIOS && !isStandalone() && store.get('hideInstall') !== '1';
  main().innerHTML = `
    ${header(esc(fmtDay(b.day, { weekday: 'long', month: 'long', day: 'numeric' })), 'Today')}
    ${showInstall ? `<div class="banner">To get notifications, tap <b>Share</b> → <b>Add to Home Screen</b>, then open One Thing from your home screen. <button data-act="hideInstall" class="link">Hide</button></div>` : ''}
    <section class="cards">${order.map((p, i) => card(p, b[p], b.day, i)).join('')}</section>
    ${b.week_done ? `<p class="weekdone"><b>${b.week_done}</b> done together this week</p>` : ''}`;
}

function card(p, c, day, i) {
  const open = c.items.filter((t) => t.kind !== 'done');
  const done = c.items.filter((t) => t.kind === 'done');
  let footer = '';
  if (c.can_another) footer = `<button class="another" data-act="another" data-p="${p}">${done.length ? 'Give me another' : 'Give me one'}</button>`;
  else if (!open.length && done.length) footer = `<div class="clear">Done for today</div>`;
  else if (!open.length) footer = `<div class="clear">${c.open_count ? 'Nothing for today.' : 'All clear'}</div>`;
  return `
  <article class="card note ${p} ${i % 2 ? 'tilt-r' : 'tilt-l'}">
    <span class="tape" aria-hidden="true"></span>
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
  const notes = t.progress_notes || [];
  const last = notes[notes.length - 1];
  const pausedToday = t.paused_day === day;
  const inProgress = notes.length > 0;
  const badges = [
    t.priority === 2 ? `<span class="badge red">High</span>` : '',
    dueLabel(t.due_date, day),
    t.owner === 'both' ? `<span class="badge blue">Together</span>` : '',
    pausedToday ? `<span class="badge blue">Paused for today</span>` : inProgress ? `<span class="badge blue">In progress</span>` : '',
    t.kind === 'pick' && t.days >= 1 && !inProgress ? `<span class="badge">Day ${t.days + 1}</span>` : '',
  ].join('');
  const canSwap = !c.swap_used && t.kind !== 'shared' && !pausedToday;
  const nudge = t.kind === 'pick' && t.days >= 3 && !inProgress
    ? `<div class="nudge">This one's been here ${t.days + 1} days. Too big?
         <button class="link" data-act="split" data-p="${p}" data-id="${t.id}" data-title="${esc(t.title)}">Break it into a smaller first step</button></div>`
    : '';
  const data = `data-p="${p}" data-id="${t.id}" data-title="${esc(t.title)}"`;
  return `
  <div class="task ${t.kind} ${pausedToday ? 'paused' : ''}">
    <div class="title">${esc(t.title)}</div>
    ${badges ? `<div class="badges">${badges}</div>` : ''}
    ${last ? `<div class="leftoff"><b>Left off:</b> ${esc(last.note)}</div>` : ''}
    ${t.notes ? `<div class="notes">${esc(t.notes)}</div>` : ''}
    ${nudge}
    <div class="actions">
      <button class="btn-done" data-act="done" ${data}>${ICON.check}<span>Done</span></button>
      ${pausedToday
        ? `<button class="btn-soft" data-act="resume" ${data}>Resume</button>`
        : `<button class="btn-pause" aria-label="Pause and note where you left off" data-act="pause" ${data}>${ICON.pause}</button>
           <button class="btn-swap" aria-label="Not today (uses your swap)" data-act="swap" ${data} ${canSwap ? '' : 'disabled'}>${ICON.cross}</button>`}
    </div>
  </div>`;
}

function doneRow(t) {
  return `
  <div class="task done">
    <span class="donemark" aria-label="Done">${ICON.check}</span>
    <div class="title">${esc(t.title)}</div>
    <button class="link small" data-act="undo" data-id="${t.id}">Undo</button>
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
    if (r.award) celebrate(`+${r.award} Stars!`, b);
    S.board = r; renderToday();
    let undone = false;
    toast('Nice. Crossed off ✓', { label: 'Undo', run: async () => {
      undone = true;
      const u = await rpc('uncomplete_task', { p_task: id }); if (u) { S.board = u; renderToday(); loadHome(); }
    } });
    await loadHome();
    setTimeout(() => { if (!undone && isPerson(p)) notify({ event: 'done', task_id: id }); }, 6500);
  }

  if (act === 'undo') {
    const r = await rpc('uncomplete_task', { p_task: id }); if (r) { S.board = r; renderToday(); loadHome(); }
  }

  if (act === 'pause') {
    const note = prompt(`Pausing "${title}" for today.\n\nWhere did you leave off? (optional)`);
    if (note === null) return;
    const r = await rpc('pause_task', { p, p_task: id, p_note: note });
    if (r) { S.board = r; renderToday(); toast('Paused. It\'ll be back tomorrow with your note.'); }
  }

  if (act === 'resume') {
    const r = await rpc('resume_task', { p_task: id }); if (r) { S.board = r; renderToday(); }
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

  // Home: tap a spot
  if (act === 'spot') openSpot(b.dataset.spot);
  if (act === 'storage') openStorage();
  if (act === 'goStore') { S.storeSpot = null; S.tab = 'store'; render(); }

  // Store
  if (act === 'cat') { S.storeCat = b.dataset.cat; renderStore(); }
  if (act === 'clearSpot') { S.storeSpot = null; renderStore(); }
  if (act === 'buy') buy(b.dataset.item, b);
}

// ---------- Level up ---------------------------------------------------------
function showLevelUp(level) {
  store.set('seenLevel', String(level));
  const reward = (S.home?.owned ?? []).find((o) => o.level === level);
  const d = $('#levelDialog');
  d.innerHTML = `
    <div class="levelup">
      <div class="lv-badge">Level ${level}</div>
      <h2>Your home grew!</h2>
      ${reward ? `<div class="lv-item">${itemThumb(reward.item_id, reward.item_spot)}</div>
        <p><b>${esc(reward.name)}</b> ${reward.spot ? 'is in your home now.' : 'is waiting in Storage (that spot is taken).'}</p>`
        : `<p>New items in the Store are unlocked.</p>`}
      ${S.home?.next_reward ? `<p class="muted small">Next up at level ${level + 1}: ${esc(S.home.next_reward.name)}</p>` : ''}
      <form method="dialog"><button class="primary">Yay</button></form>
    </div>`;
  if (!d.open) d.showModal();
  if (!reducedMotion()) celebrate(`Level ${level}!`, d.querySelector('.lv-badge'));
}

// ---------- Home -------------------------------------------------------------
function renderHome() {
  const h = S.home;
  if (!h) { main().innerHTML = `${header('Your place', 'Our Home')}<div class="center muted">Loading…</div>`; return; }
  const placed = placedMap();
  const empty = !Object.keys(placed).length;
  const stored = h.owned.filter((o) => !o.spot);
  const max = h.level >= h.max_level;
  const pct = max ? 100 : Math.round(((h.xp - h.level_floor) / (h.next_at - h.level_floor)) * 100);
  const spots = Object.entries(SPOTS).map(([k, s]) => {
    const it = placed[k];
    const item = it && h.owned.find((o) => o.item_id === it);
    return `<button class="spot ${it ? 'filled' : 'empty'}" data-act="spot" data-spot="${k}"
      style="left:${(s.x / 360) * 100}%;top:${(s.y / 430) * 100}%;width:${(s.w / 360) * 100}%;height:${(s.h / 430) * 100}%"
      aria-label="${esc(s.label)}: ${it ? esc(item?.name) : 'empty'}">${it ? '' : '<span>+</span>'}</button>`;
  }).join('');
  main().innerHTML = `
    ${header(`Living room · Level ${h.level}`, 'Our Home')}
    <div class="room-wrap">
      ${roomSVG(placed, { night: isEvening(), empty })}
      <div class="spots">${spots}</div>
      ${empty ? `<div class="room-empty"><b>Your home is empty.</b><br>Finish tasks to earn Stars and XP — your first piece arrives at level 2.</div>` : ''}
    </div>
    <section class="panel level-card">
      <div class="level-row">
        <h2>Level ${h.level}</h2>
        <span class="xp">${max ? `${h.xp} XP · max level` : `${h.xp - h.level_floor} / ${h.next_at - h.level_floor} XP`}</span>
      </div>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><div style="width:${pct}%"></div></div>
      ${h.next_reward ? `<div class="next">${itemThumb(h.next_reward.id, h.next_reward.spot, 'mini')}<span>Level ${h.level + 1} brings a <b>${esc(h.next_reward.name)}</b></span></div>`
        : `<div class="next"><span>Every level reward earned. New rooms are coming in a future update.</span></div>`}
    </section>
    <div class="row-buttons home-actions">
      <button class="btn-soft" data-act="storage">Storage (${stored.length})</button>
      <button class="btn-soft" data-act="goStore">Visit the Store</button>
    </div>`;
}

function ownedLine(o, actions) {
  const meta = o.via === 'level' ? `Level ${o.level} reward` : `Bought by ${esc(nameOf(o.bought_by))}`;
  return `<div class="owned-line">${itemThumb(o.item_id, o.item_spot, 'mini')}<div><b>${esc(o.name)}</b><div class="muted small">${meta}</div></div>${actions}</div>`;
}

function openSpot(spot) {
  const h = S.home; if (!h) return;
  const s = SPOTS[spot];
  const current = h.owned.find((o) => o.spot === spot);
  const stored = h.owned.filter((o) => !o.spot && o.item_spot === spot);
  const d = $('#sheet');
  d.innerHTML = `
    <div class="stack">
      <h2>${esc(s.label)}</h2>
      ${current ? ownedLine(current, `<button class="btn-soft small" data-sheet="store" data-id="${current.id}">To Storage</button>`)
        : `<p class="muted">Nothing here yet.</p>`}
      ${stored.length ? `<h3>In Storage</h3>${stored.map((o) => ownedLine(o, `<button class="btn-soft small" data-sheet="place" data-id="${o.id}">Put here</button>`)).join('')}` : ''}
      <div class="row-buttons">
        <button class="primary" data-sheet="shop">Shop for this spot</button>
        <button class="ghost" data-sheet="close">Close</button>
      </div>
    </div>`;
  d.onclick = async (e) => {
    const b = e.target.closest('[data-sheet]'); if (!b) { if (e.target === d) d.close(); return; }
    const a = b.dataset.sheet;
    if (a === 'close') return d.close();
    if (a === 'shop') { d.close(); S.storeSpot = spot; S.storeCat = 'all'; S.tab = 'store'; return render(); }
    const r = await rpc(a === 'place' ? 'place_item' : 'store_item', { p_owned: b.dataset.id });
    if (r) { S.home = r; d.close(); renderHome(); }
  };
  d.showModal();
}

function openStorage() {
  const h = S.home; if (!h) return;
  const stored = h.owned.filter((o) => !o.spot);
  const d = $('#sheet');
  d.innerHTML = `
    <div class="stack">
      <h2>Storage</h2>
      ${stored.length ? stored.map((o) => ownedLine(o, `<button class="btn-soft small" data-sheet="place" data-id="${o.id}">Put back</button>`)).join('')
        : `<p class="muted">Nothing in storage. When you replace something, the old piece waits here so you can swap it back anytime.</p>`}
      <button class="ghost" data-sheet="close">Close</button>
    </div>`;
  d.onclick = async (e) => {
    const b = e.target.closest('[data-sheet]'); if (!b) { if (e.target === d) d.close(); return; }
    if (b.dataset.sheet === 'close') return d.close();
    const r = await rpc('place_item', { p_owned: b.dataset.id });
    if (r) { S.home = r; d.close(); renderHome(); toast('Back in the room'); }
  };
  d.showModal();
}

// ---------- Store ------------------------------------------------------------
const CATS = { all: 'All', furniture: 'Furniture', plants: 'Plants', decor: 'Decor', lighting: 'Lighting', rugs: 'Rugs' };

function renderStore() {
  const h = S.home;
  if (!h) { main().innerHTML = `${header('New stock every Monday', 'Store')}<div class="center muted">Loading…</div>`; return; }
  const days = h.restock_in;
  const cats = ['all', ...Object.keys(CATS).filter((c) => c !== 'all' && h.stock.some((i) => i.category === c))];
  let items = h.stock;
  if (S.storeSpot) items = items.filter((i) => i.spot === S.storeSpot);
  else if (S.storeCat !== 'all') items = items.filter((i) => i.category === S.storeCat);
  const featured = h.stock.filter((i) => !i.owned && i.min_level <= h.level).sort((a, b) => b.price - a.price)[0];
  const placed = (id) => h.owned.find((o) => o.item_id === id)?.spot;

  const cardFor = (i) => {
    let btn;
    if (i.owned) btn = `<div class="owned-tag">${ICON.check}${placed(i.id) ? 'In your home' : 'In Storage'}</div>`;
    else if (i.min_level > h.level) btn = `<button class="buy locked" disabled>${ICON.lock}Level ${i.min_level}</button>`;
    else if (i.price > h.stars) btn = `<button class="buy short" disabled>Need ${i.price - h.stars} more</button>`;
    else btn = `<button class="buy" data-act="buy" data-item="${i.id}">Buy · ${STAR}${i.price}</button>`;
    return `
      <article class="item">
        <div class="item-art">${itemThumb(i.id, i.spot)}</div>
        <div class="item-name">${esc(i.name)}</div>
        <div class="item-price">${STAR}${i.price}</div>
        ${btn}
      </article>`;
  };

  main().innerHTML = `
    ${header(`New stock every Monday · ${days === 1 ? '1 day' : days + ' days'} left`, 'Store')}
    <div class="cats" role="tablist" aria-label="Categories">
      ${S.storeSpot ? `<button class="cat on" data-act="clearSpot">For: ${esc(SPOTS[S.storeSpot].label)} ✕</button>`
        : cats.map((c) => `<button class="cat ${S.storeCat === c ? 'on' : ''}" role="tab" aria-selected="${S.storeCat === c}" data-act="cat" data-cat="${c}">${CATS[c]}</button>`).join('')}
    </div>
    ${featured && !S.storeSpot && S.storeCat === 'all' ? `
      <section class="featured">
        <div class="featured-art">${itemThumb(featured.id, featured.spot)}</div>
        <div class="featured-body">
          <div class="kicker">Special this week</div>
          <div class="featured-name">${esc(featured.name)}</div>
          <div class="bar blue"><div style="width:${Math.min(100, Math.round((h.stars / featured.price) * 100))}%"></div></div>
          <div class="small strong">${h.stars >= featured.price ? 'You can afford it!' : `${h.stars} of ${featured.price} Stars · ${featured.price - h.stars} to go`}</div>
        </div>
      </section>` : ''}
    <div class="grid">${items.length ? items.map(cardFor).join('') : `<p class="muted center">Nothing for that spot this week. Check back Monday!</p>`}</div>`;
}

async function buy(itemId, btn) {
  const h = S.home; const i = h.stock.find((x) => x.id === itemId); if (!i) return;
  const occupant = h.owned.find((o) => o.spot === i.spot);
  const where = occupant ? `\n\nIt goes where the ${occupant.name} is now — the ${occupant.name} moves to Storage.` : `\n\nIt goes in the ${SPOTS[i.spot].label.toLowerCase()}.`;
  if (!confirm(`Buy ${i.name} for ${i.price} Stars?${where}`)) return;
  const by = isPerson(me()) ? me() : 'wall';
  const r = await rpc('buy_item', { p_item: itemId, p_by: by });
  if (!r) return;
  S.home = r;
  celebrate(`New: ${i.name}!`, btn);
  renderStore();
  toast('Placed in your home', { label: 'See it', run: () => { S.tab = 'home'; render(); } });
}

// ---------- Add --------------------------------------------------------------
function renderAdd() {
  if (!S.addOwner && isPerson(me())) S.addOwner = me();
  const ownerBtn = (o) => `<button type="button" class="${S.addOwner === o ? 'on' : ''} ${o}" data-owner="${o}">${esc(o === me() ? 'Me' : nameOf(o))}</button>`;
  const priBtn = (v) => `<button type="button" class="${S.addPri === v ? 'on' : ''} pri${v}" data-pri="${v}">${PRI[v]}</button>`;
  main().innerHTML = `
  ${header('+1 Star per task, up to 5 a day', 'Add')}
  <form id="addForm" class="panel stack">
    <textarea id="addTitle" name="title" rows="3" placeholder="What needs doing?" required enterkeyhint="done"></textarea>
    <p class="hint">Tip: tap the microphone on your keyboard and just say it.</p>
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
    const starsBefore = S.home?.stars;
    const { data, error } = await sb.from('tasks').insert(row).select().single();
    $('#addBtn').disabled = false;
    if (error) return toast(error.message);
    if (row.owner !== row.created_by) notify({ event: 'added', task_id: data.id });
    toast(`Added to ${row.owner === me() ? 'your' : row.owner === 'both' ? 'both' : `${nameOf(row.owner)}'s`} list`);
    S.addPri = 1;
    renderAdd();
    loadBoard();
    await loadHome();
    if (starsBefore != null && S.home && S.home.stars > starsBefore) celebrate('+1 Star', $('#addBtn'));
  };
}

// ---------- More: all tasks + settings --------------------------------------
function renderMore() {
  main().innerHTML = `
    ${header('Everything else', 'More')}
    <div class="seg wide" id="moreSeg">
      <button class="${S.moreTab === 'all' ? 'on' : ''}" data-m="all">All tasks</button>
      <button class="${S.moreTab === 'settings' ? 'on' : ''}" data-m="settings">Settings</button>
    </div>
    <div id="moreBody"></div>`;
  $('#moreSeg').onclick = (e) => { const b = e.target.closest('[data-m]'); if (!b) return; S.moreTab = b.dataset.m; renderMore(); };
  if (S.moreTab === 'all') renderAll(); else renderSettings();
}

async function renderAll() {
  const body = $('#moreBody'); if (!body) return;
  body.innerHTML = `
    <div class="seg small" id="allSeg">
      <button class="${S.allFilter === 'open' ? 'on' : ''}" data-f="open">To do</button>
      <button class="${S.allFilter === 'done' ? 'on' : ''}" data-f="done">Done</button>
    </div>
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
        ${(t.progress_notes || []).length && !t.done_at ? '<span class="badge blue">In progress</span>' : ''}
        ${t.done_at ? `<span class="badge green">${esc(new Date(t.done_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))}</span>` : dueLabel(t.due_date, today)}
        ${t.not_before && t.not_before > today && !t.done_at ? `<span class="badge">From ${esc(fmtDay(t.not_before))}</span>` : ''}
      </span>
    </button>`;
  const groups = S.allFilter === 'open' ? ['p1', 'p2', 'both'] : [null];
  list.innerHTML = groups.map((g) => {
    const items = g ? data.filter((t) => t.owner === g) : data;
    if (!items.length) return '';
    return `<section class="group">${g ? `<h3 class="${g}">${esc(nameOf(g))} <span class="muted">${items.length}</span></h3>` : ''}${items.map(row).join('')}</section>`;
  }).join('');
  list.onclick = (e) => { const b = e.target.closest('[data-edit]'); if (b) openEdit(data.find((t) => t.id === b.dataset.edit)); };
}

function openEdit(t) {
  const d = $('#editDialog');
  const opt = (v, label, cur) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${esc(label)}</option>`;
  const notes = t.progress_notes || [];
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
    ${notes.length ? `<div class="history"><span class="label">Progress</span>${notes.map((n) => `<div class="hist"><span class="muted small">${esc(fmtDay(n.day))} · ${esc(nameOf(n.by))}</span><div>${esc(n.note)}</div></div>`).join('')}</div>` : ''}
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
        await sb.from('tasks').update({ created_by: isPerson(me()) ? me() : null }).eq('id', t.id);
        notify({ event: 'added', task_id: t.id });
      }
      toast('Saved');
    } else if (action === 'toggle') {
      const by = t.owner === 'both' ? (isPerson(me()) ? me() : 'p1') : t.owner;
      if (t.done_at) await rpc('uncomplete_task', { p_task: t.id });
      else {
        const r = await rpc('complete_task', { p_task: t.id, p_by: by });
        if (r?.award) toast(`+${r.award} Stars`);
        if (isPerson(by)) notify({ event: 'done', task_id: t.id });
      }
      loadHome();
    } else if (action === 'delete') {
      if (!confirm(`Delete "${t.title}"? This can't be undone.`)) return;
      const { error } = await sb.from('tasks').delete().eq('id', t.id);
      if (error) return toast(error.message);
      toast('Deleted');
    } else return;
    loadBoard();
    if (S.tab === 'more' && S.moreTab === 'all') renderAll();
  };
}

function renderSettings() {
  const body = $('#moreBody'); if (!body) return;
  const p = me();
  const pref = isPerson(p) ? S.status.add_pref?.[p] ?? 'all' : null;
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  let pushBlock;
  if (!isPerson(p)) pushBlock = `<p class="muted">The shared screen doesn't get notifications.</p>`;
  else if (isIOS && !isStandalone()) pushBlock = `<p>To get notifications on iPhone, add One Thing to your Home Screen first: tap <b>Share</b> → <b>Add to Home Screen</b>, then open it from the new icon and come back here.</p>`;
  else if (perm === 'unsupported' || !('PushManager' in window)) pushBlock = `<p class="muted">This browser can't receive notifications.</p>`;
  else pushBlock = `
    <p>${perm === 'granted' ? 'Notifications are on for this device.' : perm === 'denied' ? 'Notifications are blocked. Turn them on in iPhone Settings → Notifications → One Thing.' : 'Get your task at 7 a.m., a reminder at 7 p.m. if it isn\'t done, and a heads-up when something lands on your list.'}</p>
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

  body.innerHTML = `
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
  <p class="center muted small">One Thing · Our Home update</p>`;

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
  const [{ data: tasks, error }, { data: owned }, { data: ledger }] = await Promise.all([
    sb.from('tasks').select('*').order('created_at'),
    sb.from('owned').select('*'),
    sb.from('ledger').select('*').order('id'),
  ]);
  if (error) return toast(error.message);
  const json = JSON.stringify({ exported_at: new Date().toISOString(), names: S.status.names, tasks, owned, ledger }, null, 2);
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
