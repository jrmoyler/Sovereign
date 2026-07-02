// ============================================================================
// UI — the in-game HUD controller. Builds all overlay DOM, owns selection
// state, renders the resource bar, faction/Sovereign panel, context command
// panel, minimap, research tree, actions menu, alerts, toasts and tutorial.
// Reads simulation state each frame; issues commands via the Game API.
// ============================================================================

import { RES, RESOURCE_INFO, SOVEREIGN_STACK } from '../data/constants.js';
import { UNITS } from '../data/units.js';
import { BUILDINGS, BUILDABLE } from '../data/buildings.js';
import { TECHS, techsFor } from '../data/tech.js';
import { ACTIONS, ACTION_LIST } from '../data/balance.js';
import { actionCost } from '../core/Actions.js';
import { stackStageProgress, stageRequirementsMet } from '../core/Research.js';
import { Minimap } from './Minimap.js';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

export class UI {
  constructor(root, game, renderer, audio, hooks) {
    this.root = root;
    this.game = game;
    this.renderer = renderer;
    this.audio = audio;
    this.hooks = hooks || {};        // { onPause }
    this.me = game.human.index;
    this.sel = { units: [], building: 0 };
    this.buildMode = null;           // building id while placing
    this.alerts = [];
    this._modalOpen = null;

    this._build();
    this.minimap = new Minimap(this.$minimapCanvas, game, renderer);
  }

