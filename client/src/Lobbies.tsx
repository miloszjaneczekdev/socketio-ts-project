import { useContext, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SocketContext } from './SocketProvider'
import SiteFooter from './SiteFooter'
import styles from './Lobbies.module.css'

const RESPONSE_TIMEOUT_MS = 5000

type PublicLobby = {
  code: string
  name: string
  playersCount: number
  maxPlayers?: number
  state?: 'lobby' | 'game' | 'summary'
  isPrivate?: boolean
  mode?: string
  len?: number | string
}

const PAPER_COLORS = [
  'paperBlue',
  'paperGreen',
  'paperYellow',
  'paperRed',
] as const

const PAPER_POSES = [
  'poseA',
  'poseB',
  'poseC',
  'poseD',
  'poseE',
  'poseF',
  'poseG',
  'poseH',
] as const

const CORNER_TAPE_VARIANTS = [
  'tapeAll',
  'tapeNoTopLeft',
  'tapeNoTopRight',
  'tapeNoBottomLeft',
  'tapeNoBottomRight',
  'tapeOnlyTop',
  'tapeOnlyBottom',
  'tapeDiagonalA',
  'tapeDiagonalB',
] as const

function getStableIndex(input: string, length: number) {
  let hash = 0

  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0
  }

  return Math.abs(hash) % length
}

function getLobbyPaperClass(code: string) {
  return PAPER_COLORS[getStableIndex(code, PAPER_COLORS.length)]
}

function getLobbyPoseClass(code: string) {
  return PAPER_POSES[getStableIndex(`${code}-pose`, PAPER_POSES.length)]
}

function getLobbyTapeClass(code: string) {
  const useTopStrip = getStableIndex(`${code}-tape-style`, 2) === 0

  if (useTopStrip) return 'tapeTopStrip'

  return CORNER_TAPE_VARIANTS[getStableIndex(`${code}-tape`, CORNER_TAPE_VARIANTS.length)]
}

function getModeIcon(mode?: string) {
  const normalized = String(mode ?? '').toLowerCase()

  if (normalized === 'turbo') return 'fa-solid fa-gauge-high'
  if (normalized === 'coop') return 'fa-solid fa-handshake-angle'
  if (normalized === 'ffa') return 'fa-solid fa-burst'
  if (normalized === 'solo') return 'fa-solid fa-user-ninja'

  return 'fa-solid fa-chess-knight'
}

function getModeLabel(mode?: string) {
  const normalized = String(mode ?? 'standard').toLowerCase()

  if (normalized === 'ffa') return 'FFA'
  if (normalized === 'coop') return 'Wspólne'
  if (normalized === 'solo') return 'Solo'
  if (normalized === 'turbo') return 'Turbo'

  return 'Standard'
}

