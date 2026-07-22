import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { CheckCircle2, ListTodo, Pencil, Plus, Trash2, Zap } from 'lucide-react'
import { api, apiErrorMessage } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { formatDateTime, fullName } from '@/lib/format'
import type { FollowUp, FollowUpRule, Paginated, User } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { FormField } from '@/components/shared/FormField'
import { EmptyState } from '@/components/shared/EmptyState'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'

const ANY = '__any__'

const TRIGGER_EVENTS = [
  { value: 'call_no_answer', label: 'Llamada sin respuesta' },
  { value: 'call_answered', label: 'Llamada contestada' },
  { value: 'promise_to_pay', label: 'Promesa de pago' },
  { value: 'agreement_broken', label: 'Acuerdo incumplido' },
  { value: 'agreement_due', label: 'Acuerdo por vencer' },
  { value: 'whatsapp_no_reply', label: 'WhatsApp sin respuesta' },
  { value: 'campaign_completed', label: 'Campaña completada' },
]

const RULE_ACTIONS = [
  { value: 'schedule_call', label: 'Programar llamada' },
  { value: 'send_whatsapp', label: 'Enviar WhatsApp' },
  { value: 'create_follow_up', label: 'Crear seguimiento manual' },
  { value: 'assign_advisor', label: 'Asignar a asesor' },
  { value: 'add_tag', label: 'Agregar etiqueta' },
]

