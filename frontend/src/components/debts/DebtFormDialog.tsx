import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, ChevronsUpDown, Loader2, Search } from 'lucide-react'
import { api, apiErrorMessage } from '@/api/client'
import { useDebounce } from '@/hooks/useDebounce'
import { useAcademicCatalogs } from '@/hooks/useAcademicCatalogs'
import { fullName } from '@/lib/format'
import type { Contact, Debt, Paginated } from '@/types'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { FormField } from '@/components/shared/FormField'
import { cn } from '@/lib/utils'

const NEW_PERIOD = '__new__'
const NO_PERIOD = '__none__'

const schema = z.object({
  contact_uuid: z.string().min(1, 'Selecciona un contacto'),
  code: z.string().optional(),
  concept: z.string().min(1, 'El concepto es obligatorio'),
  original_amount: z.string().min(1, 'El monto es obligatorio'),
  pending_balance: z.string().min(1, 'El saldo es obligatorio'),
  currency: z.enum(['PEN', 'USD']),
  due_date: z.string().optional(),
  academic_period: z.string().optional(),
  status: z.string().min(1),
})

type DebtForm = z.infer<typeof schema>

interface DebtFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Deuda a editar (null/undefined = crear). */
  debt?: Debt | null
  /** Contacto fijo (p. ej. al abrir desde la ficha del contacto). */
  contact?: Pick<Contact, 'uuid' | 'first_name' | 'last_name' | 'full_name'> | null
}

