import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthUser } from '@/types'

interface AuthState {
  token: string | null
  user: AuthUser | null
  setAuth: (token: string, user: AuthUser) => void
  setUser: (user: AuthUser) => void
  logout: () => void
  hasPermission: (perm: string) => boolean
  hasRole: (role: string) => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      setUser: (user) => set({ user }),
      logout: () => set({ token: null, user: null }),
      hasPermission: (perm) => {
        const user = get().user
        if (!user) return false
        if (user.roles?.includes('admin') || user.roles?.includes('super-admin')) return true
        return user.permissions?.includes(perm) ?? false
      },
      hasRole: (role) => get().user?.roles?.includes(role) ?? false,
    }),
    { name: 'cobranzas-auth' },
  ),
)
