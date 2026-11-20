import { useTranslation } from 'react-i18next'
import type { ProcessMetrics } from './types'

export default function ProcessGauge({ kind, metrics }: { kind: 'cpu' | 'memory'; metrics?: ProcessMetrics }) {
  const { t, i18n } = useTranslation()
  const percent = kind === 'cpu' ? metrics?.cpuPercent : metrics?.memoryPercent
  const available = typeof percent === 'number' && Number.isFinite(percent)
  const unavailableLabel = metrics && kind === 'cpu' ? 'metricsSampling' : 'metricsUnavailable'
  const value = available ? Math.min(100, Math.max(0, percent)) : 0
  const decimal = (n: number) => new Intl.NumberFormat(i18n.resolvedLanguage, { maximumFractionDigits: 1 }).format(n)
  const memory = (bytes: number) => bytes >= 1024 ** 3 ? decimal(bytes / 1024 ** 3) + ' GiB' : decimal(bytes / 1024 ** 2) + ' MiB'
  const label = t(kind === 'cpu' ? 'processCpu' : 'processMemory')
  const caption = kind === 'cpu'
    ? metrics ? t('cpuCoreBasis', { count: metrics.processorCount }) : t('metricsUnavailable')
    : metrics ? t('memoryWorkingSet', { value: memory(metrics.workingSetBytes) }) : t('metricsUnavailable')
  return <div className={'dashboard-metric process-gauge ' + kind}>
    <div className="process-gauge-label"><strong>{label}</strong><span>{t('impostorProcess')}</span></div>
    <div className="process-gauge-ring" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={available ? value : undefined} aria-valuetext={available ? decimal(value) + '% · ' + caption : t(unavailableLabel)}>
      <svg viewBox="0 0 112 112" aria-hidden="true"><circle className="gauge-track" cx="56" cy="56" r="46" /><circle className="gauge-fill" cx="56" cy="56" r="46" pathLength="100" strokeDasharray={value + ' 100'} /></svg>
      <div className="gauge-reading"><b>{available ? decimal(value) : '—'}{available && <small>%</small>}</b><span>{t(available ? 'processUsage' : unavailableLabel)}</span></div>
    </div>
    <small className="gauge-caption">{caption}</small>
    {kind === 'memory' && metrics && <small className="gauge-basis">{metrics.physicalMemoryBytes ? t('memoryPhysicalBasis', { value: memory(metrics.physicalMemoryBytes) }) : t('memoryBasisUnavailable')}</small>}
  </div>
}
