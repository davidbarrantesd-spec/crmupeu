<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Jobs\ProcessImportJob;
use App\Models\Import;
use App\Services\Contacts\ImportService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ImportController extends Controller
{
    public function __construct(protected ImportService $service) {}

    public function index(Request $request)
    {
        $imports = Import::with('user')
            ->latest()
            ->paginate($request->integer('per_page', 15));

        return response()->json([
            'data' => $imports->map(fn ($i) => $this->serialize($i)),
            'meta' => [
                'current_page' => $imports->currentPage(),
                'last_page' => $imports->lastPage(),
                'per_page' => $imports->perPage(),
                'total' => $imports->total(),
            ],
        ]);
    }

    public function store(Request $request)
    {
        $request->validate([
            'file' => ['required', 'file', 'mimes:csv,txt,xlsx,xls', 'max:20480'],
            'type' => ['required', Rule::in(['contacts', 'debts'])],
        ]);

        $import = $this->service->create($request->file('file'), $request->input('type'), $request->user()->id);

        return response()->json(['data' => $this->serialize($import) + [
            'headers' => $import->getAttribute('headers'),
            'preview' => $import->getAttribute('preview'),
            'suggested_mapping' => $import->column_mapping,
            'available_fields' => $import->type === 'debts' ? ImportService::DEBT_FIELDS : ImportService::CONTACT_FIELDS,
        ]], 201);
    }

    public function mapping(Request $request, Import $import)
    {
        abort_if($import->status !== 'mapping', 422, 'La importación ya fue procesada.');

        $data = $request->validate(['column_mapping' => ['required', 'array']]);

        $fields = array_filter(array_values($data['column_mapping']));
        $required = $import->type === 'debts' ? ['code'] : ['phone'];

        foreach ($required as $field) {
            abort_if(! in_array($field, $fields), 422, "Debe mapear el campo obligatorio: {$field}.");
        }

        $import->update(['column_mapping' => $data['column_mapping'], 'status' => 'processing']);
        ProcessImportJob::dispatch($import->id);

        return response()->json(['data' => $this->serialize($import->fresh())]);
    }

    public function show(Import $import)
    {
        return response()->json(['data' => $this->serialize($import)]);
    }

    public function errors(Request $request, Import $import)
    {
        $rows = $import->rows()->where('status', 'failed')->orderBy('row_number');

        if ($request->boolean('download')) {
            return response()->streamDownload(function () use ($rows) {
                $out = fopen('php://output', 'w');
                fputcsv($out, ['fila', 'error', 'datos']);
                $rows->chunk(500, function ($chunk) use ($out) {
                    foreach ($chunk as $row) {
                        fputcsv($out, [$row->row_number, $row->error, json_encode($row->data, JSON_UNESCAPED_UNICODE)]);
                    }
                });
                fclose($out);
            }, "errores_importacion_{$import->uuid}.csv", ['Content-Type' => 'text/csv']);
        }

        return response()->json(['data' => $rows->limit(200)->get()->map(fn ($r) => [
            'row_number' => $r->row_number, 'error' => $r->error, 'data' => $r->data,
        ])]);
    }

    protected function serialize(Import $import): array
    {
        return [
            'uuid' => $import->uuid,
            'type' => $import->type,
            'filename' => $import->filename,
            'status' => $import->status,
            'total_rows' => $import->total_rows,
            'processed_rows' => $import->processed_rows,
            'created_count' => $import->created_count,
            'updated_count' => $import->updated_count,
            'failed_count' => $import->failed_count,
            'duplicate_count' => $import->duplicate_count,
            'user' => $import->user?->name,
            'created_at' => $import->created_at?->toIso8601String(),
        ];
    }
}
