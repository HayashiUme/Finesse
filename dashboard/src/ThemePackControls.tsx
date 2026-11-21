import { useRef, useState, useSyncExternalStore } from 'react'
import { Download, Image, RotateCcw, SwatchBook, Upload } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const defaultLogo = '/images/acg-finesseChan-icon.png'
const defaultWallpaper = '/images/acg-spring-meadow.jpg'
type ThemeError = '' | 'themeExport' | 'themeInvalid' | 'themeImport' | 'logoInvalid' | 'logoTooLarge'
const themes = [
  { key: 'themeFinesse', name: 'Finesse', accent: '#c8a2c8', logo: defaultLogo, wallpaper: null },
  { key: 'themeMiku', name: 'Hatsune Miku', accent: '#39c5bb', logo: '/images/miku-acg-icon.png', wallpaper: '/images/miku-acg-background.jpg' },
] as const
const maxLogoLength = 700_000

async function encodeAsset(value: string | null, maxDimension: number, maxBytes: number, mimeType: string) {
  if (!value) return null
  const response = await fetch(value)
  if (!response.ok) throw new Error('themeExport')
  const bitmap = await createImageBitmap(await response.blob())
  try {
    let width = Math.min(bitmap.width, maxDimension)
    let height = Math.round(bitmap.height * width / bitmap.width)
    if (height > maxDimension) {
      height = maxDimension
      width = Math.round(bitmap.width * height / bitmap.height)
    }
    let blob: Blob | null = null
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('themeExport')
      context.drawImage(bitmap, 0, 0, width, height)
      blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mimeType, 0.78 - Math.min(attempt, 5) * 0.08))
      if (blob && blob.size <= maxBytes) break
      width = Math.round(width * 0.82)
      height = Math.round(height * 0.82)
    }
    if (!blob || blob.size > maxBytes) throw new Error('themeExport')
    return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('themeExport'))
    reader.onerror = () => reject(new Error('themeExport'))
      reader.readAsDataURL(blob!)
    })
  } finally {
    bitmap.close()
  }
}

async function compressLogo(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024) throw new Error('logoInvalid')
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const context = canvas.getContext('2d')
    if (!context) throw new Error('logoInvalid')
    context.clearRect(0, 0, 256, 256)
    const scale = Math.min(256 / bitmap.width, 256 / bitmap.height)
    const width = bitmap.width * scale
    const height = bitmap.height * scale
    context.drawImage(bitmap, (256 - width) / 2, (256 - height) / 2, width, height)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.82))
    if (!blob) throw new Error('logoInvalid')
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('logoInvalid'))
      reader.onerror = () => reject(new Error('logoInvalid'))
      reader.readAsDataURL(blob)
    })
    if (dataUrl.length > maxLogoLength) throw new Error('logoTooLarge')
    return dataUrl
  } finally {
    bitmap.close()
  }
}

export default function ThemePackControls() {
  const { t } = useTranslation()
  const logoInput = useRef<HTMLInputElement>(null)
  const themeInput = useRef<HTMLInputElement>(null)
  const currentLogo = useSyncExternalStore(onChange => {
    window.addEventListener('finesse-theme-change', onChange)
    return () => window.removeEventListener('finesse-theme-change', onChange)
  }, window.finesseTheme.getLogo)
  const [error, setError] = useState<ThemeError>('')
  const [busy, setBusy] = useState(false)

  async function exportTheme() {
    setError('')
    setBusy(true)
    try {
      const current = window.finesseTheme.getAppearance()
      const theme = { ...current, logo: await encodeAsset(current.logo, 256, 500_000, 'image/webp'), wallpaper: await encodeAsset(current.wallpaper ?? defaultWallpaper, 1920, 1_250_000, 'image/jpeg') }
      const blob = new Blob([JSON.stringify({ format: 'finesse-theme', version: 1, theme }, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `finesse-${current.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'theme'}.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('themeExport')
    } finally {
      setBusy(false)
    }
  }

  async function importTheme(file?: File) {
    if (!file) return
    setError('')
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('themeInvalid')
      const parsed: unknown = JSON.parse(await file.text())
      if (!parsed || typeof parsed !== 'object' || !('format' in parsed) || parsed.format !== 'finesse-theme' || !('version' in parsed) || parsed.version !== 1 || !('theme' in parsed)) throw new Error('themeInvalid')
      const applied = window.finesseTheme.setTheme((parsed as { theme: unknown }).theme)
      if (!applied) throw new Error('themeInvalid')
    } catch (reason) {
      setError(reason instanceof Error && reason.message === 'themeInvalid' ? 'themeInvalid' : 'themeImport')
    } finally {
      if (themeInput.current) themeInput.current.value = ''
    }
  }

  async function uploadLogo(file?: File) {
    if (!file) return
    setError('')
    try {
      const logo = await compressLogo(file)
      window.finesseTheme.setLogo(logo)
    } catch (reason) {
      setError(reason instanceof Error && reason.message === 'logoTooLarge' ? 'logoTooLarge' : 'logoInvalid')
    } finally {
      if (logoInput.current) logoInput.current.value = ''
    }
  }

  function restoreLogo() {
    window.finesseTheme.setLogo(defaultLogo)
  }

  return <div className="theme-pack-controls">
    <div className="theme-presets" role="group" aria-label={t('themePresets')}>
      {themes.map(({ key, ...theme }) => <button key={key} type="button" className="theme-preset" onClick={() => { setError(''); window.finesseTheme.setTheme(theme) }}><span className="theme-preset-swatch" style={{ background: theme.accent }} /><span>{t(key)}</span><SwatchBook size={15} /></button>)}
    </div>
    <div className="theme-logo-row"><img src={currentLogo} alt="" /><div><strong>{t('brandLogo')}</strong><small>{t('brandLogoDescription')}</small></div><input ref={logoInput} className="wallpaper-file-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { void uploadLogo(event.target.files?.[0]) }} /><button className="secondary-btn" type="button" onClick={() => logoInput.current?.click()}><Image size={14} />{t('uploadLogo')}</button><button className="icon-btn" type="button" title={t('resetLogo')} aria-label={t('resetLogo')} onClick={restoreLogo}><RotateCcw size={15} /></button></div>
    <div className="theme-import-export"><input ref={themeInput} className="wallpaper-file-input" type="file" accept="application/json,.json" onChange={event => { void importTheme(event.target.files?.[0]) }} /><button className="secondary-btn" type="button" onClick={() => themeInput.current?.click()}><Upload size={14} />{t('importTheme')}</button><button className="secondary-btn" type="button" onClick={() => void exportTheme()} disabled={busy}><Download size={14} />{t(busy ? 'exportingTheme' : 'exportTheme')}</button></div>
    {error && <p className="wallpaper-error" role="alert">{t(error)}</p>}
  </div>
}
