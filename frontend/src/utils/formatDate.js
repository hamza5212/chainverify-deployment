// ChainVerify — date/time formatting utilities.
// All timestamps are stored as UTC ISO strings.
// Display is always IST.

const IST = 'Asia/Kolkata'

const IST_DATETIME_OPTIONS = {
  timeZone: IST,
  day:      '2-digit',
  month:    'short',
  year:     'numeric',
  hour:     '2-digit',
  minute:   '2-digit',
  hour12:   true,
}

const IST_DATE_OPTIONS = {
  timeZone: IST,
  day:      '2-digit',
  month:    'short',
  year:     'numeric',
}

const IST_TIME_OPTIONS = {
  timeZone: IST,
  hour:     '2-digit',
  minute:   '2-digit',
  hour12:   false,
}

const IST_HOUR_LONG_OPTIONS = {
  timeZone: IST,
  day:      '2-digit',
  month:    'short',
  hour:     '2-digit',
  hour12:   true,
}

const IST_HOUR_SHORT_OPTIONS = {
  timeZone: IST,
  day:      '2-digit',
  month:    'short',
  hour:     '2-digit',
  minute:   '2-digit',
  hour12:   false,
}

export function formatIST(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return String(ts)
  return d.toLocaleString('en-IN', IST_DATETIME_OPTIONS) + ' IST'
}

export function formatISTDate(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return String(ts)
  return d.toLocaleDateString('en-IN', IST_DATE_OPTIONS)
}

export function formatISTTime(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return String(ts)
  return d.toLocaleTimeString('en-IN', IST_TIME_OPTIONS)
}

/**
 * Format a UTC hour bucket like "2026-10-13T15" as "13 Oct, 08 PM IST".
 * Used in tooltips for the blockchain activity chart.
 */
export function formatISTHour(bucket) {
  if (!bucket) return '—'
  const d = new Date(bucket + ':00:00Z')
  if (isNaN(d.getTime())) return String(bucket)
  return d.toLocaleString('en-IN', IST_HOUR_LONG_OPTIONS) + ' IST'
}

/**
 * Compact form for chart axis labels: "13 Oct 20:30".
 */
export function formatISTHourShort(bucket) {
  if (!bucket) return '—'
  const d = new Date(bucket + ':00:00Z')
  if (isNaN(d.getTime())) return String(bucket)
  return d.toLocaleString('en-IN', IST_HOUR_SHORT_OPTIONS)
}