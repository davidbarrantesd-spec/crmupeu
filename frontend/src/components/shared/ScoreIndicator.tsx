import { MoveRight, TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PaymentTrend } from '@/types'

/** Color de texto según el score de pago (>=75 verde, 40-74 ámbar, <40 rojo). */
export function scoreColorClass(score: number): string {
  if (score >= 75) return 'text-emerald-600 dark:text-emerald-400'
  if (score >= 40) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

/** Color de fondo (barras de progreso) según el score de pago. */
export function scoreBarClass(score: number): string {
  if (score >= 75) return 'bg-emerald-500'
  if (score >= 40) return 'bg-amber-500'
  return 'bg-red-500'
}

/**
 * Número de score (0-100) con color según el rango.
 * `size="sm"` para tablas, `size="lg"` para la ficha del contacto.
 */
export function ScoreIndicator({
  score,
  size = 'sm',
  className,
}: {
  score: number | null | undefined
  size?: 'sm' | 'lg'
  className?: string
}) {
  if (score === null || score === undefined) return <span className="text-muted-foreground">—</span>
  if (size === 'lg') {
    return (
      <span className={cn('inline-flex items-baseline gap-1', className)} title={`Score de pago: ${score}/100`}>
        <span className={cn('text-3xl font-bold tabular-nums tracking-tight', scoreColorClass(score))}>{score}</span>
        <span className="text-sm text-muted-foreground">/100</span>
      </span>
    )
  }
  return (
    <span
      className={cn('text-xs font-semibold tabular-nums', scoreColorClass(score), className)}
      title={`Score de pago: ${score}/100`}
    >
      {score}
    </span>
  )
}

const TREND_MAP: Record<PaymentTrend, { label: string; icon: React.ComponentType<{ className?: string }>; className: string }> = {
  mejorando: { label: 'Mejorando', icon: TrendingUp, className: 'text-emerald-500' },
  estable: { label: 'Estable', icon: MoveRight, className: 'text-muted-foreground' },
  empeorando: { label: 'Empeorando', icon: TrendingDown, className: 'text-red-500' },
}

export function trendLabel(trend: PaymentTrend | string | null | undefined): string {
  if (!trend) return '—'
  return TREND_MAP[trend as PaymentTrend]?.label ?? trend
}

/** Flecha de tendencia de pago: mejorando ↗ verde, estable → gris, empeorando ↘ rojo. */
export function TrendArrow({
  trend,
  className,
}: {
  trend: PaymentTrend | string | null | undefined
  className?: string
}) {
  if (!trend) return null
  const entry = TREND_MAP[trend as PaymentTrend]
  if (!entry) return null
  const Icon = entry.icon
  return (
    <span className={cn('inline-flex items-center', entry.className, className)} title={`Tendencia: ${entry.label}`}>
      <Icon className="h-4 w-4" />
    </span>
  )
}
