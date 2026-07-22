import { format, formatDistanceToNow, parseISO, isValid } from 'date-fns'
import { es } from 'date-fns/locale'

const penFormatter = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  minimumFractionDigits: 2,
})

export function formatMoney(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return 'S/ 0.00'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (Number.isNaN(num)) return 'S/ 0.00'
  return penFormatter.format(num)
}

export function formatNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '0'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (Number.isNaN(num)) return '0'
  return new Intl.NumberFormat('es-PE').format(num)
}

export function formatPercent(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '0%'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (Number.isNaN(num)) return '0%'
  return `${num.toFixed(1)}%`
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const d = typeof value === 'string' ? parseISO(value) : value
  return isValid(d) ? d : null
}

export function formatDate(value: string | Date | null | undefined): string {
  const d = toDate(value)
  return d ? format(d, 'dd MMM yyyy', { locale: es }) : '—'
}

export function formatDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value)
  return d ? format(d, 'dd MMM yyyy HH:mm', { locale: es }) : '—'
}

export function formatTime(value: string | Date | null | undefined): string {
  const d = toDate(value)
  return d ? format(d, 'HH:mm', { locale: es }) : '—'
}

export function formatRelative(value: string | Date | null | undefined): string {
  const d = toDate(value)
  return d ? formatDistanceToNow(d, { locale: es, addSuffix: true }) : '—'
}

export function formatDayLabel(value: string | Date | null | undefined): string {
  const d = toDate(value)
  return d ? format(d, "EEEE d 'de' MMMM", { locale: es }) : '—'
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds && seconds !== 0) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function fullName(contact: { first_name?: string; last_name?: string | null; full_name?: string } | null | undefined): string {
  if (!contact) return '—'
  if (contact.full_name) return contact.full_name
  return [contact.first_name, contact.last_name].filter(Boolean).join(' ') || '—'
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?'
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}
