export type Player = {
  clientId: number
  name: string
  gameCode: string | null
  isHost: boolean
  inGame: boolean
}

export type Game = {
  code: string
  state: string
  playerCount: number
  maxPlayers: number
  isPublic: boolean
  hostName: string | null
  players: Player[]
}

export type Overview = {
  status: string
  uptimeSeconds: number
  onlinePlayers: number
  activeGames: number
  totalGames: number
  pluginVersion: string
}

export type Snapshot = Overview & { games: Game[]; players: Player[] }

export type Connection = { name: string; baseUrl: string; apiKey?: string; token?: string }

export type SavedServer = Connection & { id: string }
export type ServerRegistry = { version: 1; servers: SavedServer[]; activeServerId: string | null }
export type WorkspaceView = 'dashboard' | 'players' | 'games' | 'audit'
export type AppView = WorkspaceView | 'settings' | 'servers' | 'login' | 'account'

export type AuditEntry = { timestamp: string; action: string; target: string; success: boolean; detail: string; location?: string | null }
export type PanelLogin = { ip: string; location: string | null; timestamp: string }

export type AuthUser = { id: string; username: string; role: 'superadmin' | 'admin'; avatar: string | null }
export type AuthSession = { token: string; expiresAt: string; user: AuthUser }
export type AuthChallenge = { id: string; prompt: string }
export type LoginResponse = { session: AuthSession; login: PanelLogin }
export type ManagedUser = Pick<AuthUser, 'id' | 'username' | 'avatar'>
