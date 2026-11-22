import { LocalizedError } from './i18n'
import type { AuditEntry, Connection, Snapshot, AuthUser, AuthChallenge, LoginResponse, ManagedUser, ReportFeed, BanFeed, BanRequest, CommandResult, ServerInfo, PluginInfo, ExtensionSummary, ExtensionPageData } from './types'

export function normalizeConnection(value: Connection, enforceHttps = true): Connection {
  const name = value.name.trim()
  if (!name) throw new LocalizedError('errorRequired')
  let url: URL
  try { url = new URL(value.baseUrl.trim()) } catch { throw new LocalizedError('errorUrl') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new LocalizedError('errorUrlFormat')
  }
  if (enforceHttps && window.location.protocol === 'https:' && url.protocol === 'http:') {
    throw new LocalizedError('errorHttps')
  }
  return { name, baseUrl: url.toString().replace(/\/+$/, '') }
}

export function hasSecureTransport(connection: Connection): boolean {
  const secure = (url: URL) => url.protocol === 'https:' || (url.protocol === 'http:' &&
    (url.hostname === 'localhost' || url.hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(url.hostname)))
  try { return secure(new URL(connection.baseUrl)) && secure(new URL(window.location.href)) }
  catch { return false }
}

async function request(connection: Connection, path: string, body?: object, post: boolean | 'PUT' | 'DELETE' = false, signal?: AbortSignal): Promise<string> {
  const normalized = normalizeConnection(connection)
  if ((connection.token || connection.apiKey || path.startsWith('/api/v1/auth/')) && !hasSecureTransport(normalized)) {
    throw new LocalizedError('errorSecureTransport')
  }
  const controller = new AbortController()
  const cancel = () => controller.abort()
  if (signal?.aborted) cancel()
  signal?.addEventListener('abort', cancel, { once: true })
  const timer = window.setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch(`${normalized.baseUrl}${path}`, {
      method: typeof post === 'string' ? post : post ? 'POST' : 'GET',
      headers: { ...(connection.token ? { Authorization: `Bearer ${connection.token}` } : connection.apiKey ? { 'X-Api-Key': connection.apiKey } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    })
    if (!response.ok) {
      let detail: { error?: string; challenge?: AuthChallenge; retryAfterSeconds?: number } = {}
      try { detail = await response.json() } catch { /* Fall back to HTTP errors for older plugins. */ }
      if (path.includes('/auth/login/')) {
        if ((response.status === 401 && ['invalidCredentials', 'captchaInvalid'].includes(detail.error ?? '')) ||
            (response.status === 429 && detail.error === 'lockedOut')) {
          throw new LoginError(detail.error!, detail.challenge, detail.retryAfterSeconds ?? 0)
        }
        if ([401, 404, 405].includes(response.status)) throw new LocalizedError('errorLoginUnavailable')
      }
      if (response.status === 401 && connection.token) window.dispatchEvent(new CustomEvent('finesse-session-expired', { detail: connection.token }))
      const key = authErrorKeys[(detail.error ?? '') as keyof typeof authErrorKeys]
      if (key) throw new LocalizedError(key)
      if (response.status === 401) throw new LocalizedError('errorUnauthorized')
      if (response.status === 403) throw new LocalizedError('errorForbidden')
      if (response.status === 404) throw new LocalizedError('errorNotFound')
      if (response.status === 409) throw new LocalizedError('errorConflict')
      throw new LocalizedError('errorHttp', { status: response.status })
    }
    return await response.text()
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError')
    if (controller.signal.aborted) throw new LocalizedError('errorTimeout')
    if (error instanceof TypeError) throw new LocalizedError('errorNetwork')
    throw error
  } finally { window.clearTimeout(timer); signal?.removeEventListener('abort', cancel) }
}

async function getJson<T>(connection: Connection, path: string, signal?: AbortSignal): Promise<T> {
  const response = await request(connection, path, undefined, false, signal)
  try { return JSON.parse(response) as T } catch { throw new LocalizedError('errorJson') }
}

export function isSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== 'object') return false
  const s = value as Snapshot
  return s.status === 'online' && ['uptimeSeconds', 'onlinePlayers', 'activeGames', 'totalGames'].every(k => typeof (s as unknown as Record<string, unknown>)[k] === 'number') &&
    typeof s.pluginVersion === 'string' && Array.isArray(s.games) && Array.isArray(s.players) &&
    s.players.every(p => p && typeof p.name === 'string' && typeof p.clientId === 'number') &&
    s.games.every(g => g && typeof g.code === 'string' && typeof g.state === 'string' && Array.isArray(g.players))
}

