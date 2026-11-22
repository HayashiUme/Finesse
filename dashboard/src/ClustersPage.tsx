import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRightLeft, Check, Gamepad2, Plus, RefreshCw, Server, ShieldAlert, Trash2, Users } from 'lucide-react'
import AppShell, { type ShellProps } from './AppShell'
import { errorMessage, LocalizedError } from './i18n'
import { fetchSnapshot, gameAction, playerAction, sendMessage } from './api'
import { useAuth } from './auth'
import type { Game, Player, SavedServer, Snapshot } from './types'
import './clusters.css'

type ServerGroup = { id: string; name: string; serverIds: string[] }
type ServerState = { status: 'checking' | 'ready' | 'signedOut' | 'unavailable'; snapshot?: Snapshot; error?: string; checkedAt?: number }
type Result = { id: string; status: 'success' | 'partial' | 'skipped' | 'failed'; detail: string }
type Operation = 'broadcast' | 'kick' | 'ban' | 'privacy' | 'close'

const storageKey = 'finesse-server-groups-v1'
const operationCapabilities = {
  broadcast: ['broadcast'], kick: ['playerModeration'], ban: ['playerModeration'],
  privacy: ['roomManagement'], close: ['roomManagement'],
} as const
const finesseCapabilities = new Set(['broadcast', 'playerModeration', 'roomManagement'])
const resultLabelKey = { success: 'clusterResultSuccess', partial: 'clusterResultPartial', skipped: 'clusterResultSkipped', failed: 'clusterResultFailed' } as const
const operationLabelKey = { broadcast: 'clusterBroadcast', kick: 'kickPlayer', ban: 'banPlayer', privacy: 'clusterPrivacy', close: 'clearRoom' } as const

function loadGroups(): ServerGroup[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? localStorage.getItem('finesse-clusters-v1') ?? '[]')
    if (!Array.isArray(value)) return []
    return value.flatMap((item): ServerGroup[] => {
      if (!item || typeof item.id !== 'string' || typeof item.name !== 'string' || !Array.isArray(item.serverIds)) return []
      const serverIds = [...new Set((item.serverIds as unknown[]).filter((id): id is string => typeof id === 'string'))]
      return item.id && item.name.trim() ? [{ id: item.id, name: item.name.trim(), serverIds }] : []
    })
  } catch { return [] }
}

function saveGroups(value: ServerGroup[]) {
  try { localStorage.setItem(storageKey, JSON.stringify(value)) }
  catch { throw new LocalizedError('errorStorage') }
}

function targetMissing(error: unknown) {
  return error instanceof LocalizedError && error.key === 'clusterTargetMissing'
}