/** Buscador de contacto (GET /contacts?search=). */
function ContactPicker({
  value,
  label,
  onSelect,
  error,
}: {
  value: string
  label: string
  onSelect: (contact: Contact) => void
  error?: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)

  const { data, isFetching } = useQuery({
    queryKey: ['contacts', 'picker', debouncedSearch],
    queryFn: async () => {
      const res = await api.get<Paginated<Contact>>('/contacts', {
        params: { search: debouncedSearch || undefined, per_page: 10 },
      })
      return res.data.data
    },
    enabled: open,
  })

  return (
    <FormField label="Contacto" required error={error}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal">
            <span className={cn('truncate', !value && 'text-muted-foreground')}>
              {value ? label : 'Buscar contacto…'}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <div className="relative border-b p-2">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nombre, DNI, teléfono…"
              className="h-8 pl-8"
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {isFetching && (
              <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Buscando…
              </div>
            )}
            {!isFetching && !data?.length && (
              <p className="py-4 text-center text-sm text-muted-foreground">Sin resultados</p>
            )}
            {!isFetching &&
              data?.map((c) => (
                <button
                  key={c.uuid}
                  type="button"
                  className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                  onClick={() => {
                    onSelect(c)
                    setOpen(false)
                  }}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{fullName(c)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {c.dni ? `DNI ${c.dni}` : c.student_code ? `Código ${c.student_code}` : c.phone ?? '—'}
                    </span>
                  </span>
                  {value === c.uuid && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              ))}
          </div>
        </PopoverContent>
      </Popover>
    </FormField>
  )
}

/** Diálogo para crear o editar una deuda. */
export function DebtFormDialog({ open, onOpenChange, debt, contact }: DebtFormDialogProps) {
  const queryClient = useQueryClient()
  const { catalogs } = useAcademicCatalogs()
  const isEdit = !!debt
  const fixedContact = contact ?? debt?.contact ?? null

  const [contactLabel, setContactLabel] = useState('')
  const [customPeriod, setCustomPeriod] = useState(false)

  const form = useForm<DebtForm>({
    resolver: zodResolver(schema),
    defaultValues: { currency: 'PEN', status: 'pending', contact_uuid: '' },
  })

  useEffect(() => {
    if (!open) return
    const period = debt?.academic_period ?? ''
    form.reset({
      contact_uuid: fixedContact?.uuid ?? debt?.contact_uuid ?? '',
      code: debt?.code ?? debt?.reference ?? '',
      concept: debt?.concept ?? '',
      original_amount: debt ? String(debt.original_amount ?? '') : '',
      pending_balance: debt ? String(debt.pending_balance ?? debt.current_balance ?? '') : '',
      currency: debt?.currency === 'USD' ? 'USD' : 'PEN',
      due_date: debt?.due_date ? debt.due_date.slice(0, 10) : '',
      academic_period: period,
      status: debt?.status ?? 'pending',
    })
    setContactLabel(fixedContact ? fullName(fixedContact) : '')
    setCustomPeriod(!!period && !catalogs.periods.includes(period))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, debt, contact])

  const mutation = useMutation({
    mutationFn: (values: DebtForm) => {
      const payload = {
        contact_uuid: values.contact_uuid,
        code: values.code || null,
        concept: values.concept,
        original_amount: Number(values.original_amount),
        pending_balance: Number(values.pending_balance),
        currency: values.currency,
        due_date: values.due_date || null,
        academic_period: values.academic_period || null,
        status: values.status,
      }
      return isEdit ? api.put(`/debts/${debt.uuid}`, payload) : api.post('/debts', payload)
    },
    onSuccess: (_res, values) => {
      toast.success(isEdit ? 'Deuda actualizada' : 'Deuda creada')
      queryClient.invalidateQueries({ queryKey: ['debts'] })
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      queryClient.invalidateQueries({ queryKey: ['contact', values.contact_uuid] })
      onOpenChange(false)
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  const errors = form.formState.errors
  const period = form.watch('academic_period') ?? ''

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar deuda' : 'Nueva deuda'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
          {fixedContact ? (
            <FormField label="Contacto">
              <Input value={fullName(fixedContact)} readOnly disabled />
            </FormField>
          ) : (
            <ContactPicker
              value={form.watch('contact_uuid')}
              label={contactLabel}
              error={errors.contact_uuid?.message}
              onSelect={(c) => {
                form.setValue('contact_uuid', c.uuid, { shouldValidate: true })
                setContactLabel(fullName(c))
              }}
            />
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Código" error={errors.code?.message}>
              <Input {...form.register('code')} placeholder="p. ej. PEN-2026-001" />
            </FormField>
            <FormField label="Concepto" error={errors.concept?.message} required>
              <Input {...form.register('concept')} placeholder="p. ej. Pensión marzo" />
            </FormField>
            <FormField label="Monto original" error={errors.original_amount?.message} required>
              <Input type="number" step="0.01" min="0" {...form.register('original_amount')} />
            </FormField>
            <FormField label="Saldo pendiente" error={errors.pending_balance?.message} required>
              <Input type="number" step="0.01" min="0" {...form.register('pending_balance')} />
            </FormField>
            <FormField label="Moneda">
              <Select value={form.watch('currency')} onValueChange={(v) => form.setValue('currency', v as 'PEN' | 'USD')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PEN">PEN (S/)</SelectItem>
                  <SelectItem value="USD">USD ($)</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Fecha de vencimiento" error={errors.due_date?.message}>
              <Input type="date" {...form.register('due_date')} />
            </FormField>
            <FormField label="Periodo académico">
              {customPeriod ? (
                <div className="flex gap-2">
                  <Input
                    value={period}
                    onChange={(e) => form.setValue('academic_period', e.target.value)}
                    placeholder="p. ej. 2026-2"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setCustomPeriod(false)
                      form.setValue('academic_period', '')
                    }}
                  >
                    Lista
                  </Button>
                </div>
              ) : (
                <Select
                  value={period || NO_PERIOD}
                  onValueChange={(v) => {
                    if (v === NEW_PERIOD) {
                      setCustomPeriod(true)
                      form.setValue('academic_period', '')
                    } else {
                      form.setValue('academic_period', v === NO_PERIOD ? '' : v)
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona periodo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PERIOD}>— Sin periodo —</SelectItem>
                    {catalogs.periods.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                    <SelectItem value={NEW_PERIOD}>Escribir otro…</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </FormField>
            <FormField label="Estado">
              <Select value={form.watch('status')} onValueChange={(v) => form.setValue('status', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendiente</SelectItem>
                  <SelectItem value="overdue">Vencida</SelectItem>
                  <SelectItem value="in_agreement">En acuerdo</SelectItem>
                  <SelectItem value="paid">Pagada</SelectItem>
                  <SelectItem value="written_off">Castigada</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              {isEdit ? 'Guardar cambios' : 'Crear deuda'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
