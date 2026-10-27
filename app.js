// One Thing — app logic (v5: Plan calendar)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { CONFIG } from './config.js';
import { SPOTS, STYLE_SPOTS, roomSVG, itemThumb, isEvening } from './room.js?v=5';

const APP_VERSION = '5';

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
  pin: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3h6l-1 6 3 3H7l3-3z"/><path d="M12 12v9"/></svg>`,
  pinFill: `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3h6l-1 6 3 3H7l3-3z"/><path d="M12 12v9" fill="none"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>`,
  help: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.4"/><circle cx="12" cy="17" r=".6" fill="currentColor"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.5"/><rect x="14" y="5" width="4" height="14" rx="1.5"/></svg>`,
  cross: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`,
  bell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>`,
  cal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>`,
  people: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.8"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M15.5 14.6c2.6-.3 5 1.3 6 5.4"/></svg>`,
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
  lists: null, list: 'groceries', listInput: '',
  pauseOpen: null, pauseDraft: null,
};
const allSpots = () => ({ ...SPOTS, ...STYLE_SPOTS });
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
    <div class="top-right">${levelChip()}${starPill()}<button class="gear" data-act="settings" aria-label="Settings">${ICON.gear}</button></div>
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
  if (!S.status.member) return renderWelcome();
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

// ---------- First run: start or join a household -----------------------------
function renderWelcome() {
  main().innerHTML = `
  <div class="panel welcome stack">
    <img class="welcome-logo" src="icons/icon-192.png" alt="" width="84" height="84">
    <h1>One Thing</h1>
    <p class="lead">One task each, every day, and a home you build together.</p>
    <button class="primary big" id="toStart">Start a household</button>
    <button class="big" id="toJoin">I have a code</button>
  </div>`;
  $('#toStart').onclick = renderSetup;
  $('#toJoin').onclick = renderJoin;
}

function renderSetup() {
  main().innerHTML = `
  <div class="panel welcome">
    <h1>Start a household</h1>
    <form id="setupForm" class="stack">
      <label>Your name<input name="n1" required autocomplete="given-name"></label>
      <label>Your partner's name<input name="n2" required></label>
      <button class="primary" type="submit">Create household</button>
    </form>
    <p class="muted small"><a href="#" id="back">Back</a></p>
  </div>`;
  $('#back').onclick = (e) => { e.preventDefault(); renderWelcome(); };
  $('#setupForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    let tz = 'America/New_York'; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch { /* default */ }
    const r = await rpc('create_household', { p_name1: f.get('n1'), p_name2: f.get('n2'), p_me: 'p1', p_tz: tz });
    if (r) { S.status = r; renderCodeShare(true); }
  };
}

// Show the household code so the partner can join.
function renderCodeShare(first) {
  const code = S.status.code;
  main().innerHTML = `
  <div class="panel welcome stack center-text">
    <h2>Your household code</h2>
    <div class="code-big" aria-label="Code ${esc(code.split('').join(' '))}">${esc(code)}</div>
    <p>${esc(nameOf('p2'))} opens One Thing, taps <b>I have a code</b>, and types this in. You can find it again anytime in Settings.</p>
    <div class="row-buttons">
      <button data-act-code="copy">${ICON.copy}<span>Copy</span></button>
      ${navigator.share ? `<button data-act-code="share">Share</button>` : ''}
    </div>
    ${first ? `<button class="primary" id="codeNext">Next</button>` : ''}
  </div>`;
  main().querySelectorAll('[data-act-code]').forEach((b) => b.onclick = () => shareCode(b.dataset.actCode));
  $('#codeNext')?.addEventListener('click', () => { startApp(); maybeTour(); });
}
async function shareCode(how) {
  const code = S.status.code;
  const text = `Join our One Thing household with this code: ${code}\n${location.origin + location.pathname}`;
  try {
    if (how === 'share' && navigator.share) await navigator.share({ title: 'One Thing', text });
    else { await navigator.clipboard.writeText(code); toast('Code copied'); }
  } catch { /* cancelled */ }
}

function renderJoin() {
  main().innerHTML = `
  <div class="panel welcome">
    <h1>Join a household</h1>
    <form id="joinForm" class="stack">
      <label>Household code<input name="code" required autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD-2345" class="code-input"></label>
      <button class="primary" type="submit">Join</button>
    </form>
    <p class="muted small"><a href="#" id="back">Back</a></p>
  </div>`;
  $('#back').onclick = (e) => { e.preventDefault(); renderWelcome(); };
  $('#joinForm').onsubmit = async (e) => {
    e.preventDefault();
    const r = await rpc('join_household', { p_passcode: new FormData(e.target).get('code'), p_person: 'shared' });
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
    if (r) { S.status = r; if (first) { startApp(); maybeTour(); } else { S.tab = 'settings'; render(); } }
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
    main().addEventListener('input', onMainInput);
    main().addEventListener('change', onMainInput);

    $('#fab').addEventListener('click', () => { if (S.tab === 'plan') openEvent(null); else { S.tab = 'add'; render(); } });

    // Hide the + while scrolling down (so it never sits on a ✗ button); bring it back on the way up.
    let lastY = 0;
    main().addEventListener('scroll', () => {
      const y = main().scrollTop;
      if (y > lastY + 6 && y > 60) $('#fab').classList.add('tuck');
      else if (y < lastY - 6 || y <= 60) $('#fab').classList.remove('tuck');
      lastY = y;
    }, { passive: true });

    // iPhone: after the keyboard closes, the page can stay shifted up. Snap it back.
    const unshift = () => setTimeout(() => { if (window.scrollY || document.documentElement.scrollTop) window.scrollTo(0, 0); }, 60);
    document.addEventListener('focusout', unshift);
    window.visualViewport?.addEventListener('resize', unshift);

    // Live sync: tasks/picks/together → board; owned/ledger → home; shopping → lists.
    let tb, th, tl;
    const reloadBoard = () => { clearTimeout(tb); tb = setTimeout(() => { loadBoard(); loadExtras(); if (S.tab === 'all') renderAll(); }, 300); };
    let tp;
    const reloadPlan = () => { clearTimeout(tp); tp = setTimeout(() => { loadExtras(); if (S.tab === 'plan') loadPlan(); }, 300); };
    const reloadHome = () => { clearTimeout(th); th = setTimeout(loadHome, 300); };
    const reloadLists = () => { clearTimeout(tl); tl = setTimeout(loadLists, 300); };
    sb.channel('one-thing')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, reloadBoard)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'picks' }, reloadBoard)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'together' }, reloadBoard)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'owned' }, reloadHome)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ledger' }, reloadHome)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_items' }, reloadLists)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, reloadPlan)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_went' }, reloadPlan)
      .subscribe();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { loadBoard(); loadHome(); loadLists(); loadExtras(); if (S.tab === 'plan') loadPlan(); checkVersion(); } });
    setInterval(() => { loadBoard(); loadHome(); loadExtras(); if (S.tab === 'plan') loadPlan(); }, 5 * 60 * 1000); // 4 a.m. rollover, evening mode, "I went" opening up
    setInterval(tickTimer, 1000);
    resyncPush();
    checkVersion();
  }
  render();
  loadBoard();
  loadHome();
  loadLists();
  loadExtras();
}

// New version on GitHub? Offer a one-tap refresh (phones otherwise cache for a while).
async function checkVersion() {
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const { version } = await r.json();
    if (version && String(version) !== APP_VERSION && !$('#updateBar')) {
      const bar = document.createElement('div');
      bar.id = 'updateBar';
      bar.innerHTML = `<span>A new version of One Thing is ready.</span><button>Refresh</button>`;
      bar.querySelector('button').onclick = () => location.replace(location.pathname + '?v=' + encodeURIComponent(version));
      document.body.appendChild(bar);
    }
  } catch { /* offline: try again later */ }
}

let lastTab = null;
function render() {
  if (S.tab !== lastTab) { main().scrollTop = 0; $('#fab').classList.remove('tuck'); lastTab = S.tab; }
  const lit = S.tab === 'all' ? 'today' : S.tab === 'event' ? (S.evBack === 'today' ? 'today' : 'plan') : S.tab;
  document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === lit));
  document.body.dataset.tab = S.tab;
  renderScene();
  $('#fab').hidden = ['add', 'settings', 'help', 'event'].includes(S.tab);
  $('#fab').setAttribute('aria-label', S.tab === 'plan' ? 'Add an event' : 'Add a task');
  if (S.tab !== 'today') S.pauseOpen = null;
  if (S.tab === 'today') { renderToday(); loadBoard(); loadExtras(); }
  else if (S.tab === 'plan') { renderPlan(); loadPlan(); }
  else if (S.tab === 'event') renderEvent();
  else if (S.tab === 'home') { renderHome(); loadHome(); }
  else if (S.tab === 'lists') { renderLists(); loadLists(); }
  else if (S.tab === 'add') renderAdd();
  else if (S.tab === 'store') { renderStore(); loadHome(); }
  else if (S.tab === 'all') renderAll();
  else if (S.tab === 'help') renderHelp();
  else renderSettings();
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
  S.clockSkew = new Date(data.now).getTime() - Date.now();
  if (S.tab === 'today' && !S.pauseOpen) renderToday();
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
  if (S.tab === 'today') { renderScene(); if (!S.pauseOpen) renderToday(); }
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
    ${todaysPlans()}
    ${togetherBlock(b.together)}
    <section class="cards">${order.map((p, i) => card(p, b[p], b.day, i)).join('')}</section>
    ${b.week_done ? `<p class="weekdone"><b>${b.week_done}</b> done together this week</p>` : ''}
    <div class="center-row"><button class="see-all" data-act="seeAll"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1.2" fill="currentColor"/><circle cx="4" cy="12" r="1.2" fill="currentColor"/><circle cx="4" cy="18" r="1.2" fill="currentColor"/></svg>See all tasks${S.extras ? ` · ${S.extras.open_total}` : ''}</button></div>`;
  tickTimer();
  const ta = $('#pauseNote'); if (ta && S.pauseDraft?.focus) { ta.focus(); S.pauseDraft.focus = false; }
}

