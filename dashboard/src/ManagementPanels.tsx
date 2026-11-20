import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Ban, Info, Megaphone, Plus, Search, Send, ShieldCheck, Trash2 } from 'lucide-react'
import { addBan, fetchBans, fetchServerInfo, removeBan, sendMessage } from './api'
import { errorMessage } from './i18n'
import { Modal } from './ConnectionUI'
import ReportsPanel from './ReportsPanel'
import type { BanRequest, CommandResult, Connection, Game, Player } from './types'
import './management.css'

export function BanEditor({ connection, initial, onSaved }: { connection: Connection; initial?: Pick<BanRequest, 'kind' | 'value'>; onSaved: () => void }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [kind, setKind] = useState<BanRequest['kind']>(initial?.kind ?? 'ip')
  const [value, setValue] = useState(initial?.value ?? '')
  const [duration, setDuration] = useState('1440')
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [partial, setPartial] = useState(false)
  const [error, setError] = useState<unknown>(null)
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (pending) return
    setPending(true); setError(null)
    try {
      const result = await addBan(connection, { kind, value: value.trim(), reason, durationMinutes: duration ? Number(duration) : null })
      await Promise.all([client.invalidateQueries({ queryKey: ['bans', connection] }), client.invalidateQueries({ queryKey: ['audit', connection] })])
      if (result.failed) setPartial(true)
      else onSaved()
    } catch (failure) { setError(failure) }
    finally { setPending(false) }
  }
  return <form className="management-form" onSubmit={event => void submit(event)}>
    <p className="modal-copy">{t('serverBanNote')}</p>
    <fieldset disabled={pending || partial}>
      <label>{t('banType')}<select value={kind} onChange={event => setKind(event.target.value as BanRequest['kind'])}><option value="ip">{t('ipAddress')}</option><option value="friendCode">{t('friendCode')}</option></select></label>
      <label>{t(kind === 'ip' ? 'ipAddress' : 'friendCode')}<input required maxLength={64} value={value} onChange={event => setValue(event.target.value)} placeholder={kind === 'ip' ? '203.0.113.10' : 'player#1234'} /></label>
      <label>{t('banDuration')}<input type="number" min={1} max={525600} value={duration} onChange={event => setDuration(event.target.value)} placeholder={t('permanentBan')} /><small>{t('banDurationHelp')}</small></label>
      <label>{t('reportReason')}<input maxLength={200} value={reason} onChange={event => setReason(event.target.value)} /></label>
    </fieldset>
    {error != null && <div className="setup-error" role="alert">{errorMessage(error)}</div>}
    {partial ? <><p className="report-warning" role="status">{t('banPartial')}</p><button type="button" className="secondary-btn" onClick={onSaved}>{t('close')}</button></> : <div className="modal-actions"><button className="danger-btn" disabled={pending || !value.trim()}><Ban size={14} />{t(pending ? 'saving' : 'addServerBan')}</button></div>}
  </form>
}

export function ModerationPanel({ connection }: { connection: Connection }) {
  const { t, i18n } = useTranslation()
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['bans', connection], queryFn: ({ signal }) => fetchBans(connection, signal), refetchInterval: 1000, retry: false })
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const entries = query.data?.entries.filter(entry => (entry.value + ' ' + entry.reason).toLowerCase().includes(search.toLowerCase())) ?? []
  async function unban(id: string, value: string) {
    if (pending || !window.confirm(t('confirmUnban', { value }))) return
    setPending(true); setError(null)
    try { await removeBan(connection, id); await Promise.all([query.refetch(), client.invalidateQueries({ queryKey: ['audit', connection] })]) }
    catch (failure) { setError(failure) }
    finally { setPending(false) }
  }
  return <div className="management-stack"><section className="dashboard-panel bans-panel">
    <div className="dashboard-panel-head"><div><h2><ShieldCheck size={18} />{t('serverBans')}</h2><p>{t('serverBansDescription')}</p></div><button className="primary-btn" disabled={!query.data?.available || query.isError} onClick={() => setEditor(true)}><Plus size={15} />{t('addServerBan')}</button></div>
    <div className="management-search"><label className="search-box"><Search size={15} /><input aria-label={t('searchBans')} placeholder={t('searchBans')} value={search} onChange={event => setSearch(event.target.value)} /></label></div>
    {(error != null || query.isError) && <div className="setup-error" role="alert">{errorMessage(error ?? query.error)}</div>}
    {query.data && !query.data.available && <p className="report-warning">{t('banStoreUnavailable')}</p>}
    {!query.isError && <><div className="table-wrap"><table><thead><tr><th>{t('banType')}</th><th>{t('target')}</th><th>{t('reportReason')}</th><th>{t('banCreated')}</th><th>{t('banExpires')}</th><th>{t('actions')}</th></tr></thead><tbody>{entries.map(entry => <tr key={entry.id}><td>{t(entry.kind === 'ip' ? 'ipAddress' : 'friendCode')}</td><td><b>{entry.value}</b></td><td>{entry.reason || '—'}</td><td>{new Date(entry.createdAt).toLocaleString(i18n.resolvedLanguage)}</td><td>{entry.expiresAt ? new Date(entry.expiresAt).toLocaleString(i18n.resolvedLanguage) : t('permanentBan')}</td><td><button className="secondary-btn" disabled={pending || !query.data?.available} onClick={() => void unban(entry.id, entry.value)}><Trash2 size={14} />{t('unban')}</button></td></tr>)}</tbody></table></div>
    {!entries.length && <div className="dashboard-empty"><Ban size={20} />{t(query.isPending ? 'loadingBans' : search ? 'noMatchingBans' : 'noBans')}</div>}</>}
  </section><ReportsPanel connection={connection} />
    {editor && <Modal title={t('addServerBan')} onClose={() => setEditor(false)}><BanEditor connection={connection} onSaved={() => setEditor(false)} /></Modal>}
  </div>
}

