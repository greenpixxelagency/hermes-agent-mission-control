'use client'

import { Moon, Sun } from 'lucide-react'
import { useSyncExternalStore } from 'react'

type Theme = 'light' | 'dark'
const storageKey = 'rogeros-theme'

function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.dataset.theme = theme
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(callback => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const followSystem = () => {
      if (!window.localStorage.getItem(storageKey)) {
        applyTheme(media.matches ? 'dark' : 'light')
        callback()
      }
    }
    const followChoice = () => callback()
    media.addEventListener('change', followSystem)
    window.addEventListener('storage', followChoice)
    window.addEventListener('rogeros-theme-change', followChoice)
    return () => { media.removeEventListener('change', followSystem); window.removeEventListener('storage', followChoice); window.removeEventListener('rogeros-theme-change', followChoice) }
  }, () => document.documentElement.dataset.theme === 'light' ? 'light' : 'dark', () => 'dark')

  const next = theme === 'dark' ? 'light' : 'dark'
  return <button type="button" className="rogeros-theme-toggle" aria-label={`Use ${next} mode`} title={`Use ${next} mode`} onClick={() => { window.localStorage.setItem(storageKey, next); applyTheme(next); window.dispatchEvent(new Event('rogeros-theme-change')) }}>{theme === 'dark' ? <Sun aria-hidden /> : <Moon aria-hidden />}</button>
}
