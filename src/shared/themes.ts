import type { ThemeMode, ThemePreference } from './types'

export type ThemeGroup = '基础' | 'GitHub' | 'VS Code' | '其他'

export interface ThemePreview {
  bg: string
  surface: string
  accent: string
}

export interface ThemeDef {
  value: ThemeMode
  label: string
  group: ThemeGroup
  dark: boolean
  background: string
  preview: ThemePreview
}

export const THEME_DEFS: ThemeDef[] = [
  {
    value: 'light',
    label: '浅色',
    group: '基础',
    dark: false,
    background: '#fbfaf7',
    preview: { bg: '#fbfaf7', surface: '#f4f2ed', accent: '#3a6ea5' }
  },
  {
    value: 'dark',
    label: '深色',
    group: '基础',
    dark: true,
    background: '#15171b',
    preview: { bg: '#15171b', surface: '#191c21', accent: '#6a9ed4' }
  },
  {
    value: 'sepia',
    label: '护眼米色',
    group: '基础',
    dark: false,
    background: '#f8f3e8',
    preview: { bg: '#f8f3e8', surface: '#f1ebdc', accent: '#8a6331' }
  },
  {
    value: 'github-light',
    label: 'GitHub 浅色',
    group: 'GitHub',
    dark: false,
    background: '#ffffff',
    preview: { bg: '#ffffff', surface: '#f6f8fa', accent: '#0969da' }
  },
  {
    value: 'github-dark',
    label: 'GitHub 深色',
    group: 'GitHub',
    dark: true,
    background: '#0d1117',
    preview: { bg: '#0d1117', surface: '#161b22', accent: '#58a6ff' }
  },
  {
    value: 'vscode-light',
    label: 'VS Code 浅色',
    group: 'VS Code',
    dark: false,
    background: '#ffffff',
    preview: { bg: '#ffffff', surface: '#f3f3f3', accent: '#005fb8' }
  },
  {
    value: 'vscode-dark',
    label: 'VS Code 深色',
    group: 'VS Code',
    dark: true,
    background: '#1e1e1e',
    preview: { bg: '#1e1e1e', surface: '#252526', accent: '#3794ff' }
  },
  {
    value: 'one-dark',
    label: 'One Dark',
    group: '其他',
    dark: true,
    background: '#282c34',
    preview: { bg: '#282c34', surface: '#21252b', accent: '#61afef' }
  }
]

export const THEME_GROUPS: Array<{ label: ThemeGroup; themes: ThemeDef[] }> = (
  ['基础', 'GitHub', 'VS Code', '其他'] as ThemeGroup[]
).map((label) => ({ label, themes: THEME_DEFS.filter((theme) => theme.group === label) }))

const THEME_MAP = new Map<string, ThemeDef>(THEME_DEFS.map((theme) => [theme.value, theme]))

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || (typeof value === 'string' && THEME_MAP.has(value))
}

export function isDarkTheme(theme: ThemeMode): boolean {
  return THEME_MAP.get(theme)?.dark ?? false
}

export function themeBackground(theme: ThemeMode): string {
  return THEME_MAP.get(theme)?.background ?? '#fbfaf7'
}
