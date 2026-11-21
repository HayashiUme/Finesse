import { useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { LoaderCircle, LockKeyhole, Wifi, X } from 'lucide-react'
import { loadServerRegistry, removeServer, saveServerRegistry, upsertServer } from './connections'
import { errorMessage } from './i18n'
import { ConnectionFields, Modal, ServerSetup } from './ConnectionUI'
import ServersPage from './ServersPage'
import SettingsPage from './SettingsPage'
import ServerWorkspace from './ServerWorkspace'
import LoginPage from './LoginPage'
import AccountSettings from './AccountSettings'
import AppShell from './AppShell'
import { AuthProvider, useAuth } from './auth'
import type { Connection, SavedServer, ServerRegistry, WorkspaceView } from './types'

const emptyConnection: Connection = { name: '', baseUrl: 'http://127.0.0.1:8097' }

export default function App() {
  return <AuthProvider><Dashboard /></AuthProvider>
}

function Dashboard() {
  const { t } = useTranslation()
  const auth = useAuth()
  const queryClient = useQueryClient()
  const [registry, setRegistry] = useState(loadServerRegistry)
  const [view, setView] = useState<WorkspaceView | 'settings' | 'servers' | 'account' | 'login'>(registry.activeServerId ? 'dashboard' : 'servers')
  const [editor, setEditor] = useState<{ id?: string; value: Connection } | null>(null)
  const [removing, setRemoving] = useState<SavedServer | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const current = registry.servers.find(server => server.id === registry.activeServerId) ?? null

  function persist(next: ServerRegistry) { saveServerRegistry(next); setRegistry(next) }

  function select(server: SavedServer) {
    try { persist({ ...registry, activeServerId: server.id }); setView('dashboard'); setError(null) }
    catch (failure) { setError(failure instanceof Error ? failure : new Error(String(failure))) }
  }

  async function save(value: Connection, verify: boolean, id?: string) {
    if (saving.current) return
    saving.current = true
    setBusy(true); setError(null)
    try {
      let next = upsertServer(registry, value, id)
      const server = id ? next.servers.find(s => s.id === id)! : next.servers[next.servers.length - 1]
      if (verify) next = { ...next, activeServerId: server.id }
      if (id && registry.servers.find(saved => saved.id === id)?.baseUrl !== server.baseUrl) auth.forget(id)
      persist(next)
      if (id) {
        await queryClient.cancelQueries({ predicate: query => (query.queryKey[1] as SavedServer | undefined)?.id === id })
        queryClient.removeQueries({ predicate: query => (query.queryKey[1] as SavedServer | undefined)?.id === id })
      }
      setEditor(null); setView(verify ? 'dashboard' : 'servers')
    } catch (failure) { setError(failure instanceof Error ? failure : new Error(String(failure))) }
    finally { saving.current = false; setBusy(false) }
  }

  async function forget(server: SavedServer) {
    try {
      auth.forget(server.id)
      persist(removeServer(registry, server.id))
      await queryClient.cancelQueries({ predicate: query => (query.queryKey[1] as SavedServer | undefined)?.id === server.id })
      queryClient.removeQueries({ predicate: query => (query.queryKey[1] as SavedServer | undefined)?.id === server.id })
      setRemoving(null); setView('servers'); setError(null)
    } catch (failure) { setError(failure instanceof Error ? failure : new Error(String(failure))) }
  }

  const shell = {
    servers: registry.servers, current, view, onSelect: select,
    onNavigate: (next: WorkspaceView) => setView(next), onSettings: () => setView('settings'), onAccount: () => setView('account'), onDirectory: () => setView('servers'),
    onAdd: () => { setError(null); setEditor({ value: emptyConnection }) },
    onEdit: (server: SavedServer) => { setError(null); setEditor({ id: server.id, value: server }) },
  }

  const activeSession = current ? auth.sessions[current.id] : null
  const connection = useMemo(() => current && activeSession ? { ...current, token: activeSession.token } : null, [current, activeSession?.token])
  const renderedShell = !activeSession && view !== 'servers' && view !== 'settings' ? { ...shell, view: 'login' as const } : shell

  if (!registry.servers.length) return <ServerSetup initial={emptyConnection} error={error ? errorMessage(error) : ''} busy={busy} onConnect={value => void save(value, true)} onSave={value => void save(value, false)} />

  if (auth.checking) return <div className="auth-loading"><LoaderCircle className="spin" /> {t('checkingSession')}</div>
  return <>{view === 'servers' || !current
    ? <ServersPage {...shell} onRemove={server => { setError(null); setRemoving(server) }} />
    : view === 'settings'
      ? <SettingsPage {...shell} connection={connection ?? undefined} />
      : !connection
        ? <LoginPage {...renderedShell} key={current.id} server={current} />
        : view === 'account'
          ? <AppShell {...shell} onRefresh={() => {}}><AccountSettings key={`${current.id}:${activeSession!.user.id}`} server={current} /></AppShell>
          : <ServerWorkspace {...shell} key={current.id} connection={connection} view={view === 'login' ? 'dashboard' : view} />}
    {editor && <Modal title={t(editor.id ? 'editServer' : 'addServer')} onClose={() => { if (!busy) { setEditor(null); setError(null) } }}><form onSubmit={event => { event.preventDefault(); void save(editor.value, true, editor.id) }}><p className="modal-copy">{t('serverEditorDescription')}</p><fieldset disabled={busy}><ConnectionFields value={editor.value} onChange={value => setEditor({ ...editor, value })} /></fieldset><div className="security-note"><LockKeyhole size={15} /><span>{t('localStorageNote')}</span></div>{error && <div className="setup-error" role="alert">{errorMessage(error)}</div>}<div className="modal-actions"><button type="button" className="secondary-btn" disabled={busy} onClick={() => void save(editor.value, false, editor.id)}>{t('saveForLater')}</button><button className="primary-btn" disabled={busy}>{busy ? <LoaderCircle className="spin" size={15} /> : <Wifi size={15} />}{t(busy ? 'testingConnection' : 'testAndSave')}</button></div></form></Modal>}
    {removing && <Modal title={t('removeNamedServer', { name: removing.name })} onClose={() => { setRemoving(null); setError(null) }}><p className="modal-copy">{t('removeServerNote')}</p><code className="removing-address">{removing.baseUrl}</code>{error && <div className="setup-error" role="alert">{errorMessage(error)}</div>}<div className="modal-actions"><button className="secondary-btn" onClick={() => setRemoving(null)}>{t('cancel')}</button><button className="danger-btn" onClick={() => void forget(removing)}>{t('removeConnection')}</button></div></Modal>}
    {error && !editor && !removing && <div className="toast" role="alert"><span>{errorMessage(error)}</span><button className="icon-btn" aria-label={t('dismiss')} onClick={() => setError(null)}><X size={15} /></button></div>}
  </>
}
