// frontend/src/auth.js
// Session helpers for ChainVerify.

const TOKEN_KEY = 'chainverify_token'
const USER_KEY  = 'chainverify_user'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function getCurrentUser() {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export function setAuth(token, user) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  window.dispatchEvent(new Event('chainverify-auth-change'))
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  window.dispatchEvent(new Event('chainverify-auth-change'))
}

export function isLoggedIn() {
  return Boolean(getToken())
}

export function isPublisher() {
  const u = getCurrentUser()
  return Boolean(u && u.role === 'publisher')
}

export function isUser() {
  const u = getCurrentUser()
  return Boolean(u && u.role === 'user')
}

export function getUserRole() {
  const u = getCurrentUser()
  return u ? u.role : null
}