  // ---- DOM construction ----------------------------------------------------
  _build() {
    const p = this.game.players[this.me];
    document.documentElement.style.setProperty('--faction', p.color);

    // resource bar
    this.$resbar = el('div', 'panel', ''); this.$resbar.id = 'resbar';
    this.resCells = {};
    for (const r of RES) {
      const info = RESOURCE_INFO[r];
      const cell = el('div', 'res');
      cell.innerHTML = `<div class="ic" style="background:${info.color}">${info.glyph}</div>
        <div class="col"><div class="amt">0</div><div class="lbl">${info.name}</div></div>
        <div class="rate"></div>`;
      cell.title = info.desc;
      this.$resbar.appendChild(cell);
      this.resCells[r] = { amt: cell.querySelector('.amt'), rate: cell.querySelector('.rate') };
    }
    const supply = el('div', 'res');
    supply.innerHTML = `<div class="ic" style="background:#9db4ff">⬢</div><div class="col"><div class="amt" id="supply-amt">0/0</div><div class="lbl">Supply</div></div>`;
    this.$resbar.appendChild(supply);
    this.$supply = supply.querySelector('#supply-amt');
    this.root.appendChild(this.$resbar);

    // faction / sovereign panel
    this.$fpanel = el('div', 'panel'); this.$fpanel.id = 'faction-panel';
    this.$fpanel.innerHTML = `<div class="fp-name">${p.faction.name}</div><div class="fp-role">${p.faction.role}</div>
      <div class="fp-collapse" title="Collapse">▾</div>
      <div class="hdr">Sovereign Intelligence Stack</div><div class="stack-list"></div>`;
    const collapse = this.$fpanel.querySelector('.fp-collapse');
    collapse.onclick = () => {
      const c = this.$fpanel.classList.toggle('collapsed');
      collapse.textContent = c ? '▸' : '▾';
    };
    this.$stackList = this.$fpanel.querySelector('.stack-list');
    this.stackRows = SOVEREIGN_STACK.map((s, i) => {
      const row = el('div', 'stack-row');
      row.innerHTML = `<div class="stack-dot"></div><div class="stack-label">${i + 1}. ${s.name}</div><div class="stack-prog"></div>`;
      this.$stackList.appendChild(row);
      return { dot: row.querySelector('.stack-dot'), prog: row.querySelector('.stack-prog'), row };
    });
    this.root.appendChild(this.$fpanel);

    // minimap
    const mmWrap = el('div', 'panel'); mmWrap.id = 'minimap-wrap';
    mmWrap.innerHTML = `<div class="hdr">Tactical Map</div>`;
    this.$minimapCanvas = el('canvas'); this.$minimapCanvas.id = 'minimap';
    this.$minimapCanvas.width = 180; this.$minimapCanvas.height = 180;
    mmWrap.appendChild(this.$minimapCanvas);
    this.root.appendChild(mmWrap);

    // command panel
    this.$cmd = el('div', 'panel'); this.$cmd.id = 'cmd-panel';
    this.$cmd.innerHTML = `
      <div id="cmd-portrait"><div class="pname">—</div><div class="pcount"></div><div class="php"><i></i></div>
        <div class="queue-strip"></div></div>
      <div id="cmd-body"><div id="cmd-title">No selection</div><div id="cmd-actions"></div></div>`;
    this.$pname = this.$cmd.querySelector('.pname');
    this.$pcount = this.$cmd.querySelector('.pcount');
    this.$php = this.$cmd.querySelector('.php > i');
    this.$queue = this.$cmd.querySelector('.queue-strip');
    this.$cmdTitle = this.$cmd.querySelector('#cmd-title');
    this.$cmdActions = this.$cmd.querySelector('#cmd-actions');
    this.root.appendChild(this.$cmd);

    // control column
    this.$ctrl = el('div', ''); this.$ctrl.id = 'ctrl-col';
    const mk = (glyph, title, fn) => { const b = el('div', 'icon-btn', glyph); b.title = title; b.onclick = () => { this.audio?.play('click'); fn(); }; this.$ctrl.appendChild(b); return b; };
    mk('🔬', 'Research Tree (T)', () => this.toggleResearch());
    mk('⚡', 'Strategic Actions (A)', () => this.toggleActions());
    mk('❔', 'How to Play (H)', () => this.toggleHelp());
    mk('⏸', 'Pause (Esc)', () => this.hooks.onPause && this.hooks.onPause());
    this.root.appendChild(this.$ctrl);

    // alerts + toast + marquee
    this.$alerts = el('div', ''); this.$alerts.id = 'alerts'; this.root.appendChild(this.$alerts);
    this.$toast = el('div', ''); this.$toast.id = 'toast'; this.root.appendChild(this.$toast);
    this.$marquee = el('div', ''); this.$marquee.id = 'marquee'; this.root.appendChild(this.$marquee);

    // mobile controls
    this.$mobile = el('div', ''); this.$mobile.id = 'mobile-ctl';
    for (const [g, title, fn] of [
      ['➕', 'Zoom in', () => this.renderer.rig.zoomBy(-10)],
      ['➖', 'Zoom out', () => this.renderer.rig.zoomBy(10)],
      ['↻', 'Rotate', () => this.renderer.rig.rotateBy(0.4, 0)],
      ['✕', 'Clear selection', () => { this.cancelBuild(); this.clearSelection(); }],
      ['⛶', 'Fullscreen', () => {
        if (document.fullscreenElement) document.exitFullscreen?.();
        else document.documentElement.requestFullscreen?.();
      }],
    ]) {
      const b = el('div', 'icon-btn', g); b.title = title; b.onclick = fn; this.$mobile.appendChild(b);
    }
    this.root.appendChild(this.$mobile);

    // floating cancel button for build-placement mode (essential on touch)
    this.$buildCancel = el('button', 'btn', '✕ Cancel placement');
    this.$buildCancel.id = 'build-cancel'; this.$buildCancel.style.display = 'none';
    this.$buildCancel.onclick = () => this.cancelBuild();
    this.root.appendChild(this.$buildCancel);

    this.setSelection({ units: [], building: 0 });
  }

  // ---- selection -----------------------------------------------------------
  selectUnits(ids) { this.setSelection({ units: ids.slice(), building: 0 }); }
  selectBuilding(id) { this.setSelection({ units: [], building: id }); }
  clearSelection() { this.setSelection({ units: [], building: 0 }); }
  setSelection(sel) {
    this.sel = sel;
    this.renderer.setSelection(sel.building ? [sel.building] : sel.units);
    this._renderCommandPanel();
  }

