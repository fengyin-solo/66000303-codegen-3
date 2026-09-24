export interface Node {
  id: number;
  x: number;
  y: number;
  fixed: boolean;       // boundary condition
  displacementX: number;
  displacementY: number;
}

export interface Element {
  id: number;
  nodeIds: [number, number];  // 2-node truss element
  area: number;               // cross-section area (m²)
  youngsModulus: number;      // Pa
  allowableStress?: number;   // 许用应力 (Pa)；缺失或 <= 0 时无法做超限比对
  stress: number;             // computed
  strain: number;             // computed
  force: number;              // computed
}

export interface Load {
  nodeId: number;
  fx: number;   // force X component (N)
  fy: number;   // force Y component (N)
}

export interface FEAModel {
  nodes: Node[];
  elements: Element[];
  loads: Load[];
}

export interface FEAResult {
  displacements: number[];    // global displacement vector
  stresses: number[];          // per-element stress
  strains: number[];           // per-element strain
  maxDisplacement: number;
  maxStress: number;
  reactionForces: { nodeId: number; fx: number; fy: number }[];
}

/** 超限级别：按 |实际应力| / 许用应力 划分 */
export type AlarmLevel = 1 | 2 | 3;

export interface StressAlarm {
  /** 唯一键，即构件 id —— 同一构件同一批次只保留一条，避免重复堆积 */
  elementId: number;
  /** 构件两端节点编号 */
  nodeIds: [number, number];
  /** 实际应力 (Pa)，带符号，拉正压负 */
  stress: number;
  /** 许用应力 (Pa) */
  allowableStress: number;
  /** 超限倍数 = |应力| / 许用应力 */
  ratio: number;
  /** 超限百分比 = (超限倍数 - 1) * 100% */
  overPercent: number;
  /** 三级告警等级 */
  level: AlarmLevel;
  /** 用户是否已逐条确认；重新计算后仍超限会重新出现（恢复未确认） */
  acknowledged: boolean;
}

/** 材料参数缺失、无法参与超限比对的构件 */
export interface IncomparableElement {
  elementId: number;
  nodeIds: [number, number];
  /** 无法比较的原因说明 */
  reason: string;
}
