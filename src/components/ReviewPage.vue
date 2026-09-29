<script setup lang="ts">
import { computed, h, ref } from 'vue';
import { MessagePlugin } from 'tdesign-vue-next';
import { AddIcon, ErrorCircleIcon } from 'tdesign-icons-vue-next';
import { useTokenStore } from '../store';
import { THEME_LABELS } from '../release/snapshot';

const AddButtonIcon = () => h(AddIcon);

const store = useTokenStore();

const pendingCount = computed(() => store.changes.filter((c) => c.status === '待评审').length);
const acceptedCount = computed(() => store.changes.filter((c) => c.status === '已接受').length);
const rejectedCount = computed(() => store.changes.filter((c) => c.status === '已退回').length);

const submitDialog = ref(false);
const draft = ref({
  title: '',
  requester: '',
  token: 'color.semantic.primary',
  theme: 'light',
  after: ''
});

const themeOptions = Object.entries(THEME_LABELS).map(([value, label]) => ({ label, value }));
const tokenOptions = computed(() => store.tokens.map((token) => ({ label: `${token.name}（${token.id}）`, value: token.id })));

function tokenName(id: string) {
  return store.tokens.find((token) => token.id === id)?.name ?? id;
}

function isStale(change: { baseVersion: string }) {
  return change.baseVersion !== store.releaseVersion;
}

function accept(id: string) {
  const change = store.changes.find((item) => item.id === id);
  const verdict = store.acceptChange(id);
  if (!verdict) return;
  if (verdict.kind === 'clean') {
    MessagePlugin.success(`${id} 已干净合并，只更新「${THEME_LABELS[change!.theme]}」`);
  } else if (verdict.kind === 'already') {
    MessagePlugin.info(`${id} 的目标值已在草稿中，未重复写入`);
  } else {
    MessagePlugin.warning(`${id} 与当前草稿冲突，双方修改均已保留，请裁决`);
  }
}

function reject(id: string) {
  store.rejectChange(id);
  MessagePlugin.info(`${id} 已退回`);
}

function resolve(id: string, choice: 'current' | 'proposed') {
  store.resolveConflict(id, choice);
  MessagePlugin.success(
    choice === 'proposed'
      ? `${id} 已采用提案目标值，冲突解决`
      : `${id} 已保留当前草稿值，冲突解决`
  );
}

function openSubmit() {
  const token = store.tokens.find((item) => item.id === draft.value.token);
  draft.value = {
    title: '',
    requester: '',
    token: draft.value.token || store.selectedTokenId || 'color.semantic.primary',
    theme: store.activeTheme,
    after: token?.themes[store.activeTheme] ?? ''
  };
  submitDialog.value = true;
}

function syncAfterValue() {
  const token = store.tokens.find((item) => item.id === draft.value.token);
  draft.value.after = token?.themes[draft.value.theme] ?? '';
}

function submitProposal() {
  if (!draft.value.title.trim()) {
    MessagePlugin.error('请填写调整标题');
    return;
  }
  if (!draft.value.after.trim()) {
    MessagePlugin.error('请填写目标值');
    return;
  }
  const created = store.submitChange({
    title: draft.value.title.trim(),
    requester: draft.value.requester.trim() || '设计系统维护员',
    token: draft.value.token,
    theme: draft.value.theme,
    after: draft.value.after.trim()
  });
  if (created) {
    submitDialog.value = false;
    MessagePlugin.success(`${created.id} 已提交，基线版本 DS ${created.baseVersion}`);
  }
}

const mergeTagTheme: Record<string, 'success' | 'warning' | 'danger' | 'primary' | 'default'> = {
  clean: 'success',
  already: 'primary',
  conflict: 'danger',
  resolved: 'success',
  pending: 'default'
};
const mergeLabel: Record<string, string> = {
  clean: '已合并',
  already: '草稿已是目标值',
  conflict: '冲突待裁决',
  resolved: '冲突已裁决',
  pending: '待评审'
};
</script>

