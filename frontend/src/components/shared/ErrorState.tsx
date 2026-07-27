import { AlertCircle, RefreshCw } from 'lucide-react'
import { apiErrorMessage } from '@/api/client'
import { Button } from '@/components/ui/button'

interface ErrorStateProps {
  /** Error original (de useQuery o un catch) para extraer un mensaje legible. */
  error?: unknown
  /** Título del aviso. */
  title?: string
  /** Callback de reintento (normalmente el refetch de la query). */
  onRetry?: () => void
  /** Versión compacta para paneles pequeños o diálogos. */
  compact?: boolean
  className?: string
}

/** Aviso amigable de error de carga, con mensaje en español y botón de reintento. */
export function ErrorState({ error, title = 'No se pudo cargar la información', onRetry, compact, className }: ErrorStateProps) {
  const message = error ? apiErrorMessage(error) : undefined

  if (compact) {
    return (
      <div className={`flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm ${className ?? ''}`}>
        <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
        <span className="text-muted-foreground">{message ?? title}</span>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Reintentar
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className={`flex flex-col items-center justify-center gap-2 py-12 text-center ${className ?? ''}`}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertCircle className="h-6 w-6 text-destructive" />
      </div>
      <p className="font-medium">{title}</p>
      {message && message !== title && <p className="max-w-sm text-sm text-muted-foreground">{message}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Reintentar
        </Button>
      )}
    </div>
  )
}
