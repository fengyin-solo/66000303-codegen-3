<script setup lang="ts">
import { ref } from 'vue';
import { useFEAStore } from '../store/fea';
import { ALARM_LEVEL_META } from '../utils/stress-alarm';

const store = useFEAStore();

// 全局许用应力批量设置（MPa）
const bulkAllowable = ref(45);
const showMaterialTool = ref(false);

function fmtMPa(pa: number): string {
  return (pa / 1e6).toFixed(2);
}

function onRowClick(elementId: number) {
  store.selectElement(store.selectedElement === elementId ? null : elementId);
}

function onRowEnter(elementId: number) {
  store.setHoveredAlarmElement(elementId);
}

function onRowLeave() {
  store.setHoveredAlarmElement(null);
}

function applyBulk(onlyMissing: boolean) {
  store.applyAllowableToAll(bulkAllowable.value, onlyMissing);
}

function levelRows(level: 1 | 2 | 3) {
  return store.visibleAlarms.filter((a) => a.level === level);
}
</script>

<template>
  <div class="bg-slate-800 rounded-lg p-4">
    <div class="flex items-center justify-between border-b border-slate-700 pb-2 mb-3">
      <h3 class="text-sm font-bold text-slate-200">应力超限告警</h3>
      <span
        v-if="store.alarmsChecked"
        class="text-[10px] font-mono px-2 py-0.5 rounded-full"
        :class="
          store.activeAlarmCount > 0
            ? 'bg-red-500/20 text-red-300'
            : 'bg-emerald-500/15 text-emerald-300'
        "
      >
        {{ store.activeAlarmCount }} 条超限
      </span>
    </div>

    <!-- 尚未求解 -->
    <div v-if="!store.alarmsChecked" class="text-xs text-slate-500 text-center py-5">
      求解后将逐根构件比对应力与许用值
    </div>

    <template v-else>
      <!-- 整组忽略提示条 -->
      <div
        v-if="store.batchIgnored"
        class="rounded-md border border-slate-600 bg-slate-700/40 p-2.5 flex items-center justify-between gap-2 mb-3"
      >
        <span class="text-[11px] text-slate-300">
          已整组忽略 {{ store.alarms.length }} 条告警（重新计算后会重新出现）
        </span>
        <button
          @click="store.restoreIgnoredAlarms()"
          class="shrink-0 text-[11px] px-2 py-1 rounded bg-slate-600 hover:bg-slate-500 text-slate-100 transition"
        >
          恢复显示
        </button>
      </div>

      <!-- 空态：无超限构件 -->
      <div
        v-if="store.visibleAlarms.length === 0 && !store.batchIgnored"
        class="text-center py-5 rounded-md border border-dashed border-slate-600"
      >
        <div class="text-2xl mb-1">✅</div>
        <div class="text-xs text-emerald-300 font-medium">所有构件应力均在许用范围内</div>
        <div class="text-[10px] text-slate-500 mt-1">
          已检查 {{ store.model.elements.length }} 根构件，无超限
        </div>
      </div>

      <!-- 告警列表（按级别分组：三级 → 二级 → 一级） -->
      <template v-if="store.visibleAlarms.length > 0">
        <!-- 整组操作 -->
        <div class="flex items-center gap-1.5 mb-2">
          <button
            @click="store.acknowledgeAllAlarms()"
            class="flex-1 text-[11px] py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition disabled:opacity-50 disabled:cursor-default"
            :disabled="store.pendingAlarmCount === 0"
          >
            {{ store.pendingAlarmCount === 0 ? '全部已确认 ✓' : `全部确认 (${store.pendingAlarmCount} 待处理)` }}
          </button>
          <button
            @click="store.ignoreAllAlarms()"
            class="flex-1 text-[11px] py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-400 transition"
          >
            整组忽略
          </button>
        </div>

        <div
          v-for="level in ([3, 2, 1] as const)"
          :key="level"
          v-show="levelRows(level).length > 0"
          class="mb-2"
        >
          <div class="flex items-center gap-1.5 mb-1">
            <span
              class="w-2 h-2 rounded-full"
              :style="{ backgroundColor: ALARM_LEVEL_META[level].color }"
            />
            <span class="text-[10px] font-bold" :class="ALARM_LEVEL_META[level].text">
              {{ ALARM_LEVEL_META[level].label }}
            </span>
            <span class="text-[10px] text-slate-500 font-mono">
              ×{{ levelRows(level).length }}
            </span>
          </div>

          <div
            v-for="a in levelRows(level)"
            :key="a.elementId"
            @click="onRowClick(a.elementId)"
            @mouseenter="onRowEnter(a.elementId)"
            @mouseleave="onRowLeave()"
            class="rounded-md border px-2 py-1.5 mb-1 cursor-pointer transition"
            :class="[
              store.selectedElement === a.elementId
                ? 'border-sky-400 bg-sky-500/10'
                : 'border-slate-700 bg-slate-900/60 hover:border-slate-500',
              a.acknowledged ? 'opacity-55' : '',
            ]"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1.5">
                <span
                  class="text-[10px] px-1.5 py-px rounded border font-bold"
                  :class="ALARM_LEVEL_META[level].chip"
                >
                  {{ ALARM_LEVEL_META[level].short }}
                </span>
                <span class="text-[11px] font-mono text-slate-200">
                  构件 #{{ a.elementId }}
                </span>
                <span class="text-[10px] font-mono text-slate-500">
                  ({{ a.nodeIds[0] }}–{{ a.nodeIds[1] }})
                </span>
              </div>
              <button
                @click.stop="
                  a.acknowledged
                    ? store.unacknowledgeAlarm(a.elementId)
                    : store.acknowledgeAlarm(a.elementId)
                "
                class="shrink-0 text-[10px] px-2 py-0.5 rounded transition"
                :class="
                  a.acknowledged
                    ? 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                    : 'bg-sky-700/70 text-sky-100 hover:bg-sky-600'
                "
              >
                {{ a.acknowledged ? '已确认 ✓' : '确认' }}
              </button>
            </div>
            <div class="flex items-center justify-between mt-1 text-[10px] font-mono">
              <span class="text-slate-400">
                应力 {{ fmtMPa(a.stress) }} / 许用 {{ fmtMPa(a.allowableStress) }} MPa
              </span>
              <span :class="ALARM_LEVEL_META[level].text" class="font-bold">
                超限 {{ a.overPercent.toFixed(1) }}%
                <span class="text-slate-500 font-normal">({{ a.ratio.toFixed(2) }}×)</span>
              </span>
            </div>
          </div>
        </div>
      </template>

      <!-- 材料参数缺失、无法比较的构件单列 -->
      <div
        v-if="store.incomparableElements.length > 0"
        class="mt-3 rounded-md border border-purple-500/40 bg-purple-500/10 p-2.5"
      >
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-[11px] font-bold text-purple-300">
            ⚠ 无法比较的构件（{{ store.incomparableElements.length }}）
          </span>
          <button
            @click="showMaterialTool = !showMaterialTool"
            class="text-[10px] px-1.5 py-0.5 rounded bg-purple-700/60 hover:bg-purple-600 text-purple-100 transition"
          >
            补全许用应力
          </button>
        </div>
        <p class="text-[10px] text-purple-200/70 mb-1.5">
          原因：这些构件缺少有效的许用应力（材料参数缺失或数值不大于 0），无法判定是否超限，已单列且不计入告警。
        </p>
        <div class="flex flex-wrap gap-1">
          <button
            v-for="it in store.incomparableElements"
            :key="it.elementId"
            @click="onRowClick(it.elementId)"
            @mouseenter="onRowEnter(it.elementId)"
            @mouseleave="onRowLeave()"
            class="text-[10px] font-mono px-1.5 py-0.5 rounded border border-purple-500/40 text-purple-200 hover:bg-purple-500/20 transition"
            :title="`#${it.elementId} (${it.nodeIds[0]}–${it.nodeIds[1]}): ${it.reason}`"
          >
            #{{ it.elementId }} ({{ it.nodeIds[0] }}–{{ it.nodeIds[1] }})
          </button>
        </div>

        <!-- 批量补全工具 -->
        <div v-if="showMaterialTool" class="mt-2 pt-2 border-t border-purple-500/30">
          <div class="flex items-center gap-1.5">
            <input
              v-model.number="bulkAllowable"
              type="number"
              min="1"
              class="w-20 bg-slate-900 border border-slate-600 rounded px-1.5 py-1 text-[11px] font-mono text-slate-200"
            />
            <span class="text-[10px] text-slate-400">MPa</span>
            <button
              @click="applyBulk(true)"
              class="ml-auto text-[10px] px-2 py-1 rounded bg-purple-700 hover:bg-purple-600 text-white transition"
            >
              仅补全缺失
            </button>
            <button
              @click="applyBulk(false)"
              class="text-[10px] px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition"
            >
              全部应用
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
