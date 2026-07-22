import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { subscribePrivate, isEchoConnected } from '@/lib/echo'

/**
 * Suscribe a un canal privado de Echo y ejecuta un callback en cada evento.
 * Si la conexión no está disponible la app sigue funcionando (las queries
 * usan refetchInterval como fallback).
 */
export function useEchoChannel(channel: string, events: string[], onEvent: (event: string, payload: unknown) => void) {
  useEffect(() => {
    const cleanup = subscribePrivate(channel, events, onEvent)
    return cleanup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, events.join(',')])
}

/** Suscribe a un canal y ante cualquier evento invalida las query keys dadas. */
export function useEchoInvalidate(channel: string, events: string[], queryKeys: unknown[][]) {
  const queryClient = useQueryClient()
  useEffect(() => {
    const cleanup = subscribePrivate(channel, events, () => {
      for (const key of queryKeys) {
        queryClient.invalidateQueries({ queryKey: key })
      }
    })
    return cleanup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, events.join(','), JSON.stringify(queryKeys)])
}

/** Devuelve el intervalo de polling de respaldo: si Echo está conectado no hace polling. */
export function fallbackInterval(ms: number): number | false {
  return isEchoConnected() ? false : ms
}
