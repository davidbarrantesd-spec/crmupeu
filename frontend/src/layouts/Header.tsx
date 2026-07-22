import { useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Bell,
  ChevronRight,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Sun,
  KeyRound,
  User as UserIcon,
  Phone,
  Handshake,
  MessageCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, apiErrorMessage } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { useDebounce } from '@/hooks/useDebounce'
import { disconnectEcho } from '@/lib/echo'
import { fullName, initials, formatRelative } from '@/lib/format'
import type { Contact, Paginated, TimelineEvent, Call, Agreement, Conversation } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FormField } from '@/components/shared/FormField'
import { EmptyState } from '@/components/shared/EmptyState'

const BREADCRUMB_LABELS: Record<string, string> = {
  '': 'Panel',
  contacts: 'Contactos',
  import: 'Importar',
  debts: 'Deudas',
  campaigns: 'Campañas',
  new: 'Nueva',
  edit: 'Editar',
  calls: 'Llamadas',
  prompts: 'Prompts IA',
  agreements: 'Acuerdos',
  'follow-ups': 'Seguimientos',
  whatsapp: 'WhatsApp',
  reports: 'Reportes',
  users: 'Usuarios',
  roles: 'Roles',
  settings: 'Configuración',
  audit: 'Auditoría',
  login: 'Iniciar sesión',
}

const passwordSchema = z
  .object({
    current_password: z.string().min(1, 'Ingresa tu contraseña actual'),
    password: z.string().min(8, 'Mínimo 8 caracteres'),
    password_confirmation: z.string(),
  })
  .refine((d) => d.password === d.password_confirmation, {
    message: 'Las contraseñas no coinciden',
    path: ['password_confirmation'],
  })

type PasswordForm = z.infer<typeof passwordSchema>

