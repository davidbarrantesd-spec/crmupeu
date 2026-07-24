import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm, type FieldPath } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Bot,
  CalendarClock,
  CheckCircle2,
  Eye,
  MessageCircle,
  MessageSquareText,
  Rocket,
  Save,
  Upload,
} from 'lucide-react'
import { api, apiErrorMessage } from '@/api/client'
import { useAcademicCatalogs, modalityLabel, enrollmentLabel } from '@/hooks/useAcademicCatalogs'
import { segmentLabel } from '@/components/shared/SegmentBadge'
import { behaviorLabel } from '@/components/shared/BehaviorBadge'
import { formatMoney, fullName } from '@/lib/format'
import type { ApiResource, Campaign, Paginated, Prompt, SegmentPreview, WhatsAppTemplate } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { FormField } from '@/components/shared/FormField'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { PageHeader } from '@/components/shared/PageHeader'
import { cn } from '@/lib/utils'

const NONE = '__none__'

const schema = z.object({
  // Paso 1
  name: z.string().min(1, 'El nombre es obligatorio'),
  description: z.string().optional(),
  type: z.enum(['recorded_audio', 'tts', 'ai_conversational', 'whatsapp']),
  priority: z.string(),
  starts_at: z.string().optional(),
  ends_at: z.string().optional(),
  timezone: z.string(),
  allowed_hours_start: z.string(),
  allowed_hours_end: z.string(),
  allowed_days: z.array(z.number()),
  max_attempts: z.number().min(1, 'Mínimo 1').max(10, 'Máximo 10'),
  retry_delay_minutes: z.number().min(1, 'Mínimo 1'),
  // Paso 2 — segmentación
  min_debt: z.string().optional(),
  max_debt: z.string().optional(),
  min_days_overdue: z.string().optional(),
  debt_status: z.array(z.string()),
  cities: z.string().optional(),
  segments: z.string().optional(),
  tags: z.string().optional(),
  consent_required: z.boolean(),
  exclude_broken_agreements: z.boolean(),
  max_attempts_lt: z.string().optional(),
  // Paso 2 — filtros académicos
  campus_id: z.string().optional(),
  faculty_id: z.string().optional(),
  career_id: z.string().optional(),
  academic_level_id: z.string().optional(),
  academic_period: z.string().optional(),
  modalities: z.array(z.string()),
  enrollment_statuses: z.array(z.string()),
  payment_segments: z.array(z.string()),
  payment_behaviors: z.array(z.string()),
  // Paso 3 — contenido
  tts_message: z.string().optional(),
  audio_url: z.string().optional(),
  dtmf_1_action: z.string(),
  dtmf_2_action: z.string(),
  dtmf_3_action: z.string(),
  dtmf_2_template_uuid: z.string().optional(),
  dtmf_repeat_key: z.string(),
  dtmf_record_response: z.boolean(),
  prompt_uuid: z.string().optional(),
  ai_voice: z.string().optional(),
  ai_language: z.string().optional(),
  greeting_message: z.string().optional(),
  farewell_message: z.string().optional(),
  whatsapp_template_uuid: z.string().optional(),
  // Paso 4
  post_call_create_follow_up: z.boolean(),
  post_call_send_whatsapp_on_no_answer: z.boolean(),
  post_call_notes: z.string().optional(),
  budget_limit: z.string().optional(),
})

type WizardForm = z.infer<typeof schema>

const STEP_FIELDS: FieldPath<WizardForm>[][] = [
  ['name', 'type', 'priority', 'max_attempts', 'retry_delay_minutes'],
  [],
  [],
  [],
  [],
]

const DAYS = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 7, label: 'Dom' },
]

const TTS_VARIABLES = ['nombre', 'apellido', 'saldo', 'fecha_vencimiento', 'dias_mora', 'empresa', 'referencia']

const DEBT_STATUSES = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'overdue', label: 'Vencida' },
  { value: 'in_agreement', label: 'En acuerdo' },
]

const VOICES = ['alloy', 'echo', 'nova', 'shimmer', 'onyx', 'fable']

