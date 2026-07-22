import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, subDays } from 'date-fns'
import { toast } from 'sonner'
import { BarChart3, Download, FileSpreadsheet } from 'lucide-react'
import { api, apiErrorMessage, downloadFile } from '@/api/client'
import { useDebounce } from '@/hooks/useDebounce'
import type { Paginated } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { formatMoney } from '@/lib/format'

type ReportRow = Record<string, unknown>

const REPORTS = [
  { key: 'calls', label: 'Llamadas' },
  { key: 'agreements', label: 'Acuerdos' },
  { key: 'campaigns', label: 'Campañas' },
  { key: 'advisors', label: 'Asesores' },
] as const

const COLUMN_LABELS: Record<string, string> = {
  date: 'Fecha',
  day: 'Día',
  campaign: 'Campaña',
  campaign_name: 'Campaña',
  advisor: 'Asesor',
  advisor_name: 'Asesor',
  user: 'Usuario',
  name: 'Nombre',
  total: 'Total',
  total_calls: 'Llamadas',
  answered: 'Contestadas',
  no_answer: 'Sin respuesta',
  failed: 'Fallidas',
  answered_rate: 'Tasa respuesta',
  avg_duration: 'Duración prom.',
  total_duration: 'Duración total',
  total_cost: 'Costo total',
  cost: 'Costo',
  agreements: 'Acuerdos',
  agreements_total: 'Acuerdos',
  fulfilled: 'Cumplidos',
  broken: 'Incumplidos',
  pending: 'Pendientes',
  amount: 'Monto',
  total_amount: 'Monto total',
  recovered: 'Recuperado',
  contacts: 'Contactos',
  contacted: 'Contactados',
  conversion_rate: 'Conversión',
  status: 'Estado',
  type: 'Tipo',
  messages: 'Mensajes',
  follow_ups: 'Seguimientos',
}

function isMoneyKey(key: string) {
  return /cost|amount|recovered|debt|balance/.test(key)
}

export default function Reports() {
  const [tab, setTab] = useState<string>('calls')
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)

  const params: Record<string, unknown> = {
    date_from: dateFrom,
    date_to: dateTo,
    search: debouncedSearch || undefined,
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['reports', tab, params],
    queryFn: async () => {
      const res = await api.get<Paginated<ReportRow> | { data: ReportRow[] }>(`/reports/${tab}`, { params })
      return res.data.data
    },
  })

  const handleExport = async (fmt: 'csv' | 'xlsx') => {
    try {
      await downloadFile(`/reports/${tab}`, `reporte-${tab}.${fmt}`, { ...params, export: fmt })
      toast.success('Reporte exportado')
    } catch (e) {
      toast.error(apiErrorMessage(e))
    }
  }

  const rows = data ?? []
  const columns = rows.length ? Object.keys(rows[0]).filter((k) => typeof rows[0][k] !== 'object') : []

  return (
    <div className="p-6">
      <PageHeader
        title="Reportes"
        description="Análisis de desempeño de la operación"
        actions={
          <>
            <Button variant="outline" onClick={() => handleExport('csv')}>
              <Download />
              CSV
            </Button>
            <Button variant="outline" onClick={() => handleExport('xlsx')}>
              <FileSpreadsheet />
              Excel
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-auto" />
        <span className="text-sm text-muted-foreground">a</span>
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-auto" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filtrar…" className="w-48" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {REPORTS.map((r) => (
            <TabsTrigger key={r.key} value={r.key}>
              {r.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {REPORTS.map((r) => (
          <TabsContent key={r.key} value={r.key}>
            {isLoading && <Skeleton className="h-80 w-full" />}
            {isError && (
              <EmptyState
                title="Error al cargar el reporte"
                description="No se pudo obtener la información."
                action={<Button variant="outline" onClick={() => refetch()}>Reintentar</Button>}
              />
            )}
            {!isLoading && !isError && !rows.length && (
              <EmptyState icon={BarChart3} title="Sin datos" description="No hay información para el rango seleccionado." />
            )}
            {!isLoading && !isError && rows.length > 0 && (
              <div className="rounded-lg border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {columns.map((c) => (
                        <TableHead key={c}>{COLUMN_LABELS[c] ?? c.replace(/_/g, ' ')}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, i) => (
                      <TableRow key={i}>
                        {columns.map((c) => {
                          const v = row[c]
                          return (
                            <TableCell key={c} className={isMoneyKey(c) ? 'text-right tabular-nums' : undefined}>
                              {c === 'status' && typeof v === 'string' ? (
                                <StatusBadge status={v} />
                              ) : isMoneyKey(c) && (typeof v === 'number' || typeof v === 'string') ? (
                                formatMoney(v)
                              ) : v === null || v === undefined ? (
                                '—'
                              ) : (
                                String(v)
                              )}
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
