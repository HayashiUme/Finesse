import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trans, useTranslation } from 'react-i18next'
import { Activity, ArrowDownToLine, Ban, CircleHelp, ClipboardList, Command, Gamepad2, Globe2, LayoutDashboard, LoaderCircle, LockKeyhole, LogOut, RefreshCw, Search, Server, Settings2, ShieldCheck, Users, Wifi, WifiOff, X } from 'lucide-react'
import { fetchAudit, fetchSnapshot, forgetConnection, gameAction, getConnection, normalizeConnection, playerAction, saveConnection } from './api'
import { useRealtime } from './useRealtime'
import { errorMessage, LocalizedError, type TranslationKey } from './i18n'
import LanguageSwitcher from './LanguageSwitcher'
import ThemeSwitcher from './ThemeSwitcher'
import type { Connection, Game, Player } from './types'

const emptyConnection: Connection = { name: '', baseUrl: 'http://127.0.0.1:8097', apiKey: '' }
const navItems = [
  { id: 'overview', label: 'navOverview', icon: LayoutDashboard },
  { id: 'players', label: 'navPlayers', icon: Users },
  { id: 'games', label: 'navGames', icon: Gamepad2 },
  { id: 'audit', label: 'navAudit', icon: ClipboardList },
] as const
type View = typeof navItems[number]['id']
const titles = { overview: 'titleOverview', players: 'titlePlayers', games: 'titleGames', audit: 'navAudit' } as const
const filters = [{ id: 'all', label: 'filterAll' }, { id: 'lobby', label: 'lobby' }, { id: 'playing', label: 'playing' }] as const
type Filter = typeof filters[number]['id']
const gameStates: Record<string, Extract<TranslationKey, `state${string}`>> = { NotStarted: 'stateWaiting', Starting: 'stateStarting', Started: 'stateStarted', Ended: 'stateEnded', Destroyed: 'stateDestroyed' }
const actionNames: Record<string, Extract<TranslationKey, `action${string}`>> = { kick: 'actionKick', ban: 'actionBan', privacy: 'actionPrivacy', close: 'actionClose' }
const auditDetails: Record<string, Extract<TranslationKey, `audit${string}`>> = {
  Completed: 'auditCompleted', 'Player not found': 'auditPlayerMissing', 'Room not found': 'auditRoomMissing',
  'Player must be in a room for a room ban': 'auditRoomRequired', 'Operation failed': 'auditFailed',
}

