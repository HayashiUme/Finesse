export type Player = {
  clientId: number
  name: string
  gameCode: string | null
  isHost: boolean
  inGame: boolean
  address?: string | null; friendCode?: string | null; version?: string | null; platform?: string | null; language?: string | null
}

export type Game = {
  code: string
  state: string
  playerCount: number
  maxPlayers: number
  isPublic: boolean
  hostName: string | null
  players: Player[]
  map?: string | null; mode?: string | null; name?: string | null
}

export type Overview = {
  status: string
  uptimeSeconds: number
  onlinePlayers: number
  activeGames: number
  totalGames: number
  pluginVersion: string
  process?: ProcessMetrics
}

export type ProcessMetrics = {
  processId: number; cpuPercent?: number | null; workingSetBytes: number
  physicalMemoryBytes?: number | null; memoryPercent?: number | null; processorCount: number; sampledAt: string
}
export type PlayerReport = {
  time: string; gameCode: string; reporterName: string; reporterFriendCode?: string | null
  reportedName?: string | null; reportedFriendCode?: string | null; reason: string; outcome: string
}
export type ReportFeed = { available: boolean; persistenceAvailable: boolean; reports: PlayerReport[] }

export type Snapshot = Overview & { games: Game[]; players: Player[] }

export type Connection = { name: string; baseUrl: string; apiKey?: string; token?: string }

export type SavedServer = Connection & { id: string }
export type ServerRegistry = { version: 1; servers: SavedServer[]; activeServerId: string | null }
export type WorkspaceView = 'dashboard' | 'players' | 'games' | 'moderation' | 'messages' | 'plugins' | 'audit'
export type AppView = WorkspaceView | 'settings' | 'servers' | 'login' | 'account'

export type AuditEntry = { timestamp: string; action: string; target: string; success: boolean; detail: string; location?: string | null }
export type PanelLogin = { ip: string; location: string | null; timestamp: string }

export type AuthUser = { id: string; username: string; role: 'superadmin' | 'admin'; avatar: string | null }
export type AuthSession = { token: string; expiresAt: string; user: AuthUser }
export type AuthChallenge = { id: string; prompt: string }
export type LoginResponse = { session: AuthSession; login: PanelLogin }
export type ManagedUser = Pick<AuthUser, 'id' | 'username' | 'avatar'>

export type BanEntry = { id: string; kind: 'ip' | 'friendCode'; value: string; reason: string; createdAt: string; expiresAt: string | null }
export type BanFeed = { available: boolean; entries: BanEntry[] }
export type BanRequest = { kind: 'ip' | 'friendCode'; value: string; reason: string; durationMinutes: number | null }
export type CommandResult = { delivered: number; skipped: number; failed: number }
export type ServerInfo = { runtime: string; operatingSystem: string; architecture: string; processId: number; processorCount: number; serverVersion: string | null; apiAssemblyVersion: string }
export type PluginInfo = { id: string; name: string; author: string; version: string; enabled: boolean; filePresent: boolean; fileName: string | null; canManage: boolean }
