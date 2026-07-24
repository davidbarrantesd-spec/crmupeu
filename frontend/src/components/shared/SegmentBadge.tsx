import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/** Colores y etiquetas por segmento de pago. */
const SEGMENT_MAP: Record<string, { label: string; className: string }> = {
  deudor_cronico: {
    label: 'Deudor crónico',
    className: 'border-transparent bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
  },
  deudor_inactivo: {
    label: 'Deudor inactivo',
    className: 'border-transparent bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300',
  },
  pagador_tardio: {
    label: 'Pagador tardío',
    className: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
  },
  buen_pagador: {
    label: 'Buen pagador',
    className: 'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
  },
  deuda_reciente: {
    label: 'Deuda reciente',
    className: 'border-transparent bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  },
}

export function segmentLabel(segment: string | null | undefined): string {
  if (!segment) return '—'
  return SEGMENT_MAP[segment]?.label ?? segment.replace(/_/g, ' ')
}

/** Badge reutilizable para el segmento de pago del estudiante. */
export function SegmentBadge({ segment, className }: { segment: string | null | undefined; className?: string }) {
  if (!segment) return <span className="text-muted-foreground">—</span>
  const entry = SEGMENT_MAP[segment]
  if (!entry) {
    return (
      <Badge variant="secondary" className={className}>
        {segment.replace(/_/g, ' ')}
      </Badge>
    )
  }
  return <Badge className={cn(entry.className, className)}>{entry.label}</Badge>
}
