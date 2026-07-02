// ============================================================================
// Input — pointer, keyboard and touch controls wired to the camera rig,
// renderer picking, UI selection and Game command API. Trackpad-first.
// ============================================================================

import * as THREE from 'three';
import { CAMERA } from '../data/constants.js';
import { BUILDINGS } from '../data/buildings.js';

export class Input {
  constructor(canvas, game, renderer, ui, audio) {
    this.canvas = canvas;
    this.game = game;
    this.renderer = renderer;
    this.ui = ui;
    this.audio = audio;
    this.rig = renderer.rig;
    this.me = game.human.index;

    this.keys = new Set();
    this.paused = false;
    this.enabled = true;

    this.drag = null;        // marquee { x0,y0,x1,y1 }
    this.rotating = false;
    this.ghost = null;
    this.attackMoveArmed = false;
    this.groups = {};        // control groups: digit -> [unit ids]

    // touch state
    this._touchPointers = new Set();  // active touch pointerIds
    this._touchStart = null;          // { x, y, id } for tap detection

    ui.hooks.onBuildMode = (bid) => this._setGhost(bid);
    this._bind();
  }

  setPaused(p) { this.paused = p; }

  _bind() {
    const c = this.canvas;
    this._touches = new Map();
    this._h = {
      ctx: e => e.preventDefault(),
      down: e => this._down(e),
      move: e => this._move(e),
      up: e => this._up(e),
      wheel: e => { e.preventDefault(); this.rig.zoomBy(Math.sign(e.deltaY) * 6 + e.deltaY * 0.02); },
      keydown: e => this._key(e, true),
      keyup: e => this._key(e, false),
      tstart: e => this._touch(e), tmove: e => this._touch(e), tend: e => this._touchEnd(e),
    };
    c.addEventListener('contextmenu', this._h.ctx);
    c.addEventListener('pointerdown', this._h.down);
    window.addEventListener('pointermove', this._h.move);
    window.addEventListener('pointerup', this._h.up);
    c.addEventListener('wheel', this._h.wheel, { passive: false });
    window.addEventListener('keydown', this._h.keydown);
    window.addEventListener('keyup', this._h.keyup);
    c.addEventListener('touchstart', this._h.tstart, { passive: false });
    c.addEventListener('touchmove', this._h.tmove, { passive: false });
    c.addEventListener('touchend', this._h.tend);
    if ('ontouchstart' in window) document.body.classList.add('touch');
  }

  destroy() {
    const c = this.canvas, h = this._h;
    c.removeEventListener('contextmenu', h.ctx); c.removeEventListener('pointerdown', h.down);
    window.removeEventListener('pointermove', h.move); window.removeEventListener('pointerup', h.up);
    c.removeEventListener('wheel', h.wheel);
    window.removeEventListener('keydown', h.keydown); window.removeEventListener('keyup', h.keyup);
    c.removeEventListener('touchstart', h.tstart); c.removeEventListener('touchmove', h.tmove); c.removeEventListener('touchend', h.tend);
  }