// ----- Do ours together -----
function togetherBlock(tg) {
  if (!tg) return '';
  const meP = me();
  if (tg.status === 'running') {
    return `
    <section class="together running" aria-label="Doing it together">
      <div class="ring"><svg viewBox="0 0 112 112" aria-hidden="true"><circle cx="56" cy="56" r="48" class="ring-bg"/><circle id="tgRing" cx="56" cy="56" r="48" class="ring-fg" stroke-dasharray="301.6" stroke-dashoffset="0" transform="rotate(-90 56 56)"/></svg>
        <div class="ring-text"><div id="tgClock" class="clock">25:00</div><div class="of">of 25 min</div></div></div>
      <div class="tg-body">
        <div class="tg-title">Doing it together</div>
        <div class="tg-who"><span class="who p1">${esc(nameOf('p1'))} · in</span><span class="who p2">${esc(nameOf('p2'))} · in</span></div>
        <div class="tg-bonus">${tg.bonus_paid ? 'Bonus earned: <b>+5 Stars each</b>' : 'Both finish before it ends: <b>+5 bonus Stars each</b>'}</div>
        <button class="link light" data-act="tgEnd">End early</button>
      </div>
    </section>`;
  }
  if (tg.status === 'invited') {
    if (tg.started_by === meP) return `<section class="together invite"><div>Waiting for ${esc(nameOf(other(meP)))} to join…</div><button class="link light" data-act="tgEnd">Cancel</button></section>`;
    if (isPerson(meP)) return `<section class="together invite"><div><b>${esc(nameOf(tg.started_by))}</b> wants to do tasks together. 25 minutes, bonus Stars if you both finish.</div>
      <div class="row-buttons"><button class="primary" data-act="tgJoin">Join</button><button class="ghost light" data-act="tgEnd">Not now</button></div></section>`;
    return `<section class="together invite"><div>${esc(nameOf(tg.started_by))} invited ${esc(nameOf(other(tg.started_by)))} to do tasks together.</div></section>`;
  }
  return isPerson(meP) ? `<button class="together-start" data-act="tgStart">${ICON.people}<span>Do ours together</span></button>` : '';
}

function tickTimer() {
  const tg = S.board?.together;
  const clock = $('#tgClock'); if (!clock || !tg || tg.status !== 'running') return;
  const left = Math.max(0, new Date(tg.ends_at).getTime() - (Date.now() + (S.clockSkew || 0)));
  const m = Math.floor(left / 60000), sec = Math.floor((left % 60000) / 1000);
  clock.textContent = `${m}:${String(sec).padStart(2, '0')}`;
  const ring = $('#tgRing'); if (ring) ring.setAttribute('stroke-dashoffset', String(301.6 * (1 - left / (25 * 60000))));
  if (left === 0 && !S.timerEnded) { S.timerEnded = true; toast('Time! Nice work, you two.'); setTimeout(() => { S.timerEnded = false; loadBoard(); }, 1500); }
}

// ----- Pause panel -----
function addDays(dayStr, n) { const d = parseDay(dayStr); d.setDate(d.getDate() + n); return localISO(d); }
function pauseUntil(draft, day) {
  if (draft.until === '2d') return addDays(day, 2);
  if (draft.until === 'week') return addDays(day, 7);
  if (draft.until === 'date' && draft.date) return draft.date;
  return addDays(day, 1);
}
function pausePanel(p, t, day) {
  const d = S.pauseDraft;
  const until = pauseUntil(d, day);
  const short = (iso) => fmtDay(iso, { weekday: 'short' });
  const opt = (k, label) => `<button type="button" role="radio" aria-checked="${d.until === k}" class="${d.until === k ? 'on' : ''}" data-act="pauseUntil" data-k="${k}">${label}</button>`;
  const warn = t.due_date && until > t.due_date
    ? `<div class="warn" role="alert">Heads up: it's due ${esc(fmtDay(t.due_date))}, and ${esc(fmtDay(until))} is after that. You can still go ahead.</div>` : '';
  return `
  <section class="pause-panel" aria-label="Pause this task">
    <div class="pp-title">${ICON.pause}Pause for now</div>
    <label>Where did you leave off?
      <textarea id="pauseNote" rows="2" placeholder="e.g. top two shelves done, paint cans next">${esc(d.note)}</textarea></label>
    <div class="pp-hint">${STAR}+3 Stars for a progress note</div>
    <div class="pp-label">Come back on</div>
    <div class="pp-dates" role="radiogroup" aria-label="Come back on">
      ${opt('1d', 'Tomorrow')}${opt('2d', 'In 2 days')}${opt('week', `Next week · ${esc(short(addDays(day, 7)))}`)}
      <label class="pick ${d.until === 'date' ? 'on' : ''}">${ICON.cal}<span>${d.until === 'date' && d.date ? esc(fmtDay(d.date)) : 'Pick a date'}</span>
        <input type="date" id="pauseDate" min="${addDays(day, 1)}" value="${esc(d.date || '')}" aria-label="Pick a date"></label>
    </div>
    ${warn}
    <label class="switch-row"><span>Give me a new task now<small>Doesn't use your swap</small></span>
      <input type="checkbox" id="pauseReplace" ${d.replace ? 'checked' : ''}><span class="switch" aria-hidden="true"></span></label>
    <div class="row-buttons">
      <button class="ghost" data-act="pauseCancel">Cancel</button>
      <button class="btn-blue" data-act="pauseGo" data-p="${p}" data-id="${t.id}">Pause till ${esc(short(until))}</button>
    </div>
  </section>`;
}

