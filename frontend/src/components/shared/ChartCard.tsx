import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'

/** Estilo compartido para los tooltips de recharts (respeta el tema). */
export const tooltipStyle: React.CSSProperties = {
  backgroundColor: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--popover-foreground)',
  fontSize: 12,
}

/** Card contenedora de un gráfico, con estados de carga y vacío. */
export function ChartCard({
  title,
  loading,
  empty,
  children,
}: {
  title: string
  loading?: boolean
  empty?: boolean
  children: React.ReactNode
}) {
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
