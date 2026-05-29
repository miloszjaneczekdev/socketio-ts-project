import {
  memo,
  useMemo,
  useState,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDroppable,
  useDraggable,
  pointerWithin,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
  type CollisionDetection,
  type Collision,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import style from './Lobby.module.css'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { SocketContext } from './SocketProvider'
import type { LobbyPayload } from '../../shared/types'
import clsx from 'clsx'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import FlowGraphOverlay from './FlowGraphOverlay'

/* ===========================================
 *  Typy i stałe
 * =========================================== */
type BoxId = 'box-0' | 'box-1' | 'box-2' | 'box-3'
type BadgeId = string
type ActiveType = 'badge' | 'crown' | null

type PlayerCard = {
  id: BoxId
  name: string
  avatar: string
  playerId?: string
}

const DEFAULT_AVATAR = '/avatars/avatar4.jpg'
const BOXES: BoxId[] = ['box-0', 'box-1', 'box-2', 'box-3']
const EMPTY_BADGE_IDS: BadgeId[] = []
const EMPTY_EDGE_SIDES: LobbyPayload['edgeSides'] = {}

/* ===========================================
 *  Pomocnicze
 * =========================================== */
function computeViewPlayers(players: LobbyPayload['players'] = [], myId: string | null) {
  if (!myId) return players
  const me = players.find(p => p.playerId === myId)
  const rest = players.filter(p => p.playerId !== myId)
  return me ? [me, ...rest] : rest
}

function findHostBoxId(viewPlayers: NonNullable<LobbyPayload['players']>, hostId?: string | null): BoxId | null {
  const idx = viewPlayers.findIndex(p => p.playerId === hostId)
  return idx >= 0 ? BOXES[idx] ?? null : null
}

function toCards(viewPlayers: NonNullable<LobbyPayload['players']>): PlayerCard[] {
  return BOXES.map((bid, idx) => {
    const p = viewPlayers[idx]
    return {
      id: bid,
      name: p?.name ?? '—',
      avatar: (p?.avatar as any) || DEFAULT_AVATAR,
      playerId: p?.playerId,
    }
  })
}

function formatLobbyCodeDisplay(input?: string | null) {
  const raw = (input || '').replace(/[\s-]/g, '').toUpperCase()
  if (!raw) return ''
  return raw.match(/.{1,3}/g)?.join(' - ') || raw
}

/* ===========================================
 *  Komponent główny
 * =========================================== */
export default function Lobby() {
  const navigate = useNavigate()
  const location = useLocation()
  const socket = useContext(SocketContext)

  const [code, setCode] = useState<string | null>(null)
  const [lobby, setLobby] = useState<LobbyPayload | null>(null)



  // playerId z localStorage (i synchronizacja między kartami)
  const [myPlayerId, setMyPlayerId] = useState<string>(() => localStorage.getItem('playerId') || '')
  useEffect(() => {
    const pid = localStorage.getItem('playerId') || ''
    if (pid) socket.emit('identify', { playerId: pid })
  }, [socket])
  useEffect(() => {
    const sync = () => setMyPlayerId(localStorage.getItem('playerId') || '')
    sync()
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  /* ====== DOŁĄCZANIE / ODBIÓR DANYCH ====== */
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const urlCode = params.get('code')?.toUpperCase() || null
    setCode(urlCode)

    const onLobbyData = (payload: LobbyPayload) => {
      setLobby(payload)

      const latest = localStorage.getItem('playerId') || ''
      if (latest !== myPlayerId) setMyPlayerId(latest)

      if (urlCode) {
        const id = latest || myPlayerId
        const iAmIn = (payload.players || []).some(p => p.playerId === id)
        if (!iAmIn) socket.emit('joinLobby', { code: urlCode })
      }
    }

    const onCreated = ({ code }: { code: string }) => {
      setCode(code)
      socket.emit('getLobby', { code })
    }

    const onNotFound = () => navigate('/')

    const onKicked = () => {
      try {
        socket.off()
        socket.disconnect()
      } catch { }
      navigate('/', { replace: true })
    }

    if (urlCode) socket.emit('getLobby', { code: urlCode })
    else socket.emit('createLobby', { name: 'Host' })

    socket.on('lobbyCreated', onCreated)
    socket.on('lobbyData', onLobbyData)
    socket.on('lobbyNotFound', onNotFound)
    socket.on('kicked', onKicked)
    const onServerError = (msg: string) => console.warn('[server error]', msg)
    socket.on('error', onServerError)

    return () => {
      socket.off('lobbyCreated', onCreated)
      socket.off('lobbyData', onLobbyData)
      socket.off('lobbyNotFound', onNotFound)
      socket.off('kicked', onKicked)
      socket.off('error', onServerError)
    }
  }, [location.search, socket, navigate, myPlayerId])

  /* ====== OBLICZENIA WIDOKU ====== */
  const iAmHost = lobby?.hostId === myPlayerId

  // porządek globalny (1..N) → tablica playerId
  const serverOrder: string[] = useMemo(() => {
    const explicit = (lobby as any)?.order as string[] | undefined
    if (explicit?.length) return explicit.filter(Boolean)
    return (lobby?.players ?? []).map(p => p.playerId!).filter(Boolean)
  }, [lobby])

  const orderIndexMap = useMemo(() => {
    const m = new Map<string, number>()
    serverOrder.forEach((id, i) => m.set(id, i + 1))
    return m
  }, [serverOrder])

  const [orderState, setOrderState] = useState<string[]>([])
  useEffect(() => setOrderState(serverOrder), [serverOrder])

  const viewPlayers = useMemo(
    () => computeViewPlayers(lobby?.players, myPlayerId),
    [lobby?.players, myPlayerId]
  )
  const playersById = useMemo(
    () => new Map((lobby?.players ?? []).map((player) => [player.playerId, player])),
    [lobby?.players]
  )
  const cards: PlayerCard[] = useMemo(() => toCards(viewPlayers), [viewPlayers])
  const hostBoxId: BoxId | null = useMemo(
    () => findHostBoxId(viewPlayers, lobby?.hostId),
    [viewPlayers, lobby?.hostId]
  )

  const badgeAt = useCallback(
    (boxId: BoxId): BadgeId | undefined => {
      const idx = BOXES.indexOf(boxId)
      return viewPlayers[idx]?.playerId
    },
    [viewPlayers]
  )

  const badgeLabel = useCallback(
    (playerId?: BadgeId | null) => {
      if (!playerId) return ''
      const n = orderIndexMap.get(playerId)
      return n ? String(n) : ''
    },
    [orderIndexMap]
  )

  const playersCount = lobby?.players?.length ?? 0

  const showBadges =
    lobby?.settings?.order === 'fixed' && playersCount > 1

  const canDragBadge = !!(iAmHost && showBadges)

  const itemsForSortable: BadgeId[] = useMemo(
    () => (showBadges ? orderState.filter(Boolean) : []),
    [showBadges, orderState]
  )

  /* ====== UI ====== */
  const [privacyLocked, setPrivacyLocked] = useState<boolean>(!!lobby?.isPrivate)
  useEffect(() => setPrivacyLocked(!!lobby?.isPrivate), [lobby?.isPrivate])
  const [ready, setReady] = useState(false)

  // kod lobby – kopiowanie
  const [lobbyCodeText, setLobbyCodeText] = useState<'code' | 'copied'>('code')
  const [hoverCode, setHoverCode] = useState(false)
  const copyResetRef = useRef<number | null>(null)
  useEffect(() => () => { if (copyResetRef.current) window.clearTimeout(copyResetRef.current) }, [])

  /* ====== DnD ====== */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  )

  const [activeType, setActiveType] = useState<ActiveType>(null)
  const [activeBadgeId, setActiveBadgeId] = useState<BadgeId | null>(null)
  const [overBox, setOverBox] = useState<BoxId | null>(null)

  const resolveOverToBoxId = useCallback((overLike?: string | null): BoxId | null => {
    if (!overLike) return null
    if (BOXES.includes(overLike as BoxId)) return overLike as BoxId
    const idx = viewPlayers.findIndex(p => p.playerId === overLike)
    return idx >= 0 ? (BOXES[idx] as BoxId) : null
  }, [viewPlayers])

  function onDragStart(ev: DragStartEvent) {
    const data = ev.active.data?.current as any
    if (data?.type === 'badge') {
      if (!canDragBadge) return
      setActiveType('badge')
      setActiveBadgeId(data.badgeId as BadgeId)
    } else if (data?.type === 'crown') {
      if (!iAmHost) return
      setActiveType('crown')
      setActiveBadgeId(null)
    }
  }

  function onDragOver(ev: DragOverEvent) {
    setOverBox(resolveOverToBoxId(ev.over?.id as string | undefined))
  }

  function onDragEnd(ev: DragEndEvent) {
    const { active, over } = ev
    if (!lobby || !code) return

    const atype = active.data.current?.type as ActiveType

    // 1) Przekazywanie korony
    if (atype === 'crown' && iAmHost) {
      const dropOverBox = resolveOverToBoxId(over?.id as string | undefined)
      if (dropOverBox) {
        const targetPlayerId = badgeAt(dropOverBox)
        if (targetPlayerId && targetPlayerId !== lobby.hostId) {
          socket.emit('transferHost', { code, playerId: targetPlayerId })
        }
      }
    }

    // 2) Zmiana kolejności odznak (global order)
    if (atype === 'badge' && over && canDragBadge) {
      const activeId = active.id as BadgeId
      const overIdRaw = over.id as string

      // Jeśli "na" innym badge → użyj jego id, jeśli nad boxem → badge właściciela boxa
      const dropBadgeId =
        itemsForSortable.includes(overIdRaw as BadgeId)
          ? (overIdRaw as BadgeId)
          : (badgeAt(resolveOverToBoxId(overIdRaw) || 'box-0') || null)

      if (dropBadgeId && activeId !== dropBadgeId) {
        setOrderState((currentOrder) => {
          const oldIndex = currentOrder.indexOf(activeId)
          const newIndex = currentOrder.indexOf(dropBadgeId)
          if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return currentOrder
          const nextOrder = arrayMove(currentOrder, oldIndex, newIndex)
          socket.emit('updateOrder', { code: (code || '').toUpperCase(), order: nextOrder })
          return nextOrder
        })
      }
    }

    setActiveType(null)
    setActiveBadgeId(null)
    setOverBox(null)
  }

  const isBoxId = (id: string): id is BoxId => BOXES.includes(id as BoxId)

  const collisionByBoxToBadge = useCallback<CollisionDetection>((args) => {
    const aType = (args?.active?.data?.current as any)?.type
    if (aType !== 'badge') return closestCenter(args)

    const hits = pointerWithin(args)
    const first = hits[0]
    if (first) {
      const firstId = String(first.id)
      // nad badge
      if (itemsForSortable.includes(firstId)) return [first]

      // nad boxem
      if (isBoxId(firstId)) {
        const ownerBoxId = resolveOverToBoxId(firstId)
        const badgeIdHere = ownerBoxId ? badgeAt(ownerBoxId) : null
        if (badgeIdHere && itemsForSortable.includes(badgeIdHere)) {
          const fake: Collision = { id: badgeIdHere, data: { droppableContainer: { id: badgeIdHere } } as any }
          return [fake]
        }
      }
    }

    return closestCenter(args)
  }, [badgeAt, itemsForSortable, resolveOverToBoxId])

  // kopiowanie kodu lobby
  function copyLobbyCode() {
    const raw = (lobby?.code || code || 'ABCDEF').replace(/[\s-]/g, '').toUpperCase()

    const markCopied = () => {
      setLobbyCodeText('copied')
      if (copyResetRef.current) window.clearTimeout(copyResetRef.current)
      copyResetRef.current = window.setTimeout(() => setLobbyCodeText('code'), 1600) as unknown as number
    }

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(raw).then(markCopied).catch(() => {
        const ta = document.createElement('textarea')
        ta.value = raw
        ta.setAttribute('readonly', '')
        ta.style.position = 'fixed'
        ta.style.top = '-9999px'
        document.body.appendChild(ta)
        ta.select()
        try { document.execCommand('copy'); markCopied() } catch { }
        finally { document.body.removeChild(ta) }
      })
    } else {
      const ta = document.createElement('textarea')
      ta.value = raw
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.top = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy'); markCopied() } catch { }
      finally { document.body.removeChild(ta) }
    }
  }

  const me = myPlayerId ? playersById.get(myPlayerId) : viewPlayers[0]
  const [nickDraft, setNickDraft] = useState<string>('')
  const [winTextDraft, setWinTextDraft] = useState<string>('')

  useEffect(() => {
    if (!me) return
    setNickDraft(me.name ?? 'gracz')
    const myFromPayload = myPlayerId ? playersById.get(myPlayerId) : undefined
    const wt = (myFromPayload as any)?.winText as string | undefined
    setWinTextDraft((wt ?? '').slice(0, 80))
  }, [me, playersById, myPlayerId])


  const orderIndex =
    lobby?.settings?.order === 'fixed' ? 0 :
      lobby?.settings?.order === 'random' ? 1 : 2



  const timerIndex = ['0', '15', '30', '60'].indexOf(String(lobby?.settings?.timer ?? '0'))
  const hotSeatActive = !!lobby?.settings?.hotSeat

  // >>>>>>>>>>>>>>>>>> DODANE: ref do kontenera (overlay bazuje na nim)
  const containerRef = useRef<HTMLDivElement | null>(null)



  // obok viewPlayers/cards:
  const playerIdsInView = useMemo(
    () => cards.map(c => c.playerId!).filter(Boolean),
    [cards]
  )

  const singleTargetMap: Record<string, string> = useMemo(() => {
    const res: Record<string, string> = {}
    if (!lobby?.players) return res
    for (const p of lobby.players) {
      const t = (p as any).guessTargets as string[] | undefined
      if (t && t[0]) res[p.playerId!] = t[0]
    }
    return res
  }, [lobby?.players])

  const canShowOverlay = (lobby?.settings?.mode === 'standard' || lobby?.settings?.mode === 'turbo')
  const edgeSides = lobby?.edgeSides ?? EMPTY_EDGE_SIDES
  const handleTargetsCommit = useCallback(({
    mapping,
    sidesByFrom,
  }: {
    mapping: Record<string, string>
    sidesByFrom: LobbyPayload['edgeSides']
  }) => {
    if (!iAmHost || !code) return
    socket.emit('updateTargets', { code, mapping, sidesByFrom })
  }, [iAmHost, code, socket])

  const handleKickPlayer = useCallback((playerId: string, isBot: boolean) => {
    if (!code) return
    socket.emit(isBot ? 'removeBot' : 'kickPlayer', { code, playerId })
  }, [code, socket])

  // pod istniejącymi useState:
  const [countdown, setCountdown] = useState<number | null>(null)
  const [countdownActive, setCountdownActive] = useState(false)

  // w useEffect, razem z innymi nasłuchiwaniami socket.on(...):
  useEffect(() => {
    const onAllReady = () => {
      setCountdown(5)
      setCountdownActive(true)
    }

    const onCountdownCancelled = () => {
      setCountdown(null)
      setCountdownActive(false)
    }

    socket.on('allPlayersReady', onAllReady)
    socket.on('countdownCancelled', onCountdownCancelled)

    return () => {
      socket.off('allPlayersReady', onAllReady)
      socket.off('countdownCancelled', onCountdownCancelled)
    }
  }, [socket])

  useEffect(() => {
    if (!countdownActive || countdown === null) return
    if (countdown <= 0) {
      setCountdownActive(false)
      setCountdown(null)
      return
    }
    const t = setTimeout(() => setCountdown(c => (c ? c - 1 : 0)), 1000)
    return () => clearTimeout(t)
  }, [countdownActive, countdown])

  useEffect(() => {
    if (!lobby || !code) return;

    // start gry -> /game
    if (lobby.state === 'game') {
      navigate(`/game?code=${(code || '').toUpperCase()}`, { replace: true });
      return;
    }

    // opcjonalnie: gdyby ktoś trafił na /game a stan wrócił do lobby/summary,
    // przenieś z powrotem na /lobby (bez zmiany URL jeśli już tam jesteś)
    if ((lobby.state === 'lobby' || lobby.state === 'summary') && location.pathname !== '/lobby') {
      navigate(`/lobby?code=${(code || '').toUpperCase()}`, { replace: true });
    }
  }, [lobby?.state, code, navigate, location.pathname]);


  const modeIndex =
    lobby?.settings?.mode === 'solo' ? 0 :
      lobby?.settings?.mode === 'standard' ? 1 :
        lobby?.settings?.mode === 'turbo' ? 2 :
          lobby?.settings?.mode === 'coop' ? 3 :
            4 // ffa

  // ustalamy które mają być disabled
  let modeDisabled: number[] = []
  if (playersCount <= 1) {
    // tylko solo
    modeDisabled = [1, 2, 3, 4]
  } else if (playersCount === 2) {
    // standard + turbo
    modeDisabled = [0, 4]
    if (lobby?.settings?.hotSeat) {
      // hot-seat wyłącza turbo
      modeDisabled.push(2)
    }
  } else {
    // 3+ graczy → tylko solo off
    modeDisabled = [0]
    if (lobby?.settings?.hotSeat) {
      modeDisabled.push(2)
    }
  }















  const LEAVE_LABEL = 'Wyjdź z lobby'
  const LEAVE_CONFIRM_LABEL = 'Czy na pewno chcesz wyjść?'

  const [leaveArmed, setLeaveArmed] = useState(false)
  const [leaveBtnText, setLeaveBtnText] = useState(LEAVE_LABEL)

  const leaveAnimRef = useRef<number | null>(null)
  const leaveTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (leaveAnimRef.current) window.clearInterval(leaveAnimRef.current)
      if (leaveTimeoutRef.current) window.clearTimeout(leaveTimeoutRef.current)
    }
  }, [])

  function animateSwapText(from: string, to: string, onDone?: () => void) {
    if (leaveAnimRef.current) window.clearInterval(leaveAnimRef.current)

    let cur = from
    setLeaveBtnText(cur)

    // 1) kasowanie
    leaveAnimRef.current = window.setInterval(() => {
      if (cur.length > 0) {
        cur = cur.slice(0, -1)
        setLeaveBtnText(cur)
        return
      }

      // 2) wpisywanie
      window.clearInterval(leaveAnimRef.current!)
      leaveAnimRef.current = window.setInterval(() => {
        const nextLen = Math.min(to.length, cur.length + 1)
        cur = to.slice(0, nextLen)
        setLeaveBtnText(cur)

        if (cur.length >= to.length) {
          window.clearInterval(leaveAnimRef.current!)
          leaveAnimRef.current = null
          onDone?.()
        }
      }, 16) // szybkość pisania
    }, 10) // szybkość kasowania
  }

  function resetLeavePrompt() {
    setLeaveArmed(false)
    if (leaveTimeoutRef.current) window.clearTimeout(leaveTimeoutRef.current)
    animateSwapText(leaveBtnText, LEAVE_LABEL)
  }

  function doLeaveLobby() {
    if (!code || !lobby) return
    const meP = myPlayerId ? playersById.get(myPlayerId) : undefined
    const pid = meP?.playerId
    if (pid) socket.emit('leaveLobby', { code, playerId: pid })
    navigate('/')
  }

  function onLeaveIntent() {
    // drugie kliknięcie (w oknie 5s) -> wychodzimy
    if (leaveArmed) {
      doLeaveLobby()
      return
    }

    // pierwsze kliknięcie -> uzbrój + animuj + timeout 5s
    setLeaveArmed(true)
    if (leaveTimeoutRef.current) window.clearTimeout(leaveTimeoutRef.current)

    animateSwapText(LEAVE_LABEL, LEAVE_CONFIRM_LABEL)

    leaveTimeoutRef.current = window.setTimeout(() => {
      resetLeavePrompt()
    }, 5000) as unknown as number
  }



  return (
    <div className={`${style.container} container`} ref={containerRef}>
      <div className={style.logo}>
        <Link
          className={style.logoLogo}
          to="/"
          onClick={(e) => {
            e.preventDefault()
            onLeaveIntent()
          }}
        >
          ZGADNIJ&nbsp;<span>KOD</span>
        </Link>

        <button
          type="button"
          className={style.leaveBtn}
          onClick={onLeaveIntent}
          title="Opuść lobby"
        >
          {leaveBtnText}
        </button>

      </div>

      <div className={style.lobbyNote}>
        <input
          className={style.lobbyName}
          defaultValue={lobby?.name ?? 'NOWE LOBBY'}
          disabled={!iAmHost}
          onBlur={(e) => {
            if (!iAmHost || !code) return
            const name = e.target.value.trim().slice(0, 50)
            if (name && name !== lobby?.name) socket.emit('updateLobbyName', { code, name })
          }}
        />
        <div className={style.lobbyStco}>
          {countdownActive ? (
            <motion.div
              key="countdown"
              className={style.countdownDisplay}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {countdown}
            </motion.div>
          ) : (
            <>
              <motion.button
                type="button"
                className={clsx(style.lobbyState, hotSeatActive && style.disabled)}
                id="privacyState"
                title={
                  hotSeatActive
                    ? 'Tryb Hot-Seat: prywatność jest wymuszona i nie można jej zmienić'
                    : (privacyLocked ? 'Prywatne lobby' : 'Publiczne lobby')
                }
                onClick={() => {
                  if (!iAmHost || !code || hotSeatActive) return
                  const next = !privacyLocked
                  setPrivacyLocked(next)
                  socket.emit('updateLobbyName', { code, isPrivate: next })
                }}
                disabled={!iAmHost || hotSeatActive}
                aria-disabled={!iAmHost || hotSeatActive}
                aria-label={
                  hotSeatActive
                    ? 'Prywatność zablokowana w trybie Hot-Seat'
                    : (privacyLocked ? 'Prywatne lobby' : 'Publiczne lobby')
                }
                layout={false}
                initial={{ opacity: 0.25, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.1, ease: 'easeOut' }}
                whileHover={hotSeatActive ? undefined : { scale: 1.08 }}
                whileTap={hotSeatActive ? undefined : { scale: 0.96 }}
                style={{ willChange: 'transform', transform: 'translateZ(0)' }}
              >
                {privacyLocked ? '🔒' : '🔓'}
              </motion.button>

              <motion.button
                type="button"
                className={style.lobbyCode}
                id="lobbyCode"
                onClick={copyLobbyCode}
                onMouseEnter={() => setHoverCode(true)}
                onMouseLeave={() => setHoverCode(false)}
                onFocus={() => setHoverCode(true)}
                onBlur={() => setHoverCode(false)}
                aria-live="polite"
                title={hoverCode ? 'Skopiuj' : 'Kod lobby'}
                layout={false}
                initial={{ opacity: 0, y: 4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                style={{ willChange: 'transform', transform: 'translateZ(0)' }}
              >
                {lobbyCodeText === 'copied'
                  ? 'Skopiowano!'
                  : (hoverCode ? 'Skopiuj' : formatLobbyCodeDisplay(lobby?.code || code))}
              </motion.button>
            </>
          )}


        </div>
      </div>

      <div className={style.conInner}>
        <div className={style.settings} aria-disabled={!iAmHost}>

          <SettingGroup
            title="Tryb gry"
            options={['Solo', 'Standardowy', 'Turbo', 'Wspólne zgadywanie', 'Każdy↔Każdego']}
            checkedIndex={modeIndex}
            disabled={!iAmHost}
            disabledIndexes={modeDisabled}
            onChangeIndex={(i) => {
              if (!iAmHost || !code) return
              const modes: LobbyPayload['settings']['mode'][] = ['solo', 'standard', 'turbo', 'coop', 'ffa']
              const nextMode = modes[i]
              socket.emit('updateSettings', { code, patch: { mode: nextMode } })
            }}
          />

          <SettingGroup
            title="Długość kodu"
            options={['3', '4', '5', '6', '8']}
            checkedIndex={['3', '4', '5', '6', '8'].indexOf(lobby?.settings?.len ?? '4')}
            disabled={!iAmHost}
            onChangeIndex={(i) => {
              if (!iAmHost || !code) return
              const lens = ['3', '4', '5', '6', '8']
              socket.emit('updateSettings', { code, patch: { len: lens[i] } })
            }}
          />
          <SettingGroup
            title="Limit czasu na turę"
            options={['Bez limitu', '15 s', '30 s', '60 s']}
            checkedIndex={timerIndex}
            name="timer"
            disabled={!iAmHost}
            onChangeIndex={(i) => {
              if (!iAmHost || !code) return
              const timers = ['0', '15', '30', '60']
              socket.emit('updateSettings', { code, patch: { timer: timers[i] } })
            }}
          />
          <div
            className={clsx(
              style.settingSubGroup,
              (lobby?.settings?.timer ?? '0') === '0' && style.disabled
            )}
            id="grp-on-timeout"
          >
            <SettingGroup
              title="Po upływie czasu"
              options={['Pusty strzał', 'Losowy strzał']}
              checkedIndex={(lobby?.settings?.onTimeout ?? 'empty') === 'empty' ? 0 : 1}
              disabled={!iAmHost || (lobby?.settings?.timer ?? '0') === '0'}
              onChangeIndex={(i) => {
                if (!iAmHost || !code) return
                socket.emit('updateSettings', { code, patch: { onTimeout: ['empty', 'random'][i] } })
              }}
            />
          </div>

          {/* KOLEJNOŚĆ GRACZY */}
          <div
            className={clsx(
              style.settingSubGroup,
              (lobby?.settings?.mode === 'solo' || playersCount <= 1) && style.disabled
            )}
            id="grp-order"
          >
            <SettingGroup
              title="Kolejność graczy"
              options={['Stała kolejność', 'Losowa kolejność', 'Losuj co rundę']}
              checkedIndex={orderIndex}
              // 🔒 zablokowane gdy nie jesteś hostem ALBO jest solo / 1 gracz
              disabled={!iAmHost || lobby?.settings?.mode === 'solo' || playersCount <= 1}
              onChangeIndex={(i) => {
                // dodatkowe zabezpieczenie
                if (!iAmHost || !code || lobby?.settings?.mode === 'solo' || playersCount <= 1) return
                const orders = ['fixed', 'random', 'shuffleEachRound'] as const
                socket.emit('updateSettings', { code, patch: { order: orders[i] } })
              }}
            />
          </div>


          <SettingGroup
            title="Rodzaj podpowiedzi"
            options={['Standardowe', 'Tylko liczba trafień', 'Brak podpowiedzi']}
            checkedIndex={
              lobby?.settings?.hints === 'standard' ? 0 :
                lobby?.settings?.hints === 'hitsOnly' ? 1 : 2
            }
            disabled={!iAmHost}
            onChangeIndex={(i) => {
              if (!iAmHost || !code) return
              socket.emit('updateSettings', { code, patch: { hints: ['standard', 'hitsOnly', 'none'][i] } })
            }}
          />
          <SettingGroup
            title="Historia strzałów"
            options={['Włączona', 'Wyłączona']}
            checkedIndex={lobby?.settings?.showHistory ? 0 : 1}
            disabled={!iAmHost}
            onChangeIndex={(i) => {
              if (!iAmHost || !code) return
              socket.emit('updateSettings', { code, patch: { showHistory: i === 0 } })
            }}
          />
        </div>

        <DndContext
          sensors={sensors}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          collisionDetection={collisionByBoxToBadge}
        >
          {/* Uwaga: SortableContext musi dostać listę WSZYSTKICH badge-id */}
          <SortableContext items={itemsForSortable} strategy={rectSortingStrategy}>
            <div className={style.playersWrapper}>
              {/* JA */}
              <div className={style.playerMain}>
                <div className={style.playerCon}>
                  <BoxCard
                    card={cards[0]}
                    badgeId={badgeAt('box-0')}
                    badgeLabelFn={badgeLabel}
                    isHost={hostBoxId === 'box-0'}
                    isOver={overBox === 'box-0'}
                    crownDragging={activeType === 'crown'}
                    hideBadge={activeType === 'badge' && badgeAt('box-0') === activeBadgeId}
                    noAnimIds={EMPTY_BADGE_IDS}
                    canDragCrown={iAmHost}
                    showBadge={showBadges}
                    canDragBadge={canDragBadge}
                  />

                  <div className={style.playerInputs}>
                    <input
                      placeholder="TWÓJ NICKNAME"
                      className={style.lobbyName}
                      value={nickDraft}
                      onChange={(e) => setNickDraft(e.target.value.slice(0, 24))}
                      onBlur={() => {
                        if (!code || nickDraft === me?.name) return
                        socket.emit('updateReady', { code, nickname: nickDraft })
                      }}
                    />
                    <input
                      placeholder="TEKST WYGRANEJ (np. „Rozniosłem Was!”)"
                      className={style.lobbyName}
                      value={winTextDraft}
                      onChange={(e) => {
                        const clean = e.target.value
                          .replace(/[\u0000-\u001F]/g, '')
                          .slice(0, 80)
                        setWinTextDraft(clean)
                      }}
                      onBlur={() => {
                        if (!code) return
                        socket.emit('updateReady', { code, winText: winTextDraft })
                      }}
                      maxLength={80}
                    />

                  </div>
                </div>
                <button
                  id="readyBtn"
                  className={`${style.readyBtn} ${ready ? style.active : ''}`}
                  data-active={ready ? 1 : 0}
                  onClick={() => {
                    const next = !ready
                    setReady(next)
                    if (code) socket.emit('updateReady', { code, ready: next })
                  }}
                >
                  {ready ? 'UNREADY' : 'READY'}
                </button>
              </div>

              {/* POZOSTALI */}
              <div className={style.playersList}>
                {cards.slice(1).filter(c => c.playerId).map((card) => {
                  const boxId = card.id
                  const p = card.playerId ? playersById.get(card.playerId) : undefined
                  const isReady = !!p?.ready
                  const isBot = !!p?.isBot
                  const canKick = iAmHost && hostBoxId !== boxId

                  return (
                    <PlayerRow
                      key={card.playerId || boxId}
                      card={card}
                      ready={isReady}
                      isBot={isBot}
                      badgeId={badgeAt(boxId)}
                      badgeLabelFn={badgeLabel}
                      isHost={hostBoxId === boxId}
                      isOver={overBox === boxId}
                      crownDragging={activeType === 'crown'}
                      hideBadge={activeType === 'badge' && badgeAt(boxId) === activeBadgeId}
                      noAnimIds={EMPTY_BADGE_IDS}
                      canDragCrown={iAmHost}
                      showBadge={showBadges}
                      canDragBadge={canDragBadge}
                      canKick={canKick}
                      onKickPlayer={handleKickPlayer}
                    />
                  )
                })}

                {((lobby?.players?.length ?? 0) < 4) && (
                  <div className={style.waitingMessage}>
                    <div className={style.waitingMessageText}>
                      <WaitingText playersCount={playersCount} />
                    </div>

                    {iAmHost && (
                      <div className={style.waitingActions}>
                        <button
                          type="button"
                          className={style.hotSeatBtn}
                          disabled={!iAmHost || ((lobby?.players?.length ?? 0) >= 4)}
                          onClick={() => {
                            if (!code || !iAmHost) return

                            const isAlreadyHotSeat = !!lobby?.settings?.hotSeat
                            if (!isAlreadyHotSeat) {
                              const confirmed = window.confirm(
                                'Przejść w tryb Hot-Seat?\n\nTo spowoduje:\n• wyrzucenie obecnych graczy online,\n• ustawienie lobby jako PRYWATNE.\n\nKontynuować?'
                              )
                              if (!confirmed) return

                              const toKick = (lobby?.players ?? []).filter(p =>
                                !p.isBot &&
                                !(p.playerId || '').startsWith('local_') &&
                                p.playerId !== lobby?.hostId
                              )
                              toKick.forEach(p => {
                                if (p.playerId) socket.emit('kickPlayer', { code, playerId: p.playerId })
                              })
                            }

                            socket.emit('addHotSeat', { code })
                          }}
                          title={
                            !iAmHost
                              ? 'Tylko host może dodawać graczy lokalnych'
                              : ((lobby?.players?.length ?? 0) >= 4)
                                ? 'Brak wolnych miejsc'
                                : 'Dodaj lokalnego gracza (Hot-Seat)'
                          }
                        >
                          ➕ Dodaj gracza (Hot-Seat)
                        </button>

                        <button
                          type="button"
                          className={style.addBotBtn}
                          onClick={() => {
                            if (!code) return
                            socket.emit('addBots', { code, count: 1 })
                          }}
                          title="Dodaj bota"
                        >
                          🤖 Dodaj bota
                        </button>
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          </SortableContext>

          {/* DRAG OVERLAY */}
          {createPortal(
            <DragOverlay dropAnimation={null} adjustScale={false}>
              {activeType === 'badge' && activeBadgeId && showBadges ? (
                <div className={style.dragGhost} style={{ pointerEvents: 'none' }}>
                  {badgeLabel(activeBadgeId) || '•'}
                </div>
              ) : activeType === 'crown' && iAmHost ? (
                <span className={style.dragGhostCrown} style={{ pointerEvents: 'none' }} aria-hidden>👑</span>
              ) : null}
            </DragOverlay>,
            document.body
          )}
        </DndContext>
      </div>

      {/* >>>>>>>>>>>>>>>>>> DODANE: warstwa strzałek */}
      {/* >>> warstwa strzałek tylko dla standard/turbo */}
      {canShowOverlay && (
        <FlowGraphOverlay
          containerRef={containerRef}
          canEdit={iAmHost}
          playerIds={playerIdsInView}
          mapping={singleTargetMap}                 // playerId -> playerId (z payloadu)
          sidesByFrom={edgeSides}                   // playerId -> { fromSide, toSide } (z payloadu)
          onCommit={handleTargetsCommit}
        />
      )}



    </div>
  )
}


type WaitingFrame = {
  text: string
  typingSpeed?: number
  deletingSpeed?: number
  hold?: number
  className?: string
}

function WaitingText({ playersCount }: { playersCount: number }) {
  const [text, setText] = useState('Oczekiwanie na graczy')
  const [textClassName, setTextClassName] = useState(style.neat)

  const prevPlayersCountRef = useRef<number>(playersCount)
  const startedWaitingAtRef = useRef<number>(Date.now())
  const animTimeoutRef = useRef<number | null>(null)
  const holdTimeoutRef = useRef<number | null>(null)
  const textRef = useRef(text)

  useEffect(() => {
    textRef.current = text
  }, [text])

  const stopAll = useCallback(() => {
    if (animTimeoutRef.current) {
      window.clearTimeout(animTimeoutRef.current)
      animTimeoutRef.current = null
    }
    if (holdTimeoutRef.current) {
      window.clearTimeout(holdTimeoutRef.current)
      holdTimeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => stopAll()
  }, [stopAll])

  const makeFrame = useCallback(
    (
      text: string,
      className: string,
      hold: number,
      typingSpeed = 70,
      deletingSpeed = 32
    ): WaitingFrame => ({
      text,
      className,
      hold,
      typingSpeed,
      deletingSpeed,
    }),
    []
  )

  const animateSwapText = useCallback((
    from: string,
    to: string,
    options?: {
      deletingSpeed?: number
      typingSpeed?: number
      holdBeforeTyping?: number
      className?: string
      onDone?: () => void
    }
  ) => {
    stopAll()

    const deletingSpeed = options?.deletingSpeed ?? 24
    const typingSpeed = options?.typingSpeed ?? 42
    const holdBeforeTyping = options?.holdBeforeTyping ?? 80
    const onDone = options?.onDone

    let cur = from
    setText(cur)
    if (options?.className) setTextClassName(options.className)

    const deleteStep = () => {
      if (cur.length > 0) {
        cur = cur.slice(0, -1)
        setText(cur)
        animTimeoutRef.current = window.setTimeout(deleteStep, deletingSpeed)
        return
      }

      animTimeoutRef.current = window.setTimeout(typeStep, holdBeforeTyping)
    }

    const typeStep = () => {
      if (cur.length < to.length) {
        cur = to.slice(0, cur.length + 1)
        setText(cur)
        animTimeoutRef.current = window.setTimeout(typeStep, typingSpeed)
        return
      }

      animTimeoutRef.current = null
      onDone?.()
    }

    deleteStep()
  }, [stopAll])

  const getTimeBasedFrames = useCallback((count: number, waitMs: number): WaitingFrame[] => {
    const seconds = Math.floor(waitMs / 1000)

    if (count <= 1) {
      if (seconds > 120) {
        return [
          makeFrame('Dołączy tu ktoś w ogóle?', style.annoyed, 8000, 108, 22),
          makeFrame('Serio będę tu siedzieć sam?', style.annoyed, 7500, 104, 24),
          makeFrame('No halo, gdzie są wszyscy?', style.annoyed, 7000, 100, 24),
        ]
      }

      if (seconds > 70) {
        return [
          makeFrame('Nadal czekamy na graczy', style.tired, 6500, 88, 30),
          makeFrame('Wciąż czekamy na graczy', style.tired, 7000, 92, 30),
          makeFrame('No dobra... jeszcze chwilę', style.neat, 5500, 86, 30),
        ]
      }

      if (seconds > 35) {
        return [
          makeFrame('Jestem tu sam', style.tired, 4500, 82, 30),
          makeFrame('Halo? Ktoś?', style.annoyed, 4200, 96, 28),
        ]
      }
    }

    if (count === 2) {
      if (seconds > 90) {
        return [
          makeFrame('No jeszcze dwóch...', style.annoyed, 6500, 96, 24),
          makeFrame('Przecież brakuje tylko dwóch osób', style.tired, 6000, 92, 28),
          makeFrame('Zbieramy ekipę w nieskończoność', style.annoyed, 7000, 102, 24),
        ]
      }

      if (seconds > 45) {
        return [
          makeFrame('Nadal czekamy na resztę', style.tired, 6000, 90, 30),
          makeFrame('No, jest nas dwóch... jeszcze trochę', style.neat, 5200, 80, 30),
        ]
      }
    }

    if (count === 3) {
      if (seconds > 70) {
        return [
          makeFrame('Brakuje tylko jednej osoby...', style.annoyed, 7000, 98, 24),
          makeFrame('No nie, serio tak blisko?', style.annoyed, 6500, 100, 24),
          makeFrame('Jeszcze jeden i startujemy', style.angryCaps, 5200, 52, 22),
        ]
      }

      if (seconds > 30) {
        return [
          makeFrame('Prawie komplet', style.final, 4200, 68, 28),
          makeFrame('No, jeszcze jeden', style.final, 4200, 68, 28),
        ]
      }
    }

    return []
  }, [makeFrame])

  const pickFrameQueue = useCallback((): WaitingFrame[] => {
    const waitMs = Date.now() - startedWaitingAtRef.current
    const prevPlayersCount = prevPlayersCountRef.current
    const joined = playersCount > prevPlayersCount
    const left = playersCount < prevPlayersCount

    const onePlayerLoop: WaitingFrame[] = [
      makeFrame('Oczekiwanie na graczy', style.neat, 5000, 75, 35),
      makeFrame('Oczekuję na graczy', style.neat, 4500, 72, 32),
      makeFrame('Czekam na graczy', style.final, 5000, 65, 30),
      makeFrame('czekam... na graczy', style.tired, 5200, 95, 28),
      makeFrame('Nadal czekamy na graczy', style.neat, 6000, 78, 32),
      makeFrame('Wciąż czekamy na graczy', style.tired, 6500, 82, 34),
      makeFrame('Dołączy tu ktoś w ogóle?', style.annoyed, 8000, 105, 24),
    ]

    const twoPlayersLoop: WaitingFrame[] = [
      makeFrame('Jest nas już dwóch', style.final, 4200, 68, 28),
      makeFrame('No, jeszcze dwóch', style.neat, 4800, 76, 32),
      makeFrame('Powoli się zbiera', style.neat, 4200, 74, 32),
      makeFrame('Jeszcze 2 osoby i lecimy', style.final, 5200, 72, 30),
      makeFrame('Dobra, coś się ruszyło', style.tired, 4500, 84, 30),
      makeFrame('Wciąż czekamy na resztę', style.tired, 5500, 86, 30),
      makeFrame('No nie znikaj teraz tylko', style.annoyed, 5200, 92, 28),
    ]

    const threePlayersLoop: WaitingFrame[] = [
      makeFrame('No, jeszcze jeden', style.final, 4200, 68, 28),
      makeFrame('Brakuje już tylko jednego', style.neat, 4800, 74, 30),
      makeFrame('Prawie komplet', style.final, 3800, 68, 28),
      makeFrame('Jeszcze 1 i startujemy', style.angryCaps, 3800, 50, 22),
      makeFrame('No proszę, prawie pełno', style.neat, 4500, 74, 30),
      makeFrame('Ktoś tu zaraz dołączy...?', style.tired, 5000, 88, 30),
    ]

    const joinMessagesByCount: Record<number, WaitingFrame[]> = {
      2: [
        makeFrame('O, ktoś dołączył', style.final, 2200, 66, 24),
        makeFrame('No w końcu nie jestem sam', style.neat, 2800, 72, 26),
        makeFrame('Dobra, ruszyło się coś', style.tired, 2400, 80, 28),
      ],
      3: [
        makeFrame('No, robi się ekipa', style.final, 2200, 68, 26),
        makeFrame('Jeszcze jeden i komplet', style.annoyed, 2600, 84, 26),
        makeFrame('Okej, to już wygląda dobrze', style.neat, 2400, 76, 28),
      ],
      4: [
        makeFrame('No w końcu komplet', style.angryCaps, 2200, 46, 20),
        makeFrame('Mamy wszystkich', style.final, 2200, 60, 22),
        makeFrame('Elegancko, pełny skład', style.neat, 2200, 68, 24),
      ],
    }

    const leaveMessagesByCount: Record<number, WaitingFrame[]> = {
      3: [
        makeFrame('No nie, już było dobrze', style.annoyed, 2800, 96, 26),
        makeFrame('Ktoś właśnie wyszedł', style.tired, 2400, 82, 28),
        makeFrame('Był komplet i co...', style.annoyed, 3000, 100, 24),
      ],
      2: [
        makeFrame('No nie no, kolejny...', style.annoyed, 2800, 98, 24),
        makeFrame('Znowu nas mniej', style.tired, 2400, 84, 28),
        makeFrame('Dobra, to jeszcze czekamy', style.neat, 2600, 76, 28),
      ],
      1: [
        makeFrame('I znowu zostałem sam', style.annoyed, 3000, 102, 24),
        makeFrame('No super, wszyscy poszli', style.tired, 2600, 86, 28),
        makeFrame('Pięknie, znowu solo', style.annoyed, 2800, 100, 24),
      ],
    }

    let immediate: WaitingFrame[] = []

    if (joined) {
      immediate = joinMessagesByCount[playersCount] ?? []
    } else if (left) {
      immediate = leaveMessagesByCount[playersCount] ?? []
    }

    let loop: WaitingFrame[] = []

    if (playersCount <= 1) {
      loop = [...onePlayerLoop, ...getTimeBasedFrames(1, waitMs)]
    } else if (playersCount === 2) {
      loop = [...twoPlayersLoop, ...getTimeBasedFrames(2, waitMs)]
    } else if (playersCount === 3) {
      loop = [...threePlayersLoop, ...getTimeBasedFrames(3, waitMs)]
    }

    const pickedImmediate =
      immediate.length > 0
        ? [immediate[Math.floor(Math.random() * immediate.length)]]
        : []

    return [...pickedImmediate, ...loop]
  }, [playersCount, makeFrame, getTimeBasedFrames])

  useEffect(() => {
    if (playersCount >= 4) {
      stopAll()
      return
    }

    if (playersCount !== prevPlayersCountRef.current) {
      startedWaitingAtRef.current = Date.now()
    }

    stopAll()

    const queue = pickFrameQueue()
    if (!queue.length) return

    let idx = 0

    const next = () => {
      const frame = queue[idx % queue.length]

      animateSwapText(textRef.current, frame.text, {
        deletingSpeed: frame.deletingSpeed,
        typingSpeed: frame.typingSpeed,
        className: frame.className,
        onDone: () => {
          holdTimeoutRef.current = window.setTimeout(() => {
            idx += 1
            next()
          }, frame.hold ?? 2500)
        },
      })
    }

    next()
    prevPlayersCountRef.current = playersCount

    return () => stopAll()
  }, [playersCount, animateSwapText, pickFrameQueue, stopAll])

  return (
    <span className={clsx(style.waitText, textClassName)} aria-label={text}>
      <span>{text}</span>
    </span>
  )
}

/* ===========================================
 *  Komponenty
 * =========================================== */

function SettingGroup({
  title, options, checkedIndex = 0, name, onChangeIndex, disabled = false, disabledIndexes = []
}: {
  title: string;
  options: string[];
  checkedIndex?: number;
  name?: string;
  onChangeIndex?: (index: number) => void;
  disabled?: boolean;
  disabledIndexes?: number[];
}) {
  const groupName = useMemo(() => name || `g-${title.replace(/\s+/g, '-')}`, [name, title])
  return (
    <div className={style.settingGroup} aria-disabled={disabled}>
      <div className={style.settingHeader}><span>{title}</span></div>
      <div className={style.options}>
        {options.map((o, i) => {
          const optDisabled = disabledIndexes.includes(i)
          return (
            <label
              key={o}
              className={clsx(style.option, optDisabled && style.disabled)}
              title={optDisabled ? 'Opcja niedostępna' : undefined}
            >
              <input
                type="radio"
                name={groupName}
                checked={i === checkedIndex}
                onChange={() => !optDisabled && onChangeIndex?.(i)}
                disabled={optDisabled}
              />
              <span className={style.customCheckbox}></span>
              {o}
            </label>
          )
        })}
      </div>
    </div>
  )
}

const BoxCard = memo(function BoxCard({
  card, badgeId, isHost, isOver, crownDragging, hideBadge, noAnimIds, badgeLabelFn, canDragCrown, showBadge, canDragBadge
}: {
  card: PlayerCard; badgeId?: BadgeId; isHost: boolean; isOver: boolean; crownDragging: boolean; hideBadge: boolean; noAnimIds: BadgeId[]; badgeLabelFn: (id?: BadgeId | null) => string; canDragCrown: boolean; showBadge: boolean; canDragBadge: boolean
}) {
  const { setNodeRef } = useDroppable({ id: card.id, data: { type: 'box', boxId: card.id } })
  return (
    <div className={clsx(style.imgWrapper, style.box)} ref={setNodeRef} data-over={isOver ? 1 : 0} data-fg-id={card.playerId || undefined}>
      {(showBadge) && <span className={style.badgeSlot} aria-hidden />}
      {showBadge && badgeId && (
        <SortableBadge
          id={badgeId}
          label={badgeLabelFn(badgeId)}
          hidden={hideBadge}
          noAnim={noAnimIds.includes(badgeId)}
          canDrag={canDragBadge}
        />
      )}


      <img src={card.avatar} alt="avatar" />
      <span className={style.title}>{'GRACZ'}</span>

      <Crown boxId={card.id} visible={isHost} crownDragging={crownDragging} canDrag={canDragCrown} />
      {crownDragging && isOver && canDragCrown && (
        <span className={clsx(style.playerHostCrown, style.crownPreview)} aria-hidden>👑</span>
      )}
    </div>
  )
})

const PlayerRow = memo(function PlayerRow({
  card,
  ready,
  isBot: isBotPlayer,
  badgeId,
  isHost,
  isOver,
  crownDragging,
  hideBadge,
  noAnimIds,
  badgeLabelFn,
  canDragCrown,
  showBadge,
  canDragBadge,
  canKick,
  onKickPlayer,
}: {
  card: PlayerCard
  ready: boolean
  isBot: boolean
  badgeId?: BadgeId
  isHost: boolean
  isOver: boolean
  crownDragging: boolean
  hideBadge: boolean
  noAnimIds: BadgeId[]
  badgeLabelFn: (id?: BadgeId | null) => string
  canDragCrown: boolean
  showBadge: boolean
  canDragBadge: boolean
  canKick: boolean
  onKickPlayer: (playerId: string, isBot: boolean) => void
}) {
  const { setNodeRef } = useDroppable({ id: card.id, data: { type: 'box', boxId: card.id } })

  const isHotSeat = !!card.playerId && card.playerId.startsWith('local_')
  const isBot = isBotPlayer || (!!card.playerId && card.playerId.startsWith('bot_'))
  const isOnlineHuman = !!card.playerId && !isHotSeat && !isBot && !isHost

  return (
    <div className={clsx(style.players, style.box)} ref={setNodeRef} data-over={isOver ? 1 : 0} data-fg-id={card.playerId || undefined}>
      {(showBadge) && <span className={style.badgeSlot} aria-hidden />}
      {showBadge && badgeId && (
        <SortableBadge
          id={badgeId}
          label={badgeLabelFn(badgeId)}
          hidden={hideBadge}
          noAnim={noAnimIds.includes(badgeId)}
          canDrag={canDragBadge}
        />
      )}

      <span className={style.dropHint} data-box={badgeId}></span>

      <img src={card.avatar || DEFAULT_AVATAR} alt="avatar" />
      <span className={style.playersTitle}>GRACZ</span>

      <span className={style.playersName}>
        {card.name}
        <span className={style.playerIcons} aria-hidden>
          {isHotSeat && <span className={style.playerIcon} title="Gracz lokalny (Hot-Seat)">🪑</span>}
          {isBot && <span className={style.playerIcon} title="Bot">🤖</span>}
          {isOnlineHuman && <span className={style.playerIcon} title="Gracz online">🌐</span>}
        </span>
      </span>

      <span
        className={clsx(style.status, ready ? style.ready : style.notReady)}
        title={ready ? 'Gotowy' : 'Niegotowy'}
        aria-label={ready ? 'Gracz gotowy' : 'Gracz niegotowy'}
      >
        {ready ? '✅' : '⏳'}
      </span>

      {canKick && (
        <button
          className={style.removeBtn}
          onClick={() => {
            if (card.playerId) onKickPlayer(card.playerId, isBot)
          }}
          title="Usuń"
          aria-label={`Usuń gracza ${card.name}`}
          type="button"
        >
          Usuń
        </button>
      )}

      {isHost && (
        <Crown boxId={card.id} visible={true} crownDragging={crownDragging} canDrag={canDragCrown} />
      )}
      {crownDragging && isOver && canDragCrown && (
        <span className={clsx(style.playerHostCrown, style.crownPreview)} aria-hidden>
          👑
        </span>
      )}
    </div>
  )
})

function SortableBadge({
  id,
  hidden = false,
  noAnim = false,
  label,
  canDrag = false,
}: {
  id: BadgeId
  hidden?: boolean
  noAnim?: boolean
  label?: string
  canDrag?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, data: { type: 'badge', badgeId: id }, disabled: !canDrag })

  const styleInline: React.CSSProperties = {
    transform: isDragging ? undefined : CSS.Transform.toString(transform),
    transition: noAnim ? 'none' : (transition ?? 'transform 250ms cubic-bezier(.2,.8,.2,1)'),
    zIndex: isDragging ? 10 : 2,
    cursor: canDrag ? 'grab' : 'default',
    willChange: 'transform',
    touchAction: 'none',
  }

  const className = clsx(
    style.badge,
    isDragging && style.badgeDragging,
    hidden && style.badgeHidden,
    !canDrag && style.badgeDisabled
  )

  const num = label ?? ''

  return (
    <div
      ref={setNodeRef}
      className={className}
      style={styleInline}
      {...listeners}
      {...attributes}
      role={canDrag ? 'button' : 'img'}
      tabIndex={canDrag ? 0 : -1}
      title={canDrag ? `Przeciągnij, aby zmienić globalną kolejność` : `Kolejność ustala host`}
      aria-disabled={!canDrag}
      aria-label={canDrag
        ? `Gracz numer ${num}. Przeciągnij, aby zmienić kolejność.`
        : `Gracz numer ${num}. Tylko host może zmieniać kolejność.`}
    >
      {num}
    </div>
  )
}

function Crown({
  boxId,
  visible,
  crownDragging,
  canDrag,
}: {
  boxId: BoxId
  visible: boolean
  crownDragging?: boolean
  canDrag: boolean
}) {

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `crown-${boxId}`,
    data: { type: 'crown', fromBoxId: boxId },
    disabled: !visible || !canDrag
  })

  if (!visible) return null

  const dragStyle =
    isDragging || !transform
      ? undefined
      : ({ transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } as const)

  return (
    <span className={style.crownAnchor}>
      <span
        ref={setNodeRef}
        className={clsx(style.playerHostCrown, crownDragging && style.crownHidden)}
        style={dragStyle}
        {...(canDrag ? listeners : {})}
        {...(canDrag ? attributes : {})}
        role={canDrag ? 'button' : undefined}
        tabIndex={canDrag ? 0 : -1}
        title={canDrag ? 'Przeciągnij, aby przekazać koronę' : undefined}
        aria-label={canDrag ? 'Przenieś koronę na inną kartę' : undefined}
      >
        👑
      </span>
    </span>
  )
}


// naprawic funkcje z tym rysowanie lini tak zeby nie było ze mozna podłaczyc dwa wejsca, zrobic tak ze jesli przełaczam i beda dwa wyjsca do jeszcze przed upusczeniem sie to przearanzuje zbey było widac jak sie zmieni


//dodac moze kolejne ustawieni z kto kogog zgaduje albo do tego co juz istnieje z kolejnoscią,
// zrobic ze jak sie nie edytuje to te linie chowają sie pod wszyskie elemnetu czy pod przycisk pod input pod diva player box i tak dalej 


//dodac zeby nie pojawiałs ie badge z kolejnościa jak jest jeden gracz, zrobi zeby faktycznie przenosiło na game

