import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ScrollText } from 'lucide-react'
import { api } from '@/api/client'
import { formatDateTime } from '@/lib/format'
import type { AuditLog, Paginated, User } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { JsonViewer } from '@/components/shared/JsonViewer'

const ANY = '__any__'

const MODULES = [
  'contacts',
  'debts',
  'campaigns',
  'calls',
  'prompts',
  'agreements',
  'follow_ups',
  'whatsapp',
  'users',
  'roles',
  'settings',
  'imports',
]

const ACTION_VARIANTS: Record<string, 'success' | 'info' | 'danger' | 'warning' | 'secondary'> = {
  created: 'success',
  create: 'success',
  updated: 'info',
  update: 'info',
  deleted: 'danger',
  delete: 'danger',
  login: 'secondary',
  logout: 'secondary',
  exported: 'warning',
  listened: 'warning',
}

export default function Audit() {
  const [page, setPage] = useState(1)
  const [module, setModule] = useState(ANY)
  const [action, setAction] = useState(ANY)
  const [user, setUser] = useState(ANY)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selected, setSelected] = useState<AuditLog | null>(null)

  const { data: users } = useQuery({
    queryKey: ['users', 'audit-filter'],
    queryFn: async () => {
      const res = await api.get<Paginated<User>>('/users', { params: { per_page: 100 } })
      return res.data.data
    },
  })

  const params: Record<string, unknown> = {
    page,
    per_page: 20,
    module: module === ANY ? undefined : module,
    action: action === ANY ? undefined : action,
    user: user === ANY ? undefined : user,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['audit-logs', params],
    queryFn: async () => {
      const res = await api.get<Paginated<AuditLog>>('/audit-logs', { params })
      return res.data
    },
  })

  const columns: Column<AuditLog>[] = [
    { key: 'created_at', header: 'Fecha', render: (l) => <span className="whitespace-nowrap">{formatDateTime(l.created_at)}</span> },
    { key: 'user', header: 'Usuario', render: (l) => l.user?.name ?? <span className="text-muted-foreground">Sistema</span> },
    {
      key: 'action',
      header: 'Acción',
      render: (l) => <Badge variant={ACTION_VARIANTS[l.action] ?? 'secondary'}>{l.action}</Badge>,
    },
    { key: 'module', header: 'Módulo', render: (l) => l.module ?? '—' },
    {
      key: 'entity',
      header: 'Entidad',
      render: (l) => (
        <span className="font-mono text-xs text-muted-foreground">
          {l.entity_type ? `${l.entity_type.split('\\').pop()} ` : ''}
          {l.entity_uuid ? l.entity_uuid.slice(0, 8) : '—'}
        </span>
      ),
    },
    { key: 'ip_address', header: 'IP', render: (l) => l.ip_address ?? '—' },
  ]

  return (
    <div className="p-6">
      <PageHeader title="Auditoría" description="Registro de acciones realizadas en el sistema" />

      <FilterBar
        onClear={() => {
          setModule(ANY)
          setAction(ANY)
          setUser(ANY)
          setDateFrom('')
          setDateTo('')
          setPage(1)
        }}
        hasActiveFilters={module !== ANY || action !== ANY || user !== ANY || !!dateFrom || !!dateTo}
      >
        <Select value={module} onValueChange={(v) => { setModule(v); setPage(1) }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Módulo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Todos los módulos</SelectItem>
            {MODULES.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={action} onValueChange={(v) => { setAction(v); setPage(1) }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Acción" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Todas las acciones</SelectItem>
            <SelectItem value="created">Creación</SelectItem>
            <SelectItem value="updated">Actualización</SelectItem>
            <SelectItem value="deleted">Eliminación</SelectItem>
            <SelectItem value="login">Inicio de sesión</SelectItem>
            <SelectItem value="exported">Exportación</SelectItem>
            <SelectItem value="listened">Escucha de grabación</SelectItem>
          </SelectContent>
        </Select>
        <Select value={user} onValueChange={(v) => { setUser(v); setPage(1) }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Usuario" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Todos los usuarios</SelectItem>
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
        rowKey={(l) => String(l.uuid ?? l.id ?? Math.random())}
        onRowClick={setSelected}
        emptyTitle="Sin registros"
        emptyDescription="No hay eventos de auditoría con los filtros aplicados."
        emptyIcon={ScrollText}
      />

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Detalle de auditoría</SheetTitle>
            <SheetDescription>
              {selected?.user?.name ?? 'Sistema'} · {selected?.action} · {formatDateTime(selected?.created_at)}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Módulo</p>
                <p className="font-medium">{selected?.module ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Entidad</p>
                <p className="break-all font-mono text-xs">{selected?.entity_uuid ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">IP</p>
                <p className="font-medium">{selected?.ip_address ?? '—'}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <p className="mb-1 text-sm font-semibold text-destructive">Valores anteriores</p>
                <JsonViewer data={selected?.old_values ?? null} />
              </div>
              <div>
                <p className="mb-1 text-sm font-semibold text-emerald-600">Valores nuevos</p>
                <JsonViewer data={selected?.new_values ?? null} />
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
