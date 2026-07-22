import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Bot,
  Copy,
  History,
  MessageSquare,
  Plus,
  RotateCcw,
  Save,
  Send,
  Trash2,
  UploadCloud,
  Wrench,
  X,
} from 'lucide-react'
import { api, apiErrorMessage } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { formatDateTime } from '@/lib/format'
import type { ApiResource, Paginated, Prompt, PromptVersion, SimulateResponse } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { FormField } from '@/components/shared/FormField'
import { JsonViewer } from '@/components/shared/JsonViewer'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { cn } from '@/lib/utils'

const AVAILABLE_TOOLS = [
  { value: 'consultar_deuda', label: 'Consultar deuda' },
  { value: 'consultar_contacto', label: 'Consultar contacto' },
  { value: 'registrar_acuerdo', label: 'Registrar acuerdo de pago' },
  { value: 'registrar_promesa', label: 'Registrar promesa de pago' },
  { value: 'agendar_rellamada', label: 'Agendar rellamada' },
  { value: 'enviar_whatsapp', label: 'Enviar WhatsApp' },
  { value: 'transferir_asesor', label: 'Transferir a asesor' },
  { value: 'registrar_disputa', label: 'Registrar disputa' },
  { value: 'actualizar_datos', label: 'Actualizar datos de contacto' },
  { value: 'marcar_no_contactar', label: 'Marcar no contactar' },
]

const versionSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  description: z.string().optional(),
  system_prompt: z.string().min(1, 'El system prompt es obligatorio'),
  instructions: z.string().optional(),
  greeting_message: z.string().optional(),
  farewell_message: z.string().optional(),
  enabled_tools: z.array(z.string()),
  forbidden_data: z.string().optional(),
  security_rules: z.string().optional(),
  faq: z.array(z.object({ q: z.string(), a: z.string() })),
  extraction_fields: z.string().optional(),
  max_duration_seconds: z.string().optional(),
})

type VersionForm = z.infer<typeof versionSchema>