function card(p, c, day, i) {
  const open = c.items.filter((t) => ['pinned', 'pick', 'shared'].includes(t.kind));
  const done = c.items.filter((t) => t.kind === 'done');
  const paused = c.items.filter((t) => t.kind === 'paused');
  const due = c.items.filter((t) => t.kind === 'due');
  let footer = '';
  if (c.can_another) footer = `<button class="another" data-act="another" data-p="${p}">${done.length ? 'Give me another' : 'Give me one'}</button>`;
  else if (!open.length && done.length) footer = `<div class="clear">Done for today</div>`;
  else if (!open.length) footer = `<div class="clear">${c.open_count ? 'Nothing for today.' : 'All clear'}</div>`;
  return `
  <article class="card note ${p} ${i % 2 ? 'tilt-r' : 'tilt-l'}">
    <span class="tape" aria-hidden="true"></span>
    <div class="card-head">
      <h2>${esc(nameOf(p))}</h2>
      <span class="chips"><span class="chip pins" title="Pinned">${ICON.pin}${c.pin_count}/${c.pin_limit}</span><span class="chip ${c.swap_used ? 'used' : ''}">${c.swap_used ? 'Swap used' : '1 swap left'}</span></span>
    </div>
    ${open.map((t) => taskRow(p, t, c, day)).join('')}
    ${due.length ? dueRows(p, due, c, day) : ''}
    ${paused.map((t) => pausedRow(p, t)).join('')}
    ${done.map((t) => doneRow(t)).join('')}
    ${footer}
  </article>`;
}

function taskRow(p, t, c, day) {
  const notes = t.progress_notes || [];
  const last = notes[notes.length - 1];
  const inProgress = notes.length > 0;
  const panelOpen = S.pauseOpen === t.id;
  const pinned = t.kind === 'pinned';
  const pinFull = c.pin_count >= c.pin_limit;
  const badges = [
    t.priority === 2 ? `<span class="badge red">High</span>` : '',
    dueLabel(t.due_date, day),
    t.owner === 'both' ? `<span class="badge blue">Together</span>` : '',
    inProgress ? `<span class="badge blue">In progress</span>` : '',
    t.kind === 'pick' && t.days >= 1 && !inProgress ? `<span class="badge">Day ${t.days + 1}</span>` : '',
    pinned ? `<span class="badge pinned">${ICON.pinFill}Pinned</span>` : '',
  ].join('');
  const canSwap = !c.swap_used && t.kind === 'pick';
  const nudge = t.kind === 'pick' && t.days >= 3 && !inProgress
    ? `<div class="nudge">This one's been here ${t.days + 1} days. Too big?
         <button class="link" data-act="split" data-p="${p}" data-id="${t.id}" data-title="${esc(t.title)}">Break it into a smaller first step</button></div>`
    : '';
  const data = `data-p="${p}" data-id="${t.id}" data-title="${esc(t.title)}"`;
  return `
  <div class="task ${t.kind}">
    <div class="title-row"><div class="title">${esc(t.title)}</div>
      ${pinned ? `<button class="pin-btn on" aria-label="Unpin ${esc(t.title)}" data-act="unpin" ${data}>${ICON.pinFill}</button>`
        : `<button class="pin-btn" aria-label="${pinFull ? 'Pins full (3)' : 'Pin to my Today'}" data-act="pin" ${data} ${pinFull ? 'disabled' : ''}>${ICON.pin}</button>`}</div>
    ${badges ? `<div class="badges">${badges}</div>` : ''}
    ${last ? `<div class="leftoff"><b>Left off:</b> ${esc(last.note)}</div>` : ''}
    ${t.notes ? `<div class="notes">${esc(t.notes)}</div>` : ''}
    ${nudge}
    ${panelOpen ? pausePanel(p, t, day) : `
    <div class="actions">
      <button class="btn-done" data-act="done" ${data}>${ICON.check}<span>Done</span></button>
      <button class="btn-pause" aria-label="Pause: note where you left off and pick a day to come back" aria-expanded="false" data-act="pause" ${data}>${ICON.pause}</button>
      <button class="btn-swap" aria-label="Not today (uses your swap)" data-act="swap" ${data} ${canSwap ? '' : 'disabled'}>${ICON.cross}</button>
    </div>`}
  </div>`;
}

function dueRows(p, due, c, day) {
  const shown = due.slice(0, 2);
  const full = c.pin_count >= c.pin_limit;
  return `<div class="due-box">
    ${shown.map((t) => `<div class="due-row">
      <span class="due-label">${t.due_date < day ? 'Overdue' : 'Due today'}</span>
      <span class="due-title">${esc(t.title)}</span>
      <button class="due-pin" data-act="pin" data-p="${p}" data-id="${t.id}" ${full ? 'disabled' : ''}>${ICON.pin}<span>${full ? 'Pins full' : 'Pin it'}</span></button>
    </div>`).join('')}
    ${due.length > 2 ? `<button class="link small" data-act="seeAll">+${due.length - 2} more due</button>` : ''}
  </div>`;
}

