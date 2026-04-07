import { useAuthStore } from '@/store/auth'
import {
  buildAnalysisFromOcrFreePayload,
  guessStatementDateToken,
  guessTitleFromOcrResult,
  mapOcrFreeHistoryItem,
  type OcrFreeResult,
  type OcrFreeSavedPayload,
} from '@/lib/ocr-free-adapter'

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'development' ? 'http://localhost:8000/api' : '/api')

const EMPTY_FEEDBACK_ITEM: FeedbackApiItem = {
  id: '',
  userId: '',
  userName: '',
  content: '',
  createdAt: new Date(0).toISOString(),
  upvotes: 0,
  upvotedBy: [],
  hasUserUpvoted: false,
}

interface Credentials {
  email: string
  password: string
}

interface RegisterData extends Credentials {
  name?: string
}

interface AuthenticatedUser {
  id: string
  name: string
  email: string
  role: string
}

interface AnalysisUpdateData {
  name: string
  icon?: string
  color?: string
}

interface FeedbackApiItem {
  _id?: string
  id?: string
  user?: { _id: string } | string
  userId?: string
  userName: string
  content: string
  createdAt: string
  upvotes: number
  upvotedBy?: string[]
  hasUserUpvoted?: boolean
}

const DISPLAY_NAME_STORAGE_KEY = 'ocrfree-display-names'

function getAuthToken(): string | null {
  return useAuthStore.getState().token
}

function readDisplayNames(): Record<string, string> {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const raw = window.localStorage.getItem(DISPLAY_NAME_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function cacheDisplayName(email: string, name?: string | null) {
  if (typeof window === 'undefined') {
    return
  }

  const normalizedEmail = email.trim().toLowerCase()
  const preferredName = String(name || '').trim()
  if (!preferredName) {
    return
  }

  const current = readDisplayNames()
  current[normalizedEmail] = preferredName
  window.localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, JSON.stringify(current))
}

function resolveDisplayName(email: string, preferredName?: string | null): string {
  const normalizedEmail = email.trim().toLowerCase()
  const explicitName = String(preferredName || '').trim()
  if (explicitName) {
    return explicitName
  }

  const cached = readDisplayNames()[normalizedEmail]
  if (cached) {
    return cached
  }

  return normalizedEmail.split('@')[0] || normalizedEmail
}

function toAuthenticatedUser(
  user: { id: string | number; email: string; name?: string | null },
  preferredName?: string | null,
): AuthenticatedUser {
  const email = String(user.email || '').trim().toLowerCase()
  const name = resolveDisplayName(email, preferredName || user.name)
  cacheDisplayName(email, name)

  return {
    id: String(user.id),
    email,
    name,
    role: 'user',
  }
}

async function readJson(response: Response) {
  try {
    return await response.json()
  } catch {
    return {}
  }
}

function normalizeApiError(data: Record<string, unknown>, fallback: string): string {
  const detail = String(data.detail || data.message || data.error || '').trim()
  if (!detail) {
    return fallback
  }

  const detailMap: Record<string, string> = {
    email_in_use: 'Ese correo ya está registrado',
    invalid_credentials: 'Credenciales inválidas',
    missing_token: 'Tu sesión no es válida',
    invalid_token: 'Tu sesión no es válida',
    expired_token: 'Tu sesión expiró. Inicia sesión nuevamente.',
    category_empty: 'La categoría no puede estar vacía',
    title_empty: 'El nombre no puede estar vacío',
    not_found: 'No se encontró el recurso solicitado',
    transaction_not_found: 'No se encontró el movimiento solicitado',
  }

  return detailMap[detail] || detail
}

async function authFetch(path: string, options: RequestInit = {}) {
  const token = getAuthToken()
  if (!token) {
    throw new Error('No hay token de autenticación')
  }

  const headers = new Headers(options.headers || {})
  if (!headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  })

  if (response.status === 401) {
    useAuthStore.getState().logout()
  }

  return response
}

export const authService = {
  register: async (userData: RegisterData) => {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: userData.email,
        password: userData.password,
      }),
    })

    const data = await readJson(response)
    if (!response.ok) {
      throw new Error(normalizeApiError(data, 'Error al registrar usuario'))
    }

    return {
      token: String(data.token),
      user: toAuthenticatedUser(data.user, userData.name),
    }
  },

  login: async (credentials: Credentials) => {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
    })

    const data = await readJson(response)
    if (!response.ok) {
      throw new Error(normalizeApiError(data, 'Error al iniciar sesión'))
    }

    return {
      token: String(data.token),
      user: toAuthenticatedUser(data.user),
    }
  },

  logout: async () => {
    const response = await authFetch('/auth/logout', {
      method: 'POST',
    })

    const data = await readJson(response)
    if (!response.ok) {
      throw new Error(normalizeApiError(data, 'Error al cerrar sesión'))
    }

    return { success: Boolean(data.ok ?? true) }
  },

  getProfile: async () => {
    const response = await authFetch('/auth/me')
    const data = await readJson(response)
    if (!response.ok) {
      throw new Error(normalizeApiError(data, 'Error al obtener el perfil'))
    }

    return {
      user: toAuthenticatedUser(data.user),
    }
  },
}

