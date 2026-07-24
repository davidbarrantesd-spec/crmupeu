import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Ban,
  Download,
  Eye,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Trash2,
  Upload,
  Users,
  PhoneOff,
  ArrowDownWideNarrow,
} from 'lucide-react'
import { api, apiErrorMessage, downloadFile } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useDebounce } from '@/hooks/useDebounce'
import { catalogName, formatMoney, fullName } from '@/lib/format'
import type { Contact, Paginated } from '@/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { SegmentBadge } from '@/components/shared/SegmentBadge'
import {
  AcademicFilters,
  academicFilterParams,
  hasAcademicFilters,
  type AcademicFilterValues,
} from '@/components/shared/AcademicFilters'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { ContactFormDialog } from '@/components/contacts/ContactFormDialog'
import { CallDialog } from '@/components/contacts/CallDialog'

const ANY = '__any__'

export default function Contacts() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const [searchParams] = useSearchParams()

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState(ANY)
  const [segment, setSegment] = useState('')
  const [city, setCity] = useState('')
  const [tag, setTag] = useState('')
  const [hasDebt, setHasDebt] = useState(ANY)
  const [doNotContact, setDoNotContact] = useState(ANY)
  const [academic, setAcademic] = useState<AcademicFilterValues>(() => ({
    payment_segment: searchParams.get('payment_segment') ?? '',
    campus_id: searchParams.get('campus_id') ?? '',
    faculty_id: searchParams.get('faculty_id') ?? '',
    career_id: searchParams.get('career_id') ?? '',
    academic_period: searchParams.get('academic_period') ?? '',
  }))
  const [sortByDebt, setSortByDebt] = useState(false)
  const [sort, setSort] = useState('')

  const debouncedSearch = useDebounce(search)
  const debouncedSegment = useDebounce(segment)
  const debouncedCity = useDebounce(city)
  const debouncedTag = useDebounce(tag)

  const [formOpen, setFormOpen] = useState(false)
  const [editContact, setEditContact] = useState<Contact | null>(null)
  const [callContact, setCallContact] = useState<Contact | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null)

  const params: Record<string, unknown> = {
    page,
    per_page: 15,
    search: debouncedSearch || undefined,
    status: status === ANY ? undefined : status,
    segment: debouncedSegment || undefined,
    city: debouncedCity || undefined,
    tag: debouncedTag || undefined,
    has_debt: hasDebt === ANY ? undefined : hasDebt,
    do_not_contact: doNotContact === ANY ? undefined : doNotContact,
    ...academicFilterParams(academic),
    sort: sortByDebt ? 'total_debt' : sort || undefined,
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['contacts', params],
    queryFn: async () => {
      const res = await api.get<Paginated<Contact>>('/contacts', { params })
      return res.data
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (uuid: string) => api.delete(`/contacts/${uuid}`),
    onSuccess: () => {
      toast.success('Contacto eliminado')
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  const handleExport = async () => {
    try {
      await downloadFile('/contacts/export', 'contactos.csv', params, 'post')
      toast.success('Exportación descargada')
    } catch (e) {
      toast.error(apiErrorMessage(e))
    }
  }

  const hasActiveFilters =
    !!search ||
    status !== ANY ||
    !!segment ||
    !!city ||
    !!tag ||
    hasDebt !== ANY ||
    doNotContact !== ANY ||
    hasAcademicFilters(academic) ||
    sortByDebt

  const clearFilters = () => {
    setSearch('')
    setStatus(ANY)
    setSegment('')
    setCity('')
    setTag('')
    setHasDebt(ANY)
    setDoNotContact(ANY)
    setAcademic({})
    setSortByDebt(false)
    setPage(1)
  }

  const columns: Column<Contact>[] = [
    {
      key: 'first_name',
      header: 'Contacto',
      sortable: true,
      render: (c) => (
        <div>
          <p className="font-medium">
            {fullName(c)}
            {c.do_not_contact && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Ban className="ml-1.5 inline h-3.5 w-3.5 text-destructive" />
                </TooltipTrigger>
                <TooltipContent>No contactar{c.do_not_contact_reason ? `: ${c.do_not_contact_reason}` : ''}</TooltipContent>
              </Tooltip>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {c.dni ? `DNI ${c.dni}` : c.internal_code ?? '—'}
          </p>
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'Teléfono',
      render: (c) => (
        <div className="text-sm">
          <p>{c.phone ?? '—'}</p>
          {c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}
        </div>
      ),
    },
    {
      key: 'career',
      header: 'Carrera',
      render: (c) => (
        <div>
          <p className="text-sm">{catalogName(c.career)}</p>
          <p className="text-xs text-muted-foreground">{catalogName(c.campus) !== '—' ? catalogName(c.campus) : ''}</p>
        </div>
      ),
    },
    {
      key: 'payment_segment',
      header: 'Segmento',
      render: (c) =>
        c.payment_segment ? (
          <SegmentBadge segment={c.payment_segment} />
        ) : c.segment ? (
          <Badge variant="secondary">{c.segment}</Badge>
        ) : (
          '—'
        ),
    },
    {
      key: 'tags',
      header: 'Etiquetas',
      render: (c) => (
        <div className="flex max-w-[180px] flex-wrap gap-1">
          {(c.tags ?? []).slice(0, 3).map((t, i) => {
            const name = typeof t === 'string' ? t : t.name
            return (
              <Badge key={i} variant="outline" className="text-xs">
                {name}
              </Badge>
            )
          })}
          {(c.tags?.length ?? 0) > 3 && <Badge variant="muted">+{(c.tags?.length ?? 0) - 3}</Badge>}
        </div>
      ),
    },
    {
      key: 'consents',
      header: 'Consentimientos',
      render: (c) => (
        <div className="flex gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              {c.call_consent ? <Phone className="h-4 w-4 text-emerald-500" /> : <PhoneOff className="h-4 w-4 text-muted-foreground" />}
            </TooltipTrigger>
            <TooltipContent>{c.call_consent ? 'Consiente llamadas' : 'Sin consentimiento de llamadas'}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <MessageCircle className={`h-4 w-4 ${c.whatsapp_consent ? 'text-green-500' : 'text-muted-foreground opacity-40'}`} />
            </TooltipTrigger>
            <TooltipContent>{c.whatsapp_consent ? 'Consiente WhatsApp' : 'Sin consentimiento de WhatsApp'}</TooltipContent>
          </Tooltip>
        </div>
      ),
    },
    {
      key: 'total_debt',
      header: 'Deuda',
      className: 'text-right',
      render: (c) => {
        const total =
          c.total_pending ??
          c.total_debt ??
          (c.debts ?? []).reduce((acc, d) => acc + parseFloat(String(d.current_balance ?? 0)), 0)
        return <span className="font-medium tabular-nums">{formatMoney(total)}</span>
      },
    },
    { key: 'status', header: 'Estado', render: (c) => <StatusBadge status={c.status} /> },
    {
      key: 'actions',
      header: '',
      className: 'w-10',
      render: (c) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="iconSm" onClick={(e) => e.stopPropagation()}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onSelect={() => navigate(`/contacts/${c.uuid}`)}>
              <Eye />
              Ver ficha
            </DropdownMenuItem>
            {hasPermission('contacts.edit') && (
              <DropdownMenuItem
                onSelect={() => {
                  setEditContact(c)
                  setFormOpen(true)
                }}
              >
                <Pencil />
                Editar
              </DropdownMenuItem>
            )}
            {hasPermission('calls.create') && !c.do_not_contact && (
              <DropdownMenuItem onSelect={() => setCallContact(c)}>
                <Phone />
                Llamar
              </DropdownMenuItem>
            )}
            {hasPermission('whatsapp.reply') && !c.do_not_contact && (
              <DropdownMenuItem onSelect={() => navigate(`/whatsapp?contact=${c.uuid}`)}>
                <MessageCircle />
                WhatsApp
              </DropdownMenuItem>
            )}
            {hasPermission('contacts.delete') && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleteTarget(c)}>
                  <Trash2 />
                  Eliminar
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <div className="p-6">
      <PageHeader
        title="Contactos"
        description="Directorio de deudores y contactos de la cartera"
        actions={
          <>
            {hasPermission('contacts.create') && (
              <Button variant="outline" onClick={() => navigate('/contacts/import')}>
                <Upload />
                Importar
              </Button>
            )}
            {hasPermission('contacts.export') && (
              <Button variant="outline" onClick={handleExport}>
                <Download />
                Exportar
              </Button>
            )}
            {hasPermission('contacts.create') && (
              <Button
                onClick={() => {
                  setEditContact(null)
                  setFormOpen(true)
                }}
              >
                <Plus />
                Nuevo contacto
              </Button>
            )}
          </>
        }
      />

      <FilterBar
        search={search}
        onSearchChange={(v) => {
          setSearch(v)
          setPage(1)
        }}
        searchPlaceholder="Nombre, DNI, teléfono…"
        onClear={clearFilters}
        hasActiveFilters={hasActiveFilters}
      >
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1) }}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Todos</SelectItem>
            <SelectItem value="active">Activo</SelectItem>
            <SelectItem value="inactive">Inactivo</SelectItem>
          </SelectContent>
        </Select>
        <Input value={segment} onChange={(e) => { setSegment(e.target.value); setPage(1) }} placeholder="Segmento" className="w-32" />
        <Input value={city} onChange={(e) => { setCity(e.target.value); setPage(1) }} placeholder="Ciudad" className="w-32" />
        <Input value={tag} onChange={(e) => { setTag(e.target.value); setPage(1) }} placeholder="Etiqueta" className="w-32" />
        <Select value={hasDebt} onValueChange={(v) => { setHasDebt(v); setPage(1) }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Deuda" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Con o sin deuda</SelectItem>
            <SelectItem value="1">Con deuda</SelectItem>
            <SelectItem value="0">Sin deuda</SelectItem>
          </SelectContent>
        </Select>
        <Select value={doNotContact} onValueChange={(v) => { setDoNotContact(v); setPage(1) }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="No contactar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Todos</SelectItem>
            <SelectItem value="1">No contactar</SelectItem>
            <SelectItem value="0">Contactables</SelectItem>
          </SelectContent>
        </Select>
        <AcademicFilters
          value={academic}
          onChange={(v) => { setAcademic(v); setPage(1) }}
          fields={['campus_id', 'faculty_id', 'career_id', 'academic_level_id', 'modality', 'payment_segment', 'enrollment_status']}
        />
        <Button
          variant={sortByDebt ? 'default' : 'outline'}
          size="sm"
          onClick={() => { setSortByDebt((v) => !v); setPage(1) }}
          title="Ordenar por deuda total descendente"
        >
          <ArrowDownWideNarrow />
          Más deudores primero
        </Button>
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
        rowKey={(c) => c.uuid}
        onRowClick={(c) => navigate(`/contacts/${c.uuid}`)}
        emptyTitle="Sin contactos"
        emptyDescription="Crea un contacto o importa tu cartera para comenzar."
        emptyIcon={Users}
      />

      <ContactFormDialog open={formOpen} onOpenChange={setFormOpen} contact={editContact} />
      <CallDialog contact={callContact} open={!!callContact} onOpenChange={(o) => !o && setCallContact(null)} />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Eliminar contacto"
        description={`¿Seguro que deseas eliminar a ${fullName(deleteTarget)}? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        destructive
        onConfirm={async () => {
          if (deleteTarget) await deleteMutation.mutateAsync(deleteTarget.uuid)
        }}
      />
    </div>
  )
}