export default function ClustersPage(props: ShellProps) {
  const { t } = useTranslation()
  const auth = useAuth()
  const [groups, setGroups] = useState(loadGroups)
  const [selectedId, setSelectedId] = useState(groups[0]?.id ?? '')
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [members, setMembers] = useState<string[]>([])
  const [editing, setEditing] = useState(false)
  const [storageError, setStorageError] = useState('')
  const [operation, setOperation] = useState<Operation>('broadcast')
  const [message, setMessage] = useState('')
  const [kickReason, setKickReason] = useState('')
  const [publicRoom, setPublicRoom] = useState(true)
  const [serverStates, setServerStates] = useState<Record<string, ServerState>>({})
  const [loadingTargets, setLoadingTargets] = useState(false)
  const [playerTargets, setPlayerTargets] = useState<Record<string, string>>({})
  const [roomTargets, setRoomTargets] = useState<Record<string, string>>({})
  const [results, setResults] = useState<Result[]>([])
  const [running, setRunning] = useState(false)

  const selectedGroup = groups.find(group => group.id === selectedId) ?? null
  const selectedServers = useMemo(() => (selectedGroup?.serverIds ?? []).map(id => props.servers.find(server => server.id === id)).filter((server): server is SavedServer => Boolean(server)), [selectedGroup, props.servers])
  const sessionStamp = selectedServers.map(server => `${server.id}:${auth.sessions[server.id]?.token ?? ''}`).join('|')
  const availableOperations = (Object.keys(operationCapabilities) as Operation[]).filter(action => operationCapabilities[action].every(capability => finesseCapabilities.has(capability)))

  function persist(next: ServerGroup[]) {
    try {
      saveGroups(next)
      setGroups(next)
      setStorageError('')
      if (!next.some(group => group.id === selectedId)) setSelectedId(next[0]?.id ?? '')
      return true
    } catch (error) {
      setStorageError(errorMessage(error))
      return false
    }
  }

  function edit(group?: ServerGroup) {
    setEditing(true)
    setEditingId(group?.id ?? null)
    setName(group?.name ?? '')
    setMembers(group?.serverIds ?? [])
  }

  function save() {
    const cleanName = name.trim()
    const serverIds = [...new Set(members.filter(id => props.servers.some(server => server.id === id)))]
    if (!cleanName || serverIds.length < 2) return
    const next = editingId
      ? groups.map(group => group.id === editingId ? { ...group, name: cleanName, serverIds } : group)
      : [...groups, { id: crypto.randomUUID(), name: cleanName, serverIds }]
    if (persist(next)) {
      setSelectedId(editingId ?? next[next.length - 1].id)
      setEditing(false)
      setEditingId(null)
    }
  }

  const refreshTargets = useCallback(async () => {
    setLoadingTargets(true)
    const checkedAt = Date.now()
    setServerStates(previous => Object.fromEntries(selectedServers.map(server => [server.id, { ...previous[server.id], status: 'checking' as const }])))
    const entries = await Promise.all(selectedServers.map(async server => {
      const session = auth.sessions[server.id]
      if (!session) return [server.id, { status: 'signedOut', checkedAt } as ServerState] as const
      try {
        const snapshot = await fetchSnapshot({ ...server, token: session.token })
        return [server.id, { status: 'ready', snapshot, checkedAt } as ServerState] as const
      } catch (error) {
        return [server.id, { status: 'unavailable', error: errorMessage(error), checkedAt } as ServerState] as const
      }
    }))
    setServerStates(previous => ({ ...previous, ...Object.fromEntries(entries) }))
    setLoadingTargets(false)
  }, [selectedServers, sessionStamp, auth.sessions])

  useEffect(() => { void refreshTargets() }, [refreshTargets])

  async function run() {
    if (!selectedGroup || running || !availableOperations.includes(operation)) return
    if (operation === 'broadcast' && !message.trim()) return
    if (['ban', 'close'].includes(operation) && !window.confirm(t(operation === 'ban' ? 'clusterConfirmBan' : 'clusterConfirmClose'))) return

    setRunning(true)
    setResults([])
    const settled = await Promise.all(selectedServers.map(async server => {
      const state = serverStates[server.id]
      const session = auth.sessions[server.id]
      if (!session) return { id: server.id, status: 'failed' as const, detail: t('clusterSignedOut') }
      const connection = { ...server, token: session.token }
      try {
        if (operation === 'broadcast') {
          const response = await sendMessage(connection, message.trim())
          const status = response.failed > 0 ? (response.delivered > 0 ? 'partial' : 'failed') : response.delivered > 0 ? 'success' : 'skipped'
          return { id: server.id, status, detail: t('clusterBroadcastResult', response) } as Result
        }

        if (state?.status !== 'ready' || !state.snapshot) {
          return { id: server.id, status: 'failed' as const, detail: state?.error ?? t(state?.status === 'signedOut' ? 'clusterSignedOut' : 'clusterDataUnavailable') }
        }

        if (operation === 'kick' || operation === 'ban') {
          const rawId = playerTargets[server.id]
          const player = state.snapshot.players.find(candidate => String(candidate.clientId) === rawId)
          if (!player) return { id: server.id, status: 'skipped' as const, detail: t('clusterNoTarget') }
          await playerAction(connection, player.clientId, operation, operation === 'kick' ? kickReason.trim() : undefined)
        } else {
          const code = roomTargets[server.id]
          const room = state.snapshot.games.find(candidate => candidate.code === code && !['Ended', 'Destroyed'].includes(candidate.state))
          if (!room) return { id: server.id, status: 'skipped' as const, detail: t('clusterNoTarget') }
          await gameAction(connection, room.code, operation, operation === 'privacy' ? publicRoom : undefined)
        }
        return { id: server.id, status: 'success' as const, detail: t('clusterSuccess') }
      } catch (error) {
        return { id: server.id, status: targetMissing(error) ? 'skipped' as const : 'failed' as const, detail: errorMessage(error) }
      }
    }))
    setResults(settled)
    setRunning(false)
    await refreshTargets()
  }

  const readyCount = selectedServers.filter(server => serverStates[server.id]?.status === 'ready').length
  const readyPlayers = selectedServers.reduce((count, server) => count + (serverStates[server.id]?.snapshot?.players.length ?? 0), 0)
  const readyRooms = selectedServers.reduce((count, server) => count + (serverStates[server.id]?.snapshot?.games.filter(game => !['Ended', 'Destroyed'].includes(game.state)).length ?? 0), 0)
  const lastChecked = selectedServers.reduce<number | undefined>((latest, server) => {
    const checkedAt = serverStates[server.id]?.checkedAt
    return checkedAt && (!latest || checkedAt > latest) ? checkedAt : latest
  }, undefined)

  return <AppShell {...props} view="clusters" current={null} onRefresh={() => void refreshTargets()}>
    <div className="page-heading"><div><div className="eyebrow"><span className="pulse-mini" />{t('clusterEyebrow')}</div><h1>{t('navClusters')}</h1><p>{t('clusterDescription')}</p></div><div className="heading-actions"><span className="cluster-last-check">{t('clusterReadiness', { ready: readyCount, total: selectedServers.length })}{lastChecked ? ` · ${t('clusterLastChecked', { time: new Date(lastChecked).toLocaleTimeString() })}` : ''}</span><button className="secondary-btn" onClick={() => void refreshTargets()} disabled={loadingTargets}><RefreshCw size={15} className={loadingTargets ? 'spin' : ''} />{t('refresh')}</button><button className="primary-btn" onClick={() => edit()}><Plus size={15} />{t('clusterCreate')}</button></div></div>
    {storageError && <div className="setup-error" role="alert">{storageError}</div>}
    {editing && <section className="cluster-editor"><div className="section-head"><div><h2>{t(editingId ? 'clusterEdit' : 'clusterCreate')}</h2><p>{t('clusterEditorHint')}</p></div></div><label className="cluster-name-field">{t('clusterName')}<input value={name} onChange={event => setName(event.target.value)} maxLength={48} /></label><div className="cluster-server-picker">{props.servers.map(server => <label key={server.id}><input type="checkbox" checked={members.includes(server.id)} onChange={event => setMembers(event.target.checked ? [...members, server.id] : members.filter(id => id !== server.id))} /><span><b>{server.name}</b><small>{server.baseUrl}</small></span></label>)}</div><div className="cluster-editor-actions"><button className="secondary-btn" onClick={() => setEditing(false)}>{t('cancel')}</button><button className="primary-btn" disabled={!name.trim() || new Set(members).size < 2} onClick={save}>{t('save')}</button></div></section>}
    {!groups.length ? <div className="empty-state cluster-empty"><ArrowRightLeft size={24} /><span>{t('clusterEmpty')}</span></div> : <>
      <section className="cluster-summary" aria-label={t('clusterSummary')}><div><b>{groups.length}</b><span>{t('clusterGroups')}</span></div><div><b>{readyCount}<small> / {selectedServers.length}</small></b><span>{t('clusterConnected')}</span></div><div><b>{readyPlayers}</b><span>{t('onlinePlayers')}</span></div><div><b>{readyRooms}</b><span>{t('activeGames')}</span></div></section>
      <p className="cluster-provider-note"><Server size={15} />{t('clusterProviderNote')}</p>
      <div className="cluster-layout"><section className="cluster-list"><div className="section-head"><div><h2>{t('clusterGroups')}</h2><p>{t('clusterGroupsHint')}</p></div></div>{groups.map(group => {
        const count = group.serverIds.filter(id => props.servers.some(server => server.id === id)).length
        return <button key={group.id} className={`cluster-group ${selectedId === group.id ? 'selected' : ''}`} onClick={() => { setSelectedId(group.id); setEditing(false); setResults([]) }}><span className="cluster-group-icon"><Server size={17} /></span><span><b>{group.name}</b><small>{t('clusterServerCount', { count })}</small></span>{selectedId === group.id && <Check size={16} />}</button>
      })}</section>
      <section className="cluster-workspace"><div className="cluster-workspace-head"><div><h2>{selectedGroup?.name}</h2><p>{t('clusterSelectedCount', { count: selectedServers.length })}</p></div><div className="cluster-tools"><button className="tool-btn" title={t('clusterEdit')} onClick={() => selectedGroup && edit(selectedGroup)}><ArrowRightLeft size={15} /></button><button className="tool-btn" title={t('clusterDelete')} onClick={() => selectedGroup && persist(groups.filter(group => group.id !== selectedGroup.id))}><Trash2 size={15} /></button></div></div>
        <div className="cluster-operation-bar"><label>{t('clusterOperation')}<select value={operation} onChange={event => { setOperation(event.target.value as Operation); setResults([]) }}>{availableOperations.map(action => <option key={action} value={action}>{t(operationLabelKey[action])}</option>)}</select></label>{operation === 'broadcast' && <label className="cluster-wide-field">{t('messageContent')}<input maxLength={250} value={message} onChange={event => setMessage(event.target.value)} /></label>}{operation === 'kick' && <label className="cluster-wide-field">{t('kickReason')}<input maxLength={200} value={kickReason} onChange={event => setKickReason(event.target.value)} placeholder={t('kickReasonOptional')} /></label>}{operation === 'privacy' && <label>{t('clusterVisibility')}<select value={publicRoom ? 'public' : 'private'} onChange={event => setPublicRoom(event.target.value === 'public')}><option value="public">{t('publicRoom')}</option><option value="private">{t('privateRoom')}</option></select></label>}<button className="primary-btn" disabled={running || !selectedServers.length || (operation === 'broadcast' && !message.trim())} onClick={() => void run()}>{running ? t('clusterRunning') : t('clusterRun')}</button></div>
        {['kick', 'ban'].includes(operation) && <div className="cluster-targets"><h3><Users size={16} />{t('clusterPlayerTargets')}</h3>{selectedServers.map(server => <label key={server.id}><span>{server.name}</span><select value={playerTargets[server.id] ?? ''} disabled={serverStates[server.id]?.status !== 'ready'} onChange={event => { setPlayerTargets({ ...playerTargets, [server.id]: event.target.value }); setResults([]) }}><option value="">{t(serverStates[server.id]?.status === 'ready' ? 'clusterSkipTarget' : serverStates[server.id]?.status === 'signedOut' ? 'clusterSignedOut' : 'clusterDataUnavailable')}</option>{serverStates[server.id]?.snapshot?.players.map((player: Player) => <option key={player.clientId} value={player.clientId}>{player.name} · #{player.clientId}</option>)}</select></label>)}</div>}
        {['privacy', 'close'].includes(operation) && <div className="cluster-targets"><h3><Gamepad2 size={16} />{t('clusterRoomTargets')}</h3>{selectedServers.map(server => <label key={server.id}><span>{server.name}</span><select value={roomTargets[server.id] ?? ''} disabled={serverStates[server.id]?.status !== 'ready'} onChange={event => { setRoomTargets({ ...roomTargets, [server.id]: event.target.value }); setResults([]) }}><option value="">{t(serverStates[server.id]?.status === 'ready' ? 'clusterSkipTarget' : serverStates[server.id]?.status === 'signedOut' ? 'clusterSignedOut' : 'clusterDataUnavailable')}</option>{serverStates[server.id]?.snapshot?.games.filter(game => !['Ended', 'Destroyed'].includes(game.state)).map((game: Game) => <option key={game.code} value={game.code}>{game.code} · {game.hostName ?? t('unknown')}</option>)}</select></label>)}</div>}
        <div className="cluster-server-results">{selectedServers.map(server => {
          const state = serverStates[server.id]
          return <div className="cluster-server-row" key={server.id}><span className="cluster-server-icon"><Server size={15} /></span><span className="cluster-server-name"><b>{server.name}</b><small>{server.baseUrl}</small></span><span className="cluster-server-metrics">{state?.snapshot ? t('clusterServerCounts', { players: state.snapshot.players.length, rooms: state.snapshot.games.filter(game => !['Ended', 'Destroyed'].includes(game.state)).length }) : state?.status === 'unavailable' ? state.error : '—'}</span>{state?.status === 'ready' ? <span className="cluster-auth signed">{t('clusterReady')}</span> : state?.status === 'checking' ? <span className="cluster-auth"><RefreshCw size={12} className="spin" />{t('checkingServer')}</span> : <button className="secondary-btn cluster-sign-in" onClick={() => props.onSelect(server)}>{state?.status === 'unavailable' ? t('clusterUnavailable') : t('clusterSignIn')}</button>}</div>
        })}</div>
        {results.length > 0 && <div className="cluster-results"><h3><ShieldAlert size={16} />{t('clusterResults')}</h3><div className="cluster-result-summary">{(['success', 'partial', 'skipped', 'failed'] as const).map(status => <span key={status} className={status}>{t(resultLabelKey[status])} <b>{results.filter(result => result.status === status).length}</b></span>)}</div>{results.map(result => <div className={`cluster-result ${result.status}`} key={result.id}><b>{props.servers.find(server => server.id === result.id)?.name}</b><span>{t(resultLabelKey[result.status])}</span><small>{result.detail}</small></div>)}</div>}
      </section></div>
    </>}
  </AppShell>
}