export default function FollowUps() {
  return (
    <div className="p-6">
      <PageHeader title="Seguimientos" description="Cola de trabajo y reglas de seguimiento automático" />
      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue">
            <ListTodo className="h-3.5 w-3.5" />
            Cola de trabajo
          </TabsTrigger>
          <TabsTrigger value="rules">
            <Zap className="h-3.5 w-3.5" />
            Reglas
          </TabsTrigger>
        </TabsList>
        <TabsContent value="queue">
          <QueueTab />
        </TabsContent>
        <TabsContent value="rules">
          <RulesTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function QueueTab() {
  const queryClient = useQueryClient()
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('pending')
  const [priority, setPriority] = useState(ANY)
  const [assignedTo, setAssignedTo] = useState(ANY)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [completing, setCompleting] = useState<FollowUp | null>(null)
  const [result, setResult] = useState('')
  const [notes, setNotes] = useState('')

  const { data: users } = useQuery({
    queryKey: ['users', 'for-filter'],
    queryFn: async () => {
      const res = await api.get<Paginated<User>>('/users', { params: { per_page: 100 } })
      return res.data.data
    },
  })

  const params: Record<string, unknown> = {
    page,
    per_page: 15,
    status: status === ANY ? undefined : status,
    priority: priority === ANY ? undefined : priority,
    assigned_to: assignedTo === ANY ? undefined : assignedTo,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['follow-ups', params],
    queryFn: async () => {
      const res = await api.get<Paginated<FollowUp>>('/follow-ups', { params })
      return res.data
    },
  })

  const complete = useMutation({
    mutationFn: ({ uuid }: { uuid: string }) =>
      api.put(`/follow-ups/${uuid}`, { status: 'done', result, notes: notes || null }),
    onSuccess: () => {
      toast.success('Seguimiento completado')
      queryClient.invalidateQueries({ queryKey: ['follow-ups'] })
      setCompleting(null)
      setResult('')
      setNotes('')
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  const columns: Column<FollowUp>[] = [
    {
      key: 'contact',
      header: 'Contacto',
      render: (f) =>
        f.contact ? (
          <Link to={`/contacts/${f.contact.uuid}`} className="font-medium text-primary hover:underline">
            {fullName(f.contact)}
          </Link>
        ) : (
          '—'
        ),
    },
    { key: 'title', header: 'Tarea', render: (f) => f.title ?? f.type ?? 'Seguimiento' },
    { key: 'scheduled_at', header: 'Programado', render: (f) => formatDateTime(f.scheduled_at ?? f.due_at) },
    { key: 'assigned_to', header: 'Asignado a', render: (f) => f.assigned_to?.name ?? <span className="text-muted-foreground">Sin asignar</span> },
    { key: 'priority', header: 'Prioridad', render: (f) => (f.priority ? <StatusBadge status={f.priority} /> : '—') },
    { key: 'status', header: 'Estado', render: (f) => <StatusBadge status={f.status} /> },
    {
      key: 'actions',
      header: '',
      className: 'w-32',
      render: (f) =>
        f.status === 'pending' && hasPermission('follow_ups.edit') ? (
          <Button size="sm" variant="outline" onClick={() => setCompleting(f)}>
            <CheckCircle2 />
            Completar
          </Button>
        ) : (
          f.result && <span className="text-xs text-muted-foreground">{f.result}</span>
        ),
    },
  ]

  return (
    <>
      <FilterBar
        onClear={() => {
          setStatus('pending')
          setPriority(ANY)
          setAssignedTo(ANY)
          setDateFrom('')
          setDateTo('')
          setPage(1)
        }}
        hasActiveFilters={status !== 'pending' || priority !== ANY || assignedTo !== ANY || !!dateFrom || !!dateTo}
      >
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1) }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Todos</SelectItem>
            <SelectItem value="pending">Pendiente</SelectItem>
            <SelectItem value="done">Completado</SelectItem>
            <SelectItem value="expired">Expirado</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={(v) => { setPriority(v); setPage(1) }}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Prioridad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Todas</SelectItem>
            <SelectItem value="low">Baja</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="high">Alta</SelectItem>
            <SelectItem value="urgent">Urgente</SelectItem>
          </SelectContent>
        </Select>
        <Select value={assignedTo} onValueChange={(v) => { setAssignedTo(v); setPage(1) }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Asignado a" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Cualquier asesor</SelectItem>
            {(users ?? []).map((u) => (
              <SelectItem key={u.uuid} value={u.uuid}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1) }} className="w-auto" />
        <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1) }} className="w-auto" />
      </FilterBar>

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        page={page}
        onPageChange={setPage}
        rowKey={(f) => f.uuid}
        emptyTitle="Cola vacía"
        emptyDescription="No hay seguimientos con los filtros aplicados."
        emptyIcon={ListTodo}
      />

      <Dialog open={!!completing} onOpenChange={(o) => !o && setCompleting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Completar seguimiento</DialogTitle>
            <DialogDescription>{completing && `${fullName(completing.contact)} · ${completing.title ?? completing.type ?? ''}`}</DialogDescription>
          </DialogHeader>
          <FormField label="Resultado" required>
            <Select value={result} onValueChange={setResult}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona el resultado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contacted">Contactado</SelectItem>
                <SelectItem value="promise_to_pay">Promesa de pago</SelectItem>
                <SelectItem value="paid">Pagó</SelectItem>
                <SelectItem value="no_answer">Sin respuesta</SelectItem>
                <SelectItem value="refused">Rechazó</SelectItem>
                <SelectItem value="rescheduled">Reprogramado</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Notas">
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FormField>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleting(null)}>
              Cancelar
            </Button>
            <Button
              disabled={!result}
              loading={complete.isPending}
              onClick={() => completing && complete.mutate({ uuid: completing.uuid })}
            >
              <CheckCircle2 />
              Completar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

const ruleSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  trigger_event: z.string().min(1, 'Selecciona un disparador'),
  action: z.string().min(1, 'Selecciona una acción'),
  delay_minutes: z.number().min(0, 'Debe ser 0 o mayor'),
  active: z.boolean(),
})

type RuleForm = z.infer<typeof ruleSchema>

