import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Wallet, AlertTriangle, TrendingDown } from 'lucide-react'
import { api } from '@/api/client'
import { useDebounce } from '@/hooks/useDebounce'
import { formatDate, formatMoney, fullName } from '@/lib/format'
import type { Debt, Paginated } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'

const ANY = '__any__'

export default function Debts() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState(ANY)
  const [overdue, setOverdue] = useState(ANY)
  const [minBalance, setMinBalance] = useState('')
  const [maxBalance, setMaxBalance] = useState('')
  const [sort, setSort] = useState('')

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
    max_balance: debouncedMax || undefined,
    sort: sort || undefined,
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['debts', params],
    queryFn: async () => {
      const res = await api.get<Paginated<Debt> & { totals?: { total_balance?: number; total_original?: number; overdue_count?: number } }>('/debts', { params })
      return res.data
    },
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
    { key: 'reference', header: 'Referencia', render: (d) => d.reference ?? '—' },
    { key: 'concept', header: 'Concepto', className: 'max-w-[200px] truncate', render: (d) => d.concept ?? '—' },
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
      render: (d) => <span className="font-semibold tabular-nums">{formatMoney(d.current_balance)}</span>,
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
  ]

  return (
    <div className="p-6">
      <PageHeader title="Deudas" description="Cartera de deudas por cobrar" />

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
          setPage(1)
        }}
        hasActiveFilters={!!search || status !== ANY || overdue !== ANY || !!minBalance || !!maxBalance}
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
    </div>
  )
}
