import express from 'express'
import http from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import { randomUUID as uuid } from 'crypto'

/** ─────────────────────────────────────────────────────────────
 *  Typy
 * ──────────────────────────────────────────────────────────── */
type BotSkill = 'easy' | 'normal' | 'hard' | 'insane'
type GameMode = 'solo' | 'standard' | 'turbo' | 'coop' | 'ffa'
type GamePhase =
    | 'lobby'
    | 'codeSetupAll'
    | 'codeSetupReady'
    | 'codeSetupInput'
    | 'guessReady'
    | 'guessing'
    | 'summary'

type Player = {
    playerId: string
    socketId: string
    name: string
    avatar?: string | null
    ready: boolean
    secretCode: string
    attempts: number
    solved: boolean
    solvedAt: number | null
    totalTurnTimeMs: number
    isBot?: boolean
    botSkill?: BotSkill
    order: number
    winText?: string
    guessTargets: string[]
}

type HintResult = {
    correct: number
    misplaced: number
}

type Guess = {
    ts: number
    guess: string
    result: HintResult
    targetId: string | null
    roundId: number | null
    guesserId: string
    reactionMs?: number
    auto?: boolean
    solved?: boolean
}

type Lobby = {
    code: string
    name: string
    isPrivate: boolean
    state: 'lobby' | 'game' | 'summary'
    hostId: string | null
    settings: LobbySettings
    players: Player[]
    _countdownTimer: NodeJS.Timeout | null
    _idleTimer?: NodeJS.Timeout | null
    _phaseTimer?: NodeJS.Timeout | null
    edgeSides?: Record<string, { fromSide: 'left' | 'right'; toSide: 'left' | 'right' }>
    soloCode?: string | null

    // STAN ROZGRYWKI
    activePlayerId?: string | null           // standard
    standardTurnId?: number                  // standard
    roundId?: number                         // turbo / coop / ffa
    roundStartTs?: number | null
    roundEndTs?: number | null               // turbo / coop / ffa
    coopTargetId?: string | null             // coop
    phase?: GamePhase
    setupIndex?: number
    activeTargetId?: string | null
    ffaOffset?: number

    // pełna historia strzałów (wszyscy gracze)
    guesses: Guess[]

    codeSetupDeadline?: number | null
}



type LobbySettings = {
    mode: GameMode
    len: string            // '3'|'4'|'5'|'6'|'8'
    timer: string          // '0'|'15'|'30'|'60'
    onTimeout: 'empty' | 'random'
    rounds: string
    order: 'fixed' | 'random' | 'shuffleEachRound'
    hints: 'standard' | 'hitsOnly' | 'none'
    showHistory: boolean

    codeSetup: 'onStart' | 'inLobby' | 'disabled'
    hotSeat: boolean
    bots: { count: number; skill: BotSkill; randomizeNames: boolean }
    solo: boolean
}


/** ─────────────────────────────────────────────────────────────
 *  Konfiguracja
 * ──────────────────────────────────────────────────────────── */
const MAX_SLOTS = 4
const LOBBY_IDLE_TIMEOUT_MS = 3 * 60 * 1000
const BOT_NAME_POOL = [
    'Bot Ania', 'Bot Bartek', 'Bot Celina', 'Bot Daniel', 'Bot Ela', 'Bot Franek',
    'Bot Gabi', 'Bot Henryk', 'Bot Iga', 'Bot Julek', 'Bot Kaja', 'Bot Leon'
]
function generateRandomDigits(len: number): string {
    let out = ''
    for (let i = 0; i < len; i++) {
        out += Math.floor(Math.random() * 10).toString()
    }
    return out
}

function calcHint(guess: string | number, secret: string | number): HintResult {
    const g = String(guess)
    const s = String(secret)
    const len = Math.min(g.length, s.length)
    let correct = 0
    let misplaced = 0
    const counts = new Map<string, number>()

    for (let i = 0; i < len; i++) {
        if (g[i] === s[i]) correct++
        else counts.set(s[i], (counts.get(s[i]) || 0) + 1)
    }
    for (let i = 0; i < len; i++) {
        if (g[i] !== s[i] && (counts.get(g[i]) || 0) > 0) {
            misplaced++
            counts.set(g[i], (counts.get(g[i]) || 0) - 1)
        }
    }
    return { correct, misplaced }
}



function randomBotName() {
    return BOT_NAME_POOL[Math.floor(Math.random() * BOT_NAME_POOL.length)]
}
// bezpieczny generator ID (działa też bez wsparcia UUID)
function uid() {
    try { return uuid() } catch { return Math.random().toString(36).slice(2) }
}

function makeDerangement(ids: string[]): Map<string, string> {
    if (ids.length < 2) return new Map()
    const to = ids.slice()
    for (let i = to.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
            ;[to[i], to[j]] = [to[j], to[i]]
    }
    for (let i = 0; i < ids.length; i++) {
        if (to[i] === ids[i]) {
            const j = (i + 1) % ids.length
                ;[to[i], to[j]] = [to[j], to[i]]
        }
    }
    const m = new Map<string, string>()
    ids.forEach((from, i) => m.set(from, to[i]!))
    return m
}
function validateDerangement(ids: string[], mapping: Map<string, string>): boolean {
    if (ids.length < 2) return false
    if (mapping.size !== ids.length) return false
    const seenTo = new Set<string>()
    for (const from of ids) {
        const to = mapping.get(from)
        if (!to) return false
        if (to === from) return false
        if (!ids.includes(to)) return false
        if (seenTo.has(to)) return false
        seenTo.add(to)
    }
    return true
}
function setModeDefaultTargets(lobby: Lobby) {
    const ids = lobby.players.map(p => p.playerId)

    // SOLO – nie rysujemy strzałek, nikt nikogo nie zgaduje
    if (lobby.settings.mode === 'solo') {
        lobby.players.forEach(p => { p.guessTargets = [] })
        return
    }

    if (lobby.settings.mode === 'standard' || lobby.settings.mode === 'turbo') {
        const d = makeDerangement(ids)
        lobby.players.forEach(p => {
            p.guessTargets = p.playerId && d.get(p.playerId) ? [d.get(p.playerId)!] : []
        })
    } else {
        // coop / ffa — wszyscy inni
        lobby.players.forEach(p => {
            p.guessTargets = ids.filter(id => id !== p.playerId)
        })
    }
}

function orderedPlayers(lobby: Lobby) {
    return [...lobby.players].sort((a, b) => (a.order || 0) - (b.order || 0))
}

function timerMs(lobby: Lobby) {
    return Math.max(0, Number(lobby.settings.timer || '0') || 0) * 1000
}

function codeLen(lobby: Lobby) {
    return Number(lobby.settings.len || '4') || 4
}

function hasValidCode(lobby: Lobby, p: Player) {
    return !!p.secretCode && p.secretCode.length === codeLen(lobby)
}

function ensureSecretCodes(lobby: Lobby) {
    const len = codeLen(lobby)
    lobby.players.forEach(p => {
        if (!p.secretCode || p.secretCode.length !== len) {
            p.secretCode = generateRandomDigits(len)
        }
    })
}

function hasHit(lobby: Lobby, guesserId: string, targetId: string | null) {
    const len = codeLen(lobby)
    return lobby.guesses.some(g =>
        g.guesserId === guesserId &&
        g.targetId === targetId &&
        g.result?.correct === len
    )
}

function nextUnsolvedTargetFor(lobby: Lobby, guesserId: string) {
    const ordered = orderedPlayers(lobby)
    const others = ordered.filter(p => p.playerId !== guesserId)
    if (lobby.settings.mode === 'turbo') {
        const me = lobby.players.find(p => p.playerId === guesserId)
        const targetId = me?.guessTargets?.[0] ?? null
        return targetId && !hasHit(lobby, guesserId, targetId) ? targetId : null
    }
    if (lobby.settings.mode === 'ffa') {
        const offset = Math.max(1, lobby.ffaOffset || 1)
        const fromIdx = ordered.findIndex(p => p.playerId === guesserId)
        if (fromIdx >= 0 && ordered.length > 1) {
            for (let step = 0; step < ordered.length - 1; step++) {
                const target = ordered[(fromIdx + offset + step) % ordered.length]
                if (target && target.playerId !== guesserId && !hasHit(lobby, guesserId, target.playerId)) {
                    return target.playerId
                }
            }
        }
    }
    for (const target of others) {
        if (!hasHit(lobby, guesserId, target.playerId)) return target.playerId
    }
    return null
}

function currentCoopTarget(lobby: Lobby) {
    if (lobby.coopTargetId) return lobby.coopTargetId
    const target = orderedPlayers(lobby).find(p => !coopTargetSolved(lobby, p.playerId))
    lobby.coopTargetId = target?.playerId ?? null
    return lobby.coopTargetId ?? null
}

function coopTargetSolved(lobby: Lobby, targetId: string) {
    return lobby.players
        .filter(p => p.playerId !== targetId)
        .every(p => hasHit(lobby, p.playerId, targetId))
}

function allObjectivesSolved(lobby: Lobby) {
    const ids = lobby.players.map(p => p.playerId)
    if (lobby.settings.mode === 'solo') {
        return hasHit(lobby, ids[0] ?? '', null)
    }
    if (lobby.settings.mode === 'standard' || lobby.settings.mode === 'turbo') {
        return lobby.players.every(p => {
            const targetId = p.guessTargets?.[0] ?? null
            return targetId ? hasHit(lobby, p.playerId, targetId) : true
        })
    }
    if (lobby.settings.mode === 'ffa') {
        return ids.every(from => ids.filter(to => to !== from).every(to => hasHit(lobby, from, to)))
    }
    if (lobby.settings.mode === 'coop') {
        return ids.every(targetId => coopTargetSolved(lobby, targetId))
    }
    return false
}

function activeGuessers(lobby: Lobby) {
    const mode = lobby.settings.mode
    if (lobby.settings.hotSeat && mode !== 'turbo' && lobby.phase === 'guessing') {
        return lobby.activePlayerId && pickTargetForGuess(lobby, lobby.activePlayerId)
            ? [lobby.activePlayerId]
            : []
    }
    if (mode === 'solo') return lobby.players.slice(0, 1).map(p => p.playerId)
    if (mode === 'standard') return lobby.activePlayerId ? [lobby.activePlayerId] : []
    if (mode === 'turbo') {
        return lobby.players
            .filter(p => !!nextUnsolvedTargetFor(lobby, p.playerId))
            .map(p => p.playerId)
    }
    if (mode === 'ffa') {
        return lobby.players
            .filter(p => !!nextUnsolvedTargetFor(lobby, p.playerId))
            .map(p => p.playerId)
    }
    if (mode === 'coop') {
        const target = currentCoopTarget(lobby)
        if (!target) return []
        return lobby.players
            .filter(p => p.playerId !== target && !hasHit(lobby, p.playerId, target))
            .map(p => p.playerId)
    }
    return []
}

