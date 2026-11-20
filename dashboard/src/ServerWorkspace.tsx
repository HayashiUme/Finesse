import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Activity, ArrowDownToLine, ArrowUpRight, Ban, ClipboardList, Gamepad2, Globe2, LoaderCircle, LogOut, RefreshCw, Search, Server, Settings2, ShieldCheck, Users, WifiOff, X } from 'lucide-react'
import { fetchAudit, fetchSnapshot, gameAction, playerAction, registerPanelLogin } from './api'
import { useRealtime } from './useRealtime'
import { errorMessage, LocalizedError, type TranslationKey } from './i18n'
import AppShell, { type WorkspaceProps } from './AppShell'
import { Modal } from './ConnectionUI'
import type { Game, PanelLogin, Player } from './types'

const titles = { dashboard: 'navDashboard', players: 'titlePlayers', games: 'titleGames', audit: 'navAudit' } as const
const filters = [{ id: 'all', label: 'filterAll' }, { id: 'lobby', label: 'lobby' }, { id: 'playing', label: 'playing' }] as const
type Filter = typeof filters[number]['id']
const gameStates: Record<string, Extract<TranslationKey, `state${string}`>> = { NotStarted: 'stateWaiting', Starting: 'stateStarting', Started: 'stateStarted', Ended: 'stateEnded', Destroyed: 'stateDestroyed' }
const actionNames: Record<string, Extract<TranslationKey, `action${string}`>> = { login: 'actionPanelLogin', kick: 'actionKick', ban: 'actionBan', privacy: 'actionPrivacy', close: 'actionClose' }
const auditDetails: Record<string, Extract<TranslationKey, `audit${string}`>> = {
  Completed: 'auditCompleted', 'Player not found': 'auditPlayerMissing', 'Room not found': 'auditRoomMissing',
  'Player must be in a room for a room ban': 'auditRoomRequired', 'Operation failed': 'auditFailed',
}

