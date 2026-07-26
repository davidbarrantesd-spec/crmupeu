import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { AlertTriangle, Building2, Gauge, GraduationCap, Scale, Wallet } from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
} from 'recharts'
import { api } from '@/api/client'
import { formatMoney, formatNumber } from '@/lib/format'
import { SegmentBadge, segmentLabel } from '@/components/shared/SegmentBadge'
import { BehaviorBadge, behaviorLabel, behaviorSoftBg } from '@/components/shared/BehaviorBadge'
import { ScoreIndicator, scoreBarClass } from '@/components/shared/ScoreIndicator'
import { ChartCard, tooltipStyle } from '@/components/shared/ChartCard'
import {
  AcademicFilters,
  academicFilterParams,
  hasAcademicFilters,
  type AcademicFilterValues,
} from '@/components/shared/AcademicFilters'
import { DrillDownModal } from '@/components/analytics/DrillDownModal'
import type { AcademicDashboard, ApiResource, BehaviorByYearStat, CareerScoreStat } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/shared/EmptyState'

const ACADEMIC_KPIS: {
  key: keyof AcademicDashboard['kpis']
  label: string
  icon: React.ComponentType<{ className?: string }>
  format: (v: number | string) => string
  color: string
}[] = [
  { key: 'students_with_debt', label: 'Estudiantes con deuda', icon: GraduationCap, format: formatNumber, color: 'text-indigo-500' },
  { key: 'total_pending', label: 'Deuda total', icon: Wallet, format: formatMoney, color: 'text-rose-500' },
  { key: 'total_overdue', label: 'Deuda vencida', icon: AlertTriangle, format: formatMoney, color: 'text-amber-500' },
  { key: 'avg_debt', label: 'Deuda promedio', icon: Scale, format: formatMoney, color: 'text-cyan-500' },
]

interface DrillState {
  title: string
  params: Record<string, string>
}

/**
 * Panorama académico + comportamiento de pago (antes vivía en Dashboard.tsx).
 * Las tarjetas de segmento/comportamiento abren un DrillDownModal en vez de
 * navegar; los links a fichas se abren en pestaña nueva.
 */
