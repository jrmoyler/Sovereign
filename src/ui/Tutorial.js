// ============================================================================
// Tutorial — a short sequence of coach marks anchored to HUD elements that
// teaches the core loop. Advances via Next / Skip; can auto-advance on events.
// ============================================================================

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

const STEPS = [
  { title: 'Welcome, Division Lead', anchor: 'center',
    text: 'You are one division of Collective AI Inc. Beat rival divisions to <b>Sovereign Intelligence</b>. This 6-step guide covers the basics.' },
  { title: 'Your Resources', anchor: '#resbar',
    text: 'Eight resources fuel the race. <b>Workers</b> gather Compute, Data, Energy & Talent; <b>buildings</b> generate Capital, Trust, Infra & Governance.' },
  { title: 'The Sovereign Stack', anchor: '#faction-panel',
    text: 'Your win path. Each stage completes when you <b>sustain</b> its resource threshold. First division to finish all 8 wins.' },
  { title: 'Select & Build', anchor: '#cmd-panel',
    text: 'Left-drag to box-select your workers, then use this panel to <b>build</b>. Start with an <b>Energy Node</b> and a <b>Data Center</b> to grow Compute.' },
  { title: 'Research', anchor: '#ctrl-col',
    text: 'Open the <b>Research Tree</b> (🔬 / T) to unlock units, speed and your faction <b>Ultimate</b>. Open <b>Strategic Actions</b> (⚡ / A) to feed the stack and disrupt rivals.' },
  { title: 'Command the Map', anchor: '#minimap-wrap',
    text: 'Right-click to move, attack or gather. Use the minimap to jump around. Defend your base — rivals will attack. Good luck. The race begins now.' },
];

export class Tutorial {
  constructor(root) { this.root = root; this.i = 0; this.node = null; this.onDone = null; }

  start(onDone) {
    if (localStorage.getItem('sovereign_tut_done')) { onDone && onDone(); return; }
    this.onDone = onDone; this.i = 0; this._show();
  }
  skip() { localStorage.setItem('sovereign_tut_done', '1'); this._close(); this.onDone && this.onDone(); }

  _show() {
    this._close();
    const step = STEPS[this.i];
    const box = el('div', 'panel'); box.id = 'coach';
    box.innerHTML = `<div class="ct">${step.title}</div><div class="cd">${step.text}</div>
      <div class="cn"><span class="step">${this.i + 1} / ${STEPS.length}</span>
      <button class="btn" data-skip>Skip</button><button class="btn primary" data-next>${this.i === STEPS.length - 1 ? 'Start' : 'Next'}</button></div>`;
    this.root.appendChild(box); this.node = box;

    // position near anchor
    if (step.anchor === 'center') { box.style.left = '50%'; box.style.top = '42%'; box.style.transform = 'translate(-50%,-50%)'; }
    else {
      const a = document.querySelector(step.anchor);
      const r = a ? a.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight / 2, right: 0, bottom: 0, width: 0, height: 0 };
      let left = r.left, top = r.bottom + 12;
      if (r.bottom > window.innerHeight - 180) top = r.top - 150;
      if (r.left > window.innerWidth - 320) left = window.innerWidth - 320;
      box.style.left = Math.max(10, left) + 'px'; box.style.top = Math.max(10, top) + 'px';
    }
    box.querySelector('[data-next]').onclick = () => this._next();
    box.querySelector('[data-skip]').onclick = () => this.skip();
  }
  _next() { this.i++; if (this.i >= STEPS.length) { localStorage.setItem('sovereign_tut_done', '1'); this._close(); this.onDone && this.onDone(); } else this._show(); }
  _close() { if (this.node) { this.node.remove(); this.node = null; } }
}