function assignRoundTargets(lobby: Lobby) {
    const mode = lobby.settings.mode
    if (mode === 'solo') return
    if (mode === 'standard' || mode === 'turbo') {
        lobby.players.forEach(p => {
            const target = p.guessTargets?.[0] ?? nextUnsolvedTargetFor(lobby, p.playerId)
            p.guessTargets = target ? [target] : []
        })
        return
    }
    if (mode === 'ffa') {
        lobby.players.forEach(p => {
            const target = nextUnsolvedTargetFor(lobby, p.playerId)
            p.guessTargets = target ? [target] : []
        })
        return
    }
    if (mode === 'coop') {
        const target = currentCoopTarget(lobby)
        lobby.players.forEach(p => {
            p.guessTargets = target && p.playerId !== target && !hasHit(lobby, p.playerId, target) ? [target] : []
        })
    }
}

function clearPhaseTimer(lobby: Lobby) {
    if (lobby._phaseTimer) {
        clearTimeout(lobby._phaseTimer)
        lobby._phaseTimer = null
    }
}

function schedulePhaseTimeout(lobby: Lobby) {
    clearPhaseTimer(lobby)
    const deadline = lobby.roundEndTs ?? lobby.codeSetupDeadline
    if (!deadline) return
    const delay = Math.max(0, deadline - Date.now())
    lobby._phaseTimer = setTimeout(() => {
        handlePhaseTimeout(lobby)
        emitLobby(lobby, '', 'phase:timeout')
        emitPublic('phase:timeout')
    }, delay + 25)
}

function startGuessingPhase(lobby: Lobby, now = Date.now()) {
    ensureSecretCodes(lobby)
    assignRoundTargets(lobby)
    lobby.phase = 'guessing'
    lobby.standardTurnId = lobby.settings.mode === 'standard' ? 1 : lobby.standardTurnId

    if (lobby.settings.hotSeat && lobby.settings.mode !== 'turbo') {
        const next = nextHotSeatPlayer(lobby, null)
        lobby.activePlayerId = next?.player.playerId ?? null
        lobby.activeTargetId = next?.target ?? null
        if (next) next.player.guessTargets = [next.target]
    } else if (lobby.settings.mode === 'standard') {
        const first = orderedPlayers(lobby).find(p => !!nextUnsolvedTargetFor(lobby, p.playerId))
        const target = first ? nextUnsolvedTargetFor(lobby, first.playerId) : null
        lobby.activePlayerId = first?.playerId ?? null
        lobby.activeTargetId = target
        if (first && target) first.guessTargets = [target]
    } else {
        lobby.activePlayerId = null
        lobby.activeTargetId = null
    }

    lobby.roundStartTs = now
    lobby.roundEndTs = timerMs(lobby) > 0 ? now + timerMs(lobby) : null
    lobby.codeSetupDeadline = null
    runBotsForCurrentPhase(lobby)
    schedulePhaseTimeout(lobby)
}

function startHotSeatCodeSetup(lobby: Lobby, index = 0, now = Date.now()) {
    const ordered = orderedPlayers(lobby)
    if (index >= ordered.length) {
        startGuessingPhase(lobby, now)
        return
    }
    const p = ordered[index]
    lobby.setupIndex = index
    lobby.activePlayerId = p.playerId
    lobby.activeTargetId = null
    lobby.phase = 'codeSetupInput'
    lobby.codeSetupDeadline = timerMs(lobby) > 0 ? now + timerMs(lobby) : null
    lobby.roundStartTs = now
    lobby.roundEndTs = lobby.codeSetupDeadline
    if (p.isBot) {
        p.secretCode = generateRandomDigits(codeLen(lobby))
        startHotSeatCodeSetup(lobby, index + 1, Date.now())
        return
    }
    schedulePhaseTimeout(lobby)
}

function startOnlineCodeSetup(lobby: Lobby, now = Date.now()) {
    lobby.phase = 'codeSetupAll'
    lobby.activePlayerId = null
    lobby.activeTargetId = null
    lobby.players.forEach(p => {
        p.secretCode = p.isBot ? generateRandomDigits(codeLen(lobby)) : ''
    })
    lobby.codeSetupDeadline = timerMs(lobby) > 0 ? now + timerMs(lobby) : null
    lobby.roundStartTs = now
    lobby.roundEndTs = lobby.codeSetupDeadline
    if (lobby.players.every(p => hasValidCode(lobby, p))) {
        startGuessingPhase(lobby, now)
    } else {
        schedulePhaseTimeout(lobby)
    }
}

function finishGame(lobby: Lobby) {
    clearPhaseTimer(lobby)
    lobby.state = 'summary'
    lobby.phase = 'summary'
    lobby.roundEndTs = null
    lobby.codeSetupDeadline = null
    const summary = buildSummary(lobby)
    io.to(lobby.code).emit('gameSummary', {
        summary,
        meta: {
            code: lobby.code,
            name: lobby.name,
            mode: lobby.settings.mode,
            len: lobby.settings.len,
            timer: lobby.settings.timer,
            createdAt: Date.now(),
        },
    })
    emitLobby(lobby, '', 'game:summary')
    emitPublic('game:summary')
}

function nextHotSeatTargetForPlayer(lobby: Lobby, playerId: string) {
    const currentRound = lobby.roundId || 1
    return orderedPlayers(lobby)
        .filter(p => p.playerId !== playerId)
        .find(p =>
            !hasHit(lobby, playerId, p.playerId) &&
            !lobby.guesses.some(g => g.roundId === currentRound && g.guesserId === playerId && g.targetId === p.playerId)
        )?.playerId ?? null
}

function nextHotSeatPlayer(lobby: Lobby, afterId?: string | null) {
    const ordered = orderedPlayers(lobby)
    const start = Math.max(0, ordered.findIndex(p => p.playerId === afterId))
    for (let step = 1; step <= ordered.length; step++) {
        const p = ordered[(start + step) % ordered.length]
        if (!p) continue
        const target =
            lobby.settings.mode === 'standard'
                ? (p.guessTargets?.[0] && !hasHit(lobby, p.playerId, p.guessTargets[0]) ? p.guessTargets[0] : null)
                : lobby.settings.mode === 'coop'
                ? (lobby.coopTargetId && p.playerId !== lobby.coopTargetId && !hasHit(lobby, p.playerId, lobby.coopTargetId) ? lobby.coopTargetId : null)
                : nextHotSeatTargetForPlayer(lobby, p.playerId)
        if (target) return { player: p, target }
    }
    return null
}

function advanceHotSeatAfterGuess(lobby: Lobby, now = Date.now()) {
    const mode = lobby.settings.mode
    if (!(lobby.settings.hotSeat && mode !== 'turbo')) return false

    if (allObjectivesSolved(lobby)) {
        finishGame(lobby)
        return true
    }

    if (mode === 'standard') {
        const next = nextHotSeatPlayer(lobby, lobby.activePlayerId)
        if (!next) {
            finishGame(lobby)
            return true
        }
        lobby.activePlayerId = next.player.playerId
        lobby.activeTargetId = next.target
        next.player.guessTargets = [next.target]
    } else if (mode === 'ffa') {
        const current = lobby.activePlayerId
        const samePlayerNext = current ? nextHotSeatTargetForPlayer(lobby, current) : null
        if (current && samePlayerNext) {
            const p = lobby.players.find(x => x.playerId === current)
            lobby.activePlayerId = current
            lobby.activeTargetId = samePlayerNext
            if (p) p.guessTargets = [samePlayerNext]
        } else {
            const next = nextHotSeatPlayer(lobby, current)
            if (!next) {
                lobby.roundId = (lobby.roundId || 0) + 1
                const restart = nextHotSeatPlayer(lobby, null)
                if (!restart) {
                    finishGame(lobby)
                    return true
                }
                lobby.activePlayerId = restart.player.playerId
                lobby.activeTargetId = restart.target
                restart.player.guessTargets = [restart.target]
            } else {
                lobby.activePlayerId = next.player.playerId
                lobby.activeTargetId = next.target
                next.player.guessTargets = [next.target]
            }
        }
    } else if (mode === 'coop') {
        const next = nextHotSeatPlayer(lobby, lobby.activePlayerId)
        if (!next) {
            const currentTarget = currentCoopTarget(lobby)
            if (currentTarget && coopTargetSolved(lobby, currentTarget)) {
                const nextTarget = orderedPlayers(lobby).find(p => !coopTargetSolved(lobby, p.playerId))
                lobby.coopTargetId = nextTarget?.playerId ?? null
            }
            lobby.roundId = (lobby.roundId || 0) + 1
            const restart = nextHotSeatPlayer(lobby, null)
            if (!restart) {
                finishGame(lobby)
                return true
            }
            lobby.activePlayerId = restart.player.playerId
            lobby.activeTargetId = restart.target
            restart.player.guessTargets = [restart.target]
        } else {
            lobby.activePlayerId = next.player.playerId
            lobby.activeTargetId = next.target
            next.player.guessTargets = [next.target]
        }
    }

    lobby.phase = 'guessing'
    lobby.roundStartTs = now
    lobby.roundEndTs = timerMs(lobby) > 0 ? now + timerMs(lobby) : null
    runBotsForCurrentPhase(lobby)
    schedulePhaseTimeout(lobby)
    return true
}

function advanceAfterGuess(lobby: Lobby, now = Date.now()) {
    if (advanceHotSeatAfterGuess(lobby, now)) return
    if (allObjectivesSolved(lobby)) {
        finishGame(lobby)
        return
    }

    const mode = lobby.settings.mode
    if (mode === 'solo') {
        lobby.roundStartTs = now
        lobby.roundEndTs = timerMs(lobby) > 0 ? now + timerMs(lobby) : null
        schedulePhaseTimeout(lobby)
        return
    }

    if (mode === 'standard') {
        const ordered = orderedPlayers(lobby)
        const currentIdx = ordered.findIndex(p => p.playerId === lobby.activePlayerId)
        const candidates = ordered
            .slice(currentIdx + 1)
            .concat(ordered.slice(0, Math.max(0, currentIdx + 1)))
        const next = candidates.find(p => !!nextUnsolvedTargetFor(lobby, p.playerId))
        lobby.activePlayerId = next?.playerId ?? null
        lobby.standardTurnId = (lobby.standardTurnId || 0) + 1
        if (!next) {
            finishGame(lobby)
            return
        }
        next.guessTargets = [nextUnsolvedTargetFor(lobby, next.playerId)!]
        lobby.activeTargetId = next.guessTargets[0] ?? null
        lobby.roundStartTs = now
        lobby.roundEndTs = timerMs(lobby) > 0 ? now + timerMs(lobby) : null
        runBotsForCurrentPhase(lobby)
        schedulePhaseTimeout(lobby)
        return
    }

    const guessers = activeGuessers(lobby)
    const guessedThisRound = new Set(
        lobby.guesses
            .filter(g => g.roundId === lobby.roundId)
            .map(g => g.guesserId),
    )
    const allRoundDone = guessers.every(id => guessedThisRound.has(id) || !activeGuessers(lobby).includes(id))
    if (allRoundDone || guessers.length === 0) {
        if (mode === 'coop') {
            const target = currentCoopTarget(lobby)
            if (target && coopTargetSolved(lobby, target)) {
                const nextTarget = orderedPlayers(lobby).find(p => !coopTargetSolved(lobby, p.playerId))
                lobby.coopTargetId = nextTarget?.playerId ?? null
            }
        }
        if (mode === 'ffa') {
            const count = lobby.players.length
            lobby.ffaOffset = count > 1 ? ((lobby.ffaOffset || 1) % (count - 1)) + 1 : 1
        }
        lobby.roundId = (lobby.roundId || 0) + 1
        assignRoundTargets(lobby)
        const nextGuessers = activeGuessers(lobby)
        if (!nextGuessers.length || allObjectivesSolved(lobby)) {
            finishGame(lobby)
            return
        }
        lobby.activePlayerId =
            lobby.settings.hotSeat && mode !== 'turbo'
                ? nextGuessers[0]
                : null
        lobby.activeTargetId = lobby.activePlayerId ? pickTargetForGuess(lobby, lobby.activePlayerId) : null
        lobby.roundStartTs = now
        lobby.roundEndTs = timerMs(lobby) > 0 ? now + timerMs(lobby) : null
        runBotsForCurrentPhase(lobby)
        schedulePhaseTimeout(lobby)
    }
}

