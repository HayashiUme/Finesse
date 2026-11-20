import { useRef, useState, useSyncExternalStore } from 'react'
import { Image, RotateCcw, Upload } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const defaultWallpaper = '/images/acg-spring-meadow.jpg'
const maxInputBytes = 12 * 1024 * 1024
const maxStoredLength = 1_700_000
type WallpaperError = 'imageType' | 'imageSize' | 'imageProcess' | 'imageRead' | 'wallpaperStorage'

function subscribe(onChange: () => void) {
  window.addEventListener('finesse-theme-change', onChange)
  return () => window.removeEventListener('finesse-theme-change', onChange)
}

function toDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('imageRead'))
    reader.onerror = () => reject(new Error('imageRead'))
    reader.readAsDataURL(blob)
  })
}

async function compressImage(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('imageType')
  if (file.size > maxInputBytes) throw new Error('imageSize')

  const bitmap = await createImageBitmap(file)
  try {
    let width = Math.min(bitmap.width, 1920)
    let height = Math.round(bitmap.height * width / bitmap.width)
    if (height > 1200) {
      height = 1200
      width = Math.round(bitmap.width * height / bitmap.height)
    }
    const canvas = document.createElement('canvas')
    let blob: Blob | null = null
    for (let attempt = 0; attempt < 5; attempt += 1) {
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('imageProcess')
      context.drawImage(bitmap, 0, 0, width, height)
      blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.78 - attempt * 0.08))
      if (blob && blob.size <= 1_250_000) break
      width = Math.round(width * 0.8)
      height = Math.round(height * 0.8)
    }
    if (!blob || blob.size > 1_250_000) throw new Error('imageSize')
    const dataUrl = await toDataUrl(blob)
    if (dataUrl.length > maxStoredLength) throw new Error('imageSize')
    return dataUrl
  } finally {
    bitmap.close()
  }
}

export default function WallpaperPicker() {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const wallpaper = useSyncExternalStore(subscribe, window.finesseTheme.getWallpaper)
  const [error, setError] = useState<WallpaperError | ''>('')
  const [busy, setBusy] = useState(false)
  const custom = wallpaper !== null

  async function selectFile(file?: File) {
    if (!file) return
    setError('')
    setBusy(true)
    try {
      const dataUrl = await compressImage(file)
      try {
        localStorage.setItem('finesse-wallpaper', dataUrl)
      } catch {
        throw new Error('wallpaperStorage')
      }
      window.finesseTheme.setWallpaper(dataUrl)
    } catch (reason) {
      const errorKeys: WallpaperError[] = ['imageType', 'imageSize', 'imageProcess', 'imageRead', 'wallpaperStorage']
      const key = reason instanceof Error && errorKeys.includes(reason.message as WallpaperError)
        ? reason.message as WallpaperError
        : 'imageProcess'
      setError(key)
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setError('')
    try {
      localStorage.removeItem('finesse-wallpaper')
    } catch {
      setError('wallpaperStorage')
      return
    }
    window.finesseTheme.setWallpaper(null)
  }

  return <div className="wallpaper-setting">
    <div className="wallpaper-preview" style={{ backgroundImage: `linear-gradient(var(--wallpaper-tint), var(--wallpaper-tint)), url("${wallpaper ?? defaultWallpaper}")` }} role="img" aria-label={custom ? t('customWallpaperPreview') : t('defaultWallpaperPreview')}>
      <span><Image size={15} />{custom ? t('customWallpaper') : t('defaultWallpaper')}</span>
    </div>
    <div className="wallpaper-actions">
      <input ref={inputRef} className="wallpaper-file-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label={t('uploadWallpaper')} onChange={event => { void selectFile(event.target.files?.[0]); event.target.value = '' }} />
      <button type="button" className="secondary-btn wallpaper-button" onClick={() => inputRef.current?.click()} disabled={busy}>
        <Upload size={14} />{busy ? t('processingWallpaper') : t('uploadWallpaper')}
      </button>
      <button type="button" className="secondary-btn wallpaper-button" onClick={reset} disabled={!custom || busy}>
        <RotateCcw size={14} />{t('resetWallpaper')}
      </button>
    </div>
    <p className="wallpaper-help">{t('wallpaperDescription')}</p>
    {error && <p className="wallpaper-error" role="alert">{t(error)}</p>}
  </div>
}