function pausedRow(p, t) {
  return `
  <div class="task paused-row">
    <span class="pausemark" aria-hidden="true">${ICON.pause}</span>
    <div class="title">${esc(t.title)}<span class="back">Back ${esc(fmtDay(t.not_before))}</span></div>
    <button class="link small" data-act="resume" data-p="${p}" data-id="${t.id}">Undo</button>
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

  if (act === 'settings') { S.tab = 'settings'; return render(); }
  if (act === 'help') { S.tab = 'help'; return render(); }
  if (act === 'tour') return showTour(0);
  if (act === 'seeAll') { S.tab = 'all'; return render(); }
  if (act === 'backToday') { S.tab = 'today'; return render(); }
  if (['goPlan', 'planDay', 'planWeek', 'planToday', 'newEvent', 'editEvent', 'evCancel', 'went', 'unwent'].includes(act)) return onPlanClick(act, b);
  if (act === 'pin' || act === 'unpin') {
    const r = await rpc(act === 'pin' ? 'pin_task' : 'unpin_task', { p, p_task: id });
    if (r) { S.board = r; renderToday(); if (act === 'pin') toast('Pinned to Today'); }
    return;
  }

  if (act === 'done') {
    b.disabled = true;
    const r = await rpc('complete_task', { p_task: id, p_by: p });
    if (!r) return;
    if (r.award) celebrate(`+${r.award} Stars!`, b);
    if (r.together_bonus) setTimeout(() => celebrate('+5 each: together bonus!', $('.together') || b), 700);
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
    S.pauseOpen = id; S.pauseDraft = { note: '', until: '1d', date: '', replace: true, focus: true };
    return renderToday();
  }
  if (act === 'pauseUntil') { syncPauseDraft(); S.pauseDraft.until = b.dataset.k; return renderToday(); }
  if (act === 'pauseCancel') { S.pauseOpen = null; S.pauseDraft = null; return renderToday(); }
  if (act === 'pauseGo') {
    syncPauseDraft();
    const d = S.pauseDraft; const until = pauseUntil(d, S.board.day);
    b.disabled = true;
    const r = await rpc('pause_task', { p, p_task: id, p_note: d.note, p_until: until, p_replace: d.replace });
    S.pauseOpen = null; S.pauseDraft = null;
    if (!r) return renderToday();
    S.board = r; renderToday();
    if (r.award) celebrate(`+${r.award} Stars!`, $('.paused-row') || $('.cards'));
    toast(`Paused. Back ${fmtDay(r.back, { weekday: 'long' })}${d.note.trim() ? ' with your note' : ''}.`);
    loadHome();
  }

  if (act === 'resume') {
    const r = await rpc('resume_task', { p, p_task: id }); if (r) { S.board = r; renderToday(); toast('Unpaused'); }
  }

  if (act === 'tgStart') {
    const r = await rpc('start_together', { p: me() }); if (!r) return;
    S.board = r; renderToday(); notify({ event: 'together_invite' });
    toast(`Invite sent to ${nameOf(other(me()))}`);
  }
  if (act === 'tgJoin') { const r = await rpc('join_together', { p: me() }); if (r) { S.board = r; renderToday(); toast('Timer started. You got this.'); } }
  if (act === 'tgEnd') { const r = await rpc('end_together'); if (r) { S.board = r; renderToday(); } }

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

  if (['listTab', 'usualAdd', 'usualHide', 'shopTick', 'shopEdit', 'listReady', 'finishTrip'].includes(act)) return onListClick(act, b);

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
    // Empty spots are just the size of their "+", so they never cover a placed item.
    const PLUS = 52;
    const box = it ? s : { x: (s.px ?? s.x + s.w / 2) - PLUS / 2, y: (s.py ?? s.y + s.h / 2) - PLUS / 2, w: PLUS, h: PLUS };
    return `<button class="spot ${it ? 'filled' : 'empty'}" data-act="spot" data-spot="${k}"
      style="left:${(box.x / 360) * 100}%;top:${(box.y / 430) * 100}%;width:${(box.w / 360) * 100}%;height:${(box.h / 430) * 100}%"
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
      <button class="btn-soft" data-act="spot" data-spot="wallpaper">Wallpaper</button>
      <button class="btn-soft" data-act="spot" data-spot="floor">Floor</button>
    </div>
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
  const s = allSpots()[spot];
  const current = h.owned.find((o) => o.spot === spot);
  const stored = h.owned.filter((o) => !o.spot && o.item_spot === spot);
  const d = $('#sheet');
  d.innerHTML = `
    <div class="stack">
      <h2>${esc(s.label)}</h2>
      ${current ? ownedLine(current, `<button class="btn-soft small" data-sheet="store" data-id="${current.id}">To Storage</button>`)
        : `<p class="muted">${STYLE_SPOTS[spot] ? 'The original look. Find new ones in the Store under Walls & floors.' : 'Nothing here yet.'}</p>`}
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
const CATS = { all: 'All', limited: 'Limited', furniture: 'Furniture', plants: 'Plants', decor: 'Decor', lighting: 'Lighting', rugs: 'Rugs', walls: 'Walls & floors' };

function renderStore() {
  const h = S.home;
  if (!h) { main().innerHTML = `${header('New stock every Monday', 'Store')}<div class="center muted">Loading…</div>`; return; }
  const days = h.restock_in;
  const cats = ['all', ...Object.keys(CATS).filter((c) => c !== 'all' && h.stock.some((i) => (c === 'limited' ? i.season : i.category === c)))];
  let items = h.stock;
  if (S.storeSpot) items = items.filter((i) => i.spot === S.storeSpot);
  else if (S.storeCat === 'limited') items = items.filter((i) => i.season);
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
        <div class="item-art">${i.season ? `<span class="limited">Limited · ${esc(i.season)}</span>` : ''}${itemThumb(i.id, i.spot)}</div>
        <div class="item-name">${esc(i.name)}</div>
        <div class="item-price">${STAR}${i.price}</div>
        ${btn}
      </article>`;
  };

  main().innerHTML = `
    ${header(`New stock every Monday · ${days === 1 ? '1 day' : days + ' days'} left`, 'Store')}
    <div class="cats" role="tablist" aria-label="Categories">
      ${S.storeSpot ? `<button class="cat on" data-act="clearSpot">For: ${esc(allSpots()[S.storeSpot].label)} ✕</button>`
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
  const where = occupant ? `\n\nIt replaces the ${occupant.name}, which moves to Storage.` : `\n\nIt goes in the ${allSpots()[i.spot].label.toLowerCase()}.`;
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
    ${isPerson(me()) ? `<label class="switch-row"><span>Pin to my Today<small>Shows on your card until it's done</small></span><input type="checkbox" id="addPin"><span class="switch" aria-hidden="true"></span></label>` : ''}
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
    if ($('#addPin')?.checked && (row.owner === me() || row.owner === 'both')) await rpc('pin_task', { p: me(), p_task: data.id });
    toast(`Added to ${row.owner === me() ? 'your' : row.owner === 'both' ? 'both' : `${nameOf(row.owner)}'s`} list`);
    S.addPri = 1;
    renderAdd();
    loadBoard();
    await loadHome();
    if (starsBefore != null && S.home && S.home.stars > starsBefore) celebrate('+1 Star', $('#addBtn'));
  };
}


// ---------- Shopping lists ------------------------------------------------------
const LISTS = { groceries: 'Groceries', household: 'Household' };

async function loadLists() {
  if (!S.status?.member) return;
  const { data, error } = await sb.rpc('get_lists');
  if (error) { console.warn(error); return; }
  S.lists = data;
  if (S.tab === 'lists' && document.activeElement?.id !== 'shopInput') renderLists();
  else if (S.tab === 'lists') renderListBody();
}

function tripStars() { return (S.lists?.trips_today ?? 0) >= 2 ? 0 : 10; }   // flat 10 per order, 2 a day

function renderLists() {
  const L = S.lists;
  main().innerHTML = `
    ${header(`Shared with ${esc(nameOf(isPerson(me()) ? other(me()) : 'p2'))}`, 'Lists')}
    <div class="seg wide" role="tablist" aria-label="Lists" id="listSeg">
      ${Object.entries(LISTS).map(([k, label]) => {
        const n = L ? L.lists[k].items.filter((i) => !i.checked_at).length : 0;
        return `<button role="tab" aria-selected="${S.list === k}" class="${S.list === k ? 'on' : ''}" data-act="listTab" data-list="${k}">${label}${n ? ` <span class="muted">· ${n}</span>` : ''}</button>`;
      }).join('')}
    </div>
    <form class="panel add-shop" id="shopForm">
      <div class="add-row">
        <label class="sr" for="shopInput">Add items</label>
        <input id="shopInput" autocomplete="off" enterkeyhint="done" placeholder="milk, eggs, 2 avocados…" value="${esc(S.listInput)}">
        <button class="primary" type="submit">Add</button>
      </div>
      <div class="usual" id="usual"></div>
    </form>
    <div id="listBody">${L ? '' : '<div class="center muted">Loading…</div>'}</div>`;
  $('#shopForm').onsubmit = async (e) => {
    e.preventDefault();
    const text = $('#shopInput').value.trim(); if (!text) return;
    const r = await rpc('add_shop_items', { p_list: S.list, p_text: text, p_by: isPerson(me()) ? me() : 'wall' });
    if (!r) return;
    S.lists = r; S.listInput = '';
    renderLists(); $('#shopInput')?.focus();
    if (r.added === 0) toast('Already on the list');
    if (S.list === 'groceries') loadBoard();
  };
  renderListBody();
}

function renderUsual() {
  const box = $('#usual'); if (!box || !S.lists) return;
  const typed = S.listInput.trim().toLowerCase();
  let chips = S.lists.lists[S.list].usual;
  chips = typed ? chips.filter((u) => u.key.includes(typed)) : chips;
  chips = chips.slice(0, 8);
  box.innerHTML = chips.length ? `<span class="usual-label">Usual</span>` + chips.map((u) => `
    <span class="chip-usual"><button type="button" data-act="usualAdd" data-name="${esc(u.name)}">+ ${esc(u.name)}</button><button type="button" class="x" aria-label="Stop suggesting ${esc(u.name)}" data-act="usualHide" data-key="${esc(u.key)}">✕</button></span>`).join('') : '';
}

