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

export type Connection = { name: string; baseUrl: string; apiKey: string }

export type AuditEntry = { timestamp: string; action: string; target: string; success: boolean; detail: string }
