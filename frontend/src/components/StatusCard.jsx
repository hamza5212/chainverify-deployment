export default function StatusCard({ ok, title, subtitle, children }) {
  return (
    <div className={`result-banner ${ok ? 'success' : 'fail'}`}>
      <div className="result-msg">{title}</div>
      {subtitle && <div className="status-sub">{subtitle}</div>}
      {children}
    </div>
  )
}