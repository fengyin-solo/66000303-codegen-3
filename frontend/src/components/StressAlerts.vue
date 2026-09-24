<script setup lang="ts">
import { computed } from 'vue';
import { useFEAStore } from '../store/fea';
import { LEVEL_META } from '../utils/stress-alerts';
import type { AlertLevel, StressAlert } from '../types';

const store = useFEAStore();

const LEVELS: AlertLevel[] = [3, 2, 1];

function groupByLevel(list: StressAlert[]) {
  return LEVELS.map((level) => ({
    level,
    meta: LEVEL_META[level],
    items: list.filter((a) => a.level === level),
  })).filter((g) => g.items.length > 0);
}

const pendingGroups = computed(() => groupByLevel(store.pendingAlerts));
const acknowledged = computed(() => store.acknowledgedAlerts);

const isEmpty = computed(
  () =>
    store.checked &&
    store.alerts.length === 0 &&
    store.incomparableElements.length === 0
);

// 待处理告警全部被忽略后，主体区的说明
const allHidden = computed(
  () =>
    store.checked &&
    store.alerts.length > 0 &&
    store.pendingAlerts.length === 0 &&
    acknowledged.value.length === 0
);

function fmtMPa(pa: number): string {
  return (pa / 1e6).toFixed(2);
}

function selectElement(id: number) {
  store.selectElement(store.selectedElement === id ? null : id);
}
</script>

