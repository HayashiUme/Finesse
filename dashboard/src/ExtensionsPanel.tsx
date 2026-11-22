import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Blocks, LoaderCircle, Play, RefreshCw } from 'lucide-react'
import { fetchExtensionPage, fetchExtensions, runExtensionAction } from './api'
import type { Connection, ExtensionAction, ExtensionPage, ExtensionSummary } from './types'
import { errorMessage } from './i18n'
import './extensions.css'

function readPath(value: unknown, path?: string | null): unknown {
  if (!path) return value
  return path.split('.').reduce<unknown>((current, key) => current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined, value)
}

function displayValue(value: unknown): string {
  if (value == null) return '—'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

export default function ExtensionsPanel({ connection, canManage }: { connection: Connection; canManage: boolean }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [selection, setSelection] = useState<{ plugin: ExtensionSummary; page: ExtensionPage } | null>(null)
  const extensions = useQuery({ queryKey: ['extensions', connection], queryFn: ({ signal }) => fetchExtensions(connection, signal), retry: false })
  const page = useQuery({
    queryKey: ['extension-page', connection, selection?.plugin.id, selection?.page.id],
    queryFn: ({ signal }) => fetchExtensionPage(connection, selection!.plugin.id, selection!.page.id, signal),
    enabled: Boolean(selection), retry: false,
  })
  const action = useMutation({
    mutationFn: (item: ExtensionAction) => runExtensionAction(connection, selection!.plugin.id, item.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['extension-page', connection, selection?.plugin.id, selection?.page.id] }),
  })
  const sections = selection?.page.sections ?? []
  const data = page.data?.data
  const error = extensions.error ?? page.error ?? action.error
  const selectedPlugin = useMemo(() => extensions.data?.find(plugin => plugin.id === selection?.plugin.id), [extensions.data, selection?.plugin.id])

  if (selection && selectedPlugin) {
    const activePage = selectedPlugin.pages.find(item => item.id === selection.page.id) ?? selection.page
    return <section className="extension-workspace">
      <div className="extension-heading"><button className="secondary-btn" onClick={() => { setSelection(null); action.reset() }}><ArrowLeft size={15} />{t('extensionsBack')}</button><div><h2>{selectedPlugin.name} / {activePage.title}</h2><p>{activePage.description ?? selectedPlugin.description}</p></div><button className="tool-btn" title={t('refresh')} onClick={() => void page.refetch()} disabled={page.isFetching}><RefreshCw size={15} className={page.isFetching ? 'spin' : ''} /></button></div>
      {error && <div className="setup-error" role="alert">{errorMessage(error)}</div>}
      {page.isPending ? <div className="extension-empty"><LoaderCircle className="spin" />{t('checkingServer')}</div> : <div className="extension-sections">
        {sections.map((section, index) => {
          const value = readPath(data, section.dataPath)
          if (section.type === 'json') return <section className="extension-section" key={`${section.title}-${index}`}><h3>{section.title}</h3><pre>{JSON.stringify(value, null, 2) ?? 'null'}</pre></section>
          if (section.type === 'table') {
            const rows = Array.isArray(value) ? value : []
            const columns = section.columns?.length ? section.columns : rows[0] && typeof rows[0] === 'object' ? Object.keys(rows[0]) : []
            return <section className="extension-section" key={`${section.title}-${index}`}><h3>{section.title}</h3>{rows.length ? <div className="extension-table-wrap"><table className="extension-table"><thead><tr>{columns.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{columns.map(column => <td key={column}>{displayValue((row as Record<string, unknown>)?.[column])}</td>)}</tr>)}</tbody></table></div> : <p>{t('extensionsNoRows')}</p>}</section>
          }
          const stats = value && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value as Record<string, unknown>) : Array.isArray(value) ? value.map((item, itemIndex) => [String(itemIndex + 1), item] as [string, unknown]) : [['Value', value] as [string, unknown]]
          return <section className="extension-section" key={`${section.title}-${index}`}><h3>{section.title}</h3><div className="extension-stats">{stats.map(([label, statistic]) => <div className="extension-stat" key={label}><span>{label}</span><b>{displayValue(statistic)}</b></div>)}</div></section>
        })}
      </div>}
      {activePage && selectedPlugin.actions.length > 0 && <section className="extension-actions"><h3>{t('extensionsActions')}</h3>{selectedPlugin.actions.map(item => <button className={item.mutating ? 'danger-btn' : 'secondary-btn'} key={item.id} disabled={action.isPending || (item.mutating && !canManage)} title={item.mutating && !canManage ? t('superAdminRequired') : undefined} onClick={() => { if (item.mutating && !canManage) return; if (item.confirm && !window.confirm(item.confirm)) return; action.mutate(item) }}>{action.isPending ? <LoaderCircle size={15} className="spin" /> : <Play size={15} />}{item.label}</button>)}</section>}
    </section>
  }

  return <section className="extension-workspace">
    <div className="extension-heading"><div><h2>{t('extensionsTitle')}</h2><p>{t('extensionsDescription')}</p></div><button className="tool-btn" title={t('refresh')} onClick={() => void extensions.refetch()} disabled={extensions.isFetching}><RefreshCw size={15} className={extensions.isFetching ? 'spin' : ''} /></button></div>
    {error && <div className="setup-error" role="alert">{errorMessage(error)}</div>}
    {extensions.isPending ? <div className="extension-empty"><LoaderCircle className="spin" />{t('checkingServer')}</div> : extensions.data?.length ? <div className="extension-grid">{extensions.data.map(plugin => <article className="extension-card" key={plugin.id}><div className="extension-card-icon"><Blocks size={18} /></div><div className="extension-card-copy"><h3>{plugin.name}</h3><span>{plugin.id} · v{plugin.version}</span><p>{plugin.description}</p></div><div className="extension-page-links">{plugin.pages.map(item => <button className="secondary-btn" key={item.id} onClick={() => setSelection({ plugin, page: item })}>{item.title}</button>)}</div></article>)}</div> : <div className="extension-empty"><Blocks size={22} /><span>{t('extensionsEmpty')}</span></div>}
  </section>
}
