import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Braces, Clipboard, Copy, FileCode2, Globe2, KeyRound, LoaderCircle, LockKeyhole, Plus, Save, Shield, Trash2, Upload, Workflow, X } from 'lucide-react'
import { createInterfaceApiKey, deleteHelloPage, deleteInterfaceApiKey, fetchInterfaceSettings, fetchXApiPreview, saveHelloPage, updateXApiSettings, type CreatedInterfaceApiKey, type XApiSettings } from './api'
import { errorMessage, type TranslationKey } from './i18n'
import type { Connection } from './types'
import { Modal } from './ConnectionUI'
import './interface.css'

const scopeNames = { games: 'interfaceScopeGames', monitor: 'interfaceScopeMonitor', 'x-api-games': 'interfaceScopeXApi' } as const
const initialXApi: XApiSettings = { enabled: true, includePrivateGames: false, regionId: 'us', regionName: 'United States', regionUrl: '', helloPageEnabled: false }
type Tab = 'keys' | 'endpoints' | 'xapi' | 'welcome'
type Preview = { title: string; content: React.ReactNode }

export default function InterfacePage({ connection, canManage }: { connection: Connection; canManage: boolean }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [tab, setTab] = useState<Tab>('keys')
  const [keyName, setKeyName] = useState('')
  const [scopes, setScopes] = useState<string[]>(['games'])
  const [createdKey, setCreatedKey] = useState<CreatedInterfaceApiKey | null>(null)
  const [xApiDraft, setXApiDraft] = useState<XApiSettings | null>(null)
  const [html, setHtml] = useState('')
  const [pageError, setPageError] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const settings = useQuery({ queryKey: ['interface', connection], queryFn: ({ signal }) => fetchInterfaceSettings(connection, signal), enabled: canManage, retry: false })
  const xApiPreview = useQuery({ queryKey: ['interface-xapi-preview', connection], queryFn: ({ signal }) => fetchXApiPreview(connection, signal), enabled: canManage, retry: false })
  const xApi = xApiDraft ?? settings.data?.xApi ?? initialXApi
  const refresh = () => client.invalidateQueries({ queryKey: ['interface', connection] })
  const createKey = useMutation({ mutationFn: () => createInterfaceApiKey(connection, keyName, scopes), onSuccess: key => { setCreatedKey(key); setKeyName(''); void refresh() } })
  const removeKey = useMutation({ mutationFn: (id: string) => deleteInterfaceApiKey(connection, id), onSuccess: refresh })
  const saveXApi = useMutation({ mutationFn: () => updateXApiSettings(connection, xApi), onSuccess: saved => { setXApiDraft(saved); void refresh(); void client.invalidateQueries({ queryKey: ['interface-xapi-preview', connection] }) } })
  const saveHtml = useMutation({ mutationFn: () => saveHelloPage(connection, html), onSuccess: () => { setHtml(''); setPageError(null); void refresh() } })
  const removeHtml = useMutation({ mutationFn: () => deleteHelloPage(connection), onSuccess: () => { setHtml(''); void refresh() } })
  const error = settings.error ?? xApiPreview.error ?? createKey.error ?? removeKey.error ?? saveXApi.error ?? saveHtml.error ?? removeHtml.error

  function toggleScope(scope: string) { setScopes(current => current.includes(scope) ? current.filter(item => item !== scope) : [...current, scope]) }
  async function importHtml(file?: File) {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.html') || file.size > 512_000) { setPageError(t('interfaceHtmlInvalid')); return }
    setHtml(await file.text()); setPageError(null)
  }
  function persistHtml() {
    if (new TextEncoder().encode(html).byteLength > 512_000) { setPageError(t('interfaceHtmlTooLarge')); return }
    saveHtml.mutate()
  }
  function showJsonPreview(title: string, content: unknown) {
    setPreview({ title, content: <pre className="interface-preview-json">{JSON.stringify(content, null, 2)}</pre> })
  }

  const gamesExample = { totalGames: 1, totalPlayers: 2, games: [{ code: 'ABCDEF', codeInt: 123456, state: 'NotStarted', isPublic: true, playerCount: 2, maxPlayers: 15, map: 'TheSkeld', impostors: 1, host: 'Player', hostFriendCode: 'FRIEND-CODE', players: [{ name: 'Player', friendCode: 'FRIEND-CODE', isHost: true, platform: 'Steam' }] }] }
  const monitorExample = { status: 'running', timestamp: new Date(0).toISOString(), uptimeSeconds: 3600, uptimeDisplay: '0d 1h 0m', version: '0.1.0', runtime: '.NET 10', platform: 'Windows', processors: 8, memoryMb: 128, gameCount: 1, playerCount: 2, activeConnections: 2, games: [{ code: 'ABCDEF', state: 'NotStarted', map: 'TheSkeld', playerCount: 2, host: 'Player' }] }
  const xApiExample = { games: [], regions: [{ id: xApi.regionId, name: xApi.regionName, url: xApi.regionUrl || 'http://127.0.0.1:8097' }] }

  const tabs: { id: Tab; label: TranslationKey; icon: typeof KeyRound }[] = [
    { id: 'keys', label: 'interfaceTabKeys', icon: KeyRound },
    { id: 'endpoints', label: 'interfaceTabEndpoints', icon: Braces },
    { id: 'xapi', label: 'interfaceTabXApi', icon: Globe2 },
    { id: 'welcome', label: 'interfaceTabWelcome', icon: FileCode2 },
  ]

  return <div className="interface-page">
    <nav className="interface-tabs" aria-label={t('navInterface')} role="tablist">{tabs.map(({ id, label, icon: Icon }) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon size={16} /><span>{t(label, { defaultValue: label })}</span>{id === 'keys' && <em>{settings.data?.apiKeys.length ?? 0}</em>}</button>)}</nav>
    {!canManage && <section className="interface-card"><div className="interface-card-empty"><LockKeyhole size={19} /><span>{t('interfaceSuperAdminOnly')}</span></div></section>}

    {canManage && tab === 'keys' && <>
      <section className="interface-card"><div className="interface-card-heading"><span className="interface-card-icon"><KeyRound size={17} /></span><div><h2>{t('interfaceKeysTitle')}</h2><p>{t('interfaceKeysDescription')}</p></div></div>
        <form className="interface-key-form" onSubmit={event => { event.preventDefault(); createKey.mutate() }}>
          <label className="field-label">{t('interfaceKeyName')}<input value={keyName} maxLength={64} onChange={event => setKeyName(event.target.value)} placeholder={t('interfaceKeyNamePlaceholder')} required /></label>
          <fieldset className="interface-scopes"><legend>{t('interfaceKeyScopes')}</legend>{Object.entries(scopeNames).filter(([scope]) => scope !== 'x-api-games').map(([scope, label]) => <label key={scope}><input type="checkbox" checked={scopes.includes(scope)} onChange={() => toggleScope(scope)} /><span>{t(label)}</span><code>{scope === 'games' ? '/v2/api/games' : '/v2/api/monitor'}</code></label>)}</fieldset>
          <button className="primary-btn" disabled={createKey.isPending || !keyName.trim() || scopes.length === 0}>{createKey.isPending ? <LoaderCircle className="spin" size={15} /> : <Plus size={15} />}{t('interfaceCreateKey')}</button>
        </form>
      </section>
      <section className="interface-card"><div className="interface-card-heading"><span className="interface-card-icon"><Shield size={17} /></span><div><h2>{t('interfaceKeyList')}</h2><p>{t('interfaceKeyListDescription')}</p></div></div>
        {settings.isPending ? <div className="interface-card-empty"><LoaderCircle className="spin" size={17} />{t('checkingServer')}</div> : settings.data?.apiKeys.length ? <div className="interface-key-grid">{settings.data.apiKeys.map(key => <article className="interface-key-card" key={key.id}><div className="interface-key-card-top"><div><b>{key.name}</b><code>{key.prefix}…</code></div><button className="icon-btn" title={t('interfaceRevokeKey')} aria-label={t('interfaceRevokeKey')} disabled={removeKey.isPending} onClick={() => { if (window.confirm(t('interfaceRevokeConfirm', { name: key.name }))) removeKey.mutate(key.id) }}><Trash2 size={15} /></button></div><div className="interface-key-scopes">{key.scopes.map(scope => <span key={scope}>{t(scopeNames[scope as keyof typeof scopeNames])}</span>)}</div><small>{t('interfaceKeyCreatedAt')} {new Date(key.createdAt).toLocaleDateString()}</small></article>)}</div> : <div className="interface-card-empty"><KeyRound size={19} /><span>{t('interfaceNoKeys')}</span></div>}
      </section>
      <div className="interface-note"><LockKeyhole size={15} /><span>{t('interfaceKeyOneTime')}</span></div>
    </>}

    {canManage && tab === 'endpoints' && <>
      <section className="interface-card"><div className="interface-card-heading"><span className="interface-card-icon"><Workflow size={17} /></span><div><h2>{t('interfaceEndpointsTitle')}</h2><p>{t('interfaceEndpointsDescription')}</p></div></div>
        <div className="interface-endpoint-grid">
          <EndpointCard title="Games" path="/v2/api/games" scope="games" description={t('interfaceGamesSummary')} onPreview={() => showJsonPreview('GET /v2/api/games', gamesExample)} />
          <EndpointCard title="Monitor" path="/v2/api/monitor" scope="monitor" description={t('interfaceMonitorSummary')} onPreview={() => showJsonPreview('GET /v2/api/monitor', monitorExample)} />
          <EndpointCard title="X-API games" path="/x-api/games" scope="public" description={t('interfaceXApiSummary')} onPreview={() => showJsonPreview('GET /x-api/games', xApiPreview.data ?? xApiExample)} />
        </div>
      </section>
      <section className="interface-card"><div className="interface-card-heading"><span className="interface-card-icon"><LockKeyhole size={17} /></span><div><h2>{t('interfaceCallingTitle')}</h2><p>{t('interfaceCallingDescription')}</p></div></div><pre className="interface-request-example">curl -H "X-Api-Key: sk-…" http://127.0.0.1:8097/v2/api/games</pre></section>
    </>}

    {canManage && tab === 'xapi' && <>
      <section className="interface-card"><div className="interface-card-heading"><span className="interface-card-icon"><Globe2 size={17} /></span><div><h2>{t('interfaceXApiTitle')}</h2><p>{t('interfaceXApiDescription')}</p></div><span className={`interface-state ${xApi.enabled ? 'enabled' : ''}`}><i />{t(xApi.enabled ? 'interfaceEnabled' : 'interfaceDisabled')}</span></div>
        <form className="interface-settings-form" onSubmit={event => { event.preventDefault(); saveXApi.mutate() }}>
          <label className="interface-toggle"><input type="checkbox" checked={xApi.enabled} onChange={event => setXApiDraft({ ...xApi, enabled: event.target.checked })} /><span><b>{t('interfaceXApiEnabled')}</b><small>{t('interfaceXApiEnabledDescription')}</small></span></label>
          <label className="interface-toggle"><input type="checkbox" checked={xApi.includePrivateGames} onChange={event => setXApiDraft({ ...xApi, includePrivateGames: event.target.checked })} /><span><b>{t('interfaceIncludePrivate')}</b><small>{t('interfaceIncludePrivateDescription')}</small></span></label>
          <div className="interface-form-grid"><label className="field-label">{t('interfaceRegionId')}<input value={xApi.regionId} maxLength={32} onChange={event => setXApiDraft({ ...xApi, regionId: event.target.value })} required /></label><label className="field-label">{t('interfaceRegionName')}<input value={xApi.regionName} maxLength={80} onChange={event => setXApiDraft({ ...xApi, regionName: event.target.value })} required /></label><label className="field-label">{t('interfaceRegionUrl')}<input type="url" value={xApi.regionUrl} maxLength={512} onChange={event => setXApiDraft({ ...xApi, regionUrl: event.target.value })} placeholder="https://server.example" /></label></div>
          <div className="interface-form-actions"><button className="primary-btn" disabled={saveXApi.isPending}>{saveXApi.isPending ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}{t('save')}</button><button type="button" className="secondary-btn" onClick={() => setPreview({ title: t('interfaceLiveContent'), content: <pre className="interface-preview-json">{JSON.stringify(xApiPreview.data ?? xApiExample, null, 2)}</pre> })}><Clipboard size={15} />{t('interfacePreview')}</button></div>
        </form>
      </section>
    </>}

    {canManage && tab === 'welcome' && <section className="interface-card"><div className="interface-card-heading"><span className="interface-card-icon"><FileCode2 size={17} /></span><div><h2>{t('interfaceHelloTitle')}</h2><p>{t('interfaceHelloDescription')}</p></div><span className={`interface-state ${settings.data?.helloPageEnabled ? 'enabled' : ''}`}><i />{t(settings.data?.helloPageEnabled ? 'interfaceHelloInstalled' : 'interfaceHelloDefault')}</span></div>
      <div className="interface-hello-toolbar"><label className="secondary-btn"><Upload size={15} />{t('interfaceImportHtml')}<input type="file" accept=".html,text/html" onChange={event => { void importHtml(event.target.files?.[0]); event.currentTarget.value = '' }} /></label><span>{html ? t('interfaceHtmlReady') : t('interfaceHtmlPlaceholderShort')}</span></div>
      <textarea className="interface-html-editor" value={html} onChange={event => setHtml(event.target.value)} maxLength={512_000} placeholder={t('interfaceHtmlPlaceholder')} spellCheck={false} />
      {pageError && <div className="setup-error">{pageError}</div>}
      <div className="interface-form-actions"><button className="primary-btn" disabled={!html || saveHtml.isPending} onClick={persistHtml}>{saveHtml.isPending ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}{t('interfaceSaveHtml')}</button><button className="secondary-btn" disabled={!html} onClick={() => setPreview({ title: t('interfacePreview'), content: <iframe className="interface-preview-frame" title={t('interfacePreview')} sandbox="" srcDoc={html} /> })}><Globe2 size={15} />{t('interfacePreview')}</button><button className="danger-btn" disabled={!settings.data?.helloPageEnabled || removeHtml.isPending} onClick={() => { if (window.confirm(t('interfaceRemoveHtmlConfirm'))) removeHtml.mutate() }}><X size={15} />{t('interfaceRemoveHtml')}</button></div>
    </section>}

    {error && <div className="setup-error" role="alert">{errorMessage(error)}</div>}
    {createdKey && <Modal title={t('interfaceKeyCreated')} onClose={() => setCreatedKey(null)}><p className="modal-copy">{t('interfaceKeyOneTime')}</p><code className="interface-secret">{createdKey.secret}</code><div className="modal-actions"><button className="primary-btn" onClick={() => void navigator.clipboard.writeText(createdKey.secret)}><Copy size={15} />{t('copy')}</button><button className="secondary-btn" onClick={() => setCreatedKey(null)}>{t('close')}</button></div></Modal>}
    {preview && <Modal title={preview.title} className="interface-preview-modal" onClose={() => setPreview(null)}><div className="interface-preview-body">{preview.content}</div><div className="modal-actions"><button className="secondary-btn" onClick={() => setPreview(null)}>{t('close')}</button></div></Modal>}
  </div>
}

function EndpointCard({ title, path, scope, description, onPreview }: { title: string; path: string; scope: string; description: string; onPreview: () => void }) {
  const { t } = useTranslation()
  const scopeLabel = scope === 'public' ? 'interfacePublic' : scopeNames[scope as keyof typeof scopeNames]
  return <article className="interface-endpoint-card"><div className="interface-endpoint-top"><span className="interface-method">GET</span><span className="interface-endpoint-scope">{t(scopeLabel)}</span></div><h3>{title}</h3><code className="interface-endpoint-path">{path}</code><p>{description}</p><button className="secondary-btn" onClick={onPreview}><Braces size={14} />{t('interfacePreview')}</button></article>
}
