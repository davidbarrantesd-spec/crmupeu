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
import { useAcademicCatalogs, modalityLabel, enrollmentLabel } from '@/hooks/useAcademicCatalogs'

const NONE = '__none__'

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
  // Datos académicos (opcionales)
  id_persona: z.string().optional(),
  student_code: z.string().optional(),
  campus_id: z.string().optional(),
  faculty_id: z.string().optional(),
  career_id: z.string().optional(),
  academic_level_id: z.string().optional(),
  modality: z.string().optional(),
  enrollment_status: z.string().optional(),
})

type ContactForm = z.infer<typeof schema>

interface ContactFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contact?: Contact | null
}

/** Extrae el id de una referencia de catálogo ({id, name} | string | null). */
function refId(ref: Contact['campus']): string {
  if (ref && typeof ref === 'object' && ref.id != null) return String(ref.id)
  return ''
}

export function ContactFormDialog({ open, onOpenChange, contact }: ContactFormDialogProps) {
  const queryClient = useQueryClient()
  const isEdit = !!contact
  const { catalogs, careersForFaculty } = useAcademicCatalogs()

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
        id_persona: contact?.id_persona != null ? String(contact.id_persona) : '',
        student_code: contact?.student_code ?? '',
        campus_id: refId(contact?.campus),
        faculty_id: refId(contact?.faculty),
        career_id: refId(contact?.career),
        academic_level_id: refId(contact?.academic_level),
        modality: contact?.modality ?? '',
        enrollment_status: contact?.enrollment_status ?? '',
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
        // Datos académicos
        id_persona: data.id_persona || null,
        student_code: data.student_code || null,
        campus_id: data.campus_id ? Number(data.campus_id) : null,
        faculty_id: data.faculty_id ? Number(data.faculty_id) : null,
        career_id: data.career_id ? Number(data.career_id) : null,
        academic_level_id: data.academic_level_id ? Number(data.academic_level_id) : null,
        modality: data.modality || null,
        enrollment_status: data.enrollment_status || null,
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

          {/* Datos académicos */}
          <div className="rounded-lg border p-4">
            <p className="mb-3 text-sm font-medium">Datos académicos</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="ID persona" error={errors.id_persona?.message}>
                <Input {...form.register('id_persona')} placeholder="p. ej. 123456" />
              </FormField>
              <FormField label="Código de estudiante" error={errors.student_code?.message}>
                <Input {...form.register('student_code')} placeholder="p. ej. 202112345" />
              </FormField>
              <FormField label="Campus">
                <Select
                  value={form.watch('campus_id') || NONE}
                  onValueChange={(v) => form.setValue('campus_id', v === NONE ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona campus" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— Sin campus —</SelectItem>
                    {catalogs.campuses.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Facultad">
                <Select
                  value={form.watch('faculty_id') || NONE}
                  onValueChange={(v) => {
                    const next = v === NONE ? '' : v
                    form.setValue('faculty_id', next)
                    // Cascada: limpiar carrera si ya no pertenece a la facultad
                    const careerId = form.getValues('career_id')
                    if (careerId && !careersForFaculty(next || undefined).some((c) => String(c.id) === careerId)) {
                      form.setValue('career_id', '')
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona facultad" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— Sin facultad —</SelectItem>
                    {catalogs.faculties.map((f) => (
                      <SelectItem key={f.id} value={String(f.id)}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Carrera">
                <Select
                  value={form.watch('career_id') || NONE}
                  onValueChange={(v) => form.setValue('career_id', v === NONE ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona carrera" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— Sin carrera —</SelectItem>
                    {careersForFaculty(form.watch('faculty_id') || undefined).map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Nivel">
                <Select
                  value={form.watch('academic_level_id') || NONE}
                  onValueChange={(v) => form.setValue('academic_level_id', v === NONE ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona nivel" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— Sin nivel —</SelectItem>
                    {catalogs.levels.map((l) => (
                      <SelectItem key={l.id} value={String(l.id)}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Modalidad">
                <Select
                  value={form.watch('modality') || NONE}
                  onValueChange={(v) => form.setValue('modality', v === NONE ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona modalidad" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— Sin modalidad —</SelectItem>
                    {catalogs.modalities.map((m) => (
                      <SelectItem key={m} value={m}>
                        {modalityLabel(m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Estado de matrícula">
                <Select
                  value={form.watch('enrollment_status') || NONE}
                  onValueChange={(v) => form.setValue('enrollment_status', v === NONE ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— Sin estado —</SelectItem>
                    <SelectItem value="matriculado">{enrollmentLabel('matriculado')}</SelectItem>
                    <SelectItem value="no_matriculado">{enrollmentLabel('no_matriculado')}</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            </div>
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
