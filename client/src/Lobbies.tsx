import { useContext, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { SocketContext } from "./SocketProvider"

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

export default function LobbiesPage() {
  const socket = useContext(SocketContext)
  const navigate = useNavigate()
  const [lobbies, setLobbies] = useState<PublicLobby[]>([])
  const [joiningCode, setJoiningCode] = useState<string | null>(null)

  // pobierz i subskrybuj listę publicznych lobby
  useEffect(() => {
    const onList = (list: PublicLobby[]) => setLobbies(list ?? [])
    socket.on("publicLobbies", onList)
    socket.emit("getPublicLobbies")
    return () => {
      socket.off("publicLobbies", onList)
    }
  }, [socket])

  // dołączanie: użyj istniejącej ścieżki (getLobby -> lobbyData -> navigate)
  const joinLobby = (code: string) => {
    if (joiningCode) return
    setJoiningCode(code)

    const onLobby = () => {
      socket.off("lobbyNotFound", onNotFound)
      socket.off("lobbyData", onLobby)
      setJoiningCode(null)
      navigate(`/lobby?code=${code}`)
    }
    const onNotFound = () => {
      socket.off("lobbyData", onLobby)
      socket.off("lobbyNotFound", onNotFound)
      setJoiningCode(null)
      alert("To lobby już nie istnieje.")
    }

    socket.once("lobbyData", onLobby)
    socket.once("lobbyNotFound", onNotFound)
    socket.emit("getLobby", { code })
  }

  const sorted = useMemo(
    () => [...lobbies].sort((a, b) => (b.playersCount || 0) - (a.playersCount || 0)),
    [lobbies]
  )

  return (
    <main style={{ minHeight: "100vh", padding: "2rem 1rem", display: "grid", gap: "1rem" }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: ".75rem", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Publiczne lobby</h2>
        <span style={{ opacity: .8 }}>({sorted.length})</span>
        <button onClick={() => socket.emit("getPublicLobbies")} style={{ marginLeft: "auto" }}>
          Odśwież
        </button>
      </header>

      {sorted.length === 0 ? (
        <p>Brak otwartych gier.</p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "grid",
            gap: "0.75rem",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          }}
        >
          {sorted.map((lobby) => (
            <li key={lobby.code}>
              <div className="lobbyCard fade" style={{ width: "100%", textAlign: "left" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".75rem" }}>
                  <strong className="lobbyName">{lobby.name || "Lobby"}</strong>
                  <button
                    onClick={() => joinLobby(lobby.code)}
                    disabled={joiningCode === lobby.code}
                    aria-busy={joiningCode === lobby.code || undefined}
                  >
                    {joiningCode === lobby.code ? "Dołączanie…" : "Dołącz"}
                  </button>
                </div>

                <div className="lobbyMeta" style={{ marginTop: ".5rem" }}>
                  <span className="meta-code">
                    <i className="fa-solid fa-key" />
                    {lobby.code}
                  </span>
                  <span className="meta-players">
                    <i className="fa-solid fa-user-group" />
                    {lobby.playersCount}
                  </span>
                  <span className="meta-mode">
                    <i className="fa-solid fa-gamepad" />
                    {lobby.mode ?? "standard"}
                  </span>
                  <span className="meta-len">
                    <i className="fa-solid fa-hashtag" />
                    {String(lobby.len ?? "4")}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
