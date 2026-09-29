import { defineStore } from 'pinia';
import { classifyMerge, collectConflictTokens, type ConflictToken, type MergeState, type MergeVerdict } from './release/merge';
import { buildReleaseSnapshot, snapshotProposal, type ReleaseSnapshot } from './release/snapshot';

export type TokenCategory = 'color' | 'font' | 'spacing' | 'radius' | 'shadow' | 'component';
export type Token = {
  id: string;
  name: string;
  category: TokenCategory;
  value: string;
  ref?: string;
  themes: Record<string, string>;
  usage: number;
  status: 'stable' | 'deprecated' | 'proposed';
  description: string;
};

export type ChangeRequest = {
  id: string;
  title: string;
  requester: string;
  scope: string;
  impact: number;
  status: '待评审' | '已接受' | '已退回';
  diff: { token: string; before: string; after: string };
  /** 提案发起时的发布版本基线 */
  baseVersion: string;
  /** 提案作用的主题，接受时只更新该主题 */
  theme: string;
  /** 发起基线中该主题下的令牌值（三方合并的共同祖先） */
  baseValue: string;
  /** 版本基线三方合并状态 */
  mergeState: MergeState;
  /** 冲突待裁决时保留双方修改 */
  conflict?: { base: string; current: string; proposed: string };
  createdAt?: number;
};

const initialTokens: Token[] = [
  { id: 'color.base.blue.600', name: '品牌主色 600', category: 'color', value: '#2864dc', themes: { light: '#2864dc', dark: '#6f96ff', ops: '#24786a', contrast: '#0b4dba' }, usage: 184, status: 'stable', description: '主操作、链接和重点状态' },
  { id: 'color.semantic.primary', name: '语义主色', category: 'color', value: '{color.base.blue.600}', ref: 'color.base.blue.600', themes: { light: '{color.base.blue.600}', dark: '{color.base.blue.400}', ops: '{color.base.green.600}', contrast: '{color.base.blue.800}' }, usage: 126, status: 'stable', description: '组件库统一主色别名' },
  { id: 'color.base.blue.400', name: '品牌蓝 400', category: 'color', value: '#6f96ff', themes: { light: '#6f96ff', dark: '#6f96ff', ops: '#58a99a', contrast: '#2878e8' }, usage: 42, status: 'stable', description: '暗色主题主色' },
  { id: 'color.base.blue.800', name: '品牌蓝 800', category: 'color', value: '#0b4dba', themes: { light: '#0b4dba', dark: '#9ab9ff', ops: '#145c51', contrast: '#06358a' }, usage: 31, status: 'stable', description: '高对比主题主色' },
  { id: 'color.base.green.600', name: '运营绿 600', category: 'color', value: '#24786a', themes: { light: '#24786a', dark: '#54b2a0', ops: '#24786a', contrast: '#0d5a4d' }, usage: 67, status: 'proposed', description: '运营产品品牌替换色' },
  { id: 'color.text.primary', name: '正文主色', category: 'color', value: '#17202b', themes: { light: '#17202b', dark: '#f5f7fa', ops: '#152a25', contrast: '#000000' }, usage: 293, status: 'stable', description: '主要正文和标题' },
  { id: 'color.text.secondary', name: '正文次色', category: 'color', value: '#667582', themes: { light: '#667582', dark: '#a8b2bd', ops: '#62766f', contrast: '#303b46' }, usage: 211, status: 'stable', description: '辅助信息和说明' },
  { id: 'color.surface.canvas', name: '页面背景', category: 'color', value: '#f2f5f7', themes: { light: '#f2f5f7', dark: '#121821', ops: '#f1f6f4', contrast: '#ffffff' }, usage: 54, status: 'stable', description: '应用一级背景' },
  { id: 'font.family.sans', name: '无衬线字体', category: 'font', value: '"Noto Sans SC", sans-serif', themes: { light: '"Noto Sans SC", sans-serif', dark: '"Noto Sans SC", sans-serif', ops: '"Noto Sans SC", sans-serif', contrast: 'system-ui, sans-serif' }, usage: 388, status: 'stable', description: '产品界面默认真体' },
  { id: 'font.size.body', name: '正文字号', category: 'font', value: '14px', themes: { light: '14px', dark: '14px', ops: '14px', contrast: '16px' }, usage: 255, status: 'stable', description: '正文与表单文本' },
  { id: 'spacing.base.2', name: '基础间距 2', category: 'spacing', value: '8px', themes: { light: '8px', dark: '8px', ops: '8px', contrast: '8px' }, usage: 312, status: 'stable', description: '紧凑布局基础间距' },
  { id: 'radius.control', name: '控件圆角', category: 'radius', value: '6px', themes: { light: '6px', dark: '6px', ops: '4px', contrast: '4px' }, usage: 167, status: 'stable', description: '按钮、输入框和卡片' },
  { id: 'shadow.raised', name: '浮层阴影', category: 'shadow', value: '0 8px 28px rgba(22,35,48,.14)', themes: { light: '0 8px 28px rgba(22,35,48,.14)', dark: '0 8px 28px rgba(0,0,0,.42)', ops: '0 8px 28px rgba(21,54,45,.14)', contrast: '0 0 0 2px #303b46' }, usage: 36, status: 'stable', description: '菜单、弹窗和浮层' },
  { id: 'component.button.primary.bg', name: '主按钮背景', category: 'component', value: '{color.semantic.primary}', ref: 'color.semantic.primary', themes: { light: '{color.semantic.primary}', dark: '{color.semantic.primary}', ops: '{color.semantic.primary}', contrast: '{color.semantic.primary}' }, usage: 98, status: 'stable', description: '主要操作按钮' },
  { id: 'component.button.primary.text', name: '主按钮文字', category: 'component', value: '#ffffff', themes: { light: '#ffffff', dark: '#ffffff', ops: '#ffffff', contrast: '#ffffff' }, usage: 98, status: 'stable', description: '主要操作按钮文字' }
];

