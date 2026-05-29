import type { ReactNode } from 'react'
import { SocketProvider } from './SocketProvider'

type SocketRouteProps = {
  children: ReactNode
}

export default function SocketRoute({ children }: SocketRouteProps) {
  return <SocketProvider>{children}</SocketProvider>
}
