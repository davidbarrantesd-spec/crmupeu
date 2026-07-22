import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Phone, AudioLines, MessageSquareText, Bot } from 'lucide-react'
import { api, apiErrorMessage } from '@/api/client'
import { fullName } from '@/lib/format'
import type { Contact, Paginated, Prompt } from '@/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FormField } from '@/components/shared/FormField'
import { cn } from '@/lib/utils'

type CallType = 'recorded_audio' | 'tts' | 'ai_conversational'

interface CallDialogProps {
  contact: Contact | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const TYPE_OPTIONS: { value: CallType; label: string; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'recorded_audio', label: 'Aviso con audio', description: 'Reproduce un audio pregrabado', icon: AudioLines },
  { value: 'tts', label: 'Texto a voz', description: 'Convierte un mensaje de texto en voz', icon: MessageSquareText },
  { value: 'ai_conversational', label: 'Conversacional IA', description: 'Agente de IA conversa con el contacto', icon: Bot },
]

export function CallDialog({ contact, open, onOpenChange }: CallDialogProps) {
  const [type, setType] = useState<CallType>('tts')
  const [ttsMessage, setTtsMessage] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
  const [promptVersionUuid, setPromptVersionUuid] = useState('')

  const { data: prompts } = useQuery({
    queryKey: ['prompts', 'for-call'],
    queryFn: async () => {
      const res = await api.get<Paginated<Prompt>>('/prompts', { params: { per_page: 100 } })
      return res.data.data
    },
    enabled: open && type === 'ai_conversational',
  })

  const createCall = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = { contact_uuid: contact?.uuid, type }
      if (type === 'tts') payload.tts_message = ttsMessage
      if (type === 'recorded_audio') payload.audio_url = audioUrl
      if (type === 'ai_conversational') payload.prompt_version_uuid = promptVersionUuid
      return api.post('/calls', payload)
    },
    onSuccess: () => {
      toast.success('Llamada iniciada', { description: `Llamando a ${fullName(contact)}` })
      onOpenChange(false)
      setTtsMessage('')
      setAudioUrl('')
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  const canSubmit =
    (type === 'tts' && ttsMessage.trim().length > 0) ||
    (type === 'recorded_audio' && audioUrl.trim().length > 0) ||
    (type === 'ai_conversational' && promptVersionUuid.length > 0)

  const publishedVersions = (prompts ?? []).flatMap((p) => {
    const v = p.published_version ?? p.current_version
    return v?.uuid ? [{ uuid: v.uuid, label: `${p.name} (v${v.version ?? '—'})` }] : []
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Llamar a {fullName(contact)}</DialogTitle>
          <DialogDescription>
            {contact?.phone ? `Se llamará al número ${contact.phone}` : 'El contacto no tiene teléfono registrado'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setType(opt.value)}
              className={cn(
                'flex cursor-pointer flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors hover:bg-accent',
                type === opt.value && 'border-primary bg-primary/5 ring-1 ring-primary',
              )}
            >
              <opt.icon className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">{opt.label}</span>
              <span className="text-xs text-muted-foreground">{opt.description}</span>
            </button>
          ))}
        </div>

        {type === 'tts' && (
          <FormField label="Mensaje a reproducir" required hint="Se convertirá a voz automáticamente">
            <Textarea
              rows={4}
              value={ttsMessage}
              onChange={(e) => setTtsMessage(e.target.value)}
              placeholder="Hola {{nombre}}, le recordamos que tiene un saldo pendiente de {{saldo}}…"
            />
          </FormField>
        )}

        {type === 'recorded_audio' && (
          <FormField label="URL del audio" required hint="URL de un audio mp3/wav ya subido">
            <Input value={audioUrl} onChange={(e) => setAudioUrl(e.target.value)} placeholder="https://…/audio.mp3" />
          </FormField>
        )}

        {type === 'ai_conversational' && (
          <FormField label="Prompt de IA" required hint="Solo versiones publicadas">
            <Select value={promptVersionUuid} onValueChange={setPromptVersionUuid}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un prompt" />
              </SelectTrigger>
              <SelectContent>
                {publishedVersions.length === 0 && (
                  <div className="p-2 text-sm text-muted-foreground">No hay prompts publicados</div>
                )}
                {publishedVersions.map((v) => (
                  <SelectItem key={v.uuid} value={v.uuid}>
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => createCall.mutate()} disabled={!canSubmit || !contact?.phone} loading={createCall.isPending}>
            <Phone />
            Iniciar llamada
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