export async function fetchSnapshot(connection: Connection, signal?: AbortSignal): Promise<Snapshot> {
  const [overview, games, players] = await Promise.all([
    getJson<Omit<Snapshot, 'games' | 'players'>>(connection, '/api/v1/overview', signal),
    getJson<Snapshot['games']>(connection, '/api/v1/games', signal),
    getJson<Snapshot['players']>(connection, '/api/v1/players', signal),
  ])
  const snapshot = { ...overview, games, players }
  if (!isSnapshot(snapshot)) throw new LocalizedError('errorSnapshot')
  return snapshot
}

export async function playerAction(connection: Connection, id: number, action: 'kick' | 'ban', reason?: string) {
  await request(connection, `/api/v1/players/${id}/${action}`, action === 'kick' ? { reason: reason ?? '' } : undefined, true)
}

export async function gameAction(connection: Connection, code: string, action: 'privacy' | 'close', isPublic?: boolean) {
  await request(connection, `/api/v1/games/${encodeURIComponent(code)}/${action}`, action === 'privacy' ? { isPublic } : undefined, true)
}

export async function fetchOverview(connection: Connection, signal?: AbortSignal) {
  const overview = await getJson<Omit<Snapshot, 'games' | 'players'>>(connection, '/api/v1/overview', signal)
  if (!isSnapshot({ ...overview, games: [], players: [] })) throw new LocalizedError('errorSnapshot')
  return overview
}

export const fetchAudit = (connection: Connection, signal?: AbortSignal) => getJson<AuditEntry[]>(connection, '/api/v1/audit', signal)
export const fetchReports = (connection: Connection, signal?: AbortSignal) => getJson<ReportFeed>(connection, '/api/v1/reports', signal)


const authErrorKeys = {
  banInvalid: 'banInvalid', banLimit: 'banLimit', banStoreUnavailable: 'banStoreUnavailable', messageInvalid: 'messageInvalid',
  usernameInvalid: 'usernameInvalid', passwordPolicy: 'passwordPolicy', usernameTaken: 'usernameTaken',
  userLimitReached: 'userLimitReached', avatarInvalid: 'avatarInvalid', accountStoreUnavailable: 'accountStoreUnavailable',
  superAdminRequired: 'superAdminRequired', userNotFound: 'errorNotFound', sessionExpired: 'errorUnauthorized',
  kickReasonInvalid: 'kickReasonInvalid', pluginManagerUnavailable: 'pluginManagerUnavailable', pluginNotFound: 'pluginNotFound',
  pluginSelfManagementBlocked: 'pluginSelfManagementBlocked', pluginFileMissing: 'pluginFileMissing',
  pluginInstanceUnavailable: 'pluginInstanceUnavailable', pluginFileUnavailable: 'pluginFileUnavailable', pluginDeleteFailed: 'pluginDeleteFailed',
  interfaceKeyNameInvalid: 'interfaceKeyNameInvalid', interfaceKeyScopesInvalid: 'interfaceKeyScopesInvalid',
  interfaceKeyLimitReached: 'interfaceKeyLimitReached', interfaceKeyNotFound: 'errorNotFound',
  xApiSettingsInvalid: 'xApiSettingsInvalid', helloPageInvalid: 'helloPageInvalid', interfaceStoreUnavailable: 'interfaceStoreUnavailable',
} as const
export type InterfaceApiKey = { id: string; name: string; prefix: string; scopes: string[]; createdAt: string }
export type XApiSettings = { enabled: boolean; includePrivateGames: boolean; regionId: string; regionName: string; regionUrl: string; helloPageEnabled: boolean }
export type InterfaceSettings = { apiKeys: InterfaceApiKey[]; xApi: XApiSettings; helloPageEnabled: boolean }
export type CreatedInterfaceApiKey = { key: InterfaceApiKey; secret: string }
export const fetchInterfaceSettings = (connection: Connection, signal?: AbortSignal) => getJson<InterfaceSettings>(connection, '/api/v1/interface', signal)
export const fetchXApiPreview = (connection: Connection, signal?: AbortSignal) => getJson<unknown>(connection, '/api/v1/interface/x-api/preview', signal)
export const createInterfaceApiKey = async (connection: Connection, name: string, scopes: string[]) =>
  JSON.parse(await request(connection, '/api/v1/interface/keys', { name, scopes }, true)) as CreatedInterfaceApiKey