function handlePhaseTimeout(lobby: Lobby) {
    const now = Date.now()
    const len = codeLen(lobby)
    if (lobby.state !== 'game') return
    if (lobby.phase === 'codeSetupAll') {
        ensureSecretCodes(lobby)
        startGuessingPhase(lobby, now)
        return
    }
    if (lobby.phase === 'codeSetupInput') {
        const p = lobby.players.find(x => x.playerId === lobby.activePlayerId)
        if (p && !hasValidCode(lobby, p)) p.secretCode = generateRandomDigits(len)
        startHotSeatCodeSetup(lobby, (lobby.setupIndex || 0) + 1, now)
        return
    }
    if (lobby.phase === 'guessing') {
        const missing = activeGuessers(lobby).filter(id => {
            if (lobby.settings.mode === 'standard') return id === lobby.activePlayerId
            return !lobby.guesses.some(g => g.roundId === lobby.roundId && g.guesserId === id)
        })
        missing.forEach(id => {
            const value = lobby.settings.onTimeout === 'empty' ? '' : generateRandomDigits(len)
            applyGuessToLobby(lobby, id, value, now, { advance: false, auto: true })
        })
        advanceAfterGuess(lobby, now)
    }
}

function runBotsForCurrentPhase(lobby: Lobby) {
    if (lobby.phase !== 'guessing') return
    const now = Date.now()
    const botIds = activeGuessers(lobby).filter(id => lobby.players.find(p => p.playerId === id)?.isBot)
    botIds.forEach((id, i) => {
        setTimeout(() => {
            if (lobby.state !== 'game' || lobby.phase !== 'guessing') return
            if (!activeGuessers(lobby).includes(id)) return
            applyGuessToLobby(lobby, id, generateRandomDigits(codeLen(lobby)), Date.now())
            emitLobby(lobby, '', `botGuess:${i}`)
        }, 350 + i * 250)
    })
}


/** ─────────────────────────────────────────────────────────────
 *  Serwer HTTP + Socket.IO
 * ──────────────────────────────────────────────────────────── */
const app = express()
app.use(cors())

const server = http.createServer(app)
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
})

/** ─────────────────────────────────────────────────────────────
 *  Pamięć serwera (in-memory)
 * ──────────────────────────────────────────────────────────── */
const lobbies = new Map<string, Lobby>()
const socketPlayer = new Map<string, string>() // socketId -> playerId

/** ─────────────────────────────────────────────────────────────
 *  Helpers: logowanie, porządek, payload
 * ──────────────────────────────────────────────────────────── */

// bezpieczne stringify do logów
function s(obj: any) {
    try { return JSON.stringify(obj) } catch { return String(obj) }
}
function nowISO() { return new Date().toISOString() }
function getPlayerNameById(lobby: Lobby | undefined, pid: string | undefined) {
    if (!lobby || !pid) return undefined
    return lobby.players.find(p => p.playerId === pid)?.name
}
function logChange(params: {
    action: string
    lobbyCode?: string
    bySocket?: string
    byPlayerId?: string
    byPlayerName?: string
    details?: any
}) {
    const { action, lobbyCode, bySocket, byPlayerId, byPlayerName, details } = params
    const header = `[${nowISO()}] ${action}`
    const who = (byPlayerName || byPlayerId || bySocket) ? ` by=${byPlayerName ?? byPlayerId ?? bySocket}` : ''
    const lob = lobbyCode ? ` lobby=${lobbyCode}` : ''
    const det = details !== undefined ? ` details=${s(details)}` : ''
    console.log(`${header}${lob}${who}${det}`)
}

// ładna tabelka wszystkich graczy (z numerem order)
function printPlayersTable(lobby: Lobby) {
    const lines: string[] = []
    const header =
        `\n┌─ 👥 Lobby ${lobby.code} — gracze: ${lobby.players.length}/${MAX_SLOTS} ────────────────` +
        `\n│ # | ORD | HOST | READY | BOT  | NAME                 | playerId                      | socketId` +
        `\n├───┼─────┼──────┼───────┼──────┼──────────────────────┼───────────────────────────────┼───────────────────────────────`
    lines.push(header)

    // posortuj wg order do wydruku
    const printable = [...lobby.players].sort((a, b) => (a.order || 0) - (b.order || 0))

    printable.forEach((p, i) => {
        const num = String(i + 1).padStart(2, ' ')
        const ord = String(p.order ?? '?').padStart(2, ' ')
        const host = p.playerId === lobby.hostId ? '★' : ' '
        const ready = p.ready ? '✔' : ' '
        const bot = p.isBot ? (p.botSkill ?? 'bot') : ' '
        const name = (p.name || '').padEnd(20, ' ').slice(0, 20)
        const pid = (p.playerId || '').padEnd(29, ' ').slice(0, 29)
        const sid = (p.socketId || '').padEnd(27, ' ').slice(0, 27)
        lines.push(`│ ${num} |  ${ord} |  ${host}   |   ${ready}   | ${bot.padEnd(4)} | ${name} | ${pid} | ${sid}`)
    })

    lines.push('└─────────────────────────────────────────────────────────────────────────────────────────────────────────\n')
    console.log(lines.join('\n'))
}

// NEW — kolejny numer kolejności
function nextOrder(lobby: Lobby) {
    const max = lobby.players.reduce((m, p) => Math.max(m, p.order || 0), 0)
    return max + 1
}

// NEW — normalizacja 1..N wg rosnącego order (dziury -> zagęść)
function normalizeOrder(lobby: Lobby) {
    const sorted = [...lobby.players].sort((a, b) => {
        const ao = a.order || Infinity
        const bo = b.order || Infinity
        if (ao === bo) return 0
        return ao - bo
    })
    sorted.forEach((p, i) => { p.order = i + 1 })
}

// emit + log (lobbyData) — per socket, żeby "myTargetId" itp. były poprawne
function emitLobby(lobby: Lobby, triggerSocketId: string, action: string, extra?: any) {
    const room = io.sockets.adapter.rooms.get(lobby.code)
    if (room) {
        for (const sid of room) {
            const payload = buildLobbyPayload(lobby, sid)
            io.to(sid).emit('lobbyData', payload)
        }
    }

    printPlayersTable(lobby)
    logChange({
        action: `${action} -> lobbyData`,
        lobbyCode: lobby.code,
        details: {
            count: `${lobby.players.length}/${MAX_SLOTS}`,
            host: lobby.players.find(p => p.playerId === lobby.hostId)?.name ?? null,
            triggeredBySocket: triggerSocketId,
            ...extra
        }
    })
    scheduleLobbyIdleCleanup(lobby)
}


// emit + log (publicLobbies)
function emitPublic(action: string) {
    const pub = listPublicLobbies()
    io.emit('publicLobbies', pub)
    logChange({ action: `${action} -> publicLobbies`, details: { count: pub.length } })
}

function clearLobbyIdleTimer(lobby: Lobby) {
    if (lobby._idleTimer) {
        clearTimeout(lobby._idleTimer)
        lobby._idleTimer = null
    }
}

function deleteIdleLobby(lobby: Lobby) {
    if (lobbies.get(lobby.code) !== lobby || lobby.state !== 'lobby') return

    if (lobby._countdownTimer) {
        clearTimeout(lobby._countdownTimer)
        lobby._countdownTimer = null
    }
    clearPhaseTimer(lobby)
    clearLobbyIdleTimer(lobby)

    io.to(lobby.code).emit('lobbyNotFound', 'Lobby wygaslo przez brak aktywnosci.')

    const room = io.sockets.adapter.rooms.get(lobby.code)
    if (room) {
        for (const sid of [...room]) {
            io.sockets.sockets.get(sid)?.leave(lobby.code)
        }
    }

    lobbies.delete(lobby.code)
    logChange({
        action: 'lobby:removed(idle)',
        lobbyCode: lobby.code,
        details: { idleMs: LOBBY_IDLE_TIMEOUT_MS },
    })
    emitPublic('lobby:removed(idle)')
}

function scheduleLobbyIdleCleanup(lobby: Lobby) {
    if (lobby.state !== 'lobby') {
        clearLobbyIdleTimer(lobby)
        return
    }

    clearLobbyIdleTimer(lobby)
    lobby._idleTimer = setTimeout(() => deleteIdleLobby(lobby), LOBBY_IDLE_TIMEOUT_MS)
}

function generateLobbyCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // bez O/0/I/1
    let code = ''
    for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)]
    return code
}