  _renderCommandPanel() {
    const g = this.game, me = this.me;
    this.$cmdActions.innerHTML = ''; this.$queue.innerHTML = '';
    const units = this.sel.units.map(id => g.entity(id)).filter(u => u && u.state !== 'dead');
    const b = this.sel.building ? g.entity(this.sel.building) : null;

    if (b && b.owner === me) {
      this.$pname.textContent = b.def.name;
      this.$pcount.textContent = b.def.glyph;
      this.$php.style.width = `${(b.hp / b.maxHp) * 100}%`;
      this.$cmdTitle.textContent = b.state === 'construct' ? `Under construction — ${(b.buildProgress * 100 | 0)}%` : b.def.desc;
      // train buttons
      if (b.def.trains) {
        for (const uid of b.def.trains) {
          const def = UNITS[uid];
          if (def.faction && def.faction !== g.players[me].factionId) continue;
          this._cmdBtn(def.glyph, def.name, def.key, () => this._train(b.id, uid), () => this._trainEnabled(b, uid), this._unitTip(def));
        }
      }
      // production queue
      b.queue.forEach(item => {
        const q = el('div', 'queue-item', UNITS[item.defId].glyph);
        const bar = el('i'); bar.style.height = `${(item.progress / item.time) * 100}%`; q.appendChild(bar);
        this.$queue.appendChild(q);
      });
      return;
    }

    if (units.length) {
      const owned = units.filter(u => u.owner === me);
      const lead = owned[0] || units[0];
      this.$pname.textContent = owned.length ? lead.def.name : units[0].def.name;
      this.$pcount.textContent = units.length > 1 ? units.length : '';
      this.$php.style.width = `${(lead.hp / lead.maxHp) * 100}%`;
      this.$cmdTitle.textContent = owned.length ? lead.def.desc : `${units[0].def.name} (${g.players[units[0].owner].faction.name})`;
      if (!owned.length) return;

      const canBuild = owned.some(u => u.def.canBuild);
      if (canBuild) {
        for (const bid of BUILDABLE) {
          const def = BUILDINGS[bid];
          this._cmdBtn(def.glyph, def.name, def.key, () => this.startBuild(bid), () => this._affordB(def), this._buildTip(def));
        }
      }
      this._cmdBtn('🛑', 'Stop', 'S', () => this._stop(owned), () => true, 'Halt all current orders.');
      if (owned.some(u => u.def.dmg && u.def.class !== 'worker'))
        this._cmdBtn('⚔', 'Attack-Move', 'A', () => { this.attackMoveArmed = true; this.toast('Attack-move: right-click a location'); }, () => true, 'Advance while engaging any enemy encountered.');
      return;
    }

    // nothing selected
    this.$pname.textContent = '—'; this.$pcount.textContent = ''; this.$php.style.width = '0%';
    this.$cmdTitle.innerHTML = document.body.classList.contains('touch')
      ? 'Select a unit or building. <b>Tap</b> to select, <b>drag</b> to box-select, then <b>tap</b> a target to command.'
      : 'Select a unit or building. <b>Left-drag</b> to box-select, <b>right-click</b> to command.';
  }

  _cmdBtn(icon, label, key, onClick, enabledFn, tip) {
    const btn = el('div', 'cmd-btn');
    btn.innerHTML = `<div class="ci">${icon}</div><div class="cl">${label}</div>${key ? `<div class="ck">${key}</div>` : ''}`;
    if (tip) btn.title = tip;
    const enabled = !enabledFn || enabledFn();
    if (!enabled) btn.classList.add('disabled');
    btn.onclick = () => { if (enabledFn && !enabledFn()) { this.audio?.play('deny'); return; } this.audio?.play('click'); onClick(); };
    this.$cmdActions.appendChild(btn);
    return btn;
  }

  _train(bid, uid) { if (this.game.commandTrain(bid, uid)) this.audio?.play('train'); else this.audio?.play('deny'); }
  _trainEnabled(b, uid) {
    const g = this.game, p = g.players[this.me], def = UNITS[uid];
    if (def.requiresTech && !p.researched.has(def.requiresTech) && !p.unlocked.has(uid)) return false;
    for (const k in def.cost) if (p.res[k] < def.cost[k]) return false;
    if (p.supplyUsed + (def.supply || 1) > p.supplyCap) return false;
    return true;
  }
  _affordB(def) { const p = this.game.players[this.me]; for (const k in def.cost) if (p.res[k] < def.cost[k]) return false; return true; }
  _stop(units) { units.forEach(u => { u.state = 'idle'; u.goal = null; u.targetId = 0; u.attackMove = false; u.buildId = 0; if (u.def.gather) this.game.autoGather(u); }); }