// CR-412 与 CR-413 同令牌同主题、目标值不同，模拟运营与组件团队同时提交。
// CR-418 发起后该值被旧页面直接写成 16px（草稿已偏离基线），提案目标 18px，接受时暴露冲突。
const seedChanges: ChangeRequest[] = [
  { id: 'CR-412', title: '运营产品切换语义主色', requester: '运营设计组', scope: '4 个产品 · 238 处引用', impact: 86, status: '待评审', diff: { token: 'color.semantic.primary', before: '{color.base.blue.600}', after: '{color.base.green.600}' }, baseVersion: '4.5.2', theme: 'light', baseValue: '{color.base.blue.600}', mergeState: 'pending', createdAt: Date.now() - 1000 * 60 * 60 * 5 },
  { id: 'CR-413', title: '语义主色改走蓝色 800', requester: '组件维护组', scope: '9 个组件 · 156 处引用', impact: 74, status: '待评审', diff: { token: 'color.semantic.primary', before: '{color.base.blue.600}', after: '{color.base.blue.800}' }, baseVersion: '4.5.2', theme: 'light', baseValue: '{color.base.blue.600}', mergeState: 'pending', createdAt: Date.now() - 1000 * 60 * 60 * 4 },
  { id: 'CR-414', title: '运营主题控件圆角收紧', requester: '运营设计组', scope: '3 个产品 · 41 处引用', impact: 33, status: '待评审', diff: { token: 'radius.control', before: '4px', after: '3px' }, baseVersion: '4.5.2', theme: 'ops', baseValue: '4px', mergeState: 'pending', createdAt: Date.now() - 1000 * 60 * 60 * 3 },
  { id: 'CR-418', title: '高对比度正文尺寸调整', requester: '无障碍专项组', scope: '2 个产品 · 74 处引用', impact: 42, status: '待评审', diff: { token: 'font.size.body', before: '14px', after: '18px' }, baseVersion: '4.5.2', theme: 'contrast', baseValue: '14px', mergeState: 'pending', createdAt: Date.now() - 1000 * 60 * 60 * 26 },
  { id: 'CR-423', title: '统一暗色浮层圆角', requester: '组件维护组', scope: '12 个组件 · 36 处引用', impact: 28, status: '待评审', diff: { token: 'radius.control', before: '6px', after: '8px' }, baseVersion: '4.5.2', theme: 'dark', baseValue: '6px', mergeState: 'pending', createdAt: Date.now() - 1000 * 60 * 60 * 2 }
];

