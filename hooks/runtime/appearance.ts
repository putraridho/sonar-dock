// Light or dark: the person's choice (/sonar light|dark), else Claude Code's theme, else macOS.

import type { Mode } from '../theme/palette'

export type ThemeChoice = Mode | 'auto'

export const THEME_KEY = 'theme'

export class Appearance {
  current: Mode = 'dark'
}

// The mode from what is known: the stored choice, Claude Code's theme setting, and whether
// macOS is dark (asked only when the others leave it open).
export async function resolveMode(choice: unknown, theme: string, isSystemDark: () => Promise<boolean>): Promise<Mode> {
  if (choice === 'light' || choice === 'dark') return choice
  if (theme.includes('light')) return 'light'
  if (theme.includes('dark')) return 'dark'
  return (await isSystemDark()) ? 'dark' : 'light'
}
