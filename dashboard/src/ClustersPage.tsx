import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRightLeft, Check, Plus, RefreshCw, Server, Trash2, Users, Gamepad2, ShieldAlert } from 'lucide-react'
import AppShell, { type ShellProps } from './AppShell'
import { errorMessage, LocalizedError } from './i18n'
import { gameAction, fetchSnapshot, playerAction, sendMessage } from './api'
import { useAuth } from './auth'
import type { Game, Player, SavedServer } from './types'
import './clusters.css'

type Cluster = { id: string; name: string; serverIds: string[] }
type Result = { id: string; status: 'success' | 'skipped' | 'failed'; detail: string }
type Operation = 'broadcast' | 'kick' | 'ban' | 'privacy' | 'close'
const storageKey = 'finesse-clusters-v1'

function loadClusters(): Cluster[] {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    return Array.isArray(value) ? value.filter((item): item is Cluster => item && typeof item.id === 'string' && typeof item.name === 'string' && Array.isArray(item.serverIds)) : []
  } catch { return [] }
}

function saveClusters(value: Cluster[]) { localStorage.setItem(storageKey, JSON.stringify(value)) }

export default function ClustersPage(props: ShellProps) {
  const { t } = useTranslation()
  const auth = useAuth()
  const [clusters, setClusters] = useState(loadClusters)
  const [selectedId, setSelectedId] = useState(clusters[0]?.id ?? '')
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [members, setMembers] = useState<string[]>([])
  const [editing, setEditing] = useState(false)
  const [operation, setOperation] = useState<Operation>('broadcast')
  const [message, setMessage] = useState('')
  const [publicRoom, setPublicRoom] = useState(true)
  const [snapshots, setSnapshots] = useState<Record<string, { players: Player[]; games: Game[] }>>({})
  const [loadingTargets, setLoadingTargets] = useState(false)
  const [playerTargets, setPlayerTargets] = useState<Record<string, string>>({})
  const [roomTargets, setRoomTargets] = useState<Record<string, string>>({})
  const [results, setResults] = useState<Result[]>([])
  const [running, setRunning] = useState(false)
  const current = clusters.find(item => item.id === selectedId) ?? null
  const selectedServers = useMemo(() => (current?.serverIds ?? []).map(id => props.servers.find(server => server.id === id)).filter((server): server is SavedServer => Boolean(server)), [current, props.servers])

  function persist(next: Cluster[]) {
    saveClusters(next)
    setClusters(next)
    if (!next.some(item => item.id === selectedId)) setSelectedId(next[0]?.id ?? '')
  }

  function edit(cluster?: Cluster) {
    setEditing(true); setEditingId(cluster?.id ?? null); setName(cluster?.name ?? ''); setMembers(cluster?.serverIds ?? [])
  }

  function save() {
    const cleanName = name.trim()
    if (!cleanName || members.length < 2) return
    const next = editingId
      ? clusters.map(item => item.id === editingId ? { ...item, name: cleanName, serverIds: members } : item)
      : [...clusters, { id: crypto.randomUUID(), name: cleanName, serverIds: members }]
    persist(next); setSelectedId(editingId ?? next[next.length - 1].id); setEditing(false); setEditingId(null)
  }

  useEffect(() => {
    let cancelled = false
    if (!selectedServers.length) { setSnapshots({}); return }
    setLoadingTargets(true)
    void Promise.all(selectedServers.map(async server => {
      const session = auth.sessions[server.id]
      if (!session) return [server.id, null] as const
      try { const data = await fetchSnapshot({ ...server, token: session.token }); return [server.id, { players: data.players, games: data.games }] as const }
      catch { return [server.id, null] as const }
    })).then(entries => {
      if (!cancelled) {
        const next: Record<string, { players: Player[]; games: Game[] }> = {}
        for (const [id, value] of entries) if (value) next[id] = value
        setSnapshots(next)
      }
    })
      .finally(() => { if (!cancelled) setLoadingTargets(false) })
    return () => { cancelled = true }
  }, [selectedId, selectedServers.map(server => server.id).join(','), auth.sessions])

  async function refreshTargets() {
    setLoadingTargets(true)
    const entries = await Promise.all(selectedServers.map(async server => {
      const session = auth.sessions[server.id]
      if (!session) return [server.id, null] as const
      try { const data = await fetchSnapshot({ ...server, token: session.token }); return [server.id, { players: data.players, games: data.games }] as const }
      catch { return [server.id, null] as const }
    }))
    setSnapshots(Object.fromEntries(entries.filter((entry): entry is readonly [string, { players: Player[]; games: Game[] }] => entry[1] !== null)))
    setLoadingTargets(false)
  }

  async function run() {
    if (!current || running) return
    if (operation === 'broadcast' && !message.trim()) return
    if (['ban', 'close'].includes(operation) && !window.confirm(t(operation === 'ban' ? 'clusterConfirmBan' : 'clusterConfirmClose'))) return
    setRunning(true); setResults([])
    const settled = await Promise.all(selectedServers.map(async server => {
      const session = auth.sessions[server.id]
      if (!session) return { id: server.id, status: 'failed' as const, detail: t('clusterSignedOut') }
      const connection = { ...server, token: session.token }
      try {
        if (operation === 'broadcast') {
          const result = await sendMessage(connection, message.trim())
          return { id: server.id, status: result.failed ? 'failed' as const : result.delivered ? 'success' as const : 'skipped' as const, detail: t('clusterBroadcastResult', result) }
        }
        else if (operation === 'kick' || operation === 'ban') {
          const playerId = playerTargets[server.id]
          if (!playerId) return { id: server.id, status: 'skipped' as const, detail: t('clusterNoTarget') }
          await playerAction(connection, Number(playerId), operation)
        } else {
          const code = roomTargets[server.id]
          if (!code) return { id: server.id, status: 'skipped' as const, detail: t('clusterNoTarget') }
          await gameAction(connection, code, operation, operation === 'privacy' ? publicRoom : undefined)
        }
        return { id: server.id, status: 'success' as const, detail: t('clusterSuccess') }
      } catch (error) {
        const missing = error instanceof LocalizedError && error.key === 'clusterTargetMissing'
        return { id: server.id, status: missing ? 'skipped' as const : 'failed' as const, detail: errorMessage(error) }
      }
    }))
    setResults(settled); setRunning(false); void refreshTargets()
  }

  return <AppShell {...props} view="clusters" onRefresh={() => void refreshTargets()}>
    <div className="page-heading"><div><div className="eyebrow"><span className="pulse-mini" />{t('clusterEyebrow')}</div><h1>{t('navClusters')}</h1><p>{t('clusterDescription')}</p></div><div className="heading-actions"><button className="secondary-btn" onClick={() => void refreshTargets()} disabled={loadingTargets}><RefreshCw size={15} />{t('refresh')}</button><button className="primary-btn" onClick={() => edit()}><Plus size={15} />{t('clusterCreate')}</button></div></div>
    {editing && <section className="cluster-editor"><div className="section-head"><div><h2>{current && name ? t('clusterEdit') : t('clusterCreate')}</h2><p>{t('clusterEditorHint')}</p></div></div><label className="cluster-name-field">{t('clusterName')}<input value={name} onChange={event => setName(event.target.value)} maxLength={48} /></label><div className="cluster-server-picker">{props.servers.map(server => <label key={server.id}><input type="checkbox" checked={members.includes(server.id)} onChange={event => setMembers(event.target.checked ? [...members, server.id] : members.filter(id => id !== server.id))} /><span><b>{server.name}</b><small>{server.baseUrl}</small></span></label>)}</div><div className="cluster-editor-actions"><button className="secondary-btn" onClick={() => setEditing(false)}>{t('cancel')}</button><button className="primary-btn" disabled={!name.trim() || members.length < 2} onClick={save}>{t('save')}</button></div></section>}
    {!clusters.length ? <div className="empty-state cluster-empty"><ArrowRightLeft size={24} /><span>{t('clusterEmpty')}</span></div> : <>
      <div className="cluster-layout"><section className="cluster-list"><div className="section-head"><div><h2>{t('clusterGroups')}</h2><p>{t('clusterGroupsHint')}</p></div></div>{clusters.map(cluster => <button key={cluster.id} className={`cluster-group ${selectedId === cluster.id ? 'selected' : ''}`} onClick={() => { setSelectedId(cluster.id); setEditing(false); setResults([]) }}><span className="cluster-group-icon"><Server size={17} /></span><span><b>{cluster.name}</b><small>{t('clusterServerCount', { count: cluster.serverIds.length })}</small></span>{selectedId === cluster.id && <Check size={16} />}</button>)}</section>
      <section className="cluster-workspace"><div className="cluster-workspace-head"><div><h2>{current?.name}</h2><p>{t('clusterSelectedCount', { count: selectedServers.length })}</p></div><div className="cluster-tools"><button className="tool-btn" title={t('clusterEdit')} onClick={() => current && edit(current)}><ArrowRightLeft size={15} /></button><button className="tool-btn" title={t('clusterDelete')} onClick={() => current && persist(clusters.filter(item => item.id !== current.id))}><Trash2 size={15} /></button></div></div>
        <div className="cluster-operation-bar"><label>{t('clusterOperation')}<select value={operation} onChange={event => { setOperation(event.target.value as Operation); setResults([]) }}><option value="broadcast">{t('clusterBroadcast')}</option><option value="kick">{t('kickPlayer')}</option><option value="ban">{t('banPlayer')}</option><option value="privacy">{t('clusterPrivacy')}</option><option value="close">{t('clearRoom')}</option></select></label>{operation === 'broadcast' && <label className="cluster-wide-field">{t('messageContent')}<input maxLength={250} value={message} onChange={event => setMessage(event.target.value)} /></label>}{operation === 'privacy' && <label>{t('clusterVisibility')}<select value={publicRoom ? 'public' : 'private'} onChange={event => setPublicRoom(event.target.value === 'public')}><option value="public">{t('publicRoom')}</option><option value="private">{t('privateRoom')}</option></select></label>}<button className="primary-btn" disabled={running || !selectedServers.length || (operation === 'broadcast' && !message.trim())} onClick={() => void run()}>{running ? t('clusterRunning') : t('clusterRun')}</button></div>
        {['kick', 'ban'].includes(operation) && <div className="cluster-targets"><h3><Users size={16} />{t('clusterPlayerTargets')}</h3>{selectedServers.map(server => <label key={server.id}><span>{server.name}</span><select value={playerTargets[server.id] ?? ''} onChange={event => setPlayerTargets({ ...playerTargets, [server.id]: event.target.value })}><option value="">{snapshots[server.id] ? t('clusterSkipTarget') : t('clusterDataUnavailable')}</option>{snapshots[server.id]?.players.map(player => <option key={player.clientId} value={player.clientId}>{player.name} (#{player.clientId})</option>)}</select></label>)}</div>}
        {['privacy', 'close'].includes(operation) && <div className="cluster-targets"><h3><Gamepad2 size={16} />{t('clusterRoomTargets')}</h3>{selectedServers.map(server => <label key={server.id}><span>{server.name}</span><select value={roomTargets[server.id] ?? ''} onChange={event => setRoomTargets({ ...roomTargets, [server.id]: event.target.value })}><option value="">{snapshots[server.id] ? t('clusterSkipTarget') : t('clusterDataUnavailable')}</option>{snapshots[server.id]?.games.filter(game => game.state !== 'Ended' && game.state !== 'Destroyed').map(game => <option key={game.code} value={game.code}>{game.code} · {game.hostName ?? t('unknown')}</option>)}</select></label>)}</div>}
        <div className="cluster-server-results">{selectedServers.map(server => <div className="cluster-server-row" key={server.id}><span className="cluster-server-icon"><Server size={15} /></span><span className="cluster-server-name"><b>{server.name}</b><small>{server.baseUrl}</small></span>{auth.sessions[server.id] ? <span className="cluster-auth signed">{t('clusterReady')}</span> : <button className="secondary-btn cluster-sign-in" onClick={() => props.onSelect(server)}>{t('clusterSignIn')}</button>}</div>)}</div>
        {results.length > 0 && <div className="cluster-results"><h3><ShieldAlert size={16} />{t('clusterResults')}</h3>{results.map(result => <div className={`cluster-result ${result.status}`} key={result.id}><b>{props.servers.find(server => server.id === result.id)?.name}</b><span>{t(result.status === 'success' ? 'clusterResultSuccess' : result.status === 'skipped' ? 'clusterResultSkipped' : 'clusterResultFailed')}</span><small>{result.detail}</small></div>)}</div>}
      </section></div>
    </>}
  </AppShell>
}