function RulesTab() {
  const queryClient = useQueryClient()
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const [editing, setEditing] = useState<FollowUpRule | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<FollowUpRule | null>(null)

  const { data: rules, isLoading } = useQuery({
    queryKey: ['follow-up-rules'],
    queryFn: async () => {
      const res = await api.get<Paginated<FollowUpRule>>('/follow-up-rules', { params: { per_page: 100 } })
      return res.data.data
    },
  })

  const form = useForm<RuleForm>({
    resolver: zodResolver(ruleSchema),
    defaultValues: { name: '', trigger_event: '', action: '', delay_minutes: 30, active: true },
  })

  const openForm = (rule: FollowUpRule | null) => {
    setEditing(rule)
    form.reset(
      rule
        ? {
            name: rule.name,
            trigger_event: rule.trigger_event,
            action: rule.action,
            delay_minutes: rule.delay_minutes,
            active: rule.active,
          }
        : { name: '', trigger_event: '', action: '', delay_minutes: 30, active: true },
    )
    setFormOpen(true)
  }

  const save = useMutation({
    mutationFn: (values: RuleForm) =>
      editing ? api.put(`/follow-up-rules/${editing.uuid}`, values) : api.post('/follow-up-rules', values),
    onSuccess: () => {
      toast.success(editing ? 'Regla actualizada' : 'Regla creada')
      queryClient.invalidateQueries({ queryKey: ['follow-up-rules'] })
      setFormOpen(false)
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  const toggleActive = useMutation({
    mutationFn: (rule: FollowUpRule) => api.put(`/follow-up-rules/${rule.uuid}`, { ...rule, active: !rule.active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['follow-up-rules'] }),
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  const remove = useMutation({
    mutationFn: (uuid: string) => api.delete(`/follow-up-rules/${uuid}`),
    onSuccess: () => {
      toast.success('Regla eliminada')
      queryClient.invalidateQueries({ queryKey: ['follow-up-rules'] })
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  const label = (list: { value: string; label: string }[], value: string) => list.find((x) => x.value === value)?.label ?? value

  return (
    <div className="space-y-3">
      {hasPermission('follow_ups.create') && (
        <div className="flex justify-end">
          <Button onClick={() => openForm(null)}>
            <Plus />
            Nueva regla
          </Button>
        </div>
      )}
      {isLoading && <Skeleton className="h-40 w-full" />}
      {!isLoading && !rules?.length && (
        <EmptyState icon={Zap} title="Sin reglas" description="Crea reglas para automatizar los seguimientos." />
      )}
      {rules?.map((rule) => (
        <div key={rule.uuid} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
          <div className="min-w-0">
            <p className="font-medium">{rule.name}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              <Badge variant="info">{label(TRIGGER_EVENTS, rule.trigger_event)}</Badge>
              <span>→</span>
              <Badge variant="purple">{label(RULE_ACTIONS, rule.action)}</Badge>
              <span>tras {rule.delay_minutes} min</span>
              {rule.campaign && <span>· Campaña: {rule.campaign.name}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={rule.active} onCheckedChange={() => toggleActive.mutate(rule)} disabled={!hasPermission('follow_ups.edit')} />
            {hasPermission('follow_ups.edit') && (
              <Button variant="ghost" size="iconSm" onClick={() => openForm(rule)}>
                <Pencil />
              </Button>
            )}
            {hasPermission('follow_ups.delete') && (
              <Button variant="ghost" size="iconSm" onClick={() => setDeleteTarget(rule)}>
                <Trash2 className="text-destructive" />
              </Button>
            )}
          </div>
        </div>
      ))}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar regla' : 'Nueva regla'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
            <FormField label="Nombre" error={form.formState.errors.name?.message} required>
              <Input {...form.register('name')} />
            </FormField>
            <FormField label="Cuando ocurra (disparador)" error={form.formState.errors.trigger_event?.message} required>
              <Select value={form.watch('trigger_event')} onValueChange={(v) => form.setValue('trigger_event', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona evento" />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_EVENTS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Ejecutar (acción)" error={form.formState.errors.action?.message} required>
              <Select value={form.watch('action')} onValueChange={(v) => form.setValue('action', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona acción" />
                </SelectTrigger>
                <SelectContent>
                  {RULE_ACTIONS.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Retraso (minutos)" error={form.formState.errors.delay_minutes?.message}>
              <Input type="number" min={0} {...form.register('delay_minutes', { valueAsNumber: true })} />
            </FormField>
            <label className="flex cursor-pointer items-center justify-between text-sm">
              Regla activa
              <Switch checked={form.watch('active')} onCheckedChange={(v) => form.setValue('active', v)} />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={save.isPending}>
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Eliminar regla"
        description={`¿Eliminar la regla "${deleteTarget?.name}"?`}
        confirmLabel="Eliminar"
        destructive
        onConfirm={async () => {
          if (deleteTarget) await remove.mutateAsync(deleteTarget.uuid)
        }}
      />
    </div>
  )
}
