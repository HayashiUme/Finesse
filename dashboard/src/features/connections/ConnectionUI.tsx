import { useEffect, useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { LockKeyhole, Wifi, WifiOff, LoaderCircle, X } from 'lucide-react'
import ThemeSwitcher from '../settings/ThemeSwitcher.tsx'
import LanguageSwitcher from '../settings/LanguageSwitcher.tsx'
import type { Connection } from '../../types/types.ts'
import BrandLogo from '../../components/BrandLogo.tsx'
import { createPortal } from 'react-dom'
import { useIsPresent } from '../../components/Motion.tsx'

export function ConnectionFields({ value, onChange }: { value: Connection; onChange: (value: Connection) => void }) {
  const { t } = useTranslation()
  return <><label className="field-label">{t('serverName')}<input autoComplete="off" required maxLength={80} value={value.name} onChange={e => onChange({ ...value, name: e.target.value })} placeholder={t('serverNamePlaceholder')} /></label><label className="field-label">{t('pluginUrl')}<input type="url" autoComplete="url" required value={value.baseUrl} onChange={e => onChange({ ...value, baseUrl: e.target.value })} placeholder="http://127.0.0.1:8097" /></label></>
}

export function ConfigHelp() {
  const { t } = useTranslation()
  return <div className="setup-config-hint"><span className="hint-line" /><div><b>{t('firstSetup')}</b><p><Trans i18nKey="helpInstall" components={{ code: <code /> }} /></p><p><Trans i18nKey="helpKey" components={{ code: <code /> }} /></p><p><Trans i18nKey="helpMissing" components={{ code: <code /> }} /></p></div></div>
}

export function ServerSetup({ initial, error, busy, onConnect, onSave }: { initial: Connection; error: string; busy: boolean; onConnect: (connection: Connection) => void; onSave: (connection: Connection) => void }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(initial)
  return <main className="setup-screen"><div className="setup-top"><div className="brand-mark"><BrandLogo /></div><strong>Finesse</strong><div className="setup-appearance"><ThemeSwitcher /><LanguageSwitcher /></div></div><div className="setup-layout">
    <form className="setup-form" onSubmit={e => { e.preventDefault(); onConnect(form) }}><div className="setup-form-head"><div><h2>{t('serverConnection')}</h2></div></div><fieldset disabled={busy}><ConnectionFields value={form} onChange={setForm} /></fieldset><ConfigHelp />{error && <div className="setup-error" role="alert"><WifiOff size={15} /><span>{error}</span></div>}<button className="primary-btn setup-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Wifi size={16} />}{t(busy ? 'verifyingConnection' : 'testAndAdd')}</button><button type="button" className="secondary-btn setup-submit" disabled={busy} onClick={() => onSave(form)}>{t('saveForLater')}</button><div className="setup-foot"><LockKeyhole size={13} />{t('localStorageNote')}</div></form>
    </div></main>
}

export function Modal({ title, children, onClose, className }: { title: string; children: React.ReactNode; onClose: () => void; className?: string }) {
  const { t } = useTranslation()
  const present = useIsPresent()
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.focus()
    return () => { document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus() }
  }, [])
  return createPortal(<div className={`modal-backdrop ${className ? `${className}-backdrop` : ''} ${present ? 'is-entering' : 'is-exiting'}`} aria-hidden={!present || undefined} onMouseDown={e => { if (present && e.target === e.currentTarget) onClose() }}><section ref={panel} tabIndex={-1} className={`settings-modal ${className ?? ''}`} role="dialog" aria-modal="true" aria-label={title} onKeyDown={e => {
    if (!present) return
    if (e.key === 'Escape') onClose()
    if (e.key === 'Tab') {
      const nodes = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href]') ?? []).filter(node => !node.closest('fieldset:disabled'))
      const first = nodes[0], last = nodes[nodes.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { e.preventDefault(); first?.focus() }
    }
  }}><div className="modal-head"><div><h2>{title}</h2></div><button className="icon-btn" onClick={onClose} title={t('close')} aria-label={t('close')}><X size={18} /></button></div>{children}</section></div>, document.body)
}

