// Settings UI copy (FR-SET-001, FR-SET-002). Wording follows the 2026-10-12
// confirmations; "纯色" for the non-glass theme is a proposal (specs/settings/spec.md SET-Q6).
import type { ColorMode, GlassColor, ThemePreference } from '../ipc/settings'

export const SETTINGS_STRINGS = {
  menuItem: '设置…',
  entry: '设置',
  title: '设置',
  close: '关闭设置',
  categories: '设置分类',
  appearance: '外观',
  cli: 'CLI',
  cliTitle: '默认 CLI',
  cliDescription: '选择一次，所有 Project 的新对话都会使用它。已有对话不会改变。',
  cliAutomatic: '自动选择第一个可用 CLI',
  cliUnavailable: '未安装或未登录的 CLI 不能设为默认。',
  cliSaved: '已应用到所有 Project。',
  cliSaveFailed: '未能保存默认 CLI 设置。',
  mode: '模式',
  modeNames: { system: '跟随系统', light: '浅色', dark: '深色' } satisfies Record<ColorMode, string>,
  theme: '主题',
  themeNames: { glass: '毛玻璃', solid: '纯色' } satisfies Record<ThemePreference, string>,
  themeHints: {
    glass: '透出并模糊窗口后方的桌面',
    solid: '不透明的背景与中性色'
  } satisfies Record<ThemePreference, string>,
  defaultBadge: '默认',
  glassColor: '毛玻璃背景',
  glassColorNames: {
    aurora: '极光', mint: '薄荷', sunset: '晚霞', haze: '海雾', none: '无'
  } satisfies Record<GlassColor, string>,
  glassColorNone: '只透出窗口后方的桌面',
  appliesImmediately: '点选后立即生效。',
  reducedTransparency: '系统已开启“降低透明度”，当前显示为纯色外观。',
  saveFailed: '未能保存外观设置。'
} as const
