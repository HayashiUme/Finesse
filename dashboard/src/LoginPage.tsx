import { MotionContent, Presence, TabBar } from './Motion'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, LoaderCircle, LockKeyhole, Server, ShieldCheck } from 'lucide-react'
import type { ShellProps } from './AppShell'
import { ConfigHelp, Modal } from './ConnectionUI'
import LanguageSwitcher from './LanguageSwitcher'
import ThemeSwitcher from './ThemeSwitcher'
import { hasSecureTransport, LoginError, login } from './api'
import { useAuth } from './auth'
import { errorMessage } from './i18n'
import type { AuthChallenge, SavedServer } from './types'
import BrandLogo from './BrandLogo'

export default function LoginPage({ server, servers, onSelect, onDirectory }: ShellProps & { server: SavedServer }) {
  const { t } = useTranslation()
  const auth = useAuth()
  const [mode, setMode] = useState<'admin' | 'superadmin'>('admin')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [answer, setAnswer] = useState('')
  const [challenge, setChallenge] = useState<AuthChallenge>()
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [help, setHelp] = useState(false)
  const secureTransport = hasSecureTransport(server)
  const [lockedUntil, setLockedUntil] = useState(0)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { if (!lockedUntil) return; const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer) }, [lockedUntil])
  const remaining = Math.max(0, Math.ceil((lockedUntil - now) / 1000))

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy || remaining || !secureTransport) return
    setBusy(true); setError(null)
    try {
      const credentials = mode === 'superadmin' ? { apiKey: apiKey.trim() } : { username, password }
      const result = await login(server, mode, { ...credentials, captchaId: challenge?.id, captchaAnswer: answer })
      setPassword(''); setApiKey(''); setAnswer('')
      auth.signedIn(server, result.session, result.login)
    } catch (failure) {
      setError(failure)
      if (failure instanceof LoginError) { setChallenge(failure.challenge); setAnswer(''); if (failure.retryAfterSeconds) { setNow(Date.now()); setLockedUntil(Date.now() + failure.retryAfterSeconds * 1000) } }
    } finally { setBusy(false) }
  }
  return <main className="login-screen">
    <header className="login-top"><div className="brand"><div className="brand-mark"><BrandLogo /></div><div><strong>Finesse</strong><span>{t('brandControl')}</span></div></div><div className="login-appearance"><ThemeSwitcher /><LanguageSwitcher /><button className="help-circle" title={t('help')} aria-label={t('help')} onClick={() => setHelp(true)}>?</button></div></header>
    <div className="login-stage"><section className="auth-card" aria-labelledby="login-title">
      <button className="login-back" onClick={onDirectory}><ArrowLeft size={15} />{t('backToServers')}</button>
      <div className="setup-emblem"><LockKeyhole size={25} /></div><h1 id="login-title">{t('signIn')}</h1><p className="modal-copy">{t('signInDescription', { name: server.name })}</p>
      <label className="login-server field-label"><span><Server size={14} />{t('switchServer')}</span><select value={server.id} onChange={event => { const selected = servers.find(item => item.id === event.target.value); if (selected) onSelect(selected) }}>{servers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><small>{server.baseUrl}</small></label>
      <TabBar selectionKey={mode} className="auth-tabs" role="group" aria-label={t('loginMethod')}><button disabled={busy} aria-pressed={mode === 'admin'} className={mode === 'admin' ? 'active' : ''} onClick={() => { setMode('admin'); setPassword(''); setApiKey(''); setError(null) }}>{t('adminLogin')}</button><button disabled={busy} aria-pressed={mode === 'superadmin'} className={mode === 'superadmin' ? 'active' : ''} onClick={() => { setMode('superadmin'); setPassword(''); setApiKey(''); setError(null) }}>{t('superAdminLogin')}</button></TabBar>
      {!secureTransport && <div className="setup-error" role="alert">{t('errorSecureTransport')}</div>}
      <MotionContent motionKey={mode}><form onSubmit={submit}><fieldset disabled={busy || remaining > 0 || !secureTransport}>
        {mode === 'admin' ? <><label className="field-label">{t('username')}<input required autoComplete="username" maxLength={32} value={username} onChange={event => setUsername(event.target.value)} /></label><label className="field-label">{t('password')}<input required type="password" autoComplete="current-password" maxLength={256} value={password} onChange={event => setPassword(event.target.value)} /></label></> : <label className="field-label">{t('apiKey')}<input required type="password" autoComplete="off" maxLength={4096} placeholder={t('apiKeyPlaceholder')} value={apiKey} onChange={event => setApiKey(event.target.value)} /></label>}
        {challenge && <label className="field-label">{t('captcha')} · {challenge.prompt}<input required inputMode="numeric" autoComplete="off" maxLength={8} value={answer} onChange={event => setAnswer(event.target.value)} /></label>}
      </fieldset>{error != null && <div className="setup-error" role="alert">{error instanceof LoginError ? t(error.code === 'captchaInvalid' ? 'captchaInvalid' : error.code === 'lockedOut' ? 'lockedOut' : 'invalidCredentials') : errorMessage(error)}</div>}{remaining > 0 && <p role="status">{t('retryAfter', { seconds: remaining })}</p>}<button className="primary-btn setup-submit" disabled={busy || remaining > 0 || !secureTransport}>{busy ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />}{t('signIn')}</button></form></MotionContent><p className="account-hint">{t('sessionNote')}</p>
    </section></div><Presence>{help && <Modal title={t('helpTitle')} onClose={() => setHelp(false)}><ConfigHelp /><p className="modal-copy">{t('originNote')}</p></Modal>}</Presence>
  </main>
}
