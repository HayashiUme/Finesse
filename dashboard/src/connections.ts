import { normalizeConnection } from './api'
import { LocalizedError } from './i18n'
import type { Connection, SavedServer, ServerRegistry } from './types'

const storageKey = 'finesse-servers'
const legacyKey = 'finesse-connection'
const emptyRegistry = (): ServerRegistry => ({ version: 1, servers: [], activeServerId: null })

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `server-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function parseConnection(value: unknown): Connection | null {
  if (!value || typeof value !== 'object') return null
  const entry = value as Partial<Connection>
  if (typeof entry.baseUrl !== 'string' || typeof entry.apiKey !== 'string' || typeof entry.name !== 'string') return null
  try { return normalizeConnection(entry as Connection, false) } catch { return null }
}

export function loadServerRegistry(): ServerRegistry {
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) {
      const value = JSON.parse(raw)
      if (value?.version === 1 && Array.isArray(value.servers)) {
        const servers: SavedServer[] = []
        for (const entry of value.servers) {
          const connection = parseConnection(entry)
          if (!connection || typeof entry.id !== 'string' || !entry.id || servers.some(s => s.id === entry.id || s.baseUrl === connection.baseUrl)) continue
          servers.push({ ...connection, id: entry.id })
        }
        return { version: 1, servers, activeServerId: servers.some(s => s.id === value.activeServerId) ? value.activeServerId : servers[0]?.id ?? null }
      }
    }
  } catch { /* Try the previous single-server format when the new data is invalid. */ }
  try {
    const raw = localStorage.getItem(legacyKey)
    const value = raw ? JSON.parse(raw) : null
    const connection = parseConnection(value && { ...value, name: value.name ?? 'Impostor Server' })
    if (connection) {
      const server = { ...connection, id: createId() }
      const registry: ServerRegistry = { version: 1, servers: [server], activeServerId: server.id }
      try { saveServerRegistry(registry) } catch { /* Keep the original entry if storage is unavailable. */ }
      return registry
    }
  } catch { /* Missing or damaged storage starts with an empty directory. */ }
  return emptyRegistry()
}

export function saveServerRegistry(registry: ServerRegistry) {
  try { localStorage.setItem(storageKey, JSON.stringify(registry)) }
  catch { throw new LocalizedError('errorStorage') }
  // Remove the old format only after the replacement has been saved successfully.
  try { localStorage.removeItem(legacyKey) } catch { /* The new registry takes precedence. */ }
}

export function upsertServer(registry: ServerRegistry, value: Connection, id?: string): ServerRegistry {
  const connection = normalizeConnection(value)
  if (id && !registry.servers.some(s => s.id === id)) throw new LocalizedError('errorServerMissing')
  if (registry.servers.some(s => s.id !== id && s.baseUrl === connection.baseUrl)) throw new LocalizedError('errorDuplicateServer')
  const server = { ...connection, id: id ?? createId() }
  return { ...registry, servers: id ? registry.servers.map(s => s.id === id ? server : s) : [...registry.servers, server] }
}

export function removeServer(registry: ServerRegistry, id: string): ServerRegistry {
  const servers = registry.servers.filter(s => s.id !== id)
  return { ...registry, servers, activeServerId: registry.activeServerId === id ? servers[0]?.id ?? null : registry.activeServerId }
}
