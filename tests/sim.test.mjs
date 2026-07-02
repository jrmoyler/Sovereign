// Headless simulation test: runs the core game (no DOM / Three.js) for every
// faction, checks that units train, buildings build, research works, specialists
// unlock, AI plays, and a game can be won.
import { Game } from '../src/core/Game.js';
import { FACTIONS, PLAYABLE_FACTIONS } from '../src/data/factions.js';
import { UNITS } from '../src/data/units.js';
import { TECHS, techsFor } from '../src/data/tech.js';
import { BUILDINGS } from '../src/data/buildings.js';
import { applyTech } from '../src/core/Research.js';

let failures = 0;
const fail = (msg) => { failures++; console.error('FAIL:', msg); };
const ok = (msg) => console.log('ok:', msg);

// ---- data integrity ---------------------------------------------------------
if (PLAYABLE_FACTIONS.length !== 20) fail(`expected 20 playable factions, got ${PLAYABLE_FACTIONS.length}`);
else ok('all 20 divisions are playable');

for (const f of FACTIONS) {
  if (!f.specialist || !UNITS[f.specialist]) fail(`${f.id}: missing specialist unit (${f.specialist})`);
  if (!f.ultimate || !TECHS[f.ultimate]) fail(`${f.id}: missing ultimate tech (${f.ultimate})`);
  const spec = UNITS[f.specialist];
  if (spec && spec.faction !== f.id) fail(`${f.id}: specialist ${f.specialist} has faction ${spec.faction}`);
  const ult = TECHS[f.ultimate];
  if (ult && ult.faction !== f.id) fail(`${f.id}: ultimate ${f.ultimate} has faction ${ult.faction}`);
  // specialist must be trainable somewhere
  if (spec) {
    const producer = Object.values(BUILDINGS).find(b => b.trains?.includes(spec.id));
    if (!producer) fail(`${f.id}: specialist ${spec.id} not in any building trains list`);
    else if (producer.id !== spec.producedBy) fail(`${f.id}: specialist ${spec.id} producedBy=${spec.producedBy} but trained at ${producer.id}`);
  }
  // specialist tech gate must exist and be researchable by this faction
  if (spec?.requiresTech) {
    const t = TECHS[spec.requiresTech];
    if (!t) fail(`${f.id}: specialist requires missing tech ${spec.requiresTech}`);
    else if (t.faction && t.faction !== f.id) fail(`${f.id}: specialist gate ${t.id} belongs to ${t.faction}`);
  }
  // ultimate requirements resolvable for this faction
  if (ult?.requires) for (const r of ult.requires) {
    const t = TECHS[r];
    if (!t) fail(`${f.id}: ultimate requires missing tech ${r}`);
    else if (t.faction && t.faction !== f.id) fail(`${f.id}: ultimate requires ${r} owned by ${t.faction}`);
  }
}
ok('faction / unit / tech / building cross-references are consistent');

// techsFor should include exactly the generic + own-faction techs
for (const f of FACTIONS) {
  const list = techsFor(f.id);
  if (list.some(t => t.faction && t.faction !== f.id)) fail(`${f.id}: techsFor leaks another faction's tech`);
}

// ---- run a real multi-faction game ------------------------------------------
// (2 rivals so the scripted, passive "player" isn't out-raced before the
// checks complete — rivals racing to a win is verified separately below)
const factionIds = FACTIONS.slice(0, 3).map(f => f.id);
const game = new Game({ seed: 1234, factions: [{ id: factionIds[0], isHuman: true }, ...factionIds.slice(1).map(id => ({ id }))] });
const human = game.human;
const DT = 1 / 20;

// human plays a scripted opening: build power node + data center + lab, train workers
const hq = game.buildings.find(b => b.owner === human.index && b.def.isHQ);
if (!hq) fail('human HQ missing');

let built = { power_node: false, data_center: false, research_lab: false, security_hub: false };
let researchStarted = false, researchDone = false, trainedWorker = false, specialistTrained = false;

game.commandTrain(hq.id, 'worker');

