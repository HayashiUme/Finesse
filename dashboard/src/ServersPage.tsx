import { useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowUpRight, Gamepad2, Plus, Search, Server, Settings2, Trash2, Users } from 'lucide-react'
import { fetchOverview } from './api'
import { errorMessage } from './i18n'
import AppShell, { type ShellProps } from './AppShell'
import type { SavedServer } from './types'

export default function ServersPage({ onRemove, ...shell }: ShellProps & { onRemove: (server: SavedServer) => void }) {
  const { t, i18n } = useTranslation()
  const [search, setSearch] = useState('')
  const queries = useQueries({ queries: shell.servers.map(server => ({ queryKey: ['overview', server], queryFn: ({ signal }: { signal: AbortSignal }) => fetchOverview(server, signal), retry: false, refetchInterval: 1000 })) })
  const reachable = queries.filter(q => q.isSuccess)
  const checking = queries.some(q => q.isFetching)
  const number = (value: number) => new Intl.NumberFormat(i18n.resolvedLanguage).format(value)
  const visible = shell.servers.map((server, index) => ({ server, query: queries[index] })).filter(({ server }) => `${server.name} ${server.baseUrl}`.toLowerCase().includes(search.toLowerCase()))
  return <AppShell {...shell} onRefresh={() => { for (const query of queries) void query.refetch() }}>
    <div className="page-heading fleet-heading"><div><h1>{t('navServers')}</h1><p>{t('serversDescription')}</p></div><button className="primary-btn" onClick={shell.onAdd}><Plus size={16} />{t('addServer')}</button></div>
    <section className="fleet-summary" aria-label={t('fleetSummary')}><div><Server size={18} /><b>{number(shell.servers.length)}</b><span>{t('savedServers')}</span></div><div><span className="server-dot" /><b>{number(reachable.length)}</b><span>{t('reachableServers')}</span></div><div><Users size={18} /><b>{reachable.length ? number(reachable.reduce((sum, q) => sum + (q.data?.onlinePlayers ?? 0), 0)) : '—'}</b><span>{t('onlinePlayers')}</span></div><p>{t(checking ? 'checkingServers' : 'fleetRefreshNote')}</p></section>
    <section className="server-directory"><div className="directory-toolbar"><h2>{t('savedServers')}</h2><label className="search-box"><Search size={15} /><input aria-label={t('searchServers')} placeholder={t('searchServers')} value={search} onChange={event => setSearch(event.target.value)} /></label></div>
      <div className="server-list">{visible.map(({ server, query }) => {
        const status = query.isSuccess ? 'reachable' : query.isError ? 'unavailable' : 'checking'
        return <article key={server.id} className={`server-row ${server.id === shell.current?.id ? 'current-server' : ''}`}>
          <div className="server-identity"><div className="directory-server-icon"><Server size={22} /></div><div><div className="server-name-line"><h3>{server.name}</h3>{server.id === shell.current?.id && <span className="current-label">{t('lastSelected')}</span>}</div><code>{server.baseUrl}</code></div></div>
          <div className="server-health"><span className={`health-label health-${status}`}><span />{t(status === 'reachable' ? 'serverReachable' : status === 'unavailable' ? 'serverUnavailable' : 'checkingServer')}</span>{query.isSuccess && <small>{t('pluginFooter', { version: query.data.pluginVersion })}</small>}</div>
          <div className="server-population"><span><Users size={14} /><b>{query.isSuccess ? number(query.data.onlinePlayers) : '—'}</b><small>{t('navPlayers')}</small></span><span><Gamepad2 size={14} /><b>{query.isSuccess ? number(query.data.totalGames) : '—'}</b><small>{t('navGames')}</small></span></div>
          <div className="directory-actions"><button className="secondary-btn open-server" onClick={() => shell.onSelect(server)}>{t('openServer')}<ArrowUpRight size={15} /></button><button className="icon-btn" title={t('editNamedServer', { name: server.name })} aria-label={t('editNamedServer', { name: server.name })} onClick={() => shell.onEdit(server)}><Settings2 size={16} /></button><button className="icon-btn remove-server" title={t('removeNamedServer', { name: server.name })} aria-label={t('removeNamedServer', { name: server.name })} onClick={() => onRemove(server)}><Trash2 size={16} /></button></div>
          {query.isError && <p className="server-row-error">{errorMessage(query.error)}</p>}
        </article>
      })}</div>
      {!visible.length && <div className="directory-empty"><Search size={25} /><p>{t('noMatchingServers')}</p><button className="secondary-btn" onClick={() => setSearch('')}>{t('clearSearch')}</button></div>}
    </section><p className="directory-note">{t('serverStorageNote')}</p>
  </AppShell>
}
