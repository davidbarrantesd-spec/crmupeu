import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Copy,
  Download,
  FlaskConical,
  Pause,
  Pencil,
  Phone,
  Play,
  Plus,
  Rocket,
  Trash2,
  Users,
  XCircle,
  DollarSign,
  PhoneIncoming,
  PhoneMissed,
  Loader2,
} from 'lucide-react'
import { api, apiErrorMessage, downloadFile } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useDebounce } from '@/hooks/useDebounce'
import { useEchoInvalidate } from '@/hooks/useEchoChannel'
import { formatDateTime, formatMoney, formatPercent, fullName } from '@/lib/format'
import type { ApiResource, Campaign, CampaignContact, CampaignProgress, Contact, Paginated } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { CAMPAIGN_TYPE_META } from './Campaigns'

export default function CampaignDetail() {
  const { uuid = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const hasPermission = useAuthStore((s) => s.hasPermission)

  const [page, setPage] = useState(1)
  const [confirm, setConfirm] = useState<'launch' | 'cancel' | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [testOpen, setTestOpen] = useState(false)

  const { data: campaign, isLoading } = useQuery({
    queryKey: ['campaign', uuid],
    queryFn: async () => {
      const res = await api.get<ApiResource<Campaign>>(`/campaigns/${uuid}`)
      return res.data.data
    },
    enabled: !!uuid,
  })

  const { data: progress } = useQuery({
    queryKey: ['campaign', uuid, 'progress'],
    queryFn: async () => {
      const res = await api.get<ApiResource<CampaignProgress>>(`/campaigns/${uuid}/progress`)
      return res.data.data
    },
    enabled: !!uuid,
    refetchInterval: 5000,
  })

  useEchoInvalidate(`campaigns.${uuid}`, ['CampaignProgressUpdated'], [
    ['campaign', uuid, 'progress'],
    ['campaign', uuid, 'contacts'],
  ])
  useEchoInvalidate('calls', ['CallUpdated'], [['campaign', uuid, 'contacts']])

  const { data: contacts, isLoading: loadingContacts, isError, refetch } = useQuery({
    queryKey: ['campaign', uuid, 'contacts', page],
    queryFn: async () => {
      const res = await api.get<Paginated<CampaignContact>>(`/campaigns/${uuid}/contacts`, {
        params: { page, per_page: 15 },
      })
      return res.data
    },
    enabled: !!uuid,
    refetchInterval: 10000,
  })

  const action = useMutation({
    mutationFn: (act: string) => api.post(`/campaigns/${uuid}/${act}`),
    onSuccess: (res, act) => {
      const labels: Record<string, string> = {
        launch: 'Campaña lanzada',
        pause: 'Campaña pausada',
        resume: 'Campaña reanudada',
        cancel: 'Campaña cancelada',
        duplicate: 'Campaña duplicada',
      }
      toast.success(labels[act] ?? 'Acción realizada')
      queryClient.invalidateQueries({ queryKey: ['campaign', uuid] })
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      if (act === 'duplicate') {
        const dup = (res.data as ApiResource<Campaign> | undefined)?.data
        if (dup?.uuid) navigate(`/campaigns/${dup.uuid}/edit`)
      }
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  const removeContact = useMutation({
    mutationFn: (contactUuid: string) => api.delete(`/campaigns/${uuid}/contacts/${contactUuid}`),
    onSuccess: () => {
      toast.success('Contacto quitado de la campaña')
      queryClient.invalidateQueries({ queryKey: ['campaign', uuid, 'contacts'] })
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  const handleExport = async () => {
    try {
      await downloadFile(`/reports/campaigns`, `campana-${uuid}.csv`, { campaign: uuid, export: 'csv' })
      toast.success('Resultados exportados')
    } catch (e) {
      toast.error(apiErrorMessage(e))
    }
  }

  if (isLoading || !campaign) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  const meta = CAMPAIGN_TYPE_META[campaign.type]
  const pct = progress?.total ? Math.min(100, Math.round(((progress.completed + progress.failed) / progress.total) * 100)) : 0

  const columns: Column<CampaignContact>[] = [
    {
      key: 'contact',
      header: 'Contacto',
      render: (cc) => (
        <button
          type="button"
          className="cursor-pointer font-medium text-primary hover:underline"
          onClick={() => navigate(`/contacts/${cc.contact.uuid}`)}
        >
          {fullName(cc.contact)}
        </button>
      ),
    },
    { key: 'phone', header: 'Teléfono', render: (cc) => cc.contact.phone ?? '—' },
    { key: 'status', header: 'Estado', render: (cc) => <StatusBadge status={cc.status} /> },
    { key: 'result', header: 'Resultado', render: (cc) => (cc.result ? <StatusBadge status={cc.result} /> : '—') },
    { key: 'attempts', header: 'Intentos', render: (cc) => cc.attempts ?? 0 },
    { key: 'last_attempt_at', header: 'Último intento', render: (cc) => formatDateTime(cc.last_attempt_at) },
    {
      key: 'actions',
      header: '',
      className: 'w-10',
      render: (cc) =>
        hasPermission('campaigns.edit') && ['draft', 'scheduled', 'paused'].includes(campaign.status) ? (
          <Button variant="ghost" size="iconSm" onClick={() => removeContact.mutate(cc.contact.uuid)} title="Quitar de la campaña">
            <Trash2 className="text-destructive" />
          </Button>
        ) : null,
    },
  ]

  return (
    <div className="p-6">
      <Button variant="ghost" size="sm" onClick={() => navigate('/campaigns')} className="mb-3 -ml-2">
        <ArrowLeft />
        Volver a campañas
      </Button>
      <PageHeader
        title={campaign.name}
        description={`${meta?.label ?? campaign.type}${campaign.description ? ` · ${campaign.description}` : ''}`}
        actions={
          <>
            <StatusBadge status={campaign.status} className="mr-2" />
            {hasPermission('campaigns.launch') && ['draft', 'scheduled'].includes(campaign.status) && (
              <Button onClick={() => setConfirm('launch')}>
                <Rocket />
                Lanzar
              </Button>
            )}
            {hasPermission('campaigns.launch') && campaign.status === 'running' && (
              <Button variant="outline" onClick={() => action.mutate('pause')}>
                <Pause />
                Pausar
              </Button>
            )}
            {hasPermission('campaigns.launch') && campaign.status === 'paused' && (
              <Button onClick={() => action.mutate('resume')}>
                <Play />
                Reanudar
              </Button>
            )}
            {['draft', 'scheduled', 'paused'].includes(campaign.status) && hasPermission('campaigns.edit') && (
              <Button variant="outline" onClick={() => navigate(`/campaigns/${uuid}/edit`)}>
                <Pencil />
                Editar
              </Button>
            )}
            {hasPermission('calls.create') && campaign.type !== 'whatsapp' && (
              <Button variant="outline" onClick={() => setTestOpen(true)}>
                <FlaskConical />
                Prueba
              </Button>
            )}
            {hasPermission('campaigns.create') && (
              <Button variant="outline" onClick={() => action.mutate('duplicate')}>
                <Copy />
                Duplicar
              </Button>
            )}
            <Button variant="outline" onClick={handleExport}>
              <Download />
              Exportar
            </Button>
            {hasPermission('campaigns.launch') && ['running', 'paused', 'scheduled'].includes(campaign.status) && (
              <Button variant="destructive" onClick={() => setConfirm('cancel')}>
                <XCircle />
                Cancelar
              </Button>
            )}
          </>
        }
      />

      {/* Progreso */}
      <Card className="mb-4">
        <CardContent className="p-5">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">
              Progreso en tiempo real{' '}
              {campaign.status === 'running' && <Loader2 className="ml-1 inline h-3.5 w-3.5 animate-spin text-primary" />}
            </p>
            <p className="text-sm text-muted-foreground">{pct}%</p>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <Kpi icon={Users} label="Total" value={progress?.total ?? 0} />
            <Kpi icon={Phone} label="Pendientes" value={progress?.pending ?? 0} />
            <Kpi icon={Loader2} label="En curso" value={progress?.in_progress ?? 0} />
            <Kpi icon={PhoneIncoming} label="Contactados" value={progress?.contacted ?? 0} color="text-emerald-500" />
            <Kpi icon={PhoneMissed} label="Fallidos" value={progress?.failed ?? 0} color="text-destructive" />
            <Kpi icon={PhoneIncoming} label="Tasa respuesta" value={formatPercent(progress?.answered_rate ?? 0)} color="text-blue-500" />
            <Kpi icon={DollarSign} label="Costo est." value={formatMoney(progress?.estimated_cost ?? 0)} color="text-amber-500" />
          </div>
        </CardContent>
      </Card>

      {/* Contactos */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Contactos de la campaña</CardTitle>
          {hasPermission('campaigns.edit') && (
            <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
              <Plus />
              Agregar contactos
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={contacts}
            isLoading={loadingContacts}
            isError={isError}
            onRetry={() => refetch()}
            page={page}
            onPageChange={setPage}
            rowKey={(cc) => cc.uuid ?? cc.contact.uuid}
            emptyTitle="Sin contactos"
            emptyDescription="Agrega contactos o ajusta el segmento de la campaña."
            emptyIcon={Users}
          />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === 'launch' ? 'Lanzar campaña' : 'Cancelar campaña'}
        description={
          confirm === 'launch'
            ? 'Comenzarán las llamadas/mensajes a todos los contactos del segmento. ¿Continuar?'
            : 'Se detendrá permanentemente la campaña. Esta acción no se puede deshacer.'
        }
        confirmLabel={confirm === 'launch' ? 'Lanzar' : 'Cancelar campaña'}
        destructive={confirm === 'cancel'}
        onConfirm={async () => {
          if (confirm) await action.mutateAsync(confirm)
        }}
      />

      <AddContactsDialog uuid={uuid} open={addOpen} onOpenChange={setAddOpen} />
      <TestCallDialog uuid={uuid} open={testOpen} onOpenChange={setTestOpen} />
    </div>
  )
}

function Kpi({ icon: Icon, label, value, color }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number | string; color?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className={`h-3.5 w-3.5 ${color ?? ''}`} />
        {label}
      </div>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
    </div>
  )
}

function AddContactsDialog({ uuid, open, onOpenChange }: { uuid: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Contact[]>([])
  const debounced = useDebounce(search)

  const { data: results } = useQuery({
    queryKey: ['contacts', 'campaign-add-search', debounced],
    queryFn: async () => {
      const res = await api.get<Paginated<Contact>>('/contacts', { params: { search: debounced, per_page: 8 } })
      return res.data.data
    },
    enabled: open && debounced.length >= 2,
  })

  const add = useMutation({
    mutationFn: () => api.post(`/campaigns/${uuid}/contacts`, { contact_uuids: selected.map((c) => c.uuid) }),
    onSuccess: () => {
      toast.success(`${selected.length} contacto(s) agregados`)
      queryClient.invalidateQueries({ queryKey: ['campaign', uuid, 'contacts'] })
      queryClient.invalidateQueries({ queryKey: ['campaign', uuid, 'progress'] })
      setSelected([])
      setSearch('')
      onOpenChange(false)
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar contactos a la campaña</DialogTitle>
          <DialogDescription>Busca y selecciona los contactos a incluir.</DialogDescription>
        </DialogHeader>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, DNI, teléfono…" />
        <div className="max-h-56 space-y-1 overflow-y-auto">
          {(results ?? [])
            .filter((c) => !selected.some((s) => s.uuid === c.uuid))
            .map((c) => (
              <button
                key={c.uuid}
                type="button"
                className="flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => setSelected((s) => [...s, c])}
              >
                <span>{fullName(c)}</span>
                <span className="text-xs text-muted-foreground">{c.phone}</span>
              </button>
            ))}
        </div>
        {!!selected.length && (
          <div className="flex flex-wrap gap-1.5">
            {selected.map((c) => (
              <button
                key={c.uuid}
                type="button"
                className="cursor-pointer rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary hover:bg-primary/20"
                onClick={() => setSelected((s) => s.filter((x) => x.uuid !== c.uuid))}
              >
                {fullName(c)} ✕
              </button>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => add.mutate()} disabled={!selected.length} loading={add.isPending}>
            Agregar {selected.length || ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TestCallDialog({ uuid, open, onOpenChange }: { uuid: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Contact | null>(null)
  const debounced = useDebounce(search)

  const { data: results } = useQuery({
    queryKey: ['contacts', 'test-call-search', debounced],
    queryFn: async () => {
      const res = await api.get<Paginated<Contact>>('/contacts', { params: { search: debounced, per_page: 8 } })
      return res.data.data
    },
    enabled: open && debounced.length >= 2,
  })

  const test = useMutation({
    mutationFn: () => api.post(`/campaigns/${uuid}/test`, { contact_uuid: selected?.uuid }),
    onSuccess: () => {
      toast.success('Llamada de prueba iniciada', { description: `Llamando a ${fullName(selected)}` })
      onOpenChange(false)
      setSelected(null)
      setSearch('')
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Llamada de prueba</DialogTitle>
          <DialogDescription>Ejecuta la campaña contra un solo contacto para validar el contenido.</DialogDescription>
        </DialogHeader>
        {selected ? (
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="font-medium">{fullName(selected)}</p>
              <p className="text-sm text-muted-foreground">{selected.phone}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
              Cambiar
            </Button>
          </div>
        ) : (
          <>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar contacto…" />
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {(results ?? []).map((c) => (
                <button
                  key={c.uuid}
                  type="button"
                  className="flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                  onClick={() => setSelected(c)}
                >
                  <span>{fullName(c)}</span>
                  <span className="text-xs text-muted-foreground">{c.phone}</span>
                </button>
              ))}
              {debounced.length >= 2 && !results?.length && (
                <EmptyState title="Sin resultados" className="py-4" />
              )}
            </div>
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => test.mutate()} disabled={!selected} loading={test.isPending}>
            <FlaskConical />
            Iniciar prueba
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