export function MessageComposer({ connection, code }: { connection: Connection; code?: string }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [result, setResult] = useState<CommandResult | null>(null)
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (pending || !message.trim() || (!code && !window.confirm(t('confirmBroadcast')))) return
    setPending(true); setError(null); setResult(null)
    try { setResult(await sendMessage(connection, message.trim(), code)); setMessage(''); await client.invalidateQueries({ queryKey: ['audit', connection] }) }
    catch (failure) { setError(failure) }
    finally { setPending(false) }
  }
  return <form className="management-form message-composer" onSubmit={event => void submit(event)}>
    <label>{t('messageContent')}<textarea required maxLength={250} rows={4} value={message} disabled={pending} onChange={event => setMessage(event.target.value.replace(/[\r\n\t]/g, ' '))} placeholder={t('messagePlaceholder')} /></label>
    <div className="composer-footer"><small>{message.length} / 250</small><button className="primary-btn" disabled={pending || !message.trim()}><Send size={14} />{t(pending ? 'sendingMessage' : code ? 'sendRoomMessage' : 'broadcastMessage')}</button></div>
    {error != null && <div className="setup-error" role="alert">{errorMessage(error)}</div>}
    {result && <p className={result.failed || result.skipped || !result.delivered ? 'report-warning' : 'command-result'} role="status">{t('messageResult', { delivered: result.delivered, skipped: result.skipped, failed: result.failed })}</p>}
    <p className="modal-copy">{t('messageDeliveryNote')}</p>
  </form>
}

export function MessagesPanel({ connection, games }: { connection: Connection; games: Game[] }) {
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  return <section className="dashboard-panel messages-panel"><div className="dashboard-panel-head"><div><h2><Megaphone size={18} />{t('navMessages')}</h2><p>{t('messagesDescription')}</p></div></div><div className="management-body"><label className="message-destination">{t('messageDestination')}<select value={code} onChange={event => setCode(event.target.value)}><option value="">{t('allRooms')}</option>{games.map(game => <option key={game.code} value={game.code}>{game.code} · {game.hostName ?? t('unknown')}</option>)}{code && !games.some(game => game.code === code) && <option value={code}>{code} · {t('roomOffline')}</option>}</select></label><MessageComposer key={code} connection={connection} code={code || undefined} /></div></section>
}

export function ServerInfoPanel({ connection }: { connection: Connection }) {
  const { t } = useTranslation()
  const query = useQuery({ queryKey: ['server-info', connection], queryFn: ({ signal }) => fetchServerInfo(connection, signal), retry: false })
  const data = query.data
  return <section className="dashboard-panel system-panel"><div className="dashboard-panel-head"><div><h2><Info size={18} />{t('navSystem')}</h2><p>{t('systemDescription')}</p></div></div>{query.isError ? <p className="setup-error" role="alert">{errorMessage(query.error)}</p> : !data ? <div className="dashboard-empty">{t('loadingServerInfo')}</div> : <dl className="system-grid">{[
    [t('serverBuild'), data.serverVersion], [t('runtime'), data.runtime], [t('operatingSystem'), data.operatingSystem],
    [t('architecture'), data.architecture], [t('processId'), data.processId], [t('logicalProcessors'), data.processorCount],
    [t('apiAssembly'), data.apiAssemblyVersion],
  ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? t('unknown')}</dd></div>)}</dl>}</section>
}

export function PlayerDetails({ player, connection }: { player: Player; connection: Connection }) {
  const { t } = useTranslation()
  const [ban, setBan] = useState(false)
  return <><dl className="system-grid player-details">{[[t('player'), player.name], [t('ipAddress'), player.address], [t('friendCode'), player.friendCode], [t('clientVersion'), player.version], [t('clientPlatform'), player.platform], [t('clientLanguage'), player.language]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || t('unknown')}</dd></div>)}</dl><p className="modal-copy">{t('friendCodeNote')}</p>{(player.address || player.friendCode) && <button className="danger-btn" onClick={() => setBan(!ban)}><Ban size={14} />{t('addServerBan')}</button>}{ban && <BanEditor connection={connection} initial={{ kind: player.address ? 'ip' : 'friendCode', value: player.address ?? player.friendCode ?? '' }} onSaved={() => setBan(false)} />}</>
}