export const deleteInterfaceApiKey = (connection: Connection, id: string) => request(connection, `/api/v1/interface/keys/${encodeURIComponent(id)}`, undefined, 'DELETE')
export const updateXApiSettings = async (connection: Connection, settings: XApiSettings) =>
  JSON.parse(await request(connection, '/api/v1/interface/x-api', settings, 'PUT')) as XApiSettings
export const saveHelloPage = async (connection: Connection, html: string) =>
  JSON.parse(await request(connection, '/api/v1/interface/hello', { html }, 'PUT')) as InterfaceSettings
export const deleteHelloPage = (connection: Connection) => request(connection, '/api/v1/interface/hello', undefined, 'DELETE')

export class LoginError extends Error {
  constructor(public code: string, public challenge?: AuthChallenge, public retryAfterSeconds = 0) { super(code) }
}
export async function login(connection: Connection, mode: 'admin' | 'superadmin', credentials: object): Promise<LoginResponse> {
  return JSON.parse(await request(connection, `/api/v1/auth/login/${mode}`, credentials, true))
}
export const fetchMe = (connection: Connection) => getJson<{ user: AuthUser }>(connection, '/api/v1/auth/me')
export const logout = (connection: Connection) => request(connection, '/api/v1/auth/logout', undefined, true)
export const fetchUsers = (connection: Connection) => getJson<ManagedUser[]>(connection, '/api/v1/auth/users')
export const createUser = async (connection: Connection, username: string, password: string, avatar: string | null) => {
  return JSON.parse(await request(connection, '/api/v1/auth/users', { username, password, avatar }, true)) as ManagedUser
}
export const deleteUser = (connection: Connection, id: string) => request(connection, `/api/v1/auth/users/${encodeURIComponent(id)}`, undefined, 'DELETE')
export const updateAvatar = async (connection: Connection, avatar: string | null): Promise<{ user: AuthUser }> => {
  return JSON.parse(await request(connection, '/api/v1/auth/me/avatar', { avatar }, 'PUT'))
}

export const fetchBans = (connection: Connection, signal?: AbortSignal) => getJson<BanFeed>(connection, '/api/v1/bans', signal)
export const addBan = async (connection: Connection, ban: BanRequest): Promise<CommandResult> => JSON.parse(await request(connection, '/api/v1/bans', ban, true))
export const removeBan = (connection: Connection, id: string) => request(connection, '/api/v1/bans/' + encodeURIComponent(id), undefined, 'DELETE')
export const sendMessage = async (connection: Connection, message: string, code?: string): Promise<CommandResult> => JSON.parse(await request(connection, code ? '/api/v1/games/' + encodeURIComponent(code) + '/message' : '/api/v1/broadcast', { message }, true))
export const fetchServerInfo = (connection: Connection, signal?: AbortSignal) => getJson<ServerInfo>(connection, '/api/v1/server', signal)
export const fetchPlugins = (connection: Connection, signal?: AbortSignal) => getJson<PluginInfo[]>(connection, '/api/v1/plugins', signal)
export const setPluginEnabled = async (connection: Connection, id: string, enabled: boolean) =>
  JSON.parse(await request(connection, `/api/v1/plugins/${encodeURIComponent(id)}/${enabled ? 'enable' : 'disable'}`, {}, true)) as PluginInfo
export const deletePlugin = async (connection: Connection, id: string) =>
  JSON.parse(await request(connection, `/api/v1/plugins/${encodeURIComponent(id)}`, undefined, 'DELETE')) as PluginInfo

export const fetchExtensions = (connection: Connection, signal?: AbortSignal) => getJson<ExtensionSummary[]>(connection, '/api/v1/extensions', signal)
export const fetchExtensionPage = (connection: Connection, pluginId: string, pageId: string, signal?: AbortSignal) =>
  getJson<ExtensionPageData>(connection, `/api/v1/extensions/${encodeURIComponent(pluginId)}/pages/${encodeURIComponent(pageId)}`, signal)
export const runExtensionAction = (connection: Connection, pluginId: string, actionId: string, payload: object = {}) =>
  request(connection, `/api/v1/extensions/${encodeURIComponent(pluginId)}/actions/${encodeURIComponent(actionId)}`, payload, true)
