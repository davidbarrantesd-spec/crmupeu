import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  ExternalLink,
  Gauge,
  GraduationCap,
  Landmark,
  Search,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
} from 'recharts'
import { api } from '@/api/client'
import { catalogName, formatMoney, formatNumber, formatPercent, fullName } from '@/lib/format'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { ChartCard, tooltipStyle } from '@/components/shared/ChartCard'
import { RatingBadge, RATING_ORDER, ratingColorHex, ratingLabel, ratingSoftBg } from '@/components/shared/RatingBadge'
import { BehaviorBadge } from '@/components/shared/BehaviorBadge'
import { ScoreIndicator, TrendArrow } from '@/components/shared/ScoreIndicator'
import {
  AcademicFilters,
  academicFilterParams,
  hasAcademicFilters,
  type AcademicFilterValues,
} from '@/components/shared/AcademicFilters'
import { DrillDownModal } from '@/components/analytics/DrillDownModal'
import { AcademicPanorama } from '@/components/analytics/AcademicPanorama'
import { useDebounce } from '@/hooks/useDebounce'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import type {
  ApiResource,
  Contact,
  CreditAnalysis,
  Paginated,
  PaymentTimelineEntry,
  RatingStat,
} from '@/types'

export default function Analytics() {
  return (
    <div className="p-6">
      <PageHeader title="Análisis de cartera" description="Inteligencia de cobranza estilo central de riesgo" />
      <Tabs defaultValue="credit">
        <TabsList>
          <TabsTrigger value="credit">
            <Landmark className="h-4 w-4" />
            Riesgo crediticio
          </TabsTrigger>
          <TabsTrigger value="academic">
            <GraduationCap className="h-4 w-4" />
            Panorama académico
          </TabsTrigger>
        </TabsList>
        <TabsContent value="credit">
          <CreditRiskTab />
        </TabsContent>
        <TabsContent value="academic">
          <AcademicPanorama />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ————————————————————————————————————————————————————————————————
// Tab 1: Riesgo crediticio
// ————————————————————————————————————————————————————————————————

interface DrillState {
  title: string
  params: Record<string, string>
}

function CreditRiskTab() {
  const [filters, setFilters] = useState<AcademicFilterValues>({})
  const [drill, setDrill] = useState<DrillState | null>(null)

  const { data, isLoading, isError, error, refetch } = useQuery({
    placeholderData: keepPreviousData,
    queryKey: ['dashboard', 'credit', filters],
    queryFn: async () => {
      const res = await api.get<ApiResource<CreditAnalysis>>('/dashboard/credit', {
        params: academicFilterParams(filters),
      })
      return res.data.data
    },
  })

  const kpis = data?.kpis
  const byRating = useMemo(() => sortByRating(data?.by_rating ?? []), [data?.by_rating])

  const openDrill = (rating: RatingStat) =>
    setDrill({
      title: `Estudiantes en ${rating.label || ratingLabel(rating.rating)}`,
      params: { credit_rating: String(rating.rating) },
    })

  return (
    <div>
      {/* Buscador de estudiante — informe crediticio inline */}
      <StudentReportSection byRating={byRating} />

      {/* Filtros */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <AcademicFilters value={filters} onChange={setFilters} fields={['campus_id', 'faculty_id', 'career_id']} />
        {hasAcademicFilters(filters) && (
          <Button variant="ghost" size="sm" onClick={() => setFilters({})}>
            Limpiar filtros
          </Button>
        )}
      </div>

      {isError && (
        <ErrorState title="No se pudo cargar el análisis crediticio" error={error} onRetry={() => refetch()} />
      )}

      {/* KPIs */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {isLoading && Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        {!isLoading && kpis && (
          <>
            <KpiCard label="Cartera total" icon={Wallet} iconClass="text-indigo-500">
              <p className="mt-2 text-xl font-bold tracking-tight">{formatMoney(kpis.cartera_total)}</p>
            </KpiCard>
            <KpiCard label="Cartera en riesgo" icon={AlertTriangle} iconClass="text-red-500">
              <p className="mt-2 text-xl font-bold tracking-tight">{formatMoney(kpis.cartera_en_riesgo)}</p>
              <p className="text-xs font-semibold text-red-500">{formatPercent(kpis.pct_en_riesgo)} de la cartera</p>
            </KpiCard>
            <KpiCard label="Pérdida esperada" icon={Banknote} iconClass="text-amber-500">
              <p className="mt-2 text-xl font-bold tracking-tight">{formatMoney(kpis.perdida_esperada)}</p>
              <p className="text-xs text-muted-foreground">provisión estimada SBS</p>
            </KpiCard>
            <KpiCard label="Score promedio" icon={Gauge} iconClass="text-emerald-500">
              <div className="mt-2">
                <ScoreIndicator score={kpis.avg_score} size="lg" />
              </div>
            </KpiCard>
            <KpiCard label="Estudiantes calificados" icon={Users} iconClass="text-sky-500">
              <p className="mt-2 text-xl font-bold tracking-tight">{formatNumber(kpis.students_rated)}</p>
            </KpiCard>
          </>
        )}
      </div>

      {/* Clasificación de la cartera (SBS) */}
      <div className="mt-6">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Landmark className="h-4 w-4 text-primary" />
          Clasificación de la cartera (SBS)
        </h3>
        <p className="text-sm text-muted-foreground">
          Haz clic en una calificación para ver a los estudiantes del grupo
        </p>

        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {isLoading && Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
          {!isLoading &&
            byRating.map((r) => (
              <button
                key={r.rating}
                type="button"
                className="cursor-pointer rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent"
                onClick={() => openDrill(r)}
                title={`Ver estudiantes en ${r.label || ratingLabel(r.rating)}`}
              >
                <RatingBadge rating={r.rating} />
                <p className="mt-2 text-xl font-bold tabular-nums">{formatNumber(r.count)}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {formatMoney(r.amount)} · {formatPercent(r.pct_amount)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Provisión: {formatPercent(r.provision_rate)}</p>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  Pérdida esp.: {formatMoney(r.expected_loss)}
                </p>
              </button>
            ))}
        </div>

        {/* Barra apilada: proporción de cartera por calificación */}
        {!isLoading && byRating.length > 0 && (
          <div className="mt-3">
            <div className="flex h-4 w-full overflow-hidden rounded-full border">
              {byRating
                .filter((r) => Number(r.pct_amount) > 0)
                .map((r) => (
                  <div
                    key={r.rating}
                    className="h-full"
                    style={{ width: `${r.pct_amount}%`, backgroundColor: ratingColorHex(r.rating) }}
                    title={`${r.label || ratingLabel(r.rating)}: ${formatMoney(r.amount)} (${formatPercent(r.pct_amount)})`}
                  />
                ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {byRating.map((r) => (
                <span key={r.rating} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: ratingColorHex(r.rating) }} />
                  {r.label || ratingLabel(r.rating)} ({formatPercent(r.pct_amount)})
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Estrategia recomendada por grupo */}
      <div className="mt-6">
        <h3 className="text-base font-semibold">Estrategia recomendada por grupo</h3>
        <p className="text-sm text-muted-foreground">Acciones de cobranza sugeridas según la calificación</p>
        <div className="mt-3 space-y-3">
          {isLoading && Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
          {!isLoading &&
            byRating.map((r) => (
              <Card key={r.rating}>
                <CardContent className="flex flex-wrap items-center gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <RatingBadge rating={r.rating} />
                      <PriorityBadge priority={r.strategy?.prioridad} />
                      <span className="font-semibold">{r.strategy?.titulo ?? '—'}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{r.strategy?.detalle ?? '—'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Canal: <span className="font-medium text-foreground">{r.strategy?.canal ?? '—'}</span>
                      {r.strategy?.campana ? (
                        <>
                          {' '}· Campaña sugerida: <span className="font-medium text-foreground">{r.strategy.campana}</span>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold tabular-nums">{formatNumber(r.count)}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{formatMoney(r.amount)}</p>
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => openDrill(r)}>
                      Ver estudiantes
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      </div>

      {/* Matriz calificación × año + recuperación por ciclo */}
      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Calificación × año de carrera</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {isLoading ? (
              <Skeleton className="mx-6 mb-6 h-[240px]" />
            ) : !data?.rating_by_year?.length ? (
              <EmptyState title="Sin datos" description="No hay información para los filtros seleccionados." className="h-[240px] py-0" />
            ) : (
              <RatingByYearMatrix rows={data.rating_by_year} />
            )}
          </CardContent>
        </Card>

        <ChartCard title="Facturado vs Recuperado por ciclo" loading={isLoading} empty={!data?.recovery_by_period?.length}>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={data?.recovery_by_period ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="period" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis yAxisId="left" stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatNumber(v)} />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="var(--muted-foreground)"
                fontSize={11}
                tickFormatter={(v) => `${v}%`}
                domain={[0, 100]}
              />
              <RechartsTooltip
                contentStyle={tooltipStyle}
                formatter={(v, name) =>
                  name === 'Tasa de recuperación' ? [formatPercent(Number(v)), name] : [formatMoney(Number(v)), name]
                }
              />
              <Legend />
              <Bar yAxisId="left" dataKey="billed" name="Facturado" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="left" dataKey="recovered" name="Recuperado" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="recovery_rate"
                name="Tasa de recuperación"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Drill-down: nunca salimos de la página */}
      <DrillDownModal
        open={!!drill}
        onOpenChange={(open) => !open && setDrill(null)}
        title={drill?.title ?? ''}
        params={drill?.params ?? {}}
      />
    </div>
  )
}

function KpiCard({
  label,
  icon: Icon,
  iconClass,
  children,
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  iconClass: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <Icon className={`h-4 w-4 ${iconClass}`} />
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

function sortByRating(rows: RatingStat[]): RatingStat[] {
  const idx = (r: string) => {
    const i = RATING_ORDER.indexOf(r)
    return i === -1 ? RATING_ORDER.length : i
  }
  return [...rows].sort((a, b) => idx(String(a.rating)) - idx(String(b.rating)))
}

/** Badge de prioridad de la estrategia: baja=gris, media=azul, alta=naranja, crítica=rojo. */
const PRIORITY_MAP: Record<string, { label: string; className: string }> = {
  baja: { label: 'Baja', className: 'border-transparent bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  media: { label: 'Media', className: 'border-transparent bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' },
  alta: { label: 'Alta', className: 'border-transparent bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300' },
  critica: { label: 'Crítica', className: 'border-transparent bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300' },
  crítica: { label: 'Crítica', className: 'border-transparent bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300' },
}

function PriorityBadge({ priority }: { priority: string | null | undefined }) {
  if (!priority) return null
  const entry = PRIORITY_MAP[priority.toLowerCase()]
  if (!entry) return <Badge variant="secondary">{priority}</Badge>
  return <Badge className={entry.className}>Prioridad {entry.label.toLowerCase()}</Badge>
}

// ————————————————————————————————————————————————————————————————
// Matriz calificación × año
// ————————————————————————————————————————————————————————————————

const YEARS = [1, 2, 3, 4, 5]

function RatingByYearMatrix({ rows }: { rows: CreditAnalysis['rating_by_year'] }) {
  const ratings = RATING_ORDER.filter((r) => rows.some((row) => row.credit_rating === r))
  const extra = Array.from(new Set(rows.map((r) => String(r.credit_rating)))).filter((r) => !RATING_ORDER.includes(r))
  const allRatings = [...ratings, ...extra]
  const cell = (rating: string, year: number) =>
    rows.find((r) => String(r.credit_rating) === rating && Number(r.year) === year)

  return (
    <div className="overflow-x-auto pb-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="px-4 py-2 font-medium">Calificación</th>
            {YEARS.map((y) => (
              <th key={y} className="px-2 py-2 text-center font-medium">
                Año {y}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allRatings.map((r) => (
            <tr key={r} className="border-b last:border-b-0">
              <td className="px-4 py-2">
                <RatingBadge rating={r} />
              </td>
              {YEARS.map((y) => {
                const c = cell(r, y)
                return (
                  <td
                    key={y}
                    className={`px-2 py-2 text-center ${c ? ratingSoftBg(r) : ''}`}
                    title={c ? `${ratingLabel(r)} · Año ${y}: ${formatNumber(c.count)} estudiantes` : undefined}
                  >
                    {c ? (
                      <span className="font-semibold tabular-nums">{formatNumber(c.count)}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ————————————————————————————————————————————————————————————————
// Buscador de estudiante + informe crediticio inline
// ————————————————————————————————————————————————————————————————

type ContactWithTimeline = Contact & { payment_timeline: PaymentTimelineEntry[] }

const TIMELINE_STATUS: Record<string, { label: string; className: string }> = {
  a_tiempo: { label: 'A tiempo', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300' },
  tarde: { label: 'Tarde', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300' },
  vencido: { label: 'Vencido', className: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300' },
  pendiente: { label: 'Pendiente', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' },
}

function StudentReportSection({ byRating }: { byRating: RatingStat[] }) {
  const [search, setSearch] = useState('')
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null)
  const debouncedSearch = useDebounce(search, 300)

  const { data: results, isFetching: searching } = useQuery({
    queryKey: ['analytics', 'student-search', debouncedSearch],
    queryFn: async () => {
      const res = await api.get<Paginated<Contact>>('/contacts', {
        params: { search: debouncedSearch, per_page: 8 },
      })
      return res.data.data
    },
    enabled: debouncedSearch.trim().length >= 2 && !selectedUuid,
  })

  const { data: report, isLoading: loadingReport, isError: reportError, error: reportErrorObj, refetch: refetchReport } = useQuery({
    queryKey: ['analytics', 'student-report', selectedUuid],
    queryFn: async () => {
      // payment_timeline viene al mismo nivel que "data" en la respuesta
      const res = await api.get<ApiResource<Contact> & { payment_timeline?: PaymentTimelineEntry[] }>(
        `/contacts/${selectedUuid}`,
      )
      return { ...res.data.data, payment_timeline: res.data.payment_timeline ?? [] } as ContactWithTimeline
    },
    enabled: !!selectedUuid,
  })

  const showDropdown = !selectedUuid && debouncedSearch.trim().length >= 2

  return (
    <section>
      <h3 className="flex items-center gap-2 text-base font-semibold">
        <Search className="h-4 w-4 text-primary" />
        Consultar historial de un estudiante
      </h3>
      <p className="text-sm text-muted-foreground">
        Busca por nombre, DNI o código y revisa su informe crediticio sin salir del dashboard
      </p>

      <div className="relative mt-3 max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setSelectedUuid(null)
          }}
          placeholder="Nombre, DNI o código de estudiante…"
          className="pl-9"
        />
        {showDropdown && (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-lg">
            {searching && <p className="px-3 py-2 text-sm text-muted-foreground">Buscando…</p>}
            {!searching && !results?.length && (
              <p className="px-3 py-2 text-sm text-muted-foreground">Sin resultados para “{debouncedSearch}”</p>
            )}
            {(results ?? []).map((c) => (
              <button
                key={c.uuid}
                type="button"
                className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                onClick={() => setSelectedUuid(c.uuid)}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{fullName(c)}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[c.dni, catalogName(c.career)].filter((v) => v && v !== '—').join(' · ') || '—'}
                  </span>
                </span>
                <RatingBadge rating={c.credit_rating} />
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedUuid && loadingReport && <Skeleton className="mt-4 h-64" />}
      {selectedUuid && !loadingReport && reportError && (
        <ErrorState title="No se pudo cargar el informe del estudiante" error={reportErrorObj} onRetry={() => refetchReport()} compact className="mt-4" />
      )}
      {selectedUuid && !loadingReport && report && (
        <CreditReportCard
          contact={report}
          byRating={byRating}
          onClose={() => {
            setSelectedUuid(null)
            setSearch('')
          }}
        />
      )}
    </section>
  )
}

function CreditReportCard({
  contact,
  byRating,
  onClose,
}: {
  contact: ContactWithTimeline
  byRating: RatingStat[]
  onClose: () => void
}) {
  const strategy = byRating.find((r) => String(r.rating) === String(contact.credit_rating ?? ''))?.strategy

  const metrics: { label: string; value: React.ReactNode }[] = [
    { label: 'Paga a tiempo', value: contact.on_time_rate != null ? formatPercent(Math.round(Number(contact.on_time_rate) * 100)) : '—' },
    {
      label: 'Atraso promedio',
      value: contact.avg_delay_days != null ? `${formatNumber(contact.avg_delay_days)} días` : '—',
    },
    {
      label: 'Paga a fin de ciclo',
      value: contact.end_of_cycle_rate != null ? formatPercent(Math.round(Number(contact.end_of_cycle_rate) * 100)) : '—',
    },
    { label: 'Ciclos cursados', value: contact.cycles_with_debt != null ? formatNumber(contact.cycles_with_debt) : '—' },
    { label: 'Deuda total', value: formatMoney(contact.total_debt ?? contact.total_pending ?? 0) },
    { label: 'Comportamiento', value: <BehaviorBadge behavior={contact.payment_behavior} /> },
  ]

  return (
    <Card className="mt-4 border-primary/30">
      <CardContent className="p-5">
        {/* Header del informe */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Informe crediticio
            </p>
            <h4 className="mt-0.5 text-lg font-bold">{fullName(contact)}</h4>
            <p className="text-sm text-muted-foreground">
              {[
                contact.dni ? `DNI ${contact.dni}` : null,
                contact.student_code ? `Código ${contact.student_code}` : null,
                [catalogName(contact.career), catalogName(contact.campus)].filter((v) => v !== '—').join(' · ') || null,
                catalogName(contact.academic_level) !== '—' ? catalogName(contact.academic_level) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`/contacts/${contact.uuid}`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            >
              <ExternalLink className="h-4 w-4" />
              Ver ficha completa
            </a>
            <Button variant="ghost" size="icon" onClick={onClose} title="Cerrar informe">
              <X className="h-4 w-4" />
              <span className="sr-only">Cerrar</span>
            </Button>
          </div>
        </div>

        {/* Fila principal: calificación + atraso + score + tendencia */}
        <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Calificación SBS</p>
            <RatingBadge rating={contact.credit_rating} className="mt-1 px-3 py-1 text-sm" />
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Atraso actual</p>
            <p className="mt-1 flex items-center gap-1.5 text-xl font-bold tabular-nums">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              {contact.current_delay_days != null ? `${formatNumber(contact.current_delay_days)} días` : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Score de pago</p>
            <div className="mt-1 flex items-center gap-2">
              <ScoreIndicator score={contact.payment_score} size="lg" />
              <TrendArrow trend={contact.payment_trend} className="[&>svg]:h-5 [&>svg]:w-5" />
            </div>
          </div>
        </div>

        {/* Grid de métricas */}
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-3 lg:grid-cols-6">
          {metrics.map((m) => (
            <div key={m.label}>
              <p className="text-xs text-muted-foreground">{m.label}</p>
              <div className="mt-0.5 text-sm font-semibold tabular-nums">{m.value}</div>
            </div>
          ))}
        </div>

        {/* Línea de tiempo de la carrera */}
        {contact.payment_timeline.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-muted-foreground">Historial de pago por ciclo</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {contact.payment_timeline.map((t) => {
                const s = TIMELINE_STATUS[t.status] ?? {
                  label: t.status,
                  className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
                }
                return (
                  <span
                    key={t.period}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${s.className}`}
                    title={`${t.period} · ${s.label} · ${formatMoney(t.amount)} (${formatMoney(t.pending)} pendiente) · atraso prom. ${t.avg_delay} días`}
                  >
                    {t.period}
                    <span className="opacity-75">· {s.label}</span>
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Acción recomendada según su calificación */}
        {strategy && (
          <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Acción recomendada</p>
              <PriorityBadge priority={strategy.prioridad} />
            </div>
            <p className="mt-1 font-semibold">{strategy.titulo}</p>
            <p className="text-sm text-muted-foreground">{strategy.detalle}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Canal: <span className="font-medium text-foreground">{strategy.canal}</span>
              {strategy.campana ? (
                <>
                  {' '}· Campaña sugerida: <span className="font-medium text-foreground">{strategy.campana}</span>
                </>
              ) : null}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
