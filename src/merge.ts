import type { ChangeRequest, Token } from './store';

/**
 * 合并判定（评审流程的纯逻辑层）
 *
 * 每条提案在发起时记录发布基线版本 baseVersion、作用主题 theme 以及基线上的
 * 目标值 diff.before。接受提案时按 3-way merge 判定，而不是直接覆盖：
 *
 * - 双方都没动（当前值仍等于基线值）：干净合并；
 * - 别人已经把同一主题改成提案的目标值：视为已合并，幂等接受；
 * - 当前版本已被别的提案改过，或工作区草稿与基线冲突：保留双方修改，
 *   返回 conflict 并列出冲突令牌，绝不悄悄覆盖；
 * - 旧页面提交（基线版本落后）时，目标主题没被别人动过仍可干净合并，
 *   但会附带 stale 提示；目标主题被动过则列为冲突。
 */

export type MergeReason =
  | 'clean'
  | 'already-applied'
  | 'missing-token'
  | 'draft-conflict'
  | 'drift-conflict';

export type MergeVerdict = {
  kind: 'merge' | 'conflict';
  reason: MergeReason;
  /** 冲突时保留下来的双方取值：当前工作区值 vs 提案目标值 */
  currentValue?: string;
  proposedValue?: string;
  /** 涉及冲突的令牌（当前每条提案只作用一个令牌） */
  conflictTokens: string[];
  /** 旧页面提交但可安全合并时给出版本滞后提示 */
  notice?: string;
};

function currentThemeValue(token: Token | undefined, theme: string): string | undefined {
  if (!token) return undefined;
  return token.themes[theme] ?? token.value;
}

/**
 * @param currentVersion 当前发布候选版本
 * @param tokens 当前工作区令牌（可能已被其他提案或草稿修改）
 * @param siblings 同一批提案中、作用于相同令牌+主题且已接受的其他提案
 */
export function evaluateMerge(
  change: ChangeRequest,
  currentVersion: string,
  tokens: Token[],
  siblings: ChangeRequest[] = []
): MergeVerdict {
  const token = tokens.find((item) => item.id === change.diff.token);
  if (!token) {
    return { kind: 'conflict', reason: 'missing-token', proposedValue: change.diff.after, conflictTokens: [change.diff.token] };
  }

  const currentValue = currentThemeValue(token, change.theme) ?? '';
  const baseValue = change.diff.before;
  const proposedValue = change.diff.after;

  // 别的提案已把同一主题改成相同目标值：幂等接受，不产生覆盖。
  if (currentValue === proposedValue && baseValue !== proposedValue) {
    return { kind: 'merge', reason: 'already-applied', currentValue, proposedValue, conflictTokens: [] };
  }

  // 当前主题值与发起基线一致：没有人与本提案冲突。
  if (currentValue === baseValue) {
    const verdict: MergeVerdict = { kind: 'merge', reason: 'clean', currentValue, proposedValue, conflictTokens: [] };
    if (change.baseVersion && change.baseVersion !== currentVersion) {
      verdict.notice = `提案基于 ${change.baseVersion} 发起（当前候选 ${currentVersion}），目标主题未被其他提案修改，已按当前版本合并。`;
    }
    return verdict;
  }

  // 当前值既不是基线值也不是提案目标值：
  // 能在已接受提案里找到来源 → 被别的提案改过；否则是工作区草稿改动。
  const changedByOtherProposal = siblings.some(
    (other) => other.id !== change.id && other.status === '已接受' && other.theme === change.theme && other.diff.after === currentValue
  );
  return {
    kind: 'conflict',
    reason: changedByOtherProposal ? 'drift-conflict' : 'draft-conflict',
    currentValue,
    proposedValue,
    conflictTokens: [token.id]
  };
}

export function describeVerdict(verdict: MergeVerdict): string {
  switch (verdict.reason) {
    case 'already-applied':
      return '该主题已被其他提案更新为相同取值，接受为幂等合并，未重复写入。';
    case 'missing-token':
      return '提案目标令牌在当前版本中不存在，无法合并。';
    case 'drift-conflict':
      return '当前版本的该主题已被其他提案修改，双方修改已保留，请人工选择最终取值。';
    case 'draft-conflict':
      return '工作区草稿在发起基线之后改动了该令牌，提案与草稿冲突，双方修改已保留，请人工合并。';
    default:
      return '';
  }
}
