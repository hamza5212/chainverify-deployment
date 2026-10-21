import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { getOnChainEvents } from '../blockchain.js'
import BlockTable from '../components/BlockTable.jsx'
import { formatIST } from '../utils/formatDate.js'
import { isPublisher } from '../auth.js'

const str = (v) => (v == null ? '' : typeof v === 'object' && '_isIndexed' in v ? (v.hash || '(indexed)') : String(v))
const when = (unixSeconds) => (Number(unixSeconds) > 0 ? formatIST(new Date(Number(unixSeconds) * 1000).toISOString()) : '—')

function Row({ id, open, setOpen, num, title, time, children }) {
  return (
    <div className="chain-entry">
      <div className="block-row" onClick={() => setOpen(o => (o === id ? null : id))}>
        <div className="block-row-header">
          <span className="block-num">{num}</span>
          <span className="block-row-title">{title}</span>
          <span className="muted" style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{time}</span>
          <span className="muted" style={{ fontSize: 10 }}>{open === id ? '▲' : '▼'}</span>
        </div>
        {open === id && <div className="block-row-body" onClick={e => e.stopPropagation()}>{children}</div>}
      </div>
    </div>
  )
}

export default function LedgerPage({ toast }) {
  const publisherMode = isPublisher()
  
  const [tab, setTab] = useState(publisherMode ? 'contract' : 'app')
  const [events, setEvents] = useState([])
  const [chain, setChain] = useState([])
  const [titleMap, setTitleMap] = useState({})
  const [validity, setValidity] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState({})
  const [open, setOpen] = useState(null)

  const load = async () => {
    setLoading(true); setErrors({})
    
    const [onChain, app, valid, news] = await Promise.allSettled([
      getOnChainEvents(), 
      api.chain(), 
      api.validateChain(),
      api.listNews({ limit: 1000 }) 
    ])

    const map = {}
    
    if (news.status === 'fulfilled') {
      (news.value.articles || []).forEach(a => { map[a.article_id] = a.title })
    }

    if (app.status === 'fulfilled') {
      const fetchedChain = app.value.chain
      setChain([...fetchedChain].reverse())
      fetchedChain.forEach(b => { map[b.article_id] = b.title })
    } else {
      setErrors(x => ({ ...x, app: app.reason?.message }))
    }
    
    setTitleMap(map)

    if (onChain.status === 'fulfilled') {
      setEvents(onChain.value.map((e, i) => ({ ...e, key: e.txHash || `ev-${i}` })).sort((a, b) => b.blockNumber - a.blockNumber))
    } else {
      setErrors(x => ({ ...x, contract: onChain.reason?.message || 'Could not connect to the Hardhat node.' }))
    }
    
    if (valid.status === 'fulfilled') setValidity(valid.value)
    setLoading(false)
  }
  
  useEffect(() => { load() }, [])

  return (
    <div>
      <div className="page-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1>Ledger</h1>
          <p>Explore the verification chain and live blockchain transactions</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
          {loading ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      <div className="btn-row" style={{ marginBottom: 20 }}>
        {publisherMode && (
          <button className={`btn btn-sm ${tab === 'contract' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('contract')}>
            Smart-contract events ({events.length})
          </button>
        )}
        <button className={`btn btn-sm ${tab === 'app' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('app')}>
          Application chain ({chain.length})
        </button>
      </div>

      {loading ? (
        <div className="empty">Querying ledgers…</div>
      ) : tab === 'contract' ? (
        errors.contract ? (
          <div className="result-banner fail">
            <div className="result-msg">{errors.contract}</div>
            <p style={{ marginTop: 6, fontSize: 13 }}>Start it with <code>npx hardhat node</code> and redeploy the contract if you restarted it.</p>
          </div>
        ) : events.length === 0 ? (
          <div className="empty">No transactions found. Register an article via MetaMask to create the first one.</div>
        ) : (
          <div className="chain-list">
            {events.map((ev, i) => {
              const articleIdStr = str(ev.articleId)
              
              // If it's not in the DB, show a clear label instead of just the ID
              const displayTitle = titleMap[articleIdStr] 
                ? titleMap[articleIdStr] 
                : `(Deleted Record - ${articleIdStr})`
              
              return (
                <div key={ev.key}>
                  <Row id={ev.key} open={open} setOpen={setOpen} num={`TX BLOCK #${ev.blockNumber}`} title={displayTitle} time={when(ev.timestamp)}>
                    <table className="block-table">
                      <tbody>
                        <tr><td className="td-key">Article ID</td><td className="td-val accent">{articleIdStr}</td></tr>
                        <tr><td className="td-key">SHA-256 Hash</td><td className="td-val"><code>{str(ev.contentHash)}</code></td></tr>
                        <tr><td className="td-key">Watermark</td><td className="td-val"><span className="wm-chip">⚓ {str(ev.watermarkId)}</span></td></tr>
                        <tr><td className="td-key">Registered by</td><td className="td-val" style={{ fontFamily: 'var(--sans)' }}>{str(ev.registeredBy)}</td></tr>
                        <tr><td className="td-key">Transaction</td><td className="td-val"><code>{ev.txHash}</code></td></tr>
                      </tbody>
                    </table>
                  </Row>
                  {i < events.length - 1 && <div className="chain-line" />}
                </div>
              )
            })}
          </div>
        )
      ) : (
        <>
          {validity && (
            <div className={`result-banner ${validity.valid ? 'success' : 'fail'}`} style={{ marginTop: 0, marginBottom: 24 }}>
              <div className="result-msg">{validity.valid ? '✓ Chain valid' : '✕ Chain integrity problem'}</div>
              <p style={{ marginTop: 6, fontSize: 13 }}>
                {validity.blocks_checked} blocks checked: hash links, block hashes, and agreement with the registry.
              </p>
              {validity.issues.map((it, i) => (
                <p key={i} style={{ marginTop: 6, fontSize: 13 }}>
                  Block #{it.block_index}: {it.problem}
                </p>
              ))}
            </div>
          )}
          
          {errors.app ? (
            <div className="result-banner fail">
              <div className="result-msg">{errors.app}</div>
            </div>
          ) : (
            <div className="chain-list">
              {chain.map((b, i) => (
                <div key={b.block_index}>
                  <Row id={`b${b.block_index}`} open={open} setOpen={setOpen} num={`BLOCK #${b.block_index}`} title={b.title} time={formatIST(b.timestamp)}>
                    <BlockTable block={b} />
                  </Row>
                  {i < chain.length - 1 && <div className="chain-line" />}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}