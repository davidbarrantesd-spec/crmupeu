import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { Handshake, AlertTriangle } from 'lucide-react'
import { api, apiErrorMessage } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { formatDate, formatMoney, fullName } from '@/lib/format'
import type { Agreement, Paginated } from '@/types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { StatusBadge, statusLabel } from '@/components/shared/StatusBadge'
import { FormField } from '@/components/shared/FormField'

const ANY = '__any__'
const STATUS_CHANGES = ['fulfilled', 'broken', 'rescheduled'] as const

export default function Agreements() {
  const queryClient = useQueryClient()
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState(ANY)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [promiseFrom, setPromiseFrom] = useState('')
  const [promiseTo, setPromiseTo] = useState('')
  const [statusChange, setStatusChange] = useState<{ agreement: Agreement; status: string } | null>(null)
  const [observations, setObservations] = useState('')

  const params: Record<string, unknown> = {
    page,
    per_page: 15,
    status: status === ANY ? undefined : status,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    promise_date_from: promiseFrom || undefined,
    promise_date_to: promiseTo || undefined,
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['agreements', params],
    queryFn: async () => {
      const res = await api.get<Paginated<Agreement>>('/agreements', { params })
      return res.data
    },
  })

  const update = useMutation({
    mutationFn: ({ uuid, status: newStatus, obs }: { uuid: string; status: string; obs: string }) =>
      api.put(`/agreements/${uuid}`, { status: newStatus, observations: obs || null }),
    onSuccess: () => {
      toast.success('Acuerdo actualizado')
      queryClient.invalidateQueries({ queryKey: ['agreements'] })
      setStatusChange(null)
      setObservations('')
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  const dueSoon = (a: Agreement) => {
    if (a.status !== 'pending' && a.status !== 'active') return false
    try {
      const days = differenceInCalendarDays(parseISO(a.promise_date), new Date())
      return days >= 0 && days <= 3
    } catch {
      return false
    }
  }

  const columns: Column<Agreement>[] = [
    {
      key: 'contact',
      header: 'Contacto',
      render: (a) =>
        a.contact ? (
          <Link to={`/contacts/${a.contact.uuid}`} className="font-medium text-primary hover:underline">
            {fullName(a.contact)}
          </Link>
        ) : (
          '—'
        ),
    },
    { key: 'type', header: 'Tipo', render: (a) => a.type ?? '—' },
    {
      key: 'amount',
      header: 'Monto',
      className: 'text-right',
      render: (a) => <span className="font-semibold tabular-nums">{formatMoney(a.amount)}</span>,
    },
    {
      key: 'promise_date',
      header: 'Fecha promesa',
      render: (a) => (
        <div className="flex items-center gap-1.5">
          {formatDate(a.promise_date)}
          {dueSoon(a) && (
            <Badge variant="warning">
              <AlertTriangle className="mr-1 h-3 w-3" />
              Por vencer
            </Badge>
          )}
        </div>
      ),
    },
    { key: 'description', header: 'Descripción', className: 'max-w-[220px] truncate', render: (a) => a.description ?? '—' },
    {
      key: 'status',
      header: 'Estado',
      render: (a) =>
        hasPermission('agreements.edit') ? (
          <Select
            value={a.status}
            onValueChange={(v) => {
              if (v !== a.status) setStatusChange({ agreement: a, status: v })
            }}
          >
            <SelectTrigger className="h-8 w-40 text-xs" onClick={(e) => e.stopPropagation()}>
              <SelectValue>
                <StatusBadge status={a.status} />
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={a.status}>{statusLabel(a.status)} (actual)</SelectItem>
              {STATUS_CHANGES.filter((s) => s !== a.status).map((s) => (
                <SelectItem key={s} value={s}>
                  {statusLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <StatusBadge status={a.status} />
        ),
    },
    { key: 'created_at', header: 'Creado', render: (a) => formatDate(a.created_at) },
  ]

  return (
    <div className="p-6">
      <PageHeader title="Acuerdos" description="Acuerdos y promesas de pago" />

      <FilterBar
        onClear={() => {
          setStatus(ANY)
          setDateFrom('')
          setDateTo('')
          setPromiseFrom('')
          setPromiseTo('')
          setPage(1)
        }}
        hasActiveFilters={status !== ANY || !!dateFrom || !!dateTo || !!promiseFrom || !!promiseTo}
      >
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1) }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Todos los estados</SelectItem>
            <SelectItem value="pending">Pendiente</SelectItem>
            <SelectItem value="fulfilled">Cumplido</SelectItem>
            <SelectItem value="broken">Incumplido</SelectItem>
            <SelectItem value="rescheduled">Reprogramado</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Creación:</span>
          <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1) }} className="w-auto" />
          <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1) }} className="w-auto" />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Promesa:</span>
          <Input type="date" value={promiseFrom} onChange={(e) => { setPromiseFrom(e.target.value); setPage(1) }} className="w-auto" />
          <Input type="date" value={promiseTo} onChange={(e) => { setPromiseTo(e.target.value); setPage(1) }} className="w-auto" />
        </div>
      </FilterBar>

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        page={page}
        onPageChange={setPage}
        rowKey={(a) => a.uuid}
        emptyTitle="Sin acuerdos"
        emptyDescription="No hay acuerdos de pago registrados con los filtros aplicados."
        emptyIcon={Handshake}
      />

      {/* Cambio de estado con observaciones */}
      <Dialog open={!!statusChange} onOpenChange={(o) => !o && setStatusChange(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar estado del acuerdo</DialogTitle>
            <DialogDescription>
              {statusChange && (
                <>
                  {fullName(statusChange.agreement.contact)} · {formatMoney(statusChange.agreement.amount)} →{' '}
                  <strong>{statusLabel(statusChange.status)}</strong>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <FormField label="Observaciones">
            <Textarea rows={3} value={observations} onChange={(e) => setObservations(e.target.value)} placeholder="Detalle del cambio…" />
          </FormField>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusChange(null)}>
              Cancelar
            </Button>
            <Button
              loading={update.isPending}
              onClick={() => {
                if (statusChange) {
                  update.mutate({ uuid: statusChange.agreement.uuid, status: statusChange.status, obs: observations })
                }
              }}
            >
              Confirmar cambio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
