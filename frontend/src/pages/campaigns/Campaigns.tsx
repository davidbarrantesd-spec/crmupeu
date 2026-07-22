import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AudioLines,
  Bot,
  Copy,
  Megaphone,
  MessageCircle,
  MessageSquareText,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Rocket,
  XCircle,
  Pencil,
  Eye,
} from 'lucide-react'
import { api, apiErrorMessage } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useDebounce } from '@/hooks/useDebounce'
import { formatDate, formatPercent } from '@/lib/format'
import type { Campaign, Paginated } from '@/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'

const ANY = '__any__'

export const CAMPAIGN_TYPE_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  recorded_audio: { label: 'Audio grabado', icon: AudioLines },
  tts: { label: 'Texto a voz', icon: MessageSquareText },
  ai_conversational: { label: 'IA conversacional', icon: Bot },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle },
}

export default function Campaigns() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const hasPermission = useAuthStore((s) => s.hasPermission)

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState(ANY)
  const [type, setType] = useState(ANY)
  const debouncedSearch = useDebounce(search)

  const [confirmAction, setConfirmAction] = useState<{ campaign: Campaign; action: 'launch' | 'cancel' } | null>(null)

  const params: Record<string, unknown> = {
    page,
    per_page: 12,
    search: debouncedSearch || undefined,
    status: status === ANY ? undefined : status,
    type: type === ANY ? undefined : type,
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['campaigns', params],
    queryFn: async () => {
      const res = await api.get<Paginated<Campaign>>('/campaigns', { params })
      return res.data
    },
    refetchInterval: 15000,
  })

  const actionMutation = useMutation({
    mutationFn: ({ uuid, action }: { uuid: string; action: string }) => api.post(`/campaigns/${uuid}/${action}`),
    onSuccess: (_, vars) => {
      const labels: Record<string, string> = {
        launch: 'Campaña lanzada',
        pause: 'Campaña pausada',
        resume: 'Campaña reanudada',
        cancel: 'Campaña cancelada',
        duplicate: 'Campaña duplicada',
      }
      toast.success(labels[vars.action] ?? 'Acción realizada')
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  const progressPct = (c: Campaign) => {
    const p = c.progress
    if (!p || !p.total) return 0
    return Math.min(100, Math.round(((p.completed + p.failed) / p.total) * 100))
  }

  const columns: Column<Campaign>[] = [
    {
      key: 'name',
      header: 'Campaña',
      render: (c) => {
        const meta = CAMPAIGN_TYPE_META[c.type]
        const Icon = meta?.icon ?? Megaphone
        return (
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <p className="font-medium">{c.name}</p>
              <p className="text-xs text-muted-foreground">{meta?.label ?? c.type}</p>
            </div>
          </div>
        )
      },
    },
    { key: 'status', header: 'Estado', render: (c) => <StatusBadge status={c.status} /> },
    {
      key: 'priority',
      header: 'Prioridad',
      render: (c) => (c.priority ? <StatusBadge status={String(c.priority)} /> : '—'),
    },
    {
      key: 'progress',
      header: 'Progreso',
      className: 'min-w-[160px]',
      render: (c) => {
        const pct = progressPct(c)
        return (
          <div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {pct}%{c.progress ? ` · ${c.progress.contacted}/${c.progress.total} contactados` : ''}
            </p>
          </div>
        )
      },
    },
    {
      key: 'answered_rate',
      header: 'Respuesta',
      render: (c) => (c.progress ? formatPercent(c.progress.answered_rate) : '—'),
    },
    {
      key: 'contacts',
      header: 'Contactos',
      render: (c) => <Badge variant="secondary">{c.total_contacts ?? c.progress?.total ?? 0}</Badge>,
    },
    { key: 'starts_at', header: 'Inicio', render: (c) => formatDate(c.starts_at) },
    {
      key: 'actions',
      header: '',
      className: 'w-10',
      render: (c) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="iconSm" onClick={(e) => e.stopPropagation()}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onSelect={() => navigate(`/campaigns/${c.uuid}`)}>
              <Eye />
              Ver detalle
            </DropdownMenuItem>
            {['draft', 'scheduled', 'paused'].includes(c.status) && hasPermission('campaigns.edit') && (
              <DropdownMenuItem onSelect={() => navigate(`/campaigns/${c.uuid}/edit`)}>
                <Pencil />
                Editar
              </DropdownMenuItem>
            )}
            {hasPermission('campaigns.launch') && ['draft', 'scheduled'].includes(c.status) && (
              <DropdownMenuItem onSelect={() => setConfirmAction({ campaign: c, action: 'launch' })}>
                <Rocket />
                Lanzar
              </DropdownMenuItem>
            )}
            {hasPermission('campaigns.launch') && c.status === 'running' && (
              <DropdownMenuItem onSelect={() => actionMutation.mutate({ uuid: c.uuid, action: 'pause' })}>
                <Pause />
                Pausar
              </DropdownMenuItem>
            )}
            {hasPermission('campaigns.launch') && c.status === 'paused' && (
              <DropdownMenuItem onSelect={() => actionMutation.mutate({ uuid: c.uuid, action: 'resume' })}>
                <Play />
                Reanudar
              </DropdownMenuItem>
            )}
            {hasPermission('campaigns.create') && (
              <DropdownMenuItem onSelect={() => actionMutation.mutate({ uuid: c.uuid, action: 'duplicate' })}>
                <Copy />
                Duplicar
              </DropdownMenuItem>
            )}
            {hasPermission('campaigns.launch') && ['running', 'paused', 'scheduled'].includes(c.status) && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => setConfirmAction({ campaign: c, action: 'cancel' })}
                >
                  <XCircle />
                  Cancelar
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <div className="p-6">
      <PageHeader
        title="Campañas"
        description="Campañas de llamadas y mensajería"
        actions={
          hasPermission('campaigns.create') && (
            <Button onClick={() => navigate('/campaigns/new')}>
              <Plus />
              Nueva campaña
            </Button>
          )
        }
      />

      <FilterBar
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Buscar campaña…"
        onClear={() => {
          setSearch('')
          setStatus(ANY)
          setType(ANY)
          setPage(1)
        }}
        hasActiveFilters={!!search || status !== ANY || type !== ANY}
      >
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1) }}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Todos los estados</SelectItem>
            <SelectItem value="draft">Borrador</SelectItem>
            <SelectItem value="scheduled">Programada</SelectItem>
            <SelectItem value="running">En curso</SelectItem>
            <SelectItem value="paused">Pausada</SelectItem>
            <SelectItem value="completed">Completada</SelectItem>
            <SelectItem value="cancelled">Cancelada</SelectItem>
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={(v) => { setType(v); setPage(1) }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Todos los tipos</SelectItem>
            <SelectItem value="recorded_audio">Audio grabado</SelectItem>
            <SelectItem value="tts">Texto a voz</SelectItem>
            <SelectItem value="ai_conversational">IA conversacional</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
          </SelectContent>
        </Select>
      </FilterBar>

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        page={page}
        onPageChange={setPage}
        rowKey={(c) => c.uuid}
        onRowClick={(c) => navigate(`/campaigns/${c.uuid}`)}
        emptyTitle="Sin campañas"
        emptyDescription="Crea tu primera campaña para comenzar a gestionar la cobranza."
        emptyIcon={Megaphone}
      />

      <ConfirmDialog
        open={!!confirmAction}
        onOpenChange={(o) => !o && setConfirmAction(null)}
        title={confirmAction?.action === 'launch' ? 'Lanzar campaña' : 'Cancelar campaña'}
        description={
          confirmAction?.action === 'launch'
            ? `Se iniciará la campaña "${confirmAction?.campaign.name}" y comenzarán las llamadas/mensajes a los contactos del segmento. ¿Continuar?`
            : `Se cancelará la campaña "${confirmAction?.campaign.name}" y no se realizarán más intentos. Esta acción no se puede deshacer.`
        }
        confirmLabel={confirmAction?.action === 'launch' ? 'Lanzar' : 'Cancelar campaña'}
        destructive={confirmAction?.action === 'cancel'}
        onConfirm={async () => {
          if (confirmAction) {
            await actionMutation.mutateAsync({ uuid: confirmAction.campaign.uuid, action: confirmAction.action })
          }
        }}
      />
    </div>
  )
}