export default function ServerWorkspace({ connection, view, ...shell }: WorkspaceProps) {
  const { t, i18n } = useTranslation()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<Error | null>(null)
  const [panelLogin, setPanelLogin] = useState<PanelLogin | null>(null)
  const [loginInfoUnavailable, setLoginInfoUnavailable] = useState(false)
  const loginStarted = useRef(new Set<string>())
  const queryClient = useQueryClient()
  const live = useRealtime(connection, Boolean(connection))
  const query = useQuery({
    queryKey: ['snapshot', connection], queryFn: ({ signal }) => fetchSnapshot(connection, signal),
    enabled: Boolean(connection), retry: false, refetchInterval: live ? false : 1000,
  })
  const connected = Boolean(connection && query.isSuccess)
  const audit = useQuery({ queryKey: ['audit', connection], queryFn: ({ signal }) => fetchAudit(connection, signal), enabled: connected && (view === 'audit' || view === 'dashboard'), retry: false, refetchInterval: 1000 })

  useEffect(() => {
    if (!connected || !connection || loginStarted.current.has(connection.id)) return
    loginStarted.current.add(connection.id)
    const sessionKey = `finesse-panel-login:${connection.id}`
    try {
      if (window.sessionStorage.getItem(sessionKey)) return
      window.sessionStorage.setItem(sessionKey, 'pending')
    } catch { /* The in-memory guard still prevents duplicate requests before a reload. */ }
    void registerPanelLogin(connection).then(info => {
      try { window.sessionStorage.setItem(sessionKey, 'recorded') } catch { /* Keep the login visible for this page load. */ }
      setPanelLogin(info)
      void queryClient.invalidateQueries({ queryKey: ['audit', connection] })
    }).catch(() => {
      loginStarted.current.delete(connection.id)
      try { window.sessionStorage.removeItem(sessionKey) } catch { /* The login notice can still explain the failure. */ }
      setLoginInfoUnavailable(true)
      setPanelLogin({ ip: '', location: null, timestamp: new Date().toISOString() })
    })
  }, [connected, connection, queryClient])

  useEffect(() => {
    if (!panelLogin) return
    const timeout = window.setTimeout(() => setPanelLogin(null), 3000)
    return () => window.clearTimeout(timeout)
  }, [panelLogin])
  const players = query.data?.players ?? []
  const games = query.data?.games ?? []
  const selectedGame = games.find(g => g.code === selectedCode)
  const number = (value: number) => new Intl.NumberFormat(i18n.resolvedLanguage).format(value)
  const filteredPlayers = useMemo(() => players.filter(p => `${p.name} ${p.clientId} ${p.gameCode ?? ''}`.toLowerCase().includes(search.toLowerCase())), [players, search])
  const filteredGames = useMemo(() => games.filter(g => (filter === 'all' || (filter === 'playing' ? g.state === 'Started' : g.state === 'NotStarted')) && `${g.code} ${g.hostName ?? ''}`.toLowerCase().includes(view === 'games' ? search.toLowerCase() : '')), [games, filter, search, view])

  function formatUptime(seconds: number) {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return days ? t('uptimeDays', { days, hours }) : t('uptimeHours', { hours, minutes })
  }

  useEffect(() => { setSearch('') }, [view])

  async function perform(operation: () => Promise<void>, success: LocalizedError) {
    if (pending) return
    setPending(true)
    setNotice(null)
    try {
      await operation()
      setNotice(success)
      await Promise.all([query.refetch(), queryClient.invalidateQueries({ queryKey: ['audit', connection] })])
    } catch (error) { setNotice(error instanceof Error ? error : new LocalizedError('errorOperation')) }
    finally { setPending(false) }
  }

  function moderate(player: Player, action: 'kick' | 'ban') {
    if (!connected || !connection || pending) return
    if (window.confirm(t(action === 'kick' ? 'confirmKick' : 'confirmBan', { name: player.name }))) {
      void perform(() => playerAction(connection, player.clientId, action), new LocalizedError(action === 'kick' ? 'kickedPlayer' : 'bannedPlayer', { name: player.name }))
    }
  }

  function manageGame(game: Game, action: 'privacy' | 'close') {
    if (!connection || pending) return
    if (action === 'close' && !window.confirm(t('confirmClear', { code: game.code }))) return
    void perform(() => gameAction(connection, game.code, action, !game.isPublic), new LocalizedError(action === 'close' ? 'clearedRoom' : 'changedPrivacy'))
  }

  function exportPlayers() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(filteredPlayers, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url; link.download = 'finesse-players.json'; link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  if (query.isError || !query.data) {
    return <AppShell {...shell} current={connection} view={view} onRefresh={() => void query.refetch()}>
      <section className="connection-state" role="status"><div className="setup-emblem">{query.isError ? <WifiOff size={25} /> : <LoaderCircle className="spin" size={25} />}</div><h1>{connection.name}</h1><code>{connection.baseUrl}</code><h2>{t(query.isError ? 'serverUnavailable' : 'checkingServer')}</h2>{query.isError && <p>{errorMessage(query.error)}</p>}<div className="heading-actions"><button className="primary-btn" onClick={() => void query.refetch()} disabled={query.isFetching}>{t('refresh')}</button><button className="secondary-btn" onClick={() => shell.onEdit(connection)}>{t('settings')}</button><button className="secondary-btn" onClick={shell.onDirectory}>{t('navServers')}</button></div></section>
    </AppShell>
  }

  const data = query.data
  return <AppShell {...shell} current={connection} view={view} live={live} connected onRefresh={() => { void query.refetch(); if (view === 'audit') void audit.refetch() }}>

        <div className="page-heading"><div><div className="eyebrow"><span className="pulse-mini" />{t('serverManagement')}</div><h1>{t(titles[view])}</h1><p>{t(view === 'dashboard' ? (live ? 'liveDescription' : 'pollingDescription') : view === 'players' ? 'managePlayers' : view === 'games' ? 'manageGames' : 'auditDescription')}</p></div><div className="heading-actions">{view === 'dashboard' && <button className="secondary-btn" onClick={() => shell.onEdit(connection)}><Settings2 size={16} />{t('connectionSettings')}</button>}</div></div>

        {view === 'dashboard' && <DashboardHome data={data} audit={audit.data ?? []} auditLoading={audit.isPending} auditError={audit.isError} formatUptime={formatUptime} number={number} onPlayers={() => shell.onNavigate('players')} onGames={() => shell.onNavigate('games')} onAudit={() => shell.onNavigate('audit')} onRoom={setSelectedCode} />}

        {view === 'players' && <section className="stats-grid">
          <StatCard label={t('onlinePlayers')} value={number(data.onlinePlayers)} detail={t('allConnections')} icon={<Users size={18} />} accent="mint" />
          <StatCard label={t('activeGames')} value={number(data.activeGames)} detail={t('totalGames', { count: data.totalGames })} icon={<Gamepad2 size={18} />} accent="lilac" />
          <StatCard label={t('uptime')} value={formatUptime(data.uptimeSeconds)} detail={t('uptimeDescription')} icon={<Activity size={18} />} accent="amber" compact />
          <StatCard label={t('pluginVersion')} value={`v${data.pluginVersion}`} detail={t('apiVersion')} icon={<ShieldCheck size={18} />} accent="blue" compact />
        </section>}

        {view === 'players' && <section className="section-block">
          <div className="section-head"><div><div className="section-title"><h2>{t('navPlayers')}</h2><span className="count-tag">{number(players.length)}</span></div><p>{t('managePlayers')}</p></div><div className="table-tools"><label className="search-box"><Search size={15} /><input aria-label={t('searchPlayers')} value={search} onChange={e => setSearch(e.target.value)} placeholder={t('searchPlayersPlaceholder')} /></label><button className="tool-btn" title={t('exportPlayers')} aria-label={t('exportPlayers')} onClick={exportPlayers}><ArrowDownToLine size={16} /></button></div></div>
          <div className="table-wrap"><table><thead><tr><th>{t('player')}</th><th>{t('status')}</th><th>{t('room')}</th><th>{t('role')}</th><th className="actions-col">{t('actions')}</th></tr></thead><tbody>{filteredPlayers.map(player => <tr key={player.clientId}>
            <td><div className="player-cell"><div className={`player-avatar hue-${player.clientId % 5}`}>{player.name.slice(0, 1).toUpperCase()}</div><div><b>{player.name}</b><small>{t('clientId', { id: player.clientId })}</small></div></div></td>
            <td><span className={`status-chip ${player.inGame ? 'playing' : 'lobby'}`}><span />{t(player.inGame ? 'playing' : player.gameCode ? 'lobby' : 'connected')}</span></td>
            <td>{player.gameCode ? <button className="room-code" onClick={() => setSelectedCode(player.gameCode)}>{player.gameCode}</button> : <span className="muted-text">{t('noRoom')}</span>}</td>
            <td>{player.isHost ? <span className="role-chip host"><ShieldCheck size={13} />{t('host')}</span> : <span className="muted-text">{t('player')}</span>}</td>
            <td><div className="row-actions"><button disabled={pending} title={t('kickPlayer')} aria-label={t('kickPlayer')} onClick={() => moderate(player, 'kick')}><LogOut size={15} /></button><button disabled={pending || !player.gameCode} title={t('banPlayer')} aria-label={t('banPlayer')} onClick={() => moderate(player, 'ban')}><Ban size={15} /></button></div></td>
          </tr>)}</tbody></table>{filteredPlayers.length === 0 && <div className="empty-state"><Users size={24} /><span>{t(players.length ? 'noMatchingPlayers' : 'noOnlinePlayers')}</span></div>}</div>
          <div className="table-footer"><span>{t('playerFooter', { count: filteredPlayers.length })}</span><button onClick={() => query.refetch()}><RefreshCw size={13} />{t('refreshList')}</button></div>
        </section>}

        {view === 'games' && <section className="section-block games-block">
          <div className="section-head"><div><div className="section-title"><h2>{t('titleGames')}</h2><span className="count-tag">{number(games.length)}</span></div><p>{t('manageGames')}</p></div><div className="table-tools">{view === 'games' && <label className="search-box"><Search size={15} /><input aria-label={t('searchGames')} value={search} onChange={e => setSearch(e.target.value)} placeholder={t('searchGamesPlaceholder')} /></label>}<div className="segmented">{filters.map(item => <button key={item.id} className={filter === item.id ? 'selected' : ''} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{t(item.label)}</button>)}</div></div></div>
          <div className="games-grid">{filteredGames.map(game => <GameTile key={game.code} game={game} onSelect={() => setSelectedCode(game.code)} />)}</div>
          {filteredGames.length === 0 && <div className="empty-state"><Gamepad2 size={24} /><span>{t('noGames')}</span></div>}
        </section>}

        {view === 'audit' && <section className="section-block"><div className="section-head"><div><h2>{t('recentActions')}</h2><p>{t('auditDescription')}</p></div></div>{audit.isError ? <div className="setup-error">{errorMessage(audit.error)}</div> : audit.isPending ? <div className="empty-state">{t('loadingAudit')}</div> : <div className="table-wrap"><table><thead><tr><th>{t('time')}</th><th>{t('action')}</th><th>{t('target')}</th><th>{t('loginLocation')}</th><th>{t('result')}</th></tr></thead><tbody>{audit.data?.map((entry, index) => <tr key={`${entry.timestamp}-${index}`}><td>{new Date(entry.timestamp).toLocaleString(i18n.resolvedLanguage)}</td><td>{actionNames[entry.action] ? t(actionNames[entry.action]) : entry.action}</td><td>{entry.target}</td><td>{entry.location === 'local' ? t('loginLocationLocal') : entry.location ?? '—'}</td><td title={auditDetails[entry.detail] ? t(auditDetails[entry.detail]) : entry.detail}>{t(entry.success ? 'success' : 'failure')}</td></tr>)}</tbody></table>{!audit.data?.length && <div className="empty-state"><ClipboardList size={24} /><span>{t('noAudit')}</span></div>}</div>}</section>}
    {selectedCode && <Modal title={t('roomTitle', { code: selectedCode })} onClose={() => setSelectedCode(null)}>{selectedGame ? <><div className="room-detail"><span>{gameStates[selectedGame.state] ? t(gameStates[selectedGame.state]) : selectedGame.state}</span><span>{t('roomPlayers', { count: selectedGame.playerCount, max: selectedGame.maxPlayers })}</span><span>{t(selectedGame.isPublic ? 'publicRoom' : 'privateRoom')}</span></div><div className="room-player-list">{selectedGame.players.map(p => <div key={p.clientId}><b>{p.name}</b><span>{p.isHost ? t('host') : `#${p.clientId}`}</span><button className="secondary-btn" disabled={pending} onClick={() => moderate(p, 'kick')}>{t('kick')}</button></div>)}</div><div className="modal-actions"><button className="secondary-btn" disabled={pending} onClick={() => manageGame(selectedGame, 'privacy')}>{t(selectedGame.isPublic ? 'makePrivate' : 'makePublic')}</button><button className="danger-btn" disabled={pending} onClick={() => manageGame(selectedGame, 'close')}>{t('clearRoom')}</button></div><p className="modal-copy">{t('clearRoomNote')}</p></> : <div className="empty-state">{t('roomOffline')}</div>}</Modal>}
    {panelLogin && <aside className="panel-login-toast" role="status" aria-live="polite"><ShieldCheck size={18} aria-hidden="true" /><div className="panel-login-toast-copy"><b>{t('actionPanelLogin')}</b><span>{t('loginIp')}: {panelLogin.ip || t('unknown')}</span><small>{t('loginLocation')}: {panelLogin.location === 'local' ? t('loginLocationLocal') : panelLogin.location ?? t('loginLocationUnavailable')}</small>{loginInfoUnavailable && <small>{t('panelLoginUnavailable')}</small>}</div><button className="icon-btn" title={t('dismiss')} aria-label={t('dismiss')} onClick={() => setPanelLogin(null)}><X size={15} /></button></aside>}
    {notice && <div className="toast" role="status"><span>{errorMessage(notice)}</span><button className="icon-btn" title={t('dismiss')} aria-label={t('dismiss')} onClick={() => setNotice(null)}><X size={15} /></button></div>}
  </AppShell>
}

function DashboardHome({ data, audit, auditLoading, auditError, formatUptime, number, onPlayers, onGames, onAudit, onRoom }: {
  data: { onlinePlayers: number; activeGames: number; totalGames: number; uptimeSeconds: number; pluginVersion: string; players: Player[]; games: Game[] }
  audit: Awaited<ReturnType<typeof fetchAudit>>; auditLoading: boolean; auditError: boolean
  formatUptime: (seconds: number) => string; number: (value: number) => string
  onPlayers: () => void; onGames: () => void; onAudit: () => void; onRoom: (code: string) => void
}) {
  const { t, i18n } = useTranslation()
  const activePlayers = data.players.filter(player => player.inGame).length
  const lobbyPlayers = data.onlinePlayers - activePlayers
  const visibleGames = data.games.slice(0, 5)
  return <div className="dashboard-home">
    <section className="dashboard-server-strip"><div className="dashboard-server-status"><span className="server-dot" /><div><b>{t('serverOnline')}</b><small>{t('pluginFooter', { version: data.pluginVersion })}</small></div></div><div className="dashboard-runtime"><span>{t('uptime')}</span><b>{formatUptime(data.uptimeSeconds)}</b></div><div className="dashboard-link-status"><span className="pulse-mini" />{t('liveDescription')}</div></section>
    <section className="dashboard-metrics" aria-label={t('dashboardMetrics')}>
      <button className="dashboard-metric accent-mint" onClick={onPlayers}><span className="dashboard-metric-icon"><Users size={18} /></span><b>{number(data.onlinePlayers)}</b><strong>{t('onlinePlayers')}</strong><small>{t('dashboardPlayerSplit', { lobby: number(lobbyPlayers), playing: number(activePlayers) })}</small></button>
      <button className="dashboard-metric accent-lilac" onClick={onGames}><span className="dashboard-metric-icon"><Gamepad2 size={18} /></span><b>{number(data.activeGames)}</b><strong>{t('activeGames')}</strong><small>{t('dashboardRoomsTotal', { count: data.totalGames })}</small></button>
      <button className="dashboard-metric accent-amber" onClick={onGames}><span className="dashboard-metric-icon"><Server size={18} /></span><b>{number(data.totalGames)}</b><strong>{t('titleGames')}</strong><small>{t('dashboardRoomsHint')}</small></button>
      <div className="dashboard-metric accent-blue"><span className="dashboard-metric-icon"><Activity size={18} /></span><b className="runtime-value">{formatUptime(data.uptimeSeconds)}</b><strong>{t('uptime')}</strong><small>{t('uptimeDescription')}</small></div>
    </section>
    <div className="dashboard-columns">
      <section className="dashboard-panel"><div className="dashboard-panel-head"><div><h2>{t('liveRooms')}</h2><p>{t('dashboardRoomsDescription')}</p></div><button className="text-action" onClick={onGames}>{t('viewAll')}<ArrowUpRight size={14} /></button></div>
        {visibleGames.length ? <div className="dashboard-room-list">{visibleGames.map(game => {
          const ratio = Math.min(100, Math.max(0, game.playerCount / Math.max(1, game.maxPlayers) * 100))
          const running = game.state === 'Started'
          return <button className="dashboard-room" key={game.code} onClick={() => onRoom(game.code)}><span className={`dashboard-room-icon ${running ? 'running' : ''}`}><Gamepad2 size={17} /></span><span className="dashboard-room-main"><b>{game.code}</b><small>{game.hostName ?? t('unknown')} · {t(running ? 'stateStarted' : 'stateWaiting')}</small><span className="room-capacity"><i style={{ width: `${ratio}%` }} /></span></span><span className="dashboard-room-count">{number(game.playerCount)}<small> / {number(game.maxPlayers)}</small></span></button>
        })}</div> : <div className="dashboard-empty"><Gamepad2 size={20} /><span>{t('noGames')}</span></div>}
      </section>
      <section className="dashboard-panel"><div className="dashboard-panel-head"><div><h2>{t('recentActions')}</h2><p>{t('dashboardActivityDescription')}</p></div><button className="text-action" onClick={onAudit}>{t('viewAll')}<ArrowUpRight size={14} /></button></div>
        {auditError ? <div className="dashboard-empty">{t('activityUnavailable')}</div> : auditLoading ? <div className="dashboard-empty">{t('loadingAudit')}</div> : audit.length ? <div className="dashboard-activity-list">{audit.slice(0, 5).map((entry, index) => <div className="dashboard-activity" key={`${entry.timestamp}-${index}`}><span className={`activity-result ${entry.success ? 'success' : 'failure'}`} /><div><b>{actionNames[entry.action] ? t(actionNames[entry.action]) : entry.action}</b><small>{entry.action === 'login' ? `${entry.target} · ${entry.location === 'local' ? t('loginLocationLocal') : entry.location ?? t('loginLocationUnavailable')}` : entry.target}</small></div><time dateTime={entry.timestamp}>{new Date(entry.timestamp).toLocaleTimeString(i18n.resolvedLanguage, { hour: '2-digit', minute: '2-digit' })}</time></div>)}</div> : <div className="dashboard-empty"><ClipboardList size={20} /><span>{t('noAudit')}</span></div>}
      </section>
    </div>
  </div>
}

function StatCard({ label, value, detail, icon, accent, compact = false }: { label: string; value: string | number; detail: string; icon: React.ReactNode; accent: string; compact?: boolean }) {
  return <article className={`stat-card accent-${accent}`}><div className="stat-top"><div className="stat-icon">{icon}</div></div><div className={`stat-value ${compact ? 'small-value' : ''}`}>{value}</div><div className="stat-label">{label}</div><div className="stat-detail">{detail}</div><div className="stat-watermark">{icon}</div></article>
}

function GameTile({ game, onSelect }: { game: Game; onSelect: () => void }) {
  const { t, i18n } = useTranslation()
  const running = game.state === 'Started'
  const number = (value: number) => new Intl.NumberFormat(i18n.resolvedLanguage).format(value)
  return <article className="game-tile"><div className="game-tile-top"><div className={`game-icon ${running ? 'in-game' : ''}`}><Gamepad2 size={17} /></div><span className={`game-state ${running ? 'live' : ''}`}><span />{gameStates[game.state] ? t(gameStates[game.state]) : game.state}</span></div><button className="game-code game-code-button" onClick={onSelect} title={t('viewRoom', { code: game.code })}>{game.code}</button><div className="game-host">{t('host')} <b>{game.hostName ?? t('unknown')}</b></div><div className="game-progress"><div><span>{t('navPlayers')}</span><b>{number(game.playerCount)}<i> / {number(game.maxPlayers)}</i></b></div><div className="progress-track"><span style={{ width: `${Math.min(100, (game.playerCount / Math.max(1, game.maxPlayers)) * 100)}%` }} /></div></div><div className="game-tile-bottom"><span className="visibility"><Globe2 size={13} />{t(game.isPublic ? 'publicRoom' : 'privateRoom')}</span><button className="room-detail-button" onClick={onSelect}>{t('manageRoom')}</button></div></article>
}