function renderListBody() {
  renderUsual();
  const body = $('#listBody'); if (!body || !S.lists) return;
  const items = S.lists.lists[S.list].items;
  const open = items.filter((i) => !i.checked_at);
  const got = items.filter((i) => i.checked_at);
  const who = (p) => isPerson(p) ? `<span class="who-dot ${p}" title="Added by ${esc(nameOf(p))}">${esc(nameOf(p)[0] || '?')}</span>` : '';
  const row = (i) => `
    <li class="shop-row ${i.checked_at ? 'got' : ''}">
      <button class="tick" aria-label="${i.checked_at ? 'Put back' : 'Got it'}: ${esc(i.name)}" data-act="shopTick" data-id="${i.id}">${i.checked_at ? ICON.check : ''}</button>
      <button class="shop-name" data-act="shopEdit" data-id="${i.id}">
        <span>${esc(i.name)}${i.qty ? ` <span class="qty">×${esc(i.qty)}</span>` : ''}</span>
        ${i.note ? `<span class="shop-note">${esc(i.note)}</span>` : ''}
      </button>
      ${who(i.added_by)}
    </li>`;
  const n = got.length; const st = tripStars(n);
  body.innerHTML = `
    ${open.length || got.length ? `<button class="ready-btn" data-act="listReady">${ICON.bell}<span>List is ready — tell ${esc(nameOf(isPerson(me()) ? other(me()) : 'p2'))}</span></button>` : ''}
    ${S.list === 'groceries' && S.lists.order_task_open ? `<div class="order-note">8+ items: <b>Order groceries</b> is on both your cards.</div>` : ''}
    ${items.length ? `<ul class="shop-list">
      ${open.map(row).join('')}
      ${got.length ? `<li class="cart-label">In the cart · ${got.length}</li>${got.map(row).join('')}` : ''}
    </ul>` : `<p class="center muted">Nothing on the ${LISTS[S.list]} list. Add things above — separate several with commas.</p>`}
    ${n ? `<button class="finish-btn" data-act="finishTrip">Got everything · ${STAR}${st ? '+' + st : 'no more Stars today'}</button>` : ''}`;
}

function openShopEdit(item) {
  const d = $('#editDialog');
  d.innerHTML = `
  <form method="dialog" class="stack" id="shopEditForm">
    <h2>Edit item</h2>
    <label>Item<input name="name" required value="${esc(item.name)}"></label>
    <div class="two">
      <label>Quantity<input name="qty" value="${esc(item.qty ?? '')}" placeholder="e.g. 2"></label>
      <label>Note<input name="note" value="${esc(item.note ?? '')}" placeholder="e.g. ripe ones"></label>
    </div>
    <div class="row-buttons">
      <button class="primary" value="save">Save</button>
      <button value="delete" class="danger" formnovalidate>Remove</button>
    </div>
    <button value="cancel" class="ghost" formnovalidate>Cancel</button>
  </form>`;
  d.showModal();
  d.onclose = async () => {
    const action = d.returnValue; d.returnValue = '';
    const f = new FormData($('#shopEditForm'));
    if (action === 'save') {
      const upd = { name: String(f.get('name')).trim(), qty: String(f.get('qty') || '').trim() || null, note: String(f.get('note') || '').trim() || null };
      if (!upd.name) return;
      const { error } = await sb.from('shop_items').update(upd).eq('id', item.id);
      if (error) return toast(error.message);
    } else if (action === 'delete') {
      const { error } = await sb.from('shop_items').delete().eq('id', item.id);
      if (error) return toast(error.message);
    } else return;
    loadLists();
  };
}

