import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { LoaderCircle, LockKeyhole, Wifi, X } from 'lucide-react'
import { fetchSnapshot } from './api'
import { loadServerRegistry, removeServer, saveServerRegistry, upsertServer } from './connections'
import { errorMessage } from './i18n'
import { ConnectionFields, Modal, ServerSetup } from './ConnectionUI'
import ServersPage from './ServersPage'
import ServerWorkspace from './ServerWorkspace'
import type { Connection, SavedServer, ServerRegistry, WorkspaceView } from './types'

const emptyConnection: Connection = { name: '', baseUrl: 'http://127.0.0.1:8097', apiKey: '' }

export default function App() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [registry, setRegistry] = useState(loadServerRegistry)
  const [view, setView] = useState<WorkspaceView | 'servers'>(registry.activeServerId ? 'overview' : 'servers')
  const [editor, setEditor] = useState<{ id?: string; value: Connection } | null>(null)
  const [removing, setRemoving] = useState<SavedServer | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const abort = useRef<AbortController>()
  useEffect(() => () => abort.current?.abort(), [])
  const current = registry.servers.find(server => server.id === registry.activeServerId) ?? null

  function persist(next: ServerRegistry) { saveServerRegistry(next); setRegistry(next) }

  function select(server: SavedServer) {
    try { persist({ ...registry, activeServerId: server.id }); setView('overview'); setError(null) }
    catch (failure) { setError(failure instanceof Error ? failure : new Error(String(failure))) }
  }

  async function save(value: Connection, verify: boolean, id?: string) {
    if (saving.current) return
    saving.current = true; setBusy(true); setError(null)
    try {
      let next = upsertServer(registry, value, id)
      const server = id ? next.servers.find(s => s.id === id)! : next.servers[next.servers.length - 1]
      abort.current = new AbortController()
      const snapshot = verify ? await fetchSnapshot(server, abort.current.signal) : null
      if (verify) next = { ...next, activeServerId: server.id }
      persist(next)
      if (id) {
        await queryClient.cancelQueries({ predicate: query => (query.queryKey[1] as SavedServer | undefined)?.id === id })
        queryClient.removeQueries({ predicate: query => (query.queryKey[1] as SavedServer | undefined)?.id === id })
      }
      if (snapshot) queryClient.setQueryData(['snapshot', server], snapshot)
      setEditor(null); setView(verify ? 'overview' : 'servers')
    } catch (failure) { if (!abort.current?.signal.aborted) setError(failure instanceof Error ? failure : new Error(String(failure))) }
    finally { saving.current = false; setBusy(false) }
  }

  async function forget(server: SavedServer) {
    try {
      persist(removeServer(registry, server.id))
      await queryClient.cancelQueries({ predicate: query => (query.queryKey[1] as SavedServer | undefined)?.id === server.id })
      queryClient.removeQueries({ predicate: query => (query.queryKey[1] as SavedServer | undefined)?.id === server.id })
      setRemoving(null); setView('servers'); setError(null)
    } catch (failure) { setError(failure instanceof Error ? failure : new Error(String(failure))) }
  }

  const shell = {
    servers: registry.servers, current, view, onSelect: select,
    onNavigate: (next: WorkspaceView) => setView(next), onDirectory: () => setView('servers'),
    onAdd: () => { setError(null); setEditor({ value: emptyConnection }) },
    onEdit: (server: SavedServer) => { setError(null); setEditor({ id: server.id, value: server }) },
  }

  if (!registry.servers.length) return <ServerSetup initial={emptyConnection} error={error ? errorMessage(error) : ''} busy={busy} onConnect={value => void save(value, true)} onSave={value => void save(value, false)} />

  return <>{view === 'servers' || !current
    ? <ServersPage {...shell} onRemove={server => { setError(null); setRemoving(server) }} />
    : <ServerWorkspace {...shell} key={JSON.stringify(current)} connection={current} view={view} />}
    {editor && <Modal title={t(editor.id ? 'editServer' : 'addServer')} onClose={() => { if (!busy) { setEditor(null); setError(null) } }}><form onSubmit={event => { event.preventDefault(); void save(editor.value, true, editor.id) }}><p className="modal-copy">{t('serverEditorDescription')}</p><fieldset disabled={busy}><ConnectionFields value={editor.value} onChange={value => setEditor({ ...editor, value })} /></fieldset><div className="security-note"><LockKeyhole size={15} /><span>{t('localStorageNote')}</span></div>{error && <div className="setup-error" role="alert">{errorMessage(error)}</div>}<div className="modal-actions"><button type="button" className="secondary-btn" disabled={busy} onClick={() => void save(editor.value, false, editor.id)}>{t('saveForLater')}</button><button className="primary-btn" disabled={busy}>{busy ? <LoaderCircle className="spin" size={15} /> : <Wifi size={15} />}{t(busy ? 'testingConnection' : 'testAndSave')}</button></div></form></Modal>}
    {removing && <Modal title={t('removeNamedServer', { name: removing.name })} onClose={() => { setRemoving(null); setError(null) }}><p className="modal-copy">{t('removeServerNote')}</p><code className="removing-address">{removing.baseUrl}</code>{error && <div className="setup-error" role="alert">{errorMessage(error)}</div>}<div className="modal-actions"><button className="secondary-btn" onClick={() => setRemoving(null)}>{t('cancel')}</button><button className="danger-btn" onClick={() => void forget(removing)}>{t('removeConnection')}</button></div></Modal>}
    {error && !editor && !removing && <div className="toast" role="alert"><span>{errorMessage(error)}</span><button className="icon-btn" aria-label={t('dismiss')} onClick={() => setError(null)}><X size={15} /></button></div>}
  </>
}
