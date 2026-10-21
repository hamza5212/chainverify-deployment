import { useEffect, useState, useRef } from 'react'
import { api } from '../api.js'
import BlockTable from '../components/BlockTable.jsx'
import { connectWallet, recordVerificationOnChain } from '../blockchain.js'

function SearchableSelect({ articles, value, onChange, disabled, placeholder }) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapperRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setIsOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const filtered = query
    ? articles.filter(a => a.title.toLowerCase().includes(query.toLowerCase()) || (a.source && a.source.toLowerCase().includes(query.toLowerCase())))
    : articles

  const selectedArticle = articles.find(a => a.article_id === value)

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      <div className="form-input" style={{ cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={() => !disabled && setIsOpen(!isOpen)}>
        <span style={{ color: selectedArticle ? 'var(--ink)' : 'var(--ink-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {selectedArticle ? `${selectedArticle.registered ? '✓ ' : ''}${selectedArticle.title} (${selectedArticle.source})` : placeholder || '— Select an article —'}
        </span>
        <span style={{ fontSize: 10, color: 'var(--ink-3)' }}>▼</span>
      </div>

      {isOpen && !disabled && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'var(--surface)', border: '1px solid var(--rule-strong)', maxHeight: 300, overflowY: 'auto', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ padding: 8, borderBottom: '1px solid var(--rule)', position: 'sticky', top: 0, background: 'var(--surface)' }}>
            <input autoFocus type="text" className="form-input" style={{ padding: '8px 12px', fontSize: 13 }} placeholder="Search..." value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          {filtered.length === 0 ? (
            <div style={{ padding: 16, color: 'var(--ink-3)', textAlign: 'center' }}>No articles found</div>
          ) : (
            filtered.slice(0, 50).map(a => (
              <div key={a.article_id} style={{ padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid var(--rule)', background: a.article_id === value ? 'var(--surface-2)' : 'transparent', fontSize: 13 }}
                onMouseEnter={(e) => e.target.style.background = 'var(--surface-2)'}
                onMouseLeave={(e) => e.target.style.background = a.article_id === value ? 'var(--surface-2)' : 'transparent'}
                onClick={() => { onChange(a.article_id); setIsOpen(false); setQuery('') }}>
                {a.registered ? '✓ ' : ''}{a.title} ({a.source})
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function VerifyPage({ preselectedArticleId, navigate, toast }) {
  const [mode, setMode] = useState('article')
  const [articles, setArticles] = useState([])
  const [selectedId, setSelectedId] = useState(preselectedArticleId || '')
  const [content, setContent] = useState('')
  const [loadingList, setLoadingList] = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [result, setResult] = useState(null)
  const [verifyError, setVerifyError] = useState('')

  useEffect(() => {
    setLoadingList(true)
    api.listNews({ limit: 500 }).then(d => {
      const items = d.articles || []
      setArticles(items)
      if (!preselectedArticleId && items.length > 0) setSelectedId(items[0].article_id)
    }).catch(e => toast(e.message, false)).finally(() => setLoadingList(false))
  }, [preselectedArticleId])

  const loadSelectedIntoContent = async () => {
    if (!selectedId) return toast('Select an article first.', false)
    try {
      const full = await api.getNews(selectedId)
      setContent(full.content || '')
      toast('Article text loaded.', true)
    } catch (e) { toast(e.message, false) }
  }

  const runVerify = async () => {
    setVerifying(true); setVerifyError(''); setResult(null)
    try {
      await connectWallet()
      toast('Confirm verification in MetaMask…', true)
      const targetId = mode === 'article' ? selectedId : 'text-verification'
      
      try {
        await recordVerificationOnChain(targetId)
      } catch (txErr) {
        throw new Error(txErr.message)
      }

      const payload = mode === 'article' ? { article_id: selectedId } : { content }
      const data = await api.verify(payload)
      setResult(data)
      toast(data.match ? 'SHA-256 Match Found' : 'No Match Found', data.match)
    } catch (e) {
      setVerifyError(e.message); toast(e.message, false)
    } finally { setVerifying(false) }
  }

  const canVerify = mode === 'article' ? Boolean(selectedId) : content.trim().length > 0

  return (
    <div>
      <div className="page-head">
        <h1>Verify</h1>
        <p>Confirm the integrity of an article against the registered ledger</p>
      </div>

      <div className="card">
        <div className="btn-row" style={{ marginBottom: 24 }}>
          <button className={`btn btn-sm ${mode === 'article' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('article')}>Select Article</button>
          <button className={`btn btn-sm ${mode === 'content' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('content')}>Paste Text</button>
        </div>

        {mode === 'article' && (
          <div style={{ marginBottom: 24 }}>
            <label className="form-label">Choose an article from the database</label>
            <SearchableSelect articles={articles} value={selectedId} onChange={setSelectedId} disabled={loadingList} />
          </div>
        )}

        {mode === 'content' && (
          <div style={{ marginBottom: 24 }}>
            <label className="form-label">Load an existing article or paste manually</label>
            <SearchableSelect articles={articles} value={selectedId} onChange={setSelectedId} disabled={false} placeholder="— Search for an article to load —" />
            <div style={{ marginTop: 12, marginBottom: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={loadSelectedIntoContent} disabled={!selectedId}>Load Selected Article Text</button>
            </div>
            <label className="form-label">Article content</label>
            <textarea className="form-textarea" value={content} onChange={e => setContent(e.target.value)} placeholder="Paste the full text of the article here to verify..." />
          </div>
        )}

        <div style={{ marginBottom: 24, padding: 12, background: 'var(--surface-2)', borderLeft: '3px solid var(--accent)', fontSize: 12.5 }}>
          <strong>Note:</strong> Verifying requires a small MetaMask gas fee to log the attempt on-chain.
        </div>

        <button className="btn btn-primary" disabled={!canVerify || verifying} onClick={runVerify}>
          {verifying ? 'Processing…' : 'Connect Wallet & Verify'}
        </button>
      </div>

      {/* Amber Warning Box for MetaMask Errors */}
      {verifyError && (
        <div style={{ 
          marginTop: 24, 
          padding: '12px 16px', 
          backgroundColor: '#FBF1DD', 
          borderLeft: '3px solid #8A5A00', 
          color: '#8A5A00', 
          fontSize: 13, 
          lineHeight: 1.5 
        }}>
          <strong>Verification Warning:</strong> {verifyError}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 24 }}>
          {result.match ? (
            <div className="result-banner success">
              <div className="result-msg">✓ SHA-256 Match Found</div>
              <p style={{ marginTop: 6, marginBottom: 16, fontSize: 13 }}>The submitted text perfectly matches a registered article on the blockchain.</p>
              <BlockTable block={{
                block_index: result.block_index, title: result.title, source: result.source,
                content_hash: result.registered_hash, previous_hash: result.previous_hash,
                block_hash: result.block_hash, watermark_id: result.watermark_id,
                watermark_status: result.watermark_detected ? 'detected' : 'not detected',
                timestamp: result.timestamp,
              }} />
            </div>
          ) : (
            <div className="result-banner fail">
              <div className="result-msg">✕ No Match Found</div>
              <p style={{ marginTop: 6, marginBottom: 16, fontSize: 13 }}>{result.reason}</p>
              <table className="block-table"><tbody>
                <tr><td className="td-key">Submitted SHA-256</td><td className="td-val">{result.submitted_hash}</td></tr>
                <tr><td className="td-key">Registered SHA-256</td><td className="td-val">{result.registered_hash || '— (Not registered)'}</td></tr>
              </tbody></table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}