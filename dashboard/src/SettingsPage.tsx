import { useTranslation } from 'react-i18next'
import { Image, Languages, MonitorCog, Palette } from 'lucide-react'
import AppShell, { type ShellProps } from './AppShell'
import AccentColorPicker from './AccentColorPicker'
import LanguageSwitcher from './LanguageSwitcher'
import ThemeSwitcher from './ThemeSwitcher'
import WallpaperPicker from './WallpaperPicker'

export default function SettingsPage(props: ShellProps) {
  const { t } = useTranslation()
  return <AppShell {...props} onRefresh={() => {}}>
    <div className="page-heading"><div><h1>{t('preferences')}</h1><p>{t('preferencesDescription')}</p></div></div>
    <section className="preference-list" aria-label={t('preferences')}>
      <div className="preference-row"><div className="preference-icon"><Languages size={18} /></div><div className="preference-copy"><h2>{t('language')}</h2><p>{t('languageDescription')}</p></div><LanguageSwitcher /></div>
      <div className="preference-row preference-appearance"><div className="preference-icon"><Palette size={18} /></div><div className="preference-copy"><h2>{t('theme')}</h2><p>{t('themeDescription')}</p></div><div className="appearance-controls"><ThemeSwitcher /><div className="accent-setting"><span>{t('themeColor')}</span><AccentColorPicker /></div></div></div>
      <div className="preference-row preference-wallpaper"><div className="preference-icon"><Image size={18} /></div><div className="preference-copy"><h2>{t('wallpaper')}</h2><p>{t('wallpaperDescription')}</p></div><WallpaperPicker /></div>
    </section>
    <div className="settings-scope"><MonitorCog size={15} /><span>{t('preferencesScope')}</span></div>
    <p className="wallpaper-credit"><span>{t('wallpaperCredit')}</span></p>
  </AppShell>
}
