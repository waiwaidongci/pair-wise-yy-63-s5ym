<script setup lang="ts">
import { computed, ref } from 'vue';
import { HistoryIcon } from 'tdesign-icons-vue-next';
import { useTokenStore } from '../store';
import { THEME_LABELS, summarizeAcceptedByTheme, type ReleaseSnapshot } from '../release/snapshot';

const props = defineProps<{ modelValue: string; releaseResult: string }>();
const emit = defineEmits<{
  'update:modelValue': [value: string];
  publish: [];
  rollback: [];
}>();

const store = useTokenStore();

const version = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value)
});

const themeSummary = computed(() =>
  summarizeAcceptedByTheme(store.changes, store.themes).filter((group) => group.items.length > 0)
);
const acceptedCount = computed(() => store.changes.filter((c) => c.status === '已接受').length);

function tokenName(id: string) {
  return store.tokens.find((token) => token.id === id)?.name ?? id;
}

const stateLabel: Record<string, string> = {
  clean: '干净合并',
  already: '已在草稿',
  resolved: '冲突裁决'
};

const snapshotDialog = ref(false);
const activeSnapshot = ref<ReleaseSnapshot | null>(null);

function openSnapshot(snapshot: ReleaseSnapshot) {
  activeSnapshot.value = snapshot;
  snapshotDialog.value = true;
}

const activeSnapshotJson = computed(() =>
  activeSnapshot.value
    ? JSON.stringify({ version: activeSnapshot.value.version, baseVersion: activeSnapshot.value.baseVersion, themes: activeSnapshot.value.themes, tokens: activeSnapshot.value.tokens }, null, 2)
    : '{}'
);