  _unitTip(def) {
    const cost = Object.entries(def.cost).map(([k, v]) => `${v} ${RESOURCE_INFO[k].name}`).join(', ');
    return `${def.desc}\nCost: ${cost} · Supply ${def.supply || 1}${def.requiresTech ? `\nRequires: ${TECHS[def.requiresTech].name}` : ''}`;
  }
  _buildTip(def) {
    const cost = Object.entries(def.cost).map(([k, v]) => `${v} ${RESOURCE_INFO[k].name}`).join(', ');
    return `${def.desc}\nCost: ${cost}`;
  }

  // ---- build placement -----------------------------------------------------
  startBuild(bid) {
    this.buildMode = bid;
    this.toast(`Placing ${BUILDINGS[bid].name} — tap/click to build`);
    this.$buildCancel.style.display = 'block';
    if (this.hooks.onBuildMode) this.hooks.onBuildMode(bid);
  }
  cancelBuild() {
    this.buildMode = null;
    this.$buildCancel.style.display = 'none';
    if (this.hooks.onBuildMode) this.hooks.onBuildMode(null);
  }

  // ---- per-frame update ----------------------------------------------------
  update(dt) {
    const g = this.game, p = g.players[this.me];
    for (const r of RES) {
      this.resCells[r].amt.textContent = Math.floor(p.res[r]);
      const rate = p.income[r];
      const cell = this.resCells[r].rate;
      if (Math.abs(rate) < 0.05) { cell.textContent = ''; }
      else { cell.textContent = (rate > 0 ? '+' : '') + rate.toFixed(1); cell.className = 'rate ' + (rate > 0 ? 'pos' : 'neg'); }
    }
    this.$supply.textContent = `${p.supplyUsed}/${p.supplyCap}`;
    this.$supply.style.color = p.supplyUsed >= p.supplyCap ? 'var(--bad)' : 'var(--ink)';

    // sovereign stack
    for (let i = 0; i < this.stackRows.length; i++) {
      const row = this.stackRows[i];
      if (i < p.stackIndex) { row.dot.className = 'stack-dot done'; row.row.classList.add('done'); row.prog.textContent = '✓'; }
      else if (i === p.stackIndex) {
        row.dot.className = 'stack-dot active';
        const met = stageRequirementsMet(p);
        row.prog.textContent = `${(stackStageProgress(p) * 100 | 0)}%${met ? '' : ' ⏸'}`;
      } else { row.dot.className = 'stack-dot'; row.prog.textContent = ''; }
    }

    // refresh command panel enabled-states cheaply (rebuild ~4/sec)
    this._refreshT = (this._refreshT || 0) + dt;
    if (this._refreshT > 0.25) { this._refreshT = 0; this._renderCommandPanel(); if (this._actionsOpen) this._renderActions(); if (this._modalOpen === 'research') this._renderResearch(); }

    // prune dead from selection
    if (this.sel.units.length) {
      const live = this.sel.units.filter(id => { const e = g.entity(id); return e && e.state !== 'dead'; });
      if (live.length !== this.sel.units.length) this.sel.units = live;
    }
    if (this.sel.building && !g.entity(this.sel.building)) this.sel.building = 0;

    this.minimap.draw();
    this._fadeAlerts(dt);
  }