export default function App() {
  const { t, i18n } = useTranslation()
  const [connection, setConnection] = useState<Connection | null>(getConnection)
  const [view, setView] = useState<View>('overview')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [draft, setDraft] = useState<Connection>(connection ?? emptyConnection)
  const [connectionError, setConnectionError] = useState<Error | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<Error | null>(null)
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['snapshot', connection], queryFn: () => fetchSnapshot(connection!),
    enabled: Boolean(connection), retry: false, refetchInterval: 15000,
  })
  const connected = Boolean(connection && query.isSuccess)
  const live = useRealtime(connection, connected)
  const audit = useQuery({ queryKey: ['audit', connection], queryFn: () => fetchAudit(connection!), enabled: connected && view === 'audit', retry: false, refetchInterval: 15000 })
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

  function openSettings() { setDraft(connection ?? emptyConnection); setConnectionError(null); setSettingsOpen(true) }

  async function connectServer(value: Connection) {
    setConnecting(true)
    setConnectionError(null)
    try {
      const next = normalizeConnection(value)
      const snapshot = await fetchSnapshot(next)
      saveConnection(next)
      queryClient.setQueryData(['snapshot', next], snapshot)
      setConnection(next)
      setDraft(next)
      setSettingsOpen(false)
      setSelectedCode(null)
    } catch (error) { setConnectionError(error instanceof Error ? error : new LocalizedError('errorConnection')) }
    finally { setConnecting(false) }
  }

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

  function disconnect() {
    forgetConnection()
    setConnection(null); setDraft(emptyConnection); setSettingsOpen(false); setConnectionError(null); setNotice(null)
    queryClient.clear()
  }

  if (!connection || query.isError || !query.data) {
    const error = connectionError ?? (query.isError ? query.error : null)
    return <ServerSetup initial={connection ?? draft} error={error ? errorMessage(error, 'errorConnection') : ''} busy={connecting || Boolean(connection && query.isLoading)} onConnect={connectServer} />
  }

  const data = query.data
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Command size={19} /></div><div><strong>finesse</strong><span>{t('brandControl')}</span></div></div>
      <button className="server-select" onClick={openSettings} title={t('configureServer')}><span className="server-dot" /><div><b>{connection.name}</b><small>{connection.baseUrl}</small></div><Settings2 size={17} /></button>
      <div className="nav-caption">{t('workspace')}</div>
      <nav>{navItems.map(({ id, label, icon: Icon }) => <button key={id} title={t(label)} aria-label={t(label)} aria-current={view === id ? 'page' : undefined} onClick={() => { setView(id); setSearch('') }} className={`nav-link ${view === id ? 'active' : ''}`}><Icon size={17} /><span>{t(label)}</span>{id === 'players' && <em>{number(data.onlinePlayers)}</em>}</button>)}</nav>
      <div className="nav-caption section-caption">{t('management')}</div>
      <button className="nav-link" onClick={openSettings} title={t('settings')}><Settings2 size={17} /><span>{t('settings')}</span></button>
      <div className="sidebar-bottom"><button className="nav-link" onClick={() => setHelpOpen(true)} title={t('help')}><CircleHelp size={17} /><span>{t('help')}</span></button><div className="user-profile"><div className="avatar">A</div><div><b>{t('admin')}</b><small>{t('apiSession')}</small></div></div></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs"><span>{connection.name}</span><span className="crumb-slash">/</span><b>{t(navItems.find(item => item.id === view)!.label)}</b></div><div className="top-actions"><ThemeSwitcher /><LanguageSwitcher /><div className="connection-pill" title={t(live ? 'live' : 'polling')}><span className="server-dot" />{t(live ? 'live' : 'polling')}</div><button className="icon-btn" onClick={() => { void query.refetch(); if (view === 'audit') void audit.refetch() }} title={t('refresh')} aria-label={t('refresh')}><RefreshCw size={16} /></button><button className="help-circle" onClick={() => setHelpOpen(true)} title={t('help')} aria-label={t('help')}>?</button></div></header>
      <div className="content">
        <div className="page-heading"><div><div className="eyebrow"><span className="pulse-mini" />{t('serverManagement')}</div><h1>{t(titles[view])}</h1><p>{t(live ? 'liveDescription' : 'pollingDescription')}</p></div><div className="heading-actions"><button className="primary-btn" onClick={openSettings}><Settings2 size={16} />{t('settings')}</button></div></div>

        {(view === 'overview' || view === 'players') && <section className="stats-grid">
          <StatCard label={t('onlinePlayers')} value={number(data.onlinePlayers)} detail={t('allConnections')} icon={<Users size={18} />} accent="mint" />
          <StatCard label={t('activeGames')} value={number(data.activeGames)} detail={t('totalGames', { count: data.totalGames })} icon={<Gamepad2 size={18} />} accent="lilac" />
          <StatCard label={t('uptime')} value={formatUptime(data.uptimeSeconds)} detail={t('uptimeDescription')} icon={<Activity size={18} />} accent="amber" compact />
          <StatCard label={t('pluginVersion')} value={`v${data.pluginVersion}`} detail={t('apiVersion')} icon={<ShieldCheck size={18} />} accent="blue" compact />
        </section>}

        {(view === 'overview' || view === 'players') && <section className="section-block">
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

        {(view === 'overview' || view === 'games') && <section className="section-block games-block">
          <div className="section-head"><div><div className="section-title"><h2>{t('titleGames')}</h2><span className="count-tag">{number(games.length)}</span></div><p>{t('manageGames')}</p></div><div className="table-tools">{view === 'games' && <label className="search-box"><Search size={15} /><input aria-label={t('searchGames')} value={search} onChange={e => setSearch(e.target.value)} placeholder={t('searchGamesPlaceholder')} /></label>}<div className="segmented">{filters.map(item => <button key={item.id} className={filter === item.id ? 'selected' : ''} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{t(item.label)}</button>)}</div></div></div>
          <div className="games-grid">{filteredGames.map(game => <GameTile key={game.code} game={game} onSelect={() => setSelectedCode(game.code)} />)}</div>
          {filteredGames.length === 0 && <div className="empty-state"><Gamepad2 size={24} /><span>{t('noGames')}</span></div>}
        </section>}

        {view === 'audit' && <section className="section-block"><div className="section-head"><div><h2>{t('recentActions')}</h2><p>{t('auditDescription')}</p></div></div>{audit.isError ? <div className="setup-error">{errorMessage(audit.error)}</div> : audit.isPending ? <div className="empty-state">{t('loadingAudit')}</div> : <div className="table-wrap"><table><thead><tr><th>{t('time')}</th><th>{t('action')}</th><th>{t('target')}</th><th>{t('result')}</th></tr></thead><tbody>{audit.data?.map((entry, index) => <tr key={`${entry.timestamp}-${index}`}><td>{new Date(entry.timestamp).toLocaleString(i18n.resolvedLanguage)}</td><td>{actionNames[entry.action] ? t(actionNames[entry.action]) : entry.action}</td><td>{entry.target}</td><td title={auditDetails[entry.detail] ? t(auditDetails[entry.detail]) : entry.detail}>{t(entry.success ? 'success' : 'failure')}</td></tr>)}</tbody></table>{!audit.data?.length && <div className="empty-state"><ClipboardList size={24} /><span>{t('noAudit')}</span></div>}</div>}</section>}
        <footer className="page-footer"><span><LockKeyhole size={13} /> API v1 <span className="footer-sep">·</span> {t('pluginFooter', { version: data.pluginVersion })}</span><span>{t('footerBrand')}</span></footer>
      </div>
    </main>

    {settingsOpen && <Modal title={t('settingsTitle')} onClose={() => setSettingsOpen(false)}><form onSubmit={e => { e.preventDefault(); void connectServer(draft) }}><p className="modal-copy">{t('settingsDescription')}</p><ConnectionFields value={draft} onChange={setDraft} /><div className="security-note"><LockKeyhole size={15} /><span>{t('localApiNote')}</span></div>{connectionError && <div className="setup-error" role="alert">{errorMessage(connectionError)}</div>}<div className="modal-actions"><button type="button" className="secondary-btn" onClick={disconnect}>{t('removeConnection')}</button><button className="primary-btn" disabled={connecting}>{connecting ? <LoaderCircle className="spin" size={15} /> : <Wifi size={15} />}{t(connecting ? 'testingConnection' : 'testAndSave')}</button></div></form></Modal>}
    {helpOpen && <Modal title={t('helpTitle')} onClose={() => setHelpOpen(false)}><ConfigHelp /><div className="security-note"><LockKeyhole size={15} /><span>{t('originNote')}</span></div></Modal>}
    {selectedCode && <Modal title={t('roomTitle', { code: selectedCode })} onClose={() => setSelectedCode(null)}>{selectedGame ? <><div className="room-detail"><span>{gameStates[selectedGame.state] ? t(gameStates[selectedGame.state]) : selectedGame.state}</span><span>{t('roomPlayers', { count: selectedGame.playerCount, max: selectedGame.maxPlayers })}</span><span>{t(selectedGame.isPublic ? 'publicRoom' : 'privateRoom')}</span></div><div className="room-player-list">{selectedGame.players.map(p => <div key={p.clientId}><b>{p.name}</b><span>{p.isHost ? t('host') : `#${p.clientId}`}</span><button className="secondary-btn" disabled={pending} onClick={() => moderate(p, 'kick')}>{t('kick')}</button></div>)}</div><div className="modal-actions"><button className="secondary-btn" disabled={pending} onClick={() => manageGame(selectedGame, 'privacy')}>{t(selectedGame.isPublic ? 'makePrivate' : 'makePublic')}</button><button className="danger-btn" disabled={pending} onClick={() => manageGame(selectedGame, 'close')}>{t('clearRoom')}</button></div><p className="modal-copy">{t('clearRoomNote')}</p></> : <div className="empty-state">{t('roomOffline')}</div>}</Modal>}
    {notice && <div className="toast" role="status"><span>{errorMessage(notice)}</span><button className="icon-btn" title={t('dismiss')} aria-label={t('dismiss')} onClick={() => setNotice(null)}><X size={15} /></button></div>}
  </div>
}

