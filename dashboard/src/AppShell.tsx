import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, ClipboardList, Command, Gamepad2, LayoutDashboard, LogOut, Plus, RefreshCw, Server, Settings2, UserRoundCog, Users } from 'lucide-react'
import { ConfigHelp, Modal } from './ConnectionUI'
import type { AppView, SavedServer, WorkspaceView } from './types'
import { useAuth } from './auth'
import { Avatar } from './AccountSettings'

export type ShellProps = {
  servers: SavedServer[]; current: SavedServer | null; view: AppView
  onSelect: (server: SavedServer) => void; onNavigate: (view: WorkspaceView) => void
  onSettings: () => void; onAccount: () => void; onDirectory: () => void; onAdd: () => void; onEdit: (server: SavedServer) => void
}
export type WorkspaceProps = Omit<ShellProps, 'current' | 'view'> & { connection: SavedServer; view: WorkspaceView }
const navigation = [
  { id: 'dashboard', label: 'navDashboard', icon: LayoutDashboard },
  { id: 'players', label: 'navPlayers', icon: Users },
  { id: 'games', label: 'navGames', icon: Gamepad2 },
  { id: 'audit', label: 'navAudit', icon: ClipboardList },
] as const

export default function AppShell({ children, live, connected, onRefresh, ...props }: ShellProps & {
  children: React.ReactNode; live?: boolean; connected?: boolean; onRefresh: () => void
}) {
  const { t } = useTranslation()
  const auth = useAuth()
  const [help, setHelp] = useState(false)
  const title = props.view === 'servers' ? t('navServers') : props.view === 'settings' ? t('preferences') : props.view === 'account' ? t('accountSettings') : props.view === 'login' ? t('signIn') : t(navigation.find(n => n.id === props.view)!.label)
  const account = props.current ? auth.sessions[props.current.id]?.user : undefined
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Command size={19} /></div><div><strong>finesse</strong><span>{t('brandControl')}</span></div></div>
      <ServerSwitcher {...props} />
      <nav aria-label={t('workspace')}><button title={t('navDashboard')} className={`nav-link ${props.view === 'dashboard' ? 'active' : ''}`} aria-current={props.view === 'dashboard' ? 'page' : undefined} disabled={!props.current} onClick={() => props.onNavigate('dashboard')}><LayoutDashboard size={17} /><span>{t('navDashboard')}</span></button></nav>
      <nav aria-label={t('management')}><button title={t('navServers')} className={`nav-link ${props.view === 'servers' ? 'active' : ''}`} aria-current={props.view === 'servers' ? 'page' : undefined} onClick={props.onDirectory}><Server size={17} /><span>{t('navServers')}</span><em>{props.servers.length}</em></button></nav>
      <div className="nav-caption">{t('workspace')}</div>
      <nav aria-label={t('workspace')}>{navigation.filter(item => item.id !== 'dashboard').map(({ id, label, icon: Icon }) => <button key={id} title={t(label)} disabled={!props.current} className={`nav-link ${props.view === id ? 'active' : ''}`} aria-current={props.view === id ? 'page' : undefined} onClick={() => props.onNavigate(id)}><Icon size={17} /><span>{t(label)}</span></button>)}</nav>
      <div className="nav-caption section-caption">{t('management')}</div>
      <button className={`nav-link ${props.view === 'account' ? 'active' : ''}`} title={t('accountSettings')} aria-current={props.view === 'account' ? 'page' : undefined} disabled={!props.current} onClick={props.onAccount}><UserRoundCog size={17} /><span>{t('accountSettings')}</span></button>
      <button className={`nav-link ${props.view === 'settings' ? 'active' : ''}`} title={t('preferences')} onClick={props.onSettings}><Settings2 size={17} /><span>{t('preferences')}</span></button>
      <div className="sidebar-bottom"><button className="user-profile" title={t('accountSettings')} onClick={props.onAccount}><Avatar username={account?.username ?? t('admin')} avatar={account?.avatar} /><div><b>{account?.username ?? t('admin')}</b><small>{account?.role === 'superadmin' ? t('superAdminLogin') : account ? t('adminLogin') : t('notSignedIn')}</small></div></button>{account && props.current && <button className="nav-link sign-out-link" aria-label={t('signOut')} title={t('signOutScope', { name: props.current.name })} onClick={() => { void auth.signOut(props.current!); props.onNavigate('dashboard') }}><LogOut size={17} /><span>{t('signOut')}</span></button>}</div>
    </aside>
    <main className="main-area"><header className="topbar"><div className="breadcrumbs"><span>{props.view === 'servers' ? 'Finesse' : props.current?.name}</span><span className="crumb-slash">/</span><b>{title}</b></div><div className="top-actions">{connected && <div className="connection-pill"><span className="server-dot" />{t(live ? 'live' : 'polling')}</div>}{props.view !== 'settings' && props.view !== 'account' && <button className="icon-btn" title={t('refresh')} aria-label={t('refresh')} onClick={onRefresh}><RefreshCw size={16} /></button>}<button className="help-circle" title={t('help')} aria-label={t('help')} onClick={() => setHelp(true)}>?</button></div></header>{props.view !== 'servers' && props.current && <div className="mobile-server-context"><Server size={14} /><b>{props.current.name}</b></div>}<div className="content">{children}</div></main>
    {help && <Modal title={t('helpTitle')} onClose={() => setHelp(false)}><ConfigHelp /><p className="modal-copy">{t('originNote')}</p></Modal>}
  </div>
}

function ServerSwitcher({ current, servers, onSelect, onDirectory, onAdd }: ShellProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const choose = (action: () => void) => { setOpen(false); action() }
  return <div className="server-switcher" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false) }} onKeyDown={event => { if (event.key === 'Escape') { setOpen(false); (event.currentTarget.querySelector('.server-select') as HTMLButtonElement)?.focus() } }}>
    <button className="server-select" title={t('switchServer')} aria-label={t('switchServer')} aria-expanded={open} aria-controls="server-switcher-list" onClick={() => setOpen(!open)}><Server size={17} /><div><b>{current?.name ?? t('navServers')}</b><small>{t('savedServerCount', { count: servers.length })}</small></div><ChevronDown size={16} /></button>
    {open && <><button className="switcher-dismiss" tabIndex={-1} aria-label={t('close')} onClick={() => setOpen(false)} /><div className="server-menu" id="server-switcher-list"><div className="server-menu-title">{t('switchServer')}</div><div className="server-menu-list">{servers.map(server => <button key={server.id} className={server.id === current?.id ? 'selected' : ''} onClick={() => choose(() => onSelect(server))}><Server size={16} /><span><b>{server.name}</b><small>{server.baseUrl}</small></span>{server.id === current?.id && <Check size={16} />}</button>)}</div><div className="server-menu-footer"><button onClick={() => choose(onDirectory)}><Settings2 size={15} />{t('manageServers')}</button><button onClick={() => choose(onAdd)}><Plus size={15} />{t('addServer')}</button></div></div></>}
  </div>
}
