/**
 * UI wiring. Everything here is a reaction to an event: a DOM event (click, keydown, submit),
 * a custom game event from game.js, or a server-pushed event (SSE).
 */
import { api } from './api.js';
import { events } from './events.js';
import { Run } from './game.js';
import { sfx, unlock, isEnabled, setEnabled } from './audio.js';

const $ = (sel, root = document) => root.querySelector(sel);
const fmt = (n) => Number(n).toLocaleString('en-GB');

const state = { user: null, catalog: {}, run: null, es: null, mode: 'login', lastSecond: -1 };

/** Safe DOM builder: text goes in as text nodes, never as HTML. */
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

function toast(text, kind = '') {
  const t = h('div', { class: `toast ${kind ? 'toast--' + kind : ''}` }, text);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), 3600);
}

function showScreen(name) {
  for (const s of ['auth', 'home', 'play']) $(`#screen-${s}`).hidden = s !== name;
  document.body.dataset.screen = name;
}

/* ============================ AUTH (virtual identity) ============================ */

function buildAvatarPicker(avatars) {
  $('#avatar-options').replaceChildren(...avatars.map((a, i) =>
    h('label', { class: 'avatar-opt' },
      h('input', { type: 'radio', name: 'avatar', value: a, checked: i === 0, 'aria-label': `Avatar ${a}` }),
      h('span', {}, a))
  ));
}

function setMode(mode) {
  state.mode = mode;
  const login = mode === 'login';
  $('#tab-login').classList.toggle('is-active', login);
  $('#tab-register').classList.toggle('is-active', !login);
  $('#tab-login').setAttribute('aria-selected', String(login));
  $('#tab-register').setAttribute('aria-selected', String(!login));
  $('#avatar-picker').hidden = login;
  $('#auth-submit').textContent = login ? 'Log in' : 'Open account';
  $('#f-password').autocomplete = login ? 'current-password' : 'new-password';
  $('#auth-error').hidden = true;
}

function authError(msg) {
  const el = $('#auth-error');
  el.textContent = msg;
  el.hidden = false;
}

async function onAuthSubmit(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const username = String(fd.get('username') || '').trim();
  const password = String(fd.get('password') || '');

  if (state.mode === 'register') {
    if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) return authError('Username must be 3-16 letters, numbers or underscores.');
    if (password.length < 6) return authError('Password must be at least 6 characters.');
  } else if (!username || !password) {
    return authError('Enter your username and password.');
  }

  const btn = $('#auth-submit');
  btn.disabled = true;
  try {
    const body = { username, password };
    if (state.mode === 'register') body.avatar = fd.get('avatar');
    const res = state.mode === 'login' ? await api.login(body) : await api.register(body);
    e.target.reset();
    onLoggedIn(res);
  } catch (err) {
    authError(err.message);
  } finally {
    btn.disabled = false;
  }
}

function onLoggedIn({ user, achievements }) {
  state.user = user;
  state.catalog = achievements || state.catalog;
  $('#session').hidden = false;
  $('#chip-avatar').textContent = user.avatar;
  $('#chip-name').textContent = user.username;
  renderHome();
  refreshLeaderboard();
  connectLive();
  showScreen('home');
}

async function logout() {
  try { await api.logout(); } catch { /* ignore */ }
  if (state.es) { state.es.close(); state.es = null; }
  state.user = null;
  $('#session').hidden = true;
  showScreen('auth');
}

/* ================================== HOME ================================== */

