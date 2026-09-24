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
  allowableStress?: number;   // 许用应力 [σ] (Pa)；缺失或 <=0 表示材料参数未定义，不参与超限校核
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

// ─── 应力超限告警 ───────────────────────────────────────────────────────────
/** 告警级别（按超限倍数 |σ|/[σ] 划分）：3=严重(≥1.5)，2=较重(≥1.2)，1=轻微(>1.0) */
export type AlertLevel = 1 | 2 | 3;

/** 告警处置状态：待确认 / 已确认 / 已忽略（整组或逐条忽略） */
export type AlertStatus = 'pending' | 'acknowledged' | 'ignored';

export interface StressAlert {
  elementId: number;
  nodeIds: [number, number];   // 构件两端节点编号
  stress: number;              // 实际应力（带符号，Pa）
  allowableStress: number;     // 许用应力（Pa，恒 > 0）
  ratio: number;               // 超限倍数 |σ| / [σ]
  overPercent: number;         // 超限百分比 (ratio - 1) * 100
  level: AlertLevel;
  status: AlertStatus;
}

/** 材料参数缺失、无法参与超限比对的构件 */
export interface IncomparableElement {
  elementId: number;
  nodeIds: [number, number];
  reason: string;
}