// --- buildLobbyPayload: dorzuć guessTargets ---
function buildLobbyPayload(lobby: Lobby, requestingSocketId: string) {
    if (
        lobby.state === 'game' &&
        ((lobby.codeSetupDeadline && lobby.codeSetupDeadline <= Date.now()) ||
            (lobby.roundEndTs && lobby.roundEndTs <= Date.now()))
    ) {
        handlePhaseTimeout(lobby)
    }

    const ordered = orderedPlayers(lobby)
    const order = ordered.map(p => p.playerId)
    const me = lobby.players.find(p => p.socketId === requestingSocketId)
    const hotSeatActor = lobby.settings.hotSeat ? lobby.players.find(p => p.playerId === lobby.activePlayerId) : null
    const payloadPlayer = hotSeatActor && me?.playerId === lobby.hostId ? hotSeatActor : me
    const inCodeSetupPhase =
        lobby.settings.mode !== 'solo' &&
        lobby.state === 'game' &&
        (lobby.phase === 'codeSetupAll' || lobby.phase === 'codeSetupInput')

    return {
        code: lobby.code,
        name: lobby.name,
        isPrivate: lobby.isPrivate,
        state: lobby.state,
        hostId: lobby.hostId,
        settings: lobby.settings,
        edgeSides: lobby.edgeSides ?? {},
        order,
        players: lobby.players.map(p => ({
            playerId: p.playerId,
            name: p.name,
            avatar: p.avatar,
            ready: p.ready,
            secretCode:
                p.socketId === requestingSocketId ||
                    (lobby.settings.hotSeat && me?.playerId === lobby.hostId && p.playerId === lobby.activePlayerId)
                    ? p.secretCode
                    : undefined,
            attempts: p.attempts,
            solved: p.solved,
            solvedAt: p.solvedAt,
            totalTurnTimeMs: p.totalTurnTimeMs,
            isBot: !!p.isBot,
            botSkill: p.botSkill,
            winText: p.winText ?? '',
            guessTargets: p.guessTargets ?? [],
        })),
        activePlayerId: lobby.activePlayerId ?? null,
        activeTargetId: lobby.activeTargetId ?? null,
        phase: lobby.phase ?? (lobby.state === 'summary' ? 'summary' : lobby.state === 'game' ? 'guessing' : 'lobby'),
        standardTurnId: lobby.standardTurnId ?? 0,
        roundId: lobby.roundId ?? 0,
        roundStartTs: lobby.roundStartTs ?? null,
        roundEndTs: lobby.roundEndTs ?? null,
        coopTargetId: lobby.coopTargetId ?? null,
        isCoopGuesser:
            lobby.settings.mode === 'coop' &&
            !!payloadPlayer &&
            payloadPlayer.playerId !== lobby.coopTargetId &&
            activeGuessers(lobby).includes(payloadPlayer.playerId),
        myTurboTurnEndTs: lobby.settings.mode === 'turbo' ? (lobby.roundEndTs ?? null) : null,
        myTargetId: payloadPlayer?.guessTargets?.[0] ?? null,
        myActiveTargets: payloadPlayer?.guessTargets ?? [],
        currentActorId: lobby.activePlayerId ?? null,
        canGuess: !!payloadPlayer && activeGuessers(lobby).includes(payloadPlayer.playerId),
        privacyMode: lobby.settings.hotSeat && lobby.settings.mode !== 'turbo',
        guesses: lobby.guesses ?? [],
        codeSetupDeadlineMs: inCodeSetupPhase ? (lobby.codeSetupDeadline ?? null) : null,
    }
}


function logLobbyState(lobby: Lobby) { printPlayersTable(lobby) }

function pickTargetForGuess(lobby: Lobby, guesserId: string): string | null {
    const me = lobby.players.find(p => p.playerId === guesserId)
    if (!me) return null

    // SOLO – brak celu, serwer bierze soloCode
    if (lobby.settings.mode === 'solo') return null
    if (lobby.settings.hotSeat && lobby.activePlayerId === guesserId && lobby.activeTargetId) {
        return lobby.activeTargetId
    }

    // jeśli mamy zdefiniowane cele – bierz pierwszy
    if (me.guessTargets && me.guessTargets.length > 0) {
        return me.guessTargets[0] || null
    }

    // COOP – target globalny
    if (lobby.settings.mode === 'coop' && lobby.coopTargetId) {
        if (lobby.coopTargetId === guesserId) return null
        return lobby.coopTargetId
    }

    // fallback – pierwszy inny gracz
    const anyOther = lobby.players.find(p => p.playerId !== guesserId)
    return anyOther?.playerId ?? null
}

function applyGuessToLobby(lobby: Lobby, guesserId: string, guess: string, now: number, opts: { advance?: boolean; auto?: boolean } = {}) {
    const len = codeLen(lobby)
    const me = lobby.players.find(p => p.playerId === guesserId)
    if (!me) return

    const mode = lobby.settings.mode
    let secret: string
    let targetId: string | null = null

    if (mode === 'solo') {
        const s = lobby.soloCode || generateRandomDigits(len)
        lobby.soloCode = s
        secret = s
    } else {
        targetId = pickTargetForGuess(lobby, guesserId)
        const target = lobby.players.find(p => p.playerId === targetId)
        if (!target || !hasValidCode(lobby, target)) return
        secret = target.secretCode
    }

    const turnStartedAt = lobby.roundStartTs ?? now
    const result = calcHint(guess, secret)
    let roundId: number | null = null
    if (mode === 'turbo' || mode === 'ffa' || mode === 'coop') {
        if (!lobby.roundId) lobby.roundId = 1
        roundId = lobby.roundId
        if (!lobby.roundStartTs) lobby.roundStartTs = now
    }

    const row: Guess = {
        ts: now,
        guess,
        result,
        targetId,
        roundId,
        guesserId,
        reactionMs: Math.max(0, now - turnStartedAt),
        auto: !!opts.auto,
        solved: result.correct === len,
    }
    lobby.guesses.push(row)

    me.attempts += 1
    me.totalTurnTimeMs += row.reactionMs ?? 0
    if (result.correct === len) {
        me.solved = true
        me.solvedAt = now
    }

    if (opts.advance !== false) {
        advanceAfterGuess(lobby, now)
    }
}

// prosta AI bota – losowy strzał
function botGuess(lobby: Lobby, bot: Player, now: number) {
    const len = Number(lobby.settings.len || '4')
    const guess = generateRandomDigits(len)
    applyGuessToLobby(lobby, bot.playerId, guess, now)
}


type SummaryRow = {
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
    shots: Array<{
        guess: string
        result: HintResult
        targetId: string | null
        ts: number
        roundId: number | null
    }>
    solved: boolean
    avatar: string | null
    isBot: boolean
    finalCode?: string
}

function buildSummary(lobby: Lobby): SummaryRow[] {
    const len = Number(lobby.settings.len || '4')
    const secretByPlayerId = new Map(lobby.players.map(p => [p.playerId, p.secretCode]))

    const rows = lobby.players.map(p => {
        const playerGuesses = lobby.guesses.filter(g => g.guesserId === p.playerId)
        const guessedDigits: Record<string, number> = {}
        const progressPoints: number[] = []
        const perfectHitsByTurn: number[] = []
        const misplacedByTurn: number[] = []
        let cumulativeHits = 0

        playerGuesses.forEach(g => {
            for (const digit of g.guess.replace(/\D/g, '')) {
                guessedDigits[digit] = (guessedDigits[digit] ?? 0) + 1
            }
            perfectHitsByTurn.push(g.result?.correct ?? 0)
            misplacedByTurn.push(g.result?.misplaced ?? 0)
            if (g.result?.correct === len) cumulativeHits += 1
            progressPoints.push(cumulativeHits)
        })

        const solvedTargets = new Set(
            playerGuesses
                .filter(g => g.result?.correct === len)
                .map(g => g.targetId ?? 'computer'),
        )
        const hits = playerGuesses.filter(
            g =>
                g.result?.correct === len,
        ).length
        const attempts = playerGuesses.length
        const accuracy = attempts > 0 ? Math.round((hits / attempts) * 100) : 0
        const points = hits * 100 + Math.max(0, solvedTargets.size * 50) - Math.max(0, attempts - hits) * 5
        const shotTimesMs = playerGuesses.map(g => Math.max(0, g.reactionMs ?? 0))
        const finalSolvedGuess = playerGuesses.find(g => g.result?.correct === len)
        const finalCode =
            lobby.settings.mode === 'solo'
                ? lobby.soloCode ?? undefined
                : finalSolvedGuess?.targetId
                    ? secretByPlayerId.get(finalSolvedGuess.targetId)
                    : undefined

        return {
            playerId: p.playerId,
            name: p.name,
            avatar: p.avatar ?? null,
            isBot: !!p.isBot,
            attempts,
            totalMs: shotTimesMs.reduce((sum, ms) => sum + ms, 0),
            points,
            hits,
            targetsSolved: solvedTargets.size,
            accuracy,
            shotTimesMs,
            guessedDigits,
            progressPoints,
            perfectHitsByTurn,
            misplacedByTurn,
            shots: playerGuesses.map(g => ({
                guess: g.guess,
                result: g.result,
                targetId: g.targetId,
                ts: g.ts,
                roundId: g.roundId,
            })),
            solved: solvedTargets.size > 0,
            finalCode,
            rank: 0,
        }
    })

    return rows
        .sort((a, b) =>
            b.points - a.points ||
            b.targetsSolved - a.targetsSolved ||
            a.attempts - b.attempts ||
            a.totalMs - b.totalMs,
        )
        .map((row, idx) => ({ ...row, rank: idx + 1 }))
}

function maybeFinishGame(lobby: Lobby) {
    if (lobby.state !== 'game') return
    if (allObjectivesSolved(lobby)) {
        finishGame(lobby)
    }
}


// typ uproszczony na listę publiczną
type PublicLobby = {
    code: string
    name: string
    playersCount: number
    maxPlayers: number
    state: 'lobby' | 'game' | 'summary'
    isPrivate: boolean
    mode?: string
    len?: number | string
}

function toPublic(l: Lobby): PublicLobby {
    return {
        code: l.code,
        name: l.name,
        playersCount: l.players.length,
        maxPlayers: MAX_SLOTS,
        state: l.state,
        isPrivate: l.isPrivate,
        mode: l.settings.mode,
        len: l.settings.len,
    }
}

function listPublicLobbies() {
    return [...lobbies.values()]
        .filter(l => !l.isPrivate && l.state === 'lobby')
        .map(toPublic)
        .sort((a, b) => b.playersCount - a.playersCount)
}



// Zwraca najmniejszy wolny numer z zakresu 1..(MAX_SLOTS-1) dla etykiety "gracz N"
// Liczymy TYLKO prawdziwych graczy (bez bota) i bez hosta.
// Jeżeli ktoś ma custom nick z bazy, to nie zajmuje numeru "gracz N".


// === HELPERS: numeracja "gracz N" i "Bot N" oraz placeholder pod DB ===

// Zwraca najmniejszy wolny numer z zakresu 1..(MAX_SLOTS-1) dla etykiety "gracz N"
// Liczymy tylko realnych graczy (bez bota) i bez hosta.
// Użytkownik z własnym nickiem z DB nie zabiera numeru "gracz N".
function nextGraczNumber(lobby: Lobby): number {
    const taken = new Set<number>()
    for (const p of lobby.players) {
        if (p.isBot) continue
        if (p.playerId === lobby.hostId) continue
        const m = /^gracz\s+(\d+)$/i.exec(p.name || '')
        if (m) taken.add(Number(m[1]))
    }
    for (let n = 1; n <= (MAX_SLOTS - 1); n++) {
        if (!taken.has(n)) return n
    }
    return (MAX_SLOTS - 1)
}

// Zwraca najmniejszy wolny numer dla botów "Bot N"
function nextBotNumber(lobby: Lobby): number {
    const taken = new Set<number>()
    for (const p of lobby.players) {
        if (!p.isBot) continue
        const m = /^Bot\s+(\d+)$/i.exec(p.name || '')
        if (m) taken.add(Number(m[1]))
    }
    for (let n = 1; n <= MAX_SLOTS; n++) {
        if (!taken.has(n)) return n
    }
    return lobby.players.filter(p => p.isBot).length + 1
}

// Placeholder pod przyszłą bazę danych — podmień implementację gdy będziesz miał DB.
async function getSavedNicknameForPlayer(playerId: string): Promise<string | null> {
    // TODO: SELECT nickname FROM users WHERE id = playerId
    return null
}

// === HELPERS Hot-Seat & prywatność ===

