<?php

namespace App\Jobs;

use App\Models\Contact;
use App\Models\Debt;
use App\Models\Import;
use App\Models\ImportRow;
use App\Services\Contacts\ContactService;
use App\Services\Contacts\ImportService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Storage;

/**
 * Procesa una importación de contactos o deudas en segundo plano.
 */
class ProcessImportJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 600;

    public function __construct(public int $importId) {}

    public function handle(ImportService $importService, ContactService $contactService): void
    {
        $import = Import::find($this->importId);

        if (! $import || $import->status !== 'processing') {
            return;
        }

        $extension = pathinfo($import->filename, PATHINFO_EXTENSION);
        $rows = $importService->readAll(Storage::disk('local')->path($import->disk_path), $extension);
        $headers = array_map(fn ($h) => trim((string) $h), array_shift($rows) ?? []);
        $mapping = $import->column_mapping ?? [];

        $counters = ['created' => 0, 'updated' => 0, 'failed' => 0, 'duplicate' => 0];

        foreach ($rows as $index => $row) {
            $data = [];
            foreach ($headers as $i => $header) {
                $field = $mapping[$header] ?? null;
                if ($field) {
                    $data[$field] = isset($row[$i]) ? trim((string) $row[$i]) : null;
                }
            }

            $importRow = ImportRow::create([
                'import_id' => $import->id,
                'row_number' => $index + 2,
                'data' => $data,
                'status' => 'pending',
            ]);

            try {
                $status = $import->type === 'debts'
                    ? $this->importDebt($data)
                    : $this->importContact($data, $contactService);
                $importRow->update(['status' => $status]);
                $counters[$status === 'created' ? 'created' : ($status === 'updated' ? 'updated' : 'duplicate')]++;
            } catch (\Throwable $e) {
                $importRow->update(['status' => 'failed', 'error' => $e->getMessage()]);
                $counters['failed']++;
            }

            if (($index + 1) % 50 === 0) {
                $import->update(['processed_rows' => $index + 1]);
            }
        }

        $import->update([
            'status' => 'completed',
            'processed_rows' => count($rows),
            'created_count' => $counters['created'],
            'updated_count' => $counters['updated'],
            'failed_count' => $counters['failed'],
            'duplicate_count' => $counters['duplicate'],
        ]);
    }

    protected function importContact(array $data, ContactService $contactService): string
    {
        if (empty($data['first_name']) && empty($data['dni']) && empty($data['phone'])) {
            throw new \RuntimeException('Fila sin nombre, DNI ni teléfono.');
        }

        $phone = ContactService::normalizePhone($data['phone'] ?? null);
        if (! $phone) {
            throw new \RuntimeException('Teléfono inválido: '.($data['phone'] ?? 'vacío'));
        }

        $attributes = array_filter([
            'internal_code' => $data['internal_code'] ?? null,
            'first_name' => $data['first_name'] ?? null,
            'last_name' => $data['last_name'] ?? null,
            'dni' => $data['dni'] ?? null,
            'phone' => $phone,
            'phone_secondary' => ContactService::normalizePhone($data['phone_secondary'] ?? null),
            'email' => $data['email'] ?? null,
            'city' => $data['city'] ?? null,
            'address' => $data['address'] ?? null,
            'segment' => $data['segment'] ?? null,
        ], fn ($v) => $v !== null && $v !== '');

        $existing = null;
        if (! empty($data['dni'])) {
            $existing = Contact::where('dni', $data['dni'])->first();
        }
        $existing ??= Contact::where('phone', $phone)->first();

        if ($existing) {
            $existing->update($attributes + ['source' => $existing->source ?? 'import']);
            $status = 'updated';
            $contact = $existing;
        } else {
            $contact = Contact::create($attributes + ['source' => 'import', 'status' => 'active']);
            $status = 'created';
        }

        if (! empty($data['tags'])) {
            $contactService->syncTags($contact, array_map('trim', explode(',', $data['tags'])));
        }

        return $status;
    }

    protected function importDebt(array $data): string
    {
        $contact = null;
        if (! empty($data['dni'])) {
            $contact = Contact::where('dni', $data['dni'])->first();
        }
        if (! $contact && ! empty($data['phone'])) {
            $phone = ContactService::normalizePhone($data['phone']);
            $contact = $phone ? Contact::where('phone', $phone)->first() : null;
        }

        if (! $contact) {
            throw new \RuntimeException('Contacto no encontrado por DNI ni teléfono.');
        }

        if (empty($data['code'])) {
            throw new \RuntimeException('Falta el código de deuda.');
        }

        $attributes = [
            'concept' => $data['concept'] ?? 'Deuda importada',
            'original_amount' => (float) str_replace(',', '', $data['original_amount'] ?? $data['pending_balance'] ?? 0),
            'pending_balance' => (float) str_replace(',', '', $data['pending_balance'] ?? $data['original_amount'] ?? 0),
            'currency' => $data['currency'] ?: 'PEN',
            'due_date' => ! empty($data['due_date']) ? \Carbon\Carbon::parse($data['due_date'])->toDateString() : null,
            'status' => in_array($data['status'] ?? '', Debt::STATUSES) ? $data['status'] : 'pending',
            'installments' => (int) ($data['installments'] ?? 1) ?: 1,
            'overdue_installments' => (int) ($data['overdue_installments'] ?? 0),
            'observations' => $data['observations'] ?? null,
            'origin' => 'import',
        ];

        $debt = Debt::withTrashed()->where('contact_id', $contact->id)->where('code', $data['code'])->first();

        if ($debt) {
            $debt->restore();
            $debt->update($attributes);

            return 'updated';
        }

        Debt::create($attributes + ['contact_id' => $contact->id, 'code' => $data['code']]);

        return 'created';
    }
}
