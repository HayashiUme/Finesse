import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, Image, Info, Languages, Palette, RefreshCw, SwatchBook } from 'lucide-react'
import AppShell, { type ShellProps } from './AppShell'
import AccentColorPicker from './AccentColorPicker'
import LanguageSwitcher from './LanguageSwitcher'
import ThemeSwitcher from './ThemeSwitcher'
import WallpaperPicker from './WallpaperPicker'
import ThemePackControls from './ThemePackControls'
import VersionSettings from './VersionSettings'
import type { Connection } from './types'

type SettingsTab = 'appearance' | 'version' | 'about'

export default function SettingsPage({ connection, ...props }: ShellProps & { connection?: Connection }) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<SettingsTab>('appearance')
  const tabs = [
    { id: 'appearance', label: 'settingsAppearance', icon: Palette },
    { id: 'version', label: 'settingsVersion', icon: RefreshCw },
    { id: 'about', label: 'settingsAbout', icon: Info },
  ] as const

  return <AppShell {...props} onRefresh={() => {}}>
    <div className="page-heading"><div><h1>{t('preferences')}</h1><p>{t('preferencesDescription')}</p></div></div>
    <div className="settings-tabs" role="tablist" aria-label={t('preferences')}>
      {tabs.map(({ id, label, icon: Icon }) => <button key={id} id={`settings-tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`settings-panel-${id}`} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon size={16} /><span>{t(label)}</span></button>)}
    </div>
    <section id={`settings-panel-${tab}`} role="tabpanel" aria-labelledby={`settings-tab-${tab}`} className="settings-tab-panel">
      {tab === 'appearance' && <>
        <section className="preference-list" aria-label={t('settingsAppearance')}>
          <div className="preference-row"><div className="preference-icon"><Languages size={18} /></div><div className="preference-copy"><h2>{t('language')}</h2><p>{t('languageDescription')}</p></div><LanguageSwitcher /></div>
          <div className="preference-row preference-appearance"><div className="preference-icon"><Palette size={18} /></div><div className="preference-copy"><h2>{t('theme')}</h2><p>{t('themeDescription')}</p></div><div className="appearance-controls"><ThemeSwitcher /><div className="accent-setting"><span>{t('themeColor')}</span><AccentColorPicker /></div></div></div>
          <div className="preference-row preference-theme-packs"><div className="preference-icon"><SwatchBook size={18} /></div><div className="preference-copy"><h2>{t('themePresets')}</h2><p>{t('themePresetsDescription')}</p></div><ThemePackControls /></div>
          <div className="preference-row preference-wallpaper"><div className="preference-icon"><Image size={18} /></div><div className="preference-copy"><h2>{t('wallpaper')}</h2><p>{t('wallpaperDescription')}</p></div><WallpaperPicker /></div>
        </section>
        <div className="settings-scope"><span>{t('preferencesScope')}</span></div>
        <p className="wallpaper-credit"><span>{t('wallpaperCredit')}</span></p>
      </>}
      {tab === 'version' && <VersionSettings connection={connection} />}
      {tab === 'about' && <AboutSettings />}
    </section>
  </AppShell>
}

function AboutSettings() {
  const { t } = useTranslation()
  const links = [
    { label: 'aboutLicense', detail: 'aboutLicenseValue', href: 'https://github.com/HayashiUme/Finesse/blob/main/LICENSE' },
    { label: 'privacyPolicy', detail: 'privacyPolicyDescription', href: 'https://github.com/HayashiUme/Finesse/blob/main/docs/privacy-policy.md' },
    { label: 'githubRepository', detail: 'aboutRepositoryValue', href: 'https://github.com/HayashiUme/Finesse' },
    { label: 'githubProfile', detail: 'aboutProfileValue', href: 'https://github.com/HayashiUme' },
  ] as const
  return <div className="about-settings">
    <section className="about-project">
      <div className="about-project-icon"><Info size={20} /></div>
      <div><span className="eyebrow">FINESSE</span><h2>{t('aboutProjectTitle')}</h2><p>{t('aboutProjectDescription')}</p><small>{t('aboutComponents')}</small></div>
    </section>
    <nav className="about-links" aria-label={t('settingsAbout')}>
      {links.map(item => <a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer"><span><b>{t(item.label)}</b><small>{t(item.detail)}</small></span><ExternalLink size={15} /></a>)}
    </nav>
  </div>
}
