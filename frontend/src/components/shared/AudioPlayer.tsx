import { useEffect, useState } from 'react'
import { Loader2, Play, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface AudioPlayerProps {
  /** URL directa del audio */
  src?: string | null
  /** Función que obtiene la URL bajo demanda (p.ej. URL firmada que audita la escucha) */
  getUrl?: () => Promise<string>
  className?: string
}

export function AudioPlayer({ src, getUrl, className }: AudioPlayerProps) {
  const [url, setUrl] = useState<string | null>(src ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (src) setUrl(src)
  }, [src])

  const load = async () => {
    if (!getUrl) return
    setLoading(true)
    setError(null)
    try {
      const u = await getUrl()
      setUrl(u)
    } catch {
      setError('No se pudo obtener la grabación')
    } finally {
      setLoading(false)
    }
  }

  if (error) {
    return (
      <div className={`flex items-center gap-2 text-sm text-destructive ${className ?? ''}`}>
        <AlertCircle className="h-4 w-4" />
        {error}
        <Button variant="outline" size="sm" onClick={load}>
          Reintentar
        </Button>
      </div>
    )
  }

  if (!url) {
    return (
      <Button variant="outline" size="sm" onClick={load} disabled={loading} className={className}>
        {loading ? <Loader2 className="animate-spin" /> : <Play />}
        Escuchar grabación
      </Button>
    )
  }

  return <audio controls src={url} className={`h-10 w-full max-w-md ${className ?? ''}`} preload="metadata" />
}
