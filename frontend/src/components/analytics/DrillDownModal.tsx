import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { api } from '@/api/client'
import { catalogName, formatMoney, formatNumber, fullName } from '@/lib/format'
import { RatingBadge } from '@/components/shared/RatingBadge'
import { ScoreIndicator } from '@/components/shared/ScoreIndicator'
import { EmptyState } from '@/components/shared/EmptyState'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Contact, Paginated } from '@/types'

interface DrillDownModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Filtros para GET /contacts (p. ej. { credit_rating: 'dudoso' }). */
  params: Record<string, string>
}

/**
 * Modal genérico de drill-down: lista estudiantes de GET /contacts con los
 * filtros recibidos, sin salir de la página. La ficha completa se abre en
 * pestaña nueva.
 */
export function DrillDownModal({ open, onOpenChange, title, params }: DrillDownModalProps) {
  const [page, setPage] = useState(1)

  // Reinicia la paginación al cambiar los filtros o reabrir el modal
  const paramsKey = JSON.stringify(params)
  useEffect(() => {
    setPage(1)
  }, [paramsKey, open])

  const { data, isLoading, isError } = useQuery({
    placeholderData: keepPreviousData,
    queryKey: ['analytics', 'drilldown', params, page],
    queryFn: async () => {
      const res = await api.get<Paginated<Contact>>('/contacts', {
        params: { ...params, per_page: 10, page },
      })
      return res.data
    },
    enabled: open,
  })

  const contacts = data?.data ?? []
  const meta = data?.meta

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        )}

        {isError && (
          <EmptyState title="Error al cargar" description="No se pudo obtener la lista de estudiantes." />
        )}

        {!isLoading && !isError && !contacts.length && (
          <EmptyState title="Sin resultados" description="No hay estudiantes para este filtro." />
        )}

        {!isLoading && !isError && contacts.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Estudiante</TableHead>
                  <TableHead>Carrera · Campus</TableHead>
                  <TableHead className="text-right">Deuda</TableHead>
                  <TableHead>Calificación</TableHead>
                  <TableHead className="text-center">Score</TableHead>
                  <TableHead className="text-right">Atraso</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((c) => (
                  <TableRow key={c.uuid}>
                    <TableCell>
                      <p className="font-medium">{fullName(c)}</p>
                      <p className="text-xs text-muted-foreground">{c.dni || '—'}</p>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {[catalogName(c.career), catalogName(c.campus)].filter((v) => v !== '—').join(' · ') || '—'}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatMoney(c.total_pending)}
                    </TableCell>
                    <TableCell>
                      <RatingBadge rating={c.credit_rating} />
                    </TableCell>
                    <TableCell className="text-center">
                      <ScoreIndicator score={c.payment_score} size="sm" />
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {c.current_delay_days != null ? `${formatNumber(c.current_delay_days)} días` : '—'}
                    </TableCell>
                    <TableCell>
                      <a
                        href={`/contacts/${c.uuid}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Ver ficha (pestaña nueva)"
                        className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
                      >
                        <ExternalLink className="h-4 w-4" />
                        <span className="sr-only">Ver ficha</span>
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {meta && meta.total > 0 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {formatNumber(meta.total)} estudiantes · página {meta.current_page} de {meta.last_page}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= meta.last_page}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
