<script setup lang="ts">
import { onMounted } from 'vue';
import FEACanvas from './components/FEACanvas.vue';
import ElementInfo from './components/ElementInfo.vue';
import MeshControls from './components/MeshControls.vue';
import AlarmPanel from './components/AlarmPanel.vue';
import { useFEAStore } from './store/fea';

const store = useFEAStore();

onMounted(() => {
  store.loadPreset('cantilever');
});
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
    <!-- Header -->
    <header class="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center justify-between">
      <h1 class="text-lg font-bold text-purple-400">
        🔬 有限元应力热力图可视化
      </h1>
      <div class="text-xs text-slate-500">
        节点: {{ store.model.nodes.length }} |
        单元: {{ store.model.elements.length }}
      </div>
    </header>

    <!-- Main content -->
    <div class="flex flex-1 overflow-hidden">
      <!-- Canvas area -->
      <div class="flex-1 p-3" style="width: 75%">
        <FEACanvas />
      </div>

      <!-- Right sidebar -->
      <div class="w-[28%] min-w-[300px] bg-slate-900 border-l border-slate-800 p-3 flex flex-col gap-3 overflow-y-auto">
        <AlarmPanel />
        <MeshControls />
        <ElementInfo />
      </div>
    </div>

    <!-- Bottom status bar -->
    <footer class="bg-slate-900 border-t border-slate-800 px-6 py-2 flex items-center gap-6 text-xs text-slate-400">
      <span>
        最大应力:
        <span class="text-red-400 font-bold">
          {{ store.result ? (store.maxStress / 1e6).toFixed(2) + ' MPa' : '—' }}
        </span>
      </span>
      <span>
        最大位移:
        <span class="text-amber-400 font-bold">
          {{ store.result ? (store.maxDisplacement * 1000).toFixed(3) + ' mm' : '—' }}
        </span>
      </span>
      <span>
        节点数: <span class="text-slate-200">{{ store.model.nodes.length }}</span>
      </span>
      <span>
        单元数: <span class="text-slate-200">{{ store.model.elements.length }}</span>
      </span>
      <span
        v-if="store.alarmsChecked"
        class="flex items-center gap-1"
        :class="store.activeAlarmCount > 0 ? 'text-red-400' : 'text-emerald-400'"
      >
        超限告警:
        <span class="font-bold">
          {{ store.batchIgnored ? '已忽略' : store.activeAlarmCount }}
        </span>
        <span v-if="store.activeAlarmCount > 0" class="text-slate-500">
          ({{ store.levelCounts[3] }} 三级 / {{ store.levelCounts[2] }} 二级 / {{ store.levelCounts[1] }} 一级)
        </span>
        <span v-if="store.incomparableElements.length > 0" class="text-purple-400">
          · {{ store.incomparableElements.length }} 根缺材料参数
        </span>
      </span>
      <span class="ml-auto text-slate-600">
        热力图: {{ store.heatmapMode }}
      </span>
    </footer>
  </div>
</template>