function renderHome() {
  const u = state.user;
  $('#hello').textContent = u.gamesPlayed ? `Welcome back, ${u.username}.` : `Welcome, ${u.username}.`;

  const stat = (label, value) => h('div', {}, h('dt', {}, label), h('dd', {}, fmt(value)));
  $('#stats').replaceChildren(
    stat('Best bank', u.bestScore), stat('Runs', u.gamesPlayed),
    stat('Biggest cash-out', u.biggestCashout), stat('Longest chain', u.longestChain)
  );

  $('#badges').replaceChildren(...Object.entries(state.catalog).map(([id, b]) => {
    const earned = u.achievements.includes(id);
    return h('li', { class: `badge ${earned ? 'is-earned' : ''}` },
      h('span', { class: 'badge__icon', 'aria-hidden': 'true' }, b.icon),
      h('b', {}, b.name),
      h('small', {}, b.desc),
      earned ? h('span', { class: 'sr-only' }, ' (earned)') : null);
  }));
}

async function refreshMe() {
  try {
    const res = await api.me();
    state.user = res.user;
    renderHome();
  } catch { /* leave the old numbers */ }
}

async function refreshLeaderboard() {
  try {
    const { leaderboard } = await api.leaderboard();
    const list = $('#leaderboard');
    if (!leaderboard.length) {
      list.replaceChildren(h('li', { class: 'empty' }, 'Nobody has banked anything yet. Be the first.'));
      return;
    }
    list.replaceChildren(...leaderboard.map((r) =>
      h('li', { class: state.user && r.username === state.user.username ? 'is-me' : '' },
        h('span', { class: 'rank' }, r.rank),
        h('span', { 'aria-hidden': 'true' }, r.avatar),
        h('span', {}, r.username),
        h('span', { class: 'pts' }, fmt(r.bestScore)))
    ));
  } catch { /* offline: keep old table */ }
}

function addFeed({ kind, text }) {
  const feed = $('#feed');
  feed.prepend(h('li', { 'data-kind': kind }, text));
  while (feed.children.length > 8) feed.lastChild.remove();
}

/** Server-Sent Events: the server pushes, we dispatch onto our own bus. */
function connectLive() {
  if (state.es) return;
  const es = new EventSource('/api/events');
  es.addEventListener('feed', (e) => events.emit('feed', JSON.parse(e.data)));
  es.addEventListener('leaderboard', () => events.emit('leaderboard:stale'));
  state.es = es;
}

/* ================================== PLAY ================================== */

function buildNumpad() {
  $('#numpad').replaceChildren(...[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d) =>
    h('button', { class: 'key', type: 'button', 'data-digit': d, disabled: true,
      'aria-label': `Answer ${d}`, onclick: () => answer(d) }, d)
  ));
}

function setKeys(enabled) {
  for (const k of $('#numpad').children) k.disabled = !enabled;
  $('#btn-cash').disabled = !enabled || !state.run || !state.run.game || state.run.game.pot <= 0;
}

function answer(digit) {
  if (!state.run || state.run.busy) return;
  sfx.key();
  state.run.submit(digit);
}

function cashOut() {
  if (!state.run || state.run.busy || state.run.game.pot <= 0) return;
  state.run.cashOut();
}

async function startRun() {
  unlock(); // audio needs a user gesture
  const btn = $('#btn-play');
  btn.disabled = true;
  $('#home-error').hidden = true;
  state.run = new Run();
  try {
    await state.run.start();
  } catch (err) {
    state.run = null;
    $('#home-error').textContent = err.message;
    $('#home-error').hidden = false;
    showScreen('home');
  } finally {
    btn.disabled = false;
  }
}

const shown = new Map(); // element -> number currently displayed (for count-up animation)

function countTo(el, target) {
  const from = shown.get(el) || 0;
  shown.set(el, target);
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / 420);
    el.textContent = fmt(Math.round(from + (target - from) * t));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  if (target !== from) {
    el.classList.remove('bump');
    void el.offsetWidth; // restart the CSS animation
    el.classList.add('bump');
  }
}