async function onListClick(act, b) {
  const by = isPerson(me()) ? me() : 'wall';
  if (act === 'listTab') { S.list = b.dataset.list; S.listInput = ''; return renderLists(); }
  if (act === 'usualAdd') {
    const r = await rpc('add_shop_items', { p_list: S.list, p_text: b.dataset.name, p_by: by });
    if (r) { S.lists = r; S.listInput = ''; renderLists(); }
  }
  if (act === 'usualHide') { const r = await rpc('hide_usual', { p_list: S.list, p_key: b.dataset.key }); if (r) { S.lists = r; renderListBody(); } }
  if (act === 'shopTick') { const r = await rpc('toggle_shop_item', { p_id: b.dataset.id, p_by: by }); if (r) { S.lists = r; renderListBody(); } }
  if (act === 'shopEdit') { const it = S.lists.lists[S.list].items.find((i) => i.id === b.dataset.id); if (it) openShopEdit(it); }
  if (act === 'listReady') {
    notify({ event: 'list_ready', list: S.list });
    toast(`Told ${nameOf(isPerson(me()) ? other(me()) : 'p2')} the ${LISTS[S.list]} list is ready`);
  }
  if (act === 'finishTrip') {
    const n = S.lists.lists[S.list].items.filter((i) => i.checked_at).length;
    if (!confirm(`Got all ${n} ticked item${n === 1 ? '' : 's'}?\n\nThey'll come off the list${tripStars(n) ? ` and you'll earn ${tripStars(n)} Stars` : ''}. Anything not ticked stays on.`)) return;
    const r = await rpc('finish_trip', { p_list: S.list, p_by: by }); if (!r) return;
    S.lists = r; renderLists();
    celebrate(r.award ? `+${r.award} Stars!` : 'All done!', $('#listBody'));
    if (isPerson(me())) notify({ event: 'trip_done', list: S.list, items: r.items, stars: r.award });
    loadHome(); loadBoard();
  }
}

// Typing in the pause note / list box shouldn't lose what you typed on refresh.
function syncPauseDraft() {
  if (!S.pauseDraft) return;
  const n = $('#pauseNote'); if (n) S.pauseDraft.note = n.value;
  const r = $('#pauseReplace'); if (r) S.pauseDraft.replace = r.checked;
}
function onMainInput(e) {
  const t = e.target;
  if (t.id === 'pauseNote') S.pauseDraft && (S.pauseDraft.note = t.value);
  if (t.id === 'pauseReplace') S.pauseDraft && (S.pauseDraft.replace = t.checked);
  if (t.id === 'pauseDate' && e.type === 'change' && t.value) { syncPauseDraft(); S.pauseDraft.until = 'date'; S.pauseDraft.date = t.value; renderToday(); }
  if (t.id === 'shopInput') { S.listInput = t.value; renderUsual(); }
}

// ---------- Plan (shared calendar) ----------------------------------------------
const WHOSE_LABEL = (w) => w === 'both' ? 'Both of us' : nameOf(w);
const REPEAT = { none: 'Never', weekly: 'Weekly', biweekly: '2 weeks', monthly: 'Monthly' };
const REPEAT_LONG = { weekly: 'Every week', biweekly: 'Every 2 weeks', monthly: 'Every month' };
const REPEAT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>`;

// "19:30" → "7:30 PM"; a range drops the first AM/PM when both match.
function clock(hm) {
  if (!hm) return '';
  const [h, m] = hm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
function timeLabel(ev) {
  if (ev.all_day) return 'All day';
  if (!ev.end_time) return clock(ev.start_time);
  const a = clock(ev.start_time), b = clock(ev.end_time);
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)} – ${b}` : `${a} – ${b}`;
}
const todayDay = () => S.plan?.day ?? S.extras?.day ?? S.board?.day ?? localISO();
function dayHeading(d) {
  const t = todayDay();
  const base = fmtDay(d, { weekday: 'short', month: 'short', day: 'numeric' }).replace(',', '');
  if (d === t) return `Today · ${base}`;
  if (d === addDays(t, 1)) return `Tomorrow · ${base}`;
  return base;
}
const weekStart = (d) => addDays(d, -parseDay(d).getDay());   // weeks run Sunday–Saturday

async function loadPlan() {
  if (!S.status?.member) return;
  if (!S.planWeek) S.planWeek = weekStart(todayDay());
  const want = S.planWeek;
  const { data, error } = await sb.rpc('get_plan', { p_from: want, p_to: addDays(want, 6) });
  if (error || data?.error) { console.warn(error || data.error); return; }
  if (want !== S.planWeek) return;   // they moved on to another week meanwhile
  S.plan = { ...data, week: want };
  if (!S.planDay) S.planDay = data.day;
  if (S.tab === 'plan') renderPlan();
}

async function loadExtras() {
  if (!S.status?.member) return;
  const { data, error } = await sb.rpc('get_today_extras');
  if (error || data?.error) { console.warn(error || data?.error); return; }
  S.extras = data;
  if (S.tab === 'today' && !S.pauseOpen) renderToday();
}

function eventCard(ev, compact = false) {
  const went = ev.went
    ? `<span class="went-tag">${ICON.check}Went</span><button class="link small" data-act="unwent" data-id="${ev.id}" data-d="${ev.date}">Undo</button>`
    : ev.can_go ? `<button class="btn-went" data-act="went" data-id="${ev.id}" data-d="${ev.date}" aria-label="${ev.whose === 'both' ? 'We went: +10 Stars each' : 'I went: +10 Stars'}">${ev.whose === 'both' ? (compact ? 'We went · +10' : 'We went · +10 each') : 'I went · +10'}</button>` : '';
  if (compact) {
    return `
    <div class="plan-row ${ev.went ? 'is-went' : ''}">
      <span class="ev-bar ${ev.whose}" aria-hidden="true"></span>
      <button class="plan-main" data-act="editEvent" data-id="${ev.id}" data-d="${ev.date}">
        <span class="plan-title">${esc(ev.title)}</span>
        <span class="plan-sub">${esc(timeLabel(ev))} · ${esc(WHOSE_LABEL(ev.whose))}</span>
      </button>
      <span class="plan-act">${went}</span>
    </div>`;
  }
  return `
  <article class="ev-card ${ev.went ? 'is-went' : ''}">
    <span class="ev-bar ${ev.whose}" aria-hidden="true"></span>
    <div class="ev-body">
      <button class="ev-open" data-act="editEvent" data-id="${ev.id}" data-d="${ev.date}" aria-label="Edit ${esc(ev.title)}">
        <span class="ev-top"><span class="ev-title">${esc(ev.title)}</span><span class="ev-time">${esc(timeLabel(ev))}</span></span>
        <span class="ev-meta"><span class="who-chip ${ev.whose}">${esc(WHOSE_LABEL(ev.whose))}</span>
          ${ev.location ? `<span class="ev-loc">${esc(ev.location)}</span>` : ''}
          ${ev.repeat !== 'none' ? `<span class="ev-loc">${REPEAT_ICON}${REPEAT_LONG[ev.repeat]}</span>` : ''}</span>
      </button>
      ${went ? `<div class="ev-went">${went}</div>` : ''}
    </div>
  </article>`;
}

function todaysPlans() {
  const items = S.extras?.items ?? [];
  if (!items.length) return '';
  return `
  <section class="plans-strip" aria-label="Today's plans">
    <div class="plans-head"><span>Today's plans</span><button class="link small" data-act="goPlan">See week</button></div>
    ${items.map((ev) => eventCard(ev, true)).join('')}
  </section>`;
}

function renderPlan() {
  if (!S.planWeek) S.planWeek = weekStart(todayDay());
  const ws = S.planWeek;
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const P = S.plan?.week === ws ? S.plan : null;
  const items = P?.items ?? [];
  const sel = days.includes(S.planDay) ? S.planDay : (days.includes(todayDay()) ? todayDay() : ws);
  const range = `${fmtDay(ws, { month: 'short', day: 'numeric' })} – ${fmtDay(addDays(ws, 6), { month: 'short', day: 'numeric' })}`;
  const dots = (d) => {
    const ws_ = [...new Set(items.filter((e) => e.date === d).map((e) => e.whose))];
    return `<span class="dots">${ws_.map((w) => `<i class="dot ${w}"></i>`).join('')}</span>`;
  };
  const strip = days.map((d) => `
    <button class="day ${d === sel ? 'on' : ''} ${d === todayDay() ? 'is-today' : ''}" data-act="planDay" data-d="${d}" aria-pressed="${d === sel}"
      aria-label="${esc(fmtDay(d, { weekday: 'long', month: 'long', day: 'numeric' }))}">
      <span class="dw">${esc(fmtDay(d, { weekday: 'short' }))}</span><span class="dn">${parseDay(d).getDate()}</span>${dots(d)}</button>`).join('');
  // Agenda: the picked day first, then the rest of the week that has plans.
  const order = [sel, ...days.filter((d) => d > sel && items.some((e) => e.date === d))];
  const agenda = !P ? `<div class="center muted">Loading…</div>` : order.map((d) => {
    const evs = items.filter((e) => e.date === d);
    return `<h3 class="day-h">${esc(dayHeading(d))}</h3>
      ${evs.length ? evs.map((e) => eventCard(e)).join('') : `<div class="ev-empty">Nothing planned. <button class="link small" data-act="newEvent" data-d="${d}">Add something</button></div>`}`;
  }).join('');
  main().innerHTML = `
    ${header(esc(range), 'Plan')}
    <div class="week">
      <button class="wk-nav" data-act="planWeek" data-n="-7" aria-label="Previous week">‹</button>
      <div class="days">${strip}</div>
      <button class="wk-nav" data-act="planWeek" data-n="7" aria-label="Next week">›</button>
    </div>
    ${ws !== weekStart(todayDay()) ? `<div class="center-row"><button class="link small" data-act="planToday">Back to this week</button></div>` : ''}
    <div class="agenda">${agenda}</div>`;
}

// Add / edit an event (full screen, like Add).
function openEvent(id, date) {
  const ev = id ? (S.plan?.items ?? []).concat(S.extras?.items ?? []).find((e) => e.id === id) : null;
  S.ev = ev ? {
    id: ev.id, title: ev.title, whose: ev.whose, date: ev.start_date, all_day: ev.all_day,
    start: ev.start_time || '', end: ev.end_time || '', repeat: ev.repeat, location: ev.location || '', notes: ev.notes || '',
  } : {
    id: null, title: '', whose: isPerson(me()) ? me() : 'both', date: date || S.planDay || todayDay(), all_day: false,
    start: '', end: '', repeat: 'none', location: '', notes: '',
  };
  S.evBack = S.tab === 'event' ? (S.evBack || 'plan') : S.tab;
  S.tab = 'event'; render();
}

function renderEvent() {
  const e = S.ev;
  if (!e) { S.tab = 'plan'; return render(); }
  const whoBtn = (w) => `<button type="button" class="${e.whose === w ? 'on' : ''} ${w}" data-whose="${w}">${esc(w === me() ? 'Me' : WHOSE_LABEL(w))}</button>`;
  const repBtn = (r) => `<button type="button" class="${e.repeat === r ? 'on' : ''}" data-rep="${r}">${REPEAT[r]}</button>`;
  main().innerHTML = `
  <header class="top ev-head">
    <button class="link" data-act="evCancel">Cancel</button>
    <h1 class="h-mid">${e.id ? 'Edit event' : 'New event'}</h1>
    <span class="spacer"></span>
  </header>
  <form id="evForm" class="panel stack" novalidate>
    <label>Title<input name="title" maxlength="120" required value="${esc(e.title)}" placeholder="Dinner with Mom" enterkeyhint="done" autocomplete="off"></label>
    <div class="field"><span class="label">Whose?</span>
      <div class="seg" id="whoseSeg">${['p1', 'p2', 'both'].map(whoBtn).join('')}</div></div>
    <label class="switch-row"><span>All day</span><input type="checkbox" name="all_day" ${e.all_day ? 'checked' : ''}><span class="switch" aria-hidden="true"></span></label>
    <label>Date<input type="date" name="date" required value="${esc(e.date)}"></label>
    <div class="two times" ${e.all_day ? 'hidden' : ''}>
      <label>Starts<input type="time" name="start" value="${esc(e.start)}"></label>
      <label><span>Ends <span class="opt">(optional)</span></span><input type="time" name="end" value="${esc(e.end)}"></label>
    </div>
    <div class="field"><span class="label">Repeat</span>
      <div class="seg" id="repSeg">${Object.keys(REPEAT).map(repBtn).join('')}</div></div>
    <label><span>Location <span class="opt">(optional)</span></span><input name="location" maxlength="200" value="${esc(e.location)}" autocomplete="off"></label>
    <label><span>Notes <span class="opt">(optional)</span></span><textarea name="notes" rows="2" maxlength="1000">${esc(e.notes)}</textarea></label>
    <p class="hint ev-hint">${ICON.bell}<span>Reminder 1 hour before · ${STAR}+10 Stars when you go</span></p>
    <button class="primary" type="submit" id="evSave">${e.id ? 'Save' : 'Add event'}</button>
    ${e.id ? `<button type="button" class="danger" id="evDelete">${e.repeat !== 'none' ? 'Delete every repeat' : 'Delete event'}</button>` : ''}
  </form>`;
  const form = $('#evForm');
  const sync = () => {
    const f = new FormData(form);
    Object.assign(e, { title: String(f.get('title') ?? ''), date: String(f.get('date') ?? ''), all_day: !!f.get('all_day'),
      start: String(f.get('start') ?? ''), end: String(f.get('end') ?? ''), location: String(f.get('location') ?? ''), notes: String(f.get('notes') ?? '') });
  };
  form.addEventListener('input', sync);
  form.elements.namedItem('all_day').addEventListener('change', () => { sync(); form.querySelector('.times').hidden = e.all_day; });
  $('#whoseSeg').onclick = (x) => { const b = x.target.closest('[data-whose]'); if (!b) return; e.whose = b.dataset.whose;
    document.querySelectorAll('#whoseSeg button').forEach((y) => y.classList.toggle('on', y === b)); };
  $('#repSeg').onclick = (x) => { const b = x.target.closest('[data-rep]'); if (!b) return; e.repeat = b.dataset.rep;
    document.querySelectorAll('#repSeg button').forEach((y) => y.classList.toggle('on', y === b)); };
  form.onsubmit = async (x) => {
    x.preventDefault(); sync();
    if (!e.title.trim()) return toast('Give it a name.');
    if (!e.date) return toast('Pick a date.');
    if (!e.all_day && !e.start) return toast('Pick a start time, or turn on All day.');
    $('#evSave').disabled = true;
    const r = await rpc('save_event', {
      p_id: e.id, p_title: e.title.trim(), p_whose: e.whose, p_date: e.date, p_all_day: e.all_day,
      p_start: e.all_day ? null : e.start, p_end: e.all_day || !e.end ? null : e.end, p_repeat: e.repeat,
      p_location: e.location.trim() || null, p_notes: e.notes.trim() || null,
    }).catch(() => null);
    if (!r) { const s = $('#evSave'); if (s) s.disabled = false; return; }
    if (!e.id && e.whose !== me()) notify({ event: 'event_added', event_id: r.id });
    toast(e.id ? 'Saved' : 'Added to your plans');
    S.planDay = e.date; S.planWeek = weekStart(e.date); S.ev = null;
    S.tab = S.evBack === 'today' ? 'today' : 'plan'; render();
    loadPlan(); loadExtras();
  };
  $('#evDelete')?.addEventListener('click', async () => {
    if (!confirm(e.repeat !== 'none' ? `Delete "${e.title}" and all its repeats?` : `Delete "${e.title}"?`)) return;
    const r = await rpc('delete_event', { p_id: e.id }); if (!r) return;
    toast('Deleted'); S.ev = null; S.tab = S.evBack === 'today' ? 'today' : 'plan'; render(); loadPlan(); loadExtras();
  });
}

async function onPlanClick(act, b) {
  if (act === 'goPlan') { S.planWeek = weekStart(todayDay()); S.planDay = todayDay(); S.tab = 'plan'; return render(); }
  if (act === 'planDay') { S.planDay = b.dataset.d; return renderPlan(); }
  if (act === 'planWeek') { S.planWeek = addDays(S.planWeek, Number(b.dataset.n)); S.planDay = S.planWeek; renderPlan(); return loadPlan(); }
  if (act === 'planToday') { S.planWeek = weekStart(todayDay()); S.planDay = todayDay(); renderPlan(); return loadPlan(); }
  if (act === 'newEvent') return openEvent(null, b.dataset.d);
  if (act === 'editEvent') return openEvent(b.dataset.id);
  if (act === 'evCancel') { S.ev = null; S.tab = S.evBack === 'today' ? 'today' : 'plan'; return render(); }
  if (act === 'went') {
    b.disabled = true;
    const r = await rpc('went_event', { p_event: b.dataset.id, p_occ: b.dataset.d }).catch(() => null);
    if (!r) { b.disabled = false; return; }
    celebrate(r.each ? '+10 Stars each!' : '+10 Stars!', b);
    const { id, d } = b.dataset;
    toast('Nice. Glad you went ✓', { label: 'Undo', run: async () => {
      const u = await rpc('unwent_event', { p_event: id, p_occ: d }); if (u) { loadPlan(); loadExtras(); loadHome(); }
    } });
    loadPlan(); loadExtras(); loadHome();
  }
  if (act === 'unwent') {
    const r = await rpc('unwent_event', { p_event: b.dataset.id, p_occ: b.dataset.d }); if (r) { loadPlan(); loadExtras(); loadHome(); }
  }
}

// ---------- All tasks ----------------------------------------------------------
async function renderAll() {
  const body = main();
  body.innerHTML = `
    <button class="link back" data-act="backToday">‹ Today</button>
    ${header('Everything on your lists', 'All tasks')}
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
      ${!t.done_at && isPerson(me()) && (t.owner === me() || t.owner === 'both')
        ? (t.pinned_by === me() ? `<button value="unpin">${ICON.pinFill}<span>Unpin</span></button>` : `<button value="pin">${ICON.pin}<span>Pin to my Today</span></button>`) : ''}
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
    } else if (action === 'pin' || action === 'unpin') {
      const r = await rpc(action === 'pin' ? 'pin_task' : 'unpin_task', { p: me(), p_task: t.id });
      if (r) toast(action === 'pin' ? 'Pinned to Today' : 'Unpinned');
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

function renderSettings() {
  const body = main();
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
  ${header('Your household', 'Settings')}
  <div class="panel stack">
    <h2>Household code</h2>
    <div class="code-big small-code">${esc(S.status.code || '')}</div>
    <p class="muted">Anyone with this code can join your household. Share it only with your partner (or a shared screen like the wall display).</p>
    <div class="row-buttons">
      <button data-act-code="copy">${ICON.copy}<span>Copy</span></button>
      ${navigator.share ? `<button data-act-code="share">Share</button>` : ''}
      <button id="newCode">Make a new code</button>
    </div>
  </div>
  <div class="panel stack">
    <h2>Calendar</h2>
    <p class="muted">Show your Plan in the iPhone Calendar app. It updates by itself (iPhone checks about once an hour). Anyone with the link can see your plans, so keep it to yourselves.</p>
    <div class="row-buttons">
      <a class="btn-link" id="icsAdd" href="${esc(icsUrl('webcal'))}">${ICON.cal}<span>Add to iPhone Calendar</span></a>
    </div>
    <div class="row-buttons">
      <button id="icsCopy">${ICON.copy}<span>Copy link</span></button>
      <button id="icsReset">Reset link</button>
    </div>
  </div>
  <div class="panel stack">
    <h2>Help</h2>
    <div class="row-buttons">
      <button data-act="help">${ICON.help}<span>How it works</span></button>
      <button data-act="tour">Replay the tour</button>
    </div>
  </div>
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
    <p class="muted">Saves your tasks, lists, Stars and room to a file. Worth doing once a month.</p>
    <button id="exportBtn">Export backup</button>
  </div>
  <p class="center muted small">One Thing · version ${APP_VERSION}</p>`;

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
  body.querySelectorAll('[data-act-code]').forEach((b) => b.onclick = () => shareCode(b.dataset.actCode));
  $('#newCode').onclick = async () => {
    if (!confirm('Make a new household code?\n\nThe old code stops working right away. Devices already joined stay joined.')) return;
    const r = await rpc('regenerate_code'); if (r) { S.status = r; renderSettings(); toast('New code ready'); }
  };
  $('#exportBtn').onclick = exportBackup;
  $('#icsCopy').onclick = async () => {
    try { await navigator.clipboard.writeText(icsUrl('https')); toast('Calendar link copied'); }
    catch { prompt('Copy this link:', icsUrl('https')); }
  };
  $('#icsReset').onclick = async () => {
    if (!confirm('Make a new calendar link?\n\nThe old one stops working. Any phone subscribed to it will need to add the new one.')) return;
    const r = await rpc('reset_calendar_link'); if (r) { S.status = r; renderSettings(); toast('New calendar link ready'); }
  };
}

// The private calendar feed for this household (served by the notify function).
function icsUrl(scheme) {
  const base = String(CONFIG.SUPABASE_URL || '').replace(/\/+$/, '').replace(/^https?:/, scheme + ':');
  return `${base}/functions/v1/notify?ics=${encodeURIComponent(S.status?.ics ?? '')}`;
}

// ---------- How it works ------------------------------------------------------
const HELP = [
  ['Your day', `<p>Each of you gets <b>one thing</b> a day, picked for you: urgent tasks (High, or due within 2 days) go first, then Normal, then Low. The day resets at 4 a.m.</p>
    <p><b>Pins</b> ${ICON.pinFill} keep up to 3 tasks on your card until they're done. Use them for "this has to happen." A task due today shows a little <b>Pin it</b> prompt.</p>
    <p>Finished early? <b>Give me another</b> hands you one more.</p>`],
  ['When you can\'t today', `<p><b>✗ Swap</b>: not today. One per day; it goes back in the pile.</p>
    <p><b>⏸ Pause</b>: write where you left off (+3 Stars), pick a day to come back, and get a new task now if you want. High tasks come back pinned on their day; others rejoin the shuffle.</p>
    <p>Stuck on something for 3+ days? You'll be offered to <b>break it into a smaller first step</b>.</p>`],
  ['Stars, XP & your home', `<p>Add a task +1 (5 a day each) · Finish +10 (High +15) · +1 per day it waited (up to +5) · Pause note +3 · Shopping done +10 (2 a day) · Went to a plan +10 (shared: +10 each) · Together bonus +5 each.</p>
    <p>XP only goes up and brings <b>levels</b> — each adds something to your room. <b>Stars</b> are for the <b>Store</b>: 8 new items every Monday, plus limited seasonal pieces. Replaced items wait in <b>Storage</b>. Nothing is ever taken away, and missed days cost nothing.</p>`],
  ['Lists', `<p>Two shared lists: <b>Groceries</b> and <b>Household</b>. Type several things at once with commas ("milk, eggs, 2 avocados"). Tap a <b>Usual</b> chip to re-add something.</p>
    <p><b>List is ready</b> lets your partner know. Tick items as they go in the cart, then <b>Got everything</b>. At 8+ grocery items, <b>Order groceries</b> shows up for both of you.</p>`],
  ['Plan', `<p>Your shared calendar. Add appointments and plans for you, your partner, or both of you, once or repeating (weekly, every 2 weeks, monthly).</p>
    <p>You'll get a reminder <b>1 hour before</b>. Once it starts, tap <b>I went</b> for +10 Stars (shared plans: one tap, +10 each). Today's plans show at the top of Today.</p>
    <p>Want them in the iPhone Calendar app too? <b>Settings → Calendar → Add to iPhone Calendar</b>.</p>`],
  ['Doing it together', `<p>Tap <b>Do ours together</b> on Today. Your partner gets a Join notification; you both get 25 minutes, and if you each finish a task before it ends, +5 Stars each.</p>`],
  ['Notifications', `<p>7 a.m.: what's on your card. 7 p.m.: only if something's still open. Plus a heads-up when your partner adds to your list, finishes something, or says a list is ready.</p>`],
  ['Your household', `<p>Your partner joins with the <b>household code</b> in Settings. Lost a phone? Open One Thing on the new one, tap <b>I have a code</b>, and you're back. You can make a new code anytime.</p>`],
];
function renderHelp() {
  main().innerHTML = `
    ${header('A quick guide', 'How it works')}
    <div class="help">${HELP.map(([h, body]) => `<section class="panel"><h2>${h}</h2>${body}</section>`).join('')}
      <div class="row-buttons"><button class="btn-soft" data-act="tour">Replay the tour</button><button class="btn-soft" data-act="settings">Back to Settings</button></div>
    </div>`;
}

const TOUR = [
  ['Welcome to One Thing', 'Too many tasks at once freezes ADHD brains. So each of you sees just <b>one thing</b> a day. Everything else waits quietly.', 'window_classic', 'wall_left'],
  ['Pin what really matters', 'Up to <b>3 pins</b> stay on your card until done. Urgent tasks jump the line for your one thing, without flooding your screen.', null, null],
  ['Can\'t do it today?', '<b>✗</b> swaps it (once a day). <b>⏸</b> pauses it with a note and a day to come back. No guilt, no streaks.', null, null],
  ['Build your home', 'Every task earns <b>Stars</b> and <b>XP</b>. Levels add furniture; the Store lets you pick more. Start in an empty room and make it yours.', 'sofa_mint', 'floor_mid'],
  ['Better together', 'Shared <b>Lists</b>, a <b>Do ours together</b> timer, and cheers when your partner finishes something. Tap the <b>+</b> to add your first task.', 'lights_string', 'ceiling'],
];
function maybeTour() { if (store.get('toured') !== '1') setTimeout(() => showTour(0), 400); }
function showTour(i) {
  const d = $('#levelDialog');
  const [title, text, item, spot] = TOUR[i];
  d.innerHTML = `
    <div class="tour">
      <div class="tour-dots" aria-hidden="true">${TOUR.map((_, k) => `<span class="${k === i ? 'on' : ''}"></span>`).join('')}</div>
      ${item ? `<div class="lv-item">${itemThumb(item, spot)}</div>` : `<div class="tour-icon">${i === 1 ? ICON.pinFill : ICON.pause}</div>`}
      <h2>${title}</h2>
      <p>${text}</p>
      <div class="row-buttons">
        <button class="ghost" data-tour="skip">${i === TOUR.length - 1 ? 'Close' : 'Skip'}</button>
        <button class="primary" data-tour="next">${i === TOUR.length - 1 ? "Let's go" : 'Next'}</button>
      </div>
    </div>`;
  d.onclick = (e) => {
    const b = e.target.closest('[data-tour]'); if (!b) return;
    if (b.dataset.tour === 'next' && i < TOUR.length - 1) return showTour(i + 1);
    store.set('toured', '1'); d.close();
  };
  if (!d.open) d.showModal();
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
  const [{ data: tasks, error }, { data: owned }, { data: ledger }, { data: shop_items }, { data: trips }, { data: events }, { data: event_went }] = await Promise.all([
    sb.from('tasks').select('*').order('created_at'),
    sb.from('owned').select('*'),
    sb.from('ledger').select('*').order('id'),
    sb.from('shop_items').select('*').order('added_at'),
    sb.from('trips').select('*').order('at'),
    sb.from('events').select('*').order('start_date'),
    sb.from('event_went').select('*'),
  ]);
  if (error) return toast(error.message);
  const json = JSON.stringify({ exported_at: new Date().toISOString(), app_version: APP_VERSION, names: S.status.names, tasks, owned, ledger, shop_items, trips, events, event_went }, null, 2);
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
