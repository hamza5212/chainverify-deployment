import { useEffect, useState } from 'react'
import { api } from '../api.js'
import BlockTable from '../components/BlockTable.jsx'
import { hasMetaMask, registerOnChain } from '../blockchain.js'
import { isPublisher, getCurrentUser } from '../auth.js'
import { formatISTDate } from '../utils/formatDate.js'

export default function NewsPage({ navigate, toast }) {
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [articles, setArticles] = useState([])
  const [categories, setCategories] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAddPanel, setShowAddPanel] = useState(false)

  const publisherMode = isPublisher()

  const load = async () => {
    setLoading(true); setError('')
    try {
      const data = await api.listNews({ q, category, limit: 300 })
      setArticles(data.articles || [])
      setCategories(data.categories || [])
      setTotal(data.total || 0)
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const submit = (e) => { e.preventDefault(); load() }

  return (
    <div>
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1>News</h1>
          <p>Browse and verify published articles</p>
        </div>
        {publisherMode && (
          <button className="btn btn-accent" onClick={() => setShowAddPanel(v => !v)}>
            {showAddPanel ? '− Close Form' : '+ Add Article'}
          </button>
        )}
      </div>

      {publisherMode && showAddPanel && (
        <AddArticleForm onAdded={() => { setShowAddPanel(false); load() }} onCancel={() => setShowAddPanel(false)} toast={toast} navigate={navigate} />
      )}

      <form className="search-bar" onSubmit={submit} style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <input className="form-input" placeholder="Search news…" value={q} onChange={e => setQ(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
        <select className="form-input" value={category} onChange={e => setCategory(e.target.value)} style={{ maxWidth: 220 }}>
          <option value="">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="btn btn-primary" type="submit">Search</button>
      </form>

      {error && <div className="result-banner fail"><div className="result-msg">{error}</div></div>}

      {loading ? (
        <div className="empty">Loading articles…</div>
      ) : articles.length === 0 ? (
        <div className="empty">No articles found</div>
      ) : (
        <>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '.05em' }}>
            Showing {articles.length} of {total} articles
          </div>
          
          <div className="news-grid">
            {articles.map(a => (
              <div key={a.article_id} className="news-card">
                <div className="news-meta">
                  {a.category && <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{a.category}</span>}
                  {a.registered ? <span className="pill pill-ok" style={{ border: '1px solid var(--success)', padding: '1px 6px', borderRadius: 2, fontSize: 9 }}>Block #{a.block_index}</span> : <span className="pill" style={{ border: '1px solid var(--rule)', padding: '1px 6px', borderRadius: 2, fontSize: 9 }}>Unregistered</span>}
                </div>
                
                <h3 className="news-title" onClick={() => navigate({ name: 'article', articleId: a.article_id })}>
                  {a.title || 'Untitled Article'}
                </h3>
                
                <div className="news-meta">
                  <span>By {a.source || 'Unknown'}</span>
                  {a.publication_date && <span>· {formatISTDate(a.publication_date)}</span>}
                </div>
                
                <p className="news-preview">{a.preview}</p>
                
                <div className="news-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => navigate({ name: 'article', articleId: a.article_id })}>
                    Read
                  </button>
                  {publisherMode && !a.registered && (
                    <button className="btn btn-primary btn-sm" onClick={() => navigate({ name: 'article', articleId: a.article_id, autoRegister: true })}>
                      Register
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function AddArticleForm({ onAdded, onCancel, toast, navigate }) {
  const metaMaskAvailable = hasMetaMask()
  const user = getCurrentUser()

  const [sources, setSources] = useState([])
  const [sourcesLoading, setSourcesLoading] = useState(true)
  const [form, setForm] = useState({ title: '', content: '', source: '', url: '', publication_date: '', category: '' })
  const [checking, setChecking] = useState(false)
  const [urlCheck, setUrlCheck] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [stage, setStage] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [hasFetched, setHasFetched] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.trustedSources().then(d => {
      if (cancelled) return
      const list = d.sources || []
      setSources(list)
      const own = list.find(s => s.name.toLowerCase() === (user?.publisher_source || '').toLowerCase())
      if (own) setForm(f => ({ ...f, source: own.name }))
    }).catch(e => { if (!cancelled) setError(e.message) }).finally(() => { if (!cancelled) setSourcesLoading(false) })
    return () => { cancelled = true }
  }, [user?.publisher_source])

  const updateUrl = (value) => {
    setForm(f => ({ ...f, url: value }))
    setUrlCheck(null)
    setHasFetched(false) 
  }

  const checkUrl = async () => {
    if (!form.url) return toast('Paste URL first.', false)
    setChecking(true); setUrlCheck(null); setError('')
    try {
      const res = await api.checkUrl(form.url, form.source, form.title)
      
      if (res.already_exists) {
        setUrlCheck(res)
        return toast('URL already exists.', false)
      }
      
      if (res.reachable && res.extracted && res.extracted.content) {
        const ex = res.extracted
        
        let cleanTitle = ex.title || ''
        const pubName = form.source
        if (pubName) {
          const regex = new RegExp(`\\s*[\\|\\-–—]\\s*${pubName}\\s*$`, 'i')
          cleanTitle = cleanTitle.replace(regex, '').trim()
        }

        setForm(f => ({ 
          ...f, 
          title: cleanTitle, 
          content: ex.content || '', 
          publication_date: ex.publication_date || '', 
          category: ex.category || '' 
        }))
        setHasFetched(true)
        toast('Data fetched successfully. Fields locked.', true)
      } else {
        const errorMsg = res.error || 'Failed to extract article body.'
        toast(errorMsg, false)
        setUrlCheck({ reachable: false, error: errorMsg })
      }
    } catch (e) { 
      toast(e.message, false); 
      setUrlCheck({ reachable: false, error: e.message }) 
    } finally { 
      setChecking(false) 
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!metaMaskAvailable) return toast('MetaMask required.', false)
    if (!hasFetched) return toast('You must fetch the URL data before registering.', false)
    
    setSubmitting(true); setError(''); setResult(null)
    let added = null
    try {
      setStage('Saving to DB'); added = await api.addArticle(form)
      setStage('Generating Hash'); const prep = await api.prepareRegister(added.article_id)
      setStage('MetaMask'); const tx = await registerOnChain(prep.article_id, prep.content_hash, prep.watermark_id)
      setStage('Confirming'); const confirmed = await api.confirmRegister({ article_id: prep.article_id, tx_hash: tx.txHash, onchain_block: tx.blockNumber })
      
      setResult({ ...confirmed, article_title: form.title })
      toast(`Registered in block #${tx.blockNumber}.`, true)
    } catch (err) {
      const msg = err?.message || 'Something went wrong.'
      setError(msg); toast(msg, false)
      if (added) setResult({ added_only: true, article_id: added.article_id })
    } finally { setStage(''); setSubmitting(false) }
  }

  const resetForm = () => {
    setForm({ title: '', content: '', source: user?.publisher_source || '', url: '', publication_date: '', category: '' })
    setUrlCheck(null); setResult(null); setError(''); setHasFetched(false)
  }

  if (result) {
    return (
      <div className="card" style={{ marginBottom: 22 }}>
        <div className="result-banner success" style={{ marginTop: 0 }}>
          <div className="result-msg">{result.added_only ? '✓ Article Saved (Not Registered)' : '✓ Article Registered On-Chain'}</div>
        </div>
        {!result.added_only && (
          <BlockTable block={{
            block_index: result.block_index, title: result.title, source: result.source,
            content_hash: result.content_hash, previous_hash: result.previous_hash,
            block_hash: result.block_hash, watermark_id: result.watermark_id,
            watermark_status: result.watermark_status, timestamp: result.registered_at
          }} />
        )}
        <div className="btn-row" style={{ marginTop: 14 }}>
          {!result.added_only && <button className="btn btn-primary" onClick={() => navigate({ name: 'verify', preselectedArticleId: result.article_id })}>Verify</button>}
          <button className="btn btn-ghost" onClick={() => navigate({ name: 'article', articleId: result.article_id })}>Open Article</button>
          <button className="btn btn-accent" onClick={resetForm}>Add Another</button>
          <button className="btn btn-ghost" onClick={onAdded}>Close</button>
        </div>
      </div>
    )
  }

  return (
    <div className="card" style={{ marginBottom: 22 }}>
      <div className="section-title">Add Article from URL</div>
      <form onSubmit={submit} style={{ marginTop: 16 }}>
        <div className="btn-row" style={{ alignItems: 'stretch' }}>
          <div style={{ flex: '1 1 220px' }}>
            <label className="form-label">Publisher</label>
            <div className="form-input" style={{ backgroundColor: 'var(--surface-2)', color: 'var(--ink-3)', display: 'flex', alignItems: 'center', cursor: 'not-allowed' }}>
              {form.source || 'Loading...'}
            </div>
          </div>
          <div style={{ flex: '1 1 320px' }}>
            <label className="form-label">Source URL</label>
            <input className="form-input" placeholder="https://..." value={form.url} onChange={e => updateUrl(e.target.value)} required disabled={hasFetched} />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-accent btn-sm" onClick={checkUrl} disabled={!form.url || checking || hasFetched}>
            {checking ? 'Fetching…' : 'Fetch Data'}
          </button>
        </div>

        {/* Single, clean warning box */}
        {urlCheck && !urlCheck.reachable && !urlCheck.already_exists && (
          <div style={{ 
            marginTop: 16, 
            padding: '12px 16px', 
            backgroundColor: '#FBF1DD', 
            borderLeft: '3px solid #8A5A00', 
            color: '#8A5A00', 
            fontSize: 13, 
            lineHeight: 1.5 
          }}>
            <strong>Extraction Failed:</strong> {urlCheck.error}
          </div>
        )}

        <div className="btn-row" style={{ alignItems: 'stretch', marginTop: 14 }}>
          <div style={{ flex: '1 1 200px' }}>
            <label className="form-label">Date</label>
            <input className="form-input" value={form.publication_date} readOnly placeholder="Pending fetch" style={{ backgroundColor: hasFetched ? 'var(--surface-2)' : 'var(--surface)', color: hasFetched ? 'var(--ink-3)' : 'var(--ink)' }} />
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <label className="form-label">Category</label>
            <input className="form-input" value={form.category} readOnly placeholder="Pending fetch" style={{ backgroundColor: hasFetched ? 'var(--surface-2)' : 'var(--surface)', color: hasFetched ? 'var(--ink-3)' : 'var(--ink)' }} />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <label className="form-label">Headline</label>
          <input className="form-input" value={form.title} readOnly placeholder="Pending fetch" style={{ backgroundColor: hasFetched ? 'var(--surface-2)' : 'var(--surface)', color: hasFetched ? 'var(--ink-3)' : 'var(--ink)' }} />
        </div>

        <div style={{ marginTop: 12 }}>
          <label className="form-label">Body</label>
          <textarea className="form-textarea" value={form.content} readOnly placeholder="Pending fetch" style={{ backgroundColor: hasFetched ? 'var(--surface-2)' : 'var(--surface)', color: hasFetched ? 'var(--ink-3)' : 'var(--ink)', minHeight: 120 }} />
        </div>

        {stage && <div style={{ marginTop: 12, fontSize: 12, color: 'var(--ink-3)' }}>Processing: {stage}…</div>}
        {error && <div className="result-banner fail" style={{ marginTop: 12 }}><div className="result-msg">{error}</div></div>}

        <div className="btn-row" style={{ marginTop: 14 }}>
          <button className="btn btn-primary" type="submit" disabled={submitting || sourcesLoading || !metaMaskAvailable || !hasFetched}>
            {submitting ? 'Processing…' : 'Register via MetaMask'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  )
}