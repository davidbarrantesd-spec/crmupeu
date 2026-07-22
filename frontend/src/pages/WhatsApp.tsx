import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { differenceInMinutes, isSameDay, parseISO } from 'date-fns'
import {
  Archive,
  Check,
  CheckCheck,
  Clock,
  FileText,
  Handshake,
  MessageCircle,
  MessageSquarePlus,
  MoreVertical,
  Paperclip,
  Phone,
  RotateCcw,
  Search,
  Send,
  UserPlus,
  Wallet,
  X,
} from 'lucide-react'
import { api, apiErrorMessage } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useDebounce } from '@/hooks/useDebounce'
import { useEchoInvalidate } from '@/hooks/useEchoChannel'
import { formatDate, formatDayLabel, formatMoney, formatRelative, formatTime, fullName, initials } from '@/lib/format'
import type { ApiResource, Contact, Conversation, Message, Paginated, User, WhatsAppTemplate } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { FormField } from '@/components/shared/FormField'
import { cn } from '@/lib/utils'

type StatusFilter = 'all' | 'open' | 'pending' | 'closed' | 'unread'

export default function WhatsApp() {
  const queryClient = useQueryClient()
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedUuid, setSelectedUuid] = useState<string | null>(searchParams.get('conversation'))
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<StatusFilter>('all')
  const debouncedSearch = useDebounce(search)

  // Tiempo real: invalidar bandeja ante eventos
  useEchoInvalidate('conversations', ['MessageReceived', 'MessageStatusUpdated'], [['conversations'], ['messages']])

  const params: Record<string, unknown> = {
    per_page: 50,
    search: debouncedSearch || undefined,
    status: filter === 'all' || filter === 'unread' ? undefined : filter,
    unread: filter === 'unread' ? 1 : undefined,
  }

  const { data: conversations, isLoading } = useQuery({
    queryKey: ['conversations', params],
    queryFn: async () => {
      const res = await api.get<Paginated<Conversation>>('/conversations', { params })
      return res.data.data
    },
    refetchInterval: 10000, // fallback si Echo no está conectado
  })

  // Iniciar conversación desde ?contact=
  const contactParam = searchParams.get('contact')
  const [newConvOpen, setNewConvOpen] = useState(!!contactParam)

  const selected = useMemo(
    () => conversations?.find((c) => c.uuid === selectedUuid) ?? null,
    [conversations, selectedUuid],
  )

  const selectConversation = (uuid: string) => {
    setSelectedUuid(uuid)
    setSearchParams({ conversation: uuid }, { replace: true })
    // marcar como leída
    api.post(`/conversations/${uuid}/read`).then(() => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    }).catch(() => {})
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Columna 1: lista de conversaciones */}
      <div className={cn('flex w-full flex-col border-r sm:w-80 lg:w-96', selectedUuid && 'hidden sm:flex')}>
        <div className="space-y-2 border-b p-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold">WhatsApp</h1>
            {hasPermission('whatsapp.reply') && (
              <Button variant="ghost" size="icon" onClick={() => setNewConvOpen(true)} title="Nueva conversación">
                <MessageSquarePlus />
              </Button>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar conversación…" className="pl-8" />
          </div>
          <div className="flex gap-1 overflow-x-auto">
            {(
              [
                { value: 'all', label: 'Todas' },
                { value: 'open', label: 'Abiertas' },
                { value: 'pending', label: 'Pendientes' },
                { value: 'closed', label: 'Cerradas' },
                { value: 'unread', label: 'No leídas' },
              ] as { value: StatusFilter; label: string }[]
            ).map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={cn(
                  'cursor-pointer whitespace-nowrap rounded-full px-2.5 py-1 text-xs transition-colors',
                  filter === f.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading &&
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 border-b p-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-44" />
                </div>
              </div>
            ))}
          {!isLoading && !conversations?.length && (
            <EmptyState icon={MessageCircle} title="Sin conversaciones" description="No hay conversaciones con los filtros aplicados." />
          )}
          {conversations?.map((conv) => (
            <button
              key={conv.uuid}
              type="button"
              onClick={() => selectConversation(conv.uuid)}
              className={cn(
                'flex w-full cursor-pointer items-center gap-3 border-b p-3 text-left transition-colors hover:bg-accent',
                selectedUuid === conv.uuid && 'bg-accent',
              )}
            >
              <Avatar>
                <AvatarFallback>{initials(fullName(conv.contact))}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">{fullName(conv.contact)}</p>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {conv.last_message_at ? formatTime(conv.last_message_at) : ''}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs text-muted-foreground">
                    {conv.last_message?.direction === 'outbound' && (
                      <MessageStatusIcon status={conv.last_message.status} className="mr-0.5 inline" />
                    )}
                    {conv.last_message?.body ?? 'Sin mensajes'}
                  </p>
                  <span className="flex shrink-0 items-center gap-1">
                    {Number(conv.priority) <= 3 && <StatusBadge status="high" />}
                    {!!conv.unread_count && conv.unread_count > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-green-500 px-1 text-[10px] font-bold text-white">
                        {conv.unread_count}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Columna 2: hilo */}
      {selectedUuid ? (
        <ConversationThread
          key={selectedUuid}
          uuid={selectedUuid}
          summary={selected}
          onBack={() => {
            setSelectedUuid(null)
            setSearchParams({}, { replace: true })
          }}
        />
      ) : (
        <div className="hidden flex-1 items-center justify-center sm:flex">
          <EmptyState
            icon={MessageCircle}
            title="Selecciona una conversación"
            description="Elige una conversación de la lista para ver los mensajes."
          />
        </div>
      )}

      <NewConversationDialog
        open={newConvOpen}
        onOpenChange={(o) => {
          setNewConvOpen(o)
          if (!o && contactParam) setSearchParams({}, { replace: true })
        }}
        initialContactUuid={contactParam}
        onCreated={(uuid) => {
          setNewConvOpen(false)
          selectConversation(uuid)
        }}
      />
    </div>
  )
}

function MessageStatusIcon({ status, className }: { status?: string; className?: string }) {
  if (status === 'read') return <CheckCheck className={cn('h-3.5 w-3.5 text-sky-500', className)} />
  if (status === 'delivered') return <CheckCheck className={cn('h-3.5 w-3.5 text-muted-foreground', className)} />
  if (status === 'sent') return <Check className={cn('h-3.5 w-3.5 text-muted-foreground', className)} />
  if (status === 'failed') return <X className={cn('h-3.5 w-3.5 text-destructive', className)} />
  return <Clock className={cn('h-3 w-3 text-muted-foreground', className)} />
}

function ConversationThread({ uuid, summary, onBack }: { uuid: string; summary: Conversation | null; onBack: () => void }) {
  const queryClient = useQueryClient()
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const [body, setBody] = useState('')
  const [templateOpen, setTemplateOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [showPanel, setShowPanel] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const { data: conversation } = useQuery({
    queryKey: ['conversation', uuid],
    queryFn: async () => {
      const res = await api.get<ApiResource<Conversation>>(`/conversations/${uuid}`)
      return res.data.data
    },
    refetchInterval: 15000,
  })

  const { data: messages, isLoading } = useQuery({
    queryKey: ['messages', uuid],
    queryFn: async () => {
      const res = await api.get<Paginated<Message>>(`/conversations/${uuid}/messages`)
      // Ordenar ascendente por fecha
      return [...res.data.data].sort((a, b) =>
        String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')),
      )
    },
    refetchInterval: 10000, // fallback polling
  })

  useEchoInvalidate('conversations', ['MessageReceived', 'MessageStatusUpdated'], [['messages', uuid], ['conversation', uuid]])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [messages?.length])

  const conv = conversation ?? summary
  const within24h = conversation?.within_24h_window ?? true
  const windowExpiresAt = conversation?.window_expires_at

  const countdown = useMemo(() => {
    if (!windowExpiresAt) return null
    try {
      const mins = differenceInMinutes(parseISO(windowExpiresAt), new Date())
      if (mins <= 0) return null
      const h = Math.floor(mins / 60)
      const m = mins % 60
      return `${h}h ${m}m`
    } catch {
      return null
    }
  }, [windowExpiresAt])

  const sendMessage = useMutation({
    mutationFn: (payload: { body?: string; template_uuid?: string; variables?: Record<string, string>; file?: File }) => {
      if (payload.file) {
        const fd = new FormData()
        fd.append('file', payload.file)
        return api.post(`/conversations/${uuid}/messages`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      }
      return api.post(`/conversations/${uuid}/messages`, payload)
    },
    onSuccess: () => {
      setBody('')
      queryClient.invalidateQueries({ queryKey: ['messages', uuid] })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  const convAction = useMutation({
    mutationFn: ({ action, data }: { action: string; data?: Record<string, unknown> }) => {
      if (action === 'priority') return api.put(`/conversations/${uuid}`, data)
      return api.post(`/conversations/${uuid}/${action}`, data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', uuid] })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      toast.success('Conversación actualizada')
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  const handleSend = () => {
    const text = body.trim()
    if (!text) return
    if (!within24h) {
      setTemplateOpen(true)
      return
    }
    sendMessage.mutate({ body: text })
  }

  // Agrupar mensajes por día
  const grouped = useMemo(() => {
    const groups: { day: string; items: Message[] }[] = []
    for (const msg of messages ?? []) {
      const at = msg.created_at ?? msg.sent_at ?? ''
      const last = groups[groups.length - 1]
      if (last && at && last.items.length && isSameDayStr(last.items[0].created_at ?? '', at)) {
        last.items.push(msg)
      } else {
        groups.push({ day: at, items: [msg] })
      }
    }
    return groups
  }, [messages])

  const contact = conv?.contact

  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col bg-muted/20">
        {/* Cabecera del hilo */}
        <div className="flex items-center gap-3 border-b bg-card p-3">
          <Button variant="ghost" size="iconSm" className="sm:hidden" onClick={onBack}>
            <X />
          </Button>
          <Avatar>
            <AvatarFallback>{initials(fullName(contact))}</AvatarFallback>
          </Avatar>
          <button type="button" className="min-w-0 flex-1 cursor-pointer text-left" onClick={() => setShowPanel(!showPanel)}>
            <p className="truncate font-medium">{fullName(contact)}</p>
            <p className="truncate text-xs text-muted-foreground">
              {contact?.phone} {conv?.assigned_to ? `· Atiende: ${conv.assigned_to.name}` : '· Sin asignar'}
            </p>
          </button>
          {conv && <StatusBadge status={conv.status} />}
          {within24h && countdown && (
            <Badge variant="success" className="hidden md:inline-flex">
              <Clock className="mr-1 h-3 w-3" />
              Ventana: {countdown}
            </Badge>
          )}
          {!within24h && (
            <Badge variant="warning" className="hidden md:inline-flex">
              <Clock className="mr-1 h-3 w-3" />
              Ventana 24h expirada
            </Badge>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="iconSm">
                <MoreVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setAssignOpen(true)}>
                <UserPlus />
                Asignar / transferir
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => convAction.mutate({ action: 'priority', data: { priority: 'high' } })}>
                Prioridad alta
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => convAction.mutate({ action: 'priority', data: { priority: 'normal' } })}>
                Prioridad normal
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {conv?.status !== 'closed' ? (
                <DropdownMenuItem onSelect={() => convAction.mutate({ action: 'close' })}>
                  <Archive />
                  Cerrar conversación
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => convAction.mutate({ action: 'reopen' })}>
                  <RotateCcw />
                  Reabrir conversación
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Mensajes */}
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {isLoading && (
            <div className="space-y-3">
              <Skeleton className="ml-auto h-12 w-56 rounded-2xl" />
              <Skeleton className="h-12 w-64 rounded-2xl" />
              <Skeleton className="ml-auto h-12 w-48 rounded-2xl" />
            </div>
          )}
          {!isLoading && !messages?.length && (
            <EmptyState icon={MessageCircle} title="Sin mensajes" description="Envía el primer mensaje o una plantilla." />
          )}
          {grouped.map((group, gi) => (
            <div key={gi}>
              <div className="mb-3 flex justify-center">
                <span className="rounded-full bg-card px-3 py-1 text-xs text-muted-foreground shadow-sm">
                  {formatDayLabel(group.day)}
                </span>
              </div>
              <div className="space-y-1.5">
                {group.items.map((msg) => (
                  <div key={msg.uuid} className={cn('flex', msg.direction === 'outbound' ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm',
                        msg.direction === 'outbound'
                          ? 'rounded-br-sm bg-emerald-100 text-emerald-950 dark:bg-emerald-900 dark:text-emerald-50'
                          : 'rounded-bl-sm bg-card',
                      )}
                    >
                      {msg.media_url && (
                        <a href={msg.media_url} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-1.5 text-xs underline">
                          <Paperclip className="h-3.5 w-3.5" />
                          Adjunto {msg.media_type ? `(${msg.media_type})` : ''}
                        </a>
                      )}
                      {msg.body && <p className="whitespace-pre-wrap">{msg.body}</p>}
                      <div className="mt-0.5 flex items-center justify-end gap-1">
                        <span className="text-[10px] opacity-60">{formatTime(msg.created_at ?? msg.sent_at)}</span>
                        {msg.direction === 'outbound' && <MessageStatusIcon status={msg.status} />}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Caja de mensaje */}
        {hasPermission('whatsapp.reply') && (
          <div className="border-t bg-card p-3">
            {!within24h && (
              <div className="mb-2 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                <Clock className="h-4 w-4 shrink-0" />
                La ventana de 24 horas expiró. Solo puedes enviar plantillas aprobadas.
                <Button variant="outline" size="sm" className="ml-auto" onClick={() => setTemplateOpen(true)}>
                  <FileText />
                  Elegir plantilla
                </Button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <Button variant="ghost" size="icon" onClick={() => setTemplateOpen(true)} title="Plantillas">
                <FileText />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => fileRef.current?.click()} title="Adjuntar" disabled={!within24h}>
                <Paperclip />
              </Button>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) sendMessage.mutate({ file: f })
                  e.target.value = ''
                }}
              />
              <Textarea
                rows={1}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder={within24h ? 'Escribe un mensaje…' : 'Ventana expirada — usa una plantilla'}
                disabled={!within24h}
                className="max-h-32 min-h-9 flex-1 resize-none"
              />
              <Button onClick={handleSend} disabled={!body.trim() || !within24h} loading={sendMessage.isPending} size="icon">
                <Send />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Columna 3: panel del contacto */}
      {showPanel && contact && (
        <div className="hidden w-72 shrink-0 overflow-y-auto border-l bg-card xl:block">
          <ContactPanel contact={contact} />
        </div>
      )}

      <TemplatePickerDialog
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        onSend={(templateUuid, variables) => {
          sendMessage.mutate({ template_uuid: templateUuid, variables })
          setTemplateOpen(false)
        }}
      />
      <AssignDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        onAssign={(userUuid) => {
          convAction.mutate({ action: 'assign', data: { user_uuid: userUuid } })
          setAssignOpen(false)
        }}
      />
    </>
  )
}

function isSameDayStr(a: string, b: string): boolean {
  try {
    return isSameDay(parseISO(a), parseISO(b))
  } catch {
    return false
  }
}

function ContactPanel({ contact }: { contact: Contact }) {
  const { data: full } = useQuery({
    queryKey: ['contact', contact.uuid],
    queryFn: async () => {
      const res = await api.get<ApiResource<Contact>>(`/contacts/${contact.uuid}`)
      return res.data.data
    },
  })

  const { data: agreements } = useQuery({
    queryKey: ['agreements', { contact: contact.uuid, panel: true }],
    queryFn: async () => {
      const res = await api.get<Paginated<import('@/types').Agreement>>('/agreements', {
        params: { contact: contact.uuid, per_page: 3 },
      })
      return res.data.data
    },
  })

  const { data: calls } = useQuery({
    queryKey: ['calls', { contact: contact.uuid, panel: true }],
    queryFn: async () => {
      const res = await api.get<Paginated<import('@/types').Call>>('/calls', {
        params: { contact: contact.uuid, per_page: 3 },
      })
      return res.data.data
    },
  })

  const c = full ?? contact

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <Avatar className="h-16 w-16">
          <AvatarFallback className="text-xl">{initials(fullName(c))}</AvatarFallback>
        </Avatar>
        <div>
          <p className="font-semibold">{fullName(c)}</p>
          <p className="text-sm text-muted-foreground">{c.phone}</p>
        </div>
        <a href={`/contacts/${c.uuid}`} className="text-xs text-primary hover:underline">
          Ver ficha completa
        </a>
      </div>

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
          <Wallet className="h-3.5 w-3.5" />
          Deudas
        </p>
        {!c.debts?.length && <p className="text-sm text-muted-foreground">Sin deudas</p>}
        <div className="space-y-1.5">
          {c.debts?.slice(0, 4).map((d) => (
            <div key={d.uuid} className="flex items-center justify-between rounded-md border p-2 text-sm">
              <span className="truncate text-xs text-muted-foreground">{d.concept ?? d.reference ?? 'Deuda'}</span>
              <span className="font-medium tabular-nums">{formatMoney(d.current_balance)}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
          <Handshake className="h-3.5 w-3.5" />
          Acuerdos recientes
        </p>
        {!agreements?.length && <p className="text-sm text-muted-foreground">Sin acuerdos</p>}
        <div className="space-y-1.5">
          {agreements?.map((a) => (
            <div key={a.uuid} className="rounded-md border p-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium tabular-nums">{formatMoney(a.amount)}</span>
                <StatusBadge status={a.status} />
              </div>
              <p className="text-xs text-muted-foreground">Promesa: {formatDate(a.promise_date)}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
          <Phone className="h-3.5 w-3.5" />
          Últimas llamadas
        </p>
        {!calls?.length && <p className="text-sm text-muted-foreground">Sin llamadas</p>}
        <div className="space-y-1.5">
          {calls?.map((call) => (
            <div key={call.uuid} className="flex items-center justify-between rounded-md border p-2 text-sm">
              <span className="text-xs text-muted-foreground">{formatRelative(call.created_at)}</span>
              <StatusBadge status={call.status} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function TemplatePickerDialog({
  open,
  onOpenChange,
  onSend,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onSend: (templateUuid: string, variables: Record<string, string>) => void
}) {
  const [selectedUuid, setSelectedUuid] = useState<string | null>(null)
  const [variables, setVariables] = useState<Record<string, string>>({})

  const { data: templates, isLoading } = useQuery({
    queryKey: ['whatsapp-templates'],
    queryFn: async () => {
      const res = await api.get<Paginated<WhatsAppTemplate>>('/whatsapp-templates', { params: { per_page: 100 } })
      return res.data.data
    },
    enabled: open,
  })

  const selected = templates?.find((t) => t.uuid === selectedUuid) ?? null
  const templateVars = useMemo(() => {
    if (!selected) return []
    if (selected.variables?.length) return selected.variables
    // extraer {{1}} o {{nombre}} del cuerpo
    const matches = selected.body?.match(/\{\{\s*([\w]+)\s*\}\}/g) ?? []
    return Array.from(new Set(matches.map((m) => m.replace(/[{}\s]/g, ''))))
  }, [selected])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar plantilla</DialogTitle>
          <DialogDescription>Selecciona una plantilla aprobada y completa sus variables.</DialogDescription>
        </DialogHeader>
        {isLoading && <Skeleton className="h-32 w-full" />}
        {!isLoading && !templates?.length && <EmptyState icon={FileText} title="Sin plantillas" className="py-6" />}
        <div className="max-h-48 space-y-1.5 overflow-y-auto">
          {templates?.map((t) => (
            <button
              key={t.uuid}
              type="button"
              onClick={() => {
                setSelectedUuid(t.uuid)
                setVariables({})
              }}
              className={cn(
                'w-full cursor-pointer rounded-lg border p-3 text-left text-sm transition-colors hover:bg-accent',
                selectedUuid === t.uuid && 'border-primary ring-1 ring-primary',
              )}
            >
              <div className="flex items-center justify-between">
                <p className="font-medium">{t.name}</p>
                {t.status && <StatusBadge status={t.status} />}
              </div>
              {t.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{t.body}</p>}
            </button>
          ))}
        </div>
        {selected && templateVars.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Variables</p>
            {templateVars.map((v) => (
              <FormField key={v} label={`{{${v}}}`}>
                <Input value={variables[v] ?? ''} onChange={(e) => setVariables((x) => ({ ...x, [v]: e.target.value }))} />
              </FormField>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!selectedUuid} onClick={() => selectedUuid && onSend(selectedUuid, variables)}>
            <Send />
            Enviar plantilla
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AssignDialog({
  open,
  onOpenChange,
  onAssign,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onAssign: (userUuid: string) => void
}) {
  const [userUuid, setUserUuid] = useState('')
  const { data: users } = useQuery({
    queryKey: ['users', 'for-assign'],
    queryFn: async () => {
      const res = await api.get<Paginated<User>>('/users', { params: { per_page: 100, status: 'active' } })
      return res.data.data
    },
    enabled: open,
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Asignar conversación</DialogTitle>
        </DialogHeader>
        <Select value={userUuid} onValueChange={setUserUuid}>
          <SelectTrigger>
            <SelectValue placeholder="Selecciona un asesor" />
          </SelectTrigger>
          <SelectContent>
            {(users ?? []).map((u) => (
              <SelectItem key={u.uuid} value={u.uuid}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!userUuid} onClick={() => onAssign(userUuid)}>
            <UserPlus />
            Asignar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NewConversationDialog({
  open,
  onOpenChange,
  initialContactUuid,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  initialContactUuid: string | null
  onCreated: (uuid: string) => void
}) {
  const [search, setSearch] = useState('')
  const [contact, setContact] = useState<Contact | null>(null)
  const [templateUuid, setTemplateUuid] = useState('')
  const debounced = useDebounce(search)

  const { data: initialContact } = useQuery({
    queryKey: ['contact', initialContactUuid],
    queryFn: async () => {
      const res = await api.get<ApiResource<Contact>>(`/contacts/${initialContactUuid}`)
      return res.data.data
    },
    enabled: open && !!initialContactUuid,
  })

  useEffect(() => {
    if (initialContact) setContact(initialContact)
  }, [initialContact])

  const { data: results } = useQuery({
    queryKey: ['contacts', 'new-conv-search', debounced],
    queryFn: async () => {
      const res = await api.get<Paginated<Contact>>('/contacts', { params: { search: debounced, per_page: 8 } })
      return res.data.data
    },
    enabled: open && debounced.length >= 2 && !contact,
  })

  const { data: templates } = useQuery({
    queryKey: ['whatsapp-templates'],
    queryFn: async () => {
      const res = await api.get<Paginated<WhatsAppTemplate>>('/whatsapp-templates', { params: { per_page: 100 } })
      return res.data.data
    },
    enabled: open,
  })

  const create = useMutation({
    mutationFn: async () => {
      const res = await api.post<ApiResource<Conversation>>('/conversations', {
        contact_uuid: contact?.uuid,
        template_uuid: templateUuid,
        variables: {},
      })
      return res.data.data
    },
    onSuccess: (conv) => {
      toast.success('Conversación iniciada')
      onCreated(conv.uuid)
      setContact(null)
      setTemplateUuid('')
      setSearch('')
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva conversación</DialogTitle>
          <DialogDescription>Las conversaciones nuevas inician con una plantilla aprobada.</DialogDescription>
        </DialogHeader>
        {contact ? (
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="font-medium">{fullName(contact)}</p>
              <p className="text-sm text-muted-foreground">{contact.phone}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setContact(null)}>
              Cambiar
            </Button>
          </div>
        ) : (
          <>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar contacto…" />
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {(results ?? []).map((c) => (
                <button
                  key={c.uuid}
                  type="button"
                  className="flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                  onClick={() => setContact(c)}
                >
                  <span>{fullName(c)}</span>
                  <span className="text-xs text-muted-foreground">{c.phone}</span>
                </button>
              ))}
            </div>
          </>
        )}
        <FormField label="Plantilla inicial" required>
          <Select value={templateUuid} onValueChange={setTemplateUuid}>
            <SelectTrigger>
              <SelectValue placeholder="Selecciona plantilla" />
            </SelectTrigger>
            <SelectContent>
              {(templates ?? []).map((t) => (
                <SelectItem key={t.uuid} value={t.uuid}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!contact || !templateUuid} loading={create.isPending} onClick={() => create.mutate()}>
            <Send />
            Iniciar conversación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
