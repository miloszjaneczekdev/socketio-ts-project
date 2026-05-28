// src/components/LobbyRotator.tsx
import { useContext, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { SocketContext } from "./SocketProvider"
import styles from "./LobbyRotator.module.css"

type PublicLobby = {
  code: string
  name: string
  playersCount: number
  maxPlayers?: number
  state?: "lobby" | "game" | "summary"
  isPrivate?: boolean
  mode?: string
  len?: number | string
}

type Props = {
  intervalMs?: number
}

export default function LobbyRotator({ intervalMs = 5000 }: Props) {
  const socket = useContext(SocketContext)
  const navigate = useNavigate()

  const [lobbies, setLobbies] = useState<PublicLobby[]>([])
  const [idx, setIdx] = useState(0)
  const [hidden, setHidden] = useState(false)
  const intervalRef = useRef<number | null>(null)

  // pobierz listę publicznych lobby po starcie
  useEffect(() => {
    const onList = (list: PublicLobby[]) => {
      setLobbies(list ?? [])
      setIdx(0)
    }

    socket.on("publicLobbies", onList)
    socket.emit("getPublicLobbies")

    return () => {
      socket.off("publicLobbies", onList)
    }
  }, [socket])

  // auto-rotacja
  useEffect(() => {
    if (lobbies.length <= 1) return
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = window.setInterval(() => setHidden(true), intervalMs)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [lobbies, intervalMs])

  const lobby = useMemo(() => lobbies[idx], [lobbies, idx])

  const onTransitionEnd = (e: React.TransitionEvent<HTMLButtonElement>) => {
    if (e.propertyName !== "opacity") return
    setIdx((p) => (lobbies.length ? (p + 1) % lobbies.length : 0))
    setHidden(false)
  }

  const modeIcon = (mode?: string) => {
    const m = (mode || "").toLowerCase()
    if (m === "turbo") return <i className="fa-solid fa-bolt" />
    if (m === "coop") return <i className="fa-solid fa-people-carry-box" />
    return <i className="fa-solid fa-gamepad" />
  }

  if (!lobbies.length) {
    return (
      <section className={styles.lobbies}>
        <div className={styles.tapeSection} />
        <h3>
          <strong>Publiczne lobby</strong>
        </h3>
        <p>Brak otwartych gier</p>
        <div className={styles.tapeSection} />
      </section>
    )
  }

  return (
    <section className={styles.lobbies} data-interval={intervalMs}>
      <div className={styles.tapeSection} />
      <h3>
        <strong>Publiczne lobby ({lobbies.length})</strong>
      </h3>
      <Link to={"/lobbies"}>Kliknij żeby zobaczyć wszystkie</Link>

      <button
        className={`${styles.lobbyCard} ${styles.fade} ${hidden ? styles.isHidden : ""}`}
        onClick={() => navigate(`/lobby?code=${lobby.code}`)}
        onTransitionEnd={onTransitionEnd}
        aria-label={`Zobacz wszystkie lobby (obecnie: ${lobby.name})`}
      >
        <strong className={styles.lobbyName}>{lobby.name || "NOWE LOBBY"}</strong>
        <div className={styles.lobbyMeta}>
          <span className={styles.metaCode}>
            <i className="fa-solid fa-key" />
            {lobby.code}
          </span>
          <span className={styles.metaPlayers}>
            <i className="fa-solid fa-user-group" />
            {lobby.playersCount}
          </span>
          <span className={styles.metaMode}>
            {modeIcon(lobby.mode)}
            {lobby.mode || "standard"}
          </span>
          <span className={styles.metaLen}>
            <i className="fa-solid fa-hashtag" />
            {String(lobby.len ?? "4")}
          </span>
        </div>
      </button>

      <div className={styles.tapeSection} />
    </section>
  )
}