function renderHud(game) {
  countTo($('#hud-pot'), game.pot);
  countTo($('#hud-banked'), game.banked);
  $('#hud-chain').textContent = game.chain;
  $('#hud-mult').textContent = `Next solve x${game.multiplier.toFixed(2)}`;
  $('#hud-strikes').replaceChildren(...Array.from({ length: game.maxStrikes }, (_, i) =>
    h('span', { class: `strike ${i < game.strikes ? 'is-hit' : ''}` })));
  $('#hud-strikes').setAttribute('aria-label', `${game.strikes} of ${game.maxStrikes} strikes`);
  $('#hud-shield').replaceChildren(h('span', { class: game.shields > 0 ? '' : 'is-spent', 'aria-label': game.shields > 0 ? 'Shield ready' : 'Shield used' }, '🛡️'));
  $('#btn-cash').textContent = game.pot > 0 ? `Cash out ${fmt(game.pot)}` : 'Cash out';
  // The longer the chain, the hotter the pot glows (gold -> red). Pure CSS reads this variable.
  $('#screen-play').style.setProperty('--heat', String(Math.min(1, game.chain / 12)));
}

function flash(kind, big, small) {
  const el = $('#flash');
  el.dataset.kind = '';
  void el.offsetWidth;
  el.replaceChildren(big, small ? h('small', {}, small) : '');
  el.dataset.kind = kind;
}

function shake() {
  const s = $('#stage');
  s.classList.remove('shake');
  void s.offsetWidth;
  s.classList.add('shake');
}

/* ---- game events -> UI reactions (each is a separate, independent listener) ---- */

events.on('game:started', ({ game }) => {
  shown.clear();
  $('#hud-pot').textContent = '0';
  $('#hud-banked').textContent = '0';
  renderHud(game);
  showScreen('play');
});

events.on('round:loading', ({ game }) => {
  setKeys(false);
  $('#puzzle-img').hidden = true;
  $('#puzzle-tag').hidden = true;
  $('#puzzle-status').hidden = false;
  $('#puzzle-status').textContent = 'Opening the safe…';
  $('#timer-fill').style.transform = 'scaleX(1)';
  $('#timer').dataset.state = 'ok';
  renderHud(game);
});

events.on('round:ready', ({ round }) => {
  const img = $('#puzzle-img');
  img.src = round.imageUrl;
  img.hidden = false;
  $('#puzzle-status').hidden = true;
  $('#flash').dataset.kind = '';
  $('#stage').dataset.gold = String(round.gold);
  const tag = $('#puzzle-tag');
  tag.textContent = round.gold
    ? `Gold Banana x3 · worth up to ${fmt(round.maxPoints)}`
    : `Puzzle ${round.chain} · worth up to ${fmt(round.maxPoints)}`;
  tag.hidden = false;
  state.lastSecond = -1;
  setKeys(true);
});

events.on('round:failed', () => {
  $('#puzzle-status').textContent = 'The puzzle picture would not load. Cash out or leave the vault.';
  setKeys(false);
  $('#btn-cash').disabled = !state.run || state.run.game.pot <= 0;
});

events.on('timer:tick', ({ remaining, limit }) => {
  const ratio = remaining / limit;
  $('#timer-fill').style.transform = `scaleX(${ratio})`;
  $('#timer').dataset.state = ratio < 0.3 ? 'low' : 'ok';
  $('#timer').setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
  const sec = Math.ceil(remaining / 1000);
  if (ratio < 0.3 && sec <= 4 && sec > 0 && sec !== state.lastSecond) { state.lastSecond = sec; sfx.tick(); }
});

events.on('round:submitted', () => { setKeys(false); $('#stage').dataset.gold = 'false'; });

events.on('round:result', (res) => {
  renderHud(res.game);
  if (res.outcome === 'correct') {
    if (res.gold) sfx.gold(); else sfx.correct();
    flash('correct', `+${fmt(res.points)}`, res.gold ? 'Gold Banana x3!' : `Pot is now ${fmt(res.game.pot)}`);
  } else if (res.shielded) {
    sfx.shield();
    flash('shield', 'Shield!', 'Your pot is safe, but the chain is broken');
  } else {
    sfx.wrong();
    shake();
    flash('wrong', res.outcome === 'timeout' ? 'Time up' : 'Busted',
      res.lostPot > 0 ? `Pot of ${fmt(res.lostPot)} lost. It was ${res.solution}` : `Strike. It was ${res.solution}`);
  }
});

