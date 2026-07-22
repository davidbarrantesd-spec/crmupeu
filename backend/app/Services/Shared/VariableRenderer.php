<?php

namespace App\Services\Shared;

use App\Models\Agreement;
use App\Models\Campaign;
use App\Models\Contact;
use App\Models\Debt;

/**
 * Reemplaza variables {{nombre}}, {{saldo}}, {{fecha_vencimiento}}, etc.
 * en mensajes TTS, plantillas de WhatsApp y prompts de IA.
 */
class VariableRenderer
{
    public function variables(Contact $contact, ?Debt $debt = null, ?Campaign $campaign = null): array
    {
        $debt ??= $contact->debts()->whereNotIn('status', ['paid', 'cancelled'])->orderByDesc('pending_balance')->first();
        $agreement = Agreement::where('contact_id', $contact->id)->where('status', 'pending')->latest()->first();

        return [
            'nombre' => $contact->first_name,
            'apellido' => $contact->last_name,
            'nombre_completo' => $contact->full_name,
            'codigo' => $debt?->code ?? $contact->internal_code ?? '',
            'monto' => $debt ? number_format((float) $debt->original_amount, 2) : '',
            'saldo' => $debt ? number_format((float) $debt->pending_balance, 2) : '',
            'moneda' => $debt?->currency ?? 'PEN',
            'fecha_vencimiento' => $debt?->due_date?->format('d/m/Y') ?? '',
            'numero_cuotas' => (string) ($debt?->installments ?? ''),
            'cuotas_vencidas' => (string) ($debt?->overdue_installments ?? ''),
            'fecha_compromiso' => $agreement?->promise_date?->format('d/m/Y') ?? '',
            'nombre_campana' => $campaign?->name ?? '',
        ];
    }

    public function render(string $template, Contact $contact, ?Debt $debt = null, ?Campaign $campaign = null): string
    {
        $vars = $this->variables($contact, $debt, $campaign);

        return preg_replace_callback('/\{\{\s*(\w+)\s*\}\}/', function ($matches) use ($vars) {
            return $vars[$matches[1]] ?? $matches[0];
        }, $template);
    }
}
