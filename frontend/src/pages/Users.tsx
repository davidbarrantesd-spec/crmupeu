import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { MoreHorizontal, Pencil, Plus, Trash2, UserCog, UserCheck, UserX } from 'lucide-react'
import { api, apiErrorMessage } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { useDebounce } from '@/hooks/useDebounce'
import { formatDate, initials } from '@/lib/format'
import type { Paginated, Role, User } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageHeader } from '@/components/shared/PageHeader'
import { FilterBar } from '@/components/shared/FilterBar'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { FormField } from '@/components/shared/FormField'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'

const userSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio'),
  email: z.string().email('Correo inválido'),
  phone: z.string().optional(),
  password: z.string().optional(),
  status: z.enum(['active', 'inactive']),
  roles: z.array(z.string()).min(1, 'Selecciona al menos un rol'),
})

type UserForm = z.infer<typeof userSchema>

function roleNames(u: User): string[] {
  return (u.roles ?? []).map((r) => (typeof r === 'string' ? r : r.name))
}

export default function Users() {
  const queryClient = useQueryClient()
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['users', { page, search: debouncedSearch }],
    queryFn: async () => {
      const res = await api.get<Paginated<User>>('/users', {
        params: { page, per_page: 15, search: debouncedSearch || undefined },
      })
      return res.data
    },
  })

  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await api.get<{ data: Role[] }>('/roles')
      return res.data.data
    },
  })

  const form = useForm<UserForm>({
    resolver: zodResolver(userSchema),
    defaultValues: { name: '', email: '', phone: '', password: '', status: 'active', roles: [] },
  })

  const openForm = (user: User | null) => {
    setEditing(user)
    form.reset(
      user
        ? {
            name: user.name,
            email: user.email,
            phone: user.phone ?? '',
            password: '',
            status: user.status,
            roles: roleNames(user),
          }
        : { name: '', email: '', phone: '', password: '', status: 'active', roles: [] },
    )
    setFormOpen(true)
  }

  const save = useMutation({
    mutationFn: (values: UserForm) => {
      const payload: Record<string, unknown> = { ...values }
      if (!values.password) delete payload.password
      return editing ? api.put(`/users/${editing.uuid}`, payload) : api.post('/users', payload)
    },
    onSuccess: () => {
      toast.success(editing ? 'Usuario actualizado' : 'Usuario creado')
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setFormOpen(false)
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  const toggleStatus = useMutation({
    mutationFn: (user: User) =>
      api.put(`/users/${user.uuid}`, { status: user.status === 'active' ? 'inactive' : 'active' }),
    onSuccess: () => {
      toast.success('Estado actualizado')
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  const remove = useMutation({
    mutationFn: (uuid: string) => api.delete(`/users/${uuid}`),
    onSuccess: () => {
      toast.success('Usuario eliminado')
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  const selectedRoles = form.watch('roles')

  const columns: Column<User>[] = [
    {
      key: 'name',
      header: 'Usuario',
      render: (u) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">{initials(u.name)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">{u.name}</p>
            <p className="text-xs text-muted-foreground">{u.email}</p>
          </div>
        </div>
      ),
    },
    { key: 'phone', header: 'Teléfono', render: (u) => u.phone ?? '—' },
    {
      key: 'roles',
      header: 'Roles',
      render: (u) => (
        <div className="flex flex-wrap gap-1">
          {roleNames(u).map((r) => (
            <Badge key={r} variant="secondary">
              {r}
            </Badge>
          ))}
        </div>
      ),
    },
    { key: 'status', header: 'Estado', render: (u) => <StatusBadge status={u.status} /> },
    { key: 'created_at', header: 'Creado', render: (u) => formatDate(u.created_at) },
    {
      key: 'actions',
      header: '',
      className: 'w-10',
      render: (u) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="iconSm">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {hasPermission('users.edit') && (
              <>
                <DropdownMenuItem onSelect={() => openForm(u)}>
                  <Pencil />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => toggleStatus.mutate(u)}>
                  {u.status === 'active' ? <UserX /> : <UserCheck />}
                  {u.status === 'active' ? 'Desactivar' : 'Activar'}
                </DropdownMenuItem>
              </>
            )}
            {hasPermission('users.delete') && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleteTarget(u)}>
                  <Trash2 />
                  Eliminar
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
        title="Usuarios"
        description="Gestión de usuarios y asignación de roles"
        actions={
          hasPermission('users.create') && (
            <Button onClick={() => openForm(null)}>
              <Plus />
              Nuevo usuario
            </Button>
          )
        }
      />

      <FilterBar search={search} onSearchChange={(v) => { setSearch(v); setPage(1) }} searchPlaceholder="Nombre o correo…" />

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        page={page}
        onPageChange={setPage}
        rowKey={(u) => u.uuid}
        emptyTitle="Sin usuarios"
        emptyIcon={UserCog}
      />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar usuario' : 'Nuevo usuario'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
            <FormField label="Nombre" error={form.formState.errors.name?.message} required>
              <Input {...form.register('name')} />
            </FormField>
            <FormField label="Correo" error={form.formState.errors.email?.message} required>
              <Input type="email" {...form.register('email')} />
            </FormField>
            <FormField label="Teléfono">
              <Input {...form.register('phone')} />
            </FormField>
            <FormField
              label={editing ? 'Nueva contraseña (opcional)' : 'Contraseña'}
              error={form.formState.errors.password?.message}
              required={!editing}
            >
              <Input type="password" {...form.register('password')} autoComplete="new-password" />
            </FormField>
            <FormField label="Roles" error={form.formState.errors.roles?.message} required>
              <div className="space-y-2 rounded-lg border p-3">
                {(roles ?? []).map((r) => (
                  <label key={r.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={selectedRoles.includes(r.name)}
                      onCheckedChange={(checked) =>
                        form.setValue(
                          'roles',
                          checked ? [...selectedRoles, r.name] : selectedRoles.filter((x) => x !== r.name),
                          { shouldValidate: true },
                        )
                      }
                    />
                    {r.name}
                  </label>
                ))}
              </div>
            </FormField>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={form.watch('status') === 'active'}
                onCheckedChange={(checked) => form.setValue('status', checked ? 'active' : 'inactive')}
              />
              Usuario activo
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={save.isPending}>
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Eliminar usuario"
        description={`¿Eliminar al usuario ${deleteTarget?.name}? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        destructive
        onConfirm={async () => {
          if (deleteTarget) await remove.mutateAsync(deleteTarget.uuid)
        }}
      />
    </div>
  )
}
