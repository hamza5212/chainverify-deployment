import { useState, useEffect } from 'react'
import { formatISTTime } from '../utils/formatDate.js'
import { getCurrentUser, clearAuth } from '../auth.js'
import { hasMetaMask } from '../blockchain.js'

const ITEMS = [
  { key: 'home',   label: 'Home' },
  { key: 'news',   label: 'News' },
  { key: 'verify', label: 'Verify' },
  { key: 'ledger', label: 'Ledger' },
]

function formatMastheadDate() {
  const d = new Date()
  return d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' })
}

export default function NavBar({ route, navigate, minimal = false }) {
  const active = route.name === 'article' ? 'news' : route.name
  const [now, setNow] = useState('')
  const [user, setUser] = useState(getCurrentUser())
  const [wallet, setWallet] = useState(null)

  useEffect(() => {
    const update = () => setNow(formatISTTime(new Date().toISOString()) + ' IST')
    update(); const id = setInterval(update, 30000); return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const onChange = () => setUser(getCurrentUser())
    window.addEventListener('chainverify-auth-change', onChange)
    return () => window.removeEventListener('chainverify-auth-change', onChange)
  }, [])

  useEffect(() => {
    if (!hasMetaMask()) return
    const checkWallet = async () => {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' })
        setWallet(accounts.length > 0 ? accounts[0] : null)
      } catch (e) {}
    }
    checkWallet()
    window.ethereum.on('accountsChanged', checkWallet)
    return () => window.ethereum.removeListener('accountsChanged', checkWallet)
  }, [])

  const handleLogout = () => {
    clearAuth()
    navigate({ name: 'login' })
  }

  const shortWallet = wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : 'Not connected'

  return (
    <header className="topbar">
      <div className={`topbar-inner ${minimal ? 'minimal' : ''}`}>
        <div className="topbar-meta">
          <div style={{ display: 'flex', gap: 16 }}>
            <span>{formatMastheadDate()}</span>
            <span>•</span>
            <span>{now}</span>
          </div>
          {!minimal && (
            <div style={{ display: 'flex', gap: 16 }}>
              <span>{wallet ? `🦊 ${shortWallet}` : '🦊 Disconnected'}</span>
              <span>● Hardhat Local</span>
            </div>
          )}
        </div>

        <div className="topbar-brand-row">
          <div className="topbar-brand" onClick={() => !minimal && navigate({ name: 'home' })}>
            <div className="brand-mark">CV</div>
            <div className="brand-name">ChainVerify</div>
          </div>

          {!minimal && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {user ? (
                <>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{user.email}</div>
                    <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)' }}>
                      {user.role === 'publisher' ? `Publisher · ${user.publisher_source?.toUpperCase() || 'Verified'}` : 'Reader'}
                    </div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={handleLogout}>Sign out</button>
                </>
              ) : (
                <button className="btn btn-primary btn-sm" onClick={() => navigate({ name: 'login' })}>Sign In</button>
              )}
            </div>
          )}
        </div>

        {!minimal && (
          <nav className="topbar-nav">
            {ITEMS.map(it => (
              <button key={it.key} className={`nav-btn ${active === it.key ? 'active' : ''}`} onClick={() => navigate({ name: it.key })}>
                {it.label}
              </button>
            ))}
          </nav>
        )}
      </div>
    </header>
  )
}