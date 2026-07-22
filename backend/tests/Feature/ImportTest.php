<?php

namespace Tests\Feature;

use App\Jobs\ProcessImportJob;
use App\Models\Import;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ImportTest extends TestCase
{
    protected function csvFile(): UploadedFile
    {
        $csv = "nombres,apellidos,dni,telefono,ciudad\n"
            ."Luis,Ramírez,45678912,987111222,Lima\n"
            ."Ana,Torres,78912345,987333444,Arequipa\n"
            ."Malo,SinTelefono,11122233,12,Cusco\n";

        return UploadedFile::fake()->createWithContent('contactos.csv', $csv);
    }

    public function test_upload_returns_headers_preview_and_suggested_mapping(): void
    {
        Storage::fake('local');

        $response = $this->actingAs($this->adminUser())
            ->post('/api/v1/imports', ['file' => $this->csvFile(), 'type' => 'contacts'], ['Accept' => 'application/json']);

        $response->assertStatus(201);
        $this->assertSame(['nombres', 'apellidos', 'dni', 'telefono', 'ciudad'], $response->json('data.headers'));
        $this->assertSame('first_name', $response->json('data.suggested_mapping.nombres'));
        $this->assertSame('phone', $response->json('data.suggested_mapping.telefono'));
        $this->assertSame(3, $response->json('data.total_rows'));
    }

    public function test_mapping_dispatches_processing_job(): void
    {
        Storage::fake('local');
        Queue::fake();
        $admin = $this->adminUser();

        $upload = $this->actingAs($admin)
            ->post('/api/v1/imports', ['file' => $this->csvFile(), 'type' => 'contacts'], ['Accept' => 'application/json']);

        $uuid = $upload->json('data.uuid');

        $this->actingAs($admin)->postJson("/api/v1/imports/{$uuid}/mapping", [
            'column_mapping' => [
                'nombres' => 'first_name', 'apellidos' => 'last_name',
                'dni' => 'dni', 'telefono' => 'phone', 'ciudad' => 'city',
            ],
        ])->assertOk();

        Queue::assertPushed(ProcessImportJob::class);
    }

    public function test_processing_creates_contacts_and_reports_failures(): void
    {
        Storage::fake('local');
        $admin = $this->adminUser();

        $upload = $this->actingAs($admin)
            ->post('/api/v1/imports', ['file' => $this->csvFile(), 'type' => 'contacts'], ['Accept' => 'application/json']);

        $import = Import::where('uuid', $upload->json('data.uuid'))->first();
        $import->update([
            'status' => 'processing',
            'column_mapping' => [
                'nombres' => 'first_name', 'apellidos' => 'last_name',
                'dni' => 'dni', 'telefono' => 'phone', 'ciudad' => 'city',
            ],
        ]);

        (new ProcessImportJob($import->id))->handle(
            app(\App\Services\Contacts\ImportService::class),
            app(\App\Services\Contacts\ContactService::class),
        );

        $import->refresh();
        $this->assertSame('completed', $import->status);
        $this->assertSame(2, $import->created_count);
        $this->assertSame(1, $import->failed_count);
        $this->assertDatabaseHas('contacts', ['dni' => '45678912', 'phone' => '+51987111222']);
    }
}
