import { useSyncExternalStore } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type ThemePreference = 'light' | 'dark' | 'system'

declare global {
  interface Window {
    finesseTheme: {
      getPreference: () => ThemePreference
      setPreference: (value: ThemePreference) => void
      getAccent: () => string
      setAccent: (value: string) => void
      getWallpaper: () => string | null
      setWallpaper: (value: string | null) => void
      getLogo: () => string
      getName: () => string
      getAppearance: () => { name: string; accent: string; logo: string; wallpaper: string | null }
      setLogo: (value: string) => void
      setTheme: (value: unknown) => boolean
    }
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener('finesse-theme-change', onChange)
  return () => window.removeEventListener('finesse-theme-change', onChange)
}

export default function ThemeSwitcher() {
  const { t } = useTranslation()
  const preference = useSyncExternalStore(subscribe, window.finesseTheme.getPreference)
  const Icon = preference === 'system' ? Monitor : preference === 'dark' ? Moon : Sun

  return <label className="theme-switcher" title={t('theme')}>
    <Icon size={15} aria-hidden="true" />
    <select aria-label={t('theme')} value={preference} onChange={event => window.finesseTheme.setPreference(event.target.value as ThemePreference)}>
      <option value="system">{t('themeSystem')}</option>
      <option value="light">{t('themeLight')}</option>
      <option value="dark">{t('themeDark')}</option>
    </select>
  </label>
}
