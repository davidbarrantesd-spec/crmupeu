import { useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Wallet, AlertTriangle, TrendingDown, Plus, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { api, apiErrorMessage } from '@/api/client'
import { useDebounce } from '@/hooks/useDebounce'
import { formatDate, formatMoney, fullName } from '@/lib/format'
import type { Debt, Paginated } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import {
  AcademicFilters,
  hasAcademicFilters,
  type AcademicFilterValues,
} from '@/components/shared/AcademicFilters'
import { DebtFormDialog } from '@/components/debts/DebtFormDialog'

const ANY = '__any__'

export default function Debts() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState(ANY)
  const [overdue, setOverdue] = useState(ANY)
  const [minBalance, setMinBalance] = useState('')
  const [maxBalance, setMaxBalance] = useState('')
  const [academic, setAcademic] = useState<AcademicFilterValues>({})
  const [sort, setSort] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editDebt, setEditDebt] = useState<Debt | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Debt | null>(null)

  const debouncedSearch = useDebounce(search)
  const debouncedMin = useDebounce(minBalance)
  const debouncedMax = useDebounce(maxBalance)

  const params: Record<string, unknown> = {
    page,
    per_page: 15,
    search: debouncedSearch || undefined,
    status: status === ANY ? undefined : status,
    overdue: overdue === ANY ? undefined : overdue,
    min_balance: debouncedMin || undefined,
    min_amount: debouncedMin || undefined,
    max_balance: debouncedMax || undefined,
    academic_period: academic.academic_period || undefined,
    campus_id: academic.campus_id || undefined,
    faculty_id: academic.faculty_id || undefined,
    career_id: academic.career_id || undefined,
    sort: sort || undefined,
  }

  const { data, isLoading, isError, refetch } = useQuery({
    placeholderData: keepPreviousData,
    queryKey: ['debts', params],
    queryFn: async () => {
      const res = await api.get<Paginated<Debt> & { totals?: { total_balance?: number; total_original?: number; overdue_count?: number } }>('/debts', { params })
      return res.data
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (uuid: string) => api.delete(`/debts/${uuid}`),
    onSuccess: () => {
      toast.success('Deuda eliminada')
      queryClient.invalidateQueries({ queryKey: ['debts'] })
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  const totals = (data as { totals?: { total_balance?: number; total_original?: number; overdue_count?: number } } | undefined)?.totals
  const pageBalance = (data?.data ?? []).reduce((acc, d) => acc + parseFloat(String(d.current_balance ?? 0)), 0)
  const pageOverdue = (data?.data ?? []).filter((d) => (d.days_overdue ?? 0) > 0).length

  const columns: Column<Debt>[] = [
    {
      key: 'contact',
      header: 'Contacto',
      render: (d) =>
        d.contact ? (
          <Link to={`/contacts/${d.contact.uuid}`} className="font-medium text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
            {fullName(d.contact)}
          </Link>
        ) : (
          '—'
        ),
    },
    { key: 'reference', header: 'Código', render: (d) => d.code ?? d.reference ?? '—' },
    { key: 'concept', header: 'Concepto', className: 'max-w-[200px] truncate', render: (d) => d.concept ?? '—' },
    {
      key: 'academic_period',
      header: 'Periodo',
      render: (d) => d.academic_period ?? '—',
    },
    {
      key: 'original_amount',
      header: 'Monto original',
      className: 'text-right',
      render: (d) => <span className="tabular-nums">{formatMoney(d.original_amount)}</span>,
    },
    {
      key: 'current_balance',
      header: 'Saldo',
      sortable: true,
      className: 'text-right',
      render: (d) => <span className="font-semibold tabular-nums">{formatMoney(d.pending_balance ?? d.current_balance)}</span>,
    },
    { key: 'due_date', header: 'Vencimiento', sortable: true, render: (d) => formatDate(d.due_date) },
    {
      key: 'days_overdue',
      header: 'Mora',
      render: (d) =>
        d.days_overdue && d.days_overdue > 0 ? (
          <span className="font-medium text-destructive">{d.days_overdue} días</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { key: 'status', header: 'Estado', render: (d) => <StatusBadge status={d.status} /> },
    {
      key: 'actions',
      header: '',
      className: 'w-10',
      render: (d) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="iconSm" onClick={(e) => e.stopPropagation()}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem
              onSelect={() => {
                setEditDebt(d)
                setFormOpen(true)
              }}
            >
              <Pencil />
              Editar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleteTarget(d)}>
              <Trash2 />
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <div className="p-6">
      <PageHeader
        title="Deudas"
        description="Cartera de deudas por cobrar"
        actions={
          <Button
            onClick={() => {
              setEditDebt(null)
              setFormOpen(true)
            }}
          >
            <Plus />
            Nueva deuda
          </Button>
        }
      />

      {/* Totales */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500/10">
              <Wallet className="h-5 w-5 text-rose-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Saldo total {totals?.total_balance == null ? '(página)' : ''}</p>
              <p className="text-lg font-bold tabular-nums">{formatMoney(totals?.total_balance ?? pageBalance)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Deudas en mora {totals?.overdue_count == null ? '(página)' : ''}</p>
              <p className="text-lg font-bold tabular-nums">{totals?.overdue_count ?? pageOverdue}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10">
              <TrendingDown className="h-5 w-5 text-indigo-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Registros</p>
              <p className="text-lg font-bold tabular-nums">{data?.meta?.total ?? 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <FilterBar
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Contacto, referencia…"
        onClear={() => {
          setSearch('')
          setStatus(ANY)
          setOverdue(ANY)
          setMinBalance('')
          setMaxBalance('')
          setAcademic({})
          setPage(1)
        }}
        hasActiveFilters={!!search || status !== ANY || overdue !== ANY || !!minBalance || !!maxBalance || hasAcademicFilters(academic)}
      >
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1) }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Todos los estados</SelectItem>
            <SelectItem value="pending">Pendiente</SelectItem>
            <SelectItem value="overdue">Vencida</SelectItem>
            <SelectItem value="in_agreement">En acuerdo</SelectItem>
            <SelectItem value="paid">Pagada</SelectItem>
            <SelectItem value="written_off">Castigada</SelectItem>
          </SelectContent>
        </Select>
        <Select value={overdue} onValueChange={(v) => { setOverdue(v); setPage(1) }}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Mora" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Con y sin mora</SelectItem>
            <SelectItem value="1">En mora</SelectItem>
            <SelectItem value="0">Sin mora</SelectItem>
          </SelectContent>
        </Select>
        <AcademicFilters
          value={academic}
          onChange={(v) => { setAcademic(v); setPage(1) }}
          fields={['academic_period', 'campus_id', 'faculty_id', 'career_id']}
        />
        <Input
          type="number"
          value={minBalance}
          onChange={(e) => { setMinBalance(e.target.value); setPage(1) }}
          placeholder="Saldo mín."
          className="w-28"
        />
        <Input
          type="number"
          value={maxBalance}
          onChange={(e) => { setMaxBalance(e.target.value); setPage(1) }}
          placeholder="Saldo máx."
          className="w-28"
        />
      </FilterBar>

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        page={page}
        onPageChange={setPage}
        sort={sort}
        onSortChange={setSort}
        rowKey={(d) => d.uuid}
        emptyTitle="Sin deudas"
        emptyDescription="No se encontraron deudas con los filtros aplicados."
      />

      <DebtFormDialog open={formOpen} onOpenChange={setFormOpen} debt={editDebt} />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Eliminar deuda"
        description={`¿Seguro que deseas eliminar la deuda ${deleteTarget?.code ?? deleteTarget?.reference ?? deleteTarget?.concept ?? ''} de ${fullName(deleteTarget?.contact)}? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        destructive
        onConfirm={async () => {
          if (deleteTarget) await deleteMutation.mutateAsync(deleteTarget.uuid)
        }}
      />
    </div>
  )
}
