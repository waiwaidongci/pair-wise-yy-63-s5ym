import type { ChangeRequest, Token } from '../store';

export const THEME_LABELS: Record<string, string> = {
  light: '品牌蓝 · 明亮',
  dark: '品牌蓝 · 暗色',
  ops: '运营绿',
  contrast: '高对比度'
};

/** 提案发起时冻结的版本基线快照。 */
export type ProposalSnapshot = {
  baseVersion: string;
  theme: string;
  baseValue: string;
};

/**
 * 快照生成：提案发起时记录发起版本、作用主题与该主题下的当前值。
 * 之后评审接受时以此为三方合并的共同祖先。
 */
export function snapshotProposal(tokens: Token[], change: { token: string; theme: string }, releaseVersion: string): ProposalSnapshot {
  const token = tokens.find((item) => item.id === change.token);
  const value = token?.themes[change.theme] ?? '';
  return { baseVersion: releaseVersion, theme: change.theme, baseValue: value };
}

export type ThemeSummaryItem = {
  changeId: string;
  title: string;
  requester: string;
  tokenId: string;
  baseVersion: string;
  value: string;
  mergeState: ChangeRequest['mergeState'];
};

export type ThemeSummary = {
  theme: string;
  themeLabel: string;
  items: ThemeSummaryItem[];
};

/** 发布前按主题汇总已接受（含冲突已裁决）提案，未裁决冲突不进入发布内容。 */
export function summarizeAcceptedByTheme(changes: ChangeRequest[], themes: string[], themeLabels: Record<string, string> = THEME_LABELS): ThemeSummary[] {
  const accepted = changes.filter(
    (change) => change.status === '已接受' && (change.mergeState === 'clean' || change.mergeState === 'already' || change.mergeState === 'resolved')
  );
  return themes.map((theme) => ({
    theme,
    themeLabel: themeLabels[theme] ?? theme,
    items: accepted
      .filter((change) => change.theme === theme)
      .map((change) => ({
        changeId: change.id,
        title: change.title,
        requester: change.requester,
        tokenId: change.diff.token,
        baseVersion: change.baseVersion,
        value: change.diff.after,
        mergeState: change.mergeState
      }))
  }));
}

export type ReleaseSnapshot = {
  version: string;
  baseVersion: string;
  createdAt: number;
  themes: string[];
  /** 冻结的令牌全集（含各主题值），产品使用方按版本拉取。 */
  tokens: Token[];
  themeSummary: ThemeSummary[];
};

/**
 * 快照生成：发布时冻结只读版本。仍有未裁决冲突时直接拒绝，
 * 冲突令牌不能被悄悄带入发布。
 */
export function buildReleaseSnapshot(
  tokens: Token[],
  changes: ChangeRequest[],
  payload: { version: string; baseVersion: string; themes: string[] }
): ReleaseSnapshot | { error: string; conflictCount: number } {
  const pendingConflicts = changes.filter((change) => change.mergeState === 'conflict').length;
  if (pendingConflicts > 0) {
    return { error: `仍有 ${pendingConflicts} 个提案与当前草稿冲突，需先在评审页裁决后再发布`, conflictCount: pendingConflicts };
  }
  return {
    version: payload.version,
    baseVersion: payload.baseVersion,
    createdAt: Date.now(),
    themes: payload.themes,
    tokens: JSON.parse(JSON.stringify(tokens)) as Token[],
    themeSummary: summarizeAcceptedByTheme(changes, payload.themes)
  };
}