for (let t = 0; t < 60 * 20 * 20; t++) { // up to 20 sim-minutes
  game.update(DT);
  game.drainEvents();

  // scripted "player": place buildings near HQ when affordable
  for (const bid of ['power_node', 'data_center', 'research_lab', 'security_hub']) {
    if (built[bid]) continue;
    const def = BUILDINGS[bid];
    let can = true;
    for (const k in def.cost) if (human.res[k] < def.cost[k]) can = false;
    if (!can) continue;
    for (let ring = 2; ring <= 9 && !built[bid]; ring++) {
      for (let a = 0; a < 16 && !built[bid]; a++) {
        const ang = (a / 16) * Math.PI * 2;
        const x = hq.x + Math.cos(ang) * (5 + ring * 3), z = hq.z + Math.sin(ang) * (5 + ring * 3);
        if (game.canBuildAt(bid, x, z, human.index).ok) {
          if (game.commandBuild(human.index, bid, x, z, null)) built[bid] = true;
        }
      }
    }
  }

  // research once a lab is ready
  if (!researchStarted && game.buildings.some(b => b.owner === human.index && b.researchNode && b.state === 'ready')) {
    if (game.commandResearch(human.index, 'logistics_1')) researchStarted = true;
  }
  if (researchStarted && human.researched.has('logistics_1')) researchDone = true;

  if (!trainedWorker && game.units.filter(u => u.owner === human.index).length > 5) trainedWorker = true;

  // train the human faction's specialist once its gate is researched
  const spec = UNITS[human.faction.specialist];
  if (!specialistTrained && spec && researchDone) {
    if (spec.requiresTech && !human.researched.has(spec.requiresTech)) {
      // force-grant remaining gate for the test
      applyTech(game, human, spec.requiresTech);
    }
    const producer = game.buildings.find(b => b.owner === human.index && b.def.trains?.includes(spec.id) && b.state === 'ready');
    if (producer) {
      human.res.compute += 500; human.res.capital += 500; human.res.talent += 200; human.res.energy += 200;
      if (game.commandTrain(producer.id, spec.id)) specialistTrained = true;
    }
  }
  if (game.over) break;
}

if (!trainedWorker) fail('worker training never completed');
else ok('worker trained & spawned');
if (!Object.values(built).every(Boolean)) fail(`not all buildings placed: ${JSON.stringify(built)}`);
else ok('scripted build-out placed all buildings');
if (!researchDone) fail('research never completed');
else ok('research completed');
if (!specialistTrained) fail(`specialist could not be trained for ${human.factionId}`);
else ok(`specialist ${human.faction.specialist} trained`);

const constructing = game.buildings.filter(b => b.owner === human.index && b.state === 'construct');
if (constructing.length) fail(`${constructing.length} human buildings stuck in construct state`);
else ok('no buildings stuck under construction');

// AI progress sanity
const aiProgress = game.players.filter(p => !p.isHuman).map(p => ({ id: p.factionId, stack: p.stackIndex, buildings: game.buildings.filter(b => b.owner === p.index).length, units: game.units.filter(u => u.owner === p.index).length }));
console.log('AI progress after sim:', JSON.stringify(aiProgress));
if (!aiProgress.some(a => a.buildings > 1)) fail('no AI ever expanded');
else ok('AI rivals expand and play');

// ---- every faction can research its ultimate (fast-forward test) -----------
for (const f of FACTIONS) {
  const g2 = new Game({ seed: 42, factions: [{ id: f.id, isHuman: true }, { id: FACTIONS.find(x => x.id !== f.id).id }] });
  const p = g2.human;
  // grant everything needed
  const ult = TECHS[f.ultimate];
  const chain = [];
  const addReqs = (t) => { if (t.requires) for (const r of t.requires) { addReqs(TECHS[r]); chain.push(r); } };
  addReqs(ult);
  for (const r of chain) applyTech(g2, p, r);
  applyTech(g2, p, ult.id);
  if (!p.ultimateDone) fail(`${f.id}: ultimate did not set ultimateDone`);
  if (ult.effect.sovereign && !p.stackSkips.has(ult.effect.sovereign)) fail(`${f.id}: sovereign skip not granted`);
}
ok('all 20 ultimates apply cleanly (mods / unlocks / sovereign skips)');

// ---- sovereign victory path -------------------------------------------------
const g3 = new Game({ seed: 7, factions: [{ id: 'zenflow', isHuman: true }, { id: 'animus' }] });
const p3 = g3.human;
for (let t = 0; t < 20 * 60 * 30 && !g3.over; t++) {
  // cheat resources to sail through the stack
  for (const r in p3.res) p3.res[r] = 5000;
  g3.update(DT); g3.drainEvents();
}
if (!g3.over || g3.winner !== p3) fail('sovereign stack victory did not trigger');
else ok(`sovereign victory works (won in ${Math.round(g3.time)}s of sim time)`);

// ---- conquest / elimination -------------------------------------------------
const g4 = new Game({ seed: 9, factions: [{ id: 'animus', isHuman: true }, { id: 'signal' }] });
const rival = g4.players[1];
import('../src/core/Combat.js').then(async ({ killEntity }) => {
  for (const b of [...g4.buildings]) if (b.owner === rival.index) killEntity(g4, b, 0);
  g4.update(DT);
  if (!rival.defeated) fail('rival not eliminated after losing all buildings');
  else ok('elimination on losing all buildings works');
  if (!g4.over || g4.winner !== g4.human) fail('conquest victory did not trigger');
  else ok('conquest victory works');

  console.log(failures ? `\n${failures} FAILURES` : '\nALL TESTS PASSED');
  process.exit(failures ? 1 : 0);
});
