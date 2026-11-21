import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { Presence, Toast } from './Motion'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { fetchMe, logout } from './api'
import { loadServerRegistry } from './connections'
import type { AuthSession, AuthUser, PanelLogin, SavedServer } from './types'

const storageKey = 'finesse-auth-sessions'
function restore(): Record<string, AuthSession> {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? '{}')
    const sessions: Record<string, AuthSession> = {}
    for (const [id, value] of Object.entries(saved)) {
      const session = value as AuthSession
      if (typeof session?.token === 'string' && Date.parse(session.expiresAt) > Date.now() && session.user?.username) sessions[id] = session
    }
    return sessions
  } catch { return {} }
}
type AuthContextValue = {
  sessions: Record<string, AuthSession>; checking: boolean
  signedIn: (server: SavedServer, session: AuthSession, login: PanelLogin) => void
  signOut: (server: SavedServer) => Promise<void>
  forget: (id: string) => void
  setUser: (id: string, user: AuthUser) => void
}
const AuthContext = createContext<AuthContextValue | null>(null)
export const useAuth = () => useContext(AuthContext)!

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const sessionsRef = useRef<Record<string, AuthSession> | null>(null)
  if (!sessionsRef.current) sessionsRef.current = restore()
  const [sessions, setSessions] = useState(sessionsRef.current)
  const [checking, setChecking] = useState(true)
  const [notice, setNotice] = useState<PanelLogin | null>(null)
  const [logoutWarning, setLogoutWarning] = useState(false)
  const updateSessions = (update: (previous: Record<string, AuthSession>) => Record<string, AuthSession>) => {
    const next = update(sessionsRef.current!)
    sessionsRef.current = next
    try {
      if (Object.keys(next).length) sessionStorage.setItem(storageKey, JSON.stringify(next))
      else sessionStorage.removeItem(storageKey)
    } catch { /* The current tab can still use sessions in memory. */ }
    setSessions(next)
  }
  const clearQueries = () => { void queryClient.cancelQueries(); queryClient.clear() }
  const forget = (id: string) => { updateSessions(previous => { const next = { ...previous }; delete next[id]; return next }); setNotice(null); clearQueries() }

  useEffect(() => {
    const nextExpiry = Math.min(...Object.values(sessions).map(session => Date.parse(session.expiresAt)))
    if (!Number.isFinite(nextExpiry)) return
    const timer = window.setTimeout(() => {
      updateSessions(previous => Object.fromEntries(Object.entries(previous).filter(([, session]) => Date.parse(session.expiresAt) > Date.now())))
      clearQueries()
    }, Math.max(0, nextExpiry - Date.now()))
    return () => window.clearTimeout(timer)
  }, [sessions])

  useEffect(() => {
    let active = true
    updateSessions(previous => previous) // Persist pruning of expired or malformed saved sessions.
    const registry = loadServerRegistry()
    void Promise.all(Object.entries(sessions).map(async ([id, session]) => {
      const server = registry.servers.find(item => item.id === id)
      if (!server) { if (active) forget(id); return }
      try {
        const { user } = await fetchMe({ ...server, token: session.token })
        if (active) updateSessions(previous => previous[id]?.token === session.token ? { ...previous, [id]: { ...session, user } } : previous)
      } catch { /* Unauthorized responses invalidate the session; offline servers remain retryable. */ }
    })).finally(() => { if (active) setChecking(false) })
    const expired = (event: Event) => {
      const token = (event as CustomEvent<string>).detail
      updateSessions(previous => Object.fromEntries(Object.entries(previous).filter(([, session]) => session.token !== token)))
      clearQueries()
    }
    window.addEventListener('finesse-session-expired', expired)
    return () => { active = false; window.removeEventListener('finesse-session-expired', expired) }
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 3000)
    return () => window.clearTimeout(timer)
  }, [notice])

  return <AuthContext.Provider value={{ sessions, checking, forget,
    signedIn: (server, session, login) => { clearQueries(); updateSessions(previous => ({ ...previous, [server.id]: session })); setLogoutWarning(false); setNotice(login) },
    signOut: async server => {
      const session = sessionsRef.current![server.id]
      forget(server.id)
      setLogoutWarning(false)
      try { if (session) await logout({ ...server, token: session.token }) }
      catch { setLogoutWarning(true) }
    },
    setUser: (id, user) => updateSessions(previous => previous[id] ? { ...previous, [id]: { ...previous[id], user } } : previous),
  }}>{children}<Presence>{notice && <Toast className="login-toast"><div><b>{t('panelLoginTitle')}</b><p>{t('loginIp')}: {notice.ip}</p><p>{t('loginLocation')}: {notice.location === 'local' ? t('loginLocationLocal') : notice.location ?? t('loginLocationUnavailable')}</p><small>{new Date(notice.timestamp).toLocaleString(i18n.resolvedLanguage)}</small></div></Toast>}</Presence><Presence>{logoutWarning && <Toast className="login-toast" role="alert" onDismiss={() => setLogoutWarning(false)}><span>{t('signOutOffline')}</span></Toast>}</Presence></AuthContext.Provider>
}
