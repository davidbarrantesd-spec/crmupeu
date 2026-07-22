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

/** Extrae un mensaje legible de un error de la API. */
export function apiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string; errors?: Record<string, string[]> } | undefined
    if (data?.errors) {
      const first = Object.values(data.errors)[0]
      if (first?.length) return first[0]
    }
    if (data?.message) return data.message
    if (error.code === 'ERR_NETWORK') return 'No se pudo conectar con el servidor'
    return error.message
  }
  return 'Ocurrió un error inesperado'
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
