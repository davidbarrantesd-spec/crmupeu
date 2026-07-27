import axios from 'axios'
import { useAuthStore } from '@/stores/auth'

export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8010/api/v1'

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    Accept: 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && useAuthStore.getState().token) {
      useAuthStore.getState().logout()
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)

/** Mensajes por código de estado cuando la API no envía uno propio. */
const STATUS_MESSAGES: Record<number, string> = {
  401: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  403: 'No tienes permiso para esta acción.',
  404: 'No encontramos lo que buscas.',
  422: 'Los datos enviados no son válidos. Revísalos e inténtalo de nuevo.',
  429: 'Demasiadas solicitudes, espera un momento.',
  500: 'Ocurrió un problema en el servidor. Inténtalo de nuevo.',
  502: 'Ocurrió un problema en el servidor. Inténtalo de nuevo.',
  503: 'El servicio no está disponible por el momento. Inténtalo en unos minutos.',
  504: 'El servidor tardó demasiado en responder. Inténtalo de nuevo.',
}

/** Heurística: detecta textos técnicos que no deben mostrarse al usuario. */
function looksTechnical(message: string): boolean {
  return /request failed|status code|network error|timeout of|exceeded|axios|econn|xhr|stack|exception|sqlstate|undefined method|call to a member/i.test(
    message,
  )
}

/** Extrae un mensaje legible (en español) de un error de la API. Nunca devuelve textos técnicos crudos. */
export function apiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status
    const data = error.response?.data as { message?: string; errors?: Record<string, string[]> } | undefined

    // Errores de validación (422): primer mensaje + cuántos más hay
    if (data?.errors) {
      const all = Object.values(data.errors).flat().filter(Boolean)
      if (all.length) {
        return all.length > 1 ? `${all[0]} (y ${all.length - 1} más)` : all[0]
      }
    }

    if (data?.message && !looksTechnical(data.message)) return data.message

    if (error.code === 'ECONNABORTED') return 'La solicitud tardó demasiado. Revisa tu conexión.'
    if (error.code === 'ERR_NETWORK') return 'No se pudo conectar con el servidor. Revisa tu conexión.'

    if (status && STATUS_MESSAGES[status]) return STATUS_MESSAGES[status]
    if (status && status >= 500) return 'Ocurrió un problema en el servidor. Inténtalo de nuevo.'
    if (status && status >= 400) return 'No se pudo completar la solicitud. Inténtalo de nuevo.'

    return 'Ocurrió un error de conexión. Inténtalo de nuevo.'
  }
  if (error instanceof Error && error.message && !looksTechnical(error.message)) {
    // Mensajes lanzados por el propio frontend (ya en español)
    return error.message
  }
  return 'Ocurrió un error inesperado. Inténtalo de nuevo.'
}

/** Descarga un blob devuelto por la API como archivo. */
export async function downloadFile(url: string, filename: string, params?: Record<string, unknown>, method: 'get' | 'post' = 'get') {
  const response =
    method === 'post'
      ? await api.post(url, params, { responseType: 'blob' })
      : await api.get(url, { params, responseType: 'blob' })
  const blob = new Blob([response.data])
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(link.href)
}
