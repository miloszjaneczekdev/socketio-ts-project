export type GameMode = 'solo' | 'standard' | 'turbo' | 'coop' | 'ffa'

export type GameState = 'lobby' | 'game' | 'round' | 'summary'
export type GamePhase =
  | 'lobby'
  | 'codeSetupAll'
  | 'codeSetupReady'
  | 'codeSetupInput'
  | 'guessReady'
  | 'guessing'
  | 'summary'

export type BotSkill = 'easy' | 'normal' | 'hard' | 'insane'

export type LobbySettings = {
  mode: GameMode
  len: string
  timer: string
  onTimeout: 'empty' | 'random'
  rounds: string
  order: 'fixed' | 'random' | 'shuffleEachRound'
  hints: 'standard' | 'hitsOnly' | 'none'
  showHistory: boolean
  codeSetup: 'onStart' | 'inLobby' | 'disabled'
  hotSeat: boolean
  bots: {
    count: number
    skill: BotSkill
    randomizeNames: boolean
  }
  solo: boolean
}

export type Player = {
  playerId: string
  socketId?: string
  name: string
  avatar?: string | null
  ready: boolean
  isBot?: boolean
  botSkill?: BotSkill
  secretCode?: string
  attempts: number
  solved: boolean
  solvedAt: number | null
  totalTurnTimeMs: number
  currentTurnStart?: number | null
  points?: number
  order?: number
  winText?: string
  guessTargets?: string[]
}

export type GuessResult = {
  correct?: number
  misplaced?: number
}

export type Guess = {
  guesserId: string
  targetId: string | null
  guess: string
  result: GuessResult
  ts: number
  roundId: number | null
  turnId?: number | null
  reactionMs?: number
  auto?: boolean
  solved?: boolean
}

export type SummaryRow = {
  playerId: string
  name: string
  attempts: number
  totalMs: number
  points: number
  hits: number
  targetsSolved: number
  accuracy: number
  rank: number
  shotTimesMs: number[]
  guessedDigits: Record<string, number>
  progressPoints: number[]
  perfectHitsByTurn: number[]
  misplacedByTurn: number[]
  shots: {
    guess: string
    result: GuessResult
    targetId: string | null
    ts: number
    roundId: number | null
  }[]
  solved: boolean
  avatar?: string | null
  isBot?: boolean
  finalCode?: string
}

export type SummaryMeta = {
  code: string
  name: string
  mode: GameMode
  len: string
  timer: string
  createdAt: number
}

export type SummaryPayload = {
  summary: SummaryRow[]
  meta: SummaryMeta
}

export type EdgeSides = Record<
  string,
  { fromSide: 'left' | 'right'; toSide: 'left' | 'right' }
>

export type LobbyPayload = {
  code: string
  name: string
  isPrivate: boolean
  state: GameState
  hostId: string | null
  settings: LobbySettings
  edgeSides: EdgeSides
  order?: string[]
  players: Player[]
  activePlayerId?: string | null
  activeTargetId?: string | null
  currentActorId?: string | null
  phase?: GamePhase
  standardTurnId?: number
  roundId?: number
  roundStartTs?: number | null
  roundEndTs?: number | null
  coopTargetId?: string | null
  isCoopGuesser?: boolean
  myTargetId?: string | null
  myActiveTargets?: string[]
  myTurboTurnEndTs?: number | null
  canGuess?: boolean
  privacyMode?: boolean
  guesses?: Guess[]
  codeSetupDeadlineMs?: number | null
}
