// ============================================================================
// Menus — faction selection screen, pause menu and win/loss overlays.
// Pure DOM; communicates back through callbacks.
// ============================================================================

import { FACTIONS, FACTION_BY_ID } from '../data/factions.js';
import { UNITS } from '../data/units.js';
import { TECHS } from '../data/tech.js';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

export class Menus {
  constructor(root) { this.root = root; this.node = null; }
  hide() { if (this.node) { this.node.remove(); this.node = null; } }

  // ---- faction selection ---------------------------------------------------
  showFactionSelect(onStart) {
    this.hide();
    const screen = el('div', 'menu-screen');
    screen.innerHTML = `<div class="menu-title">SOVEREIGN</div>
      <div class="menu-sub">Collective AI Inc. — Choose your division</div>`;
    const grid = el('div', 'faction-grid');
    const detail = el('div', 'faction-detail');

    let selected = FACTIONS.find(f => f.playable) || FACTIONS[0];
    const cards = {};
    for (const f of FACTIONS) {
      const card = el('div', 'faction-card' + (f.playable ? '' : ' locked'));
      card.style.setProperty('--fc', f.color);
      card.innerHTML = `<div class="fc-num">DIV ${f.num}</div><div class="fc-name">${f.name}</div>
        <div class="fc-tag">${f.tagline}</div><div class="fc-role">${f.role}</div>
        ${f.playable ? '' : '<div class="fc-lock">AI RIVAL</div>'}`;
      if (f.playable) card.onclick = () => { selected = f; refresh(); };
      grid.appendChild(card); cards[f.id] = card;
    }

    const refresh = () => {
      for (const id in cards) cards[id].classList.toggle('selected', id === selected.id);
      document.documentElement.style.setProperty('--faction', selected.color);
      const spec = selected.specialist ? UNITS[selected.specialist] : null;
      const ult = selected.ultimate ? TECHS[selected.ultimate] : null;
      detail.innerHTML = `
        <div class="col">
          <div class="kv"><b>Economy</b><span>${describeBonus(selected)}</span></div>
          <div class="kv"><b>Specialist</b><span>${spec ? spec.name + ' — ' + spec.desc : '—'}</span></div>
          <div class="kv"><b>Ultimate</b><span>${ult ? ult.name + ' — ' + ult.desc.replace('ULTIMATE — ', '') : '—'}</span></div>
        </div>
        <div class="col">
          <div class="kv"><b>Weakness</b><span>${selected.weakness}</span></div>
          <div class="kv"><b>AI Profile</b><span>“${selected.ai.voice}”</span></div>
          <div class="kv"><b>Palette</b><span><i style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${selected.color};vertical-align:middle"></i> <i style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${selected.color2 || selected.color};vertical-align:middle"></i></span></div>
        </div>`;
    };

    // opponent count selector + start
    const actions = el('div', 'menu-actions');
    const rivalWrap = el('div', 'btn'); rivalWrap.style.cursor = 'default';
    let rivals = 3;
    const rivalLbl = () => `Rivals: ${rivals}`;
    rivalWrap.textContent = rivalLbl();
    const minus = el('button', 'btn', '−'); const plus = el('button', 'btn', '+');
    minus.onclick = () => { rivals = Math.max(1, rivals - 1); rivalWrap.textContent = rivalLbl(); };
    plus.onclick = () => { rivals = Math.min(5, rivals + 1); rivalWrap.textContent = rivalLbl(); };
    const start = el('button', 'btn primary big-btn', 'BEGIN THE RACE');
    start.onclick = () => {
      const opp = pickRivals(selected.id, rivals);
      onStart({ playerFaction: selected.id, rivals: opp });
    };
    actions.append(minus, rivalWrap, plus, start);

    screen.append(grid, detail, actions);
    this.root.appendChild(screen); this.node = screen;
    refresh();
  }

  // ---- pause ---------------------------------------------------------------
  showPause(hooks) {
    this.hide();
    const screen = el('div', 'menu-screen');
    const card = el('div', 'panel overlay-card');
    card.innerHTML = `<h1>PAUSED</h1><p>The race is frozen.</p>`;
    const actions = el('div', 'menu-actions'); actions.style.justifyContent = 'center';
    const resume = el('button', 'btn primary big-btn', 'Resume');
    const help = el('button', 'btn big-btn', 'How to Play');
    const restart = el('button', 'btn big-btn', 'Restart');
    const quit = el('button', 'btn big-btn', 'Quit to Menu');
    resume.onclick = () => hooks.onResume();
    help.onclick = () => hooks.onHelp();
    restart.onclick = () => hooks.onRestart();
    quit.onclick = () => hooks.onQuit();
    actions.append(resume, help, restart, quit);
    card.appendChild(actions); screen.appendChild(card);
    this.root.appendChild(screen); this.node = screen;
  }

  // ---- game over -----------------------------------------------------------
  showGameOver(data, hooks) {
    this.hide();
    const win = data.win;
    const screen = el('div', 'menu-screen');
    const card = el('div', `panel overlay-card ${win ? 'win' : 'loss'}`);
    const wf = FACTION_BY_ID[data.winnerFaction];
    card.innerHTML = `<h1>${win ? 'SOVEREIGN INTELLIGENCE ACHIEVED' : 'DEFEAT'}</h1>
      <p>${data.message}</p>
      <p style="font-family:var(--mono);color:${wf ? wf.color : '#8ea0c4'}">${win ? 'Your division ascends to superintelligence.' : (wf ? wf.name + ' reached Sovereign Intelligence first.' : 'Your division has fallen.')}</p>
      <p style="font-size:12px">Time: ${data.time} · Stack reached: ${data.stack}/8 · Techs: ${data.techs}</p>`;
    const actions = el('div', 'menu-actions'); actions.style.justifyContent = 'center';
    const again = el('button', 'btn primary big-btn', 'Play Again');
    const menu = el('button', 'btn big-btn', 'Main Menu');
    again.onclick = () => hooks.onRestart();
    menu.onclick = () => hooks.onQuit();
    actions.append(again, menu); card.appendChild(actions);
    screen.appendChild(card);
    this.root.appendChild(screen); this.node = screen;
  }
}

function describeBonus(f) {
  const parts = [];
  const m = f.mods;
  const label = {
    researchSpeed: 'research', capitalRate: 'capital', trustRate: 'trust', defenseMul: 'defense',
    unitDmgMul: 'unit damage', unitHpMul: 'unit HP', robotTrain: 'unit production', influence: 'influence',
    marketOps: 'market ops', detectSabotage: 'sabotage detection', agentCoord: 'agent coordination',
    talentGather: 'talent', dataGather: 'data', computeGather: 'compute', energyGather: 'energy',
    infraRate: 'infrastructure', govRate: 'governance', buildSpeed: 'build speed', unitSpeed: 'unit speed',
    adoption: 'adoption', counterIntel: 'counterintel', sabotageMul: 'sabotage strength', buyDiscount: '',
  };
  for (const k in m) if (label[k] && m[k] > 1) parts.push(`+${Math.round((m[k] - 1) * 100)}% ${label[k]}`);
  return parts.slice(0, 3).join(', ') || 'Balanced';
}

function pickRivals(playerId, n) {
  const pool = FACTIONS.filter(f => f.id !== playerId);
  // shuffle (Math.random is fine for the menu)
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, n).map(f => f.id);
}
