import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/** Colores y etiquetas por comportamiento de pago. */
const BEHAVIOR_MAP: Record<string, { label: string; className: string; softBg: string }> = {
  puntual: {
    label: 'Puntual',
    className: 'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
    softBg: 'bg-emerald-500/10',
  },
  demora_leve: {
    label: 'Demora leve',
    className: 'border-transparent bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300',
    softBg: 'bg-yellow-500/10',
  },
  demora_cronica: {
    label: 'Demora crónica',
    className: 'border-transparent bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
    softBg: 'bg-red-500/10',
  },
  fin_de_ciclo: {
    label: 'Fin de ciclo',
    className: 'border-transparent bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-300',
    softBg: 'bg-violet-500/10',
  },
  sin_historial: {
    label: 'Sin historial',
    className: 'border-transparent bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    softBg: 'bg-gray-500/10',
  },
}

export function behaviorLabel(behavior: string | null | undefined): string {
  if (!behavior) return '—'
  return BEHAVIOR_MAP[behavior]?.label ?? behavior.replace(/_/g, ' ')
}

/** Fondo suave (para celdas de tablas/matrices) según el comportamiento. */
export function behaviorSoftBg(behavior: string | null | undefined): string {
  if (!behavior) return ''
  return BEHAVIOR_MAP[behavior]?.softBg ?? 'bg-muted/50'
}

/** Badge reutilizable para el comportamiento de pago del estudiante. */
export function BehaviorBadge({ behavior, className }: { behavior: string | null | undefined; className?: string }) {
  if (!behavior) return <span className="text-muted-foreground">—</span>
  const entry = BEHAVIOR_MAP[behavior]
  if (!entry) {
    return (
      <Badge variant="secondary" className={className}>
        {behavior.replace(/_/g, ' ')}
      </Badge>
    )
  }
  return <Badge className={cn(entry.className, className)}>{entry.label}</Badge>
}