export const transactionService = {
  updateCategory: async (transactionId: string, category: string) => {
    const response = await authFetch(`/transactions/${encodeURIComponent(transactionId)}/category`, {
      method: 'PATCH',
      body: JSON.stringify({ category }),
    })

    const data = await readJson(response)
    if (!response.ok) {
      throw new Error(normalizeApiError(data, 'Error al actualizar la categoría'))
    }

    return {
      success: Boolean(data.ok ?? true),
      message: data.warning ? String(data.warning) : 'Categoría actualizada correctamente',
      updatedTransactions: Number(data.updated_transactions ?? 0),
      updatedFiles: Number(data.updated_files ?? 0),
      accountScope: data.account_scope ? String(data.account_scope) : undefined,
    }
  },

  deleteTransaction: async (transactionId: string) => {
    const response = await authFetch(`/transactions/${encodeURIComponent(transactionId)}`, {
      method: 'DELETE',
    })

    const data = await readJson(response)
    if (!response.ok) {
      throw new Error(normalizeApiError(data, 'Error al eliminar el movimiento'))
    }

    return {
      success: Boolean(data.ok ?? true),
      message: 'Movimiento eliminado correctamente',
    }
  },
}

export const financialService = {
  runOcr: async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)

    const response = await authFetch('/ocr', {
      method: 'POST',
      body: formData,
    })

    const data = (await readJson(response)) as OcrFreeResult & Record<string, unknown>
    if (!response.ok) {
      throw new Error(normalizeApiError(data, 'Error al procesar el archivo'))
    }

    return data
  },

  categorizeStructuredData: async (structuredData: unknown[]) => {
    const response = await authFetch('/categorize', {
      method: 'POST',
      body: JSON.stringify({ structured_data: structuredData }),
    })

    const data = (await readJson(response)) as OcrFreeResult & Record<string, unknown>
    if (!response.ok) {
      throw new Error(normalizeApiError(data, 'Error al categorizar movimientos'))
    }

    return data
  },

  saveAnalysis: async ({
    title,
    statementDate,
    ocrResult,
    categorizedResult,
    icon,
    color,
  }: {
    title?: string
    statementDate?: string | null
    ocrResult: OcrFreeResult
    categorizedResult: OcrFreeResult | null
    icon?: string
    color?: string
  }) => {
    const response = await authFetch('/files', {
      method: 'POST',
      body: JSON.stringify({
        title: title || guessTitleFromOcrResult(ocrResult),
        statement_date: statementDate || guessStatementDateToken(ocrResult),
        source: 'ocr_free_v1',
        icon: icon || 'BarChart',
        color: color || 'blue',
        ocr_result: ocrResult,
        categorized_result: categorizedResult,
      }),
    })

    const data = await readJson(response)
    if (!response.ok) {
      throw new Error(normalizeApiError(data, 'Error al guardar el análisis'))
    }

    return {
      success: true,
      data,
    }
  },

  getFinancialHistory: async () => {
    const response = await authFetch('/files')
    const data = await readJson(response)
    if (!response.ok) {
      throw new Error(normalizeApiError(data, 'Error al obtener el historial'))
    }

    const items = Array.isArray(data.items) ? data.items : []
    return {
      success: true,
      data: items.map(mapOcrFreeHistoryItem),
    }
  },

  getFinancialAnalysis: async (id: string) => {
    const response = await authFetch(`/files/${id}`)
    const data = await readJson(response)
    if (!response.ok) {
      throw new Error(normalizeApiError(data, 'Error al obtener el análisis'))
    }

    const payload = (data.payload || {}) as OcrFreeSavedPayload
    const adapted = buildAnalysisFromOcrFreePayload({
      analysisId: id,
      payload,
      title: data.item?.title,
    })

    return {
      success: true,
      data: adapted,
    }
  },

  updateFinancialAnalysis: async (id: string, updateData: AnalysisUpdateData) => {
    const response = await authFetch(`/files/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        title: updateData.name,
        icon: updateData.icon,
        color: updateData.color,
      }),
    })

    const data = await readJson(response)
    if (!response.ok) {
      throw new Error(normalizeApiError(data, 'Error al actualizar el análisis'))
    }

    return {
      success: true,
      data: mapOcrFreeHistoryItem(data.item || { id, title: updateData.name }),
    }
  },

  deleteFinancialAnalysis: async (id: string) => {
    const response = await authFetch(`/files/${id}`, {
      method: 'DELETE',
    })

    const data = await readJson(response)
    if (!response.ok) {
      throw new Error(normalizeApiError(data, 'Error al eliminar el análisis'))
    }

    return {
      success: Boolean(data.ok ?? true),
    }
  },

  updateAnalysisOrder: async (analysisOrder: string[]) => {
    const response = await authFetch('/files/reorder', {
      method: 'POST',
      body: JSON.stringify({
        file_ids: analysisOrder.map((item) => Number.parseInt(item, 10)).filter(Number.isFinite),
      }),
    })

    const data = await readJson(response)
    if (!response.ok) {
      throw new Error(normalizeApiError(data, 'Error al actualizar el orden'))
    }

    return {
      success: Boolean(data.ok ?? true),
    }
  },
}

export const feedbackService = {
  getFeedbacks: async () => ({ success: true, data: [] as FeedbackApiItem[] }),
  createFeedback: async (content: string) => {
    void content
    return {
      success: false,
      message: 'Feedback deshabilitado en esta versión',
      data: EMPTY_FEEDBACK_ITEM,
    }
  },
  updateFeedback: async (id: string, content: string) => {
    void id
    void content
    return {
      success: false,
      message: 'Feedback deshabilitado en esta versión',
      data: EMPTY_FEEDBACK_ITEM,
    }
  },
  toggleUpvote: async (id: string) => {
    void id
    return {
      success: false,
      message: 'Feedback deshabilitado en esta versión',
      data: {
        upvotes: 0,
        upvotedBy: [] as string[],
        hasUserUpvoted: false,
      },
    }
  },
  deleteFeedback: async (id: string) => {
    void id
    return {
      success: false,
      message: 'Feedback deshabilitado en esta versión',
    }
  },
}
