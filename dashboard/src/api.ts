import { LocalizedError } from './i18n'
import type { AuditEntry, Connection, Snapshot } from './types'

const connectionKey = 'finesse-connection'

export function normalizeConnection(value: Connection): Connection {
  const name = value.name.trim()
  const apiKey = value.apiKey.trim()
  if (!name || !apiKey) throw new LocalizedError('errorRequired')
  let url: URL
  try { url = new URL(value.baseUrl.trim()) } catch { throw new LocalizedError('errorUrl') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new LocalizedError('errorUrlFormat')
  }
  if (window.location.protocol === 'https:' && url.protocol === 'http:') {
    throw new LocalizedError('errorHttps')
  }
  return { name, apiKey, baseUrl: url.toString().replace(/\/+$/, '') }
}

export function getConnection(): Connection | null {
  try {
    const saved = localStorage.getItem(connectionKey)
    if (!saved) return null
    const value = JSON.parse(saved) as Partial<Connection>
    if (typeof value.baseUrl !== 'string' || typeof value.apiKey !== 'string') return null
    return normalizeConnection({ name: typeof value.name === 'string' ? value.name : 'Impostor Server', baseUrl: value.baseUrl, apiKey: value.apiKey })
  } catch { return null }
}

async function request(connection: Connection, path: string, body?: object, post = false): Promise<string> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch(`${connection.baseUrl}${path}`, {
      method: post ? 'POST' : 'GET',
      headers: { 'X-Api-Key': connection.apiKey, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
    if (!response.ok) {
      if (response.status === 401) throw new LocalizedError('errorUnauthorized')
      if (response.status === 403) throw new LocalizedError('errorForbidden')
      if (response.status === 404) throw new LocalizedError('errorNotFound')
      if (response.status === 409) throw new LocalizedError('errorConflict')
      throw new LocalizedError('errorHttp', { status: response.status })
    }
    return await response.text()
  } catch (error) {
    if (controller.signal.aborted) throw new LocalizedError('errorTimeout')
    if (error instanceof TypeError) throw new LocalizedError('errorNetwork')
    throw error
  } finally { window.clearTimeout(timer) }
}

async function getJson<T>(connection: Connection, path: string): Promise<T> {
  const response = await request(connection, path)
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

export async function fetchSnapshot(connection: Connection): Promise<Snapshot> {
  const [overview, games, players] = await Promise.all([
    getJson<Omit<Snapshot, 'games' | 'players'>>(connection, '/api/v1/overview'),
    getJson<Snapshot['games']>(connection, '/api/v1/games'),
    getJson<Snapshot['players']>(connection, '/api/v1/players'),
  ])
  const snapshot = { ...overview, games, players }
  if (!isSnapshot(snapshot)) throw new LocalizedError('errorSnapshot')
  return snapshot
}

export async function playerAction(connection: Connection, id: number, action: 'kick' | 'ban') {
  await request(connection, `/api/v1/players/${id}/${action}`, undefined, true)
}

export async function gameAction(connection: Connection, code: string, action: 'privacy' | 'close', isPublic?: boolean) {
  await request(connection, `/api/v1/games/${encodeURIComponent(code)}/${action}`, action === 'privacy' ? { isPublic } : undefined, true)
}

export const fetchAudit = (connection: Connection) => getJson<AuditEntry[]>(connection, '/api/v1/audit')
export function saveConnection(connection: Connection) { localStorage.setItem(connectionKey, JSON.stringify(connection)) }
export function forgetConnection() { localStorage.removeItem(connectionKey) }
