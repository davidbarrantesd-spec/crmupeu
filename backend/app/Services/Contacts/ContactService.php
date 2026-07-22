<?php

namespace App\Services\Contacts;

use App\Models\AuditLog;
use App\Models\Contact;
use App\Models\Tag;
use Illuminate\Support\Facades\DB;

class ContactService
{
    /**
     * Normaliza un teléfono peruano a formato E.164 (+51...). Devuelve null si es inválido.
     */
    public static function normalizePhone(?string $phone): ?string
    {
        if (! $phone) {
            return null;
        }

        $digits = preg_replace('/[^0-9+]/', '', $phone);
        $digits = ltrim($digits, '+');

        if (str_starts_with($digits, '51') && strlen($digits) === 11) {
            return '+'.$digits;
        }

        if (strlen($digits) === 9 && str_starts_with($digits, '9')) {
            return '+51'.$digits;
        }

        // Números fijos (7 dígitos + código de ciudad) u otros países: aceptar entre 7 y 15 dígitos.
        if (strlen($digits) >= 7 && strlen($digits) <= 15) {
            return '+'.$digits;
        }

        return null;
    }

    public function syncTags(Contact $contact, array $tagNames): void
    {
        $ids = collect($tagNames)
            ->filter()
            ->map(fn ($name) => Tag::firstOrCreate(['name' => trim($name)])->id);

        $contact->tags()->sync($ids);
    }

    /**
     * Grupos de duplicados potenciales por teléfono o DNI.
     */
    public function findDuplicates(): array
    {
        $byPhone = Contact::select('phone', DB::raw('count(*) as total'))
            ->groupBy('phone')->having('total', '>', 1)->pluck('phone');

        $byDni = Contact::whereNotNull('dni')->select('dni', DB::raw('count(*) as total'))
            ->groupBy('dni')->having('total', '>', 1)->pluck('dni');

        $groups = [];
        foreach ($byPhone as $phone) {
            $groups[] = ['field' => 'phone', 'value' => $phone,
                'contacts' => Contact::where('phone', $phone)->with('debts')->get()];
        }
        foreach ($byDni as $dni) {
            $groups[] = ['field' => 'dni', 'value' => $dni,
                'contacts' => Contact::where('dni', $dni)->with('debts')->get()];
        }

        return $groups;
    }

    /**
     * Unifica un duplicado dentro del contacto principal: mueve deudas,
     * llamadas, acuerdos, conversaciones y notas, luego elimina el duplicado.
     */
    public function merge(Contact $primary, Contact $duplicate): Contact
    {
        DB::transaction(function () use ($primary, $duplicate) {
            foreach (['debts', 'calls', 'agreements', 'followUps', 'conversations'] as $relation) {
                $duplicate->{$relation}()->update(['contact_id' => $primary->id]);
            }

            $duplicate->notes()->update(['notable_id' => $primary->id]);

            DB::table('campaign_contacts')->where('contact_id', $duplicate->id)
                ->whereNotIn('campaign_id', $primary->campaigns()->pluck('campaigns.id'))
                ->update(['contact_id' => $primary->id]);
            DB::table('campaign_contacts')->where('contact_id', $duplicate->id)->delete();

            $tagIds = $duplicate->tags()->pluck('tags.id')->merge($primary->tags()->pluck('tags.id'))->unique();
            $primary->tags()->sync($tagIds);

            // Completa datos faltantes del principal con los del duplicado.
            foreach (['dni', 'email', 'phone_secondary', 'city', 'address', 'internal_code'] as $field) {
                if (! $primary->{$field} && $duplicate->{$field}) {
                    $primary->{$field} = $duplicate->{$field};
                }
            }
            $primary->save();

            AuditLog::record('merged', 'contacts', $primary, [
                'new_values' => ['merged_from' => $duplicate->uuid],
            ]);

            $duplicate->delete();
        });

        return $primary->refresh();
    }

    /**
     * Línea de tiempo unificada de todos los canales.
     */
    public function timeline(Contact $contact): array
    {
        $items = collect();

        foreach ($contact->calls()->with('campaign')->latest()->limit(100)->get() as $call) {
            $items->push([
                'type' => 'call',
                'at' => $call->created_at,
                'title' => 'Llamada '.($call->campaign?->name ? "({$call->campaign->name})" : 'manual'),
                'description' => trim(($call->status ?? '').($call->result ? " · {$call->result}" : '').($call->summary ? " · {$call->summary}" : '')),
                'meta' => ['uuid' => $call->uuid, 'status' => $call->status, 'result' => $call->result, 'duration' => $call->duration_seconds],
            ]);
        }

        foreach ($contact->agreements()->latest()->limit(50)->get() as $agreement) {
            $items->push([
                'type' => 'agreement',
                'at' => $agreement->created_at,
                'title' => 'Acuerdo registrado',
                'description' => ($agreement->amount ? 'S/ '.number_format((float) $agreement->amount, 2).' · ' : '')
                    .'compromiso '.$agreement->promise_date?->format('d/m/Y').' · '.$agreement->status,
                'meta' => ['uuid' => $agreement->uuid, 'status' => $agreement->status],
            ]);
        }

        foreach ($contact->conversations()->with(['messages' => fn ($q) => $q->latest()->limit(30)])->get() as $conversation) {
            foreach ($conversation->messages as $message) {
                $items->push([
                    'type' => 'message',
                    'at' => $message->created_at,
                    'title' => $message->direction === 'inbound' ? 'WhatsApp recibido' : 'WhatsApp enviado',
                    'description' => str($message->body ?? '['.$message->type.']')->limit(120)->toString(),
                    'meta' => ['status' => $message->status, 'direction' => $message->direction],
                ]);
            }
        }

        foreach ($contact->followUps()->latest()->limit(50)->get() as $followUp) {
            $items->push([
                'type' => 'follow_up',
                'at' => $followUp->created_at,
                'title' => 'Seguimiento programado',
                'description' => $followUp->type.' para '.$followUp->scheduled_at->format('d/m/Y H:i').' · '.$followUp->status,
                'meta' => ['uuid' => $followUp->uuid, 'status' => $followUp->status],
            ]);
        }

        foreach ($contact->notes()->with('user')->latest()->limit(50)->get() as $note) {
            $items->push([
                'type' => 'note',
                'at' => $note->created_at,
                'title' => 'Nota de '.($note->user?->name ?? 'sistema'),
                'description' => str($note->body)->limit(160)->toString(),
                'meta' => [],
            ]);
        }

        return $items->sortByDesc('at')->values()->map(function ($item) {
            $item['at'] = $item['at']->toIso8601String();

            return $item;
        })->all();
    }
}