// Czy w lobby jest choć jeden gracz Hot-Seat?
function hasHotSeatPlayers(lobby: Lobby): boolean {
    return lobby.players.some(p => !p.isBot && typeof p.playerId === 'string' && p.playerId.startsWith('local_'))
}

// Wymuś spójność: jeśli jest choć jeden Hot-Seat → hotSeat=true i lobby prywatne
function recomputeHotSeatAndPrivacy(lobby: Lobby) {
    const anyHS = hasHotSeatPlayers(lobby)
    lobby.settings.hotSeat = anyHS
    if (anyHS) {
        lobby.isPrivate = true
    }
}

function recomputeModeByPlayers(lobby: Lobby) {
    const count = lobby.players.length

    if (count <= 1) {
        // sam w pokoju → tylko solo
        lobby.settings.mode = 'solo'
    } else if (count === 2) {
        // przy 2 graczach: tylko standard + turbo
        if (lobby.settings.mode !== 'standard' && lobby.settings.mode !== 'turbo' && lobby.settings.mode !== 'coop') {
            lobby.settings.mode = 'standard'
        }
    } else {
        // 3+ graczy: solo zabronione, reszta OK
        if (lobby.settings.mode === 'solo') {
            lobby.settings.mode = 'standard'
        }
    }

    // dodatkowy bezpiecznik: w Hot-Seat nie chcemy turbo
    if (lobby.settings.hotSeat && lobby.settings.mode === 'turbo') {
        lobby.settings.mode = 'standard'
    }
    if (count < 3 && lobby.settings.mode === 'ffa') {
        lobby.settings.mode = 'standard'
    }

    // po zmianie trybu od razu przebuduj cele
    setModeDefaultTargets(lobby)
}

function resetGameState(lobby: Lobby) {
    clearPhaseTimer(lobby)
    lobby.activePlayerId = null
    lobby.standardTurnId = 0
    lobby.roundId = 0
    lobby.roundStartTs = null
    lobby.roundEndTs = null
    lobby.coopTargetId = null
    lobby.activeTargetId = null
    lobby.phase = 'lobby'
    lobby.setupIndex = 0
    lobby.ffaOffset = 1
    lobby.guesses = []
    lobby.codeSetupDeadline = null // ⬅️ NOWE

    lobby.players.forEach(p => {
        p.attempts = 0
        p.solved = false
        p.solvedAt = null
        p.totalTurnTimeMs = 0
    })
}

function startMultiGame(lobby: Lobby) {
    resetGameState(lobby)

    if (lobby.players.length > 1) {
        const modeOrder = lobby.settings.order
        if (modeOrder === 'fixed') {
            normalizeOrder(lobby)
        } else if (modeOrder === 'random' || modeOrder === 'shuffleEachRound') {
            const shuffled = [...lobby.players]
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1))
                    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
            }
            shuffled.forEach((p, idx) => { p.order = idx + 1 })
        }
    }

    setModeDefaultTargets(lobby)
    lobby.state = 'game'
    lobby.phase = 'codeSetupAll'
    lobby.roundId = 1
    lobby.ffaOffset = 1
    lobby.setupIndex = 0
    lobby.activeTargetId = null

    if (lobby.settings.hotSeat && lobby.settings.mode !== 'turbo') {
        lobby.players.forEach(p => { p.secretCode = '' })
        startHotSeatCodeSetup(lobby, 0)
    } else {
        startOnlineCodeSetup(lobby)
    }
}

/** ─────────────────────────────────────────────────────────────
 *  Socket.IO
 * ──────────────────────────────────────────────────────────── */
