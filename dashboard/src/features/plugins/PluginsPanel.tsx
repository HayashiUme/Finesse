import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, PackageOpen, Plug, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { deletePlugin, fetchPlugins, setPluginEnabled } from '../../lib/api.ts'
import { errorMessage } from '../../localization/i18n.ts'
import type { Connection } from '../../types/types.ts'

export default function PluginsPanel({ connection, canManage }: { connection: Connection; canManage: boolean }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [notice, setNotice] = useState('')
  const query = useQuery({
    queryKey: ['plugins', connection],
    queryFn: ({ signal }) => fetchPlugins(connection, signal),
    retry: false,
    refetchInterval: 5000,
  })
  const mutation = useMutation({
    mutationFn: async ({ id, enabled, remove }: { id: string; enabled?: boolean; remove?: boolean }) =>
      remove ? deletePlugin(connection, id) : setPluginEnabled(connection, id, Boolean(enabled)),
    onSuccess: async (plugin, variables) => {
      setNotice(t(variables.remove ? 'pluginRemovedNotice' : variables.enabled ? 'pluginEnabledNotice' : 'pluginDisabledNotice', { name: plugin.name }))
      await queryClient.invalidateQueries({ queryKey: ['plugins', connection] })
    },
  })

  function remove(id: string, name: string) {
    if (!canManage || mutation.isPending || !window.confirm(t('confirmPluginDelete', { name }))) return
    setNotice('')
    mutation.mutate({ id, remove: true })
  }

  function toggle(id: string, enabled: boolean) {
    if (!canManage || mutation.isPending) return
    setNotice('')
    mutation.mutate({ id, enabled })
  }

  return <section className="section-block plugins-panel">
    <div className="section-head"><div><div className="section-title"><h2>{t('navPlugins')}</h2>{query.data && <span className="count-tag">{query.data.length}</span>}</div></div><button className="tool-btn" title={t('refresh')} aria-label={t('refresh')} onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw size={15} /></button></div>
    {!canManage && <div className="plugin-admin-note"><ShieldAlert size={16} /><span>{t('pluginAdminOnly')}</span></div>}
    {mutation.isError && <div className="setup-error" role="alert">{errorMessage(mutation.error)}</div>}
    {notice && <p className="plugin-notice" role="status">{notice}</p>}
    {query.isError ? <div className="setup-error" role="alert">{errorMessage(query.error)}</div> : query.isPending ? <div className="empty-state"><LoaderCircle className="spin" size={19} />{t('loadingPlugins')}</div> : query.data?.length ? <div className="table-wrap"><table><thead><tr><th>{t('pluginName')}</th><th>{t('pluginAuthor')}</th><th>{t('pluginVersion')}</th><th>{t('actions')}</th></tr></thead><tbody>{query.data.map(plugin => <tr key={plugin.id}>
      <td><div className="plugin-name-cell"><Plug size={15} /><span><b>{plugin.name}</b><small>{plugin.id}</small></span></div></td>
      <td>{plugin.author || '—'}</td><td>{plugin.version || '—'}</td>
      <td><div className="plugin-actions">{plugin.canManage && plugin.filePresent !== false && <button className="secondary-btn" disabled={!canManage || mutation.isPending} onClick={() => toggle(plugin.id, !plugin.enabled)}>{t(plugin.enabled ? 'pluginDisable' : 'pluginEnable')}</button>}{plugin.canManage && plugin.filePresent === true && <button className="danger-btn" title={t('pluginDelete')} aria-label={t('pluginDelete')} disabled={!canManage || mutation.isPending} onClick={() => remove(plugin.id, plugin.name)}><Trash2 size={14} />{t('pluginDelete')}</button>}{!plugin.canManage && <span className="plugin-protected">{t('pluginProtected')}</span>}</div></td>
    </tr>)}</tbody></table></div> : <div className="empty-state"><PackageOpen size={21} /><span>{t('noPlugins')}</span></div>}
  </section>
}
