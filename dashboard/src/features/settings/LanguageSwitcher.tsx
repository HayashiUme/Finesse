import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { changeLanguage, type Language } from '../../localization/i18n.ts'

export default function LanguageSwitcher() {
  const { t, i18n } = useTranslation()
  return <label className="language-switcher" title={t('language')}>
    <Languages size={15} aria-hidden="true" />
    <select aria-label={t('language')} value={i18n.resolvedLanguage ?? 'zh-CN'} onChange={event => changeLanguage(event.target.value as Language)}>
      <option value="zh-CN" lang="zh-CN">简体中文</option>
      <option value="en" lang="en">English</option>
    </select>
  </label>
}
