import Echo from 'laravel-echo'
import Pusher from 'pusher-js'
import { useAuthStore } from '@/stores/auth'
import { API_URL } from '@/api/client'

declare global {
  interface Window {
    Pusher: typeof Pusher
  }
}

window.Pusher = Pusher

let echoInstance: Echo<'reverb'> | null = null
let connectionFailed = false

const REVERB_HOST: string = import.meta.env.VITE_REVERB_HOST ?? 'localhost'
const REVERB_PORT = Number(import.meta.env.VITE_REVERB_PORT ?? 8081)
const REVERB_KEY: string = import.meta.env.VITE_REVERB_KEY ?? 'cobranzas-key'

/**
 * En producción la página se sirve por HTTPS y el navegador bloquea `ws://`
 * (contenido mixto), así que el WebSocket debe ir por `wss://`. Se puede forzar
 * con VITE_REVERB_SCHEME=https; si no, se deduce del esquema de la página.
 */
const REVERB_SCHEME = import.meta.env.VITE_REVERB_SCHEME as string | undefined
const FORCE_TLS =
  REVERB_SCHEME === 'https' ||
  (REVERB_SCHEME === undefined &&
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:')

function authEndpoint(): string {
  // API_URL termina en /api/v1 — broadcasting/auth vive en la raíz del backend
  return `${API_URL.replace(/\/api\/v1\/?$/, '')}/broadcasting/auth`
}

export function getEcho(): Echo<'reverb'> | null {
  if (connectionFailed) return echoInstance
  if (echoInstance) return echoInstance
  const token = useAuthStore.getState().token
  if (!token) return null
  try {
    echoInstance = new Echo({
      broadcaster: 'reverb',
      key: REVERB_KEY,
      wsHost: REVERB_HOST,
      wsPort: REVERB_PORT,
      wssPort: REVERB_PORT,
      forceTLS: FORCE_TLS,
      enabledTransports: FORCE_TLS ? ['wss'] : ['ws', 'wss'],
      authEndpoint: authEndpoint(),
      auth: {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      },
    })
    const pusher = echoInstance.connector.pusher
    pusher.connection.bind('failed', () => {
      connectionFailed = true
    })
    pusher.connection.bind('unavailable', () => {
      connectionFailed = true
    })
    return echoInstance
  } catch {
    connectionFailed = true
    return null
  }
}

/** true si la conexión websocket está establecida */
export function isEchoConnected(): boolean {
  const state = echoInstance?.connector?.pusher?.connection?.state
  return state === 'connected'
}

export function disconnectEcho() {
  if (echoInstance) {
    try {
      echoInstance.disconnect()
    } catch {
      // ignorar
    }
    echoInstance = null
    connectionFailed = false
  }
}

type Handler = (event: string, payload: unknown) => void

/** Suscribe a un canal privado. Devuelve función de limpieza. No lanza si Echo no está disponible. */
export function subscribePrivate(channelName: string, events: string[], handler: Handler): () => void {
  const echo = getEcho()
  if (!echo) return () => {}
  try {
    const channel = echo.private(channelName)
    for (const event of events) {
      channel.listen(`.${event}`, (payload: unknown) => handler(event, payload))
      channel.listen(event, (payload: unknown) => handler(event, payload))
    }
    return () => {
      try {
        echo.leave(channelName)
      } catch {
        // ignorar
      }
    }
  } catch {
    return () => {}
  }
}
