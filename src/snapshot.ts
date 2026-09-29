import type { ChangeRequest, Token } from './store';
import { themeLabel } from './themes';

/**
 * 发布快照生成（发布流程的纯逻辑层）
 *
 * 发布前按主题汇总已接受提案：以发布基线为底，逐条只把提案作用主题的取值
 * 叠加上去，得到每个主题的只读版本快照。处于冲突待决状态的提案不会进入快照。
 */

export type ThemeChange = {
  tokenId: string;
  tokenName: string;
  before: string;
  after: string;
  changes: ChangeRequest[];
};

export type ReleaseSnapshot = {
  version: string;
  generatedAt: string;
  themes: {
    theme: string;
    label: string;
    changes: ThemeChange[];
    values: Record<string, string>;
  }[];
};

export function buildReleaseSnapshot(
  version: string,
  tokens: Token[],
  changes: ChangeRequest[],
  baseline: { id: string; value: string; themes: Record<string, string> }[]
): ReleaseSnapshot {
  const accepted = changes.filter((change) => change.status === '已接受');
  const byTheme = new Map<string, ChangeRequest[]>();
  accepted.forEach((change) => {
    const list = byTheme.get(change.theme) ?? [];
    list.push(change);
    byTheme.set(change.theme, list);
  });

  const themes = [...byTheme.keys()].sort().map((theme) => {
    const list = byTheme.get(theme)!;
    const values: Record<string, string> = {};
    baseline.forEach((base) => {
      values[base.id] = base.themes[theme] ?? base.value;
    });
    list.forEach((change) => {
      values[change.diff.token] = change.diff.after;
    });

    const grouped = new Map<string, ThemeChange>();
    list.forEach((change) => {
      const existing = grouped.get(change.diff.token);
      if (existing) {
        existing.changes.push(change);
        existing.after = change.diff.after;
        return;
      }
      const token = tokens.find((item) => item.id === change.diff.token);
      const base = baseline.find((item) => item.id === change.diff.token);
      grouped.set(change.diff.token, {
        tokenId: change.diff.token,
        tokenName: token?.name ?? change.diff.token,
        before: base?.themes[theme] ?? base?.value ?? change.diff.before,
        after: change.diff.after,
        changes: [change]
      });
    });

    return {
      theme,
      label: themeLabel(theme),
      changes: [...grouped.values()],
      values
    };
  });

  return { version, generatedAt: new Date().toISOString(), themes };
}