const storageKey = 'yy63-token-governance';
const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null;
const saved = raw ? JSON.parse(raw) : null;

type BaselineRow = { id: string; value: string; themes: Record<string, string> };
// DS 4.5.2 已发布基线；草稿中 contrast 正文字号 16px 是旧页面在基线之后直接写入的。
const initialBaseline: BaselineRow[] = initialTokens.map((token) => ({
  id: token.id,
  value: token.value,
  themes: { ...token.themes, ...(token.id === 'font.size.body' ? { contrast: '14px' } : {}) }
}));

// 旧版本草稿没有版本基线字段，迁移到新模型：发起版本按当前发布基线补齐。
function migrateChanges(changes: ChangeRequest[] | undefined, releaseVersion: string): ChangeRequest[] {
  if (!changes) return seedChanges;
  return changes.map((change) => ({
    ...change,
    baseVersion: change.baseVersion ?? releaseVersion,
    theme: change.theme ?? 'light',
    baseValue: change.baseValue ?? change.diff.before,
    mergeState: change.mergeState ?? (change.status === '已接受' ? 'already' : 'pending'),
    conflict: change.conflict
  }));
}

function migrateBaseline(savedRows: { id: string; value: string; themes?: Record<string, string> }[] | undefined, tokens: Token[]): BaselineRow[] {
  if (!savedRows) return initialBaseline;
  return savedRows.map((row) => {
    const token = tokens.find((item) => item.id === row.id);
    return { id: row.id, value: row.value, themes: row.themes ?? token?.themes ?? {} };
  });
}