function formatTime(ts: number) {
  return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
</script>

<template>
  <div class="publish-page">
    <div class="panel publish-main">
      <div class="panel-head">
        <div><strong>发布准备</strong><span>按主题汇总已接受提案并生成只读版本快照，支持回滚到历史基线</span></div>
        <t-tag :theme="store.locked ? 'success' : 'warning'">{{ store.locked ? '已锁定' : '候选版本' }}</t-tag>
      </div>

      <div v-if="store.hasPendingConflicts" class="publish-conflict">
        <t-alert theme="error" :message="`存在 ${store.pendingConflictCount} 个未裁决的冲突提案（${store.conflictTokens.map(g => tokenName(g.tokenId)).join('、')}），发布前请先在变更评审页裁决，系统不会悄悄覆盖任何一方。`" />
      </div>

      <div class="publish-form">
        <label><span>版本号</span><t-input v-model="version" /></label>
        <label><span>目标产品</span><t-select multiple value="['组件库','运营后台','移动端组件']" :options="[{label:'组件库',value:'组件库'},{label:'运营后台',value:'运营后台'},{label:'移动端组件',value:'移动端组件'},{label:'数据平台',value:'数据平台'}]" /></label>
        <label><span>发布说明</span><t-textarea value="按主题合并已接受提案；冲突令牌已在评审阶段完成裁决。" :autosize="{ minRows: 3 }" /></label>
      </div>

      <div class="panel theme-summary-panel">
        <div class="panel-head"><div><strong>已接受提案 · 按主题汇总</strong><span>{{ acceptedCount }} 条已接受提案，冲突未裁决不进入发布</span></div><t-tag>{{ themeSummary.length }} 个主题有变更</t-tag></div>
        <div v-if="themeSummary.length" class="theme-summary">
          <div v-for="group in themeSummary" :key="group.theme" class="theme-group">
            <div class="theme-group-head"><t-tag size="small" theme="primary" variant="light">{{ group.themeLabel }}</t-tag><span>{{ group.items.length }} 条提案</span></div>
            <div v-for="item in group.items" :key="item.changeId" class="theme-item">
              <t-tag size="small">{{ item.changeId }}</t-tag>
              <div class="theme-item-main">
                <strong>{{ tokenName(item.tokenId) }}</strong>
                <code>{{ item.tokenId }} → {{ item.value }}</code>
              </div>
              <t-tag size="small" variant="light" theme="success">{{ stateLabel[item.mergeState] ?? item.mergeState }}</t-tag>
            </div>
          </div>
        </div>
        <p v-else class="empty">暂无已接受提案。</p>
      </div>

      <div class="release-checks">
        <label><t-checkbox :checked="store.cycleNodes.length === 0" :disabled="store.cycleNodes.length !== 0" /> 循环依赖检查通过</label>
        <label><t-checkbox :checked="store.invalidReferences.length === 0" :disabled="store.invalidReferences.length !== 0" /> 无效引用检查通过</label>
        <label><t-checkbox :checked="store.contrastIssues.length === 0" :disabled="store.contrastIssues.length !== 0" /> 颜色对比度符合 WCAG AA</label>
        <label><t-checkbox :checked="!store.changes.some(c => c.status === '待评审')" :disabled="store.changes.some(c => c.status === '待评审')" /> 所有变更请求已处理</label>
        <label><t-checkbox :checked="!store.hasPendingConflicts" :disabled="store.hasPendingConflicts" /> 冲突令牌均已裁决</label>
      </div>
      <div class="publish-actions">
        <t-button variant="outline" @click="emit('rollback')">回滚全部未发布编辑</t-button>
        <t-button theme="primary" icon="lock-on" :disabled="store.locked || store.changes.some(c => c.status === '待评审') || store.hasPendingConflicts" @click="emit('publish')">校验并锁定发布</t-button>
      </div>
      <p v-if="releaseResult" class="release-result">{{ releaseResult }}</p>
    </div>

    <aside class="publish-side">
      <div class="panel diff-panel">
        <div class="panel-head"><div><strong>版本差异</strong><span>相对 {{ store.lastPublished }} · 按主题比较</span></div><t-tag>{{ store.diffRows.length }} 项</t-tag></div>
        <div v-for="(row, index) in store.diffRows" :key="`${row.id}-${index}`" class="diff-row">
          <strong>{{ row.name }}</strong>
          <span>{{ row.id }}<template v-if="row.themes.length"> · {{ row.themes.map(t => THEME_LABELS[t] ?? t).join('、') }}</template></span>
          <div><del>{{ row.before }}</del><ins>{{ row.after }}</ins></div>
        </div>
        <p v-if="!store.diffRows.length" class="empty">暂无未发布差异。</p>
      </div>
      <div class="panel history-panel">
        <div class="panel-head"><div><strong>发布历史</strong><span>冻结快照可追溯</span></div><HistoryIcon /></div>
        <div v-for="snapshot in store.releaseSnapshots" :key="snapshot.version" class="history-row">
          <t-tag theme="success" variant="light">快照</t-tag>
          <div><strong>DS {{ snapshot.version }}</strong><span>基线 DS {{ snapshot.baseVersion }} · {{ formatTime(snapshot.createdAt) }}</span></div>
          <t-button size="small" variant="text" @click="openSnapshot(snapshot)">查看</t-button>
        </div>
        <div class="history-row"><t-tag>历史</t-tag><div><strong>DS 4.5.1</strong><span>周序 · 09-12 11:04</span></div><t-button size="small" variant="text">回滚</t-button></div>
        <div class="history-row"><t-tag>历史</t-tag><div><strong>DS 4.5.0</strong><span>顾清 · 08-28 15:42</span></div><t-button size="small" variant="text">回滚</t-button></div>
      </div>
    </aside>

    <t-dialog v-model:visible="snapshotDialog" header="版本发布快照" footer="false" width="640px">
      <div v-if="activeSnapshot" class="snapshot-view">
        <p class="snapshot-meta">
          DS {{ activeSnapshot.version }} · 发布于 {{ formatTime(activeSnapshot.createdAt) }} · 基于 DS {{ activeSnapshot.baseVersion }}
        </p>
        <pre>{{ activeSnapshotJson }}</pre>
      </div>
    </t-dialog>
  </div>
</template>
