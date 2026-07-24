import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Ban,
  ChevronDown,
  ChevronUp,
  Handshake,
  ListTodo,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  StickyNote,
  Wallet,
  FileText,
  ScrollText,
  History,
} from 'lucide-react'
import { api, apiErrorMessage } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import {
  formatDate,
  formatDateTime,
  formatDuration,
  formatMoney,
  formatRelative,
  fullName,
  initials,
} from '@/lib/format'
import type {
  ApiResource,
  Agreement,
  AuditLog,
  Call,
  Contact,
  ContactNote,
  Conversation,
  Debt,
  FollowUp,
  Paginated,
  PaymentTimelineEntry,
  TimelineEvent,
} from '@/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { BehaviorBadge } from '@/components/shared/BehaviorBadge'
import { ScoreIndicator, TrendArrow } from '@/components/shared/ScoreIndicator'
import { EmptyState } from '@/components/shared/EmptyState'
import { AudioPlayer } from '@/components/shared/AudioPlayer'
import { JsonViewer } from '@/components/shared/JsonViewer'
import { CallDialog } from '@/components/contacts/CallDialog'
import { ContactFormDialog } from '@/components/contacts/ContactFormDialog'
import { DebtFormDialog } from '@/components/debts/DebtFormDialog'

const TIMELINE_ICONS: Record<TimelineEvent['type'], React.ComponentType<{ className?: string }>> = {
  call: Phone,
  agreement: Handshake,
  message: MessageCircle,
  follow_up: ListTodo,
  note: StickyNote,
  debt: Wallet,
}

const TIMELINE_COLORS: Record<TimelineEvent['type'], string> = {
  call: 'bg-blue-500',
  agreement: 'bg-emerald-500',
  message: 'bg-green-500',
  follow_up: 'bg-amber-500',
  note: 'bg-violet-500',
  debt: 'bg-rose-500',
}

