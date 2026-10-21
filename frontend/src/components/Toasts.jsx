export default function Toasts({ items }) {
  return (
    <div className="toast-stack">
      {items.map(t => (
        <div key={t.id} className={`toast ${t.ok ? 'ok' : 'err'}`}>
          <div className="toast-dot" />
          {t.msg}
        </div>
      ))}
    </div>
  )
}