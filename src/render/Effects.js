// ============================================================================
// Transient visual effects: weapon tracers, impact bursts, muzzle flashes,
// floating world text, and camera shake. Pooled where it matters.
// ============================================================================

import * as THREE from 'three';

function textSprite(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 40px Segoe UI, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.strokeText(text, 128, 32); ctx.fillStyle = color; ctx.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const s = new THREE.Sprite(mat); s.scale.set(6, 1.5, 1);
  return s;
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];       // active transient objects with {obj, t, life, update}
    this.shake = 0;
    this.shakeVec = new THREE.Vector3();
    this._geoRing = new THREE.RingGeometry(0.2, 0.5, 32);
    this._boltGeo = new THREE.CylinderGeometry(0.045, 0.045, 1, 8);
  }

  _add(obj, life, update) { this.scene.add(obj); this.items.push({ obj, t: 0, life, update }); }

  tracer(ax, az, bx, bz, color = 0x8fdcff) {
    const start = new THREE.Vector3(ax, 1.25, az);
    const end = new THREE.Vector3(bx, 1.25, bz);
    const mid = start.clone().lerp(end, 0.5);
    const len = start.distanceTo(end);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
    const bolt = new THREE.Mesh(this._boltGeo, mat);
    bolt.position.copy(mid);
    bolt.scale.set(1, len, 1);
    bolt.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
    this._add(bolt, 0.28, (it) => { const k = 1 - it.t / it.life; mat.opacity = 0.95 * k; bolt.scale.x = bolt.scale.z = 1 + (1-k)*4; });
    const g = new THREE.BufferGeometry().setFromPoints([start, end]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    const line = new THREE.Line(g, lineMat);
    this._add(line, 0.18, (it) => { lineMat.opacity = 0.85 * (1 - it.t / it.life); });
  }

  meleeArc(ax, az, bx, bz, color = 0xff7a5c) {
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(ax,1.1,az), new THREE.Vector3((ax+bx)/2,2.1,(az+bz)/2), new THREE.Vector3(bx,1.1,bz));
    const g = new THREE.BufferGeometry().setFromPoints(curve.getPoints(18));
    const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1 });
    const line = new THREE.Line(g, m);
    this._add(line, 0.32, (it) => { m.opacity = 1 - it.t / it.life; line.scale.setScalar(1 + it.t * 1.5); });
  }

  muzzle(x, z, color = 0xfff1c0) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 }));
    m.position.set(x, 1.2, z);
    this._add(m, 0.12, (it) => { const k = 1 - it.t / it.life; m.scale.setScalar(0.5 + k); m.material.opacity = k; });
  }

  impact(x, z, ranged = true) {
    const color = ranged ? 0xfff07a : 0xff6a6a;
    const ring = new THREE.Mesh(this._geoRing, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.3, z);
    this._add(ring, 0.48, (it) => { const k = it.t / it.life; ring.scale.setScalar(1 + k * (ranged ? 7 : 4)); ring.material.opacity = 0.9 * (1 - k); });
    // sparks
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.12, 5, 4), new THREE.MeshBasicMaterial({ color, transparent: true }));
      s.position.set(x, 0.8, z);
      const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 4;
      const vx = Math.cos(a) * sp, vz = Math.sin(a) * sp, vy = 3 + Math.random() * 3;
      this._add(s, 0.4, (it) => { const dt = 1 / 60; s.position.x += vx * dt; s.position.z += vz * dt; s.position.y += (vy - it.t * 20) * dt; s.material.opacity = 1 - it.t / it.life; });
    }
    this.addShake(ranged ? 0.15 : 0.4);
  }

  explosion(x, z, color = 0xff8a4a) {
    const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color, transparent: true }));
    flash.position.set(x, 1.4, z);
    this._add(flash, 0.5, (it) => { const k = it.t / it.life; flash.scale.setScalar(1 + k * 6); flash.material.opacity = 1 - k; });
    for (let i = 0; i < 16; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.2, 5, 4), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffd27a : color, transparent: true }));
      s.position.set(x, 1.2, z);
      const a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 7;
      const vx = Math.cos(a) * sp, vz = Math.sin(a) * sp, vy = 4 + Math.random() * 5;
      this._add(s, 0.7, (it) => { const dt = 1 / 60; s.position.x += vx * dt; s.position.z += vz * dt; s.position.y += (vy - it.t * 18) * dt; s.material.opacity = 1 - it.t / it.life; });
    }
    this.addShake(0.9);
  }

  floatText(x, z, text, color = '#ffffff') {
    const s = textSprite(text, color);
    s.position.set(x, 2.2, z);
    this._add(s, 1.1, (it) => { s.position.y = 2.2 + it.t * 2.2; s.material.opacity = 1 - it.t / it.life; });
  }

  ringPulse(x, z, color = 0x8fd0ff, r = 3) {
    const ring = new THREE.Mesh(this._geoRing, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.3, z);
    this._add(ring, 0.5, (it) => { const k = it.t / it.life; ring.scale.setScalar(1 + k * r); ring.material.opacity = 0.8 * (1 - k); });
  }

  addShake(a) { this.shake = Math.min(this.shake + a, 1.5); }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt; it.update && it.update(it);
      if (it.t >= it.life) {
        this.scene.remove(it.obj);
        it.obj.geometry?.dispose?.(); it.obj.material?.dispose?.();
        this.items.splice(i, 1);
      }
    }
    // decay shake, expose offset
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const s = this.shake * this.shake;
    this.shakeVec.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
  }
}