export const useTokenStore = defineStore('tokens', {
  state: () => ({
    tokens: (saved?.tokens as Token[]) ?? initialTokens,
    changes: migrateChanges(saved?.changes as ChangeRequest[] | undefined, saved?.lastPublished ? String(saved.lastPublished).replace(/^DS\s*/, '') : '4.5.2'),
    activeTheme: (saved?.activeTheme as string) ?? 'light',
    selectedTokenId: (saved?.selectedTokenId as string) ?? 'color.semantic.primary',
    search: (saved?.search as string) ?? '',
    category: (saved?.category as string) ?? '全部',
    releaseVersion: (saved?.releaseVersion as string) ?? '4.6.0-rc.2',
    locked: (saved?.locked as boolean) ?? false,
    lastPublished: (saved?.lastPublished as string) ?? 'DS 4.5.2',
    themes: ['light', 'dark', 'ops', 'contrast'],
    baseline: saved
      ? migrateBaseline(saved.baseline as BaselineRow[] | undefined, (saved.tokens as Token[]) ?? initialTokens)
      : initialBaseline,
    releaseSnapshots: (saved?.releaseSnapshots as ReleaseSnapshot[]) ?? []
  }),
  getters: {
    selectedToken(state): Token | undefined {
      return state.tokens.find((token) => token.id === state.selectedTokenId);
    },
    filteredTokens(state): Token[] {
      const query = state.search.toLowerCase();
      return state.tokens.filter((token) => {
        const matchesSearch = !query || token.id.toLowerCase().includes(query) || token.name.includes(state.search);
        const matchesCategory = state.category === '全部' || token.category === state.category;
        return matchesSearch && matchesCategory;
      });
    },
    dependencyEdges(state) {
      return state.tokens.filter((token) => token.ref).map((token) => ({ from: token.ref!, to: token.id }));
    },
    cycleNodes(state): string[] {
      const graph = new Map<string, string>();
      state.tokens.filter((token) => token.ref).forEach((token) => graph.set(token.id, token.ref!));
      const cycle = new Set<string>();
      graph.forEach((_, start) => {
        const path: string[] = [];
        let current: string | undefined = start;
        while (current && !path.includes(current)) {
          path.push(current);
          current = graph.get(current);
        }
        if (current && path.includes(current)) path.slice(path.indexOf(current)).forEach((id) => cycle.add(id));
      });
      return [...cycle];
    },
    invalidReferences(state) {
      const ids = new Set(state.tokens.map((token) => token.id));
      return state.tokens.filter((token) => token.ref && !ids.has(token.ref));
    },
    contrastIssues(state) {
      const text = state.tokens.find((token) => token.id === 'color.text.primary');
      const surface = state.tokens.find((token) => token.id === 'color.surface.canvas');
      const values = [text?.themes[state.activeTheme], surface?.themes[state.activeTheme]].filter(Boolean) as string[];
      if (values.length < 2) return [];
      const ratio = contrastRatio(values[0], values[1]);
      return ratio < 4.5 ? [{ title: '正文与页面背景对比度不足', detail: `当前 ${ratio.toFixed(2)}:1，要求至少 4.5:1。` }] : [];
    },
    conflictTokens(state): ConflictToken[] {
      return collectConflictTokens(state.changes);
    },
    pendingConflictCount(): number {
      return this.conflictTokens.reduce((total, group) => total + group.items.length, 0);
    },
    hasPendingConflicts(): boolean {
      return this.pendingConflictCount > 0;
    },
    // 发布差异按主题比较：默认值或任一主题值偏离基线即列出，并标注偏离的主题。
    diffRows(state) {
      return state.tokens.flatMap((token) => {
        const base = state.baseline.find((item) => item.id === token.id);
        if (!base) {
          return [{ id: token.id, name: token.name, before: '新增', after: token.value, themes: [...state.themes] }];
        }
        const changedThemes = state.themes.filter((theme) => (token.themes[theme] ?? '') !== (base.themes[theme] ?? ''));
        if (token.value === base.value && changedThemes.length === 0) return [];
        const rows: { id: string; name: string; before: string; after: string; themes: string[] }[] = [];
        if (changedThemes.length) {
          changedThemes.forEach((theme) => {
            rows.push({ id: token.id, name: token.name, before: base.themes[theme] ?? '新增', after: token.themes[theme] ?? '', themes: [theme] });
          });
        } else {
          rows.push({ id: token.id, name: token.name, before: base.value, after: token.value, themes: [] });
        }
        return rows;
      });
    },
    releaseReadiness(state): number {
      const base = 100 - this.cycleNodes.length * 25 - this.invalidReferences.length * 20 - this.contrastIssues.length * 15;
      return Math.max(0, base);
    }
  },
  actions: {
    selectToken(id: string) {
      this.selectedTokenId = id;
      this.persist();
    },
    updateTokenValue(id: string, value: string) {
      const token = this.tokens.find((item) => item.id === id);
      if (!token) return;
      token.value = value;
      token.themes[this.activeTheme] = value;
      if (value.startsWith('{') && value.endsWith('}')) token.ref = value.slice(1, -1);
      else delete token.ref;
      this.persist();
    },
    addToken(token: Token) {
      if (!this.tokens.some((item) => item.id === token.id)) this.tokens.push(token);
      this.persist();
    },
    setTheme(theme: string) {
      this.activeTheme = theme;
      this.persist();
    },
    setSearch(value: string) { this.search = value; this.persist(); },
    setCategory(value: string) { this.category = value; this.persist(); },
    /** 提交提案：快照生成在此发起，冻结发起版本、作用主题与基线值。 */
    submitChange(input: { title: string; requester: string; scope?: string; impact?: number; token: string; theme: string; after: string }) {
      const token = this.tokens.find((item) => item.id === input.token);
      if (!token) return undefined;
      const snapshot = snapshotProposal(this.tokens, { token: input.token, theme: input.theme }, this.releaseVersion);
      const seq = 500 + this.changes.length + 1;
      const change: ChangeRequest = {
        id: `CR-${seq}`,
        title: input.title || `${token.name} 值调整`,
        requester: input.requester || '设计系统维护员',
        scope: input.scope ?? `${token.usage} 处引用`,
        impact: input.impact ?? 30,
        status: '待评审',
        diff: { token: input.token, before: snapshot.baseValue, after: input.after },
        baseVersion: snapshot.baseVersion,
        theme: snapshot.theme,
        baseValue: snapshot.baseValue,
        mergeState: 'pending',
        createdAt: Date.now()
      };
      this.changes.unshift(change);
      this.persist();
      return change;
    },
    /**
     * 接受提案：以发起基线为共同祖先做三方合并，只写入作用主题。
     * 当前版本已被别的提案改过或被旧页面直接写入且目标冲突时，
     * 双方修改都保留并标记 conflict，绝不悄悄覆盖。
     */
    acceptChange(id: string): MergeVerdict | undefined {
      const change = this.changes.find((item) => item.id === id);
      if (!change || change.status !== '待评审') return undefined;
      const token = this.tokens.find((item) => item.id === change.diff.token);
      if (!token) return undefined;
      const verdict = classifyMerge({
        base: change.baseValue,
        current: token.themes[change.theme] ?? '',
        proposed: change.diff.after
      });
      change.status = '已接受';
      if (verdict.kind === 'clean') {
        token.themes[change.theme] = verdict.value;
        change.mergeState = 'clean';
      } else if (verdict.kind === 'already') {
        change.mergeState = 'already';
      } else {
        // 冲突：保留当前草稿（对方修改）与提案目标，等待人工裁决。
        change.mergeState = 'conflict';
        change.conflict = { base: verdict.base, current: verdict.current, proposed: verdict.proposed };
      }
      this.persist();
      return verdict;
    },
    /** 冲突裁决：采用当前草稿（对方修改）或提案目标，只更新作用主题。 */
    resolveConflict(id: string, choice: 'current' | 'proposed') {
      const change = this.changes.find((item) => item.id === id);
      if (!change || change.mergeState !== 'conflict' || !change.conflict) return;
      const token = this.tokens.find((item) => item.id === change.diff.token);
      if (!token) return;
      const chosen = choice === 'proposed' ? change.conflict.proposed : change.conflict.current;
      token.themes[change.theme] = chosen;
      change.mergeState = 'resolved';
      if (choice === 'proposed') change.diff.after = chosen;
      change.conflict = undefined;
      this.persist();
    },
    rejectChange(id: string) {
      const change = this.changes.find((item) => item.id === id);
      if (change) change.status = '已退回';
      this.persist();
    },
    rollback() {
      this.baseline.forEach((base) => {
        const token = this.tokens.find((item) => item.id === base.id);
        if (token) {
          token.value = base.value;
          this.themes.forEach((theme) => {
            if (base.themes[theme] !== undefined) token.themes[theme] = base.themes[theme];
          });
        }
      });
      this.persist();
    },
    /** 发布：快照生成冻结只读版本；仍有未裁决冲突时拒绝发布。 */
    lockRelease(version: string): { ok: boolean; error?: string; snapshot?: ReleaseSnapshot } {
      if (this.cycleNodes.length === 0 && this.invalidReferences.length === 0 && this.contrastIssues.length === 0 && !this.changes.some((item) => item.status === '待评审') && !this.hasPendingConflicts) {
        const baseVersion = this.lastPublished.replace(/^DS\s*/, '');
        const result = buildReleaseSnapshot(this.tokens, this.changes, { version, baseVersion, themes: this.themes });
        if ('error' in result) return { ok: false, error: result.error };
        this.releaseSnapshots.unshift(result);
        this.locked = true;
        this.lastPublished = `DS ${version}`;
        this.persist();
        return { ok: true, snapshot: result };
      }
      const gateError = this.hasPendingConflicts
        ? `仍有 ${this.pendingConflictCount} 个冲突提案待裁决`
        : '校验未全部通过或仍有提案待评审';
      this.persist();
      return { ok: false, error: gateError };
    },
    persist() {
      if (typeof localStorage !== 'undefined') localStorage.setItem(storageKey, JSON.stringify({ tokens: this.tokens, changes: this.changes, activeTheme: this.activeTheme, selectedTokenId: this.selectedTokenId, search: this.search, category: this.category, releaseVersion: this.releaseVersion, locked: this.locked, lastPublished: this.lastPublished, baseline: this.baseline, releaseSnapshots: this.releaseSnapshots }));
    }
  }
});

function contrastRatio(a: string, b: string) {
  const luminance = (hex: string) => {
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return .5;
    const channels = [0, 2, 4].map((index) => parseInt(clean.slice(index, index + 2), 16) / 255).map((value) => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
  };
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05);
}
