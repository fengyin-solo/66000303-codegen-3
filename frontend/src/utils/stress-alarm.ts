import type { Element } from '../types';
import type { AlarmLevel, StressAlarm, IncomparableElement } from '../types';

/** 中等级别起始超限倍数：ratio >= 1.2 */
export const LEVEL2_RATIO = 1.2;
/** 严重级别起始超限倍数：ratio >= 1.5 */
export const LEVEL3_RATIO = 1.5;

/** 级别展示元数据（颜色同时用于列表与画布高亮） */
export const ALARM_LEVEL_META: Record<
  AlarmLevel,
  { label: string; short: string; color: string; ring: string; text: string; chip: string }
> = {
  1: {
    label: '一级（轻度超限）',
    short: '一级',
    color: '#f59e0b', // amber-500
    ring: '#fbbf24',
    text: 'text-amber-400',
    chip: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
  },
  2: {
    label: '二级（显著超限）',
    short: '二级',
    color: '#f97316', // orange-500
    ring: '#fb923c',
    text: 'text-orange-400',
    chip: 'bg-orange-500/15 border-orange-500/40 text-orange-300',
  },
  3: {
    label: '三级（严重超限）',
    short: '三级',
    color: '#ef4444', // red-500
    ring: '#f87171',
    text: 'text-red-400',
    chip: 'bg-red-500/15 border-red-500/40 text-red-300',
  },
};

export function levelOf(ratio: number): AlarmLevel {
  if (ratio >= LEVEL3_RATIO) return 3;
  if (ratio >= LEVEL2_RATIO) return 2;
  return 1;
}

/** 材料参数是否可用于超限比较：许用应力必须是大于 0 的有限数 */
export function getAllowableStress(el: Element): number | null {
  const a = el.allowableStress;
  if (a === undefined || a === null || !Number.isFinite(a) || a <= 0) {
    return null;
  }
  return a;
}

export function missingReason(el: Element): string {
  const a = el.allowableStress;
  if (a === undefined || a === null) return '未填写许用应力';
  if (!Number.isFinite(a)) return '许用应力数值无效';
  if (a <= 0) return '许用应力必须大于 0';
  return '材料参数缺失';
}

/**
 * 求解完成后逐根构件比对内力（应力）与许用值。
 * 每个构件只产出一条结果：超限 -> 告警；材料缺失 -> 单列；正常 -> 不进入任何列表。
 *
 * @param stresses 与 elements 等长、同序的每构件应力（Pa，拉正压负）
 */
export function evaluateStressAlarms(
  elements: Element[],
  stresses: number[]
): { alarms: StressAlarm[]; incomparable: IncomparableElement[] } {
  const alarms: StressAlarm[] = [];
  const incomparable: IncomparableElement[] = [];

  elements.forEach((el, i) => {
    const allowable = getAllowableStress(el);
    if (allowable === null) {
      incomparable.push({
        elementId: el.id,
        nodeIds: [...el.nodeIds] as [number, number],
        reason: missingReason(el),
      });
      return;
    }

    const stress = stresses[i] ?? el.stress ?? 0;
    const ratio = Math.abs(stress) / allowable;

    // 与许用值相等或以下为正常（ratio === 1 不算超限）
    if (ratio <= 1) return;

    alarms.push({
      elementId: el.id,
      nodeIds: [...el.nodeIds] as [number, number],
      stress,
      allowableStress: allowable,
      ratio,
      overPercent: (ratio - 1) * 100,
      level: levelOf(ratio),
      acknowledged: false,
    });
  });

  // 严重的排前面；同级按超限倍数降序，保证列表顺序稳定
  alarms.sort((a, b) => b.ratio - a.ratio || a.elementId - b.elementId);
  return { alarms, incomparable };
}
