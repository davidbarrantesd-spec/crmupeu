<?php

namespace App\Jobs;

use App\Integrations\IntegrationManager;
use App\Models\Call;
use App\Models\Recording;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Storage;

/**
 * Descarga la grabación desde Twilio y la sube a S3/R2/MinIO.
 * En PostgreSQL solo se guarda la metadata.
 */
class ProcessRecordingJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public array $backoff = [30, 300];

    public function __construct(
        public int $callId,
        public string $recordingSid,
        public string $recordingUrl,
        public ?int $duration = null,
    ) {}

    public function handle(IntegrationManager $integrations): void
    {
        $call = Call::find($this->callId);

        if (! $call || Recording::where('recording_sid', $this->recordingSid)->exists()) {
            return; // Idempotencia por SID.
        }

        $content = $integrations->telephony()->fetchRecording($this->recordingUrl);
        $extension = $integrations->telephony()->name() === 'sandbox' ? 'wav' : 'mp3';
        $path = "recordings/{$call->uuid}/{$this->recordingSid}.{$extension}";

        Storage::disk('s3')->put($path, $content);

        Recording::create([
            'call_id' => $call->id,
            'recording_sid' => $this->recordingSid,
            'url' => Storage::disk('s3')->url($path),
            'disk_path' => $path,
            'duration_seconds' => $this->duration,
            'size_bytes' => strlen($content),
            'mime_type' => $extension === 'wav' ? 'audio/wav' : 'audio/mpeg',
            'hash' => hash('sha256', $content),
            'metadata' => ['source_url' => $this->recordingUrl],
        ]);

        TranscribeCallJob::dispatch($call->id);
    }
}