export default function ContactDetail() {
  const { uuid = '' } = useParams()
  const navigate = useNavigate()
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const [callOpen, setCallOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  const { data: contact, isLoading } = useQuery({
    queryKey: ['contact', uuid],
    queryFn: async () => {
      // payment_timeline viene al mismo nivel que "data" en la respuesta
      const res = await api.get<ApiResource<Contact> & { payment_timeline?: PaymentTimelineEntry[] }>(`/contacts/${uuid}`)
      return { ...res.data.data, payment_timeline: res.data.payment_timeline ?? [] }
    },
    enabled: !!uuid,
  })

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!contact) {
    return (
      <div className="p-6">
        <EmptyState title="Contacto no encontrado" description="El contacto no existe o fue eliminado." />
      </div>
    )
  }

  const totalDebt = contact.total_debt ?? (contact.debts ?? []).reduce((acc, d) => acc + parseFloat(String(d.pending_balance ?? d.current_balance ?? 0)), 0)

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/contacts')} className="mb-3 -ml-2">
          <ArrowLeft />
          Volver a contactos
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14">
              <AvatarFallback className="text-lg">{initials(fullName(contact))}</AvatarFallback>
            </Avatar>
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold">
                {fullName(contact)}
                <StatusBadge status={contact.status} />
                {contact.do_not_contact && (
                  <Badge variant="danger">
                    <Ban className="mr-1 h-3 w-3" />
                    No contactar
                  </Badge>
                )}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {contact.dni && <span>DNI {contact.dni}</span>}
                {contact.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" />
                    {contact.phone}
                  </span>
                )}
                {contact.city && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {contact.city}
                  </span>
                )}
                {contact.segment && <Badge variant="secondary">{contact.segment}</Badge>}
                {(contact.tags ?? []).map((t, i) => (
                  <Badge key={i} variant="outline">
                    {typeof t === 'string' ? t : t.name}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="mr-2 text-right">
              <p className="text-xs text-muted-foreground">Deuda total</p>
              <p className="text-xl font-bold text-rose-600 dark:text-rose-400">{formatMoney(totalDebt)}</p>
            </div>
            {hasPermission('calls.create') && (
              <Button onClick={() => setCallOpen(true)} disabled={contact.do_not_contact || !contact.call_consent}>
                <Phone />
                Llamar
              </Button>
            )}
            {hasPermission('whatsapp.reply') && (
              <Button
                variant="outline"
                onClick={() => navigate(`/whatsapp?contact=${contact.uuid}`)}
                disabled={contact.do_not_contact || !contact.whatsapp_consent}
              >
                <MessageCircle />
                WhatsApp
              </Button>
            )}
            {hasPermission('contacts.edit') && (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil />
                Editar
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Perfil de pago */}
      <PaymentProfileCard contact={contact} timeline={contact.payment_timeline} />

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Resumen</TabsTrigger>
          <TabsTrigger value="timeline">
            <History className="h-3.5 w-3.5" />
            Línea de tiempo
          </TabsTrigger>
          <TabsTrigger value="debts">Deudas</TabsTrigger>
          <TabsTrigger value="calls">Llamadas</TabsTrigger>
          <TabsTrigger value="agreements">Acuerdos</TabsTrigger>
          <TabsTrigger value="followups">Seguimientos</TabsTrigger>
          <TabsTrigger value="conversations">Conversaciones</TabsTrigger>
          <TabsTrigger value="notes">Notas</TabsTrigger>
          <TabsTrigger value="audit">Auditoría</TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <SummaryTab contact={contact} />
        </TabsContent>
        <TabsContent value="timeline">
          <TimelineTab uuid={uuid} />
        </TabsContent>
        <TabsContent value="debts">
          <DebtsTab contact={contact} />
        </TabsContent>
        <TabsContent value="calls">
          <CallsTab uuid={uuid} />
        </TabsContent>
        <TabsContent value="agreements">
          <AgreementsTab uuid={uuid} />
        </TabsContent>
        <TabsContent value="followups">
          <FollowUpsTab uuid={uuid} />
        </TabsContent>
        <TabsContent value="conversations">
          <ConversationsTab uuid={uuid} />
        </TabsContent>
        <TabsContent value="notes">
          <NotesTab uuid={uuid} />
        </TabsContent>
        <TabsContent value="audit">
          <AuditTab uuid={uuid} />
        </TabsContent>
      </Tabs>

      <CallDialog contact={contact} open={callOpen} onOpenChange={setCallOpen} />
      <ContactFormDialog open={editOpen} onOpenChange={setEditOpen} contact={contact} />
    </div>
  )
}

const TIMELINE_STATUS_CHIP: Record<PaymentTimelineEntry['status'], string> = {
  a_tiempo: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
  tarde: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
  vencido: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
  pendiente: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300',
}

const TIMELINE_STATUS_LABEL: Record<PaymentTimelineEntry['status'], string> = {
  a_tiempo: 'A tiempo',
  tarde: 'Tarde',
  vencido: 'Vencido',
  pendiente: 'Pendiente',
}

function PaymentProfileCard({ contact, timeline }: { contact: Contact; timeline: PaymentTimelineEntry[] }) {
  const hasProfile = contact.payment_behavior != null || contact.payment_score != null
  if (!hasProfile && !timeline.length) return null

  const rate = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`)

  const metrics: { label: string; value: string }[] = [
    { label: 'Paga a tiempo', value: rate(contact.on_time_rate) },
    { label: 'Atraso promedio', value: contact.avg_delay_days == null ? '—' : `${contact.avg_delay_days} días` },
    { label: 'Paga a fin de ciclo', value: rate(contact.end_of_cycle_rate) },
    { label: 'Ciclos cursados', value: contact.cycles_with_debt != null ? String(contact.cycles_with_debt) : '—' },
  ]

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Perfil de pago</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-x-10 gap-y-4">
          <div className="flex items-center gap-4">
            <ScoreIndicator score={contact.payment_score} size="lg" />
            <div className="flex items-center gap-2">
              <BehaviorBadge behavior={contact.payment_behavior} />
              <TrendArrow trend={contact.payment_trend} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
            {metrics.map((m) => (
              <div key={m.label}>
                <p className="text-xs text-muted-foreground">{m.label}</p>
                <p className="text-sm font-semibold tabular-nums">{m.value}</p>
              </div>
            ))}
          </div>
        </div>

        {timeline.length > 0 && (
          <div className="mt-4 border-t pt-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Historia de pago por ciclo</p>
            <div className="flex flex-wrap gap-1.5">
              {timeline.map((t) => (
                <span
                  key={t.period}
                  className={`inline-flex cursor-default items-center rounded-md px-2 py-1 text-xs font-medium tabular-nums ${TIMELINE_STATUS_CHIP[t.status] ?? 'bg-muted text-muted-foreground'}`}
                  title={`${t.period} · ${TIMELINE_STATUS_LABEL[t.status] ?? t.status} · Deudas: ${t.debts} · Monto: ${formatMoney(t.amount)} · Pendiente: ${formatMoney(t.pending)} · Atraso promedio: ${t.avg_delay} días`}
                >
                  {t.period}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function SummaryTab({ contact }: { contact: Contact }) {
  const { data: timeline } = useQuery({
    queryKey: ['contact', contact.uuid, 'timeline'],
    queryFn: async () => {
      const res = await api.get<ApiResource<TimelineEvent[]>>(`/contacts/${contact.uuid}/timeline`)
      return res.data.data
    },
  })

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Deudas ({contact.debts?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {!contact.debts?.length && <EmptyState icon={Wallet} title="Sin deudas registradas" className="py-6" />}
          <div className="space-y-2">
            {contact.debts?.map((d) => (
              <div key={d.uuid} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{d.concept ?? d.reference ?? 'Deuda'}</p>
                  <p className="text-xs text-muted-foreground">
                    Vence {formatDate(d.due_date)}
                    {!!d.days_overdue && d.days_overdue > 0 && (
                      <span className="ml-1 text-destructive">· {d.days_overdue} días de mora</span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular-nums">{formatMoney(d.pending_balance ?? d.current_balance)}</p>
                  <StatusBadge status={d.status} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimos eventos</CardTitle>
        </CardHeader>
        <CardContent>
          {!timeline?.length && <EmptyState icon={History} title="Sin actividad" className="py-6" />}
          <div className="space-y-3">
            {timeline?.slice(0, 6).map((ev, i) => {
              const Icon = TIMELINE_ICONS[ev.type] ?? StickyNote
              return (
                <div key={i} className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${TIMELINE_COLORS[ev.type] ?? 'bg-muted'}`}>
                    <Icon className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{ev.title}</p>
                    {ev.description && <p className="truncate text-xs text-muted-foreground">{ev.description}</p>}
                    <p className="text-xs text-muted-foreground">{formatRelative(ev.at)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function TimelineTab({ uuid }: { uuid: string }) {
  const { data: timeline, isLoading } = useQuery({
    queryKey: ['contact', uuid, 'timeline'],
    queryFn: async () => {
      const res = await api.get<ApiResource<TimelineEvent[]>>(`/contacts/${uuid}/timeline`)
      return res.data.data
    },
  })

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (!timeline?.length) return <EmptyState icon={History} title="Sin actividad registrada" />

  return (
    <div className="relative ml-4 space-y-6 border-l pl-6">
      {timeline.map((ev, i) => {
        const Icon = TIMELINE_ICONS[ev.type] ?? StickyNote
        return (
          <div key={i} className="relative">
            <div
              className={`absolute -left-[37px] flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-background ${TIMELINE_COLORS[ev.type] ?? 'bg-muted'}`}
            >
              <Icon className="h-3 w-3 text-white" />
            </div>
            <p className="text-sm font-medium">{ev.title}</p>
            {ev.description && <p className="text-sm text-muted-foreground">{ev.description}</p>}
            <p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(ev.at)}</p>
          </div>
        )
      })}
    </div>
  )
}

function DebtsTab({ contact }: { contact: Contact }) {
  const [debtFormOpen, setDebtFormOpen] = useState(false)
  const [editDebt, setEditDebt] = useState<Debt | null>(null)

  const addButton = (
    <Button
      onClick={() => {
        setEditDebt(null)
        setDebtFormOpen(true)
      }}
    >
      <Plus />
      Agregar deuda
    </Button>
  )

  return (
    <div className="space-y-3">
      <div className="flex justify-end">{addButton}</div>
      {!contact.debts?.length ? (
        <EmptyState icon={Wallet} title="Sin deudas registradas" />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Concepto</TableHead>
                <TableHead>Periodo</TableHead>
                <TableHead className="text-right">Monto original</TableHead>
                <TableHead className="text-right">Saldo actual</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead>Mora</TableHead>
                <TableHead>Cuotas</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {contact.debts.map((d) => (
                <TableRow key={d.uuid}>
                  <TableCell>{d.code ?? d.reference ?? '—'}</TableCell>
                  <TableCell>{d.concept ?? '—'}</TableCell>
                  <TableCell>{d.academic_period ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(d.original_amount)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatMoney(d.pending_balance ?? d.current_balance)}</TableCell>
                  <TableCell>{formatDate(d.due_date)}</TableCell>
                  <TableCell>
                    {d.days_overdue ? <span className="text-destructive">{d.days_overdue} días</span> : '—'}
                  </TableCell>
                  <TableCell>
                    {d.installments_total ? `${d.installments_paid ?? 0}/${d.installments_total}` : '—'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={d.status} />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="iconSm"
                      title="Editar deuda"
                      onClick={() => {
                        setEditDebt(d)
                        setDebtFormOpen(true)
                      }}
                    >
                      <Pencil />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <DebtFormDialog open={debtFormOpen} onOpenChange={setDebtFormOpen} debt={editDebt} contact={contact} />
    </div>
  )
}

function CallsTab({ uuid }: { uuid: string }) {
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['calls', { contact: uuid }],
    queryFn: async () => {
      const res = await api.get<Paginated<Call>>('/calls', { params: { contact: uuid, per_page: 50 } })
      return res.data.data
    },
  })

  const { data: callDetail } = useQuery({
    queryKey: ['call', expanded],
    queryFn: async () => {
      const res = await api.get<ApiResource<Call>>(`/calls/${expanded}`)
      return res.data.data
    },
    enabled: !!expanded,
  })

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (!data?.length) return <EmptyState icon={Phone} title="Sin llamadas" description="Aún no se ha llamado a este contacto." />

  return (
    <div className="space-y-2">
      {data.map((call) => (
        <Card key={call.uuid}>
          <CardContent className="p-4">
            <button
              type="button"
              className="flex w-full cursor-pointer items-center justify-between gap-3 text-left"
              onClick={() => setExpanded(expanded === call.uuid ? null : call.uuid)}
            >
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">
                    {call.campaign?.name ?? 'Llamada manual'} · {call.type}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(call.created_at)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {call.duration != null && <span className="text-sm tabular-nums">{formatDuration(call.duration)}</span>}
                <StatusBadge status={call.status} />
                {call.result && <StatusBadge status={call.result} />}
                {expanded === call.uuid ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </button>
            {expanded === call.uuid && callDetail && (
              <div className="mt-4 space-y-4 border-t pt-4">
                {!!callDetail.recordings?.length && hasPermission('recordings.listen') && (
                  <div>
                    <p className="mb-2 text-sm font-medium">Grabación</p>
                    <AudioPlayer
                      getUrl={async () => {
                        const res = await api.get<ApiResource<{ url: string }>>(`/calls/${call.uuid}/recording-url`)
                        return res.data.data.url
                      }}
                    />
                  </div>
                )}
                {callDetail.transcription && hasPermission('transcriptions.view') && (
                  <details className="rounded-lg border p-3">
                    <summary className="cursor-pointer text-sm font-medium">
                      <FileText className="mr-1 inline h-4 w-4" />
                      Transcripción
                    </summary>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                      {typeof callDetail.transcription === 'string'
                        ? callDetail.transcription
                        : callDetail.transcription.text ?? JSON.stringify(callDetail.transcription)}
                    </p>
                  </details>
                )}
                {callDetail.summary && (
                  <div>
                    <p className="text-sm font-medium">Resumen</p>
                    <p className="text-sm text-muted-foreground">{callDetail.summary}</p>
                  </div>
                )}
                {callDetail.structured_result && (
                  <div>
                    <p className="mb-1 text-sm font-medium">Resultado estructurado</p>
                    <JsonViewer data={callDetail.structured_result} />
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function AgreementsTab({ uuid }: { uuid: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['agreements', { contact: uuid }],
    queryFn: async () => {
      const res = await api.get<Paginated<Agreement>>('/agreements', { params: { contact: uuid, per_page: 50 } })
      return res.data.data
    },
  })

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (!data?.length) return <EmptyState icon={Handshake} title="Sin acuerdos" description="No hay acuerdos de pago registrados." />

  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tipo</TableHead>
            <TableHead className="text-right">Monto</TableHead>
            <TableHead>Fecha promesa</TableHead>
            <TableHead>Descripción</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Creado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((a) => (
            <TableRow key={a.uuid}>
              <TableCell>{a.type ?? '—'}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{formatMoney(a.amount)}</TableCell>
              <TableCell>{formatDate(a.promise_date)}</TableCell>
              <TableCell className="max-w-[240px] truncate">{a.description ?? '—'}</TableCell>
              <TableCell>
                <StatusBadge status={a.status} />
              </TableCell>
              <TableCell>{formatDate(a.created_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function FollowUpsTab({ uuid }: { uuid: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['follow-ups', { contact: uuid }],
    queryFn: async () => {
      const res = await api.get<Paginated<FollowUp>>('/follow-ups', { params: { contact: uuid, per_page: 50 } })
      return res.data.data
    },
  })

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (!data?.length) return <EmptyState icon={ListTodo} title="Sin seguimientos" />

  return (
    <div className="space-y-2">
      {data.map((f) => (
        <div key={f.uuid} className="flex items-center justify-between rounded-lg border bg-card p-3">
          <div>
            <p className="text-sm font-medium">{f.title ?? f.type ?? 'Seguimiento'}</p>
            <p className="text-xs text-muted-foreground">
              Programado {formatDateTime(f.scheduled_at ?? f.due_at)} · {f.assigned_to?.name ?? 'Sin asignar'}
            </p>
            {f.notes && <p className="text-xs text-muted-foreground">{f.notes}</p>}
          </div>
          <div className="flex items-center gap-2">
            {f.priority && <StatusBadge status={f.priority} />}
            <StatusBadge status={f.status} />
          </div>
        </div>
      ))}
    </div>
  )
}

function ConversationsTab({ uuid }: { uuid: string }) {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['conversations', { contact: uuid }],
    queryFn: async () => {
      const res = await api.get<Paginated<Conversation>>('/conversations', { params: { search: uuid, per_page: 50 } })
      return res.data.data
    },
  })

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (!data?.length) return <EmptyState icon={MessageCircle} title="Sin conversaciones" description="No hay conversaciones de WhatsApp con este contacto." />

  return (
    <div className="space-y-2">
      {data.map((c) => (
        <button
          key={c.uuid}
          type="button"
          className="flex w-full cursor-pointer items-center justify-between rounded-lg border bg-card p-3 text-left hover:bg-accent"
          onClick={() => navigate(`/whatsapp?conversation=${c.uuid}`)}
        >
          <div className="min-w-0">
            <p className="text-sm font-medium">Conversación de WhatsApp</p>
            <p className="truncate text-xs text-muted-foreground">
              {c.last_message?.body ?? 'Sin mensajes'} · {formatRelative(c.last_message_at)}
            </p>
          </div>
          <StatusBadge status={c.status} />
        </button>
      ))}
    </div>
  )
}

function NotesTab({ uuid }: { uuid: string }) {
  const queryClient = useQueryClient()
  const [body, setBody] = useState('')

  const { data: contact } = useQuery({
    queryKey: ['contact', uuid],
    queryFn: async () => {
      // Misma queryKey y misma forma que la consulta principal de la ficha
      const res = await api.get<ApiResource<Contact & { notes?: ContactNote[] }> & { payment_timeline?: PaymentTimelineEntry[] }>(`/contacts/${uuid}`)
      return { ...res.data.data, payment_timeline: res.data.payment_timeline ?? [] }
    },
  })

  const { data: timeline } = useQuery({
    queryKey: ['contact', uuid, 'timeline'],
    queryFn: async () => {
      const res = await api.get<ApiResource<TimelineEvent[]>>(`/contacts/${uuid}/timeline`)
      return res.data.data
    },
  })

  const notes = (contact as { notes?: ContactNote[] } | undefined)?.notes
  const noteEvents = timeline?.filter((t) => t.type === 'note') ?? []

  const addNote = useMutation({
    mutationFn: () => api.post(`/contacts/${uuid}/notes`, { body }),
    onSuccess: () => {
      toast.success('Nota agregada')
      setBody('')
      queryClient.invalidateQueries({ queryKey: ['contact', uuid] })
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  return (
    <div className="max-w-2xl space-y-4">
      <div className="space-y-2">
        <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Escribe una nota sobre este contacto…" />
        <Button onClick={() => addNote.mutate()} disabled={!body.trim()} loading={addNote.isPending}>
          <StickyNote />
          Agregar nota
        </Button>
      </div>
      {notes?.length ? (
        <div className="space-y-2">
          {notes.map((n, i) => (
            <div key={n.uuid ?? n.id ?? i} className="rounded-lg border bg-card p-3">
              <p className="whitespace-pre-wrap text-sm">{n.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {n.user?.name ?? '—'} · {formatRelative(n.created_at)}
              </p>
            </div>
          ))}
        </div>
      ) : noteEvents.length ? (
        <div className="space-y-2">
          {noteEvents.map((n, i) => (
            <div key={i} className="rounded-lg border bg-card p-3">
              <p className="whitespace-pre-wrap text-sm">{n.description ?? n.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{formatRelative(n.at)}</p>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={StickyNote} title="Sin notas" className="py-6" />
      )}
    </div>
  )
}

function AuditTab({ uuid }: { uuid: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', { entity: uuid }],
    queryFn: async () => {
      const res = await api.get<Paginated<AuditLog>>('/audit-logs', {
        params: { module: 'contacts', search: uuid, per_page: 50 },
      })
      return res.data.data
    },
  })

  if (isLoading) return <Skeleton className="h-64 w-full" />
  if (!data?.length) return <EmptyState icon={ScrollText} title="Sin registros de auditoría" />

  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Usuario</TableHead>
            <TableHead>Acción</TableHead>
            <TableHead>Módulo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((log, i) => (
            <TableRow key={log.uuid ?? log.id ?? i}>
              <TableCell>{formatDateTime(log.created_at)}</TableCell>
              <TableCell>{log.user?.name ?? 'Sistema'}</TableCell>
              <TableCell>
                <Badge variant="secondary">{log.action}</Badge>
              </TableCell>
              <TableCell>{log.module ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
