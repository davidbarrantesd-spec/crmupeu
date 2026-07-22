import { Badge, type BadgeProps } from '@/components/ui/badge'

type Variant = NonNullable<BadgeProps['variant']>

const STATUS_MAP: Record<string, { label: string; variant: Variant }> = {
  // Genéricos
  active: { label: 'Activo', variant: 'success' },
  inactive: { label: 'Inactivo', variant: 'muted' },
  pending: { label: 'Pendiente', variant: 'warning' },
  draft: { label: 'Borrador', variant: 'muted' },
  // Campañas
  scheduled: { label: 'Programada', variant: 'info' },
  running: { label: 'En curso', variant: 'success' },
  paused: { label: 'Pausada', variant: 'warning' },
  completed: { label: 'Completada', variant: 'info' },
  cancelled: { label: 'Cancelada', variant: 'muted' },
  canceled: { label: 'Cancelada', variant: 'muted' },
  // Llamadas
  queued: { label: 'En cola', variant: 'muted' },
  ringing: { label: 'Timbrando', variant: 'info' },
  in_progress: { label: 'En curso', variant: 'info' },
  answered: { label: 'Contestada', variant: 'success' },
  no_answer: { label: 'Sin respuesta', variant: 'warning' },
  busy: { label: 'Ocupado', variant: 'warning' },
  failed: { label: 'Fallida', variant: 'danger' },
  voicemail: { label: 'Buzón de voz', variant: 'purple' },
  // Resultados de llamada
  promise_to_pay: { label: 'Promesa de pago', variant: 'success' },
  refused: { label: 'Rechazó', variant: 'danger' },
  wrong_number: { label: 'Número equivocado', variant: 'muted' },
  callback_requested: { label: 'Pidió rellamada', variant: 'info' },
  transferred: { label: 'Transferida', variant: 'purple' },
  // Acuerdos
  fulfilled: { label: 'Cumplido', variant: 'success' },
  broken: { label: 'Incumplido', variant: 'danger' },
  rescheduled: { label: 'Reprogramado', variant: 'warning' },
  partial: { label: 'Parcial', variant: 'warning' },
  // Deudas
  paid: { label: 'Pagada', variant: 'success' },
  overdue: { label: 'Vencida', variant: 'danger' },
  in_agreement: { label: 'En acuerdo', variant: 'info' },
  written_off: { label: 'Castigada', variant: 'muted' },
  // Seguimientos
  open: { label: 'Abierta', variant: 'success' },
  done: { label: 'Completado', variant: 'success' },
  closed: { label: 'Cerrada', variant: 'muted' },
  expired: { label: 'Expirado', variant: 'muted' },
  // Conversaciones / mensajes
  sent: { label: 'Enviado', variant: 'info' },
  delivered: { label: 'Entregado', variant: 'info' },
  read: { label: 'Leído', variant: 'success' },
  // Importaciones
  processing: { label: 'Procesando', variant: 'info' },
  mapping: { label: 'Mapeando', variant: 'warning' },
  uploaded: { label: 'Subido', variant: 'muted' },
  // Prompts
  published: { label: 'Publicada', variant: 'success' },
  archived: { label: 'Archivada', variant: 'muted' },
  // Integraciones
  sandbox: { label: 'Sandbox', variant: 'warning' },
  // Prioridad
  low: { label: 'Baja', variant: 'muted' },
  medium: { label: 'Media', variant: 'info' },
  normal: { label: 'Normal', variant: 'info' },
  high: { label: 'Alta', variant: 'warning' },
  urgent: { label: 'Urgente', variant: 'danger' },
}

export function statusLabel(status: string | number | null | undefined): string {
  if (status === null || status === undefined || status === '') return '—'
  const key = String(status)
  return STATUS_MAP[key]?.label ?? key.replace(/_/g, ' ')
}

export function StatusBadge({ status, className }: { status: string | number | null | undefined; className?: string }) {
  if (status === null || status === undefined || status === '') return <span className="text-muted-foreground">—</span>
  const key = String(status)
  const entry = STATUS_MAP[key]
  return (
    <Badge variant={entry?.variant ?? 'secondary'} className={className}>
      {entry?.label ?? key.replace(/_/g, ' ')}
    </Badge>
  )
}
