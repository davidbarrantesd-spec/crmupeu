import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/**
 * Colores y etiquetas por calificación crediticia SBS.
 * Orden de riesgo: normal → cpp → deficiente → dudoso → perdida.
 */
const RATING_MAP: Record<string, { label: string; className: string; softBg: string; hex: string }> = {
  normal: {
    label: 'Normal',
    className: 'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
    softBg: 'bg-emerald-500/10',
    hex: '#10b981',
  },
  cpp: {
    label: 'CPP',
    className: 'border-transparent bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300',
    softBg: 'bg-yellow-500/10',
    hex: '#eab308',
  },
  deficiente: {
    label: 'Deficiente',
    className: 'border-transparent bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300',
    softBg: 'bg-orange-500/10',
    hex: '#f97316',
  },
  dudoso: {
    label: 'Dudoso',
    className: 'border-transparent bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
    softBg: 'bg-red-500/10',
    hex: '#ef4444',
  },
  perdida: {
    label: 'Pérdida',
    className: 'border-transparent bg-rose-200 text-rose-950 dark:bg-rose-950/70 dark:text-rose-300',
    softBg: 'bg-rose-900/15',
    hex: '#9f1239',
  },
}

/** Orden canónico de las calificaciones SBS. */
export const RATING_ORDER = ['normal', 'cpp', 'deficiente', 'dudoso', 'perdida']

export function ratingLabel(rating: string | null | undefined): string {
  if (!rating) return '—'
  return RATING_MAP[rating]?.label ?? rating.replace(/_/g, ' ')
}

/** Color hexadecimal de la calificación (para gráficos recharts / barras). */
export function ratingColorHex(rating: string | null | undefined): string {
  if (!rating) return '#6b7280'
  return RATING_MAP[rating]?.hex ?? '#6b7280'
}

/** Fondo suave (para celdas de tablas/matrices) según la calificación. */
export function ratingSoftBg(rating: string | null | undefined): string {
  if (!rating) return ''
  return RATING_MAP[rating]?.softBg ?? 'bg-muted/50'
}

/** Badge reutilizable para la calificación crediticia SBS del estudiante. */
export function RatingBadge({ rating, className }: { rating: string | null | undefined; className?: string }) {
  if (!rating) return <span className="text-muted-foreground">—</span>
  const entry = RATING_MAP[rating]
  if (!entry) {
    return (
      <Badge variant="secondary" className={className}>
        {rating.replace(/_/g, ' ')}
      </Badge>
    )
  }
  return <Badge className={cn(entry.className, className)}>{entry.label}</Badge>
}
