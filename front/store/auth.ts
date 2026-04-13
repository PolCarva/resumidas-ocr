import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { clearStoredExpenseSnapshot, readStoredExpenseUserId } from '@/lib/expense-cache'
import { useExpenseStore } from '@/store/expenses'

interface User {
  id: string
  name: string
  email: string
  role: string
}

interface AuthState {
  token: string | null
  user: User | null
  isAuthenticated: boolean
  hasHydrated: boolean
  login: (token: string, user: User) => void
  logout: () => void
  markHydrated: () => void
}

function resetExpenseSession() {
  clearStoredExpenseSnapshot()
  useExpenseStore.getState().resetState()
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      hasHydrated: false,
      login: (token, user) => {
        const previousUserId = get().user?.id ?? null
        const cachedExpenseUserId = readStoredExpenseUserId()

        if (
          (previousUserId && previousUserId !== user.id)
          || (cachedExpenseUserId && cachedExpenseUserId !== user.id)
        ) {
          resetExpenseSession()
        }

        set({ token, user, isAuthenticated: true })
      },
      logout: () => {
        resetExpenseSession()
        set({ token: null, user: null, isAuthenticated: false })
      },
      markHydrated: () => set({ hasHydrated: true }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.markHydrated()
      },
    }
  )
)
