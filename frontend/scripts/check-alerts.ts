import {
  solve,
  presetCantileverBeam,
  presetBridgeTruss,
  presetSimpleFrame,
} from '../src/utils/fea-solver';
import { evaluateAlerts } from '../src/utils/stress-alerts';
import type { StressAlert } from '../src/types';

function dump(title: string, model: ReturnType<typeof presetCantileverBeam>) {
  const res = evaluateAlerts(model, []);
  console.log(`\n##### ${title} #####`);
  console.log(
    'alerts:',
    res.alerts.map((a) => `#${a.elementId}[${a.nodeIds}] ${a.ratio.toFixed(2)}x L${a.level}`).join('  ')
  );
  console.log('incomparable:', res.incomparable.map((e) => `#${e.elementId}(${e.reason})`).join('  '));
  return res;
}

// 1) cantilever: expect 3+3+8 L3/L2/L1 alerts + 2 incomparable
const c = presetCantileverBeam();
solve(c);
const r1 = dump('cantilever', c);
const counts = { 1: 0, 2: 0, 3: 0 };
for (const a of r1.alerts) counts[a.level]++;
console.log('level counts:', counts);
console.assert(counts[3] === 4, 'expected 4 L3');
console.assert(counts[2] === 4, 'expected 4 L2');
console.assert(counts[1] === 20, 'expected 20 L1 (4 chords + 16 diagonals)');
console.assert(r1.incomparable.length === 1, 'expected 1 incomparable');

// 2) bridge: empty state
const b = presetBridgeTruss();
solve(b);
const r2 = dump('bridge', b);
console.assert(r2.alerts.length === 0 && r2.incomparable.length === 0, 'bridge must be clean');

// 3) frame: all incomparable
const f = presetSimpleFrame();
solve(f);
const r3 = dump('frame', f);
console.assert(r3.alerts.length === 0, 'frame no alerts');
console.assert(r3.incomparable.length === f.elements.length, 'frame all incomparable');

// 4) dedup: same element never stacks, rebuild produces one per element
const dup = evaluateAlerts(c, r1.alerts);
const ids = dup.alerts.map((a) => a.elementId);
console.assert(new Set(ids).size === ids.length, 'no duplicate element alerts');

// 5) acknowledged -> re-appears as pending after recompute (fresh evaluation)
const withAck: StressAlert[] = r1.alerts.map((a, i) =>
  i === 0 ? { ...a, status: 'acknowledged' as const } : a
);
const afterRecompute = evaluateAlerts(c);
const first = afterRecompute.alerts.find((a) => a.elementId === withAck[0].elementId)!;
console.assert(first.status === 'pending', 'acknowledged must reappear as pending after recompute');

// 5b) material-only recheck (previous passed) preserves acknowledged/ignored
const recheckAck = evaluateAlerts(c, withAck);
const keptAck = recheckAck.alerts.find((a) => a.elementId === withAck[0].elementId)!;
console.assert(keptAck.status === 'acknowledged', 'recheck preserves acknowledged');

// 6) ignored stays hidden within same evaluation (recheck semantics), but solve resets it
const withIgnored: StressAlert[] = r1.alerts.map((a, i) =>
  i === 0 ? { ...a, status: 'ignored' as const } : a
);
const recheck = evaluateAlerts(c, withIgnored);
const kept = recheck.alerts.find((a) => a.elementId === withIgnored[0].elementId)!;
console.assert(kept.status === 'ignored', 'recheck keeps ignored');
const freshSolve = evaluateAlerts(c, []);
const reset = freshSolve.alerts.find((a) => a.elementId === withIgnored[0].elementId)!;
console.assert(reset.status === 'pending', 'fresh solve resets ignored -> pending');

// 7) editing allowable into the stressed incomparable element reclassifies it
const targetId = r1.incomparable[0].elementId;
const el = c.elements.find((e) => e.id === targetId)!;
console.assert(Math.abs(el.stress) > 1e-9, 'incomparable element should carry nonzero stress');
el.allowableStress = 1e6; // 1 MPa allowable, stress ~10 MPa -> L3
const edited = evaluateAlerts(c, r1.alerts);
const nowAlert = edited.alerts.find((a) => a.elementId === targetId);
console.assert(!!nowAlert && nowAlert.level === 3, 'edited element becomes L3 alert');
console.assert(edited.incomparable.length === 0, 'no incomparable remains after fill-in');

// 8) no longer exceeding drops out (raise allowable huge)
el.allowableStress = 1e15;
const safe = evaluateAlerts(c, r1.alerts);
console.assert(!safe.alerts.some((a) => a.elementId === targetId), 'high allowable removes alert');

console.log('\nALL ASSERTIONS DONE');
