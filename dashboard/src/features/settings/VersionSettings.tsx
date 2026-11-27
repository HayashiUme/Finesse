import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowDownToLine, Check, CircleAlert, LoaderCircle, PackageCheck, RefreshCw } from 'lucide-react'
import { fetchSnapshot } from '../../lib/api.ts'
import type { Connection } from '../../types/types.ts'

const releaseEndpoint = 'https://api.github.com/repos/HayashiUme/Finesse/releases'
type Release = { tag_name: string; html_url: string; prerelease: boolean; published_at: string; assets: Array<{ name: string; browser_download_url: string }> }

async function fetchLatestRelease(development: boolean): Promise<Release | undefined> {
  const response = await fetch(development ? `${releaseEndpoint}?per_page=100` : `${releaseEndpoint}/latest`, { headers: { Accept: 'application/vnd.github+json' } })
  if (!response.ok) throw new Error(`GitHub release check failed (${response.status})`)
  const releases = await response.json() as Release[] | Release
  return (Array.isArray(releases) ? releases.find(release => release.prerelease) : releases)
}

function isNewer(candidate: string, current: string) {
  const parse = (version: string) => {
    const [core, suffix = ''] = version.replace(/^v/, '').split('+')[0].split('-', 2)
    return { core: core.split('.').map(part => Number(part) || 0), suffix: suffix.split('.').filter(Boolean) }
  }
  const a = parse(candidate), b = parse(current)
  for (let i = 0; i < Math.max(a.core.length, b.core.length); i++) if ((a.core[i] ?? 0) !== (b.core[i] ?? 0)) return (a.core[i] ?? 0) > (b.core[i] ?? 0)
  if (!a.suffix.length || !b.suffix.length) return !a.suffix.length && b.suffix.length > 0
  for (let i = 0; i < Math.max(a.suffix.length, b.suffix.length); i++) {
    if (a.suffix[i] === b.suffix[i]) continue
    if (a.suffix[i] === undefined) return false
    if (b.suffix[i] === undefined) return true
    const an = Number(a.suffix[i]), bn = Number(b.suffix[i])
    if (!Number.isNaN(an) && !Number.isNaN(bn)) return an > bn
    return a.suffix[i] > b.suffix[i]
  }
  return false
}

export default function VersionSettings({ connection }: { connection?: Connection }) {
  const { t } = useTranslation()
  const development = __FINESSE_VERSION__.includes('-dev')
  const release = useQuery({ queryKey: ['finesse-releases', development], queryFn: ({ queryKey }) => fetchLatestRelease(queryKey[1] as boolean), staleTime: 15 * 60_000, refetchInterval: 60 * 60_000, retry: 1 })
  const plugin = useQuery({ queryKey: ['finesse-plugin-version', connection?.baseUrl, connection?.token], queryFn: ({ signal }) => fetchSnapshot(connection!, signal), enabled: Boolean(connection?.token), staleTime: 60_000, retry: false })
  const tagVersion = release.data?.tag_name.replace(/^v/, '') ?? ''
  const panelUpdate = Boolean(tagVersion && isNewer(tagVersion, __FINESSE_VERSION__))
  const pluginUpdate = Boolean(tagVersion && plugin.data && isNewer(tagVersion, plugin.data.pluginVersion))
  const pluginTarget = plugin.data?.pluginTarget ?? 'Impostor'
  const pluginAssetName = pluginTarget === 'Empostor' ? 'Finesse.Empostor.Plugin.dll' : 'Finesse.Plugin.dll'
  const pluginAsset = release.data?.assets.find(asset => asset.name === pluginAssetName)

  return <div className="version-settings">
    <section className="preference-list version-list" aria-label={t('settingsVersion')}>
      <div className="preference-row version-row"><div className="preference-icon"><RefreshCw size={18} /></div><div className="preference-copy"><h2>{t('dashboardVersion')}</h2><p>{t('installedVersion')}</p></div><code>v{__FINESSE_VERSION__}</code></div>
      <div className="preference-row version-row"><div className="preference-icon"><PackageCheck size={18} /></div><div className="preference-copy"><h2>{t('pluginVersion')}</h2><p>{connection?.token ? plugin.data ? t('installedOnServer', { name: connection.name }) : plugin.isError ? t('pluginVersionUnavailable') : t('checkingPluginVersion') : t('connectForPluginVersion')}</p></div><code>{plugin.data ? `v${plugin.data.pluginVersion}` : '—'}</code></div>
    </section>
    <section className="version-check-section">
      <div className="section-head"><div><h2>{t('updateCheckTitle')}</h2><p>{t('updateCheckDescription')}</p></div></div>
      {release.isPending ? <div className="update-status"><LoaderCircle className="spin" size={17} /><span>{t('checkingUpdates')}</span></div> : release.isError ? <div className="update-status update-error"><CircleAlert size={17} /><span>{t('updateCheckUnavailable')}</span></div> : !release.data ? <div className="update-status"><CircleAlert size={17} /><span>{t('noReleasesFound')}</span></div> : <div className="version-results">
        {panelUpdate ? <div className="version-result"><div><b>{t('dashboardUpdate', { version: tagVersion })}</b><small>{t('dashboardAutoUpdate')}</small></div><RefreshCw size={16} /></div> : <div className="version-result version-current"><div><b>{t('dashboardVersion')}</b><small>{t('componentUpToDate')}</small></div><Check size={16} /></div>}
        {pluginUpdate ? <div className="version-result version-result-plugin"><div><b>{t('pluginUpdate', { version: tagVersion })}</b><small>{pluginAsset ? t('pluginRestartRequired', { target: pluginTarget }) : t('pluginAssetUnavailable')}</small></div>{pluginAsset && <a className="secondary-btn" href={pluginAsset.browser_download_url}><ArrowDownToLine size={15} />{t('downloadPlugin')}</a>}</div> : plugin.data ? <div className="version-result version-current"><div><b>{t('pluginVersion')}</b><small>{t('componentUpToDate')}</small></div><Check size={16} /></div> : null}
        {release.data.published_at && <p className="version-release-date">{t('latestReleaseDate', { date: new Date(release.data.published_at).toLocaleString() })}</p>}
      </div>}
      <p className="version-channel-note">{t(development ? 'nightlyChannel' : 'stableChannel')}</p>
    </section>
  </div>
}