function ConnectionFields({ value, onChange }: { value: Connection; onChange: (value: Connection) => void }) {
  const { t } = useTranslation()
  return <><label className="field-label">{t('serverName')}<input autoComplete="off" required maxLength={80} value={value.name} onChange={e => onChange({ ...value, name: e.target.value })} placeholder={t('serverNamePlaceholder')} /></label><label className="field-label">{t('pluginUrl')}<input type="url" autoComplete="url" required value={value.baseUrl} onChange={e => onChange({ ...value, baseUrl: e.target.value })} placeholder="http://127.0.0.1:8097" /></label><label className="field-label">{t('apiKey')}<input autoComplete="off" required value={value.apiKey} onChange={e => onChange({ ...value, apiKey: e.target.value })} type="password" placeholder={t('apiKeyPlaceholder')} /></label></>
}

function ConfigHelp() {
  const { t } = useTranslation()
  return <div className="setup-config-hint"><span className="hint-line" /><div><b>{t('firstSetup')}</b><p><Trans i18nKey="helpInstall" components={{ code: <code /> }} /></p><p><Trans i18nKey="helpKey" components={{ code: <code /> }} /></p><p><Trans i18nKey="helpMissing" components={{ code: <code /> }} /></p></div></div>
}

function ServerSetup({ initial, error, busy, onConnect }: { initial: Connection; error: string; busy: boolean; onConnect: (connection: Connection) => void }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(initial)
  return <main className="setup-screen"><div className="setup-top"><div className="brand-mark"><Command size={19} /></div><strong>finesse</strong><span>{t('brandManagement')}</span><div className="setup-appearance"><ThemeSwitcher /><LanguageSwitcher /></div></div><div className="setup-layout">
    <section className="setup-intro"><div className="setup-emblem"><Server size={25} /></div><div className="setup-kicker">{t('controlPlane')}</div><h1><Trans i18nKey="setupTitle" /></h1><p>{t('setupDescription')}</p><div className="setup-checks"><div><span><Wifi size={14} /></span><div><b>{t('setupLive')}</b><small>{t('setupLiveDescription')}</small></div></div><div><span><ShieldCheck size={14} /></span><div><b>{t('setupActions')}</b><small>{t('setupActionsDescription')}</small></div></div></div></section>
    <form className="setup-form" onSubmit={e => { e.preventDefault(); onConnect(form) }}><div className="setup-form-head"><div><span className="setup-kicker">{t('addServer')}</span><h2>{t('serverConnection')}</h2></div><span className="setup-step">PLUGIN API · V1</span></div><ConnectionFields value={form} onChange={setForm} /><ConfigHelp />{error && <div className="setup-error" role="alert"><WifiOff size={15} /><span>{error}</span></div>}<button className="primary-btn setup-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Wifi size={16} />}{t(busy ? 'verifyingConnection' : 'testAndAdd')}</button><div className="setup-foot"><LockKeyhole size={13} />{t('localStorageNote')}</div></form>
    </div><footer className="setup-footer"><span>FINESSE</span><span>{t('setupFooter')}</span></footer></main>
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const { t } = useTranslation()
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}><section className="settings-modal" role="dialog" aria-modal="true" aria-label={title} onKeyDown={e => { if (e.key === 'Escape') onClose() }}><div className="modal-head"><div><span className="modal-kicker">{t('footerBrand')}</span><h2>{title}</h2></div><button className="icon-btn" autoFocus onClick={onClose} title={t('close')} aria-label={t('close')}><X size={18} /></button></div>{children}</section></div>
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