export function Header() {
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const theme = useUiStore((s) => s.theme)
  const toggleTheme = useUiStore((s) => s.toggleTheme)
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const setMobileOpen = useUiStore((s) => s.setMobileSidebarOpen)

  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const debouncedSearch = useDebounce(search)
  const searchRef = useRef<HTMLDivElement>(null)
  const [passwordOpen, setPasswordOpen] = useState(false)

  const crumbs = useMemo(() => {
    const parts = location.pathname.split('/').filter(Boolean)
    const acc: { label: string; to: string }[] = [{ label: 'Panel', to: '/' }]
    let path = ''
    for (const part of parts) {
      path += `/${part}`
      const label = BREADCRUMB_LABELS[part] ?? (part.length > 12 ? 'Detalle' : part)
      acc.push({ label, to: path })
    }
    return acc
  }, [location.pathname])

  const { data: searchResults, isFetching: searching } = useQuery({
    queryKey: ['contacts', 'global-search', debouncedSearch],
    queryFn: async () => {
      const res = await api.get<Paginated<Contact>>('/contacts', {
        params: { search: debouncedSearch, per_page: 6 },
      })
      return res.data.data
    },
    enabled: debouncedSearch.length >= 2,
  })

  const { data: notifications } = useQuery({
    queryKey: ['notifications', 'recent'],
    queryFn: async () => {
      const [calls, agreements, conversations] = await Promise.allSettled([
        api.get<Paginated<Call>>('/calls', { params: { per_page: 4 } }),
        api.get<Paginated<Agreement>>('/agreements', { params: { per_page: 3 } }),
        api.get<Paginated<Conversation>>('/conversations', { params: { per_page: 3, unread: 1 } }),
      ])
      const events: TimelineEvent[] = []
      if (calls.status === 'fulfilled') {
        for (const c of calls.value.data.data) {
          events.push({
            type: 'call',
            at: c.created_at ?? '',
            title: `Llamada a ${fullName(c.contact)}`,
            description: c.status,
          })
        }
      }
      if (agreements.status === 'fulfilled') {
        for (const a of agreements.value.data.data) {
          events.push({
            type: 'agreement',
            at: a.created_at ?? '',
            title: `Acuerdo de ${fullName(a.contact)}`,
            description: a.status,
          })
        }
      }
      if (conversations.status === 'fulfilled') {
        for (const cv of conversations.value.data.data) {
          events.push({
            type: 'message',
            at: cv.last_message_at ?? cv.created_at ?? '',
            title: `Mensaje de ${fullName(cv.contact)}`,
            description: cv.last_message?.body ?? 'Nuevo mensaje',
          })
        }
      }
      return events.sort((a, b) => (b.at > a.at ? 1 : -1)).slice(0, 8)
    },
    refetchInterval: 60000,
    retry: false,
  })

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current_password: '', password: '', password_confirmation: '' },
  })

  const changePassword = useMutation({
    mutationFn: (data: PasswordForm) => api.put('/auth/password', data),
    onSuccess: () => {
      toast.success('Contraseña actualizada')
      setPasswordOpen(false)
      passwordForm.reset()
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      // ignorar: el token se revoca localmente igual
    }
    disconnectEcho()
    logout()
    navigate('/login')
  }

  const notifIcon = (type: string) => {
    if (type === 'call') return <Phone className="h-4 w-4 text-blue-500" />
    if (type === 'agreement') return <Handshake className="h-4 w-4 text-emerald-500" />
    return <MessageCircle className="h-4 w-4 text-green-500" />
  }

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)}>
        <Menu />
      </Button>
      <Button variant="ghost" size="icon" className="hidden lg:inline-flex" onClick={toggleSidebar}>
        {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
      </Button>

      {/* Breadcrumb */}
      <nav className="hidden items-center gap-1 text-sm md:flex">
        {crumbs.map((crumb, i) => (
          <span key={crumb.to} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
            {i === crumbs.length - 1 ? (
              <span className="font-medium">{crumb.label}</span>
            ) : (
              <Link to={crumb.to} className="text-muted-foreground hover:text-foreground">
                {crumb.label}
              </Link>
            )}
          </span>
        ))}
      </nav>

      <div className="flex-1" />

      {/* Búsqueda global */}
      <div className="relative w-full max-w-xs" ref={searchRef}>
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setSearchOpen(true)
          }}
          onFocus={() => setSearchOpen(true)}
          onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
          placeholder="Buscar contactos…"
          className="pl-8"
        />
        {searchOpen && debouncedSearch.length >= 2 && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border bg-popover shadow-lg">
            {searching && <p className="p-3 text-sm text-muted-foreground">Buscando…</p>}
            {!searching && searchResults?.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">Sin resultados</p>
            )}
            {searchResults?.map((c) => (
              <button
                key={c.uuid}
                type="button"
                className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                onMouseDown={() => {
                  navigate(`/contacts/${c.uuid}`)
                  setSearch('')
                  setSearchOpen(false)
                }}
              >
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-xs">{initials(fullName(c))}</AvatarFallback>
                </Avatar>
                <span className="flex-1 truncate">
                  {fullName(c)}
                  <span className="block truncate text-xs text-muted-foreground">
                    {c.dni ? `DNI ${c.dni} · ` : ''}
                    {c.phone ?? ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Toggle tema */}
      <Button variant="ghost" size="icon" onClick={toggleTheme} title="Cambiar tema">
        {theme === 'dark' ? <Sun /> : <Moon />}
      </Button>

      {/* Notificaciones */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative">
            <Bell />
            {!!notifications?.length && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="border-b px-3 py-2 font-medium">Últimos eventos</div>
          <div className="max-h-80 overflow-y-auto">
            {!notifications?.length && (
              <EmptyState icon={Bell} title="Sin novedades" description="No hay eventos recientes." className="py-8" />
            )}
            {notifications?.map((n, i) => (
              <div key={i} className="flex items-start gap-2.5 border-b px-3 py-2.5 text-sm last:border-0">
                <div className="mt-0.5">{notifIcon(n.type)}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{n.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{n.description}</p>
                  <p className="text-xs text-muted-foreground">{formatRelative(n.at)}</p>
                </div>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Menú usuario */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="cursor-pointer rounded-full outline-none ring-ring focus-visible:ring-2">
            <Avatar>
              <AvatarFallback>{initials(user?.name)}</AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <p className="text-sm font-medium text-foreground">{user?.name}</p>
            <p className="truncate text-xs font-normal">{user?.email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled>
            <UserIcon />
            Perfil ({user?.roles?.join(', ') || 'sin rol'})
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setPasswordOpen(true)}>
            <KeyRound />
            Cambiar contraseña
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={handleLogout} className="text-destructive focus:text-destructive">
            <LogOut />
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Dialog cambiar contraseña */}
      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar contraseña</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={passwordForm.handleSubmit((data) => changePassword.mutate(data))}
            className="space-y-4"
          >
            <FormField label="Contraseña actual" error={passwordForm.formState.errors.current_password?.message} required>
              <Input type="password" {...passwordForm.register('current_password')} />
            </FormField>
            <FormField label="Nueva contraseña" error={passwordForm.formState.errors.password?.message} required>
              <Input type="password" {...passwordForm.register('password')} />
            </FormField>
            <FormField label="Confirmar contraseña" error={passwordForm.formState.errors.password_confirmation?.message} required>
              <Input type="password" {...passwordForm.register('password_confirmation')} />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPasswordOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={changePassword.isPending}>
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </header>
  )
}
