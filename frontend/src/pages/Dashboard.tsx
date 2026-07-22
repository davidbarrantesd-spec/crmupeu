import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, subDays } from 'date-fns'
import {
  Users,
  Wallet,
  Megaphone,
  CalendarClock,
  PhoneOutgoing,
  PhoneIncoming,
  PhoneMissed,
  Handshake,
  CheckCircle2,
  XCircle,
  Send,
  MessageCircleReply,
  Inbox,
  DollarSign,
  Percent,
  Target,
  PiggyBank,
  RefreshCw,
} from 'lucide-react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
} from 'recharts'
import { api } from '@/api/client'
import { formatMoney, formatNumber, formatPercent, formatDate } from '@/lib/format'
import { statusLabel } from '@/components/shared/StatusBadge'
import type { ApiResource, DashboardData } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'

const CHART_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#ec4899', '#84cc16']

interface KpiDef {
  key: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  format: (v: number | string) => string
  color: string
}

const KPI_DEFS: KpiDef[] = [
  { key: 'total_contacts', label: 'Contactos', icon: Users, format: formatNumber, color: 'text-indigo-500' },
  { key: 'total_debt', label: 'Deuda total', icon: Wallet, format: formatMoney, color: 'text-rose-500' },
  { key: 'active_campaigns', label: 'Campañas activas', icon: Megaphone, format: formatNumber, color: 'text-violet-500' },
  { key: 'calls_scheduled', label: 'Llamadas programadas', icon: CalendarClock, format: formatNumber, color: 'text-sky-500' },
  { key: 'calls_made', label: 'Llamadas realizadas', icon: PhoneOutgoing, format: formatNumber, color: 'text-blue-500' },
  { key: 'calls_answered', label: 'Llamadas contestadas', icon: PhoneIncoming, format: formatNumber, color: 'text-emerald-500' },
  { key: 'calls_missed', label: 'Llamadas perdidas', icon: PhoneMissed, format: formatNumber, color: 'text-red-500' },
  { key: 'agreements_total', label: 'Acuerdos', icon: Handshake, format: formatNumber, color: 'text-teal-500' },
  { key: 'agreements_fulfilled', label: 'Acuerdos cumplidos', icon: CheckCircle2, format: formatNumber, color: 'text-green-500' },
  { key: 'agreements_broken', label: 'Acuerdos incumplidos', icon: XCircle, format: formatNumber, color: 'text-orange-500' },
  { key: 'whatsapp_sent', label: 'WhatsApp enviados', icon: Send, format: formatNumber, color: 'text-green-600' },
  { key: 'whatsapp_replied', label: 'WhatsApp respondidos', icon: MessageCircleReply, format: formatNumber, color: 'text-lime-600' },
  { key: 'pending_conversations', label: 'Conversaciones pendientes', icon: Inbox, format: formatNumber, color: 'text-amber-500' },
  { key: 'estimated_cost', label: 'Costo estimado', icon: DollarSign, format: formatMoney, color: 'text-fuchsia-500' },
  { key: 'contact_rate', label: 'Tasa de contacto', icon: Percent, format: (v) => formatPercent(v), color: 'text-cyan-500' },
  { key: 'conversion_rate', label: 'Tasa de conversión', icon: Target, format: (v) => formatPercent(v), color: 'text-purple-500' },
  { key: 'estimated_recovery', label: 'Recuperación estimada', icon: PiggyBank, format: formatMoney, color: 'text-emerald-600' },
]

