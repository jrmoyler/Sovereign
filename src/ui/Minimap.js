// ============================================================================
// Canvas minimap: terrain bounds, resource nodes, buildings, units, camera
// viewport box. Click/drag to move the camera.
// ============================================================================

import { MAP } from '../data/constants.js';
import { NODE_TYPES } from '../data/balance.js';

export class Minimap {
  constructor(canvas, game, renderer) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.renderer = renderer;
    // Render the backing store at device resolution (CSS controls display
    // size) so the map stays crisp on high-DPI screens.
    this.size = canvas.width;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = this.size * dpr;
    canvas.height = this.size * dpr;
    this.ctx.scale(dpr, dpr);
    this.S = MAP.SIZE;
    this._bindInput();
  }

  worldToMap(x, z) {
    const s = this.size / this.S;
    return { mx: (x + this.S / 2) * s, my: (z + this.S / 2) * s };
  }
  mapToWorld(mx, my) {
    const s = this.S / this.size;
    return { x: mx * s - this.S / 2, z: my * s - this.S / 2 };
  }

  _bindInput() {
    const move = (e) => {
      const r = this.canvas.getBoundingClientRect();
      const mx = (e.clientX - r.left) * (this.size / r.width);
      const my = (e.clientY - r.top) * (this.size / r.height);
      const w = this.mapToWorld(mx, my);
      this.renderer.rig.desiredTarget.set(w.x, 0, w.z);
    };
    let down = false;
    this.canvas.addEventListener('pointerdown', (e) => { down = true; move(e); this.canvas.setPointerCapture(e.pointerId); });
    this.canvas.addEventListener('pointermove', (e) => { if (down) move(e); });
    this.canvas.addEventListener('pointerup', () => { down = false; });
  }

  draw() {
    const c = this.ctx, g = this.game, S = this.size;
    c.clearRect(0, 0, S, S);
    c.fillStyle = '#04060c'; c.fillRect(0, 0, S, S);

    // resource nodes
    for (const n of g.world.nodes) {
      if (n.amount <= 0) continue;
      const { mx, my } = this.worldToMap(n.x, n.z);
      c.fillStyle = NODE_TYPES[n.type].color; c.globalAlpha = 0.8;
      c.fillRect(mx - 1, my - 1, 2.5, 2.5);
    }
    c.globalAlpha = 1;

    // buildings
    for (const b of g.buildings) {
      if (b.state === 'dead') continue;
      const { mx, my } = this.worldToMap(b.x, b.z);
      c.fillStyle = g.players[b.owner].color;
      const s = b.def.isHQ ? 5 : 3;
      c.fillRect(mx - s / 2, my - s / 2, s, s);
    }
    // units
    for (const u of g.units) {
      if (u.state === 'dead') continue;
      const { mx, my } = this.worldToMap(u.x, u.z);
      c.fillStyle = g.players[u.owner].color;
      c.fillRect(mx - 1, my - 1, 2, 2);
    }

    // camera viewport marker
    const t = this.renderer.rig.target;
    const { mx, my } = this.worldToMap(t.x, t.z);
    const box = Math.max(8, 44 - this.renderer.rig.zoom * 0.14);
    c.strokeStyle = 'rgba(220,235,255,0.75)'; c.lineWidth = 1;
    c.strokeRect(mx - box / 2, my - box / 2, box, box);
  }
}
