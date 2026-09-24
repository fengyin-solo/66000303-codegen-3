import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { FEAModel, FEAResult, StressAlarm, IncomparableElement } from '../types';
import {
  solve as feaSolve,
  presetCantileverBeam,
  presetBridgeTruss,
  presetSimpleFrame,
  jetColormap,
} from '../utils/fea-solver';
import { evaluateStressAlarms, ALARM_LEVEL_META } from '../utils/stress-alarm';

export interface ElementHighlight {
  level: StressAlarm['level'];
  color: string;
  acknowledged: boolean;
}

export const useFEAStore = defineStore('fea', () => {
  const model = ref<FEAModel>({ nodes: [], elements: [], loads: [] });
  const result = ref<FEAResult | null>(null);
  const selectedPreset = ref<string>('cantilever');
  const showDeformed = ref(false);
  const deformationScale = ref(10);
  const selectedElement = ref<number | null>(null);
  const heatmapMode = ref<'stress' | 'strain' | 'force'>('stress');

  // ─── 应力超限告警状态 ──────────────────────────────────────────────────────
  /** 本次计算产生的告警（每次比对整体重建，同一构件不会重复堆积） */
  const alarms = ref<StressAlarm[]>([]);
  /** 材料参数缺失、无法比较的构件（单列） */
  const incomparableElements = ref<IncomparableElement[]>([]);
  /** 是否已针对当前结果做过超限比对（区分“尚未求解”与“求解后无超限”两种空态） */
  const alarmsChecked = ref(false);
  /** 整组忽略：忽略后列表与画布高亮一并隐藏，恢复后重新出现 */
  const batchIgnored = ref(false);
  /** 列表中悬停的构件，用于画布上联动定位高亮 */
  const hoveredAlarmElement = ref<number | null>(null);

  // ─── Actions ──────────────────────────────────────────────────────────────
  function resetAlarms() {
    alarms.value = [];
    incomparableElements.value = [];
    alarmsChecked.value = false;
    batchIgnored.value = false;
    hoveredAlarmElement.value = null;
  }

  function loadPreset(name: string) {
    selectedPreset.value = name;
    result.value = null;
    selectedElement.value = null;
    // 切换算例：旧告警必须清掉，不残留
    resetAlarms();
    switch (name) {
      case 'cantilever':
        model.value = presetCantileverBeam();
        break;
      case 'bridge':
        model.value = presetBridgeTruss();
        break;
      case 'frame':
        model.value = presetSimpleFrame();
        break;
      default:
        model.value = presetCantileverBeam();
    }
  }

  /** 用当前内力结果逐根构件比对许用值，整体重建告警列表 */
  function runStressCheck() {
    if (!result.value) {
      resetAlarms();
      return;
    }
    const { alarms: next, incomparable } = evaluateStressAlarms(
      model.value.elements,
      result.value.stresses
    );
    // 整体替换而非追加：确认过的旧告警在重新计算后以未确认状态重新出现，
    // 且同一构件始终只有一条，不会重复堆积
    alarms.value = next;
    incomparableElements.value = incomparable;
    alarmsChecked.value = true;
    batchIgnored.value = false;
    hoveredAlarmElement.value = null;
    // 选中的构件若已不在模型中则清掉
    if (
      selectedElement.value !== null &&
      !model.value.elements.some((e) => e.id === selectedElement.value)
    ) {
      selectedElement.value = null;
    }
  }

  function solve() {
    result.value = feaSolve(model.value);
    runStressCheck();
  }

  /** 材料参数编辑后重跑比对（内力结果不变） */
  function recheckStressAlarms() {
    if (alarmsChecked.value) runStressCheck();
  }

  /** 逐条确认单条告警 */
  function acknowledgeAlarm(elementId: number) {
    const alarm = alarms.value.find((a) => a.elementId === elementId);
    if (alarm) alarm.acknowledged = true;
  }

  /** 逐条取消确认（便于复核） */
  function unacknowledgeAlarm(elementId: number) {
    const alarm = alarms.value.find((a) => a.elementId === elementId);
    if (alarm) alarm.acknowledged = false;
  }

  /** 一次性确认当前全部告警 */
  function acknowledgeAllAlarms() {
    alarms.value.forEach((a) => (a.acknowledged = true));
  }

  /** 整组忽略 */
  function ignoreAllAlarms() {
    if (alarms.value.length > 0) batchIgnored.value = true;
  }

  /** 恢复被整组忽略的告警 */
  function restoreIgnoredAlarms() {
    batchIgnored.value = false;
  }

  function setHoveredAlarmElement(id: number | null) {
    hoveredAlarmElement.value = id;
  }

  function setElementAllowable(elementId: number, valuePa: number | null) {
    const el = model.value.elements.find((e) => e.id === elementId);
    if (!el) return;
    if (valuePa === null) {
      el.allowableStress = undefined;
    } else {
      el.allowableStress = valuePa;
    }
    recheckStressAlarms();
  }

  /** 批量设置许用应力（可只补全缺失构件） */
  function applyAllowableToAll(valueMPa: number, onlyMissing = false) {
    if (!Number.isFinite(valueMPa) || valueMPa <= 0) return;
    const valuePa = valueMPa * 1e6;
    for (const el of model.value.elements) {
      const missing =
        el.allowableStress === undefined ||
        el.allowableStress === null ||
        !Number.isFinite(el.allowableStress) ||
        el.allowableStress <= 0;
      if (!onlyMissing || missing) el.allowableStress = valuePa;
    }
    recheckStressAlarms();
  }

  function toggleDeformed() {
    showDeformed.value = !showDeformed.value;
  }

  function selectElement(id: number | null) {
    selectedElement.value = id;
  }

  function setHeatmapMode(mode: 'stress' | 'strain' | 'force') {
    heatmapMode.value = mode;
  }

  function addLoad(nodeId: number, fx: number, fy: number) {
    model.value.loads.push({ nodeId, fx, fy });
  }

  function toggleFixed(nodeId: number) {
    const node = model.value.nodes.find((n) => n.id === nodeId);
    if (node) node.fixed = !node.fixed;
  }

  // ─── Computed ─────────────────────────────────────────────────────────────
  const maxStress = computed(() => {
    if (!result.value) return 0;
    return result.value.maxStress;
  });

  const maxDisplacement = computed(() => {
    if (!result.value) return 0;
    return result.value.maxDisplacement;
  });

  const elementColors = computed(() => {
    const colors = new Map<number, string>();
    if (!result.value || model.value.elements.length === 0) {
      for (const el of model.value.elements) {
        colors.set(el.id, '#6b7280');
      }
      return colors;
    }

    let values: number[];
    switch (heatmapMode.value) {
      case 'stress':
        values = result.value.stresses.map(Math.abs);
        break;
      case 'strain':
        values = result.value.strains.map(Math.abs);
        break;
      case 'force':
        values = model.value.elements.map((e) => Math.abs(e.force));
        break;
      default:
        values = result.value.stresses.map(Math.abs);
    }

    const min = Math.min(...values);
    const max = Math.max(...values);

    for (let i = 0; i < model.value.elements.length; i++) {
      colors.set(
        model.value.elements[i].id,
        jetColormap(values[i], min, max)
      );
    }
    return colors;
  });

  // ─── 告警相关派生状态 ──────────────────────────────────────────────────────
  const alarmMap = computed(() => {
    const m = new Map<number, StressAlarm>();
    for (const a of alarms.value) m.set(a.elementId, a);
    return m;
  });

  const incomparableMap = computed(() => {
    const m = new Map<number, IncomparableElement>();
    for (const it of incomparableElements.value) m.set(it.elementId, it);
    return m;
  });

  /** 实际展示的告警：整组忽略后为空 */
  const visibleAlarms = computed(() => (batchIgnored.value ? [] : alarms.value));

  const activeAlarmCount = computed(() => (batchIgnored.value ? 0 : alarms.value.length));
  const pendingAlarmCount = computed(
    () => (batchIgnored.value ? 0 : alarms.value.filter((a) => !a.acknowledged).length)
  );
  const acknowledgedCount = computed(() => alarms.value.filter((a) => a.acknowledged).length);

  const levelCounts = computed(() => {
    const counts = { 1: 0, 2: 0, 3: 0 } as Record<1 | 2 | 3, number>;
    if (!batchIgnored.value) {
      for (const a of alarms.value) counts[a.level]++;
    }
    return counts;
  });

  /**
   * 画布高亮映射：与告警列表互相关联。
   * 整组忽略时返回空映射，画布恢复热力图着色。
   */
  const elementHighlight = computed(() => {
    const map = new Map<number, ElementHighlight>();
    if (batchIgnored.value) return map;
    for (const a of alarms.value) {
      map.set(a.elementId, {
        level: a.level,
        color: ALARM_LEVEL_META[a.level].color,
        acknowledged: a.acknowledged,
      });
    }
    return map;
  });

  return {
    model,
    result,
    selectedPreset,
    showDeformed,
    deformationScale,
    selectedElement,
    heatmapMode,
    // alarm state
    alarms,
    incomparableElements,
    alarmsChecked,
    batchIgnored,
    hoveredAlarmElement,
    // alarm derived
    alarmMap,
    incomparableMap,
    visibleAlarms,
    activeAlarmCount,
    pendingAlarmCount,
    acknowledgedCount,
    levelCounts,
    elementHighlight,
    // stats
    maxStress,
    maxDisplacement,
    elementColors,
    // actions
    loadPreset,
    solve,
    runStressCheck,
    recheckStressAlarms,
    acknowledgeAlarm,
    unacknowledgeAlarm,
    acknowledgeAllAlarms,
    ignoreAllAlarms,
    restoreIgnoredAlarms,
    setHoveredAlarmElement,
    setElementAllowable,
    applyAllowableToAll,
    toggleDeformed,
    selectElement,
    setHeatmapMode,
    addLoad,
    toggleFixed,
  };
});
