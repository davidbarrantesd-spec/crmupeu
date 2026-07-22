import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUpDown, ArrowUp, ArrowDown, AlertCircle } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from './EmptyState'
import type { Paginated } from '@/types'
import { cn } from '@/lib/utils'

export interface Column<T> {
  key: string
  header: ReactNode
  sortable?: boolean
  className?: string
  render: (row: T) => ReactNode
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: Paginated<T> | undefined
  isLoading?: boolean
  isError?: boolean
  onRetry?: () => void
  page: number
  onPageChange: (page: number) => void
  sort?: string
  onSortChange?: (sort: string) => void
  emptyTitle?: string
  emptyDescription?: string
  emptyIcon?: React.ComponentType<{ className?: string }>
  onRowClick?: (row: T) => void
  rowKey: (row: T) => string
  footer?: ReactNode
}

export function DataTable<T>({
  columns,
  data,
  isLoading,
  isError,
  onRetry,
  page,
  onPageChange,
  sort,
  onSortChange,
  emptyTitle = 'Sin resultados',
  emptyDescription = 'No se encontraron registros con los filtros aplicados.',
  onRowClick,
  rowKey,
  footer,
}: DataTableProps<T>) {
  const meta = data?.meta

  const toggleSort = (key: string) => {
    if (!onSortChange) return
    if (sort === key) onSortChange(`-${key}`)
    else if (sort === `-${key}`) onSortChange('')
    else onSortChange(key)
  }

  const sortIcon = (key: string) => {
    if (sort === key) return <ArrowUp className="h-3 w-3" />
    if (sort === `-${key}`) return <ArrowDown className="h-3 w-3" />
    return <ArrowUpDown className="h-3 w-3 opacity-40" />
  }

  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((col) => (
              <TableHead key={col.key} className={col.className}>
                {col.sortable && onSortChange ? (
                  <button
                    type="button"
                    className="inline-flex cursor-pointer items-center gap-1 uppercase hover:text-foreground"
                    onClick={() => toggleSort(col.key)}
                  >
                    {col.header}
                    {sortIcon(col.key)}
                  </button>
                ) : (
                  col.header
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading &&
            Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={i}>
                {columns.map((col) => (
                  <TableCell key={col.key}>
                    <Skeleton className="h-4 w-full max-w-[140px]" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          {!isLoading && isError && (
            <TableRow>
              <TableCell colSpan={columns.length}>
                <EmptyState
                  icon={AlertCircle}
                  title="Error al cargar los datos"
                  description="Ocurrió un problema al comunicarse con el servidor."
                  action={
                    onRetry && (
                      <Button variant="outline" size="sm" onClick={onRetry}>
                        Reintentar
                      </Button>
                    )
                  }
                />
              </TableCell>
            </TableRow>
          )}
          {!isLoading && !isError && data && data.data.length === 0 && (
            <TableRow>
              <TableCell colSpan={columns.length}>
                <EmptyState title={emptyTitle} description={emptyDescription} />
              </TableCell>
            </TableRow>
          )}
          {!isLoading &&
            !isError &&
            data?.data.map((row) => (
              <TableRow
                key={rowKey(row)}
                className={cn(onRowClick && 'cursor-pointer')}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <TableCell key={col.key} className={col.className}>
                    {col.render(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
        </TableBody>
      </Table>
      {footer}
      {meta && meta.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2">
          <p className="text-xs text-muted-foreground">
            {meta.total} registro{meta.total === 1 ? '' : 's'} · página {meta.current_page} de {meta.last_page}
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="iconSm" disabled={page <= 1} onClick={() => onPageChange(1)}>
              <ChevronsLeft />
            </Button>
            <Button variant="outline" size="iconSm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="iconSm" disabled={page >= meta.last_page} onClick={() => onPageChange(page + 1)}>
              <ChevronRight />
            </Button>
            <Button variant="outline" size="iconSm" disabled={page >= meta.last_page} onClick={() => onPageChange(meta.last_page)}>
              <ChevronsRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
