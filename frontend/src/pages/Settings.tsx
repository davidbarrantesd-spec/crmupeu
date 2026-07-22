import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BadgeCheck, Cloud, DollarSign, MessageCircle, Phone, Save, Settings2, ShieldQuestion, Sparkles } from 'lucide-react'
import { api, apiErrorMessage } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { formatMoney } from '@/lib/format'
import type { ApiResource, CostsSummary, Integration, Settings as SettingsType } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { FormField } from '@/components/shared/FormField'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'

const PROVIDER_META: Record<string, { label: string; description: string; icon: React.ComponentType<{ className?: string }> }> = {
  twilio: { label: 'Twilio', description: 'Llamadas de voz salientes y webhooks', icon: Phone },
  whatsapp: { label: 'WhatsApp Business', description: 'Mensajería y plantillas de WhatsApp', icon: MessageCircle },
  anthropic: { label: 'Anthropic (Claude)', description: 'IA conversacional con Claude', icon: Sparkles },
  openai: { label: 'OpenAI', description: 'IA conversacional, TTS y transcripciones', icon: Sparkles },
  storage: { label: 'Almacenamiento (S3)', description: 'Grabaciones y archivos de audio', icon: Cloud },
}

export default function Settings() {
  const hasPermission = useAuthStore((s) => s.hasPermission)

  return (
    <div className="p-6">
      <PageHeader title="Configuración" description="Ajustes generales, integraciones y límites de la plataforma" />
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">
            <Settings2 className="h-3.5 w-3.5" />
            General
          </TabsTrigger>
          <TabsTrigger value="integrations">
            <Cloud className="h-3.5 w-3.5" />
            Integraciones
          </TabsTrigger>
          <TabsTrigger value="costs">
            <DollarSign className="h-3.5 w-3.5" />
            Costos y límites
          </TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <GeneralTab canEdit={hasPermission('settings.edit')} />
        </TabsContent>
        <TabsContent value="integrations">
          <IntegrationsTab canEdit={hasPermission('settings.edit')} />
        </TabsContent>
        <TabsContent value="costs">
          <CostsTab canEdit={hasPermission('settings.edit')} showFinance={hasPermission('finance.view')} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await api.get<ApiResource<SettingsType>>('/settings')
      return res.data.data
    },
  })
}

function useSaveSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (settings: SettingsType) => api.put('/settings', { settings }),
    onSuccess: () => {
      toast.success('Configuración guardada')
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })
}

