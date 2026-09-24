import type {
  FEAModel,
  StressAlert,
  AlertLevel,
  IncomparableElement,
} from '../types';

// 分级阈值（按超限倍数 ratio = |σ| / [σ]）
export const RATIO_LEVEL_2 = 1.2; // Ⅱ级（较重）
export const RATIO_LEVEL_3 = 1.5; // Ⅲ级（严重）

// 各级别展示元数据
export const LEVEL_META: Record<
  AlertLevel,
  { label: string; short: string; color: string; bg: string; border: string }
> = {
  3: {
    label: 'Ⅲ级 · 严重超限',
    short: 'Ⅲ',
    color: '#f87171', // red-400
    bg: 'bg-red-950/60',
    border: 'border-red-500/60',
  },
  2: {
    label: 'Ⅱ级 · 较重超限',
    short: 'Ⅱ',
    color: '#fb923c', // orange-400
    bg: 'bg-orange-950/50',
    border: 'border-orange-500/60',
  },
  1: {
    label: 'Ⅰ级 · 轻微超限',
    short: 'Ⅰ',
    color: '#facc15', // yellow-400
    bg: 'bg-yellow-950/40',
    border: 'border-yellow-500/50',
  },
};

/** 许用应力是否有效（缺失、非数值、非正数都视为材料参数缺失） */
export function hasAllowable(value: number | undefined | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function levelForRatio(ratio: number): AlertLevel {
  if (ratio >= RATIO_LEVEL_3) return 3;
  if (ratio >= RATIO_LEVEL_2) return 2;
  return 1;
}

export interface AlertEvaluation {
  /** 当前模型中所有超限构件（含已确认 / 已忽略状态），按超限倍数降序 */
  alerts: StressAlert[];
  /** 材料参数缺失、无法比较的构件 */
  incomparable: IncomparableElement[];
}

/**
 * 依据最新求解结果逐根构件比对内力与许用值，构建告警与“无法比较”列表。
 * 同一构件只产生一条告警（按 elementId 去重）。
 *
 * previous 不传：全新一轮计算，所有仍超限构件一律 pending（含此前已确认的，
 *   按“重新计算后仍然超限要重新出现”处理，忽略状态同样不跨计算继承）。
 * previous 传入：仅材料参数变更后的复核，acknowledged / ignored 状态原样保留。
 */
export function evaluateAlerts(
  model: FEAModel,
  previous?: StressAlert[]
): AlertEvaluation {
  const prevById = new Map((previous ?? []).map((a) => [a.elementId, a]));
  const fresh = previous === undefined;
  const alerts: StressAlert[] = [];
  const incomparable: IncomparableElement[] = [];

  for (const el of model.elements) {
    if (!hasAllowable(el.allowableStress)) {
      incomparable.push({
        elementId: el.id,
        nodeIds: [...el.nodeIds] as [number, number],
        reason:
          el.allowableStress === undefined
            ? '未设置许用应力'
            : '许用应力无效（需为大于 0 的数值）',
      });
      continue;
    }

    const stress = el.stress;
    const allowable = el.allowableStress;
    const ratio = Math.abs(stress) / allowable;
    if (ratio <= 1) continue; // 未超限

    const prior = prevById.get(el.id);
    const status = fresh || !prior ? 'pending' : prior.status;

    alerts.push({
      elementId: el.id,
      nodeIds: [...el.nodeIds] as [number, number],
      stress,
      allowableStress: allowable,
      ratio,
      overPercent: (ratio - 1) * 100,
      level: levelForRatio(ratio),
      status,
    });
  }

  alerts.sort((a, b) => b.ratio - a.ratio);
  incomparable.sort((a, b) => a.elementId - b.elementId);
  return { alerts, incomparable };
}
