import type { ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface FilterBarProps {
  search?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  children?: ReactNode
  onClear?: () => void
  hasActiveFilters?: boolean
}

export function FilterBar({ search, onSearchChange, searchPlaceholder = 'Buscar…', children, onClear, hasActiveFilters }: FilterBarProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {onSearchChange && (
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search ?? ''}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-8"
          />
        </div>
      )}
      {children}
      {onClear && hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X />
          Limpiar filtros
        </Button>
      )}
    </div>
  )
}
