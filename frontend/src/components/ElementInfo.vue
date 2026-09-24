<script setup lang="ts">
import { computed } from 'vue';
import { useFEAStore } from '../store/fea';
import { LEVEL_META } from '../utils/stress-alerts';

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

// 许用应力（MPa 展示）：undefined / <=0 视为材料参数缺失
const hasAllowable = computed(
  () =>
    selectedEl.value !== null &&
    typeof selectedEl.value.allowableStress === 'number' &&
    selectedEl.value.allowableStress > 0
);

const allowableMPa = computed({
  get: () => (hasAllowable.value ? (selectedEl.value!.allowableStress as number) / 1e6 : null),
  set: (v: number | null) => {
    if (!selectedEl.value) return;
    selectedEl.value.allowableStress = v !== null && v > 0 ? v * 1e6 : undefined;
    store.recheckAlerts();
  },
});

function onAllowableInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value.trim();
  allowableMPa.value = raw === '' || Number.isNaN(Number(raw)) ? null : Number(raw);
}

// 该构件当前的告警 / 无法比较原因
const alert = computed(() =>
  selectedEl.value ? store.alerts.find((a) => a.elementId === selectedEl.value!.id) ?? null : null
);

const incomparable = computed(() =>
  selectedEl.value
    ? store.incomparableElements.find((e) => e.elementId === selectedEl.value!.id) ?? null
    : null
);
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
        <span
          v-if="alert"
          class="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded border"
          :style="{
            color: LEVEL_META[alert.level].color,
            borderColor: LEVEL_META[alert.level].color + '80',
          }"
        >
          {{ LEVEL_META[alert.level].short }} {{ alert.ratio.toFixed(2) }}×
          {{ alert.status === 'acknowledged' ? '· 已确认' : alert.status === 'ignored' ? '· 已忽略' : '' }}
        </span>
        <span
          v-else-if="incomparable"
          class="ml-auto text-[10px] px-1.5 py-0.5 rounded border border-sky-700 text-sky-300"
        >
          缺材料参数
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

      <!-- 许用应力（材料参数，参与超限校核） -->
      <div class="bg-slate-900 rounded p-2">
        <div class="flex items-center justify-between">
          <div class="text-slate-400">许用应力 [σ]</div>
          <span
            v-if="!hasAllowable"
            class="text-[10px] text-sky-400"
          >缺失，无法校核</span>
        </div>
        <div class="flex items-center gap-1 mt-1">
          <input
            type="number"
            min="0"
            step="1"
            :value="allowableMPa === null ? '' : allowableMPa"
            @input="onAllowableInput"
            placeholder="未设置"
            class="w-24 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-sm font-mono text-slate-200 focus:border-sky-600 focus:outline-none"
          />
          <span class="text-[10px] text-slate-500">MPa</span>
          <span
            v-if="alert"
            class="ml-auto text-[10px] font-bold"
            :style="{ color: LEVEL_META[alert.level].color }"
          >
            +{{ alert.overPercent.toFixed(0) }}%
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
