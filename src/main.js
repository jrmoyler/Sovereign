// ============================================================================
// SOVEREIGN — main bootstrap & game loop.
// Wires assets, simulation, renderer, UI, input, AI and audio together.
// Fixed-timestep simulation; interpolated 60fps rendering.
// ============================================================================

import { Assets } from './render/Assets.js';
import { GameRenderer } from './render/Renderer.js';
import { Game } from './core/Game.js';
import { UI } from './ui/UI.js';
import { Input } from './ui/Input.js';
import { Menus } from './ui/Menus.js';
import { Tutorial } from './ui/Tutorial.js';
import { AudioManager } from './audio/AudioManager.js';
import { SIM_DT } from './data/constants.js';

const viewport = document.getElementById('viewport');
const uiRoot = document.getElementById('ui-root');
const boot = document.getElementById('boot');
const bootBar = document.getElementById('boot-bar-fill');
const bootStatus = document.getElementById('boot-status');

const audio = new AudioManager();
const menus = new Menus(uiRoot);
let assets = null;
let session = null;   // active game session

// ---- boot: load assets, then show faction select ---------------------------
(async function boot_() {
  bootStatus.textContent = 'Loading rigged models…';
  assets = new Assets();
  await assets.load((frac, key) => { bootBar.style.width = `${Math.round(frac * 100)}%`; bootStatus.textContent = `Loaded ${key} model`; });
  bootBar.style.width = '100%';
  bootStatus.textContent = 'Ready.';
  await new Promise(r => setTimeout(r, 250));
  boot.classList.add('hidden');
  showMenu();
})();

function showMenu() {
  if (session) { teardown(); }
  menus.showFactionSelect((cfg) => {
    // first user gesture — unlock audio
    audio.init().then(() => { audio.resume(); audio.startMusic(); }).catch(() => {});
    menus.hide();
    startGame(cfg);
  });
}

let lastCfg = null;

function startGame(cfg) {
  lastCfg = cfg;
  const factions = [{ id: cfg.playerFaction, isHuman: true }, ...cfg.rivals.map(id => ({ id }))];
  const seed = (Date.now() & 0xffffff) ^ 0x51a3;
  const game = new Game({ seed, factions });

  const renderer = new GameRenderer(viewport, assets);
  renderer.onSfx = (type, ev) => audio.play(type, ev);
  renderer.buildWorld(game, game.rng);

  const ui = new UI(uiRoot, game, renderer, audio, {});
  const input = new Input(renderer.renderer.domElement, game, renderer, ui, audio);
  const tutorial = new Tutorial(uiRoot);

  ui.hooks.onPause = () => pause();
  ui.hooks.onBuildMode = (bid) => input._setGhost(bid);

  session = { game, renderer, ui, input, tutorial, paused: false, acc: 0, last: performance.now(), raf: 0, over: false };

  // debug/testing hook
  window.SOV = { get session() { return session; }, game, renderer, ui, audio };

  tutorial.start(() => {});
  loop();
}

// ---- main loop -------------------------------------------------------------
function loop() {
  if (!session) return;
  session.raf = requestAnimationFrame(loop);
  const now = performance.now();
  let dt = (now - session.last) / 1000; session.last = now;
  dt = Math.min(dt, 0.1);

  const { game, renderer, ui, input } = session;

  if (!session.paused && !session.over) {
    session.acc += dt;
    let steps = 0;
    while (session.acc >= SIM_DT && steps < 5) {
      game.update(SIM_DT); session.acc -= SIM_DT; steps++;
    }
    // route this frame's events
    const events = game.drainEvents();
    renderer.handleEvents(events, ui.sel);
    for (const ev of events) routeEvent(ev);
  }

  input.update(dt);
  renderer.syncEntities(dt);
  ui.update(dt);
  renderer.render(dt);
}

function routeEvent(ev) {
  const { ui, game } = session;
  switch (ev.type) {
    case 'alert': ui.pushAlert(ev.kind, ev.title, ev.desc); break;
    case 'stage_done':
      if (ev.owner === game.human.index) { ui.toast(`⬢ ${ev.stage.name} secured (${game.human.stackIndex}/8)`); audio.play('stage'); }
      break;
    case 'gameover': onGameOver(ev); break;
  }
}

function onGameOver(ev) {
  if (session.over) return;
  session.over = true;
  const human = session.game.human;
  const win = ev.winner === human.index;
  audio.duckMusic(0.12);
  audio.play(win ? 'victory' : 'defeat');
  const wf = ev.winner >= 0 ? session.game.players[ev.winner].factionId : null;
  const msg = win
    ? 'You completed the Sovereign Intelligence stack before every rival division.'
    : (ev.mode === 'defeat' ? 'Your division was eliminated.' : 'A rival division reached Sovereign Intelligence first.');
  setTimeout(() => menus.showGameOver({
    win, winnerFaction: wf, message: msg,
    time: fmtTime(session.game.time), stack: human.stackIndex, techs: human.researched.size,
  }, { onRestart: () => { const cfg = lastCfg; teardown(); menus.hide(); startGame(cfg); }, onQuit: () => showMenu() }), 900);
}

// ---- pause -----------------------------------------------------------------
function pause() {
  if (!session || session.over) return;
  session.paused = true; session.input.setPaused(true); audio.duckMusic(0.1);
  menus.showPause({
    onResume: () => { menus.hide(); session.paused = false; session.input.setPaused(false); session.last = performance.now(); audio.setMusic(0.3); },
    onHelp: () => { menus.hide(); session.ui.openHelp(); const iv = setInterval(() => { if (!session.ui._modalOpen) { clearInterval(iv); pause(); } }, 300); },
    onRestart: () => { const cfg = lastCfg; teardown(); menus.hide(); startGame(cfg); },
    onQuit: () => showMenu(),
  });
}

// ---- teardown --------------------------------------------------------------
function teardown() {
  if (!session) return;
  cancelAnimationFrame(session.raf);
  session.input.destroy();
  session.ui.destroy();
  session.renderer.dispose();
  uiRoot.innerHTML = '';
  session = null;
}

function fmtTime(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; }
