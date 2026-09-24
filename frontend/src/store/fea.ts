import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { FEAModel, FEAResult, StressAlert, IncomparableElement, AlertLevel } from '../types';
import {
  solve as feaSolve,
  presetCantileverBeam,
  presetBridgeTruss,
  presetSimpleFrame,
  jetColormap,
} from '../utils/fea-solver';
import { evaluateAlerts, LEVEL_META } from '../utils/stress-alerts';

export const useFEAStore = defineStore('fea', () => {
  const model = ref<FEAModel>({ nodes: [], elements: [], loads: [] });
  const result = ref<FEAResult | null>(null);
  const selectedPreset = ref<string>('cantilever');
  const showDeformed = ref(false);
  const deformationScale = ref(10);
  const selectedElement = ref<number | null>(null);
  const heatmapMode = ref<'stress' | 'strain' | 'force'>('stress');

  // ─── 应力超限告警状态 ──────────────────────────────────────────────────────
  // alerts 始终对应当前 result：求解后整体重建（按 elementId 去重，不堆积）。
  const alerts = ref<StressAlert[]>([]);
  const incomparableElements = ref<IncomparableElement[]>([]);
  const checked = ref(false); // 当前 result 是否已做过超限校核

  // ─── Actions ──────────────────────────────────────────────────────────────
  function loadPreset(name: string) {
    selectedPreset.value = name;
    result.value = null;
    selectedElement.value = null;
    clearAlerts(); // 切换算例：旧告警一律清掉，不残留
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

  function solve() {
    result.value = feaSolve(model.value);
    rebuildAlerts();
  }

  /**
   * 重新计算后重建告警列表：
   * 全部告警回到 pending 重新出现（已确认的也一样，只要仍超限就再提醒），
   * 同构件只保留一条。忽略状态属于同一算例内的交互，重新计算后不再继承。
   */
  function rebuildAlerts() {
    if (!result.value) {
      clearAlerts();
      return;
    }
    // 不传 previous：重新计算 = 新一轮校核，所有仍超限构件重新待确认
    const evaluation = evaluateAlerts(model.value);
    alerts.value = evaluation.alerts;
    incomparableElements.value = evaluation.incomparable;
    checked.value = true;
  }

  function clearAlerts() {
    alerts.value = [];
    incomparableElements.value = [];
    checked.value = false;
  }

  /**
   * 未重新求解、仅修改许用应力后复核：沿用当前处置状态（确认/忽略不被冲掉）。
   * 这不是“重新计算”——内力未变，已确认的告警不会因此重新出现；
   * 只有再次 solve()（重新计算内力）才会让仍超限构件回到待确认。
   */
  function recheckAlerts() {
    if (!result.value) return;
    const evaluation = evaluateAlerts(model.value, alerts.value);
    alerts.value = evaluation.alerts;
    incomparableElements.value = evaluation.incomparable;
    checked.value = true;
  }

  /** 逐条确认：告警保留在列表中但标记为已确认，不再高亮 */
  function acknowledgeAlert(elementId: number) {
    const alert = alerts.value.find((a) => a.elementId === elementId);
    if (alert) alert.status = 'acknowledged';
  }

  /** 单条忽略：从当前视图移除（仍在 alerts 数据中，状态为 ignored） */
  function ignoreAlert(elementId: number) {
    const alert = alerts.value.find((a) => a.elementId === elementId);
    if (alert) alert.status = 'ignored';
  }

  /**
   * 整组忽略：可忽略全部待处理告警，或只忽略某一级别。
   * level 缺省 = 整组（当前所有可见告警）。
   */
  function ignoreAllAlerts(level?: AlertLevel) {
    for (const alert of alerts.value) {
      if (alert.status !== 'pending' && alert.status !== 'acknowledged') continue;
      if (level === undefined || alert.level === level) {
        alert.status = 'ignored';
      }
    }
  }

  /** 恢复被忽略的告警（全部或某一级别），回到待确认 */
  function restoreAlerts(level?: AlertLevel) {
    for (const alert of alerts.value) {
      if (alert.status !== 'ignored') continue;
      if (level === undefined || alert.level === level) {
        alert.status = 'pending';
      }
    }
  }

  /** 全部确认（一键确认当前所有可见告警） */
  function acknowledgeAllAlerts(level?: AlertLevel) {
    for (const alert of alerts.value) {
      if (alert.status !== 'pending') continue;
      if (level === undefined || alert.level === level) {
        alert.status = 'acknowledged';
      }
    }
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
    invalidateResult();
  }

  function toggleFixed(nodeId: number) {
    const node = model.value.nodes.find((n) => n.id === nodeId);
    if (node) {
      node.fixed = !node.fixed;
      invalidateResult();
    }
  }

  // 模型参数（载荷/约束/材料等）一旦变化，旧内力与告警即失效，需重新求解后再校核，
  // 避免画布上残留与当前模型不符的高亮
  function invalidateResult() {
    result.value = null;
    clearAlerts();
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

  // 忽略掉的告警不进入待办视图
  const visibleAlerts = computed(() =>
    alerts.value.filter((a) => a.status !== 'ignored')
  );
  const pendingAlerts = computed(() =>
    alerts.value.filter((a) => a.status === 'pending')
  );
  const acknowledgedAlerts = computed(() =>
    alerts.value.filter((a) => a.status === 'acknowledged')
  );
  const ignoredCount = computed(
    () => alerts.value.filter((a) => a.status === 'ignored').length
  );
  const hasAlerts = computed(() => alerts.value.length > 0);
  const hasVisibleAlerts = computed(() => visibleAlerts.value.length > 0);

  /** 各级别待处理数量，用于面板分组标题与整组操作 */
  const levelCounts = computed<Record<AlertLevel, { pending: number; ignored: number }>>(() => {
    const counts: Record<AlertLevel, { pending: number; ignored: number }> = {
      1: { pending: 0, ignored: 0 },
      2: { pending: 0, ignored: 0 },
      3: { pending: 0, ignored: 0 },
    };
    for (const a of alerts.value) {
      if (a.status === 'ignored') counts[a.level].ignored += 1;
      else if (a.status === 'pending') counts[a.level].pending += 1;
    }
    return counts;
  });

  /** elementId → 告警（仅未确认、未忽略的才在画布高亮） */
  const activeAlertByElement = computed(() => {
    const map = new Map<number, StressAlert>();
    for (const a of alerts.value) {
      if (a.status === 'pending') map.set(a.elementId, a);
    }
    return map;
  });

  /** 当前画布上需要高亮的构件 id 集合（待处理告警） */
  const highlightedElementIds = computed(
    () => new Set(activeAlertByElement.value.keys())
  );

  function levelColor(level: AlertLevel): string {
    return LEVEL_META[level].color;
  }

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

  return {
    model,
    result,
    selectedPreset,
    showDeformed,
    deformationScale,
    selectedElement,
    heatmapMode,
    maxStress,
    maxDisplacement,
    elementColors,
    // 告警
    alerts,
    incomparableElements,
    checked,
    visibleAlerts,
    pendingAlerts,
    acknowledgedAlerts,
    ignoredCount,
    hasAlerts,
    hasVisibleAlerts,
    levelCounts,
    activeAlertByElement,
    highlightedElementIds,
    levelColor,
    solve,
    rebuildAlerts,
    clearAlerts,
    recheckAlerts,
    acknowledgeAlert,
    ignoreAlert,
    ignoreAllAlerts,
    restoreAlerts,
    acknowledgeAllAlerts,
    toggleDeformed,
    selectElement,
    setHeatmapMode,
    addLoad,
    toggleFixed,
    loadPreset,
  };
});
