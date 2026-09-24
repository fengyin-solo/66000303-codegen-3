<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useFEAStore } from '../store/fea';
import { ALARM_LEVEL_META } from '../utils/stress-alarm';

const store = useFEAStore();

const selectedEl = computed(() => {
  if (store.selectedElement === null) return null;
  return store.model.elements.find((e) => e.id === store.selectedElement) || null;
});

const node1 = computed(() => {
  if (!selectedEl.value) return null;
  return store.model.nodes.find((n) => n.id === selectedEl.value!.nodeIds[0]) || null;
});

const node2 = computed(() => {
  if (!selectedEl.value) return null;
  return store.model.nodes.find((n) => n.id === selectedEl.value!.nodeIds[1]) || null;
});

const length = computed(() => {
  if (!node1.value || !node2.value) return 0;
  const dx = node2.value.x - node1.value.x;
  const dy = node2.value.y - node1.value.y;
  return Math.sqrt(dx * dx + dy * dy);
});

const angle = computed(() => {
  if (!node1.value || !node2.value) return 0;
  const dx = node2.value.x - node1.value.x;
  const dy = node2.value.y - node1.value.y;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
});

const color = computed(() => {
  if (store.selectedElement === null) return '#6b7280';
  return store.elementColors.get(store.selectedElement) || '#6b7280';
});

// 该构件当前的告警（若有）
const alarm = computed(() =>
  selectedEl.value ? store.alarmMap.get(selectedEl.value.id) ?? null : null
);

const incomparable = computed(() =>
  selectedEl.value ? store.incomparableMap.get(selectedEl.value.id) ?? null : null
);

// 许用应力输入值（MPa），空串表示缺失
const allowableInput = ref('');

function syncInput() {
  const v = selectedEl.value?.allowableStress;
  allowableInput.value = v !== undefined && v !== null && v > 0 ? String(v / 1e6) : '';
}

watch(selectedEl, syncInput, { immediate: true });

function commitAllowable() {
  if (!selectedEl.value) return;
  const raw = allowableInput.value.trim();
  if (raw === '') {
    store.setElementAllowable(selectedEl.value.id, null);
  } else {
    const mpa = Number(raw);
    if (Number.isFinite(mpa) && mpa > 0) {
      store.setElementAllowable(selectedEl.value.id, mpa * 1e6);
    }
  }
}

const allowableInvalid = computed(() => {
  const raw = allowableInput.value.trim();
  if (raw === '') return false;
  const mpa = Number(raw);
  return !Number.isFinite(mpa) || mpa <= 0;
});
</script>

<template>
  <div class="bg-slate-800 rounded-lg p-4">
    <h3 class="text-sm font-bold text-slate-200 border-b border-slate-700 pb-2 mb-3">
      单元详情
    </h3>

    <div v-if="!selectedEl" class="text-xs text-slate-500 text-center py-6">
      点击一个单元查看详情
    </div>

    <div v-else class="space-y-2 text-xs">
      <!-- Color indicator -->
      <div class="flex items-center gap-2 mb-3">
        <div class="w-4 h-4 rounded" :style="{ backgroundColor: color }" />
        <span class="text-slate-300 font-medium">单元 #{{ selectedEl.id }}</span>
        <!-- 告警徽标：与告警列表、画布同源 -->
        <span
          v-if="alarm"
          class="ml-auto text-[10px] px-1.5 py-0.5 rounded border font-bold"
          :class="ALARM_LEVEL_META[alarm.level].chip"
        >
          {{ ALARM_LEVEL_META[alarm.level].short }} 超限 {{ alarm.overPercent.toFixed(1) }}%
          {{ alarm.acknowledged ? '· 已确认' : '' }}
        </span>
        <span
          v-else-if="incomparable"
          class="ml-auto text-[10px] px-1.5 py-0.5 rounded border border-purple-500/40 bg-purple-500/15 text-purple-300 font-bold"
        >
          无法比较
        </span>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div class="bg-slate-900 rounded p-2">
          <div class="text-slate-400">连接节点</div>
          <div class="text-sm font-mono text-slate-200">
            {{ selectedEl.nodeIds[0] }} → {{ selectedEl.nodeIds[1] }}
          </div>
        </div>
        <div class="bg-slate-900 rounded p-2">
          <div class="text-slate-400">长度 / 角度</div>
          <div class="text-sm font-mono text-slate-200">
            {{ length.toFixed(3) }}m / {{ angle.toFixed(1) }}°
          </div>
        </div>
        <div class="bg-slate-900 rounded p-2">
          <div class="text-slate-400">截面积</div>
          <div class="text-sm font-mono text-slate-200">
            {{ (selectedEl.area * 1e6).toFixed(0) }} mm²
          </div>
        </div>
        <div class="bg-slate-900 rounded p-2">
          <div class="text-slate-400">弹性模量</div>
          <div class="text-sm font-mono text-slate-200">
            {{ (selectedEl.youngsModulus / 1e9).toFixed(0) }} GPa
          </div>
        </div>
      </div>

      <!-- 许用应力（材料参数，用于超限比对） -->
      <div class="bg-slate-900 rounded p-2">
        <div class="flex items-center justify-between mb-1">
          <span class="text-slate-400">许用应力 [σ]</span>
          <span v-if="incomparable" class="text-[10px] text-purple-300">
            {{ incomparable.reason }}
          </span>
        </div>
        <div class="flex items-center gap-1.5">
          <input
            v-model="allowableInput"
            @change="commitAllowable"
            @blur="commitAllowable"
            type="number"
            min="0"
            placeholder="未设置"
            class="w-24 bg-slate-800 border rounded px-1.5 py-0.5 text-sm font-mono text-slate-200"
            :class="allowableInvalid ? 'border-red-500' : 'border-slate-600'"
          />
          <span class="text-[10px] text-slate-500">MPa</span>
          <span v-if="allowableInvalid" class="text-[10px] text-red-400 ml-auto">
            需为大于 0 的数值
          </span>
        </div>
      </div>

      <div class="border-t border-slate-700 pt-2 mt-2">
        <div class="text-slate-400 mb-1">计算结果</div>
        <div class="grid grid-cols-3 gap-2">
          <div class="bg-slate-900 rounded p-2">
            <div class="text-slate-500 text-[10px]">应力</div>
            <div class="text-sm font-bold" :style="{ color }">
              {{ (selectedEl.stress / 1e6).toFixed(2) }}
              <span class="text-[10px] text-slate-500">MPa</span>
            </div>
          </div>
          <div class="bg-slate-900 rounded p-2">
            <div class="text-slate-500 text-[10px]">应变</div>
            <div class="text-sm font-bold text-sky-400">
              {{ (selectedEl.strain * 100).toFixed(4) }}
              <span class="text-[10px] text-slate-500">%</span>
            </div>
          </div>
          <div class="bg-slate-900 rounded p-2">
            <div class="text-slate-500 text-[10px]">轴力</div>
            <div class="text-sm font-bold text-amber-400">
              {{ (selectedEl.force / 1000).toFixed(2) }}
              <span class="text-[10px] text-slate-500">kN</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
