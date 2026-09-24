import { createPinia, setActivePinia } from 'pinia';
import { useFEAStore } from '../src/store/fea';

setActivePinia(createPinia());
const store = useFEAStore();
store.loadPreset('cantilever');

// initial: nothing checked yet
console.assert(store.checked === false, 'not checked before solve');
console.assert(store.visibleAlerts.length === 0, 'no alerts before solve');

store.solve();
console.assert(store.pendingAlerts.length === 28, `expected 28 pending, got ${store.pendingAlerts.length}`);
console.assert(store.incomparableElements.length === 1, '1 incomparable');
console.assert(store.highlightedElementIds.size === 28, '28 highlighted on canvas');

// per-element acknowledge
const firstId = store.pendingAlerts[0].elementId;
store.acknowledgeAlert(firstId);
console.assert(store.pendingAlerts.length === 27, 'pending 27 after ack');
console.assert(store.acknowledgedAlerts.length === 1, 'acknowledged 1');
console.assert(!store.highlightedElementIds.has(firstId), 'acknowledged element not highlighted');

// recompute: still over-limit -> reappears as pending
store.solve();
console.assert(store.pendingAlerts.length === 28, 'recomputed all reappear');
const again = store.alerts.find((a) => a.elementId === firstId)!;
console.assert(again.status === 'pending', 'acknowledged reappears pending');

// no duplicate stacking after repeated solves
store.solve();
store.solve();
const allIds = store.alerts.map((a) => a.elementId);
console.assert(new Set(allIds).size === allIds.length, 'no duplicates after repeated solves');
console.assert(store.alerts.length === 28, 'still 28 alerts');

// single ignore
store.ignoreAlert(firstId);
console.assert(store.visibleAlerts.every((a) => a.elementId !== firstId), 'ignored hidden from list');
console.assert(store.alerts.some((a) => a.elementId === firstId && a.status === 'ignored'), 'kept as ignored');
store.restoreAlerts();
console.assert(store.pendingAlerts.some((a) => a.elementId === firstId), 'restored to pending');

// ignore whole group
store.ignoreAllAlerts();
console.assert(store.pendingAlerts.length === 0 && store.acknowledgedAlerts.length === 0, 'all hidden');
console.assert(store.ignoredCount === 28, '28 ignored');
console.assert(store.highlightedElementIds.size === 0, 'no highlights when all ignored');

// recompute after ignore-all: alerts come back fresh
store.solve();
console.assert(store.pendingAlerts.length === 28, 'fresh solve brings alerts back');

// ignore one level only
store.ignoreAllAlerts(3);
console.assert(store.pendingAlerts.every((a) => a.level !== 3), 'L3 all ignored');
console.assert(store.levelCounts[3].ignored === 4, '4 L3 ignored');
console.assert(store.pendingAlerts.length === 24, '24 pending remain');

// switch case clears everything, no residue
store.loadPreset('bridge');
console.assert(store.checked === false, 'checked reset on switch');
console.assert(store.alerts.length === 0, 'alerts cleared on switch');
console.assert(store.incomparableElements.length === 0, 'incomparable cleared on switch');
console.assert(store.highlightedElementIds.size === 0, 'highlights cleared on switch');
store.solve();
console.assert(store.alerts.length === 0, 'bridge clean');
console.assert(store.incomparableElements.length === 0, 'bridge no incomparable');

// frame: all incomparable, no alerts
store.loadPreset('frame');
store.solve();
console.assert(store.alerts.length === 0, 'frame no alerts');
console.assert(store.incomparableElements.length === 56, 'frame 56 incomparable');
console.assert(store.incomparableElements[0].reason.includes('许用应力'), 'reason text given');

// editing allowable on selected element: recheck preserves states, no solve required
store.loadPreset('cantilever');
store.solve();
const ackId = store.alerts[0].elementId;
store.acknowledgeAlert(ackId);
const incEl = store.incomparableElements
  .map((e) => store.model.elements.find((el) => el.id === e.elementId)!)
  .filter((el) => Math.abs(el.stress) > 0)[0];
console.assert(!!incEl, 'find a stressed incomparable element');
incEl.allowableStress = 1e6;
store.recheckAlerts();
console.assert(!!store.alerts.find((a) => a.elementId === incEl.id), 'missing-param element now alerts');
console.assert(store.acknowledgedAlerts.some((a) => a.elementId === ackId), 'ack state preserved on recheck');

// after real recompute the preserved ack reappears
store.solve();
console.assert(store.pendingAlerts.some((a) => a.elementId === ackId), 'ack reappears on recompute');

console.log('\nSTORE SMOKE TEST DONE');