<template>
  <div class="review-page">
    <div class="review-summary panel">
      <div><span>待评审变更</span><strong>{{ pendingCount }}</strong></div>
      <div><span>已接受</span><strong>{{ acceptedCount }}</strong></div>
      <div><span>已退回</span><strong>{{ rejectedCount }}</strong></div>
      <div><span>冲突令牌</span><strong :class="{ bad: store.pendingConflictCount }">{{ store.conflictTokens.length }}</strong></div>
    </div>

    <div v-if="store.conflictTokens.length" class="panel conflict-banner">
      <div class="panel-head">
        <div><strong>合并冲突（{{ store.pendingConflictCount }} 条提案）</strong><span>当前草稿已被其他提案或旧页面改动，双方修改均保留，裁决后才能发布</span></div>
        <t-tag theme="danger" variant="light-outline">{{ store.conflictTokens.length }} 个令牌</t-tag>
      </div>
      <div v-for="group in store.conflictTokens" :key="`${group.tokenId}-${group.theme}`" class="conflict-group">
        <div class="conflict-token">
          <ErrorCircleIcon />
          <div>
            <strong>{{ tokenName(group.tokenId) }}</strong>
            <code>{{ group.tokenId }}</code>
            <t-tag size="small" variant="light">{{ THEME_LABELS[group.theme] ?? group.theme }}</t-tag>
          </div>
        </div>
        <div v-for="item in group.items" :key="item.changeId" class="conflict-item">
          <div class="conflict-meta">
            <t-tag size="small">{{ item.changeId }}</t-tag>
            <span>{{ item.title }} · {{ item.requester }}</span>
            <small>发起于 DS {{ item.baseVersion }}</small>
          </div>
          <div class="conflict-values">
            <div class="cv base"><span>发起基线</span><code>{{ item.base }}</code></div>
            <div class="cv current"><span>当前草稿（对方修改）</span><code>{{ item.current }}</code></div>
            <div class="cv proposed"><span>提案目标</span><code>{{ item.proposed }}</code></div>
          </div>
          <div class="conflict-actions">
            <t-button size="small" variant="outline" @click="resolve(item.changeId, 'current')">保留当前草稿</t-button>
            <t-button size="small" theme="primary" @click="resolve(item.changeId, 'proposed')">采用提案目标</t-button>
          </div>
        </div>
      </div>
    </div>

    <div class="review-toolbar">
      <p>每条提案记录发起时的发布版本与作用主题；接受时按三方合并判定，只更新该主题，不覆盖其他团队的改动。</p>
      <t-button theme="primary" variant="outline" :icon="AddButtonIcon" @click="openSubmit">提交调整提案</t-button>
    </div>

    <div class="review-grid">
      <div v-for="change in store.changes" :key="change.id" class="panel change-card">
        <div class="change-head">
          <div>
            <t-tag size="small">{{ change.id }}</t-tag>
            <strong>{{ change.title }}</strong>
            <span>{{ change.requester }} · {{ change.scope }}</span>
            <div class="change-meta">
              <t-tag size="small" variant="light" theme="primary">{{ THEME_LABELS[change.theme] ?? change.theme }}</t-tag>
              <t-tag size="small" variant="light">发起于 DS {{ change.baseVersion }}</t-tag>
              <t-tag v-if="isStale(change)" size="small" variant="light" theme="warning">版本滞后于候选 {{ store.releaseVersion }}</t-tag>
            </div>
          </div>
          <t-tag :theme="change.status === '已接受' ? 'success' : change.status === '已退回' ? 'danger' : 'warning'" variant="light">{{ change.status }}</t-tag>
        </div>

        <div class="diff-box">
          <div><span>发起基线值（DS {{ change.baseVersion }}）</span><code>{{ change.baseValue }}</code></div>
          <t-icon name="arrow-right" />
          <div><span>提案目标值 · {{ THEME_LABELS[change.theme] }}</span><code>{{ change.diff.after }}</code></div>
        </div>

        <div v-if="change.mergeState !== 'pending'" class="verdict-row">
          <t-tag size="small" :theme="mergeTagTheme[change.mergeState]" variant="light">{{ mergeLabel[change.mergeState] }}</t-tag>
          <template v-if="change.mergeState === 'conflict' && change.conflict">
            <code class="verdict-current">{{ change.conflict.current }}</code>
            <span class="verdict-vs">vs</span>
            <code class="verdict-proposed">{{ change.conflict.proposed }}</code>
            <t-button size="small" variant="outline" @click="resolve(change.id, 'current')">保留草稿</t-button>
            <t-button size="small" theme="primary" @click="resolve(change.id, 'proposed')">采用提案</t-button>
          </template>
          <small v-else-if="change.mergeState === 'already'" class="verdict-note">当前草稿已是目标值，无需覆盖</small>
          <small v-else-if="change.mergeState === 'clean'" class="verdict-note">仅写入作用主题，其他主题不变</small>
          <small v-else-if="change.mergeState === 'resolved'" class="verdict-note">冲突已裁决并写入作用主题</small>
        </div>

        <div class="impact"><span>影响评分</span><t-progress :percentage="change.impact" :theme="change.impact > 70 ? 'danger' : 'warning'" /></div>
        <div class="change-actions">
          <t-button variant="outline" :disabled="change.status !== '待评审'" @click="reject(change.id)">退回并说明</t-button>
          <t-button theme="primary" :disabled="change.status !== '待评审'" @click="accept(change.id)">接受变更</t-button>
        </div>
      </div>
    </div>

    <t-dialog v-model:visible="submitDialog" header="提交调整提案" :confirm-btn="{ content: '提交提案', onClick: submitProposal }">
      <div class="dialog-form">
        <t-input v-model="draft.title" label="调整标题" placeholder="例如：运营主题切换语义主色" />
        <t-input v-model="draft.requester" label="发起团队" placeholder="例如：运营设计组" />
        <t-select v-model="draft.token" label="目标令牌" :options="tokenOptions" @change="syncAfterValue" />
        <t-select v-model="draft.theme" label="作用主题" :options="themeOptions" @change="syncAfterValue" />
        <t-input v-model="draft.after" label="目标值" placeholder="提交时冻结当前发布版本作为基线" />
        <p class="submit-hint">提交时将记录候选版本 DS {{ store.releaseVersion }} 与该主题当前值；接受时仅更新此主题，若期间被其他提案改动会进入冲突裁决。</p>
      </div>
    </t-dialog>
  </div>
</template>