events.on('pot:cashedOut', (res) => {
  sfx.cash();
  renderHud(res.game);
  flash('bank', `+${fmt(res.cashed)}`, 'Safe in the bank. Chain reset.');
});

events.on('achievement', (badge) => {
  setTimeout(() => { sfx.badge(); toast(`${badge.icon} Badge unlocked: ${badge.name}`, 'badge'); }, 800);
});

events.on('game:over', ({ summary, quit }) => {
  sfx.over();
  $('#over-title').textContent = quit ? 'You left the vault' : 'Vault locked';
  $('#over-score').textContent = fmt(summary.score);
  $('#over-chain').textContent = summary.bestChain;
  $('#over-solved').textContent = summary.solved;
  $('#over-cash').textContent = fmt(summary.bestCashout);
  $('#over-badge').hidden = !summary.newHighScore;
  $('#over').showModal();
  refreshMe();
  refreshLeaderboard();
});

events.on('run:error', ({ message }) => toast(message, 'error'));
events.on('run:lost', () => { toast('That run is no longer active.', 'error'); showScreen('home'); });
events.on('feed', addFeed);
events.on('leaderboard:stale', refreshLeaderboard);

/* ============================== DOM event wiring ============================== */

$('#auth-form').addEventListener('submit', onAuthSubmit);
$('#tab-login').addEventListener('click', () => setMode('login'));
$('#tab-register').addEventListener('click', () => setMode('register'));
$('#btn-logout').addEventListener('click', logout);
$('#btn-play').addEventListener('click', startRun);
$('#btn-cash').addEventListener('click', cashOut);
$('#btn-quit').addEventListener('click', () => {
  if (state.run && confirm('Leave the vault? Anything in your pot will be banked.')) state.run.quit();
});

$('#over-again').addEventListener('click', () => { $('#over').close(); startRun(); });
$('#over-home').addEventListener('click', () => { $('#over').close(); showScreen('home'); });
$('#over').addEventListener('close', () => { if (state.run && state.run.finished && document.body.dataset.screen === 'play') showScreen('home'); });

$('#btn-sound').addEventListener('click', () => {
  const next = !isEnabled();
  setEnabled(next);
  const b = $('#btn-sound');
  b.setAttribute('aria-pressed', String(next));
  b.setAttribute('aria-label', next ? 'Sound on' : 'Sound off');
  b.textContent = next ? '🔊' : '🔇';
  if (next) { unlock(); sfx.key(); }
});

// Keyboard play: digits answer, C or Space cashes out.
document.addEventListener('keydown', (e) => {
  if (document.body.dataset.screen !== 'play' || $('#over').open || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  if (/^[0-9]$/.test(e.key)) {
    const key = $(`.key[data-digit="${e.key}"]`);
    if (!key || key.disabled) return;
    key.classList.add('is-pressed');
    setTimeout(() => key.classList.remove('is-pressed'), 120);
    answer(Number(e.key));
  } else if (e.key.toLowerCase() === 'c' || e.key === ' ') {
    e.preventDefault();
    if (!$('#btn-cash').disabled) cashOut();
  }
});

/* ================================== BOOT ================================== */

async function boot() {
  buildNumpad();
  const sound = isEnabled();
  $('#btn-sound').textContent = sound ? '🔊' : '🔇';
  $('#btn-sound').setAttribute('aria-pressed', String(sound));
  try { buildAvatarPicker((await api.avatars()).avatars); } catch { /* picker stays empty */ }
  setMode('login');
  try {
    onLoggedIn(await api.me()); // a valid cookie from an earlier visit logs us straight in
  } catch {
    showScreen('auth');
  }
}

boot();
