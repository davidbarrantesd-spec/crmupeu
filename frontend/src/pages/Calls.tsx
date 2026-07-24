import { useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Phone, FileText, ListTree } from 'lucide-react'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useDebounce } from '@/hooks/useDebounce'
import { useEchoInvalidate } from '@/hooks/useEchoChannel'
import { formatDateTime, formatDuration, formatMoney, fullName } from '@/lib/format'
import type { ApiResource, Call, Paginated } from '@/types'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { AudioPlayer } from '@/components/shared/AudioPlayer'
import { JsonViewer } from '@/components/shared/JsonViewer'

const ANY = '__any__'

export default function Calls() {
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState(ANY)
  const [result, setResult] = useState(ANY)
  const [type, setType] = useState(ANY)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selected, setSelected] = useState<Call | null>(null)
  const debouncedSearch = useDebounce(search)

  const params: Record<string, unknown> = {
    page,
    per_page: 15,
    search: debouncedSearch || undefined,
    status: status === ANY ? undefined : status,
    result: result === ANY ? undefined : result,
    type: type === ANY ? undefined : type,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  }

  const { data, isLoading, isError, refetch } = useQuery({
    placeholderData: keepPreviousData,
    queryKey: ['calls', params],
    queryFn: async () => {
      const res = await api.get<Paginated<Call>>('/calls', { params })
      return res.data
    },
    refetchInterval: 15000,
  })

  useEchoInvalidate('calls', ['CallUpdated'], [['calls']])

  const { data: detail, isLoading: loadingDetail } = useQuery({
    placeholderData: keepPreviousData,
    queryKey: ['call', selected?.uuid],
    queryFn: async () => {
      const res = await api.get<ApiResource<Call>>(`/calls/${selected?.uuid}`)
      return res.data.data
    },
    enabled: !!selected,
  })

  const columns: Column<Call>[] = [
    {
      key: 'contact',
      header: 'Contacto',
      render: (c) =>
        c.contact ? (
          <Link
            to={`/contacts/${c.contact.uuid}`}
            className="font-medium text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {fullName(c.contact)}
          </Link>
        ) : (
          c.to ?? '—'
        ),
    },
    {
      key: 'campaign',
      header: 'Campaña',
      render: (c) => c.campaign?.name ?? <span className="text-muted-foreground">Manual</span>,
    },
    { key: 'type', header: 'Tipo', render: (c) => <Badge variant="secondary">{c.type}</Badge> },
    { key: 'status', header: 'Estado', render: (c) => <StatusBadge status={c.status} /> },
    { key: 'result', header: 'Resultado', render: (c) => (c.result ? <StatusBadge status={c.result} /> : '—') },
    {
      key: 'duration',
      header: 'Duración',
      render: (c) => <span className="tabular-nums">{formatDuration(c.duration)}</span>,
    },
    {
      key: 'cost',
      header: 'Costo',
      className: 'text-right',
      render: (c) => <span className="tabular-nums">{c.cost != null ? formatMoney(c.cost) : '—'}</span>,
    },
    { key: 'created_at', header: 'Fecha', render: (c) => formatDateTime(c.created_at) },
  ]

  return (
    <div className="p-6">
      <PageHeader title="Llamadas" description="Historial de llamadas realizadas y en curso" />

      <FilterBar
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Contacto, teléfono…"
        onClear={() => {
          setSearch('')
          setStatus(ANY)
          setResult(ANY)
          setType(ANY)
          setDateFrom('')
          setDateTo('')
          setPage(1)
        }}
        hasActiveFilters={!!search || status !== ANY || result !== ANY || type !== ANY || !!dateFrom || !!dateTo}
      >
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1) }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Todos los estados</SelectItem>
            <SelectItem value="queued">En cola</SelectItem>
            <SelectItem value="ringing">Timbrando</SelectItem>
            <SelectItem value="in_progress">En curso</SelectItem>
            <SelectItem value="answered">Contestada</SelectItem>
            <SelectItem value="no_answer">Sin respuesta</SelectItem>
            <SelectItem value="busy">Ocupado</SelectItem>
            <SelectItem value="failed">Fallida</SelectItem>
            <SelectItem value="voicemail">Buzón de voz</SelectItem>
          </SelectContent>
        </Select>
        <Select value={result} onValueChange={(v) => { setResult(v); setPage(1) }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Resultado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Todos los resultados</SelectItem>
            <SelectItem value="promise_to_pay">Promesa de pago</SelectItem>
            <SelectItem value="refused">Rechazó</SelectItem>
            <SelectItem value="callback_requested">Pidió rellamada</SelectItem>
            <SelectItem value="wrong_number">Número equivocado</SelectItem>
            <SelectItem value="transferred">Transferida</SelectItem>
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={(v) => { setType(v); setPage(1) }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Todos los tipos</SelectItem>
            <SelectItem value="recorded_audio">Audio grabado</SelectItem>
            <SelectItem value="tts">Texto a voz</SelectItem>
            <SelectItem value="ai_conversational">IA conversacional</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
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
        rowKey={(c) => c.uuid}
        onRowClick={setSelected}
        emptyTitle="Sin llamadas"
        emptyDescription="Aún no se registran llamadas con los filtros aplicados."
        emptyIcon={Phone}
      />

      {/* Drawer de detalle */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Detalle de llamada</SheetTitle>
            <SheetDescription>
              {selected?.contact ? fullName(selected.contact) : selected?.to} · {formatDateTime(selected?.created_at)}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-5 overflow-y-auto p-4">
            {loadingDetail && <Skeleton className="h-64 w-full" />}
            {detail && (
              <>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <InfoItem label="Estado" value={<StatusBadge status={detail.status} />} />
                  <InfoItem label="Resultado" value={detail.result ? <StatusBadge status={detail.result} /> : '—'} />
                  <InfoItem label="Tipo" value={detail.type} />
                  <InfoItem label="Campaña" value={detail.campaign?.name ?? 'Manual'} />
                  <InfoItem label="Duración" value={formatDuration(detail.duration)} />
                  <InfoItem label="Costo" value={detail.cost != null ? formatMoney(detail.cost) : '—'} />
                  <InfoItem label="Contestada" value={formatDateTime(detail.answered_at)} />
                  <InfoItem label="Finalizada" value={formatDateTime(detail.ended_at)} />
                </div>

                {!!detail.recordings?.length && hasPermission('recordings.listen') && (
                  <div>
                    <p className="mb-2 text-sm font-semibold">Grabación</p>
                    <AudioPlayer
                      getUrl={async () => {
                        const res = await api.get<ApiResource<{ url: string }>>(`/calls/${detail.uuid}/recording-url`)
                        return res.data.data.url
                      }}
                    />
                  </div>
                )}

                {detail.summary && (
                  <div>
                    <p className="mb-1 text-sm font-semibold">Resumen</p>
                    <p className="rounded-lg border bg-muted/40 p-3 text-sm">{detail.summary}</p>
                  </div>
                )}

                {detail.transcription && hasPermission('transcriptions.view') && (
                  <div>
                    <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
                      <FileText className="h-4 w-4" />
                      Transcripción
                    </p>
                    <p className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border p-3 text-sm text-muted-foreground">
                      {typeof detail.transcription === 'string'
                        ? detail.transcription
                        : detail.transcription.text ?? JSON.stringify(detail.transcription, null, 2)}
                    </p>
                  </div>
                )}

                {detail.structured_result && (
                  <div>
                    <p className="mb-1 text-sm font-semibold">Resultado estructurado</p>
                    <JsonViewer data={detail.structured_result} />
                  </div>
                )}

                {!!detail.events?.length && (
                  <div>
                    <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                      <ListTree className="h-4 w-4" />
                      Eventos
                    </p>
                    <div className="space-y-2">
                      {detail.events.map((ev, i) => (
                        <div key={ev.id ?? i} className="flex items-start justify-between rounded-md border px-3 py-2 text-sm">
                          <span className="font-medium">{ev.event ?? ev.type ?? 'evento'}</span>
                          <span className="text-xs text-muted-foreground">{formatDateTime(ev.at ?? ev.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function InfoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-0.5 font-medium">{value}</div>
    </div>
  )
}
