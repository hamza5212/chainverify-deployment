import { formatIST } from '../utils/formatDate.js'

function truncateHash(h, chars = 12) {
  if (!h) return '—'
  return `${h.slice(0, chars)}…${h.slice(-chars)}`
}

export default function BlockTable({ block }) {
  if (!block) return null
  return (
    <table className="block-table">
      <tbody>
        <tr>
          <td className="td-key">Block Index</td>
          <td className="td-val accent">#{block.block_index ?? block.index}</td>
        </tr>
        <tr>
          <td className="td-key">Title</td>
          <td className="td-val" style={{ fontFamily: 'var(--sans)', fontWeight: 600 }}>{block.title || 'Genesis Block'}</td>
        </tr>
        <tr>
          <td className="td-key">Publisher</td>
          <td className="td-val" style={{ fontFamily: 'var(--sans)' }}>{block.source || '—'}</td>
        </tr>
        <tr>
          <td className="td-key">SHA-256 Hash</td>
          <td className="td-val accent">
            <code>{truncateHash(block.content_hash, 20)}</code>
          </td>
        </tr>
        <tr>
          <td className="td-key">Watermark</td>
          <td className="td-val">
            <span className="wm-chip">⚓ {block.watermark_id || block.watermark_status || 'none'}</span>
          </td>
        </tr>
        <tr>
          <td className="td-key">Prev Hash</td>
          <td className="td-val"><code>{truncateHash(block.previous_hash, 20)}</code></td>
        </tr>
        <tr>
          <td className="td-key">Current Hash</td>
          <td className="td-val"><code>{truncateHash(block.block_hash, 20)}</code></td>
        </tr>
        <tr>
          <td className="td-key">Timestamp</td>
          {/* Fixed: Falls back to registered_at if timestamp is missing */}
          <td className="td-val" style={{ fontFamily: 'var(--sans)' }}>
            {formatIST(block.timestamp || block.registered_at)}
          </td>
        </tr>
      </tbody>
    </table>
  )
}