export default function LobbiesPage() {
  const socket = useContext(SocketContext)
  const navigate = useNavigate()

  const [lobbies, setLobbies] = useState<PublicLobby[]>([])
  const [joiningCode, setJoiningCode] = useState<string | null>(null)
  const [joinError, setJoinError] = useState('')

  const leaveBtnText = '← Wróć'

  const onLeaveIntent = () => {
    navigate('/')
  }

  useEffect(() => {
    const onList = (list: PublicLobby[]) => {
      setLobbies(list ?? [])
    }

    socket.on('publicLobbies', onList)
    socket.emit('getPublicLobbies')

    return () => {
      socket.off('publicLobbies', onList)
    }
  }, [socket])

  const joinLobby = (code: string) => {
    if (joiningCode) return

    setJoinError('')
    setJoiningCode(code)

    const timeoutId = window.setTimeout(() => {
      socket.off('lobbyData', onLobby)
      socket.off('lobbyNotFound', onNotFound)
      setJoiningCode(null)
      setJoinError('Przekroczono czas oczekiwania na dołączenie do lobby.')
    }, RESPONSE_TIMEOUT_MS)

    const finish = () => {
      window.clearTimeout(timeoutId)
      socket.off('lobbyData', onLobby)
      socket.off('lobbyNotFound', onNotFound)
      setJoiningCode(null)
    }

    const onLobby = () => {
      finish()
      navigate(`/lobby?code=${code}`)
    }

    const onNotFound = () => {
      finish()
      setJoinError('To lobby już nie istnieje.')
    }

    socket.once('lobbyData', onLobby)
    socket.once('lobbyNotFound', onNotFound)
    socket.emit('getLobby', { code })
  }

  const sorted = useMemo(
    () =>
      [...lobbies].sort((a, b) => {
        const aIsOpen = (a.state ?? 'lobby') === 'lobby'
        const bIsOpen = (b.state ?? 'lobby') === 'lobby'

        if (aIsOpen !== bIsOpen) return aIsOpen ? -1 : 1

        return (b.playersCount || 0) - (a.playersCount || 0)
      }),
    [lobbies],
  )

  return (
    <div className={`${styles.page} container`}>
      <div className={styles.logo}>
        <Link
          className={styles.logoLogo}
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
          className={styles.leaveBtn}
          onClick={onLeaveIntent}
          title="Opuść listę lobby"
        >
          {leaveBtnText}
        </button>
      </div>

      <main className={styles.content}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Otwarte gry</p>
          <h1>Publiczne lobby</h1>
          <p className={styles.subtitle}>
            Wybierz karteczkę z lobby i dołącz do gry.
          </p>

          <div className={styles.headerActions}>

            <button
              type="button"
              className={`${styles.btn} ${styles.blue}`}
              onClick={() => {
                socket.emit('getPublicLobbies')
              }}
            >
              Odśwież
            </button>
          </div>
        </header>

        {joinError && (
          <p className={styles.error} role="alert">
            {joinError}
          </p>
        )}

        {sorted.length === 0 ? (
          <section className={`${styles.emptyPaper} ${styles.paperBlue} ${styles.poseA}`}>
            <div className={styles.tapeSection} />

            <h2>Brak otwartych gier</h2>
            <p>Aktualnie nikt nie ma publicznego lobby. Spróbuj odświeżyć listę.</p>

            <div className={styles.tapeSection} />
          </section>
        ) : (
          <ul className={styles.lobbyGrid}>
            {sorted.map((lobby) => {
              const colorClass = getLobbyPaperClass(lobby.code)
              const poseClass = getLobbyPoseClass(lobby.code)
              const tapeClass = getLobbyTapeClass(lobby.code)
              const isJoining = joiningCode === lobby.code
              const isOpen = (lobby.state ?? 'lobby') === 'lobby'

              return (
                <li key={lobby.code} className={styles.lobbyItem}>
                  <article className={`${styles.paper} ${styles[colorClass]} ${styles[poseClass]} ${styles[tapeClass]}`}>
                    <div className={styles.tapeSection} />

                    <div className={styles.paperTop}>
                      <div className={styles.lobbyTitle}>
                        <b title={lobby.name || 'NOWE LOBBY'}>
                          {lobby.name || 'NOWE LOBBY'}
                        </b>
                      </div>

                      <button
                        type="button"
                        className={styles.joinBtn}
                        onClick={() => {
                          joinLobby(lobby.code)
                        }}
                        disabled={!isOpen || isJoining}
                        aria-busy={isJoining || undefined}
                      >
                        {isJoining ? 'Dołączanie…' : isOpen ? 'Dołącz' : 'Zajęte'}
                      </button>
                    </div>

                    <div className={styles.lobbyDetails}>
                      <div className={styles.lobbyCodeValue}>
                        {lobby.code}
                      </div>

                      <div className={styles.lobbyMeta}>
                        <span>
                          <i className="fa-solid fa-user-group" aria-hidden="true" />
                          {lobby.playersCount}/{lobby.maxPlayers ?? 4}
                        </span>

                        <span>
                          <i className={getModeIcon(lobby.mode)} aria-hidden="true" />
                          {getModeLabel(lobby.mode)}
                        </span>

                        <span>
                          <i className="fa-solid fa-hashtag" aria-hidden="true" />
                          {String(lobby.len ?? '4')}
                        </span>
                      </div>
                    </div>

                    <div className={styles.tapeSection} />
                  </article>
                </li>
              )
            })}
          </ul>
        )}

        <div className={styles.footerSlot}>
          <SiteFooter />
        </div>
      </main>
    </div>
  )
}
