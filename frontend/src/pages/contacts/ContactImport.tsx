import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  UploadCloud,
  XCircle,
  RotateCcw,
} from 'lucide-react'
import { api, apiErrorMessage, downloadFile } from '@/api/client'
import { formatNumber } from '@/lib/format'
import type { ApiResource, ImportJob } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHeader } from '@/components/shared/PageHeader'
import { cn } from '@/lib/utils'

const CONTACT_FIELDS: { value: string; label: string }[] = [
  { value: '__ignore__', label: '— Ignorar columna —' },
  { value: 'internal_code', label: 'Código interno' },
  { value: 'first_name', label: 'Nombres' },
  { value: 'last_name', label: 'Apellidos' },
  { value: 'dni', label: 'DNI' },
  { value: 'phone', label: 'Teléfono' },
  { value: 'phone_secondary', label: 'Teléfono secundario' },
  { value: 'email', label: 'Correo' },
  { value: 'city', label: 'Ciudad' },
  { value: 'address', label: 'Dirección' },
  { value: 'segment', label: 'Segmento' },
  { value: 'source', label: 'Fuente' },
  { value: 'tags', label: 'Etiquetas' },
]

const DEBT_FIELDS: { value: string; label: string }[] = [
  { value: '__ignore__', label: '— Ignorar columna —' },
  { value: 'dni', label: 'DNI del contacto' },
  { value: 'internal_code', label: 'Código interno del contacto' },
  { value: 'reference', label: 'Referencia' },
  { value: 'concept', label: 'Concepto' },
  { value: 'original_amount', label: 'Monto original' },
  { value: 'current_balance', label: 'Saldo actual' },
  { value: 'currency', label: 'Moneda' },
  { value: 'due_date', label: 'Fecha de vencimiento' },
  { value: 'status', label: 'Estado' },
  { value: 'installments_total', label: 'Total de cuotas' },
  { value: 'installments_paid', label: 'Cuotas pagadas' },
]

const TEMPLATE_COLUMNS = [
  'id_persona',
  'codigo_estudiante',
  'dni',
  'nombres',
  'apellidos',
  'telefono',
  'email',
  'campus',
  'facultad',
  'carrera',
  'nivel',
  'modalidad',
  'estado_matricula',
  'deuda_codigo',
  'deuda_concepto',
  'deuda_monto',
  'deuda_saldo',
  'deuda_moneda',
  'deuda_vencimiento',
  'deuda_periodo',
  'deuda_estado',
]

type Step = 1 | 2 | 3