export default function Prompts() {
  const queryClient = useQueryClient()
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [simulatorOpen, setSimulatorOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Prompt | null>(null)

  const { data: prompts, isLoading } = useQuery({
    queryKey: ['prompts'],
    queryFn: async () => {
      const res = await api.get<Paginated<Prompt>>('/prompts', { params: { per_page: 100 } })
      return res.data.data
    },
  })

  const { data: selected, isLoading: loadingSelected } = useQuery({
    queryKey: ['prompt', selectedUuid],
    queryFn: async () => {
      const res = await api.get<ApiResource<Prompt>>(`/prompts/${selectedUuid}`)
      return res.data.data
    },
    enabled: !!selectedUuid,
  })

  const duplicate = useMutation({
    mutationFn: (uuid: string) => api.post(`/prompts/${uuid}/duplicate`),
    onSuccess: () => {
      toast.success('Prompt duplicado')
      queryClient.invalidateQueries({ queryKey: ['prompts'] })
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  const remove = useMutation({
    mutationFn: (uuid: string) => api.delete(`/prompts/${uuid}`),
    onSuccess: () => {
      toast.success('Prompt eliminado')
      setSelectedUuid(null)
      queryClient.invalidateQueries({ queryKey: ['prompts'] })
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  return (
    <div className="flex h-full flex-col p-6">
      <PageHeader
        title="Prompts IA"
        description="Agentes conversacionales para llamadas con IA"
        actions={
          hasPermission('prompts.create') && (
            <Button
              onClick={() => {
                setSelectedUuid(null)
                setCreating(true)
              }}
            >
              <Plus />
              Nuevo prompt
            </Button>
          )
        }
      />

      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
        {/* Lista */}
        <div className="space-y-2">
          {isLoading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
          {!isLoading && !prompts?.length && (
            <EmptyState icon={Bot} title="Sin prompts" description="Crea tu primer agente de IA." />
          )}
          {prompts?.map((p) => (
            <button
              key={p.uuid}
              type="button"
              onClick={() => {
                setSelectedUuid(p.uuid)
                setCreating(false)
              }}
              className={cn(
                'w-full cursor-pointer rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent',
                selectedUuid === p.uuid && 'border-primary ring-1 ring-primary',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-medium">{p.name}</p>
                {p.published_version ? <StatusBadge status="published" /> : <StatusBadge status="draft" />}
              </div>
              {p.description && <p className="mt-0.5 truncate text-xs text-muted-foreground">{p.description}</p>}
            </button>
          ))}
        </div>

        {/* Editor */}
        <div>
          {creating && (
            <PromptEditor
              key="new"
              prompt={null}
              onSaved={(uuid) => {
                setCreating(false)
                setSelectedUuid(uuid)
                queryClient.invalidateQueries({ queryKey: ['prompts'] })
              }}
            />
          )}
          {!creating && selectedUuid && loadingSelected && <Skeleton className="h-96 w-full" />}
          {!creating && selected && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">{selected.name}</h2>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSimulatorOpen(true)}>
                    <MessageSquare />
                    Simulador
                  </Button>
                  {hasPermission('prompts.create') && (
                    <Button variant="outline" size="sm" onClick={() => duplicate.mutate(selected.uuid)}>
                      <Copy />
                      Duplicar
                    </Button>
                  )}
                  {hasPermission('prompts.delete') && (
                    <Button variant="outline" size="sm" className="text-destructive" onClick={() => setDeleteTarget(selected)}>
                      <Trash2 />
                      Eliminar
                    </Button>
                  )}
                </div>
              </div>
              <Tabs defaultValue="editor">
                <TabsList>
                  <TabsTrigger value="editor">Editor</TabsTrigger>
                  <TabsTrigger value="versions">
                    <History className="h-3.5 w-3.5" />
                    Versiones ({selected.versions?.length ?? 0})
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="editor">
                  <PromptEditor
                    key={selected.uuid}
                    prompt={selected}
                    onSaved={() => {
                      queryClient.invalidateQueries({ queryKey: ['prompt', selected.uuid] })
                      queryClient.invalidateQueries({ queryKey: ['prompts'] })
                    }}
                  />
                </TabsContent>
                <TabsContent value="versions">
                  <VersionsList prompt={selected} />
                </TabsContent>
              </Tabs>
            </div>
          )}
          {!creating && !selectedUuid && (
            <EmptyState
              icon={Bot}
              title="Selecciona un prompt"
              description="Elige un prompt de la lista o crea uno nuevo para editarlo."
              className="rounded-lg border border-dashed py-24"
            />
          )}
        </div>
      </div>

      {selected && <SimulatorDrawer prompt={selected} open={simulatorOpen} onOpenChange={setSimulatorOpen} />}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Eliminar prompt"
        description={`¿Eliminar el prompt "${deleteTarget?.name}"? Las campañas que lo usen dejarán de funcionar.`}
        confirmLabel="Eliminar"
        destructive
        onConfirm={async () => {
          if (deleteTarget) await remove.mutateAsync(deleteTarget.uuid)
        }}
      />
    </div>
  )
}

function PromptEditor({ prompt, onSaved }: { prompt: Prompt | null; onSaved: (uuid: string) => void }) {
  const version = prompt?.current_version ?? prompt?.published_version ?? null

  const form = useForm<VersionForm>({
    resolver: zodResolver(versionSchema),
    defaultValues: {
      name: prompt?.name ?? '',
      description: prompt?.description ?? '',
      system_prompt: version?.system_prompt ?? '',
      instructions: version?.instructions ?? '',
      greeting_message: version?.greeting_message ?? '',
      farewell_message: version?.farewell_message ?? '',
      enabled_tools: version?.enabled_tools ?? [],
      forbidden_data: (version?.guardrails?.forbidden_data ?? []).join('\n'),
      security_rules: (version?.guardrails?.security_rules ?? []).join('\n'),
      faq: version?.faq ?? [],
      extraction_fields: (version?.extraction_fields ?? []).join(', '),
      max_duration_seconds: version?.max_duration_seconds != null ? String(version.max_duration_seconds) : '',
    },
  })

  const faqArray = useFieldArray({ control: form.control, name: 'faq' })
  const errors = form.formState.errors
  const enabledTools = form.watch('enabled_tools')

  const save = useMutation({
    mutationFn: async (values: VersionForm) => {
      const versionPayload = {
        system_prompt: values.system_prompt,
        instructions: values.instructions || null,
        greeting_message: values.greeting_message || null,
        farewell_message: values.farewell_message || null,
        enabled_tools: values.enabled_tools,
        guardrails: {
          forbidden_data: (values.forbidden_data ?? '').split('\n').map((s) => s.trim()).filter(Boolean),
          security_rules: (values.security_rules ?? '').split('\n').map((s) => s.trim()).filter(Boolean),
        },
        faq: values.faq.filter((f) => f.q.trim() || f.a.trim()),
        extraction_fields: (values.extraction_fields ?? '').split(',').map((s) => s.trim()).filter(Boolean),
        max_duration_seconds: values.max_duration_seconds ? Number(values.max_duration_seconds) : null,
      }
      if (prompt) {
        await api.put(`/prompts/${prompt.uuid}`, { name: values.name, description: values.description || null })
        await api.post(`/prompts/${prompt.uuid}/versions`, versionPayload)
        return prompt.uuid
      }
      const res = await api.post<ApiResource<Prompt>>('/prompts', {
        name: values.name,
        description: values.description || null,
        ...versionPayload,
      })
      return res.data.data.uuid
    },
    onSuccess: (uuid) => {
      toast.success(prompt ? 'Nueva versión guardada' : 'Prompt creado')
      onSaved(uuid)
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  return (
    <Card>
      <CardContent className="p-5">
        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Nombre" error={errors.name?.message} required>
              <Input {...form.register('name')} placeholder="p. ej. Cobranza amable" />
            </FormField>
            <FormField label="Descripción">
              <Input {...form.register('description')} />
            </FormField>
          </div>

          <FormField label="System prompt" error={errors.system_prompt?.message} required>
            <Textarea rows={10} className="font-mono text-xs" {...form.register('system_prompt')} placeholder="Eres un agente de cobranzas amable y profesional…" />
          </FormField>

          <FormField label="Instrucciones adicionales">
            <Textarea rows={4} {...form.register('instructions')} />
          </FormField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Mensaje inicial">
              <Textarea rows={2} {...form.register('greeting_message')} />
            </FormField>
            <FormField label="Mensaje de despedida">
              <Textarea rows={2} {...form.register('farewell_message')} />
            </FormField>
          </div>

          <FormField label="Herramientas habilitadas">
            <div className="grid grid-cols-1 gap-2 rounded-lg border p-3 sm:grid-cols-2">
              {AVAILABLE_TOOLS.map((t) => (
                <label key={t.value} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={enabledTools.includes(t.value)}
                    onCheckedChange={(checked) =>
                      form.setValue(
                        'enabled_tools',
                        checked ? [...enabledTools, t.value] : enabledTools.filter((x) => x !== t.value),
                      )
                    }
                  />
                  <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                  {t.label}
                </label>
              ))}
            </div>
          </FormField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Guardrails: datos prohibidos" hint="Uno por línea">
              <Textarea rows={3} {...form.register('forbidden_data')} placeholder={'números de tarjeta\ncontraseñas'} />
            </FormField>
            <FormField label="Guardrails: reglas de seguridad" hint="Una por línea">
              <Textarea rows={3} {...form.register('security_rules')} placeholder={'nunca amenazar\nno revelar datos de terceros'} />
            </FormField>
          </div>

          <FormField label="Preguntas frecuentes (FAQ)">
            <div className="space-y-2">
              {faqArray.fields.map((field, i) => (
                <div key={field.id} className="flex items-start gap-2">
                  <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                    <Input {...form.register(`faq.${i}.q`)} placeholder="Pregunta" />
                    <Input {...form.register(`faq.${i}.a`)} placeholder="Respuesta" />
                  </div>
                  <Button type="button" variant="ghost" size="iconSm" onClick={() => faqArray.remove(i)}>
                    <X />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => faqArray.append({ q: '', a: '' })}>
                <Plus />
                Agregar pregunta
              </Button>
            </div>
          </FormField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Campos de extracción" hint="Separados por comas — se extraen al final de la llamada">
              <Input {...form.register('extraction_fields')} placeholder="monto_prometido, fecha_promesa, motivo_no_pago" />
            </FormField>
            <FormField label="Duración máxima (segundos)">
              <Input type="number" {...form.register('max_duration_seconds')} placeholder="300" />
            </FormField>
          </div>

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="submit" loading={save.isPending}>
              <Save />
              {prompt ? 'Guardar nueva versión' : 'Crear prompt'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function VersionsList({ prompt }: { prompt: Prompt }) {
  const queryClient = useQueryClient()
  const hasPermission = useAuthStore((s) => s.hasPermission)

  const action = useMutation({
    mutationFn: ({ version, act }: { version: PromptVersion; act: 'publish' | 'restore' }) =>
      api.post(`/prompts/${prompt.uuid}/versions/${version.version}/${act}`),
    onSuccess: (_, vars) => {
      toast.success(vars.act === 'publish' ? 'Versión publicada' : 'Versión restaurada')
      queryClient.invalidateQueries({ queryKey: ['prompt', prompt.uuid] })
      queryClient.invalidateQueries({ queryKey: ['prompts'] })
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  if (!prompt.versions?.length) {
    return <EmptyState icon={History} title="Sin versiones" description="Guarda cambios en el editor para crear versiones." />
  }

  return (
    <div className="space-y-2">
      {prompt.versions.map((v, i) => (
        <div key={v.uuid ?? i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium">
              Versión {v.version ?? i + 1}
              {v.status && <StatusBadge status={v.status} />}
              {v.published_at && <Badge variant="success">Publicada {formatDateTime(v.published_at)}</Badge>}
            </p>
            <p className="text-xs text-muted-foreground">Creada {formatDateTime(v.created_at)}</p>
          </div>
          <div className="flex gap-2">
            {hasPermission('prompts.edit') && v.status !== 'published' && (
              <Button variant="outline" size="sm" onClick={() => action.mutate({ version: v, act: 'publish' })}>
                <UploadCloud />
                Publicar
              </Button>
            )}
            {hasPermission('prompts.edit') && (
              <Button variant="ghost" size="sm" onClick={() => action.mutate({ version: v, act: 'restore' })}>
                <RotateCcw />
                Restaurar
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: SimulateResponse['tool_calls']
}

function SimulatorDrawer({ prompt, open, onOpenChange }: { prompt: Prompt; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sessionUuid, setSessionUuid] = useState<string | null>(null)
  const [structuredResult, setStructuredResult] = useState<Record<string, unknown> | null>(null)
  const [finished, setFinished] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const send = useMutation({
    mutationFn: async (message: string) => {
      const res = await api.post<ApiResource<SimulateResponse>>(`/prompts/${prompt.uuid}/simulate`, {
        session_uuid: sessionUuid ?? undefined,
        message,
      })
      return res.data.data
    },
    onSuccess: (data) => {
      setSessionUuid(data.session_uuid)
      setMessages((m) => [...m, { role: 'assistant', content: data.reply, toolCalls: data.tool_calls }])
      if (data.structured_result) setStructuredResult(data.structured_result)
      if (data.finished) setFinished(true)
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  const handleSend = () => {
    const text = input.trim()
    if (!text || send.isPending) return
    setMessages((m) => [...m, { role: 'user', content: text }])
    setInput('')
    send.mutate(text)
  }

  const reset = () => {
    setMessages([])
    setSessionUuid(null)
    setStructuredResult(null)
    setFinished(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            Simulador · {prompt.name}
          </SheetTitle>
          <SheetDescription>Conversa con el agente como si fueras el deudor.</SheetDescription>
        </SheetHeader>
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {!messages.length && (
            <EmptyState icon={MessageSquare} title="Inicia la conversación" description="Escribe un mensaje para probar el agente." className="py-16" />
          )}
          {messages.map((m, i) => (
            <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-3.5 py-2 text-sm',
                  m.role === 'user' ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm bg-muted',
                )}
              >
                <p className="whitespace-pre-wrap">{m.content}</p>
                {!!m.toolCalls?.length && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {m.toolCalls.map((tc, j) => (
                      <Badge key={j} variant="purple" className="text-[10px]">
                        <Wrench className="mr-1 h-2.5 w-2.5" />
                        {tc.name ?? tc.tool ?? 'tool'}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {send.isPending && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2 text-sm text-muted-foreground">Escribiendo…</div>
            </div>
          )}
          {structuredResult && (
            <div className="rounded-lg border p-3">
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Resultado estructurado</p>
              <JsonViewer data={structuredResult} />
            </div>
          )}
          {finished && (
            <p className="text-center text-xs text-muted-foreground">— La conversación ha finalizado —</p>
          )}
        </div>
        <div className="border-t p-3">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={finished ? 'Conversación finalizada' : 'Escribe como el deudor…'}
              disabled={finished}
            />
            <Button onClick={handleSend} disabled={!input.trim() || finished} loading={send.isPending}>
              <Send />
            </Button>
            <Button variant="outline" onClick={reset} title="Reiniciar conversación">
              <RotateCcw />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
