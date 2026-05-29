import { createContext, useEffect, type ReactNode } from 'react'
import { io, Socket } from 'socket.io-client'
import { v4 as uuidv4 } from 'uuid'

function getSocketUrl() {
  return import.meta.env.VITE_SOCKET_URL || undefined
}

export const socket: Socket = io(getSocketUrl(), {
  autoConnect: false,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
})

export const SocketContext = createContext<Socket>(socket)

type SocketProviderProps = {
  children: ReactNode
}

export function SocketProvider({ children }: SocketProviderProps) {
  useEffect(() => {
    let playerId = localStorage.getItem('playerId')
    if (!playerId) {
      playerId = uuidv4()
      localStorage.setItem('playerId', playerId)
    }

    const identify = () => socket.emit('identify', { playerId })
    const onConnectError = (error: Error) => {
      console.error('Blad polaczenia: ', (error as any)?.message || error)
    }
    const onConnectFailed = () => {
      console.error('Polaczenie z serwerem nie powiodlo sie.')
    }

    socket.on('connect', identify)
    socket.on('connect_error', onConnectError)
    socket.on('connect_failed', onConnectFailed)
    socket.connect()

    return () => {
      socket.off('connect', identify)
      socket.off('connect_error', onConnectError)
      socket.off('connect_failed', onConnectFailed)
      socket.disconnect()
    }
  }, [])

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  )
}