export default function ContactImport() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(1)
  const [type, setType] = useState<'contacts' | 'debts'>('contacts')
  const [dragOver, setDragOver] = useState(false)
  const [job, setJob] = useState<ImportJob | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      form.append('type', type)
      const res = await api.post<ApiResource<ImportJob>>('/imports', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return res.data.data
    },
    onSuccess: (data) => {
      setJob(data)
      setMapping(data.suggested_mapping ?? {})
      setStep(2)
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  const submitMapping = useMutation({
    mutationFn: () => {
      const clean: Record<string, string> = {}
      for (const [col, field] of Object.entries(mapping)) {
        if (field && field !== '__ignore__') clean[col] = field
      }
      return api.post(`/imports/${job?.uuid}/mapping`, { column_mapping: clean })
    },
    onSuccess: () => {
      toast.success('Importación en proceso')
      setStep(3)
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  const { data: progress } = useQuery({
    queryKey: ['import', job?.uuid],
    queryFn: async () => {
      const res = await api.get<ApiResource<ImportJob>>(`/imports/${job?.uuid}`)
      return res.data.data
    },
    enabled: step === 3 && !!job?.uuid,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'completed' || status === 'failed' ? false : 2000
    },
  })

  const handleFile = useCallback(
    (file: File | undefined) => {
      if (!file) return
      const valid = /\.(csv|xlsx|xls|txt)$/i.test(file.name)
      if (!valid) {
        toast.error('Formato no soportado', { description: 'Sube un archivo CSV o Excel.' })
        return
      }
      upload.mutate(file)
    },
    [upload],
  )

  const fields = type === 'contacts' ? CONTACT_FIELDS : DEBT_FIELDS
  const done = progress?.status === 'completed' || progress?.status === 'failed'
  const pct =
    progress && progress.total_rows
      ? Math.min(100, Math.round(((progress.processed_rows ?? 0) / progress.total_rows) * 100))
      : 0

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Button variant="ghost" size="sm" onClick={() => navigate('/contacts')} className="mb-3 -ml-2">
        <ArrowLeft />
        Volver a contactos
      </Button>
      <PageHeader title="Importar datos" description="Carga masiva de contactos o deudas desde CSV/Excel" />

      {/* Pasos */}
      <div className="mb-8 flex items-center gap-2">
        {[
          { n: 1, label: 'Subir archivo' },
          { n: 2, label: 'Mapear columnas' },
          { n: 3, label: 'Procesamiento' },
        ].map((s, i) => (
          <div key={s.n} className="flex items-center gap-2">
            {i > 0 && <div className="h-px w-8 bg-border sm:w-16" />}
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold',
                  step >= s.n ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                )}
              >
                {step > s.n ? <CheckCircle2 className="h-4 w-4" /> : s.n}
              </div>
              <span className={cn('hidden text-sm sm:block', step >= s.n ? 'font-medium' : 'text-muted-foreground')}>
                {s.label}
              </span>
            </div>
          </div>
        ))}
      </div>

      {step === 1 && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">Tipo de importación:</span>
                <Select value={type} onValueChange={(v) => setType(v as 'contacts' | 'debts')}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contacts">Contactos</SelectItem>
                    <SelectItem value="debts">Deudas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                onClick={() =>
                  downloadFile('/imports/template', 'contactos-deudas-plantilla.csv')
                    .then(() => toast.success('Plantilla descargada'))
                    .catch((e) => toast.error(apiErrorMessage(e)))
                }
              >
                <Download />
                Descargar plantilla
              </Button>
            </div>

            <button
              type="button"
              className={cn(
                'flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-12 transition-colors',
                dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-accent/50',
              )}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                handleFile(e.dataTransfer.files[0])
              }}
            >
              {upload.isPending ? (
                <>
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <p className="font-medium">Subiendo archivo…</p>
                </>
              ) : (
                <>
                  <UploadCloud className="h-10 w-10 text-muted-foreground" />
                  <div className="text-center">
                    <p className="font-medium">Arrastra tu archivo aquí o haz clic para seleccionarlo</p>
                    <p className="mt-1 text-sm text-muted-foreground">CSV, XLSX o XLS · máx. 10 MB</p>
                  </div>
                </>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.txt"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />

            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="mb-2 text-sm font-medium">Columnas soportadas</p>
              <p className="mb-2 text-xs text-muted-foreground">
                La plantilla admite datos del estudiante y de sus deudas en un mismo archivo:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATE_COLUMNS.map((c) => (
                  <code key={c} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                    {c}
                  </code>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && job && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-2 text-sm">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              <span className="font-medium">{job.file_name ?? 'Archivo subido'}</span>
              <span className="text-muted-foreground">· {job.headers?.length ?? 0} columnas detectadas</span>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {(job.headers ?? []).map((h) => (
                      <TableHead key={h} className="min-w-[180px] align-top">
                        <div className="space-y-1.5 py-1.5">
                          <p className="normal-case text-foreground">{h}</p>
                          <Select
                            value={mapping[h] ?? '__ignore__'}
                            onValueChange={(v) => setMapping((m) => ({ ...m, [h]: v }))}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {fields.map((f) => (
                                <SelectItem key={f.value} value={f.value}>
                                  {f.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(job.preview ?? []).map((row, i) => (
                    <TableRow key={i}>
                      {(job.headers ?? []).map((_, j) => (
                        <TableCell key={j} className="text-xs text-muted-foreground">
                          {row[j] ?? ''}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">Vista previa de las primeras {job.preview?.length ?? 0} filas.</p>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft />
                Atrás
              </Button>
              <Button onClick={() => submitMapping.mutate()} loading={submitMapping.isPending}>
                Iniciar importación
                <ArrowRight />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardContent className="space-y-6 p-6">
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              {!done && <Loader2 className="h-10 w-10 animate-spin text-primary" />}
              {progress?.status === 'completed' && <CheckCircle2 className="h-10 w-10 text-emerald-500" />}
              {progress?.status === 'failed' && <XCircle className="h-10 w-10 text-destructive" />}
              <p className="text-lg font-semibold">
                {progress?.status === 'completed'
                  ? 'Importación completada'
                  : progress?.status === 'failed'
                    ? 'La importación falló'
                    : 'Procesando importación…'}
              </p>
              <div className="w-full max-w-md">
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn('h-full rounded-full transition-all', progress?.status === 'failed' ? 'bg-destructive' : 'bg-primary')}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatNumber(progress?.processed_rows)} de {formatNumber(progress?.total_rows)} filas ({pct}%)
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <ResultStat label="Creados" value={progress?.created_count} className="text-emerald-600" />
              <ResultStat label="Actualizados" value={progress?.updated_count} className="text-blue-600" />
              <ResultStat label="Duplicados" value={progress?.duplicate_count} className="text-amber-600" />
              <ResultStat label="Fallidos" value={progress?.failed_count} className="text-destructive" />
            </div>

            {done && (
              <div className="flex flex-wrap justify-center gap-2">
                {!!progress?.failed_count && progress.failed_count > 0 && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      downloadFile(`/imports/${job?.uuid}/errors`, 'errores-importacion.csv', { download: 1 })
                        .then(() => toast.success('Errores descargados'))
                        .catch((e) => toast.error(apiErrorMessage(e)))
                    }
                  >
                    <Download />
                    Descargar errores
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep(1)
                    setJob(null)
                    setMapping({})
                  }}
                >
                  <RotateCcw />
                  Nueva importación
                </Button>
                <Button onClick={() => navigate('/contacts')}>Ver contactos</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function ResultStat({ label, value, className }: { label: string; value?: number; className?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3 text-center">
      <p className={cn('text-2xl font-bold tabular-nums', className)}>{formatNumber(value ?? 0)}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