io.on('connection', (socket) => {
    logChange({ action: 'socket:connected', bySocket: socket.id })

    // IDENTYFIKACJA
    socket.on('identify', ({ playerId }: { playerId: string }) => {
        socketPlayer.set(socket.id, playerId)
        logChange({ action: 'identify', bySocket: socket.id, byPlayerId: playerId })
    })

    // DODAJ BOTA
    socket.on('addBots', (
        { code, count = 1, skill = 'normal', randomizeNames = true }:
            { code: string; count?: number; skill?: BotSkill; randomizeNames?: boolean },
        ack?: (res: { ok: true; bot: Player } | { ok: false; error: string }) => void
    ) => {
        const lobby = lobbies.get(String(code).toUpperCase()); if (!lobby) {
            logChange({ action: 'addBots:fail', details: { reason: 'noLobby', code } })
            return ack?.({ ok: false, error: 'Lobby nie istnieje' })
        }
        const callerId = socketPlayer.get(socket.id); if (callerId !== lobby.hostId) {
            logChange({ action: 'addBots:fail', lobbyCode: lobby.code, byPlayerId: callerId, details: { reason: 'notHost' } })
            return ack?.({ ok: false, error: 'Tylko host może dodawać boty' })
        }

        const free = Math.max(0, MAX_SLOTS - lobby.players.length)
        if (free <= 0) { logChange({ action: 'addBots:fail', lobbyCode: lobby.code, details: { reason: 'full' } }); return ack?.({ ok: false, error: 'Lobby pełne' }) }

        const n = Math.min(count, free)
        let firstBot: Player | null = null

        for (let i = 0; i < n; i++) {
            const label = `Bot ${nextBotNumber(lobby)}` // sekwencyjne nazwy botów
            const bot: Player = {
                playerId: `bot_${uid()}`,
                socketId: `bot_socket_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                name: label,
                avatar: null,
                ready: false,
                secretCode: '0'.repeat(Number(lobby.settings.len)),
                attempts: 0,
                solved: false,
                solvedAt: null,
                totalTurnTimeMs: 0,
                isBot: true,
                botSkill: skill ?? 'normal',
                order: nextOrder(lobby),
                winText: 'Bot power 💥', // NEW ⬅️ TU
                guessTargets: [] // NEW
            }
            lobby.players.push(bot)
            recomputeModeByPlayers(lobby)
            if (!firstBot) firstBot = bot
        }

        setModeDefaultTargets(lobby)

        logChange({
            action: 'bot:added',
            lobbyCode: lobby.code,
            byPlayerId: callerId,
            byPlayerName: getPlayerNameById(lobby, callerId),
            details: { added: n }
        })

        emitLobby(lobby, socket.id, 'addBots')
        emitPublic('addBots')
        if (firstBot) ack?.({ ok: true, bot: firstBot })
    })


    // USUŃ BOTA
    socket.on('removeBot', ({ code, playerId }: { code: string; playerId: string }) => {
        const lobby = lobbies.get(String(code).toUpperCase()); if (!lobby) return
        const callerId = socketPlayer.get(socket.id); if (callerId !== lobby.hostId) return

        const idx = lobby.players.findIndex(p => p.playerId === playerId && p.isBot)
        if (idx === -1) return

        const bot = lobby.players[idx]
        lobby.players.splice(idx, 1)
        recomputeModeByPlayers(lobby)
        normalizeOrder(lobby)

        logChange({
            action: 'bot:removed',
            lobbyCode: lobby.code,
            byPlayerId: callerId,
            byPlayerName: getPlayerNameById(lobby, callerId),
            details: { botId: bot.playerId, name: bot.name }
        })

        // anuluj countdown, jeśli warunki przestały być spełnione
        const everyoneReady = lobby.players.length >= 2 && lobby.players.every(p => p.ready)
        if (!everyoneReady && lobby._countdownTimer) {
            clearTimeout(lobby._countdownTimer); lobby._countdownTimer = null
            io.to(lobby.code).emit('countdownCancelled')
            logChange({ action: 'countdown:cancelled', lobbyCode: lobby.code })
        }

        setModeDefaultTargets(lobby)

        emitLobby(lobby, socket.id, 'removeBot')
        emitPublic('removeBot')
    })

    // ZMIEŃ TRUDNOŚĆ BOTA
    socket.on('setBotSkill', ({ code, playerId, botSkill }: { code: string; playerId: string; botSkill: BotSkill }) => {
        const lobby = lobbies.get(String(code).toUpperCase()); if (!lobby) return
        const callerId = socketPlayer.get(socket.id); if (callerId !== lobby.hostId) return

        const bot = lobby.players.find(p => p.playerId === playerId && p.isBot)
        if (!bot) return

        bot.botSkill = botSkill || 'normal'
        logChange({
            action: 'bot:skillChanged',
            lobbyCode: lobby.code,
            byPlayerId: callerId,
            byPlayerName: getPlayerNameById(lobby, callerId),
            details: { botId: bot.playerId, to: bot.botSkill }
        })
        emitLobby(lobby, socket.id, 'setBotSkill')
    })

    // DODAJ GRACZA HOT-SEAT
    // DODAJ GRACZA HOT-SEAT (lokalny gracz na urządzeniu hosta)
    socket.on('addHotSeat', ({ code, name }: { code: string; name?: string }) => {
        const lobby = lobbies.get(String(code).toUpperCase()); if (!lobby) return
        const callerId = socketPlayer.get(socket.id); if (callerId !== lobby.hostId) return
        if (lobby.players.length >= MAX_SLOTS) return

        // dodaj gracza Hot-Seat z nazwą
        const label = (name && name.trim()) ? name.trim().slice(0, 24) : `gracz ${nextGraczNumber(lobby)}`
        const hotSeat: Player = {
            playerId: `local_${uid()}`,
            socketId: `local_socket_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            name: label,
            avatar: null,
            ready: false,
            secretCode: '0'.repeat(Number(lobby.settings.len)),
            attempts: 0,
            solved: false,
            solvedAt: null,
            totalTurnTimeMs: 0,
            isBot: false,
            order: nextOrder(lobby),
            winText: '', // NEW ⬅️ TU
            guessTargets: [] // NEW
        }
        lobby.players.push(hotSeat)
        recomputeModeByPlayers(lobby)

        setModeDefaultTargets(lobby)

        // Hot-Seat => wymuś hotSeat=true i prywatność + zgaś Turbo
        recomputeHotSeatAndPrivacy(lobby)
        if (lobby.settings.mode === 'turbo') {
            lobby.settings.mode = 'standard'
            logChange({ action: 'hotSeat:disabledTurbo', lobbyCode: lobby.code })
        }

        logChange({
            action: 'hotSeat:added',
            lobbyCode: lobby.code,
            byPlayerId: callerId,
            byPlayerName: getPlayerNameById(lobby, callerId),
            details: { playerId: hotSeat.playerId, name: hotSeat.name }
        })

        emitLobby(lobby, socket.id, 'addHotSeat')
        emitPublic('addHotSeat')
    })




    // TRANSFER HOST (korona)
    socket.on('transferHost', ({ code, playerId }: { code: string; playerId: string }) => {
        const lobby = lobbies.get(String(code).toUpperCase()); if (!lobby) return
        const callerId = socketPlayer.get(socket.id); if (callerId !== lobby.hostId) return

        // 🚫 BLOKADA: nie pozwalaj przesuwać korony w trybie Hot-Seat
        if (lobby.settings.hotSeat) {
            logChange({
                action: 'transferHost:blockedByHotSeat',
                lobbyCode: lobby.code,
                byPlayerId: callerId,
                byPlayerName: getPlayerNameById(lobby, callerId)
            })
            socket.emit('error', 'Nie można przekazywać korony w trybie Hot-Seat.')
            return
        }

        const target = lobby.players.find(p => p.playerId === playerId)
        if (!target || target.isBot) return

        lobby.hostId = target.playerId
        logChange({
            action: 'host:transferred',
            lobbyCode: lobby.code,
            byPlayerId: callerId,
            byPlayerName: getPlayerNameById(lobby, callerId),
            details: { to: { id: target.playerId, name: target.name } }
        })

        emitLobby(lobby, socket.id, 'transferHost')
        emitPublic('transferHost')
    })


    // ALIAS KICK
    socket.on('kick', (payload: { code: string; playerId: string }) => {
        socket.emit('warn', 'Używaj eventu "kickPlayer" – przekierowuję.')
        io.emit('debug', 'kick->kickPlayer alias')
        socket.emit('noop')

        const { code, playerId } = payload || ({} as any)
        const lobby = lobbies.get(String(code).toUpperCase()); if (!lobby) return
        const callerId = socketPlayer.get(socket.id); if (callerId !== lobby.hostId) return

        const idx = lobby.players.findIndex(p => p.playerId === playerId)
        if (idx !== -1) {
            const kicked = lobby.players[idx]
            const kickedSocketId = kicked.socketId
            if (kickedSocketId && !kicked.isBot) io.to(kickedSocketId).emit('kicked')
            // ⬇️ NOWE: wyrzucony przestaje należeć do pokoju (i przestaje dostawać lobbyData)
            const target = kickedSocketId ? io.sockets.sockets.get(kickedSocketId) : undefined
            if (target) {
                target.leave(lobby.code)
                // target.disconnect(true) // (opcjonalnie) całkowite rozłączenie socketu
            }

            lobby.players.splice(idx, 1)
            normalizeOrder(lobby)
            logChange({
                action: 'player:kicked (alias)',
                lobbyCode: lobby.code,
                byPlayerId: callerId,
                byPlayerName: getPlayerNameById(lobby, callerId),
                details: { kickedId: kicked.playerId, name: kicked.name }
            })
        }

        const everyoneReady = lobby.players.length >= 2 && lobby.players.every(p => p.ready)
        if (!everyoneReady && lobby._countdownTimer) {
            clearTimeout(lobby._countdownTimer); lobby._countdownTimer = null
            io.to(lobby.code).emit('countdownCancelled')
            logChange({ action: 'countdown:cancelled', lobbyCode: lobby.code })
        }

        emitLobby(lobby, socket.id, 'kick(alias)')
        emitPublic('kick(alias)')
    })

    // UTWORZENIE
    socket.on('createLobby', async ({ name = 'Host' }: { name?: string }) => {
        const playerId = socketPlayer.get(socket.id)
        if (!playerId) { logChange({ action: 'createLobby:fail', bySocket: socket.id, details: { reason: 'noIdentify' } }); return socket.emit('error', 'Brak identify.') }

        let code: string; do { code = generateLobbyCode() } while (lobbies.has(code))

        // sprawdź zapisany nick hosta (DB)
        const saved = await getSavedNicknameForPlayer(playerId)
        const hostName = (saved || name || 'Host').slice(0, 24)

        const lobby: Lobby = {
            code,
            name: 'Nowe lobby',
            isPrivate: false,
            state: 'lobby',
            hostId: playerId,
            settings: {
                mode: 'standard', len: '4', timer: '0', onTimeout: 'empty',
                rounds: '0', order: 'fixed', hints: 'standard', showHistory: true,
                codeSetup: 'onStart',
                hotSeat: false,
                bots: { count: 0, skill: 'normal', randomizeNames: true },
                solo: true,
            },
            players: [{
                playerId, socketId: socket.id, name: hostName, avatar: null,
                ready: false, secretCode: '0000', attempts: 0, solved: false,
                solvedAt: null, totalTurnTimeMs: 0,
                order: 1,
                winText: '',
                guessTargets: [],
            }],
            _countdownTimer: null,
            _idleTimer: null,
            soloCode: null,

            // NOWE:
            guesses: [],
            codeSetupDeadline: null,
        }

        lobbies.set(code, lobby)
        recomputeModeByPlayers(lobby)
        scheduleLobbyIdleCleanup(lobby)

        socket.join(code)
        socket.emit('lobbyCreated', { code })
        socket.emit('lobbyData', buildLobbyPayload(lobby, socket.id))
        emitPublic('createLobby')

        logChange({
            action: 'lobby:created',
            lobbyCode: lobby.code,
            byPlayerId: playerId,
            byPlayerName: getPlayerNameById(lobby, playerId),
            details: { hostId: playerId, hostName }
        })
    })



    // POBIERZ LOBBY
    socket.on('getLobby', ({ code }: { code: string }) => {
        const lobby = lobbies.get(String(code).toUpperCase())
        if (!lobby) { logChange({ action: 'getLobby:fail', details: { code } }); return socket.emit('lobbyNotFound', 'Takie lobby nie istnieje.') }
        socket.join(lobby.code)
        socket.emit('lobbyData', buildLobbyPayload(lobby, socket.id))
        logChange({ action: 'lobby:joinedRoom(getLobby)', lobbyCode: lobby.code, bySocket: socket.id })
    })

    // LISTA PUBLICZNYCH
    socket.on('getPublicLobbies', () => {
        const list = listPublicLobbies()
        socket.emit('publicLobbies', list)
        logChange({ action: 'public:listSent', details: { count: list.length } })
    })

    // DOŁĄCZ
    socket.on('joinLobby', async ({ code }: { code: string }) => {
        const lobby = lobbies.get(String(code).toUpperCase())
        if (!lobby) { logChange({ action: 'joinLobby:fail', details: { code } }); return socket.emit('lobbyNotFound', 'Takie lobby nie istnieje.') }
        const playerId = socketPlayer.get(socket.id)
        if (!playerId) { logChange({ action: 'joinLobby:fail', details: { reason: 'noIdentify' } }); return socket.emit('error', 'Brak identify.') }

        const exists = lobby.players.some(p => p.playerId === playerId)

        // blokuj NOWYCH graczy jeśli hotSeat (ale pozwól wrócić tym, którzy już są)
        if (lobby.settings.hotSeat && !exists) {
            logChange({ action: 'joinLobby:blockedByHotSeat', lobbyCode: lobby.code, byPlayerId: playerId })
            return socket.emit('error', 'Tryb Hot-Seat: dołączanie nowych graczy z zewnątrz jest zablokowane.')
        }

        if (!exists) {
            // najpierw spróbuj pobrać nick z DB
            const saved = await getSavedNicknameForPlayer(playerId)
            // jeśli brak w DB — nadaj „gracz N”
            const defaultName = `gracz ${nextGraczNumber(lobby)}`
            const finalName = (saved || defaultName).slice(0, 24)

            const newP: Player = {
                playerId, socketId: socket.id, name: finalName, avatar: null,
                ready: false, secretCode: '0'.repeat(Number(lobby.settings.len)),
                attempts: 0, solved: false, solvedAt: null, totalTurnTimeMs: 0,
                order: nextOrder(lobby),
                winText: '', // NEW ⬅️ TU
                guessTargets: [] // NEW
            }
            lobby.players.push(newP)
            recomputeModeByPlayers(lobby)
            // jeśli dołączył drugi gracz → wyłącz solo
            if (lobby.players.length > 1 && lobby.settings.solo) {
                lobby.settings.solo = false
                lobby.soloCode = null
            }

            logChange({ action: 'player:joined', lobbyCode: lobby.code, byPlayerId: playerId, details: { name: newP.name } })
        } else {
            const me = lobby.players.find(p => p.playerId === playerId)!; me.socketId = socket.id
            logChange({ action: 'player:reconnected', lobbyCode: lobby.code, byPlayerId: playerId, details: { name: me.name } })
        }
        socket.join(lobby.code)
        setModeDefaultTargets(lobby)
        emitLobby(lobby, socket.id, 'joinLobby')
        emitPublic('joinLobby')
    })



    // OPUŚĆ
    socket.on('leaveLobby', ({ code, playerId }: { code: string; playerId: string }) => {
        const lobby = lobbies.get(String(code).toUpperCase())
        if (!lobby) { socket.emit('leftLobby', { success: true }); return }

        const idx = lobby.players.findIndex(p => p.playerId === playerId)
        let hostChanged = false
        if (idx !== -1) {
            const left = lobby.players[idx]
            lobby.players.splice(idx, 1)
            recomputeModeByPlayers(lobby)
            normalizeOrder(lobby)
            logChange({
                action: 'player:left',
                lobbyCode: lobby.code,
                byPlayerId: playerId,
                byPlayerName: left.name,
                details: { name: left.name }
            })
        }
        if (lobby.hostId === playerId) {
            lobby.hostId = lobby.players[0]?.playerId ?? null
            hostChanged = true
            logChange({ action: 'host:autoTransferred', lobbyCode: lobby.code, details: { newHost: lobby.hostId } })
        }

        const everyoneReady = lobby.players.length >= 2 && lobby.players.every(p => p.ready)
        if ((!everyoneReady || lobby.players.length === 0) && lobby._countdownTimer) {
            clearTimeout(lobby._countdownTimer); lobby._countdownTimer = null
            io.to(lobby.code).emit('countdownCancelled')
            logChange({ action: 'countdown:cancelled', lobbyCode: lobby.code })
        }

        if (lobby.players.length === 0) {
            clearPhaseTimer(lobby)
            clearLobbyIdleTimer(lobby)
            lobbies.delete(lobby.code)
            logChange({ action: 'lobby:removed(empty)', lobbyCode: lobby.code })
        } else {
            // ⬅️ po wyjściu: przelicz Hot-Seat i prywatność
            recomputeHotSeatAndPrivacy(lobby)
            emitLobby(lobby, socket.id, 'leaveLobby', { hostChanged })
        }

        emitPublic('leaveLobby')
        setModeDefaultTargets(lobby)

        socket.leave(lobby.code)
        socket.emit('leftLobby', { success: true })
    })


    // WYRZUĆ
    socket.on('kickPlayer', ({ code, playerId: kickedId }: { code: string; playerId: string }) => {
        const lobby = lobbies.get(String(code).toUpperCase()); if (!lobby) return
        const callerId = socketPlayer.get(socket.id); if (callerId !== lobby.hostId) return

        const idx = lobby.players.findIndex(p => p.playerId === kickedId)
        if (idx !== -1) {
            const kicked = lobby.players[idx]
            const kickedSocketId = kicked.socketId
            if (kickedSocketId) io.to(kickedSocketId).emit('kicked')
            const target = kickedSocketId ? io.sockets.sockets.get(kickedSocketId) : undefined
            if (target) {
                target.leave(lobby.code)
                // target.disconnect(true) // (opcjonalnie)
            }

            lobby.players.splice(idx, 1)
            recomputeModeByPlayers(lobby)
            normalizeOrder(lobby)

            logChange({
                action: 'player:kicked',
                lobbyCode: lobby.code,
                byPlayerId: callerId,
                byPlayerName: getPlayerNameById(lobby, callerId),
                details: { kickedId: kicked.playerId, name: kicked.name }
            })
        }

        const everyoneReady = lobby.players.length >= 2 && lobby.players.every(p => p.ready)
        if (!everyoneReady && lobby._countdownTimer) {
            clearTimeout(lobby._countdownTimer); lobby._countdownTimer = null
            io.to(lobby.code).emit('countdownCancelled')
            logChange({ action: 'countdown:cancelled', lobbyCode: lobby.code })
        }

        // ⬅️ po wyrzuceniu: przelicz Hot-Seat i prywatność
        recomputeHotSeatAndPrivacy(lobby)
        setModeDefaultTargets(lobby)

        emitLobby(lobby, socket.id, 'kickPlayer')
        emitPublic('kickPlayer')
    })


    // NAZWA / PRYWATNOŚĆ
    socket.on('updateLobbyName', ({ code, name, isPrivate }: { code: string; name?: string; isPrivate?: boolean }) => {
        const lobby = lobbies.get(String(code).toUpperCase()); if (!lobby) return
        const callerId = socketPlayer.get(socket.id); if (callerId !== lobby.hostId) return

        // najpierw zaktualizuj nazwy, jeśli podano
        const prev = { name: lobby.name, isPrivate: lobby.isPrivate }
        if (typeof name === 'string') lobby.name = name.slice(0, 50)

        // jeśli ktoś próbuje ustawić publiczne, a są gracze Hot-Seat → zablokuj
        const anyHS = hasHotSeatPlayers(lobby)
        if (typeof isPrivate === 'boolean') {
            if (isPrivate === false && anyHS) {
                socket.emit('error', 'Nie można ustawić lobby jako publiczne, gdy jest aktywny gracz Hot-Seat.')
            } else {
                lobby.isPrivate = isPrivate
            }
        }

        // utrzymaj spójność: Hot-Seat wymusza prywatność
        recomputeHotSeatAndPrivacy(lobby)

        logChange({
            action: 'lobby:metaUpdated',
            lobbyCode: lobby.code,
            byPlayerId: callerId,
            byPlayerName: getPlayerNameById(lobby, callerId),
            details: { from: prev, to: { name: lobby.name, isPrivate: lobby.isPrivate } }
        })

        emitLobby(lobby, socket.id, 'updateLobbyName')
        emitPublic('updateLobbyName')
    })


    // USTAWIENIA
    socket.on(
        'updateSettings',
        (payload: { code: string; settings?: Partial<LobbySettings>; patch?: Partial<LobbySettings> }) => {
            const code = String(payload?.code || '').toUpperCase()
            const lobby = lobbies.get(code)
            if (!lobby) return

            const callerId = socketPlayer.get(socket.id)
            if (callerId !== lobby.hostId) {
                socket.emit('error', 'Tylko host może zmieniać ustawienia.')
                return
            }

            const patchRaw = (payload.settings ?? payload.patch ?? {}) as Partial<LobbySettings>
            if (!patchRaw || typeof patchRaw !== 'object') {
                socket.emit('error', 'Brak ustawień do zmiany.')
                return
            }

            const patch: any = { ...patchRaw }
            if (Object.prototype.hasOwnProperty.call(patch, 'len')) {
                const val = patch.len
                patch.len = typeof val === 'number' ? String(val) : String(val ?? lobby.settings.len)
            }
            if (Object.prototype.hasOwnProperty.call(patch, 'timer')) {
                const val = patch.timer
                patch.timer = typeof val === 'number' ? String(val) : String(val ?? lobby.settings.timer)
            }

            const before = { ...lobby.settings }
            const allowed = [
                'mode', 'len', 'timer', 'rounds', 'order', 'hints', 'showHistory', 'onTimeout',
                'codeSetup', 'hotSeat', 'solo', 'bots'
            ] as const

            // Jeśli są gracze Hot-Seat, nie pozwalaj wyłączyć hotSeat
            const anyHS = hasHotSeatPlayers(lobby)
            if (anyHS && patch.hotSeat === false) {
                socket.emit('error', 'Nie można wyłączyć Hot-Seat, dopóki w lobby jest gracz Hot-Seat.')
                delete patch.hotSeat
            }

            for (const k of allowed) {
                if (Object.prototype.hasOwnProperty.call(patch, k)) {
                    // @ts-expect-error — k sprawdzony
                    lobby.settings[k] = patch[k]
                }
            }

            // długość kodu → reset statów
            if (Object.prototype.hasOwnProperty.call(patch, 'len')) {
                const n = Number(lobby.settings.len)
                lobby.players.forEach(p => {
                    p.secretCode = '0'.repeat(n)
                    p.attempts = 0
                    p.solved = false
                    p.solvedAt = null
                    p.totalTurnTimeMs = 0
                })
                logChange({ action: 'settings:lengthChanged->playersReset', lobbyCode: lobby.code, details: { len: n } })
            }

            // "Stała kolejność" → normalizacja
            if (Object.prototype.hasOwnProperty.call(patch, 'order')) {
                if (lobby.settings.order === 'fixed') {
                    normalizeOrder(lobby)
                }
            }

            // Hot-Seat → Turbo zabronione
            if ((patch.mode === 'turbo' || lobby.settings.mode === 'turbo') && (lobby.settings.hotSeat || anyHS)) {
                lobby.settings.mode = 'standard'
                logChange({ action: 'settings:turboBlockedByHotSeat', lobbyCode: lobby.code })
            }

            // w updateSettings – po zastosowaniu patcha:
            const modeChanged = Object.prototype.hasOwnProperty.call(patch, 'mode')
            if (modeChanged) {
                setModeDefaultTargets(lobby)
            }

            // Spójność: jeśli w lobby jest gracz Hot-Seat, wymuś hotSeat=true i prywatność
            recomputeHotSeatAndPrivacy(lobby)

            const count = lobby.players.length

            if (Object.prototype.hasOwnProperty.call(patch, 'mode')) {
                let desired = patch.mode as GameMode

                if (count <= 1) {
                    desired = 'solo'
                } else if (count === 2) {
                    if (desired !== 'standard' && desired !== 'turbo' && desired !== 'coop') {
                        desired = 'standard'
                    }
                } else { // 3+
                    if (desired === 'solo') {
                        desired = 'standard'
                    }
                }

                // hot-seat blokuje turbo
                if (lobby.settings.hotSeat && desired === 'turbo') {
                    desired = 'standard'
                }
                if (count < 3 && desired === 'ffa') {
                    desired = 'standard'
                }

                patch.mode = desired
            }

            recomputeModeByPlayers(lobby)


            logChange({
                action: 'settings:updated',
                lobbyCode: lobby.code,
                byPlayerId: callerId,
                byPlayerName: getPlayerNameById(lobby, callerId),
                details: { from: before, to: lobby.settings }
            })

            emitLobby(lobby, socket.id, 'updateSettings')
            emitPublic('updateSettings')
        }
    )

    // === STRZAŁ GRACZA + BOTY ===
    // === STRZAŁ GRACZA + BOTY ===
    socket.on('submitGuess', ({ code, guess }: { code: string; guess: string }) => {
        const lobby = lobbies.get(String(code).toUpperCase())
        if (!lobby || lobby.state !== 'game' || lobby.phase !== 'guessing') return

        const callerId = socketPlayer.get(socket.id)
        if (!callerId) return

        const caller = lobby.players.find(p => p.playerId === callerId)
        if (!caller) return

        const guesserId =
            lobby.settings.hotSeat && lobby.settings.mode !== 'turbo' && callerId === lobby.hostId
                ? (lobby.activePlayerId ?? callerId)
                : callerId

        if (!activeGuessers(lobby).includes(guesserId)) return
        if (lobby.settings.hotSeat && lobby.settings.mode !== 'turbo' && lobby.activePlayerId !== guesserId) return
        if (
            !lobby.settings.hotSeat &&
            (lobby.settings.mode === 'turbo' || lobby.settings.mode === 'ffa' || lobby.settings.mode === 'coop') &&
            lobby.guesses.some(g => g.roundId === lobby.roundId && g.guesserId === guesserId)
        ) {
            return
        }

        const len = codeLen(lobby)
        const onTimeout = lobby.settings?.onTimeout ?? 'random'
        const rawGuess = typeof guess === 'string' ? guess : ''
        const isTimeoutEmpty = onTimeout === 'empty' && rawGuess.trim() === ''
        const cleanGuess = rawGuess.replace(/\D/g, '').slice(0, len)
        if (!isTimeoutEmpty && cleanGuess.length !== len) return

        const now = Date.now()
        const finalGuess = isTimeoutEmpty ? '' : cleanGuess
        applyGuessToLobby(lobby, guesserId, finalGuess, now)
        maybeFinishGame(lobby)
        emitLobby(lobby, socket.id, 'submitGuess')
    })


    // === UPDATE TARGETS (tylko host, tylko standard/turbo) ===
    socket.on('updateTargets', (payload: {
        code: string,
        mapping: Record<string, string>, // playerId -> playerId
        sidesByFrom?: Record<string, { fromSide: 'left' | 'right'; toSide: 'left' | 'right' }>
    }) => {
        try {
            const { code, mapping, sidesByFrom } = payload || {}
            if (!code || !mapping) return

            const lobby = lobbies.get(String(code).toUpperCase())
            if (!lobby) return

            // tylko host
            const callerId = socketPlayer.get(socket.id)
            if (callerId !== lobby.hostId) return

            // tylko standard/turbo (w innych trybach overlay jest ukryty)
            if (!(lobby.settings.mode === 'standard' || lobby.settings.mode === 'turbo')) return

            const ids = lobby.players.map(p => p.playerId)
            if (ids.length < 2) return

            // walidacja: kompletna permutacja bez self-loopów
            const seenTo = new Set<string>()
            for (const from of ids) {
                const to = mapping[from]
                if (!to) {
                    socket.emit('error', 'Niepełne mapowanie celów.')
                    return
                }
                if (from === to) {
                    socket.emit('error', 'Zabronione self-loopy: gracz nie może zgadywać samego siebie.')
                    return
                }
                if (!ids.includes(to)) {
                    socket.emit('error', 'Nieprawidłowy cel w mapowaniu.')
                    return
                }
                if (seenTo.has(to)) {
                    socket.emit('error', 'Każdy gracz może być celem tylko jednej osoby (jedno wejście).')
                    return
                }
                seenTo.add(to)
            }

            // zapisz cele
            lobby.players.forEach(p => {
                p.guessTargets = [mapping[p.playerId]]
            })

            // zapisz strony (opcjonalnie)
            if (sidesByFrom) {
                lobby.edgeSides = { ...(lobby.edgeSides ?? {}) }
                for (const from of Object.keys(sidesByFrom)) {
                    const s = sidesByFrom[from]
                    if (!s) continue
                    // sanity check
                    if (s.fromSide !== 'left' && s.fromSide !== 'right') continue
                    if (s.toSide !== 'left' && s.toSide !== 'right') continue
                    lobby.edgeSides[from] = { fromSide: s.fromSide, toSide: s.toSide }
                }
            }

            // rozeslij aktualny stan
            const payloadOut = buildLobbyPayload(lobby, socket.id)
            emitLobby(lobby, socket.id, 'updateTargets')

            logChange?.({
                action: 'targets:updated',
                lobbyCode: lobby.code,
                byPlayerId: callerId,
                byPlayerName: lobby.players.find(p => p.playerId === callerId)?.name ?? '',
                details: { mappingCount: Object.keys(mapping).length, withSides: !!sidesByFrom }
            })
        } catch (err) {
            console.error('updateTargets error:', err)
        }
    })


    // KOLEJNOŚĆ (badge) — tylko host, tylko gdy order==='fixed'
    socket.on('updateOrder', ({ code, order }: { code: string; order: string[] }) => {
        const lobby = lobbies.get(String(code).toUpperCase()); if (!lobby) return
        const callerId = socketPlayer.get(socket.id)
        if (callerId !== lobby.hostId) {
            socket.emit('error', 'Tylko host może zmieniać kolejność.')
            return
        }
        if (lobby.settings.order !== 'fixed') {
            socket.emit('error', 'Zmiana kolejności dozwolona tylko przy "Stałej kolejności".')
            return
        }

        // walidacja ID
        const ids = lobby.players.map(p => p.playerId)
        if (order.length !== ids.length || !order.every(id => ids.includes(id))) {
            socket.emit('error', 'Nieprawidłowa kolejność.')
            return
        }

        // Zapisz numerki 1..N wg przysłanej kolejności
        const pos: Record<string, number> = {}
        order.forEach((id, i) => { pos[id] = i + 1 })
        lobby.players.forEach(p => { p.order = pos[p.playerId] ?? p.order ?? 999 })

        normalizeOrder(lobby)
        emitLobby(lobby, socket.id, 'updateOrder')
        emitPublic('updateOrder')
    })

    // READY / NICK / SECRET
    // READY / NICK / SECRET / WINTEXT
    // READY / NICK / SECRET / WINTEXT
    socket.on('updateReady', ({
        code,
        ready,
        nickname,
        secretCode,
        winText,            // NEW
    }: {
        code: string;
        ready?: boolean;
        nickname?: string;
        secretCode?: string;
        winText?: string;   // NEW
    }) => {
        const lobby = lobbies.get(String(code).toUpperCase()); if (!lobby) return
        const pid = socketPlayer.get(socket.id); if (!pid) return
        const me = lobby.players.find(p => p.playerId === pid); if (!me) return

        // --- prosta walidacja / sanitizacja ---
        const sanitizeWinText = (txt: string | undefined | null) => {
            if (typeof txt !== 'string') return undefined
            // wytnij kontrolne, przytnij długość, usuń nadmiar białych znaków
            const collapsed = txt.replace(/[\u0000-\u001F]/g, '').replace(/\s+/g, ' ').trim()
            // limit rozsądny dla UI, np. 80 znaków
            const limited = collapsed.slice(0, 80)
            return limited
        }

        const prev = {
            ready: me.ready,
            nickname: me.name,
            secretLen: me.secretCode.length,
            winText: me.winText ?? '',
        }

        const activeSetupPlayer =
            lobby.settings.hotSeat &&
                lobby.state === 'game' &&
                lobby.phase === 'codeSetupInput' &&
                pid === lobby.hostId
                ? lobby.players.find(p => p.playerId === lobby.activePlayerId)
                : null
        const targetForUpdate = activeSetupPlayer ?? me

        if (typeof nickname === 'string' && !activeSetupPlayer) me.name = nickname.slice(0, 24)
        if (typeof secretCode === 'string') targetForUpdate.secretCode = secretCode.slice(0, Number(lobby.settings.len))

        // NEW: winText jest opcjonalny, ustaw tylko jeśli przyszło w payloadzie
        const sanitizedWT = sanitizeWinText(winText)
        if (sanitizedWT !== undefined) {
            targetForUpdate.winText = sanitizedWT
        }

        if (typeof ready === 'boolean') targetForUpdate.ready = ready

        logChange({
            action: 'player:updated',
            lobbyCode: lobby.code,
            byPlayerId: pid,
            byPlayerName: me.name,
            details: {
                from: prev,
                to: {
                    ready: me.ready,
                    nickname: me.name,
                    secretLen: me.secretCode.length,
                    winText: me.winText ?? ''
                }
            }
        })

        emitLobby(lobby, socket.id, 'updateReady')

        if (lobby.state === 'game' && lobby.phase === 'codeSetupInput' && activeSetupPlayer && hasValidCode(lobby, activeSetupPlayer)) {
            startHotSeatCodeSetup(lobby, (lobby.setupIndex || 0) + 1)
            emitLobby(lobby, socket.id, 'codeSetup:next')
            return
        }

        if (lobby.state === 'game' && lobby.phase === 'codeSetupAll') {
            if (lobby.players.every(p => hasValidCode(lobby, p))) {
                startGuessingPhase(lobby)
                emitLobby(lobby, socket.id, 'codeSetup:complete')
            }
            return
        }

        // --- SOLO --- (1 gracz)
        if (lobby.players.length === 1 && lobby.state === 'lobby') {
            lobby.settings.solo = true

            // gracz kliknął READY → rozpocznij odliczanie
            if (typeof ready === 'boolean' && ready) {
                // jeśli już trwa jakieś odliczanie, nie duplikuj
                if (lobby._countdownTimer) return

                io.to(lobby.code).emit('allPlayersReady') // frontend pokaże licznik
                logChange({ action: 'solo:countdown(5s)', lobbyCode: lobby.code, byPlayerId: pid, byPlayerName: me.name })

                lobby._countdownTimer = setTimeout(() => {
                    lobby._countdownTimer = null

                    const len = Number(lobby.settings.len || '4')
                    const secret = generateRandomDigits(len)
                    lobby.soloCode = secret
                    lobby.state = 'game'
                    lobby.phase = 'guessing'

                    // 🔥 NOWE – ustawienie pierwszej rundy SOLO po stronie serwera
                    const timerSec = Number(lobby.settings.timer || '0') || 0
                    const now = Date.now()

                    lobby.roundId = 1
                    lobby.roundStartTs = now
                    lobby.roundEndTs = timerSec > 0 ? now + timerSec * 1000 : null
                    schedulePhaseTimeout(lobby)

                    io.to(lobby.code).emit('soloStarted', { len })
                    emitLobby(lobby, socket.id, 'soloStarted')


                    logChange({
                        action: 'solo:started(after countdown)',
                        lobbyCode: lobby.code,
                        byPlayerId: pid,
                        byPlayerName: me.name,
                        details: {
                            len,
                            timerSec,
                            roundId: lobby.roundId,
                            roundStartTs: lobby.roundStartTs,
                            roundEndTs: lobby.roundEndTs,
                        }
                    })
                }, 5000)
            }

            // jeśli odznaczy READY → anuluj odliczanie
            if (typeof ready === 'boolean' && !ready && lobby._countdownTimer) {
                clearTimeout(lobby._countdownTimer)
                lobby._countdownTimer = null
                io.to(lobby.code).emit('countdownCancelled')
                logChange({ action: 'solo:countdownCancelled', lobbyCode: lobby.code, byPlayerId: pid, byPlayerName: me.name })
            }

            return
        }


        // auto-countdown dla GIER WIELOOSOBOWYCH (>=2 graczy)
        const everyoneReady = lobby.players.length >= 2 && lobby.players.every(p => p.ready)
        if (everyoneReady && !lobby._countdownTimer && lobby.state === 'lobby') {
            io.to(lobby.code).emit('allPlayersReady')
            logChange({ action: 'countdown:scheduled(5s)', lobbyCode: lobby.code })

            lobby._countdownTimer = setTimeout(() => {
                lobby._countdownTimer = null

                // ⬇️ TU STARTUJE GRA MULTI – UŻYWAMY startMultiGame
                startMultiGame(lobby)

                // wyślij aktualny stan do wszystkich
                emitLobby(lobby, socket.id, 'game:start')


                emitPublic('game:start')
                logChange({
                    action: 'game:started(after countdown)',
                    lobbyCode: lobby.code,
                    byPlayerId: pid,
                    byPlayerName: me.name,
                    details: { mode: lobby.settings.mode },
                })
            }, 5000)
        }

        // jeśli ktoś zdejmie READY albo lobby już nie jest w stanie 'lobby' → anuluj countdown
        if ((!everyoneReady || lobby.state !== 'lobby') && lobby._countdownTimer) {
            clearTimeout(lobby._countdownTimer)
            lobby._countdownTimer = null
            io.to(lobby.code).emit('countdownCancelled')
            logChange({ action: 'countdown:cancelled', lobbyCode: lobby.code })
        }

        // --- STANDARD: po ustawieniu kodów startuje prawdziwa gra ---
        if (lobby.settings.mode === 'standard' && lobby.state === 'game') {
            const len = Number(lobby.settings.len || '4')

            // Czy każdy gracz ma już kod o poprawnej długości?
            const allHaveCode = lobby.players.every(
                p => p.secretCode && p.secretCode.length === len,
            )

            // startujemy tylko raz – gdy standardTurnId jeszcze 0/undefined
            if (allHaveCode && !lobby.standardTurnId) {
                const ordered = [...lobby.players].sort(
                    (a, b) => (a.order || 0) - (b.order || 0),
                )

                lobby.activePlayerId = ordered[0]?.playerId ?? null
                lobby.standardTurnId = 1

                // serwerowy timer dla pierwszej tury
                const timerSec2 = Number(lobby.settings.timer || '0') || 0
                const now2 = Date.now()
                if (lobby.activePlayerId) {
                    lobby.roundStartTs = now2
                    lobby.roundEndTs = timerSec2 > 0 ? now2 + timerSec2 * 1000 : null
                } else {
                    lobby.roundStartTs = null
                    lobby.roundEndTs = null
                }

                lobby.codeSetupDeadline = null

                logChange({
                    action: 'standard:allCodesSet->startGame',
                    lobbyCode: lobby.code,
                    details: {
                        firstPlayerId: lobby.activePlayerId,
                        firstPlayerName: ordered.find(p => p.playerId === lobby.activePlayerId)?.name ?? null,
                    },
                })

                emitLobby(lobby, socket.id, 'standard:allCodesSet')
            }
        }

    })

    socket.on('disconnect', () => {
        logChange({ action: 'socket:disconnected', bySocket: socket.id, byPlayerId: socketPlayer.get(socket.id) })
        socketPlayer.delete(socket.id)
    })
})

/** ─────────────────────────────────────────────────────────────
 *  DEV helper – podgląd lobby
 * ──────────────────────────────────────────────────────────── */
app.get('/dev/lobbies', (_req, res) => {
    const summary = Object.fromEntries(lobbies.entries())
    res.json(summary)
    logChange({ action: 'http:/dev/lobbies', details: { lobbies: Object.keys(summary).length } })
})

/** start */
const PORT = Number(process.env.PORT) || 3000
server.listen(PORT, () => {
    console.log(`🚀 Serwer nasłuchuje na porcie ${PORT}`)
})






