<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\CampaignResource;
use App\Http\Resources\ContactResource;
use App\Models\Campaign;
use App\Models\Contact;
use App\Models\PromptVersion;
use App\Models\WhatsappTemplate;
use App\Services\Calls\CallService;
use App\Services\Campaigns\CampaignService;
use App\Services\Campaigns\SegmentationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class CampaignController extends Controller
{
    public function __construct(
        protected CampaignService $service,
        protected SegmentationService $segmentation,
    ) {}

    public function index(Request $request)
    {
        $campaigns = Campaign::query()
            ->with(['creator', 'supervisor'])
            ->withCount('campaignContacts')
            ->when($request->search, fn ($q, $s) => $q->where('name', 'ilike', "%{$s}%"))
            ->when($request->status, fn ($q, $v) => $q->where('status', $v))
            ->when($request->type, fn ($q, $v) => $q->where('type', $v))
            ->latest()
            ->paginate($request->integer('per_page', 15));

        return CampaignResource::collection($campaigns);
    }

    public function store(Request $request)
    {
        $data = $this->validateCampaign($request);
        $data = $this->resolveRelations($data);

        $campaign = Campaign::create($data + ['status' => 'draft', 'created_by' => $request->user()->id]);

        return (new CampaignResource($campaign))->response()->setStatusCode(201);
    }

    public function show(Campaign $campaign)
    {
        return new CampaignResource($campaign->load(['creator', 'supervisor', 'promptVersion'])->loadCount('campaignContacts'));
    }

    public function update(Request $request, Campaign $campaign)
    {
        abort_if(in_array($campaign->status, ['finished', 'cancelled']), 422, 'La campaña ya terminó.');

        $data = $this->validateCampaign($request, updating: true);
        $data = $this->resolveRelations($data);

        $campaign->update($data);

        return new CampaignResource($campaign->fresh(['creator', 'supervisor', 'promptVersion']));
    }

    public function destroy(Campaign $campaign)
    {
        abort_if($campaign->status === 'running', 422, 'Pausa o cancela la campaña antes de eliminarla.');
        $campaign->delete();

        return response()->json(['data' => ['message' => 'Campaña eliminada.']]);
    }

    public function previewSegment(Request $request)
    {
        $data = $request->validate([
            'segment_filters' => ['required', 'array'],
            'channel' => ['sometimes', Rule::in(['voice', 'whatsapp'])],
        ]);

        $preview = $this->segmentation->preview($data['segment_filters'], $data['channel'] ?? 'voice');

        return response()->json(['data' => [
            'count' => $preview['count'],
            'sample' => ContactResource::collection($preview['sample']),
        ]]);
    }

    public function launch(Campaign $campaign)
    {
        return new CampaignResource($this->service->launch($campaign));
    }

    public function schedule(Request $request, Campaign $campaign)
    {
        $data = $request->validate(['starts_at' => ['required', 'date', 'after:now']]);

        return new CampaignResource($this->service->schedule($campaign, $data['starts_at']));
    }

    public function pause(Campaign $campaign)
    {
        return new CampaignResource($this->service->pause($campaign));
    }

    public function resume(Campaign $campaign)
    {
        return new CampaignResource($this->service->resume($campaign));
    }

    public function cancel(Campaign $campaign)
    {
        return new CampaignResource($this->service->cancel($campaign));
    }

    public function duplicate(Campaign $campaign)
    {
        return (new CampaignResource($this->service->duplicate($campaign)))->response()->setStatusCode(201);
    }

    public function test(Request $request, Campaign $campaign, CallService $callService)
    {
        $data = $request->validate(['contact_uuid' => ['required', 'uuid', 'exists:contacts,uuid']]);

        $contact = Contact::where('uuid', $data['contact_uuid'])->firstOrFail();

        $call = $callService->createManualCall($contact, [
            'type' => $campaign->type === 'mixed' ? 'recorded_audio' : ($campaign->type === 'whatsapp' ? 'tts' : $campaign->type),
            'campaign_id' => $campaign->id,
            'tts_message' => $campaign->tts_message,
            'audio_url' => $campaign->audio_url,
            'prompt_version_id' => $campaign->prompt_version_id,
        ]);

        return response()->json(['data' => ['call_uuid' => $call->uuid, 'message' => 'Llamada de prueba encolada.']], 201);
    }

    public function progress(Campaign $campaign)
    {
        return response()->json(['data' => $this->service->progress($campaign)]);
    }

    public function contacts(Request $request, Campaign $campaign)
    {
        $rows = $campaign->campaignContacts()
            ->with(['contact.tags', 'debt'])
            ->when($request->status, fn ($q, $v) => $q->where('status', $v))
            ->orderBy('id')
            ->paginate($request->integer('per_page', 15));

        return response()->json([
            'data' => $rows->map(fn ($row) => [
                'contact' => new ContactResource($row->contact),
                'debt_code' => $row->debt?->code,
                'status' => $row->status,
                'last_result' => $row->last_result,
                'attempts' => $row->attempts,
                'next_attempt_at' => $row->next_attempt_at?->toIso8601String(),
                'last_attempt_at' => $row->last_attempt_at?->toIso8601String(),
            ]),
            'meta' => [
                'current_page' => $rows->currentPage(),
                'last_page' => $rows->lastPage(),
                'per_page' => $rows->perPage(),
                'total' => $rows->total(),
            ],
        ]);
    }

    public function addContacts(Request $request, Campaign $campaign)
    {
        $data = $request->validate(['contact_uuids' => ['required', 'array', 'min:1'], 'contact_uuids.*' => ['uuid']]);

        $added = $this->service->addContacts($campaign, $data['contact_uuids']);

        return response()->json(['data' => ['added' => $added]]);
    }

    public function removeContact(Campaign $campaign, Contact $contact)
    {
        $campaign->campaignContacts()->where('contact_id', $contact->id)->delete();

        return response()->json(['data' => ['message' => 'Contacto retirado de la campaña.']]);
    }

    public function uploadAudio(Request $request, Campaign $campaign)
    {
        $request->validate(['file' => ['required', 'file', 'mimes:mp3,wav', 'max:20480']]);

        $path = $request->file('file')->store("campaign-audio/{$campaign->uuid}", 's3');

        $campaign->update([
            'audio_path' => $path,
            'audio_url' => Storage::disk('s3')->url($path),
        ]);

        return response()->json(['data' => ['audio_url' => $campaign->audio_url]]);
    }

    protected function validateCampaign(Request $request, bool $updating = false): array
    {
        $required = $updating ? 'sometimes' : 'required';

        return $request->validate([
            'name' => [$required, 'string', 'max:160'],
            'description' => ['nullable', 'string', 'max:5000'],
            'type' => [$required, Rule::in(Campaign::TYPES)],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date', 'after:starts_at'],
            'timezone' => ['sometimes', 'timezone'],
            'allowed_from' => ['sometimes', 'date_format:H:i'],
            'allowed_until' => ['sometimes', 'date_format:H:i', 'after:allowed_from'],
            'allowed_days' => ['sometimes', 'array'],
            'allowed_days.*' => ['integer', 'between:1,7'],
            'max_attempts' => ['sometimes', 'integer', 'between:1,10'],
            'retry_minutes' => ['sometimes', 'integer', 'between:5,10080'],
            'max_concurrent_calls' => ['sometimes', 'integer', 'between:1,50'],
            'priority' => ['sometimes', 'integer', 'between:1,10'],
            'segment' => ['nullable', 'string', 'max:60'],
            'segment_filters' => ['sometimes', 'array'],
            'prompt_version_uuid' => ['nullable', 'uuid', 'exists:prompt_versions,uuid'],
            'voice' => ['nullable', 'string', 'max:60'],
            'language' => ['sometimes', 'string', 'max:10'],
            'from_number' => ['nullable', 'string', 'max:30'],
            'tts_message' => ['nullable', 'string', 'max:2000'],
            'greeting_message' => ['nullable', 'string', 'max:1000'],
            'farewell_message' => ['nullable', 'string', 'max:1000'],
            'dtmf_options' => ['sometimes', 'nullable', 'array'],
            'whatsapp_config' => ['sometimes', 'nullable', 'array'],
            'whatsapp_template_uuid' => ['nullable', 'uuid', 'exists:whatsapp_templates,uuid'],
            'post_call_actions' => ['sometimes', 'nullable', 'array'],
            'follow_up_rules' => ['sometimes', 'nullable', 'array'],
            'budget_limit' => ['nullable', 'numeric', 'min:0'],
            'record_calls' => ['sometimes', 'boolean'],
            'supervisor_uuid' => ['nullable', 'uuid', 'exists:users,uuid'],
        ]);
    }

    protected function resolveRelations(array $data): array
    {
        if (array_key_exists('prompt_version_uuid', $data)) {
            $data['prompt_version_id'] = $data['prompt_version_uuid']
                ? PromptVersion::where('uuid', $data['prompt_version_uuid'])->value('id')
                : null;
            unset($data['prompt_version_uuid']);
        }

        if (array_key_exists('whatsapp_template_uuid', $data)) {
            $data['whatsapp_template_id'] = $data['whatsapp_template_uuid']
                ? WhatsappTemplate::where('uuid', $data['whatsapp_template_uuid'])->value('id')
                : null;
            unset($data['whatsapp_template_uuid']);
        }

        if (array_key_exists('supervisor_uuid', $data)) {
            $data['supervisor_id'] = $data['supervisor_uuid']
                ? \App\Models\User::where('uuid', $data['supervisor_uuid'])->value('id')
                : null;
            unset($data['supervisor_uuid']);
        }

        return $data;
    }
}
