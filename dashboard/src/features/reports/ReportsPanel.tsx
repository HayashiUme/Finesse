import { useState } from 'react'
import { Flag, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { fetchReports } from '../../lib/api.ts'
import { errorMessage, type TranslationKey } from '../../localization/i18n.ts'
import type { Connection } from '../../types/types.ts'

const reasons: Record<string, Extract<TranslationKey, 'reportInappropriateName' | 'reportInappropriateChat' | 'reportCheating' | 'reportHarassment'>> = {
  InappropriateName: 'reportInappropriateName', InappropriateChat: 'reportInappropriateChat',
  Cheating_Hacking: 'reportCheating', Harassment_Misconduct: 'reportHarassment',
}
const outcomes: Record<string, Extract<TranslationKey, 'reportRecorded' | 'reportUnknown' | 'reportNoAccount' | 'reportNotFound' | 'reportRateLimited'>> = {
  Reported: 'reportRecorded', NotReportedUnknown: 'reportUnknown', NotReportedNoAccount: 'reportNoAccount',
  NotReportedNotFound: 'reportNotFound', NotReportedRateLimit: 'reportRateLimited',
}

export default function ReportsPanel({ connection }: { connection: Connection }) {
  const { t, i18n } = useTranslation()
  const [search, setSearch] = useState('')
  const query = useQuery({ queryKey: ['reports', connection], queryFn: ({ signal }) => fetchReports(connection, signal), refetchInterval: 1000, retry: false })
  const feed = query.data
  const reports = (feed?.reports ?? []).filter(r => (r.reporterName + ' ' + (r.reportedName ?? '') + ' ' + r.gameCode).toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  return <section className="dashboard-panel reports-panel">
    <div className="dashboard-panel-head"><div><h2><Flag size={15} />{t('playerReports')}<span className="count-tag">{feed?.reports.length ?? '—'}</span></h2></div><label className="search-box"><Search size={15} /><input aria-label={t('searchReports')} placeholder={t('searchReports')} value={search} onChange={e => setSearch(e.target.value)} /></label></div>
    {query.isError && <div className="report-warning" role="status">{t('reportsUnavailable')} {errorMessage(query.error)}</div>}
    {feed && !feed.available && <div className="report-warning" role="status">{t('reportsReceptionUnavailable')}</div>}
    {feed && !feed.persistenceAvailable && <div className="report-warning" role="status">{t('reportsStorageUnavailable')}</div>}
    {query.isPending ? <div className="dashboard-empty">{t('loadingReports')}</div> : reports.length ? <div className="table-wrap report-table"><table><thead><tr><th>{t('time')}</th><th>{t('reporter')}</th><th>{t('reportedPlayer')}</th><th>{t('room')}</th><th>{t('reportReason')}</th><th>{t('result')}</th></tr></thead><tbody>{reports.map((report, index) => <tr key={report.time + '-' + index}>
      <td><time dateTime={report.time}>{new Date(report.time).toLocaleString(i18n.resolvedLanguage)}</time></td>
      <td><b>{report.reporterName || t('unknown')}</b>{report.reporterFriendCode && <small>{report.reporterFriendCode}</small>}</td>
      <td><b>{report.reportedName || t('unknown')}</b>{report.reportedFriendCode && <small>{report.reportedFriendCode}</small>}</td>
      <td><code>{report.gameCode}</code></td><td><span className="report-reason">{reasons[report.reason] ? t(reasons[report.reason]) : report.reason}</span></td>
      <td>{outcomes[report.outcome] ? t(outcomes[report.outcome]) : report.outcome}</td>
    </tr>)}</tbody></table></div> : !query.isError && <div className="dashboard-empty"><Flag size={20} /><span>{t(search ? 'noMatchingReports' : 'noReports')}</span></div>}
  </section>
}
