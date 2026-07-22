import { Fragment, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Save, ShieldCheck } from 'lucide-react'
import { api, apiErrorMessage } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import type { Role } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { FormField } from '@/components/shared/FormField'

const MODULE_LABELS: Record<string, string> = {
  contacts: 'Contactos',
  debts: 'Deudas',
  campaigns: 'Campañas',
  calls: 'Llamadas',
  prompts: 'Prompts IA',
  agreements: 'Acuerdos',
  follow_ups: 'Seguimientos',
  whatsapp: 'WhatsApp',
  reports: 'Reportes',
  users: 'Usuarios',
  roles: 'Roles',
  settings: 'Configuración',
  audit: 'Auditoría',
  recordings: 'Grabaciones',
  transcriptions: 'Transcripciones',
  finance: 'Finanzas',
  imports: 'Importaciones',
}

const ACTION_LABELS: Record<string, string> = {
  view: 'Ver',
  create: 'Crear',
  edit: 'Editar',
  delete: 'Eliminar',
  export: 'Exportar',
  launch: 'Lanzar',
  reply: 'Responder',
  listen: 'Escuchar',
  assign: 'Asignar',
  import: 'Importar',
}

export default function Roles() {
  const queryClient = useQueryClient()
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const [dirty, setDirty] = useState<Record<number, string[]>>({})
  const [newRoleOpen, setNewRoleOpen] = useState(false)
  const [newRoleName, setNewRoleName] = useState('')

  const { data: roles, isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await api.get<{ data: Role[] }>('/roles')
      return res.data.data
    },
  })

  const { data: permissionsData, isLoading: loadingPerms } = useQuery({
    queryKey: ['permissions'],
    queryFn: async () => {
      const res = await api.get<{ data: Record<string, string[]> | { module: string; permissions: string[] }[] }>('/permissions')
      return res.data.data
    },
  })

  // Normalizar permisos agrupados por módulo
  const groups = useMemo(() => {
    if (!permissionsData) return [] as { module: string; permissions: string[] }[]
    if (Array.isArray(permissionsData)) return permissionsData
    return Object.entries(permissionsData).map(([module, permissions]) => ({ module, permissions }))
  }, [permissionsData])

  useEffect(() => {
    if (roles) {
      const initial: Record<number, string[]> = {}
      for (const r of roles) initial[r.id] = r.permissions ?? []
      setDirty(initial)
    }
  }, [roles])

  const save = useMutation({
    mutationFn: (role: Role) => api.put(`/roles/${role.id}`, { name: role.name, permissions: dirty[role.id] ?? [] }),
    onSuccess: () => {
      toast.success('Permisos guardados')
      queryClient.invalidateQueries({ queryKey: ['roles'] })
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  const createRole = useMutation({
    mutationFn: () => api.post('/roles', { name: newRoleName, permissions: [] }),
    onSuccess: () => {
      toast.success('Rol creado')
      setNewRoleOpen(false)
      setNewRoleName('')
      queryClient.invalidateQueries({ queryKey: ['roles'] })
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  const toggle = (roleId: number, perm: string, checked: boolean) => {
    setDirty((d) => {
      const current = d[roleId] ?? []
      return { ...d, [roleId]: checked ? [...current, perm] : current.filter((p) => p !== perm) }
    })
  }

  const toggleModule = (roleId: number, perms: string[], checked: boolean) => {
    setDirty((d) => {
      const current = new Set(d[roleId] ?? [])
      for (const p of perms) {
        if (checked) current.add(p)
        else current.delete(p)
      }
      return { ...d, [roleId]: Array.from(current) }
    })
  }

  const hasChanges = (role: Role) => {
    const original = new Set(role.permissions ?? [])
    const current = new Set(dirty[role.id] ?? [])
    if (original.size !== current.size) return true
    for (const p of original) if (!current.has(p)) return true
    return false
  }

  const canEdit = hasPermission('roles.edit')

  if (isLoading || loadingPerms) {
    return (
      <div className="p-6">
        <Skeleton className="mb-6 h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Roles y permisos"
        description="Matriz de permisos por módulo para cada rol"
        actions={
          hasPermission('roles.create') && (
            <Button onClick={() => setNewRoleOpen(true)}>
              <Plus />
              Nuevo rol
            </Button>
          )
        }
      />

      {!roles?.length && <EmptyState icon={ShieldCheck} title="Sin roles" description="Crea un rol para asignar permisos." />}

      {!!roles?.length && (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">Módulo / Permiso</TableHead>
                {roles.map((r) => (
                  <TableHead key={r.id} className="text-center">
                    <div className="flex flex-col items-center gap-1.5 py-1">
                      <span className="normal-case text-foreground">{r.name}</span>
                      {canEdit && (
                        <Button
                          size="sm"
                          variant={hasChanges(r) ? 'default' : 'outline'}
                          disabled={!hasChanges(r)}
                          loading={save.isPending && save.variables?.id === r.id}
                          onClick={() => save.mutate(r)}
                        >
                          <Save />
                          Guardar
                        </Button>
                      )}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) => {
                const modulePerms = group.permissions
                return (
                  <Fragment key={group.module}>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableCell className="font-semibold">
                        {MODULE_LABELS[group.module] ?? group.module}
                      </TableCell>
                      {roles.map((r) => {
                        const current = dirty[r.id] ?? []
                        const allChecked = modulePerms.every((p) => current.includes(p))
                        return (
                          <TableCell key={r.id} className="text-center">
                            <Checkbox
                              checked={allChecked}
                              disabled={!canEdit}
                              onCheckedChange={(checked) => toggleModule(r.id, modulePerms, !!checked)}
                            />
                          </TableCell>
                        )
                      })}
                    </TableRow>
                    {modulePerms.map((perm) => {
                      const action = perm.split('.').pop() ?? perm
                      return (
                        <TableRow key={perm}>
                          <TableCell className="pl-8 text-sm text-muted-foreground">
                            {ACTION_LABELS[action] ?? action}
                            <span className="ml-1.5 font-mono text-[10px] opacity-60">{perm}</span>
                          </TableCell>
                          {roles.map((r) => (
                            <TableCell key={r.id} className="text-center">
                              <Checkbox
                                checked={(dirty[r.id] ?? []).includes(perm)}
                                disabled={!canEdit}
                                onCheckedChange={(checked) => toggle(r.id, perm, !!checked)}
                              />
                            </TableCell>
                          ))}
                        </TableRow>
                      )
                    })}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={newRoleOpen} onOpenChange={setNewRoleOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nuevo rol</DialogTitle>
          </DialogHeader>
          <FormField label="Nombre del rol" required>
            <Input value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} placeholder="p. ej. supervisor" />
          </FormField>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewRoleOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={!newRoleName.trim()} loading={createRole.isPending} onClick={() => createRole.mutate()}>
              Crear rol
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
