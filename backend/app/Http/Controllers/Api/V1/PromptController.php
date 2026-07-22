<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\PromptVersionResource;
use App\Models\AiSession;
use App\Models\AuditLog;
use App\Models\CallPrompt;
use App\Models\Contact;
use App\Services\Ai\AgentToolExecutor;
use App\Services\Ai\AiConversationService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PromptController extends Controller
{
    public function index(Request $request)
    {
        $prompts = CallPrompt::with(['publishedVersion', 'creator'])
            ->withCount('versions')
            ->when($request->search, fn ($q, $s) => $q->where('name', 'ilike', "%{$s}%"))
            ->when($request->status, fn ($q, $v) => $q->where('status', $v))
            ->latest()
            ->paginate($request->integer('per_page', 15));

        return response()->json([
            'data' => $prompts->map(fn ($p) => $this->serialize($p)),
            'meta' => [
                'current_page' => $prompts->currentPage(),
                'last_page' => $prompts->lastPage(),
                'per_page' => $prompts->perPage(),
                'total' => $prompts->total(),
            ],
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'type' => ['sometimes', Rule::in(['collections', 'support', 'survey', 'custom'])],
            'description' => ['nullable', 'string', 'max:2000'],
        ] + $this->versionRules());

        $prompt = CallPrompt::create([
            'name' => $data['name'],
            'type' => $data['type'] ?? 'collections',
            'description' => $data['description'] ?? null,
            'status' => 'draft',
            'created_by' => $request->user()->id,
        ]);

        $prompt->versions()->create($this->versionData($data) + [
            'version' => 1,
            'status' => 'draft',
            'created_by' => $request->user()->id,
        ]);

        return response()->json(['data' => $this->serialize($prompt->load('versions'))], 201);
    }

    public function show(CallPrompt $prompt)
    {
        return response()->json(['data' => $this->serialize($prompt->load(['versions', 'creator'])) + [
            'versions' => PromptVersionResource::collection($prompt->versions->sortByDesc('version')->values()),
            'available_tools' => AgentToolExecutor::TOOLS,
        ]]);
    }

    public function update(Request $request, CallPrompt $prompt)
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:2000'],
            'status' => ['sometimes', Rule::in(['draft', 'published', 'inactive'])],
        ]);

        $prompt->update($data);

        return response()->json(['data' => $this->serialize($prompt)]);
    }

    public function destroy(CallPrompt $prompt)
    {
        abort_if(
            \App\Models\Campaign::whereIn('prompt_version_id', $prompt->versions()->pluck('id'))->whereIn('status', ['running', 'scheduled'])->exists(),
            422, 'Hay campañas activas usando este prompt.'
        );

        $prompt->delete();

        return response()->json(['data' => ['message' => 'Prompt eliminado.']]);
    }

    public function storeVersion(Request $request, CallPrompt $prompt)
    {
        $data = $request->validate($this->versionRules(required: true));

        $version = $prompt->versions()->create($this->versionData($data) + [
            'version' => ($prompt->versions()->max('version') ?? 0) + 1,
            'status' => 'draft',
            'created_by' => $request->user()->id,
        ]);

        $prompt->update(['current_version' => $version->version]);

        return (new PromptVersionResource($version))->response()->setStatusCode(201);
    }

    public function publishVersion(CallPrompt $prompt, int $version)
    {
        $target = $prompt->versions()->where('version', $version)->firstOrFail();

        $prompt->versions()->where('status', 'published')->update(['status' => 'archived']);
        $target->update(['status' => 'published', 'published_at' => now()]);
        $prompt->update(['status' => 'published', 'current_version' => $target->version]);

        AuditLog::record('published', 'prompts', $target, ['new_values' => ['version' => $version]]);

        return new PromptVersionResource($target);
    }

    public function restoreVersion(Request $request, CallPrompt $prompt, int $version)
    {
        $source = $prompt->versions()->where('version', $version)->firstOrFail();

        $new = $source->replicate(['uuid', 'status', 'published_at']);
        $new->version = ($prompt->versions()->max('version') ?? 0) + 1;
        $new->status = 'draft';
        $new->created_by = $request->user()->id;
        $new->save();

        return (new PromptVersionResource($new))->response()->setStatusCode(201);
    }

    public function duplicate(Request $request, CallPrompt $prompt)
    {
        $copy = CallPrompt::create([
            'name' => $prompt->name.' (copia)',
            'type' => $prompt->type,
            'description' => $prompt->description,
            'status' => 'draft',
            'created_by' => $request->user()->id,
        ]);

        $latest = $prompt->versions()->orderByDesc('version')->first();
        if ($latest) {
            $version = $latest->replicate(['uuid', 'status', 'published_at']);
            $version->call_prompt_id = $copy->id;
            $version->version = 1;
            $version->status = 'draft';
            $version->save();
        }

        return response()->json(['data' => $this->serialize($copy)], 201);
    }

    /**
     * Simulador: conversa con el agente antes de lanzar una campaña.
     */
    public function simulate(Request $request, CallPrompt $prompt, AiConversationService $aiService)
    {
        $data = $request->validate([
            'session_uuid' => ['nullable', 'uuid'],
            'message' => ['nullable', 'string', 'max:2000'],
            'contact_uuid' => ['nullable', 'uuid', 'exists:contacts,uuid'],
            'version' => ['nullable', 'integer'],
        ]);

        if (! empty($data['session_uuid'])) {
            $session = AiSession::where('uuid', $data['session_uuid'])->where('mode', 'simulation')->firstOrFail();
        } else {
            $version = isset($data['version'])
                ? $prompt->versions()->where('version', $data['version'])->firstOrFail()
                : ($prompt->publishedVersion ?? $prompt->versions()->orderByDesc('version')->firstOrFail());

            $contact = ! empty($data['contact_uuid'])
                ? Contact::where('uuid', $data['contact_uuid'])->first()
                : Contact::first();

            $session = $aiService->startSession($version, $contact, null, 'simulation');

            // Primer turno sin mensaje: el agente saluda.
            $result = $aiService->turn($session, null);

            return response()->json(['data' => [
                'session_uuid' => $session->uuid,
                'reply' => $result['reply'],
                'tool_calls' => $result['tool_calls'],
                'finished' => $result['finished'],
                'structured_result' => $result['structured_result'],
            ]]);
        }

        $result = $aiService->turn($session, $data['message'] ?? '');

        return response()->json(['data' => [
            'session_uuid' => $session->uuid,
            'reply' => $result['reply'],
            'tool_calls' => $result['tool_calls'],
            'finished' => $result['finished'],
            'structured_result' => $result['structured_result'],
        ]]);
    }

    protected function versionRules(bool $required = false): array
    {
        $flag = $required ? 'required' : 'sometimes';

        return [
            'system_prompt' => [$required ? 'required' : 'required', 'string', 'max:20000'],
            'instructions' => ['nullable', 'string', 'max:20000'],
            'greeting_message' => ['nullable', 'string', 'max:1000'],
            'farewell_message' => ['nullable', 'string', 'max:1000'],
            'variables' => ['nullable', 'array'],
            'enabled_tools' => ['nullable', 'array'],
            'enabled_tools.*' => [Rule::in(AgentToolExecutor::TOOLS)],
            'guardrails' => ['nullable', 'array'],
            'faq' => ['nullable', 'array'],
            'faq.*.q' => ['required_with:faq', 'string'],
            'faq.*.a' => ['required_with:faq', 'string'],
            'extraction_fields' => ['nullable', 'array'],
            'max_duration_seconds' => [$flag, 'integer', 'between:30,1800'],
        ];
    }

    protected function versionData(array $data): array
    {
        return collect($data)->only([
            'system_prompt', 'instructions', 'greeting_message', 'farewell_message',
            'variables', 'enabled_tools', 'guardrails', 'faq', 'extraction_fields', 'max_duration_seconds',
        ])->all();
    }

    protected function serialize(CallPrompt $prompt): array
    {
        return [
            'uuid' => $prompt->uuid,
            'name' => $prompt->name,
            'type' => $prompt->type,
            'description' => $prompt->description,
            'status' => $prompt->status,
            'current_version' => $prompt->current_version,
            'versions_count' => $prompt->versions_count ?? $prompt->versions->count(),
            'published_version' => $prompt->publishedVersion ? new PromptVersionResource($prompt->publishedVersion) : null,
            'creator' => $prompt->creator?->name,
            'created_at' => $prompt->created_at?->toIso8601String(),
        ];
    }
}