function GeneralTab({ canEdit }: { canEdit: boolean }) {
  const { data: settings, isLoading } = useSettings()
  const save = useSaveSettings()
  const [values, setValues] = useState<SettingsType>({})

  useEffect(() => {
    if (settings) setValues(settings)
  }, [settings])

  if (isLoading) return <Skeleton className="h-72 w-full max-w-xl" />

  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }))
  const str = (key: string, fallback = '') => String(values[key] ?? fallback)

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="text-base">Preferencias generales</CardTitle>
        <CardDescription>Idioma, zona horaria y voz por defecto para las llamadas</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField label="Idioma">
          <Select value={str('language', 'es')} onValueChange={(v) => set('language', v)} disabled={!canEdit}>
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
        <FormField label="Zona horaria">
          <Select value={str('timezone', 'America/Lima')} onValueChange={(v) => set('timezone', v)} disabled={!canEdit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="America/Lima">América/Lima (GMT-5)</SelectItem>
              <SelectItem value="America/Bogota">América/Bogotá</SelectItem>
              <SelectItem value="America/Mexico_City">América/Ciudad de México</SelectItem>
              <SelectItem value="America/Santiago">América/Santiago</SelectItem>
              <SelectItem value="America/Argentina/Buenos_Aires">América/Buenos Aires</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Voz por defecto (TTS / IA)">
          <Select value={str('default_voice', 'nova')} onValueChange={(v) => set('default_voice', v)} disabled={!canEdit}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['alloy', 'echo', 'nova', 'shimmer', 'onyx', 'fable'].map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        {canEdit && (
          <div className="flex justify-end">
            <Button onClick={() => save.mutate(values)} loading={save.isPending}>
              <Save />
              Guardar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function IntegrationsTab({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient()
  const { data: integrations, isLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      const res = await api.get<ApiResource<Integration[]>>('/integrations')
      return res.data.data
    },
  })

  const [credentials, setCredentials] = useState<Record<string, Record<string, string>>>({})

  const save = useMutation({
    mutationFn: ({ provider }: { provider: string }) =>
      api.put(`/integrations/${provider}`, { credentials: credentials[provider] ?? {} }),
    onSuccess: (_, vars) => {
      toast.success('Credenciales guardadas')
      setCredentials((c) => ({ ...c, [vars.provider]: {} }))
      queryClient.invalidateQueries({ queryKey: ['integrations'] })
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  const verify = useMutation({
    mutationFn: (provider: string) => api.post(`/integrations/${provider}/verify`),
    onSuccess: () => {
      toast.success('Conexión verificada correctamente')
      queryClient.invalidateQueries({ queryKey: ['integrations'] })
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-64" />
        ))}
      </div>
    )
  }

  if (!integrations?.length) {
    return <EmptyState icon={Cloud} title="Sin integraciones" description="El backend no reporta proveedores configurables." />
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {integrations.map((integration) => {
        const meta = PROVIDER_META[integration.provider] ?? {
          label: integration.name ?? integration.provider,
          description: '',
          icon: Cloud,
        }
        const creds = integration.credentials ?? {}
        const local = credentials[integration.provider] ?? {}
        return (
          <Card key={integration.provider}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <meta.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{meta.label}</CardTitle>
                    <CardDescription>{meta.description}</CardDescription>
                  </div>
                </div>
                <StatusBadge status={integration.status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(creds).map(([key, masked]) => (
                <FormField key={key} label={key}>
                  <Input
                    type="text"
                    placeholder={masked || '••••••••'}
                    value={local[key] ?? ''}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setCredentials((c) => ({
                        ...c,
                        [integration.provider]: { ...c[integration.provider], [key]: e.target.value },
                      }))
                    }
                  />
                </FormField>
              ))}
              {canEdit && (
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    variant="outline"
                    onClick={() => verify.mutate(integration.provider)}
                    loading={verify.isPending && verify.variables === integration.provider}
                  >
                    <ShieldQuestion />
                    Verificar
                  </Button>
                  <Button
                    onClick={() => save.mutate({ provider: integration.provider })}
                    disabled={!Object.values(local).some(Boolean)}
                    loading={save.isPending && save.variables?.provider === integration.provider}
                  >
                    <BadgeCheck />
                    Guardar
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function CostsTab({ canEdit, showFinance }: { canEdit: boolean; showFinance: boolean }) {
  const { data: settings, isLoading } = useSettings()
  const save = useSaveSettings()
  const [values, setValues] = useState<SettingsType>({})

  useEffect(() => {
    if (settings) setValues(settings)
  }, [settings])

  const { data: costs } = useQuery({
    queryKey: ['costs', 'summary'],
    queryFn: async () => {
      const res = await api.get<ApiResource<CostsSummary>>('/costs/summary')
      return res.data.data
    },
    enabled: showFinance,
  })

  if (isLoading) return <Skeleton className="h-72 w-full max-w-xl" />

  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }))
  const str = (key: string) => String(values[key] ?? '')

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Límites operativos</CardTitle>
          <CardDescription>Controles de gasto y volumen de llamadas</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField label="Máximo de llamadas simultáneas">
            <Input type="number" value={str('max_concurrent_calls')} onChange={(e) => set('max_concurrent_calls', e.target.value)} disabled={!canEdit} />
          </FormField>
          <FormField label="Máximo de llamadas por día">
            <Input type="number" value={str('max_calls_per_day')} onChange={(e) => set('max_calls_per_day', e.target.value)} disabled={!canEdit} />
          </FormField>
          <FormField label="Presupuesto mensual (S/)">
            <Input type="number" step="0.01" value={str('monthly_budget')} onChange={(e) => set('monthly_budget', e.target.value)} disabled={!canEdit} />
          </FormField>
          <FormField label="Alerta al alcanzar (% del presupuesto)">
            <Input type="number" min={1} max={100} value={str('budget_alert_percent')} onChange={(e) => set('budget_alert_percent', e.target.value)} disabled={!canEdit} />
          </FormField>
          {canEdit && (
            <div className="flex justify-end">
              <Button onClick={() => save.mutate(values)} loading={save.isPending}>
                <Save />
                Guardar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {showFinance && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumen de costos</CardTitle>
            <CardDescription>Consumo del período actual</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatMoney(costs?.total as number | string | undefined)}</p>
            <div className="mt-4 space-y-2">
              {(costs?.by_type ?? []).map((t) => (
                <div key={t.type} className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <span className="capitalize">{t.type.replace(/_/g, ' ')}</span>
                  <span className="font-medium tabular-nums">{formatMoney(t.total)}</span>
                </div>
              ))}
              {!costs?.by_type?.length && <p className="text-sm text-muted-foreground">Sin datos de consumo.</p>}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