export function AcademicPanorama() {
  const [filters, setFilters] = useState<AcademicFilterValues>({})
  const [drill, setDrill] = useState<DrillState | null>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    placeholderData: keepPreviousData,
    queryKey: ['dashboard', 'academic', filters],
    queryFn: async () => {
      const res = await api.get<ApiResource<AcademicDashboard>>('/dashboard/academic', {
        params: academicFilterParams(filters),
      })
      return res.data.data
    },
  })

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <GraduationCap className="h-5 w-5 text-primary" />
            Panorama académico
          </h2>
          <p className="text-sm text-muted-foreground">Deuda estudiantil por campus, facultad, carrera y ciclo</p>
        </div>
      </div>

      {/* Filtros académicos */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <AcademicFilters
          value={filters}
          onChange={setFilters}
          fields={['campus_id', 'faculty_id', 'career_id', 'academic_period']}
        />
        {hasAcademicFilters(filters) && (
          <Button variant="ghost" size="sm" onClick={() => setFilters({})}>
            Limpiar filtros
          </Button>
        )}
      </div>

      {isError && (
        <EmptyState
          icon={Building2}
          title="Error al cargar el panorama académico"
          description="No se pudo obtener la información del servidor."
          action={<Button variant="outline" onClick={() => refetch()}>Reintentar</Button>}
        />
      )}

      {/* KPIs académicos */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {isLoading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        {!isLoading &&
          data &&
          ACADEMIC_KPIS.map((def) => (
            <Card key={def.key}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">{def.label}</p>
                  <def.icon className={`h-4 w-4 ${def.color}`} />
                </div>
                <p className="mt-2 text-xl font-bold tracking-tight">{def.format(data.kpis[def.key])}</p>
              </CardContent>
            </Card>
          ))}
      </div>

      {/* Segmentos de pago (drill-down en modal) */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {isLoading && Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        {!isLoading &&
          (data?.by_segment ?? []).map((s) => (
            <button
              key={s.segment}
              type="button"
              className="cursor-pointer rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent"
              onClick={() =>
                setDrill({
                  title: `Estudiantes del segmento ${s.label || segmentLabel(s.segment)}`,
                  params: { payment_segment: s.segment },
                })
              }
              title={`Ver contactos del segmento ${s.label || segmentLabel(s.segment)}`}
            >
              <SegmentBadge segment={s.segment} />
              <p className="mt-2 text-xl font-bold tabular-nums">{formatNumber(s.count)}</p>
              <p className="text-xs text-muted-foreground tabular-nums">{formatMoney(s.amount)}</p>
            </button>
          ))}
      </div>

      {/* Comportamiento de pago */}
      <div className="mt-6">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Gauge className="h-4 w-4 text-primary" />
          Comportamiento de pago
        </h3>
        <p className="text-sm text-muted-foreground">Hábitos de pago de los estudiantes a lo largo de su carrera</p>

        {/* Tarjetas por comportamiento + score promedio */}
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {isLoading && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          {!isLoading && data && (
            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground">Score promedio</p>
                <div className="mt-2">
                  <ScoreIndicator score={data.kpis.avg_score} size="lg" />
                </div>
              </CardContent>
            </Card>
          )}
          {!isLoading &&
            (data?.by_behavior ?? []).map((b) => (
              <button
                key={b.behavior}
                type="button"
                className="cursor-pointer rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent"
                onClick={() =>
                  setDrill({
                    title: `Estudiantes con comportamiento ${b.label || behaviorLabel(b.behavior)}`,
                    params: { payment_behavior: b.behavior },
                  })
                }
                title={`Ver contactos con comportamiento ${b.label || behaviorLabel(b.behavior)}`}
              >
                <BehaviorBadge behavior={b.behavior} />
                <p className="mt-2 text-xl font-bold tabular-nums">{formatNumber(b.count)}</p>
                <p className="text-xs text-muted-foreground tabular-nums">{formatMoney(b.amount)}</p>
              </button>
            ))}
        </div>

        {/* Matriz comportamiento × año + cultura de pago por carrera */}
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">¿Cómo pagan según su año de carrera?</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {isLoading ? (
                <Skeleton className="mx-6 mb-6 h-[240px]" />
              ) : !data?.behavior_by_year?.length ? (
                <EmptyState title="Sin datos" description="No hay información para los filtros seleccionados." className="h-[240px] py-0" />
              ) : (
                <BehaviorByYearMatrix rows={data.behavior_by_year} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Cultura de pago por carrera</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[240px] w-full" />
              ) : !data?.score_by_career?.length ? (
                <EmptyState title="Sin datos" description="No hay información para los filtros seleccionados." className="h-[240px] py-0" />
              ) : (
                <CareerScoreLists careers={data.score_by_career} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Gráficos por campus / facultad */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Deuda por campus" loading={isLoading} empty={!data?.by_campus?.length}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data?.by_campus ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatNumber(v)} />
              <RechartsTooltip
                contentStyle={tooltipStyle}
                formatter={(v, name) => (name === 'Monto' ? [formatMoney(Number(v)), name] : [formatNumber(Number(v)), name])}
              />
              <Legend />
              <Bar dataKey="amount" name="Monto" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="count" name="Estudiantes" fill="#06b6d4" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Deuda por facultad" loading={isLoading} empty={!data?.by_faculty?.length}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data?.by_faculty ?? []} layout="vertical" margin={{ left: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatNumber(v)} />
              <YAxis type="category" dataKey="name" stroke="var(--muted-foreground)" fontSize={11} width={140} />
              <RechartsTooltip contentStyle={tooltipStyle} formatter={(v) => [formatMoney(Number(v)), 'Monto']} />
              <Bar dataKey="amount" name="Monto" fill="#a855f7" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Top deudores + deuda por ciclo */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top 10 estudiantes más deudores</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {isLoading ? (
              <Skeleton className="mx-6 mb-6 h-[280px]" />
            ) : !data?.top_debtors?.length ? (
              <EmptyState title="Sin datos" description="No hay deudores para los filtros seleccionados." className="h-[280px] py-0" />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Estudiante</TableHead>
                      <TableHead className="text-right">Deuda total</TableHead>
                      <TableHead className="text-right">Ciclos</TableHead>
                      <TableHead>Ciclo más antiguo</TableHead>
                      <TableHead>Segmento</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.top_debtors.slice(0, 10).map((d) => (
                      <TableRow key={d.uuid}>
                        <TableCell>
                          <a
                            href={`/contacts/${d.uuid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-primary hover:underline"
                            title="Ver ficha (pestaña nueva)"
                          >
                            {d.full_name}
                          </a>
                          <p className="text-xs text-muted-foreground">
                            {[d.career, d.campus].filter(Boolean).join(' · ') || '—'}
                          </p>
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatMoney(d.total_pending)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(d.periods_count)}</TableCell>
                        <TableCell>{d.oldest_period ?? '—'}</TableCell>
                        <TableCell>
                          <SegmentBadge segment={d.payment_segment} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <ChartCard title="Deuda por ciclo" loading={isLoading} empty={!data?.by_period?.length}>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data?.by_period ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="period" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => formatNumber(v)} />
              <RechartsTooltip contentStyle={tooltipStyle} formatter={(v) => [formatMoney(Number(v)), 'Deuda']} />
              <Area type="monotone" dataKey="amount" name="Deuda" stroke="#ef4444" fill="#ef444433" strokeWidth={2} />
            </AreaChart>
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
    </section>
  )
}

/** Orden canónico de los comportamientos en la matriz. */
const BEHAVIOR_ORDER = ['puntual', 'demora_leve', 'demora_cronica', 'fin_de_ciclo', 'sin_historial']

const YEARS = [1, 2, 3, 4, 5]

function BehaviorByYearMatrix({ rows }: { rows: BehaviorByYearStat[] }) {
  const orderIdx = (b: string) => {
    const i = BEHAVIOR_ORDER.indexOf(b)
    return i === -1 ? BEHAVIOR_ORDER.length : i
  }
  const behaviors = Array.from(new Set(rows.map((r) => r.payment_behavior))).sort((a, b) => orderIdx(a) - orderIdx(b))
  const cell = (behavior: string, year: number) =>
    rows.find((r) => r.payment_behavior === behavior && Number(r.year) === year)

  return (
    <div className="overflow-x-auto pb-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Comportamiento</TableHead>
            {YEARS.map((y) => (
              <TableHead key={y} className="text-center">
                Año {y}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {behaviors.map((b) => (
            <TableRow key={b}>
              <TableCell>
                <BehaviorBadge behavior={b} />
              </TableCell>
              {YEARS.map((y) => {
                const c = cell(b, y)
                return (
                  <TableCell
                    key={y}
                    className={`text-center ${c ? behaviorSoftBg(b) : ''}`}
                    title={c ? `${behaviorLabel(b)} · Año ${y}: ${formatNumber(c.count)} estudiantes · score promedio ${c.avg_score}` : undefined}
                  >
                    {c ? (
                      <>
                        <span className="font-semibold tabular-nums">{formatNumber(c.count)}</span>
                        <span className="ml-1 text-[10px] text-muted-foreground tabular-nums">({c.avg_score})</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function CareerScoreLists({ careers }: { careers: CareerScoreStat[] }) {
  // score_by_career viene ordenado de mejor a peor score
  const best = careers.slice(0, 5)
  const worst = careers.length > 5 ? careers.slice(-5).reverse() : []

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      <CareerScoreList title="Top 5 mejores" careers={best} />
      <CareerScoreList title="Top 5 peores" careers={worst} />
    </div>
  )
}

function CareerScoreList({ title, careers }: { title: string; careers: CareerScoreStat[] }) {
  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {!careers.length && <p className="text-sm text-muted-foreground">Sin datos</p>}
      <div className="space-y-3">
        {careers.map((c) => (
          <div key={c.name}>
            <div className="mb-1 flex items-center justify-between gap-2 text-sm">
              <span className="truncate font-medium" title={c.name}>
                {c.name}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <ScoreIndicator score={c.avg_score} size="sm" />
                <span className="text-xs text-muted-foreground tabular-nums">{formatNumber(c.students)} est.</span>
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${scoreBarClass(c.avg_score)}`}
                style={{ width: `${Math.max(0, Math.min(100, c.avg_score))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