  // ---- alerts / toasts -----------------------------------------------------
  pushAlert(kind, title, desc) {
    const a = el('div', 'alert ' + kind);
    a.innerHTML = `<div class="at">${title}</div><div class="ad">${desc}</div>`;
    this.$alerts.appendChild(a);
    const item = { node: a, t: 6 };
    this.alerts.push(item);
    if (this.alerts.length > 6) { const old = this.alerts.shift(); old.node.remove(); }
    this.audio?.play(kind === 'bad' ? 'alert_bad' : kind === 'good' ? 'alert_good' : 'alert');
  }
  _fadeAlerts(dt) {
    for (let i = this.alerts.length - 1; i >= 0; i--) {
      const a = this.alerts[i]; a.t -= dt;
      if (a.t < 0.8) a.node.classList.add('fade');
      if (a.t <= 0) { a.node.remove(); this.alerts.splice(i, 1); }
    }
  }
  toast(text) {
    const t = el('div', 'toast-item', text); this.$toast.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 2200);
  }

  // ---- research modal ------------------------------------------------------
  toggleResearch() { if (this._modalOpen === 'research') return this.closeModal(); this.openResearch(); }
  openResearch() {
    this.closeModal();
    const back = el('div', 'modal-back');
    const modal = el('div', 'panel modal');
    modal.innerHTML = `<div class="modal-head"><h2>Research Tree — ${this.game.players[this.me].faction.name}</h2><div class="modal-x">✕</div></div>
      <div class="modal-body scroll"><div class="tech-tiers"></div></div>`;
    back.appendChild(modal); back.onclick = (e) => { if (e.target === back) this.closeModal(); };
    modal.querySelector('.modal-x').onclick = () => this.closeModal();
    this.$techTiers = modal.querySelector('.tech-tiers');
    this.root.appendChild(back);
    this._modalBack = back; this._modalOpen = 'research';
    this._renderResearch();
  }
  _renderResearch() {
    if (!this.$techTiers) return;
    const g = this.game, p = g.players[this.me];
    const techs = techsFor(p.factionId);
    const tiers = {};
    for (const t of techs) (tiers[t.tier] = tiers[t.tier] || []).push(t);
    this.$techTiers.innerHTML = '';
    for (const tier of Object.keys(tiers).sort()) {
      const wrap = el('div', 'tech-tier');
      wrap.appendChild(el('div', 'hdr', `Tier ${tier}`));
      const row = el('div', 'tech-row');
      for (const t of tiers[tier]) {
        const node = el('div', 'tech-node');
        const done = p.researched.has(t.id);
        const active = p.currentResearch?.techId === t.id;
        const locked = !done && !active && !this._canResearchUI(p, t);
        if (t.effect?.ultimate) node.classList.add('ult');
        if (done) node.classList.add('done'); else if (active) node.classList.add('active'); else if (locked) node.classList.add('locked');
        const cost = Object.entries(t.cost).map(([k, v]) => `<span>${v} ${RESOURCE_INFO[k].glyph}</span>`).join('');
        node.innerHTML = `<div class="tn">${t.name}${t.effect?.ultimate ? ' ★' : ''}</div><div class="td">${t.desc}</div>
          <div class="tcost">${done ? '<span>Researched ✓</span>' : cost}</div>
          <div class="tbar"><i style="width:${active ? (p.currentResearch.progress / p.currentResearch.time * 100) : 0}%"></i></div>`;
        if (!done && !active && !locked) node.onclick = () => { if (g.commandResearch(this.me, t.id)) { this.audio?.play('research_start'); this._renderResearch(); } else this.audio?.play('deny'); };
        row.appendChild(node);
      }
      wrap.appendChild(row); this.$techTiers.appendChild(wrap);
    }
  }
  _canResearchUI(p, t) {
    if (p.currentResearch) return false;
    if (t.requires) for (const r of t.requires) if (!p.researched.has(r)) return false;
    if (!this.game.buildings.some(b => b.owner === this.me && b.researchNode && b.state === 'ready')) return false;
    for (const k in t.cost) if (p.res[k] < t.cost[k]) return false;
    return true;
  }

  // ---- actions menu --------------------------------------------------------
  toggleActions() { this._actionsOpen ? this.closeModal() : this.openActions(); }
  openActions() {
    this.closeModal();
    const back = el('div', 'modal-back');
    const modal = el('div', 'panel modal'); modal.style.maxWidth = '520px';
    modal.innerHTML = `<div class="modal-head"><h2>Strategic Actions</h2><div class="modal-x">✕</div></div>
      <div class="modal-body scroll"><div id="act-list" style="display:flex;flex-direction:column;gap:8px"></div></div>`;
    back.appendChild(modal); back.onclick = (e) => { if (e.target === back) this.closeModal(); };
    modal.querySelector('.modal-x').onclick = () => this.closeModal();
    this.$actList = modal.querySelector('#act-list');
    this.root.appendChild(back); this._modalBack = back; this._actionsOpen = true;
    this._renderActions();
  }
  _renderActions() {
    if (!this.$actList) return;
    const g = this.game, p = g.players[this.me];
    this.$actList.innerHTML = '';
    for (const a of ACTION_LIST) {
      if (a.requiresTech && !p.researched.has(a.requiresTech)) continue;
      const cost = actionCost(p, a.id);
      const costStr = Object.entries(cost).map(([k, v]) => `${v} ${RESOURCE_INFO[k].glyph}`).join('  ');
      const cd = p.actionCd[a.id] || 0;
      const can = g.canAction(this.me, a.id);
      const row = el('div', 'panel'); row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 12px';
      row.innerHTML = `<div style="font-size:22px">${a.glyph}</div>
        <div style="flex:1"><div style="font-weight:700">${a.name} <span style="color:var(--ink-faint);font-size:10px">[${a.key}]</span></div>
        <div style="font-size:11px;color:var(--ink-dim)">${a.desc}</div>
        <div style="font-size:10px;font-family:var(--mono);color:var(--ink-faint);margin-top:3px">${costStr}${cd > 0 ? ` · cooldown ${cd.toFixed(0)}s` : ''}</div></div>`;
      const btn = el('div', 'btn' + (can ? ' primary' : ''), 'Execute'); if (!can) btn.style.opacity = '0.4';
      btn.onclick = () => { if (g.commandAction(this.me, a.id)) { this.audio?.play('action'); this._renderActions(); } else this.audio?.play('deny'); };
      row.appendChild(btn); this.$actList.appendChild(row);
    }
  }

  // ---- help ----------------------------------------------------------------
  toggleHelp() { this._modalOpen === 'help' ? this.closeModal() : this.openHelp(); }
  openHelp() {
    this.closeModal();
    const back = el('div', 'modal-back');
    const modal = el('div', 'panel modal');
    modal.innerHTML = `<div class="modal-head"><h2>How to Play — SOVEREIGN</h2><div class="modal-x">✕</div></div>
      <div class="modal-body scroll">${HELP_HTML}</div>`;
    back.appendChild(modal); back.onclick = (e) => { if (e.target === back) this.closeModal(); };
    modal.querySelector('.modal-x').onclick = () => this.closeModal();
    this.root.appendChild(back); this._modalBack = back; this._modalOpen = 'help';
  }

  closeModal() {
    if (this._modalBack) { this._modalBack.remove(); this._modalBack = null; }
    this._modalOpen = null; this._actionsOpen = false; this.$techTiers = null; this.$actList = null;
  }

  destroy() { this.root.innerHTML = ''; }
}