  // ---- pointer -------------------------------------------------------------
  _down(e) {
    if (!this.enabled || this.paused) return;
    if (e.pointerType === 'touch') { this._touchDown(e); return; }
    if (e.button === 2) { this._rightClick(e); return; }
    if (e.button === 1) { this.rotating = true; this._lastRot = { x: e.clientX, y: e.clientY }; return; }
    // left button
    if (this.ui.buildMode) { this._place(e); return; }
    const id = this.renderer.pickEntity(e.clientX, e.clientY);
    if (id) {
      const ent = this.game.entity(id);
      if (ent && ent.kind === 'building') { this.audio?.play('select'); this.ui.selectBuilding(id); this.drag = null; return; }
      if (ent && ent.kind === 'unit' && ent.owner === this.me) {
        this.audio?.play('select');
        if (e.shiftKey) { const s = new Set(this.ui.sel.units); s.add(id); this.ui.selectUnits([...s]); }
        else this.ui.selectUnits([id]);
        this.drag = null; return;
      }
      if (ent && ent.kind === 'unit') { this.ui.selectUnits([id]); return; } // enemy unit inspect
    }
    // begin marquee
    this.drag = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, shift: e.shiftKey };
  }

  _move(e) {
    if (e.pointerType === 'touch') { this._touchMove(e); return; }
    if (this.rotating && this._lastRot) {
      const dx = e.clientX - this._lastRot.x, dy = e.clientY - this._lastRot.y;
      this.rig.rotateBy(-dx * CAMERA.ROT_SPEED, dy * CAMERA.ROT_SPEED * 0.6);
      this._lastRot = { x: e.clientX, y: e.clientY };
    }
    if (this.drag) {
      this.drag.x1 = e.clientX; this.drag.y1 = e.clientY;
      this._drawMarquee();
    }
    if (this.ui.buildMode) this._moveGhost(e);
    this._lastPointer = { x: e.clientX, y: e.clientY };
  }

  _up(e) {
    if (e.pointerType === 'touch') { this._touchUp(e); return; }
    if (e.button === 1) { this.rotating = false; return; }
    if (this.drag) {
      const d = this.drag; this.drag = null;
      this.ui.$marquee.style.display = 'none';
      const moved = Math.abs(d.x1 - d.x0) + Math.abs(d.y1 - d.y0);
      if (moved < 6) { if (!d.shift) this.ui.clearSelection(); return; }
      this._marqueeSelect(d);
    }
  }

  _marqueeSelect(d) {
    const r = this.canvas.getBoundingClientRect();
    const toNdc = (x, y) => [((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1];
    const [nx0, ny0] = toNdc(d.x0, d.y0), [nx1, ny1] = toNdc(d.x1, d.y1);
    const ids = this.renderer.unitsInRect(nx0, ny0, nx1, ny1, this.me);
    if (ids.length) { this.audio?.play('select'); this.ui.selectUnits(d.shift ? [...new Set([...this.ui.sel.units, ...ids])] : ids); }
    else if (!d.shift) this.ui.clearSelection();
  }

  _drawMarquee() {
    const d = this.drag, m = this.ui.$marquee;
    m.style.display = 'block';
    m.style.left = Math.min(d.x0, d.x1) + 'px';
    m.style.top = Math.min(d.y0, d.y1) + 'px';
    m.style.width = Math.abs(d.x1 - d.x0) + 'px';
    m.style.height = Math.abs(d.y1 - d.y0) + 'px';
  }

  // ---- touch pointers: tap select / tap command / drag marquee -------------
  // One finger: tap = select or context-command, drag = marquee box-select.
  // Two fingers (handled via touch events): pinch zoom, pan, twist rotate.
  _touchDown(e) {
    this._touchPointers.add(e.pointerId);
    if (this._touchPointers.size > 1) {
      // second finger: cancel any pending tap/marquee — camera gesture now
      this._touchStart = null;
      if (this.drag) { this.drag = null; this.ui.$marquee.style.display = 'none'; }
      return;
    }
    this._touchStart = { x: e.clientX, y: e.clientY, id: e.pointerId };
    this._lastPointer = { x: e.clientX, y: e.clientY };
  }

  _touchMove(e) {
    if (!this._touchPointers.has(e.pointerId)) return;
    if (this._touchPointers.size > 1) return; // pinch/pan handled by touch events
    if (this.ui.buildMode) { this._moveGhost(e); this._lastPointer = { x: e.clientX, y: e.clientY }; return; }
    if (this.drag) {
      this.drag.x1 = e.clientX; this.drag.y1 = e.clientY;
      this._drawMarquee();
    } else if (this._touchStart && this._touchStart.id === e.pointerId) {
      const moved = Math.abs(e.clientX - this._touchStart.x) + Math.abs(e.clientY - this._touchStart.y);
      if (moved > 14) {
        this.drag = { x0: this._touchStart.x, y0: this._touchStart.y, x1: e.clientX, y1: e.clientY, shift: false };
        this._drawMarquee();
      }
    }
    this._lastPointer = { x: e.clientX, y: e.clientY };
  }

  _touchUp(e) {
    this._touchPointers.delete(e.pointerId);
    if (this.drag) {
      const d = this.drag; this.drag = null;
      this.ui.$marquee.style.display = 'none';
      this._marqueeSelect(d);
      this._touchStart = null;
      return;
    }
    const ts = this._touchStart;
    this._touchStart = null;
    if (!ts || ts.id !== e.pointerId) return;
    const moved = Math.abs(e.clientX - ts.x) + Math.abs(e.clientY - ts.y);
    if (moved > 14) return;
    this._tap(e);
  }

  // A single-finger tap: select what's under the finger, otherwise issue the
  // context command (the touch equivalent of desktop right-click).
  _tap(e) {
    if (!this.enabled || this.paused) return;
    if (this.ui.buildMode) { this._place(e); return; }

    const sel = this.ui.sel;
    const id = this.renderer.pickEntity(e.clientX, e.clientY);
    if (id) {
      const ent = this.game.entity(id);
      if (ent && ent.owner === this.me) {
        // own entity: select it
        this.audio?.play('select');
        if (ent.kind === 'building') this.ui.selectBuilding(id);
        else this.ui.selectUnits([id]);
        return;
      }
      if (ent) {
        // enemy: attack with current selection, else inspect
        const own = sel.units.filter(uid => { const u = this.game.entity(uid); return u && u.owner === this.me; });
        if (own.length && !this.game.players[this.me].allies.has(ent.owner) && !this.game.players[ent.owner]?.defeated) {
          this.game.commandAttack(own, id); this.audio?.play('attack_order');
          this.renderer.effects.ringPulse(ent.x, ent.z, 0xff5d6c, 3);
        } else if (ent.kind === 'unit') this.ui.selectUnits([id]);
        return;
      }
    }
    const nid = this.renderer.pickNode(e.clientX, e.clientY);
    if (nid) {
      const workers = sel.units.filter(uid => { const u = this.game.entity(uid); return u && u.owner === this.me && u.def.gather; });
      if (workers.length) {
        this.game.commandGather(workers, nid); this.audio?.play('move');
        const n = this.game.world.nodes.find(x => x.id === nid);
        this.renderer.effects.ringPulse(n.x, n.z, 0x37e0a0, 3);
        return;
      }
    }
    // ground tap
    const gp = this.renderer.groundPoint(e.clientX, e.clientY);
    if (!gp) return;
    if (sel.building) {
      const b = this.game.entity(sel.building);
      if (b && b.owner === this.me) {
        this.game.commandSetRally(sel.building, gp.x, gp.z);
        this.ui.toast('Rally point set');
        this.renderer.effects.ringPulse(gp.x, gp.z, 0xffffff, 3);
      } else this.ui.clearSelection();
      return;
    }
    const own = sel.units.filter(uid => { const u = this.game.entity(uid); return u && u.owner === this.me; });
    if (own.length) {
      this.game.commandMove(own, gp.x, gp.z, this.attackMoveArmed || this.ui.attackMoveArmed);
      this.attackMoveArmed = false; this.ui.attackMoveArmed = false;
      this.audio?.play('move');
      this.renderer.effects.ringPulse(gp.x, gp.z, 0x8fd0ff, 2.4);
    } else {
      this.ui.clearSelection();
    }
  }

  // ---- right click = context command --------------------------------------
  _rightClick(e) {
    if (this.ui.buildMode) { this.ui.cancelBuild(); return; }
    const sel = this.ui.sel;
    if (sel.building) {
      const gp = this.renderer.groundPoint(e.clientX, e.clientY);
      if (gp) { this.game.commandSetRally(sel.building, gp.x, gp.z); this.ui.toast('Rally point set'); this.renderer.effects.ringPulse(gp.x, gp.z, 0xffffff, 3); }
      return;
    }
    if (!sel.units.length) return;
    const own = sel.units.filter(id => { const u = this.game.entity(id); return u && u.owner === this.me; });
    if (!own.length) return;

    const tid = this.renderer.pickEntity(e.clientX, e.clientY);
    if (tid) {
      const t = this.game.entity(tid);
      if (t && t.owner !== this.me && !this.game.players[this.me].allies.has(t.owner) && !this.game.players[t.owner]?.defeated) {
        this.game.commandAttack(own, tid); this.audio?.play('attack_order');
        this.renderer.effects.ringPulse(t.x, t.z, 0xff5d6c, 3); return;
      }
    }
    const nid = this.renderer.pickNode(e.clientX, e.clientY);
    if (nid) {
      const workers = own.filter(id => this.game.entity(id).def.gather);
      if (workers.length) { this.game.commandGather(workers, nid); this.audio?.play('move'); const n = this.game.world.nodes.find(x => x.id === nid); this.renderer.effects.ringPulse(n.x, n.z, 0x37e0a0, 3); return; }
    }
    const gp = this.renderer.groundPoint(e.clientX, e.clientY);
    if (gp) {
      this.game.commandMove(own, gp.x, gp.z, this.attackMoveArmed || this.ui.attackMoveArmed);
      this.attackMoveArmed = false; this.ui.attackMoveArmed = false;
      this.audio?.play('move');
      this.renderer.effects.ringPulse(gp.x, gp.z, 0x8fd0ff, 2.4);
    }
  }

  // ---- build placement -----------------------------------------------------
  _setGhost(bid) {
    if (this.ghost) { this.renderer.hideGhost(); this.ghost = null; }
    if (!bid) return;
    const def = BUILDINGS[bid];
    const s = def.size * this.game.world.tile;
    const geo = new THREE.BoxGeometry(s * 0.95, 2, s * 0.95);
    const mat = new THREE.MeshBasicMaterial({ color: 0x37e0a0, transparent: true, opacity: 0.5 });
    const mesh = new THREE.Mesh(geo, mat); mesh.position.y = 1;
    const g = new THREE.Group(); g.add(mesh);
    this.ghost = { group: g, bid };
    this.renderer.showGhost(g);
    if (this._lastPointer) this._moveGhost({ clientX: this._lastPointer.x, clientY: this._lastPointer.y });
  }
  _moveGhost(e) {
    if (!this.ui.buildMode) return;
    const gp = this.renderer.groundPoint(e.clientX, e.clientY);
    if (!gp) return;
    const place = this.game.canBuildAt(this.ui.buildMode, gp.x, gp.z, this.me);
    const w = this.game.world.tileToWorld(place.tx, place.tz);
    const def = BUILDINGS[this.ui.buildMode];
    const cx = w.x + ((def.size - 1) * this.game.world.tile) / 2;
    const cz = w.z + ((def.size - 1) * this.game.world.tile) / 2;
    this.renderer.moveGhost(cx, cz, place.ok, def.size);
  }
  _place(e) {
    const gp = this.renderer.groundPoint(e.clientX, e.clientY);
    if (!gp) return;
    const builders = this.ui.sel.units.filter(id => { const u = this.game.entity(id); return u && u.owner === this.me && u.def.canBuild; });
    const ok = this.game.commandBuild(this.me, this.ui.buildMode, gp.x, gp.z, builders);
    if (ok) { this.audio?.play('build_place'); if (!e.shiftKey) this.ui.cancelBuild(); }
    else this.audio?.play('deny');
  }

  // ---- keyboard ------------------------------------------------------------
  _key(e, down) {
    const k = e.key.toLowerCase();
    if (down) {
      if (k === 'escape') { if (this.ui.buildMode) { this.ui.cancelBuild(); return; } if (this.ui._modalOpen || this.ui._actionsOpen) { this.ui.closeModal(); return; } this.ui.hooks.onPause && this.ui.hooks.onPause(); return; }
      if (this.ui._modalOpen || this.ui._actionsOpen) { if (k === 't' || k === 'h' || k === 'a') this.ui.closeModal(); return; }
      if (k === 't') { this.ui.toggleResearch(); return; }
      if (k === 'h') { this.ui.toggleHelp(); return; }
      if (k === 'a' && !this.ui.sel.units.length && !this.ui.sel.building) { this.ui.toggleActions(); return; }
      if (k === ' ') { this._centerSelection(); e.preventDefault(); return; }
      // control groups: Ctrl/Cmd+digit assigns, digit recalls
      if (k >= '1' && k <= '9') {
        if (e.ctrlKey || e.metaKey) {
          if (this.ui.sel.units.length) { this.groups[k] = this.ui.sel.units.slice(); this.ui.toast(`Control group ${k} set`); }
          e.preventDefault(); return;
        }
        const g = (this.groups[k] || []).filter(id => { const u = this.game.entity(id); return u && u.state !== 'dead'; });
        if (g.length) { this.groups[k] = g; this.ui.selectUnits(g); if (this._lastGroupKey === k && performance.now() - (this._lastGroupT || 0) < 400) this._centerSelection(); this._lastGroupKey = k; this._lastGroupT = performance.now(); }
        return;
      }
      // context hotkeys: trigger matching command button
      this._hotkey(k);
    }
    if (['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', '+', '=', '-'].includes(k)) {
      if (down) this.keys.add(k); else this.keys.delete(k);
    }
  }

  _hotkey(k) {
    // find a command button whose key matches and click it
    const btns = this.ui.$cmdActions.querySelectorAll('.cmd-btn');
    for (const b of btns) {
      const kk = b.querySelector('.ck');
      if (kk && kk.textContent.toLowerCase() === k) { b.click(); return; }
    }
  }

  _centerSelection() {
    const sel = this.ui.sel;
    let x, z;
    if (sel.building) { const b = this.game.entity(sel.building); if (b) { x = b.x; z = b.z; } }
    else if (sel.units.length) {
      let sx = 0, sz = 0, n = 0;
      for (const id of sel.units) { const u = this.game.entity(id); if (u) { sx += u.x; sz += u.z; n++; } }
      if (n) { x = sx / n; z = sz / n; }
    }
    if (x !== undefined) this.rig.desiredTarget.set(x, 0, z);
  }

  // ---- touch (pinch zoom + two-finger pan + twist rotate) ------------------
  _touch(e) {
    e.preventDefault();
    for (const t of e.changedTouches) this._touches.set(t.identifier, { x: t.clientX, y: t.clientY });
    const pts = [...this._touches.values()];
    if (pts.length === 2 && this._prevPinch) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      this.rig.zoomBy((this._prevPinch - d) * 0.08);
      const mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2;
      if (this._prevMid) this.rig.panBy((this._prevMid.x - mx) * 0.06, (this._prevMid.y - my) * 0.06);
      const ang = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      if (this._prevAng !== null && this._prevAng !== undefined) {
        let da = ang - this._prevAng;
        while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
        this.rig.rotateBy(da, 0);
      }
      this._prevMid = { x: mx, y: my }; this._prevPinch = d; this._prevAng = ang;
    } else if (pts.length === 2) {
      this._prevPinch = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      this._prevMid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      this._prevAng = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
    }
  }
  _touchEnd(e) {
    for (const t of e.changedTouches) this._touches.delete(t.identifier);
    if (this._touches.size < 2) { this._prevPinch = null; this._prevMid = null; this._prevAng = null; }
  }

  // ---- per-frame -----------------------------------------------------------
  update(dt) {
    if (this.paused) return;
    const speed = CAMERA.PAN_SPEED * this.rig.zoom * dt * 2.2;
    let dx = 0, dz = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) dx -= speed;
    if (this.keys.has('d') || this.keys.has('arrowright')) dx += speed;
    if (this.keys.has('w') || this.keys.has('arrowup')) dz -= speed;
    if (this.keys.has('s') || this.keys.has('arrowdown')) dz += speed;
    if (dx || dz) this.rig.panBy(dx, dz);
    if (this.keys.has('q')) this.rig.rotateBy(CAMERA.ROT_SPEED * 6, 0);
    if (this.keys.has('e')) this.rig.rotateBy(-CAMERA.ROT_SPEED * 6, 0);
    if (this.keys.has('+') || this.keys.has('=')) this.rig.zoomBy(-speed * 0.5);
    if (this.keys.has('-')) this.rig.zoomBy(speed * 0.5);
  }
}
