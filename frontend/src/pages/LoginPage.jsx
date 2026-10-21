import { useState } from 'react'
import { api } from '../api.js'
import { setAuth } from '../auth.js'

export default function LoginPage({ navigate, toast }) {
  const [mode, setMode] = useState('login')
  const [role, setRole] = useState('user')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [publisherKey, setPublisherKey] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const validatePasswordLocally = (pwd) => {
    if (pwd.length < 8) return "Password must be at least 8 characters."
    if (!/[A-Z]/.test(pwd)) return "Password must contain an uppercase letter."
    if (!/[a-z]/.test(pwd)) return "Password must contain a lowercase letter."
    if (!/[0-9]/.test(pwd)) return "Password must contain a number."
    if (!/[^A-Za-z0-9]/.test(pwd)) return "Password must contain a special character."
    
    // Check repeating characters
    if (/(.)\1\1/.test(pwd)) return "Password cannot contain 3 repeating characters."
    
    // Check sequences
    const lower = pwd.toLowerCase()
    for (let i = 0; i < lower.length - 2; i++) {
      const c1 = lower.charCodeAt(i)
      const c2 = lower.charCodeAt(i+1)
      const c3 = lower.charCodeAt(i+2)
      if ((c2 === c1 + 1 && c3 === c2 + 1) || (c2 === c1 - 1 && c3 === c2 - 1)) {
        return "Password cannot contain sequential characters (e.g., 'abc', '123', 'cba', '321')."
      }
    }
    return null
  }

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true); setError('')

    if (mode === 'register') {
      const pwdErr = validatePasswordLocally(password)
      if (pwdErr) {
        setError(pwdErr)
        setLoading(false)
        return
      }
    }

    try {
      let res
      if (mode === 'login') {
        res = await api.login(email, password)
      } else {
        res = await api.register({
          email,
          password,
          role,
          publisher_code: role === 'publisher' ? publisherKey : undefined,
        })
      }
      setAuth(res.token, res.user)
      toast(`Welcome, ${res.user.email}.`, true)
      navigate({ name: 'home' })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const switchMode = (next) => { setMode(next); setError('') }

  return (
    <div className="login-page">
      <header className="login-header">
        <h1 className="login-title">
          {mode === 'login' ? 'Sign In' : 'Create Account'}
        </h1>
      </header>

      <div className="login-card">
        <form onSubmit={submit} className="login-form">
          {mode === 'register' && (
            <div className="form-group">
              <label className="form-label">Account type</label>
              <div className="segmented" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={role === 'user'}
                  className={`segmented-item ${role === 'user' ? 'active' : ''}`}
                  onClick={() => setRole('user')}
                >
                  Reader
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={role === 'publisher'}
                  className={`segmented-item ${role === 'publisher' ? 'active' : ''}`}
                  onClick={() => setRole('publisher')}
                >
                  Publisher
                </button>
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="login-email">Email</label>
            <input
              id="login-email"
              className="form-input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder={role === 'user' ? 'name@gmail.com' : 'name@yourdomain.com'}
            />
            {mode === 'register' && role === 'user' && (
              <div className="form-hint">Must be an @gmail.com address</div>
            )}
            {mode === 'register' && role === 'publisher' && (
              <div className="form-hint">Must match the agency's domain</div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-password">Password</label>
            <div className="password-wrap">
              <input
                id="login-password"
                className="form-input"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {mode === 'register' && (
              <div className="form-hint">
                Min 8 chars · upper · lower · number · special · No sequences
              </div>
            )}
          </div>

          {mode === 'register' && role === 'publisher' && (
            <div className="form-group">
              <label className="form-label" htmlFor="login-publisher">Secret Publisher Key</label>
              <input
                id="login-publisher"
                className="form-input"
                value={publisherKey}
                onChange={e => setPublisherKey(e.target.value.toUpperCase())}
                placeholder="e.g. ANI-X7F9P2"
                required
              />
              <div className="form-hint">
                Requires an official key issued to your agency by ChainVerify
              </div>
            </div>
          )}

          {error && <div className="login-error" role="alert">{error}</div>}

          <button className="btn btn-accent login-submit" type="submit" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className="login-foot">
          {mode === 'login' ? (
            <span>
              New to ChainVerify?{' '}
              <button type="button" className="link-btn" onClick={() => switchMode('register')}>
                Create an account
              </button>
            </span>
          ) : (
            <span>
              Already have an account?{' '}
              <button type="button" className="link-btn" onClick={() => switchMode('login')}>
                Sign in
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}