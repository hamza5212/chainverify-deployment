import { useEffect, useState } from 'react'
import { api } from '../api.js'
import BlockTable from '../components/BlockTable.jsx'
import { hasMetaMask, registerOnChain } from '../blockchain.js'
import { isPublisher, getCurrentUser } from '../auth.js'
import { formatISTDate } from '../utils/formatDate.js'

export default function ArticlePage({ articleId, navigate, toast, autoRegister }) {
  const [article, setArticle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [registering, setRegistering] = useState(false)
  const [registration, setRegistration] = useState(null)
  const [regError, setRegError] = useState('')
  const [autoDone, setAutoDone] = useState(false)
  
  const [watermark, setWatermark] = useState(null)
  const [showWatermark, setShowWatermark] = useState(false)

  const metaMaskAvailable = hasMetaMask()
  const publisherMode = isPublisher()

  const load = () => {
    setLoading(true); setError('')
    api.getNews(articleId).then(setArticle).catch(e => setError(e.message)).finally(() => setLoading(false))
  }
  useEffect(load, [articleId])

  const doRegister = async () => {
    if (registering) return
    if (!publisherMode) return toast('Only publishers can register articles.', false)
    if (!metaMaskAvailable) return setRegError('MetaMask is required.')

    const user = getCurrentUser()
    if ((user?.publisher_source || '').toLowerCase() !== (article?.source || '').toLowerCase()) {
      setRegError('You can only register articles published by your own organisation.')
      return
    }

    setRegistering(true); setRegError(''); setRegistration(null)
    try {
      const prep = await api.prepareRegister(articleId)
      if (prep.already_registered) {
        setRegistration({ ...prep, already_registered: true })
        toast('Article is already registered.', true)
        setRegistering(false)
        return
      }

      let tx
      try {
        tx = await registerOnChain(prep.article_id, prep.content_hash, prep.watermark_id)
        if (tx.txHash !== 'synced-from-chain') toast('Confirm in MetaMask…', true)
      } catch (chainErr) {
        setRegError(chainErr?.message || 'Transaction rejected.')
        setRegistering(false)
        return
      }

      const confirmed = await api.confirmRegister({ article_id: prep.article_id, tx_hash: tx.txHash, onchain_block: tx.blockNumber })
      setRegistration(confirmed)
      toast(`Registered in block #${confirmed.block_index}.`, true)
      setArticle(a => a ? { ...a, registered: true, block_index: confirmed.block_index } : a)
    } catch (e) {
      setRegError(e.message); toast(e.message, false)
    } finally {
      setRegistering(false)
    }
  }

  useEffect(() => {
    if (autoRegister && article && !article.registered && !autoDone && publisherMode) {
      setAutoDone(true); doRegister()
    }
  }, [autoRegister, article, autoDone, publisherMode])

  if (loading) return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate({ name: 'news' })} style={{ marginBottom: 24, opacity: 0.5 }}>← Back to Archive</button>
      <div className="article-title" style={{ background: 'var(--surface-2)', width: '80%', height: 40, marginBottom: 16 }} />
      <div className="article-body" style={{ background: 'var(--surface-2)', width: '100%', height: 200 }} />
    </div>
  )
  if (error) return <div className="result-banner fail"><div className="result-msg">{error}</div></div>
  if (!article) return null

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate({ name: 'news' })} style={{ marginBottom: 24 }}>← Back to Archive</button>

      <article>
        <h1 className="article-title">{article.title}</h1>
        <div className="article-byline">
          <span>By {article.source}</span>
          {article.publication_date && <span>· {formatISTDate(article.publication_date)}</span>}
          {article.registered && <span style={{ color: 'var(--success)', fontWeight: 700 }}>· Anchored on Block #{article.block_index}</span>}
        </div>
        <div className="article-body">{article.content}</div>
      </article>

      <div className="card" style={{ marginTop: 40, background: 'var(--surface-2)' }}>
        <div className="section-title">Cryptographic Audit</div>
        <table className="block-table">
          <tbody>
            <tr>
              <td className="td-key">SHA-256 Hash</td>
              <td className="td-val">{article.content_hash ? <code>{article.content_hash}</code> : 'Not registered'}</td>
            </tr>
            <tr>
              <td className="td-key">Watermark</td>
              <td className="td-val">
                {article.registered ? (
                  <button className="btn btn-ghost btn-sm" onClick={async () => {
                    if (showWatermark) return setShowWatermark(false)
                    try { setWatermark(await api.watermark(articleId)); setShowWatermark(true) } catch (e) { toast(e.message, false) }
                  }}>
                    {showWatermark ? 'Hide Watermark Data' : 'Reveal Hidden Watermark'}
                  </button>
                ) : 'Not registered'}
              </td>
            </tr>
          </tbody>
        </table>
        
        {showWatermark && watermark && (
          <div style={{ marginTop: 16, background: 'var(--surface)', padding: 16, border: '1px solid var(--rule)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dotted var(--rule)', paddingBottom: 8 }}>
                <span style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--ink-3)' }}>Decoded Payload</span>
                <code style={{ color: 'var(--accent)' }}>{watermark.decoded_id || '—'}</code>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dotted var(--rule)', paddingBottom: 8 }}>
                <span style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--ink-3)' }}>Stored Watermark ID</span>
                <code>{watermark.watermark_id}</code>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--ink-3)' }}>Total Zero-Width Characters</span>
                <strong style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{watermark.total_zw_chars}</strong>
              </div>
            </div>
          </div>
        )}
      </div>

      {publisherMode && (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="section-title">Blockchain Registration</div>
          
          {!registration && (
            <div style={{ marginTop: 16 }}>
              <button className="btn btn-primary" disabled={registering || article.registered} onClick={doRegister}>
                {registering ? 'Processing…' : article.registered ? 'Already Registered' : 'Register via MetaMask'}
              </button>
            </div>
          )}

          {regError && (
            <div style={{ 
              marginTop: 16, 
              padding: '12px 16px', 
              backgroundColor: '#FBF1DD', 
              borderLeft: '3px solid #8A5A00', 
              color: '#8A5A00', 
              fontSize: 13, 
              lineHeight: 1.5 
            }}>
              <strong>Warning:</strong> {regError}
            </div>
          )}
          
          {registration && (
            <>
              <div className="result-banner success" style={{ marginTop: 12 }}>
                <div className="result-msg">✓ Anchored to Blockchain</div>
                {registration.tx_hash && <p style={{ marginTop: 6, fontSize: 12, color: 'var(--ink-3)' }}>Tx: {registration.tx_hash}</p>}
              </div>
              <BlockTable block={registration} />
            </>
          )}
        </div>
      )}
    </div>
  )
}