const HELP_HTML = `
<p style="color:var(--ink-dim);font-size:13px;margin-bottom:14px">You are one division of <b>Collective AI Inc.</b> racing rival divisions to
build <b>Sovereign Intelligence</b> — superintelligence — before they do. Grow your economy, research, expand and defend, then complete the 8-stage stack.</p>
<div class="help-cols">
  <div>
    <h3>Camera</h3><ul>
      <li><b>W A S D / Arrows</b> Pan</li><li><b>Q / E</b> Rotate</li><li><b>Scroll / +−</b> Zoom</li>
      <li><b>Middle-drag</b> Rotate</li><li><b>Space</b> Center on selection</li><li><b>Minimap</b> Click to jump</li></ul>
    <h3>Selection & Orders</h3><ul>
      <li><b>Left-click</b> Select unit/building</li><li><b>Left-drag</b> Box-select units</li>
      <li><b>Right-click</b> Move / Attack / Gather</li><li><b>Shift-click</b> Add to selection</li>
      <li><b>Right-click (building)</b> Set rally point</li>
      <li><b>Ctrl + 1–9</b> Assign control group</li><li><b>1–9</b> Select control group</li></ul>
    <h3>Touch Controls</h3><ul>
      <li><b>Tap</b> Select unit / building</li><li><b>Drag</b> Box-select units</li>
      <li><b>Tap ground/enemy</b> Command selection</li><li><b>Two fingers</b> Pan · pinch zoom · twist rotate</li>
      <li><b>✕ button</b> Clear selection</li></ul>
  </div>
  <div>
    <h3>Economy (8 resources)</h3><ul>
      <li><b>Workers</b> gather Compute, Data, Energy, Talent</li>
      <li><b>Buildings</b> generate Capital, Trust, Infra, Gov</li>
      <li><b>Energy</b> powers Data Centers — keep it positive</li></ul>
    <h3>Winning</h3><ul>
      <li>Complete the <b>Sovereign Stack</b> (top-left) by sustaining each resource threshold</li>
      <li><b>Research</b> unlocks units, ultimates & speed</li>
      <li><b>Strategic Actions</b> feed the stack & disrupt rivals</li>
      <li>Destroy every rival base to win by conquest</li></ul>
  </div>
</div>
<p style="color:var(--ink-faint);font-size:11px;margin-top:14px">Tip: the fastest path is economic — out-build and out-research your rivals. Military only slows them down.</p>`;
