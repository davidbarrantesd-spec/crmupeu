import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { PhoneCall, TrendingUp, Bot, MessageCircle, AlertCircle } from 'lucide-react'
import { api, apiErrorMessage } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import type { ApiResource, AuthUser } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/shared/FormField'

const schema = z.object({
  email: z.string().min(1, 'Ingresa tu correo').email('Correo inválido'),
  password: z.string().min(1, 'Ingresa tu contraseña'),
})

type LoginForm = z.infer<typeof schema>

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const token = useAuthStore((s) => s.token)
  const setAuth = useAuthStore((s) => s.setAuth)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const form = useForm<LoginForm>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })

  if (token) {
    return <Navigate to="/" replace />
  }

  const onSubmit = async (data: LoginForm) => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.post<ApiResource<{ token: string; user: AuthUser }>>('/auth/login', data)
      setAuth(res.data.data.token, res.data.data.user)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from && from !== '/login' ? from : '/', { replace: true })
    } catch (e) {
      setError(apiErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Branding */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-indigo-950 via-indigo-900 to-violet-900 p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 backdrop-blur">
            <PhoneCall className="h-5 w-5" />
          </div>
          <span className="text-xl font-bold">Cobranzas CRM</span>
        </div>
        <div className="space-y-6">
          <h1 className="text-4xl font-bold leading-tight">
            Gestión de cobranzas
            <br />
            omnicanal e inteligente
          </h1>
          <p className="max-w-md text-lg text-indigo-200">
            Campañas de llamadas con IA conversacional, WhatsApp y seguimiento de acuerdos de pago en un solo lugar.
          </p>
          <div className="grid max-w-md grid-cols-3 gap-4">
            <div className="rounded-lg bg-white/10 p-4 backdrop-blur">
              <Bot className="mb-2 h-6 w-6" />
              <p className="text-sm font-medium">Llamadas con IA</p>
            </div>
            <div className="rounded-lg bg-white/10 p-4 backdrop-blur">
              <MessageCircle className="mb-2 h-6 w-6" />
              <p className="text-sm font-medium">Bandeja WhatsApp</p>
            </div>
            <div className="rounded-lg bg-white/10 p-4 backdrop-blur">
              <TrendingUp className="mb-2 h-6 w-6" />
              <p className="text-sm font-medium">Reportes en vivo</p>
            </div>
          </div>
        </div>
        <p className="text-sm text-indigo-300">© {new Date().getFullYear()} Cobranzas CRM</p>
      </div>

      {/* Formulario */}
      <div className="flex w-full items-center justify-center bg-background p-6 lg:w-1/2">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex items-center gap-2 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <PhoneCall className="h-4 w-4" />
            </div>
            <span className="text-lg font-bold">Cobranzas CRM</span>
          </div>
          <div>
            <h2 className="text-2xl font-bold">Iniciar sesión</h2>
            <p className="mt-1 text-sm text-muted-foreground">Ingresa tus credenciales para continuar</p>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField label="Correo electrónico" error={form.formState.errors.email?.message} htmlFor="email" required>
              <Input id="email" type="email" placeholder="usuario@empresa.com" autoComplete="email" {...form.register('email')} />
            </FormField>
            <FormField label="Contraseña" error={form.formState.errors.password?.message} htmlFor="password" required>
              <Input id="password" type="password" placeholder="••••••••" autoComplete="current-password" {...form.register('password')} />
            </FormField>
            <Button type="submit" className="w-full" loading={loading}>
              Ingresar
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