<template>
  <div class="bg-slate-800 rounded-lg p-4 space-y-3">
    <div class="flex items-center justify-between border-b border-slate-700 pb-2">
      <h3 class="text-sm font-bold text-slate-200">应力超限告警</h3>
      <span
        v-if="store.pendingAlerts.length > 0"
        class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40"
      >
        {{ store.pendingAlerts.length }} 待处理
      </span>
    </div>

    <!-- 尚未求解 -->
    <div v-if="!store.checked" class="text-xs text-slate-500 text-center py-6">
      完成求解后将逐根构件比对应力与许用值，<br />
      超限构件会在这里按级别列出
    </div>

    <!-- 空态：全部安全 -->
    <div
      v-else-if="isEmpty"
      class="text-xs text-center py-6 space-y-1 border border-dashed border-slate-700 rounded-lg"
    >
      <div class="text-emerald-400 text-sm font-bold">✓ 无超限构件</div>
      <div class="text-slate-500">
        所有构件的应力均未超过许用值，<br />告警列表为空
      </div>
    </div>

    <template v-else>
      <!-- 整组操作 -->
      <div
        v-if="store.pendingAlerts.length > 0"
        class="flex items-center justify-between gap-2"
      >
        <span class="text-[10px] text-slate-500">
          共 {{ store.alerts.length }} 根构件超限
        </span>
        <div class="flex gap-1">
          <button
            @click="store.acknowledgeAllAlerts()"
            class="px-2 py-1 rounded text-[10px] bg-slate-700 text-slate-300 hover:bg-slate-600 transition"
          >
            全部确认
          </button>
          <button
            @click="store.ignoreAllAlerts()"
            class="px-2 py-1 rounded text-[10px] bg-slate-700 text-slate-400 hover:bg-slate-600 transition"
          >
            整组忽略
          </button>
        </div>
      </div>

      <!-- 全部忽略后的提示条 -->
      <div
        v-if="allHidden"
        class="flex items-center justify-between gap-2 text-[11px] bg-slate-900 rounded p-2 border border-dashed border-slate-700"
      >
        <span class="text-slate-500">
          本组 {{ store.ignoredCount }} 条告警已全部忽略
        </span>
        <button
          @click="store.restoreAlerts()"
          class="text-sky-400 hover:text-sky-300 whitespace-nowrap"
        >
          恢复显示
        </button>
      </div>

      <!-- 按级别分组的待处理告警 -->
      <div
        v-for="group in pendingGroups"
        :key="group.level"
        class="space-y-1.5"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5">
            <span
              class="w-4 h-4 rounded text-[10px] font-bold flex items-center justify-center"
              :style="{ backgroundColor: group.meta.color, color: '#0f172a' }"
            >
              {{ group.meta.short }}
            </span>
            <span class="text-[11px] font-bold" :style="{ color: group.meta.color }">
              {{ group.meta.label }}
            </span>
            <span class="text-[10px] text-slate-500">{{ group.items.length }}</span>
          </div>
          <div class="flex gap-1">
            <button
              @click="store.acknowledgeAllAlerts(group.level)"
              class="text-[10px] text-slate-400 hover:text-slate-200"
            >
              确认本级
            </button>
            <span class="text-slate-700">·</span>
            <button
              @click="store.ignoreAllAlerts(group.level)"
              class="text-[10px] text-slate-500 hover:text-slate-300"
            >
              忽略本级
            </button>
          </div>
        </div>

        <!-- 单条告警 -->
        <div
          v-for="a in group.items"
          :key="a.elementId"
          @click="selectElement(a.elementId)"
          :class="[
            group.meta.bg,
            group.meta.border,
            store.selectedElement === a.elementId
              ? 'ring-1 ring-white/70'
              : '',
          ]"
          class="border rounded p-2 cursor-pointer hover:brightness-125 transition"
        >
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-mono font-bold text-slate-100">
              构件 #{{ a.elementId }}
            </span>
            <span
              class="text-xs font-mono font-bold"
              :style="{ color: group.meta.color }"
              :title="'超限倍数 ' + a.ratio.toFixed(2) + '×'"
            >
              {{ a.ratio.toFixed(2) }}× · +{{ a.overPercent.toFixed(0) }}%
            </span>
          </div>
          <div class="text-[10px] text-slate-400 mt-0.5">
            两端节点
            <span class="font-mono text-slate-300">{{ a.nodeIds[0] }} ↔ {{ a.nodeIds[1] }}</span>
            · 应力 {{ fmtMPa(a.stress) }} MPa
            <span class="text-slate-500">/ 许用 {{ fmtMPa(a.allowableStress) }} MPa</span>
          </div>
          <div
            class="flex gap-1 mt-1.5"
            @click.stop
          >
            <button
              @click="store.acknowledgeAlert(a.elementId)"
              class="flex-1 px-1 py-0.5 rounded text-[10px] bg-slate-700/80 text-slate-200 hover:bg-slate-600 transition"
            >
              确认
            </button>
            <button
              @click="store.ignoreAlert(a.elementId)"
              class="flex-1 px-1 py-0.5 rounded text-[10px] bg-slate-800/80 text-slate-500 hover:text-slate-300 transition"
            >
              忽略
            </button>
          </div>
        </div>
      </div>

      <!-- 已确认区（重新计算后若仍超限会回到上方待处理区重新出现） -->
      <div v-if="acknowledged.length > 0" class="space-y-1.5">
        <div class="text-[11px] text-slate-400 font-bold border-t border-slate-700 pt-2">
          已确认（{{ acknowledged.length }}）
          <span class="text-[10px] font-normal text-slate-600">
            重新计算后仍超限将重新提醒
          </span>
        </div>
        <div
          v-for="a in acknowledged"
          :key="a.elementId"
          @click="selectElement(a.elementId)"
          :class="store.selectedElement === a.elementId ? 'ring-1 ring-white/70' : ''"
          class="border border-slate-700 rounded p-2 cursor-pointer opacity-60 hover:opacity-90 transition"
        >
          <div class="flex items-center justify-between">
            <span class="text-[11px] font-mono text-slate-300">
              构件 #{{ a.elementId }}
              <span class="text-slate-500">({{ a.nodeIds[0] }} ↔ {{ a.nodeIds[1] }})</span>
            </span>
            <span class="text-[10px] text-slate-500">
              {{ a.ratio.toFixed(2) }}× · +{{ a.overPercent.toFixed(0) }}%
            </span>
          </div>
          <div class="flex items-center gap-1 mt-0.5">
            <span class="text-[9px] px-1 rounded bg-slate-700 text-slate-400">已确认</span>
            <span class="text-[9px] text-slate-600">{{ LEVEL_META[a.level].label }}</span>
          </div>
        </div>
      </div>

      <!-- 部分忽略时的恢复入口（全部忽略时由上方提示条承接） -->
      <div
        v-if="store.ignoredCount > 0 && !allHidden"
        class="text-right"
      >
        <button
          @click="store.restoreAlerts()"
          class="text-[10px] text-slate-500 hover:text-sky-400"
        >
          恢复已忽略的 {{ store.ignoredCount }} 条告警
        </button>
      </div>

      <!-- 材料参数缺失：无法比较的构件单列 -->
      <div
        v-if="store.incomparableElements.length > 0"
        class="border-t border-slate-700 pt-2 space-y-1.5"
      >
        <div class="flex items-center gap-1.5">
          <span class="text-[11px] font-bold text-sky-300">
            无法校核（{{ store.incomparableElements.length }}）
          </span>
        </div>
        <p class="text-[10px] text-slate-500 leading-relaxed">
          以下构件缺少材料许用应力参数，无法将计算内力与许用值比较，已单列、不计入告警级别；
          请在单元详情中补全许用应力后重新校核。
        </p>
        <div class="flex flex-wrap gap-1">
          <button
            v-for="e in store.incomparableElements"
            :key="e.elementId"
            @click="selectElement(e.elementId)"
            :title="e.reason"
            :class="[
              'px-1.5 py-0.5 rounded text-[10px] font-mono border transition',
              store.selectedElement === e.elementId
                ? 'bg-sky-900/70 border-sky-500/70 text-sky-200 ring-1 ring-white/70'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-sky-700',
            ]"
          >
            #{{ e.elementId }}
            <span class="text-slate-600">[{{ e.nodeIds[0] }},{{ e.nodeIds[1] }}]</span>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
