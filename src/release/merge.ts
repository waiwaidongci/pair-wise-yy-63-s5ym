import type { ChangeRequest } from '../store';

/**
 * 提案相对于发起基线的合并状态。
 * pending  尚未评审
 * clean    草稿未被其他人改动，提案目标已写入对应主题
 * already  草稿值与提案目标一致（其他提案或旧页面已写入），无需重复写入
 * conflict 草稿已偏离发起基线且与提案目标不一致，双方修改均保留，等待裁决
 * resolved 冲突已经人工裁决，裁决值已写入对应主题
 */
export type MergeState = 'pending' | 'clean' | 'already' | 'conflict' | 'resolved';

export type MergeInput = {
  /** 提案发起时该主题的基线值 */
  base: string;
  /** 当前草稿值（可能已被其他提案或旧页面改动） */
  current: string;
  /** 本提案的目标值 */
  proposed: string;
};

export type MergeVerdict =
  | { kind: 'clean'; value: string }
  | { kind: 'already'; value: string }
  | { kind: 'conflict'; base: string; current: string; proposed: string };

/**
 * 三方合并判定：只比较数值，不做任何写入。
 * - 当前草稿已是提案目标：视为已生效，不重复写入；
 * - 当前草稿仍等于发起基线：干净合并，允许写入提案目标；
 * - 其他情况（基线被别的提案推进、旧页面直接写入等）：判为冲突，调用方不得覆盖。
 */
export function classifyMerge({ base, current, proposed }: MergeInput): MergeVerdict {
  if (current === proposed) return { kind: 'already', value: current };
  if (current === base) return { kind: 'clean', value: proposed };
  return { kind: 'conflict', base, current, proposed };
}

export type ConflictItem = {
  changeId: string;
  title: string;
  requester: string;
  baseVersion: string;
  base: string;
  current: string;
  proposed: string;
};

export type ConflictToken = {
  tokenId: string;
  theme: string;
  items: ConflictItem[];
};

/** 按「令牌 + 作用主题」归并未裁决冲突，供评审页面集中列出。 */
export function collectConflictTokens(changes: ChangeRequest[]): ConflictToken[] {
  const groups = new Map<string, ConflictToken>();
  changes
    .filter((change) => change.mergeState === 'conflict')
    .forEach((change) => {
      const key = `${change.diff.token}::${change.theme}`;
      let group = groups.get(key);
      if (!group) {
        group = { tokenId: change.diff.token, theme: change.theme, items: [] };
        groups.set(key, group);
      }
      group.items.push({
        changeId: change.id,
        title: change.title,
        requester: change.requester,
        baseVersion: change.baseVersion,
        base: change.baseValue,
        current: change.conflict?.current ?? change.baseValue,
        proposed: change.conflict?.proposed ?? change.diff.after
      });
    });
  return [...groups.values()];
}
