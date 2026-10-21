import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { formatISTDate } from '../utils/formatDate.js'

function BarChart({ data, labelKey, valueKey }) {
  if (!data.length) {
    return (
      <div className="muted small" style={{ padding: '12px 0' }}>
        No data available
      </div>
    )
  }

  const peak = Math.max(...data.map(d => d[valueKey]), 1)

  return (
    <div className="bar-chart">
      {data.map((d, i) => (
        <div className="bar-row" key={i}>
          <span className="bar-label" title={d[labelKey]}>
            {d[labelKey]}
          </span>

          <div className="bar-track">
            <div
              className="bar-fill"
              style={{ width: `${(d[valueKey] / peak) * 100}%` }}
            />
          </div>

          <span className="bar-count">{d[valueKey]}</span>
        </div>
      ))}
    </div>
  )
}

function TimelineChart({ data }) {
  const BUCKETS = 7
  const buckets = []
  const now = new Date()
  
  // Create 7-day buckets ending today
  for (let i = BUCKETS - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const dateKey = d.toISOString().slice(0, 10)
    
    let count = 0
    data.forEach(x => {
      if (x.hour.startsWith(dateKey)) {
        count += x.count
      }
    })
    
    buckets.push({ 
      count, 
      date: d,
      label: d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' })
    })
  }

  // Set peak to a minimum of 4 so single bars don't stretch the whole box
  const peak = Math.max(...buckets.map(b => b.count), 4) 
  const hasActivity = buckets.some(b => b.count > 0)

  // Generate Y-axis ticks (e.g., 1, 2, 3, 4)
  const yTicks = []
  for (let i = 1; i <= peak; i++) {
    yTicks.push(i)
  }

  return (
    <div style={{ paddingTop: 12, display: 'flex', flexDirection: 'column', flex: 1 }}>
      
      {/* Chart Area */}
      <div style={{ 
        position: 'relative', 
        display: 'flex', 
        flex: 1, 
        marginTop: 'auto',
        minHeight: 180,
        paddingLeft: 24,
      }}>
        
        {/* Y-Axis Labels */}
        <div style={{ 
          position: 'absolute', 
          left: 0, 
          top: 0, 
          bottom: 0, 
          width: 24, 
          fontFamily: 'var(--mono)',
        }}>
          <span style={{ position: 'absolute', bottom: 0, right: 6, fontSize: 10, color: 'var(--ink-3)' }}>0</span>
          {yTicks.map((val, i) => (
            <span key={i} style={{ 
              position: 'absolute',
              bottom: `${(val / peak) * 100}%`,
              right: 6,
              fontSize: 10, 
              color: 'var(--ink-3)', 
              transform: 'translateY(50%)'
            }}>
              {val}
            </span>
          ))}
        </div>

        {/* Bars and Grid Lines */}
        <div style={{ 
          position: 'relative', 
          flex: 1, 
          display: 'flex', 
          alignItems: 'flex-end', 
          gap: 6, 
          borderBottom: '1px solid var(--rule-strong)'
        }}>
          
          {/* Horizontal Grid Lines */}
          {yTicks.map((val, i) => (
            <div key={i} style={{ 
              position: 'absolute', 
              left: 0, 
              right: 0, 
              bottom: `${(val / peak) * 100}%`, 
              borderTop: '1px dashed var(--rule)', 
              zIndex: 0 
            }} />
          ))}

          {/* Bars */}
          {buckets.map((b, i) => {
            const heightPct = (b.count / peak) * 100
            return (
              <div 
                key={i} 
                style={{ 
                  flex: 1, 
                  height: '100%', 
                  display: 'flex', 
                  alignItems: 'flex-end', 
                  justifyContent: 'center',
                  zIndex: 1 
                }} 
                title={`${b.label} — ${b.count} block(s)`}
              >
                {/* Background track for empty days */}
                {b.count === 0 && (
                  <div style={{
                    width: '100%',
                    height: '100%',
                    background: 'var(--surface-2)',
                    borderRadius: '2px 2px 0 0',
                    opacity: 0.6
                  }} />
                )}
                
                {/* The actual bar */}
                {b.count > 0 && (
                  <div style={{ 
                    height: `${Math.max(heightPct, 4)}%`, 
                    width: '100%', 
                    background: 'var(--accent)', 
                    borderRadius: '2px 2px 0 0',
                    transition: 'height 0.4s ease',
                    position: 'relative'
                  }}>
                    <span style={{ 
                      position: 'absolute', 
                      top: -20, 
                      left: '50%', 
                      transform: 'translateX(-50%)', 
                      fontSize: 11, 
                      fontWeight: 700, 
                      color: 'var(--accent)',
                      fontFamily: 'var(--mono)'
                    }}>
                      {b.count}
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* X-Axis Labels */}
      <div style={{ display: 'flex', marginTop: 10, marginLeft: 24, paddingLeft: 0 }}>
        {buckets.map((b, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: 'var(--ink-3)', fontFamily: 'var(--sans)' }}>
            {b.label}
          </div>
        ))}
      </div>

      {!hasActivity && (
        <p style={{ textAlign: 'center', marginTop: 12, fontSize: 12, color: 'var(--ink-3)', fontStyle: 'italic' }}>
          No network activity in the last 7 days.
        </p>
      )}
    </div>
  )
}

export default function HomePage({ navigate }) {
  const [data, setData] = useState(null)
  const [latestNews, setLatestNews] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.analytics(),
      api.listNews({ limit: 3, sort: 'added' })
    ])
      .then(([analyticsData, newsData]) => {
        setData(analyticsData)
        setLatestNews((newsData.articles || []).slice(0, 3))
      })
      .catch(error => {
        console.error('Failed to load dashboard data:', error)
        setData(null)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="empty">Loading dashboard data…</div>
  }

  if (!data) {
    return <div className="empty">Could not load data</div>
  }

  return (
    <div>
      <div
        className="page-head"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          gap: 16,
          borderBottom: 'none',
          paddingBottom: 0
        }}
      >
        <div>
          <h1>Overview</h1>
          <p>System status and recent activity</p>
        </div>
      </div>

      <div className="stats-strip" style={{ marginTop: 24 }}>
        <div className="stat-item">
          <div className="stat-value">{data.total_articles}</div>
          <div className="stat-label">Articles in Archive</div>
        </div>

        <div className="stat-item">
          <div className="stat-value">{data.registered_articles}</div>
          <div className="stat-label">Registered</div>
        </div>

        <div className="stat-item">
          <div className="stat-value">{data.total_blocks}</div>
          <div className="stat-label">Ledger Blocks</div>
        </div>

        <div className="stat-item">
          <div className="stat-value">
            {data.avg_content_length > 0 ? data.avg_content_length : '—'}
          </div>
          <div className="stat-label">Avg Length (Chars)</div>
        </div>
      </div>

      <div className="analytics-grid">
        {/* Articles by Category */}
        <div className="analytics-card">
          <div className="section-title">Articles by Category</div>
          <BarChart data={data.by_category} labelKey="category" valueKey="count" />
        </div>

        {/* Top Publishers */}
        <div className="analytics-card">
          <div className="section-title">Top Publishers</div>
          <BarChart data={data.by_source} labelKey="source" valueKey="count" />
        </div>

        {/* Network Activity */}
        <div className="analytics-card network-card">
          <div className="section-title">Network Activity</div>
          <TimelineChart data={data.blocks_by_hour || []} />
        </div>

        {/* Latest Headlines */}
        <div className="analytics-card headlines-card">
          <div className="section-title">Latest Headlines</div>
          <div className="headlines-list" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly' }}>
            {latestNews.length === 0 ? (
              <p className="muted small" style={{ padding: 12 }}>
                No news found.
              </p>
            ) : (
              latestNews.map((n, i) => (
                <div key={n.article_id} className="headline-item">
                  <div className="news-meta headline-meta">
                    <span className="headline-category">
                      {n.category || 'News'}
                    </span>
                    <span> · By {n.source}</span>
                  </div>
                  <div
                    className="headline-title"
                    onClick={() =>
                      navigate({ name: 'article', articleId: n.article_id })
                    }
                  >
                    {n.title}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recent Registrations */}
      <div style={{ marginTop: 30 }}>
        <div
          className="section-title"
          style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: 12 }}
        >
          Recent Registrations
        </div>

        <div className="recent-registration-list">
          {data.recent_registrations.length === 0 ? (
            <p className="muted" style={{ padding: '16px 0' }}>
              No articles registered yet.
            </p>
          ) : (
            data.recent_registrations.map(r => (
              <div key={r.article_id} className="registration-item">
                <div className="news-meta" style={{ marginBottom: 4 }}>
                  <span className="registration-block">
                    Block #{r.block_index}
                  </span>
                  <span> · {formatISTDate(r.registered_at)}</span>
                  <span> · By {r.registered_by}</span>
                </div>
                <h3
                  className="registration-title"
                  onClick={() =>
                    navigate({ name: 'article', articleId: r.article_id })
                  }
                >
                  {r.title || r.article_id}
                </h3>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="dashboard-disclaimer">
        ChainVerify confirms content integrity and provenance (not factual accuracy).
      </div>
    </div>
  )
}