import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en'
import zhCN from './locales/zh-CN'

export const languages = ['zh-CN', 'en'] as const
export type Language = typeof languages[number]
export type TranslationKey = keyof typeof en
const storageKey = 'finesse-language'

function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(storageKey)
    if (languages.includes(saved as Language)) return saved as Language
  } catch { /* Language switching still works when storage is unavailable. */ }
  for (const language of navigator.languages ?? [navigator.language]) {
    if (language.toLowerCase().startsWith('zh')) return 'zh-CN'
    if (language.toLowerCase().startsWith('en')) return 'en'
  }
  return 'zh-CN'
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, 'zh-CN': { translation: zhCN } },
  lng: initialLanguage(),
  fallbackLng: 'zh-CN',
  supportedLngs: [...languages],
  interpolation: { escapeValue: false },
})

function updateDocument() {
  document.documentElement.lang = i18n.resolvedLanguage ?? 'zh-CN'
  document.title = i18n.t('appTitle')
}
i18n.on('languageChanged', updateDocument)
updateDocument()

export function changeLanguage(language: Language) {
  try { localStorage.setItem(storageKey, language) } catch { /* Keep the in-memory preference. */ }
  void i18n.changeLanguage(language)
}

// Keep error keys until render time so existing errors change language too.
export class LocalizedError extends Error {
  constructor(public readonly key: TranslationKey, public readonly values: Record<string, string | number> = {}) {
    super(key)
    this.name = 'LocalizedError'
  }
}

export function errorMessage(error: unknown, fallback: 'errorOperation' | 'errorConnection' = 'errorOperation'): string {
  if (error instanceof LocalizedError) return i18n.t(error.key, { ...error.values, defaultValue: en[error.key] })
  return error instanceof Error ? error.message : i18n.t(fallback)
}

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: { translation: typeof en }
  }
}

export default i18n
