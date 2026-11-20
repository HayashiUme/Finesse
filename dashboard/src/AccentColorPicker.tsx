import { useSyncExternalStore } from 'react'
import { Check, Pipette } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const colors = [
  { key: 'accentMiku', value: '#39c5bb' },
  { key: 'accentSakura', value: '#e875a8' },
  { key: 'accentSky', value: '#59a9dc' },
  { key: 'accentMint', value: '#45b48d' },
  { key: 'accentViolet', value: '#9a7bd1' },
  { key: 'accentAmber', value: '#d99a42' },
  { key: 'accentCoral', value: '#e87568' },
  { key: 'accentIndigo', value: '#6579d8' },
] as const

function subscribe(onChange: () => void) {
  window.addEventListener('finesse-theme-change', onChange)
  return () => window.removeEventListener('finesse-theme-change', onChange)
}

export default function AccentColorPicker() {
  const { t } = useTranslation()
  const value = useSyncExternalStore(subscribe, window.finesseTheme.getAccent)
  return <div className="accent-picker" role="group" aria-label={t('themeColor')}>
    <div className="accent-swatches">{colors.map(color => <button key={color.value} className={`accent-swatch ${value === color.value ? 'selected' : ''}`} style={{ '--swatch': color.value } as React.CSSProperties} title={t(color.key)} aria-label={t(color.key)} aria-pressed={value === color.value} onClick={() => window.finesseTheme.setAccent(color.value)}>{value === color.value && <Check size={13} />}</button>)}</div>
    <label className="custom-accent" title={t('customThemeColor')}><Pipette size={14} aria-hidden="true" /><input type="color" aria-label={t('customThemeColor')} value={value} onChange={event => window.finesseTheme.setAccent(event.target.value)} /></label>
  </div>
}
