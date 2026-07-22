<?php

namespace App\Services\Contacts;

use App\Models\Import;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use League\Csv\Reader;
use PhpOffice\PhpSpreadsheet\IOFactory;

class ImportService
{
    public const CONTACT_FIELDS = [
        'internal_code', 'first_name', 'last_name', 'dni', 'phone', 'phone_secondary',
        'email', 'city', 'address', 'segment', 'tags',
    ];

    public const DEBT_FIELDS = [
        'dni', 'phone', 'code', 'concept', 'original_amount', 'pending_balance',
        'currency', 'due_date', 'status', 'installments', 'overdue_installments', 'observations',
    ];

    /**
     * Guarda el archivo, lee cabeceras + vista previa y sugiere el mapeo.
     */
    public function create(UploadedFile $file, string $type, ?int $userId): Import
    {
        $path = $file->store('imports', 'local');
        [$headers, $preview, $totalRows] = $this->readPreview(Storage::disk('local')->path($path), $file->getClientOriginalExtension());

        return Import::create([
            'type' => $type,
            'filename' => $file->getClientOriginalName(),
            'disk_path' => $path,
            'status' => 'mapping',
            'total_rows' => $totalRows,
            'user_id' => $userId,
            'column_mapping' => $this->suggestMapping($headers, $type),
        ])->setAttribute('headers', $headers)->setAttribute('preview', $preview);
    }

    /**
     * @return array{0: array, 1: array, 2: int}
     */
    public function readPreview(string $absolutePath, string $extension): array
    {
        $rows = $this->readAll($absolutePath, $extension, limit: 6);
        $headers = array_map(fn ($h) => trim((string) $h), $rows[0] ?? []);
        $preview = array_slice($rows, 1, 5);
        $total = max(0, $this->countRows($absolutePath, $extension) - 1);

        return [$headers, $preview, $total];
    }

    public function readAll(string $absolutePath, string $extension, ?int $limit = null): array
    {
        if (in_array(strtolower($extension), ['xlsx', 'xls'])) {
            $spreadsheet = IOFactory::load($absolutePath);
            $rows = $spreadsheet->getActiveSheet()->toArray(null, true, false, false);

            return $limit ? array_slice($rows, 0, $limit) : $rows;
        }

        $csv = Reader::createFromPath($absolutePath);
        $rows = [];
        foreach ($csv->getRecords() as $i => $record) {
            $rows[] = array_values($record);
            if ($limit && count($rows) >= $limit) {
                break;
            }
        }

        return $rows;
    }

    protected function countRows(string $absolutePath, string $extension): int
    {
        if (in_array(strtolower($extension), ['xlsx', 'xls'])) {
            $spreadsheet = IOFactory::load($absolutePath);

            return $spreadsheet->getActiveSheet()->getHighestDataRow();
        }

        $csv = Reader::createFromPath($absolutePath);

        return iterator_count($csv->getRecords());
    }

    /**
     * Sugiere mapeo columna → campo por similitud de nombre.
     */
    public function suggestMapping(array $headers, string $type): array
    {
        $fields = $type === 'debts' ? self::DEBT_FIELDS : self::CONTACT_FIELDS;

        $aliases = [
            'first_name' => ['nombres', 'nombre', 'first name'],
            'last_name' => ['apellidos', 'apellido', 'last name'],
            'dni' => ['dni', 'documento', 'doc', 'cedula', 'cédula'],
            'phone' => ['telefono', 'teléfono', 'celular', 'movil', 'móvil', 'phone'],
            'phone_secondary' => ['telefono 2', 'teléfono secundario', 'celular 2'],
            'email' => ['correo', 'email', 'mail'],
            'city' => ['ciudad', 'city'],
            'address' => ['direccion', 'dirección', 'address'],
            'segment' => ['segmento'],
            'tags' => ['etiquetas', 'tags'],
            'internal_code' => ['codigo', 'código', 'code', 'codigo interno'],
            'code' => ['codigo deuda', 'código deuda', 'code', 'codigo', 'código'],
            'concept' => ['concepto', 'descripcion', 'descripción'],
            'original_amount' => ['monto', 'monto original', 'importe'],
            'pending_balance' => ['saldo', 'saldo pendiente', 'deuda'],
            'currency' => ['moneda'],
            'due_date' => ['vencimiento', 'fecha vencimiento', 'fecha de vencimiento'],
            'status' => ['estado'],
            'installments' => ['cuotas', 'numero de cuotas'],
            'overdue_installments' => ['cuotas vencidas'],
            'observations' => ['observaciones', 'notas'],
        ];

        $mapping = [];
        foreach ($headers as $header) {
            $normalized = mb_strtolower(trim($header));
            $match = null;

            foreach ($fields as $field) {
                if ($normalized === $field || in_array($normalized, $aliases[$field] ?? [])) {
                    $match = $field;
                    break;
                }
            }

            $mapping[$header] = $match;
        }

        return $mapping;
    }
}