export default function CampaignWizard() {
  const { uuid } = useParams()
  const isEdit = !!uuid
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [step, setStep] = useState(0)
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<SegmentPreview | null>(null)
  const [confirmLaunch, setConfirmLaunch] = useState(false)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const pendingAction = useRef<'save' | 'schedule' | 'launch'>('save')
  const { catalogs, careersForFaculty } = useAcademicCatalogs()

  const form = useForm<WizardForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      description: '',
      type: 'tts',
      priority: 'normal',
      timezone: 'America/Lima',
      allowed_hours_start: '09:00',
      allowed_hours_end: '19:00',
      allowed_days: [1, 2, 3, 4, 5],
      max_attempts: 3,
      retry_delay_minutes: 60,
      debt_status: [],
      consent_required: true,
      exclude_broken_agreements: false,
      modalities: [],
      enrollment_statuses: [],
      payment_segments: [],
      payment_behaviors: [],
      dtmf_1_action: 'confirm',
      dtmf_2_action: 'send_whatsapp',
      dtmf_3_action: 'transfer_advisor',
      dtmf_repeat_key: '9',
      dtmf_record_response: false,
      post_call_create_follow_up: true,
      post_call_send_whatsapp_on_no_answer: false,
      ai_language: 'es',
      ai_voice: 'nova',
    },
  })

  const type = form.watch('type')

  // Cargar campaña existente en modo edición
  const { data: existing, isLoading: loadingExisting } = useQuery({
    queryKey: ['campaign', uuid],
    queryFn: async () => {
      const res = await api.get<ApiResource<Campaign>>(`/campaigns/${uuid}`)
      return res.data.data
    },
    enabled: isEdit,
  })

  useEffect(() => {
    if (!existing) return
    const sf = existing.segment_filters ?? {}
    const dtmf = existing.dtmf_options ?? {}
    const rules = (existing.post_call_rules ?? {}) as Record<string, unknown>
    const dtmfEntry = (k: string) => {
      const v = dtmf[k]
      return typeof v === 'object' && v !== null ? v : undefined
    }
    form.reset({
      ...form.getValues(),
      name: existing.name,
      description: existing.description ?? '',
      type: existing.type,
      priority: String(existing.priority ?? 'normal'),
      starts_at: existing.starts_at?.slice(0, 16) ?? '',
      ends_at: existing.ends_at?.slice(0, 16) ?? '',
      timezone: existing.timezone ?? 'America/Lima',
      allowed_hours_start: existing.allowed_hours_start?.slice(0, 5) ?? '09:00',
      allowed_hours_end: existing.allowed_hours_end?.slice(0, 5) ?? '19:00',
      allowed_days: (existing.allowed_days ?? [1, 2, 3, 4, 5]).map(Number),
      max_attempts: existing.max_attempts ?? 3,
      retry_delay_minutes: existing.retry_delay_minutes ?? 60,
      min_debt: sf.min_debt != null ? String(sf.min_debt) : '',
      max_debt: sf.max_debt != null ? String(sf.max_debt) : '',
      min_days_overdue: sf.min_days_overdue != null ? String(sf.min_days_overdue) : '',
      debt_status: sf.debt_status ?? [],
      cities: (sf.city ?? []).join(', '),
      segments: (sf.segment ?? []).join(', '),
      tags: (sf.tags ?? []).join(', '),
      consent_required: sf.consent_required ?? true,
      exclude_broken_agreements: sf.exclude_broken_agreements ?? false,
      max_attempts_lt: sf.max_attempts_lt != null ? String(sf.max_attempts_lt) : '',
      campus_id: sf.campus_id?.length ? String(sf.campus_id[0]) : '',
      faculty_id: sf.faculty_id?.length ? String(sf.faculty_id[0]) : '',
      career_id: sf.career_id?.length ? String(sf.career_id[0]) : '',
      academic_level_id: sf.academic_level_id?.length ? String(sf.academic_level_id[0]) : '',
      academic_period: sf.academic_period?.[0] ?? '',
      modalities: sf.modality ?? [],
      enrollment_statuses: sf.enrollment_status ?? [],
      payment_segments: sf.payment_segment ?? [],
      payment_behaviors: sf.payment_behavior ?? [],
      tts_message: existing.tts_message ?? '',
      audio_url: existing.audio_url ?? '',
      dtmf_1_action: dtmfEntry('1')?.action ?? 'confirm',
      dtmf_2_action: dtmfEntry('2')?.action ?? 'send_whatsapp',
      dtmf_3_action: dtmfEntry('3')?.action ?? 'transfer_advisor',
      dtmf_2_template_uuid: dtmfEntry('2')?.template_uuid ?? '',
      dtmf_repeat_key: typeof dtmf.repeat_key === 'string' ? dtmf.repeat_key : '9',
      dtmf_record_response: !!dtmf.record_response,
      prompt_uuid: existing.prompt_uuid ?? '',
      ai_voice: existing.ai_voice ?? 'nova',
      ai_language: existing.ai_language ?? 'es',
      greeting_message: existing.greeting_message ?? '',
      farewell_message: existing.farewell_message ?? '',
      whatsapp_template_uuid: existing.whatsapp_template_uuid ?? '',
      post_call_create_follow_up: rules.create_follow_up !== false,
      post_call_send_whatsapp_on_no_answer: !!rules.send_whatsapp_on_no_answer,
      post_call_notes: typeof rules.notes === 'string' ? rules.notes : '',
      budget_limit: existing.budget_limit != null ? String(existing.budget_limit) : '',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing])

  const { data: prompts } = useQuery({
    queryKey: ['prompts', 'all'],
    queryFn: async () => {
      const res = await api.get<Paginated<Prompt>>('/prompts', { params: { per_page: 100 } })
      return res.data.data
    },
    enabled: type === 'ai_conversational',
  })

  const { data: waTemplates } = useQuery({
    queryKey: ['whatsapp-templates'],
    queryFn: async () => {
      const res = await api.get<Paginated<WhatsAppTemplate>>('/whatsapp-templates', { params: { per_page: 100 } })
      return res.data.data
    },
    enabled: type === 'whatsapp' || type === 'recorded_audio',
  })

  const buildSegmentFilters = (values: WizardForm) => {
    const list = (s?: string) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : [])
    return {
      min_debt: values.min_debt ? Number(values.min_debt) : null,
      max_debt: values.max_debt ? Number(values.max_debt) : null,
      min_days_overdue: values.min_days_overdue ? Number(values.min_days_overdue) : null,
      debt_status: values.debt_status,
      city: list(values.cities),
      segment: list(values.segments),
      tags: list(values.tags),
      consent_required: values.consent_required,
      exclude_broken_agreements: values.exclude_broken_agreements,
      max_attempts_lt: values.max_attempts_lt ? Number(values.max_attempts_lt) : null,
      // Filtros académicos
      campus_id: values.campus_id ? [Number(values.campus_id)] : [],
      faculty_id: values.faculty_id ? [Number(values.faculty_id)] : [],
      career_id: values.career_id ? [Number(values.career_id)] : [],
      academic_level_id: values.academic_level_id ? [Number(values.academic_level_id)] : [],
      academic_period: values.academic_period ? [values.academic_period] : [],
      modality: values.modalities,
      enrollment_status: values.enrollment_statuses,
      payment_segment: values.payment_segments,
      payment_behavior: values.payment_behaviors,
    }
  }

  const buildPayload = (values: WizardForm) => {
    const payload: Record<string, unknown> = {
      name: values.name,
      description: values.description || null,
      type: values.type,
      priority: values.priority,
      starts_at: values.starts_at || null,
      ends_at: values.ends_at || null,
      timezone: values.timezone,
      allowed_hours_start: values.allowed_hours_start,
      allowed_hours_end: values.allowed_hours_end,
      allowed_days: values.allowed_days,
      max_attempts: values.max_attempts,
      retry_delay_minutes: values.retry_delay_minutes,
      segment_filters: buildSegmentFilters(values),
      post_call_rules: {
        create_follow_up: values.post_call_create_follow_up,
        send_whatsapp_on_no_answer: values.post_call_send_whatsapp_on_no_answer,
        notes: values.post_call_notes || null,
      },
      budget_limit: values.budget_limit ? Number(values.budget_limit) : null,
    }
    if (values.type === 'tts') payload.tts_message = values.tts_message
    if (values.type === 'recorded_audio') {
      payload.audio_url = values.audio_url || null
      payload.dtmf_options = {
        '1': { action: values.dtmf_1_action },
        '2':
          values.dtmf_2_action === 'send_whatsapp'
            ? { action: 'send_whatsapp', template_uuid: values.dtmf_2_template_uuid || undefined }
            : { action: values.dtmf_2_action },
        '3': { action: values.dtmf_3_action },
        repeat_key: values.dtmf_repeat_key,
        record_response: values.dtmf_record_response,
      }
    }
    if (values.type === 'ai_conversational') {
      payload.prompt_uuid = values.prompt_uuid || null
      payload.ai_voice = values.ai_voice
      payload.ai_language = values.ai_language
      payload.greeting_message = values.greeting_message || null
      payload.farewell_message = values.farewell_message || null
    }
    if (values.type === 'whatsapp') payload.whatsapp_template_uuid = values.whatsapp_template_uuid || null
    return payload
  }

  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post<ApiResource<SegmentPreview>>('/campaigns/preview-segment', {
        segment_filters: buildSegmentFilters(form.getValues()),
      })
      return res.data.data
    },
    onSuccess: (data) => setPreview(data),
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  const saveMutation = useMutation({
    mutationFn: async (values: WizardForm) => {
      const payload = buildPayload(values)
      const res = isEdit
        ? await api.put<ApiResource<Campaign>>(`/campaigns/${uuid}`, payload)
        : await api.post<ApiResource<Campaign>>('/campaigns', payload)
      const campaign = res.data.data
      // Subir audio si corresponde
      if (values.type === 'recorded_audio' && audioFile) {
        const fd = new FormData()
        fd.append('file', audioFile)
        await api.post(`/campaigns/${campaign.uuid}/audio`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      }
      const action = pendingAction.current
      if (action === 'launch') {
        await api.post(`/campaigns/${campaign.uuid}/launch`)
      } else if (action === 'schedule' && values.starts_at) {
        await api.post(`/campaigns/${campaign.uuid}/schedule`, { starts_at: values.starts_at })
      }
      return campaign
    },
    onSuccess: (campaign) => {
      const action = pendingAction.current
      toast.success(
        action === 'launch' ? 'Campaña lanzada' : action === 'schedule' ? 'Campaña programada' : 'Campaña guardada',
      )
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      navigate(`/campaigns/${campaign.uuid}`)
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  const next = async () => {
    const fields = STEP_FIELDS[step]
    const valid = fields.length ? await form.trigger(fields) : true
    if (!valid) return
    if (step === 2) {
      // Validaciones de contenido según tipo
      const v = form.getValues()
      if (type === 'tts' && !v.tts_message?.trim()) {
        toast.error('Escribe el mensaje de texto a voz')
        return
      }
      if (type === 'recorded_audio' && !audioFile && !v.audio_url) {
        toast.error('Sube un archivo de audio')
        return
      }
      if (type === 'ai_conversational' && !v.prompt_uuid) {
        toast.error('Selecciona un prompt de IA')
        return
      }
      if (type === 'whatsapp' && !v.whatsapp_template_uuid) {
        toast.error('Selecciona una plantilla de WhatsApp')
        return
      }
    }
    setStep((s) => Math.min(4, s + 1))
  }

  const submit = (action: 'save' | 'schedule' | 'launch') => {
    pendingAction.current = action
    if (action === 'launch') {
      setConfirmLaunch(true)
      return
    }
    form.handleSubmit((values) => saveMutation.mutate(values))()
  }

  const insertVariable = (variable: string) => {
    const current = form.getValues('tts_message') ?? ''
    form.setValue('tts_message', `${current}{{${variable}}}`)
  }

  if (isEdit && loadingExisting) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  const errors = form.formState.errors
  const values = form.watch()

  const STEPS = ['Datos generales', 'Segmentación', 'Contenido', 'Reglas y límites', 'Resumen']

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Button variant="ghost" size="sm" onClick={() => navigate('/campaigns')} className="mb-3 -ml-2">
        <ArrowLeft />
        Volver a campañas
      </Button>
      <PageHeader title={isEdit ? `Editar campaña` : 'Nueva campaña'} description={isEdit ? existing?.name : 'Configura una nueva campaña de cobranza'} />

      {/* Pasos */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => i < step && setStep(i)}
            className={cn(
              'flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors',
              i === step
                ? 'bg-primary text-primary-foreground'
                : i < step
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground',
            )}
          >
            {i < step && <CheckCircle2 className="h-3.5 w-3.5" />}
            {i + 1}. {label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-6">
          {/* Paso 1: Datos generales */}
          {step === 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Nombre de la campaña" error={errors.name?.message} required className="sm:col-span-2">
                <Input {...form.register('name')} placeholder="p. ej. Recordatorio mora 30 días" />
              </FormField>
              <FormField label="Descripción" className="sm:col-span-2">
                <Textarea rows={2} {...form.register('description')} />
              </FormField>
              <FormField label="Tipo de campaña" required>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'recorded_audio', label: 'Audio', icon: AudioLines },
                    { value: 'tts', label: 'Texto a voz', icon: MessageSquareText },
                    { value: 'ai_conversational', label: 'IA', icon: Bot },
                    { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => form.setValue('type', opt.value as WizardForm['type'])}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm transition-colors hover:bg-accent',
                        type === opt.value && 'border-primary bg-primary/5 ring-1 ring-primary',
                      )}
                    >
                      <opt.icon className="h-4 w-4 text-primary" />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </FormField>
              <FormField label="Prioridad">
                <Select value={values.priority} onValueChange={(v) => form.setValue('priority', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baja</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="urgent">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Fecha de inicio">
                <Input type="datetime-local" {...form.register('starts_at')} />
              </FormField>
              <FormField label="Fecha de fin">
                <Input type="datetime-local" {...form.register('ends_at')} />
              </FormField>
              <FormField label="Zona horaria">
                <Select value={values.timezone} onValueChange={(v) => form.setValue('timezone', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="America/Lima">América/Lima (GMT-5)</SelectItem>
                    <SelectItem value="America/Bogota">América/Bogotá (GMT-5)</SelectItem>
                    <SelectItem value="America/Mexico_City">América/Ciudad de México</SelectItem>
                    <SelectItem value="America/Santiago">América/Santiago</SelectItem>
                    <SelectItem value="America/Argentina/Buenos_Aires">América/Buenos Aires</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Horario permitido">
                <div className="flex items-center gap-2">
                  <Input type="time" {...form.register('allowed_hours_start')} />
                  <span className="text-sm text-muted-foreground">a</span>
                  <Input type="time" {...form.register('allowed_hours_end')} />
                </div>
              </FormField>
              <FormField label="Días permitidos" className="sm:col-span-2">
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((d) => {
                    const selected = values.allowed_days.includes(d.value)
                    return (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() =>
                          form.setValue(
                            'allowed_days',
                            selected
                              ? values.allowed_days.filter((x) => x !== d.value)
                              : [...values.allowed_days, d.value].sort(),
                          )
                        }
                        className={cn(
                          'cursor-pointer rounded-full border px-3 py-1 text-sm transition-colors',
                          selected ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent',
                        )}
                      >
                        {d.label}
                      </button>
                    )
                  })}
                </div>
              </FormField>
              <FormField label="Intentos máximos" error={errors.max_attempts?.message}>
                <Input type="number" min={1} max={10} {...form.register('max_attempts', { valueAsNumber: true })} />
              </FormField>
              <FormField label="Reintentar después de (minutos)" error={errors.retry_delay_minutes?.message}>
                <Input type="number" min={1} {...form.register('retry_delay_minutes', { valueAsNumber: true })} />
              </FormField>
            </div>
          )}

          {/* Paso 2: Segmentación */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <FormField label="Deuda mínima (S/)">
                  <Input type="number" {...form.register('min_debt')} placeholder="0" />
                </FormField>
                <FormField label="Deuda máxima (S/)">
                  <Input type="number" {...form.register('max_debt')} placeholder="Sin límite" />
                </FormField>
                <FormField label="Días de mora mínimos">
                  <Input type="number" {...form.register('min_days_overdue')} placeholder="0" />
                </FormField>
                <FormField label="Estados de deuda" className="sm:col-span-3">
                  <div className="flex flex-wrap gap-4">
                    {DEBT_STATUSES.map((s) => (
                      <label key={s.value} className="flex cursor-pointer items-center gap-2 text-sm">
                        <Checkbox
                          checked={values.debt_status.includes(s.value)}
                          onCheckedChange={(checked) =>
                            form.setValue(
                              'debt_status',
                              checked
                                ? [...values.debt_status, s.value]
                                : values.debt_status.filter((x) => x !== s.value),
                            )
                          }
                        />
                        {s.label}
                      </label>
                    ))}
                  </div>
                </FormField>
                <FormField label="Ciudades" hint="Separadas por comas">
                  <Input {...form.register('cities')} placeholder="Lima, Arequipa" />
                </FormField>
                <FormField label="Segmentos" hint="Separados por comas">
                  <Input {...form.register('segments')} placeholder="premium, retail" />
                </FormField>
                <FormField label="Etiquetas" hint="Separadas por comas">
                  <Input {...form.register('tags')} placeholder="vip" />
                </FormField>
                <FormField label="Intentos previos menores a">
                  <Input type="number" {...form.register('max_attempts_lt')} placeholder="Sin filtro" />
                </FormField>
              </div>
              <div className="flex flex-wrap gap-6 rounded-lg border p-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Switch
                    checked={values.consent_required}
                    onCheckedChange={(v) => form.setValue('consent_required', v)}
                  />
                  Solo contactos con consentimiento
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Switch
                    checked={values.exclude_broken_agreements}
                    onCheckedChange={(v) => form.setValue('exclude_broken_agreements', v)}
                  />
                  Excluir acuerdos incumplidos
                </label>
              </div>

              {/* Filtros académicos */}
              <div className="rounded-lg border p-4">
                <p className="mb-3 text-sm font-medium">Filtros académicos</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <FormField label="Campus">
                    <Select
                      value={values.campus_id || NONE}
                      onValueChange={(v) => form.setValue('campus_id', v === NONE ? '' : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Todos los campus</SelectItem>
                        {catalogs.campuses.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="Facultad">
                    <Select
                      value={values.faculty_id || NONE}
                      onValueChange={(v) => {
                        const next = v === NONE ? '' : v
                        form.setValue('faculty_id', next)
                        const careerId = form.getValues('career_id')
                        if (careerId && !careersForFaculty(next || undefined).some((c) => String(c.id) === careerId)) {
                          form.setValue('career_id', '')
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Todas las facultades</SelectItem>
                        {catalogs.faculties.map((f) => (
                          <SelectItem key={f.id} value={String(f.id)}>
                            {f.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="Carrera">
                    <Select
                      value={values.career_id || NONE}
                      onValueChange={(v) => form.setValue('career_id', v === NONE ? '' : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Todas las carreras</SelectItem>
                        {careersForFaculty(values.faculty_id || undefined).map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="Nivel académico">
                    <Select
                      value={values.academic_level_id || NONE}
                      onValueChange={(v) => form.setValue('academic_level_id', v === NONE ? '' : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Todos los niveles</SelectItem>
                        {catalogs.levels.map((l) => (
                          <SelectItem key={l.id} value={String(l.id)}>
                            {l.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="Periodo académico">
                    <Select
                      value={values.academic_period || NONE}
                      onValueChange={(v) => form.setValue('academic_period', v === NONE ? '' : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Todos los periodos</SelectItem>
                        {catalogs.periods.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="Modalidad">
                    <div className="flex flex-wrap gap-3 pt-1.5">
                      {catalogs.modalities.map((m) => (
                        <label key={m} className="flex cursor-pointer items-center gap-2 text-sm">
                          <Checkbox
                            checked={values.modalities.includes(m)}
                            onCheckedChange={(checked) =>
                              form.setValue(
                                'modalities',
                                checked ? [...values.modalities, m] : values.modalities.filter((x) => x !== m),
                              )
                            }
                          />
                          {modalityLabel(m)}
                        </label>
                      ))}
                    </div>
                  </FormField>
                  <FormField label="Estado de matrícula" className="sm:col-span-1">
                    <div className="flex flex-wrap gap-3 pt-1.5">
                      {(['matriculado', 'no_matriculado'] as const).map((s) => (
                        <label key={s} className="flex cursor-pointer items-center gap-2 text-sm">
                          <Checkbox
                            checked={values.enrollment_statuses.includes(s)}
                            onCheckedChange={(checked) =>
                              form.setValue(
                                'enrollment_statuses',
                                checked
                                  ? [...values.enrollment_statuses, s]
                                  : values.enrollment_statuses.filter((x) => x !== s),
                              )
                            }
                          />
                          {enrollmentLabel(s)}
                        </label>
                      ))}
                    </div>
                  </FormField>
                  <FormField label="Segmento de pago" className="sm:col-span-2">
                    <div className="flex flex-wrap gap-3 pt-1.5">
                      {catalogs.segments.map((s) => (
                        <label key={s.key} className="flex cursor-pointer items-center gap-2 text-sm">
                          <Checkbox
                            checked={values.payment_segments.includes(s.key)}
                            onCheckedChange={(checked) =>
                              form.setValue(
                                'payment_segments',
                                checked
                                  ? [...values.payment_segments, s.key]
                                  : values.payment_segments.filter((x) => x !== s.key),
                              )
                            }
                          />
                          {s.label || segmentLabel(s.key)}
                        </label>
                      ))}
                    </div>
                  </FormField>
                  <FormField label="Comportamiento de pago" className="sm:col-span-3">
                    <div className="flex flex-wrap gap-3 pt-1.5">
                      {catalogs.behaviors.map((b) => (
                        <label key={b.key} className="flex cursor-pointer items-center gap-2 text-sm">
                          <Checkbox
                            checked={values.payment_behaviors.includes(b.key)}
                            onCheckedChange={(checked) =>
                              form.setValue(
                                'payment_behaviors',
                                checked
                                  ? [...values.payment_behaviors, b.key]
                                  : values.payment_behaviors.filter((x) => x !== b.key),
                              )
                            }
                          />
                          {b.label || behaviorLabel(b.key)}
                        </label>
                      ))}
                    </div>
                  </FormField>
                </div>
              </div>

              <div className="rounded-lg border border-dashed p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Vista previa del segmento</p>
                  <Button variant="outline" size="sm" onClick={() => previewMutation.mutate()} loading={previewMutation.isPending}>
                    <Eye />
                    Vista previa
                  </Button>
                </div>
                {preview && (
                  <div className="mt-3">
                    <p className="text-2xl font-bold text-primary">{preview.count} contactos</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {preview.sample.map((c) => (
                        <Badge key={c.uuid} variant="secondary">
                          {fullName(c)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Paso 3: Contenido */}
          {step === 2 && (
            <div className="space-y-4">
              {type === 'recorded_audio' && (
                <>
                  <FormField label="Archivo de audio (mp3/wav)" required>
                    <div className="flex items-center gap-3">
                      <Button type="button" variant="outline" onClick={() => audioInputRef.current?.click()}>
                        <Upload />
                        {audioFile ? audioFile.name : values.audio_url ? 'Reemplazar audio' : 'Subir audio'}
                      </Button>
                      {values.audio_url && !audioFile && <audio controls src={values.audio_url} className="h-9" />}
                      <input
                        ref={audioInputRef}
                        type="file"
                        accept=".mp3,.wav,audio/mpeg,audio/wav"
                        className="hidden"
                        onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
                      />
                    </div>
                  </FormField>
                  <div className="rounded-lg border p-4">
                    <p className="mb-3 text-sm font-medium">Opciones DTMF (teclas durante la llamada)</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {(['1', '2', '3'] as const).map((key) => {
                        const field = `dtmf_${key}_action` as FieldPath<WizardForm>
                        const value = values[`dtmf_${key}_action` as keyof WizardForm] as string
                        return (
                          <FormField key={key} label={`Presione ${key}`}>
                            <Select value={value} onValueChange={(v) => form.setValue(field, v)}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="confirm">Confirmar pago</SelectItem>
                                <SelectItem value="send_whatsapp">Enviar WhatsApp</SelectItem>
                                <SelectItem value="transfer_advisor">Transferir a asesor</SelectItem>
                              </SelectContent>
                            </Select>
                          </FormField>
                        )
                      })}
                      {(values.dtmf_1_action === 'send_whatsapp' ||
                        values.dtmf_2_action === 'send_whatsapp' ||
                        values.dtmf_3_action === 'send_whatsapp') && (
                        <FormField label="Plantilla de WhatsApp a enviar" className="sm:col-span-2">
                          <Select
                            value={values.dtmf_2_template_uuid || NONE}
                            onValueChange={(v) => form.setValue('dtmf_2_template_uuid', v === NONE ? '' : v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona plantilla" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>— Sin plantilla —</SelectItem>
                              {(waTemplates ?? []).map((t) => (
                                <SelectItem key={t.uuid} value={t.uuid}>
                                  {t.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormField>
                      )}
                      <FormField label="Tecla para repetir">
                        <Input maxLength={1} {...form.register('dtmf_repeat_key')} />
                      </FormField>
                      <label className="flex cursor-pointer items-center gap-2 pt-6 text-sm">
                        <Switch
                          checked={values.dtmf_record_response}
                          onCheckedChange={(v) => form.setValue('dtmf_record_response', v)}
                        />
                        Grabar respuesta
                      </label>
                    </div>
                  </div>
                </>
              )}

              {type === 'tts' && (
                <>
                  <FormField label="Mensaje (texto a voz)" required hint="Usa los botones para insertar variables">
                    <Textarea
                      rows={6}
                      {...form.register('tts_message')}
                      placeholder="Hola {{nombre}}, le recordamos que tiene una deuda pendiente de {{saldo}} con vencimiento {{fecha_vencimiento}}…"
                    />
                  </FormField>
                  <div className="flex flex-wrap gap-1.5">
                    {TTS_VARIABLES.map((v) => (
                      <Button key={v} type="button" variant="outline" size="sm" onClick={() => insertVariable(v)}>
                        {'{{'}{v}{'}}'}
                      </Button>
                    ))}
                  </div>
                  {!!values.tts_message && (
                    <div className="rounded-lg border bg-muted/40 p-4">
                      <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Vista previa</p>
                      <p className="text-sm">
                        {values.tts_message
                          .replace(/\{\{nombre\}\}/g, 'María')
                          .replace(/\{\{apellido\}\}/g, 'García')
                          .replace(/\{\{saldo\}\}/g, 'S/ 1,250.00')
                          .replace(/\{\{fecha_vencimiento\}\}/g, '15 de agosto')
                          .replace(/\{\{dias_mora\}\}/g, '30')
                          .replace(/\{\{empresa\}\}/g, 'Mi Empresa')
                          .replace(/\{\{referencia\}\}/g, 'CRD-00123')}
                      </p>
                    </div>
                  )}
                </>
              )}

              {type === 'ai_conversational' && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField label="Prompt publicado" required className="sm:col-span-2">
                    <Select
                      value={values.prompt_uuid || NONE}
                      onValueChange={(v) => form.setValue('prompt_uuid', v === NONE ? '' : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un prompt" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>— Selecciona —</SelectItem>
                        {(prompts ?? []).map((p) => (
                          <SelectItem key={p.uuid} value={p.uuid}>
                            {p.name}
                            {p.published_version ? ` (v${p.published_version.version} publicada)` : ' (sin publicar)'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="Voz">
                    <Select value={values.ai_voice ?? 'nova'} onValueChange={(v) => form.setValue('ai_voice', v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VOICES.map((v) => (
                          <SelectItem key={v} value={v}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="Idioma">
                    <Select value={values.ai_language ?? 'es'} onValueChange={(v) => form.setValue('ai_language', v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="es">Español</SelectItem>
                        <SelectItem value="en">Inglés</SelectItem>
                        <SelectItem value="pt">Portugués</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="Mensaje inicial" className="sm:col-span-2">
                    <Textarea rows={2} {...form.register('greeting_message')} placeholder="Hola, le llamamos de…" />
                  </FormField>
                  <FormField label="Mensaje de despedida" className="sm:col-span-2">
                    <Textarea rows={2} {...form.register('farewell_message')} placeholder="Gracias por su tiempo…" />
                  </FormField>
                </div>
              )}

              {type === 'whatsapp' && (
                <FormField label="Plantilla de WhatsApp" required>
                  <Select
                    value={values.whatsapp_template_uuid || NONE}
                    onValueChange={(v) => form.setValue('whatsapp_template_uuid', v === NONE ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona plantilla" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— Selecciona —</SelectItem>
                      {(waTemplates ?? []).map((t) => (
                        <SelectItem key={t.uuid} value={t.uuid}>
                          {t.name} {t.status ? `(${t.status})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              )}
            </div>
          )}

          {/* Paso 4: Reglas post-llamada y límites */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-3 rounded-lg border p-4">
                <p className="text-sm font-medium">Reglas post-llamada</p>
                <label className="flex cursor-pointer items-center justify-between gap-2 text-sm">
                  Crear seguimiento automático tras promesa de pago
                  <Switch
                    checked={values.post_call_create_follow_up}
                    onCheckedChange={(v) => form.setValue('post_call_create_follow_up', v)}
                  />
                </label>
                <label className="flex cursor-pointer items-center justify-between gap-2 text-sm">
                  Enviar WhatsApp si no contesta
                  <Switch
                    checked={values.post_call_send_whatsapp_on_no_answer}
                    onCheckedChange={(v) => form.setValue('post_call_send_whatsapp_on_no_answer', v)}
                  />
                </label>
                <FormField label="Notas / instrucciones adicionales">
                  <Textarea rows={3} {...form.register('post_call_notes')} />
                </FormField>
              </div>
              <FormField label="Límite de presupuesto (S/)" hint="La campaña se pausará al alcanzar este costo. Vacío = sin límite">
                <Input type="number" step="0.01" {...form.register('budget_limit')} placeholder="p. ej. 500.00" />
              </FormField>
            </div>
          )}

          {/* Paso 5: Resumen */}
          {step === 4 && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Resumen de la campaña</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                  <SummaryRow label="Nombre" value={values.name} />
                  <SummaryRow label="Tipo" value={
                    { recorded_audio: 'Audio grabado', tts: 'Texto a voz', ai_conversational: 'IA conversacional', whatsapp: 'WhatsApp' }[type]
                  } />
                  <SummaryRow label="Prioridad" value={values.priority} />
                  <SummaryRow label="Zona horaria" value={values.timezone} />
                  <SummaryRow label="Horario" value={`${values.allowed_hours_start} – ${values.allowed_hours_end}`} />
                  <SummaryRow
                    label="Días"
                    value={DAYS.filter((d) => values.allowed_days.includes(d.value)).map((d) => d.label).join(', ')}
                  />
                  <SummaryRow label="Intentos máx." value={String(values.max_attempts)} />
                  <SummaryRow label="Reintento" value={`cada ${values.retry_delay_minutes} min`} />
                  <SummaryRow label="Inicio" value={values.starts_at || 'Inmediato'} />
                  <SummaryRow label="Presupuesto" value={values.budget_limit ? formatMoney(values.budget_limit) : 'Sin límite'} />
                  {preview && <SummaryRow label="Contactos estimados" value={`${preview.count}`} />}
                </CardContent>
              </Card>
              <p className="text-sm text-muted-foreground">
                Puedes guardar como borrador, programarla para la fecha de inicio o lanzarla de inmediato.
              </p>
            </div>
          )}

          {/* Navegación */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => (step === 0 ? navigate('/campaigns') : setStep(step - 1))}>
              <ArrowLeft />
              {step === 0 ? 'Cancelar' : 'Atrás'}
            </Button>
            <div className="flex flex-wrap gap-2">
              {step < 4 ? (
                <Button onClick={next}>
                  Siguiente
                  <ArrowRight />
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => submit('save')} loading={saveMutation.isPending && pendingAction.current === 'save'}>
                    <Save />
                    Guardar borrador
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => submit('schedule')}
                    disabled={!values.starts_at}
                    loading={saveMutation.isPending && pendingAction.current === 'schedule'}
                  >
                    <CalendarClock />
                    Programar
                  </Button>
                  <Button onClick={() => submit('launch')} loading={saveMutation.isPending && pendingAction.current === 'launch'}>
                    <Rocket />
                    Lanzar ahora
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmLaunch}
        onOpenChange={setConfirmLaunch}
        title="Lanzar campaña"
        description="Se guardará la campaña y comenzarán las llamadas o mensajes inmediatamente a todos los contactos del segmento. ¿Deseas continuar?"
        confirmLabel="Lanzar campaña"
        onConfirm={async () => {
          await form.handleSubmit(async (v) => {
            await saveMutation.mutateAsync(v)
          })()
        }}
      />
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between gap-4 border-b py-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value || '—'}</span>
    </div>
  )
}
