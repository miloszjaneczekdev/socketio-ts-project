import { createContext, useEffect, type ReactNode } from 'react'
import { io, Socket } from 'socket.io-client'
import { v4 as uuidv4 } from 'uuid'

// 🔌 Socket instance
export const socket: Socket = io('http://localhost:3000/', { autoConnect: false })

// 🌐 Socket context
export const SocketContext = createContext<Socket>(socket)

type SocketProviderProps = {
  children: ReactNode
}

// 🧠 Komponent, który inicjalizuje połączenie i udostępnia socket
export function SocketProvider({ children }: SocketProviderProps) {
  useEffect(() => {
    let playerId = localStorage.getItem('playerId')
    if (!playerId) {
      playerId = uuidv4()
      localStorage.setItem('playerId', playerId)
    }

    socket.connect()

    // Obsługuje błędy połączenia
    socket.on('connect_error', (error: Error) => {
      console.error('Błąd połączenia: ', (error as any)?.message || error)
    })

    socket.on('connect_failed', () => {
      console.error('Połączenie z serwerem nie powiodło się.')
    })

    // Wysyła identyfikator gracza po połączeniu
    socket.emit('identify', { playerId })

    // Sprzątanie
    return () => {
      socket.disconnect()
      socket.off('connect_error')
      socket.off('connect_failed')
    }
  }, [])

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  )
}
