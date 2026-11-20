import { useEffect, useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Command, LockKeyhole, Server, ShieldCheck, Wifi, WifiOff, LoaderCircle, X } from 'lucide-react'
import ThemeSwitcher from './ThemeSwitcher'
import LanguageSwitcher from './LanguageSwitcher'
import type { Connection } from './types'

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
  return <main className="setup-screen"><div className="setup-top"><div className="brand-mark"><Command size={19} /></div><strong>finesse</strong><span>{t('brandManagement')}</span><div className="setup-appearance"><ThemeSwitcher /><LanguageSwitcher /></div></div><div className="setup-layout">
    <section className="setup-intro"><div className="setup-emblem"><Server size={25} /></div><div className="setup-kicker">{t('controlPlane')}</div><h1><Trans i18nKey="setupTitle" /></h1><p>{t('setupDescription')}</p><div className="setup-checks"><div><span><Wifi size={14} /></span><div><b>{t('setupLive')}</b><small>{t('setupLiveDescription')}</small></div></div><div><span><ShieldCheck size={14} /></span><div><b>{t('setupActions')}</b><small>{t('setupActionsDescription')}</small></div></div></div></section>
    <form className="setup-form" onSubmit={e => { e.preventDefault(); onConnect(form) }}><div className="setup-form-head"><div><span className="setup-kicker">{t('addServer')}</span><h2>{t('serverConnection')}</h2></div><span className="setup-step">PLUGIN API · V1</span></div><fieldset disabled={busy}><ConnectionFields value={form} onChange={setForm} /></fieldset><ConfigHelp />{error && <div className="setup-error" role="alert"><WifiOff size={15} /><span>{error}</span></div>}<button className="primary-btn setup-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Wifi size={16} />}{t(busy ? 'verifyingConnection' : 'testAndAdd')}</button><button type="button" className="secondary-btn setup-submit" disabled={busy} onClick={() => onSave(form)}>{t('saveForLater')}</button><div className="setup-foot"><LockKeyhole size={13} />{t('localStorageNote')}</div></form>
    </div><footer className="setup-footer"><span>FINESSE</span><span>{t('setupFooter')}</span></footer></main>
}

export function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const { t } = useTranslation()
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.focus()
    return () => { document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus() }
  }, [])
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}><section ref={panel} tabIndex={-1} className="settings-modal" role="dialog" aria-modal="true" aria-label={title} onKeyDown={e => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'Tab') {
      const nodes = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [href]') ?? []).filter(node => !node.closest('fieldset:disabled'))
      const first = nodes[0], last = nodes[nodes.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { e.preventDefault(); first?.focus() }
    }
  }}><div className="modal-head"><div><span className="modal-kicker">{t('footerBrand')}</span><h2>{title}</h2></div><button className="icon-btn" onClick={onClose} title={t('close')} aria-label={t('close')}><X size={18} /></button></div>{children}</section></div>
}

