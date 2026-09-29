export const themes = [
  { id: 'light', label: '明亮模式' },
  { id: 'dark', label: '暗色模式' },
  { id: 'ops', label: '运营模式' },
  { id: 'contrast', label: '高对比度' }
] as const;

export type ThemeId = (typeof themes)[number]['id'];

export function themeLabel(id: string): string {
  return themes.find((theme) => theme.id === id)?.label ?? id;
}