export default function Dashboard() {
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'))

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard', dateFrom, dateTo],
    queryFn: async () => {
      const res = await api.get<ApiResource<DashboardData>>('/dashboard', {
        params: { date_from: dateFrom, date_to: dateTo },
      })
      return res.data.data
    },
  })

  const kpis = data?.kpis
  const charts = data?.charts

  const agreementsByStatus = (charts?.agreements_by_status ?? []).map((d, i) => ({
    name: statusLabel(d.status),
    value: Number(d.total ?? d.count ?? 0),
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }))

  const funnel = (charts?.funnel ?? []).map((d) => ({
    name: String(d.stage ?? d.label ?? ''),
    value: Number(d.total ?? d.count ?? 0),
  }))

  const resultsByCampaign = charts?.results_by_campaign ?? []
  const resultKeys = Array.from(
    new Set(
      resultsByCampaign.flatMap((row) =>
        Object.keys(row).filter((k) => k !== 'campaign' && k !== 'name' && typeof row[k] === 'number'),
      ),
    ),
  )

  return (
    <div className="p-6">
      <PageHeader
        title="Panel de control"
        description="Resumen general de la operación de cobranzas"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-auto" />
            <span className="text-sm text-muted-foreground">a</span>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-auto" />
            <Button variant="outline" size="icon" onClick={() => refetch()} title="Actualizar">
              <RefreshCw />
            </Button>
          </div>
        }
      />

      {isError && (
        <EmptyState
          title="Error al cargar el panel"
          description="No se pudo obtener la información del servidor."
          action={<Button variant="outline" onClick={() => refetch()}>Reintentar</Button>}
        />
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {isLoading &&
          Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        {!isLoading &&
          kpis &&
          KPI_DEFS.map((def) => {
            const value = kpis[def.key]
            if (value === undefined) return null
            return (
              <Card key={def.key}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">{def.label}</p>
                    <def.icon className={`h-4 w-4 ${def.color}`} />
                  </div>
                  <p className="mt-2 text-xl font-bold tracking-tight">{def.format(value)}</p>
                </CardContent>
              </Card>
            )
          })}
      </div>

      {/* Gráficos */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Llamadas por día" loading={isLoading} empty={!charts?.calls_by_day?.length}>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={charts?.calls_by_day ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tickFormatter={(v) => formatDate(String(v)).slice(0, 6)} stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
              <RechartsTooltip labelFormatter={(v) => formatDate(String(v))} contentStyle={tooltipStyle} />
              <Legend />
              <Line type="monotone" dataKey="total" name="Total" stroke="#6366f1" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="answered" name="Contestadas" stroke="#22c55e" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Resultados por campaña" loading={isLoading} empty={!resultsByCampaign.length}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={resultsByCampaign}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey={(row) => String(row.campaign ?? row.name ?? '')} stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
              <RechartsTooltip contentStyle={tooltipStyle} />
              <Legend />
              {resultKeys.map((key, i) => (
                <Bar key={key} dataKey={key} name={statusLabel(key)} stackId="a" fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Acuerdos por estado" loading={isLoading} empty={!agreementsByStatus.length}>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={agreementsByStatus}
                dataKey="value"
                nameKey="name"
                innerRadius={70}
                outerRadius={100}
                paddingAngle={2}
                label={(entry) => `${entry.name} (${entry.value})`}
                fontSize={11}
              >
                {agreementsByStatus.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <RechartsTooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Mensajes por día" loading={isLoading} empty={!charts?.messages_by_day?.length}>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={charts?.messages_by_day ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tickFormatter={(v) => formatDate(String(v)).slice(0, 6)} stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
              <RechartsTooltip labelFormatter={(v) => formatDate(String(v))} contentStyle={tooltipStyle} />
              <Legend />
              <Area type="monotone" dataKey="sent" name="Enviados" stroke="#22c55e" fill="#22c55e33" strokeWidth={2} />
              <Area type="monotone" dataKey="received" name="Recibidos" stroke="#06b6d4" fill="#06b6d433" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Embudo de gestión" loading={isLoading} empty={!funnel.length}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={funnel} layout="vertical" margin={{ left: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
              <YAxis type="category" dataKey="name" stroke="var(--muted-foreground)" fontSize={11} width={120} />
              <RechartsTooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" name="Contactos" fill="#6366f1" radius={[0, 4, 4, 0]}>
                {funnel.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Tasa de respuesta por hora" loading={isLoading} empty={!charts?.hourly_answer_rate?.length}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={charts?.hourly_answer_rate ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="hour" tickFormatter={(v) => `${v}h`} stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => `${v}%`} />
              <RechartsTooltip formatter={(v) => [`${v}%`, 'Tasa']} labelFormatter={(v) => `${v}:00 h`} contentStyle={tooltipStyle} />
              <Bar dataKey="rate" name="Tasa de respuesta" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  )
}

const tooltipStyle: React.CSSProperties = {
  backgroundColor: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--popover-foreground)',
  fontSize: 12,
}

function ChartCard({ title, loading, empty, children }: { title: string; loading?: boolean; empty?: boolean; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[280px] w-full" />
        ) : empty ? (
          <EmptyState title="Sin datos" description="No hay información para el rango seleccionado." className="h-[280px] py-0" />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  )
}
