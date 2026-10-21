
import { getToken } from './auth.js'

// Local development: uses Vite's proxy.
// Production: set VITE_API_BASE_URL to your deployed Flask backend URL.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

async function request(path, options = {}) {
  const token = getToken()

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  })

  let data = {}

  try {
    data = await res.json()
  } catch {
    // Response may be empty or not JSON.
  }

  if (!res.ok) {
    const err = new Error(
      data.error || `Request failed (${res.status})`
    )

    err.code = data.code || 'UNKNOWN'
    err.status = res.status
    err.details = data

    throw err
  }

  return data
}

export const api = {
  health: () => request('/health'),

  stats: () => request('/stats'),

  analytics: () => request('/analytics'),

  trustedSources: () => request('/trusted-sources'),

  register: (payload) =>
    request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: (email, password) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  logout: () =>
    request('/auth/logout', {
      method: 'POST',
    }),

  me: () => request('/auth/me'),

  listNews: (params = {}) => {
    const qs = new URLSearchParams()

    if (params.q) qs.set('q', params.q)
    if (params.category) qs.set('category', params.category)
    if (params.limit) qs.set('limit', params.limit)
    if (params.sort) qs.set('sort', params.sort)

    const query = qs.toString()

    return request('/news' + (query ? `?${query}` : ''))
  },

  getNews: (id) =>
    request('/news/' + encodeURIComponent(id)),

  checkUrl: (url, source = '', title = '') =>
    request('/articles/check-url', {
      method: 'POST',
      body: JSON.stringify({ url, source, title }),
    }),

  addArticle: (payload) =>
    request('/articles/add', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  prepareRegister: (article_id) =>
    request('/register/prepare', {
      method: 'POST',
      body: JSON.stringify({ article_id }),
    }),

  confirmRegister: (payload) =>
    request('/register/confirm', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  verify: (payload) =>
    request('/verify', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  chain: () => request('/chain'),

  validateChain: () => request('/chain/validate'),

  watermark: (article_id) =>
    request('/news/' + encodeURIComponent(article_id) + '/watermark'),
}
