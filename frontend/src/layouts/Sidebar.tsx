import { NavLink, Link } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Wallet,
  Upload,
  Megaphone,
  Phone,
  Bot,
  Handshake,
  ListTodo,
  MessageCircle,
  BarChart3,
  ScrollText,
  UserCog,
  ShieldCheck,
  Settings,
  X,
  PhoneCall,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/api/client'
import type { Conversation, Paginated } from '@/types'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface NavItem {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  permission?: string
  badge?: number
}

interface NavSection {
  title: string
  items: NavItem[]
}

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const mobileOpen = useUiStore((s) => s.mobileSidebarOpen)
  const setMobileOpen = useUiStore((s) => s.setMobileSidebarOpen)
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const token = useAuthStore((s) => s.token)

  const { data: unreadData } = useQuery({
    queryKey: ['conversations', 'unread-count'],
    queryFn: async () => {
      const res = await api.get<Paginated<Conversation>>('/conversations', { params: { unread: 1, per_page: 1 } })
      return res.data
    },
    enabled: !!token && hasPermission('whatsapp.view'),
    refetchInterval: 30000,
    retry: false,
  })
  const unreadCount = unreadData?.meta?.total ?? 0

  const sections: NavSection[] = [
    {
      title: 'Panel',
      items: [{ to: '/', label: 'Panel', icon: LayoutDashboard }],
    },
    {
      title: 'Gestión',
      items: [
        { to: '/contacts', label: 'Contactos', icon: Users, permission: 'contacts.view' },
        { to: '/debts', label: 'Deudas', icon: Wallet, permission: 'debts.view' },
        { to: '/contacts/import', label: 'Importar', icon: Upload, permission: 'contacts.create' },
      ],
    },
    {
      title: 'Campañas',
      items: [
        { to: '/campaigns', label: 'Campañas', icon: Megaphone, permission: 'campaigns.view' },
        { to: '/calls', label: 'Llamadas', icon: Phone, permission: 'calls.view' },
        { to: '/prompts', label: 'Prompts IA', icon: Bot, permission: 'prompts.view' },
      ],
    },
    {
      title: 'Cobranza',
      items: [
        { to: '/agreements', label: 'Acuerdos', icon: Handshake, permission: 'agreements.view' },
        { to: '/follow-ups', label: 'Seguimientos', icon: ListTodo, permission: 'follow_ups.view' },
      ],
    },
    {
      title: 'WhatsApp',
      items: [{ to: '/whatsapp', label: 'WhatsApp', icon: MessageCircle, permission: 'whatsapp.view', badge: unreadCount }],
    },
    {
      title: 'Análisis',
      items: [
        { to: '/reports', label: 'Reportes', icon: BarChart3, permission: 'reports.view' },
        { to: '/audit', label: 'Auditoría', icon: ScrollText, permission: 'audit.view' },
      ],
    },
    {
      title: 'Administración',
      items: [
        { to: '/users', label: 'Usuarios', icon: UserCog, permission: 'users.view' },
        { to: '/roles', label: 'Roles', icon: ShieldCheck, permission: 'roles.view' },
        { to: '/settings', label: 'Configuración', icon: Settings, permission: 'settings.view' },
      ],
    },
  ]

  const content = (
    <div className="flex h-full flex-col">
      <div className={cn('flex h-14 items-center gap-2 border-b px-4', collapsed && 'justify-center px-2')}>
        <Link to="/" className="flex items-center gap-2 overflow-hidden" onClick={() => setMobileOpen(false)}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <PhoneCall className="h-4 w-4" />
          </div>
          {!collapsed && <span className="truncate font-bold">Cobranzas CRM</span>}
        </Link>
        <button
          type="button"
          className="ml-auto rounded-md p-1 hover:bg-accent lg:hidden cursor-pointer"
          onClick={() => setMobileOpen(false)}
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto p-2">
        {sections.map((section) => {
          const visible = section.items.filter((item) => !item.permission || hasPermission(item.permission))
          if (visible.length === 0) return null
          return (
            <div key={section.title}>
              {!collapsed && (
                <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.title}
                </p>
              )}
              <div className="space-y-0.5">
                {visible.map((item) => {
                  const link = (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/' || item.to === '/contacts'}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                          collapsed && 'justify-center px-2',
                        )
                      }
                    >
                      <span className="relative">
                        <item.icon className="h-4.5 w-4.5 shrink-0" />
                        {collapsed && !!item.badge && item.badge > 0 && (
                          <span className="absolute -right-1.5 -top-1.5 h-2 w-2 rounded-full bg-destructive" />
                        )}
                      </span>
                      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                      {!collapsed && !!item.badge && item.badge > 0 && (
                        <span className="rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground">
                          {item.badge > 99 ? '99+' : item.badge}
                        </span>
                      )}
                    </NavLink>
                  )
                  if (collapsed) {
                    return (
                      <Tooltip key={item.to} delayDuration={0}>
                        <TooltipTrigger asChild>{link}</TooltipTrigger>
                        <TooltipContent side="right">{item.label}</TooltipContent>
                      </Tooltip>
                    )
                  }
                  return link
                })}
              </div>
            </div>
          )
        })}
      </nav>
    </div>
  )

  return (
    <>
      {/* Escritorio */}
      <aside
        className={cn(
          'hidden shrink-0 border-r bg-card transition-all lg:block',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        {content}
      </aside>
      {/* Móvil (off-canvas) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-card shadow-xl">{content}</aside>
        </div>
      )}
    </>
  )
}
