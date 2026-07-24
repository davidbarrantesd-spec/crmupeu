<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\CallResource;
use App\Models\AuditLog;
use App\Models\Call;
use App\Models\Contact;
use App\Models\PromptVersion;
use App\Services\Calls\CallService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class CallController extends Controller
{
    public function __construct(protected CallService $service) {}

    public function index(Request $request)
    {
        $calls = Call::query()
            ->whereHas('contact', fn ($q) => $q->visibleTo($request->user()))
            ->with(['contact', 'campaign'])
            ->when($request->search, fn ($q, $s) => $q->where(fn ($q2) => $q2
                ->where('to_number', 'ilike', "%{$s}%")
                ->orWhereHas('contact', fn ($q3) => $q3->where('first_name', 'ilike', "%{$s}%")
                    ->orWhere('last_name', 'ilike', "%{$s}%"))))
            ->when($request->status, fn ($q, $v) => $q->where('status', $v))
            ->when($request->result, fn ($q, $v) => $q->where('result', $v))
            ->when($request->type, fn ($q, $v) => $q->where('type', $v))
            ->when($request->campaign, fn ($q, $v) => $q->whereHas('campaign', fn ($q2) => $q2->where('uuid', $v)))
            ->when($request->contact, fn ($q, $v) => $q->whereHas('contact', fn ($q2) => $q2->where('uuid', $v)))
            ->when($request->date_from, fn ($q, $v) => $q->where('created_at', '>=', $v))
            ->when($request->date_to, fn ($q, $v) => $q->where('created_at', '<=', $v.' 23:59:59'))
            ->latest()
            ->paginate($request->integer('per_page', 15));

        return CallResource::collection($calls);
    }

    public function show(Call $call)
    {
        return new CallResource($call->load(['contact.tags', 'campaign', 'events', 'recordings', 'transcription', 'promptVersion']));
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'contact_uuid' => ['required', 'uuid', 'exists:contacts,uuid'],
            'type' => ['required', Rule::in(['recorded_audio', 'tts', 'ivr', 'ai_conversational', 'manual'])],
            'campaign_uuid' => ['nullable', 'uuid', 'exists:campaigns,uuid'],
            'tts_message' => ['nullable', 'string', 'max:2000', 'required_if:type,tts'],
            'audio_url' => ['nullable', 'url', 'required_if:type,recorded_audio'],
            'prompt_version_uuid' => ['nullable', 'uuid', 'exists:prompt_versions,uuid', 'required_if:type,ai_conversational'],
            'scheduled_at' => ['nullable', 'date'],
        ]);

        $contact = Contact::where('uuid', $data['contact_uuid'])->firstOrFail();
        abort_unless(
            Contact::visibleTo($request->user())->whereKey($contact->id)->exists(),
            403, 'El contacto está fuera de tu alcance académico.'
        );

        $call = $this->service->createManualCall($contact, [
            'type' => $data['type'],
            'campaign_id' => isset($data['campaign_uuid']) ? \App\Models\Campaign::where('uuid', $data['campaign_uuid'])->value('id') : null,
            'tts_message' => $data['tts_message'] ?? null,
            'audio_url' => $data['audio_url'] ?? null,
            'prompt_version_id' => isset($data['prompt_version_uuid']) ? PromptVersion::where('uuid', $data['prompt_version_uuid'])->value('id') : null,
            'scheduled_at' => $data['scheduled_at'] ?? null,
        ]);

        return (new CallResource($call->load('contact')))->response()->setStatusCode(201);
    }

    public function cancel(Call $call)
    {
        return new CallResource($this->service->cancel($call));
    }

    public function recordingUrl(Call $call)
    {
        $recording = $call->recordings()->latest()->firstOrFail();

        AuditLog::record('listened', 'recordings', $recording, [
            'new_values' => ['call_uuid' => $call->uuid],
        ]);

        $url = $recording->disk_path
            ? Storage::disk('s3')->temporaryUrl($recording->disk_path, now()->addMinutes(30))
            : $recording->url;

        return response()->json(['data' => [
            'url' => $url,
            'mime_type' => $recording->mime_type,
            'duration_seconds' => $recording->duration_seconds,
        ]]);
    }
}
