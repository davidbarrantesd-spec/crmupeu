import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, apiErrorMessage } from '@/api/client'
import type { Contact } from '@/types'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FormField } from '@/components/shared/FormField'

const schema = z.object({
  internal_code: z.string().optional(),
  first_name: z.string().min(1, 'El nombre es obligatorio'),
  last_name: z.string().optional(),
  dni: z.string().optional(),
  phone: z.string().min(1, 'El teléfono es obligatorio'),
  phone_secondary: z.string().optional(),
  email: z.string().email('Correo inválido').optional().or(z.literal('')),
  city: z.string().optional(),
  address: z.string().optional(),
  status: z.string().optional(),
  source: z.string().optional(),
  segment: z.string().optional(),
  call_consent: z.boolean(),
  whatsapp_consent: z.boolean(),
  do_not_contact: z.boolean(),
  do_not_contact_reason: z.string().optional(),
  tags: z.string().optional(),
})

type ContactForm = z.infer<typeof schema>

interface ContactFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contact?: Contact | null
}

export function ContactFormDialog({ open, onOpenChange, contact }: ContactFormDialogProps) {
  const queryClient = useQueryClient()
  const isEdit = !!contact

  const form = useForm<ContactForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      call_consent: true,
      whatsapp_consent: true,
      do_not_contact: false,
    },
  })

  useEffect(() => {
    if (open) {
      form.reset({
        internal_code: contact?.internal_code ?? '',
        first_name: contact?.first_name ?? '',
        last_name: contact?.last_name ?? '',
        dni: contact?.dni ?? '',
        phone: contact?.phone ?? '',
        phone_secondary: contact?.phone_secondary ?? '',
        email: contact?.email ?? '',
        city: contact?.city ?? '',
        address: contact?.address ?? '',
        status: contact?.status ?? 'active',
        source: contact?.source ?? '',
        segment: contact?.segment ?? '',
        call_consent: contact?.call_consent ?? true,
        whatsapp_consent: contact?.whatsapp_consent ?? true,
        do_not_contact: contact?.do_not_contact ?? false,
        do_not_contact_reason: contact?.do_not_contact_reason ?? '',
        tags: (contact?.tags ?? []).map((t) => (typeof t === 'string' ? t : t.name)).join(', '),
      })
    }
  }, [open, contact, form])

  const mutation = useMutation({
    mutationFn: (data: ContactForm) => {
      const payload = {
        ...data,
        email: data.email || null,
        tags: data.tags
          ? data.tags.split(',').map((t) => t.trim()).filter(Boolean)
          : [],
      }
      return isEdit ? api.put(`/contacts/${contact.uuid}`, payload) : api.post('/contacts', payload)
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Contacto actualizado' : 'Contacto creado')
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      if (contact) queryClient.invalidateQueries({ queryKey: ['contact', contact.uuid] })
      onOpenChange(false)
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  const doNotContact = form.watch('do_not_contact')
  const errors = form.formState.errors

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar contacto' : 'Nuevo contacto'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Nombres" error={errors.first_name?.message} required>
              <Input {...form.register('first_name')} />
            </FormField>
            <FormField label="Apellidos" error={errors.last_name?.message}>
              <Input {...form.register('last_name')} />
            </FormField>
            <FormField label="DNI" error={errors.dni?.message}>
              <Input {...form.register('dni')} maxLength={12} />
            </FormField>
            <FormField label="Código interno" error={errors.internal_code?.message}>
              <Input {...form.register('internal_code')} />
            </FormField>
            <FormField label="Teléfono" error={errors.phone?.message} required>
              <Input {...form.register('phone')} placeholder="+51 999 999 999" />
            </FormField>
            <FormField label="Teléfono secundario" error={errors.phone_secondary?.message}>
              <Input {...form.register('phone_secondary')} />
            </FormField>
            <FormField label="Correo" error={errors.email?.message}>
              <Input type="email" {...form.register('email')} />
            </FormField>
            <FormField label="Ciudad" error={errors.city?.message}>
              <Input {...form.register('city')} />
            </FormField>
            <FormField label="Dirección" error={errors.address?.message} className="sm:col-span-2">
              <Input {...form.register('address')} />
            </FormField>
            <FormField label="Estado">
              <Select value={form.watch('status') ?? 'active'} onValueChange={(v) => form.setValue('status', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Activo</SelectItem>
                  <SelectItem value="inactive">Inactivo</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Segmento" error={errors.segment?.message}>
              <Input {...form.register('segment')} placeholder="p. ej. premium" />
            </FormField>
            <FormField label="Fuente" error={errors.source?.message}>
              <Input {...form.register('source')} placeholder="p. ej. importación" />
            </FormField>
            <FormField label="Etiquetas" error={errors.tags?.message} hint="Separadas por comas">
              <Input {...form.register('tags')} placeholder="vip, moroso" />
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-3 rounded-lg border p-4 sm:grid-cols-3">
            <div className="flex items-center justify-between gap-2">
              <Label>Consiente llamadas</Label>
              <Switch checked={form.watch('call_consent')} onCheckedChange={(v) => form.setValue('call_consent', v)} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label>Consiente WhatsApp</Label>
              <Switch checked={form.watch('whatsapp_consent')} onCheckedChange={(v) => form.setValue('whatsapp_consent', v)} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-destructive">No contactar</Label>
              <Switch checked={doNotContact} onCheckedChange={(v) => form.setValue('do_not_contact', v)} />
            </div>
            {doNotContact && (
              <FormField label="Motivo de no contactar" className="sm:col-span-3">
                <Textarea rows={2} {...form.register('do_not_contact_reason')} />
              </FormField>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              {isEdit ? 'Guardar cambios' : 'Crear contacto'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
