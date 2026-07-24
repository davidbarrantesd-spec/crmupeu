<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\FollowUpResource;
use App\Models\Campaign;
use App\Models\Contact;
use App\Models\FollowUp;
use App\Models\FollowUpRule;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class FollowUpController extends Controller
{
    public function index(Request $request)
    {
        $followUps = FollowUp::query()
            ->whereHas('contact', fn ($q) => $q->visibleTo($request->user()))
            ->with(['contact', 'campaign', 'agreement', 'rule', 'assignee'])
            ->when($request->status, fn ($q, $v) => $q->where('status', $v))
            ->when($request->type, fn ($q, $v) => $q->where('type', $v))
            ->when($request->assigned_to, fn ($q, $v) => $q->whereHas('assignee', fn ($q2) => $q2->where('uuid', $v)))
            ->when($request->priority, fn ($q, $v) => $q->where('priority', '<=', $v))
            ->when($request->date_from, fn ($q, $v) => $q->where('scheduled_at', '>=', $v))
            ->when($request->date_to, fn ($q, $v) => $q->where('scheduled_at', '<=', $v.' 23:59:59'))
            ->orderBy('scheduled_at')
            ->paginate($request->integer('per_page', 15));

        return FollowUpResource::collection($followUps);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'contact_uuid' => ['required', 'uuid', 'exists:contacts,uuid'],
            'campaign_uuid' => ['nullable', 'uuid', 'exists:campaigns,uuid'],
            'type' => ['required', Rule::in(FollowUp::TYPES)],
            'scheduled_at' => ['required', 'date'],
            'priority' => ['sometimes', 'integer', 'between:1,10'],
            'assigned_to_uuid' => ['nullable', 'uuid', 'exists:users,uuid'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);

        $followUp = FollowUp::create([
            'contact_id' => Contact::where('uuid', $data['contact_uuid'])->value('id'),
            'campaign_id' => isset($data['campaign_uuid']) ? Campaign::where('uuid', $data['campaign_uuid'])->value('id') : null,
            'type' => $data['type'],
            'scheduled_at' => $data['scheduled_at'],
            'channel' => $data['type'] === 'whatsapp' ? 'whatsapp' : (in_array($data['type'], ['advisor_task', 'payment_verification']) ? 'internal' : 'voice'),
            'priority' => $data['priority'] ?? 5,
            'status' => 'pending',
            'assigned_to' => isset($data['assigned_to_uuid']) ? User::where('uuid', $data['assigned_to_uuid'])->value('id') : null,
            'notes' => $data['notes'] ?? null,
        ]);

        return (new FollowUpResource($followUp->load(['contact', 'assignee'])))->response()->setStatusCode(201);
    }

    public function update(Request $request, FollowUp $followUp)
    {
        $data = $request->validate([
            'status' => ['sometimes', Rule::in(['pending', 'in_progress', 'done', 'cancelled'])],
            'scheduled_at' => ['sometimes', 'date'],
            'priority' => ['sometimes', 'integer', 'between:1,10'],
            'assigned_to_uuid' => ['sometimes', 'nullable', 'uuid', 'exists:users,uuid'],
            'result' => ['sometimes', 'nullable', 'string', 'max:60'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:5000'],
        ]);

        if (array_key_exists('assigned_to_uuid', $data)) {
            $data['assigned_to'] = $data['assigned_to_uuid'] ? User::where('uuid', $data['assigned_to_uuid'])->value('id') : null;
            unset($data['assigned_to_uuid']);
        }

        $followUp->update($data);

        return new FollowUpResource($followUp->fresh(['contact', 'assignee', 'rule']));
    }

    // ---- Reglas ----

    public function rules()
    {
        $rules = FollowUpRule::with('campaign')->orderBy('trigger_event')->get()->map(fn ($r) => $this->serializeRule($r));

        return response()->json(['data' => $rules]);
    }

    public function storeRule(Request $request)
    {
        $data = $this->validateRule($request);

        $rule = FollowUpRule::create($data);

        return response()->json(['data' => $this->serializeRule($rule)], 201);
    }

    public function updateRule(Request $request, FollowUpRule $rule)
    {
        $data = $this->validateRule($request, updating: true);

        $rule->update($data);

        return response()->json(['data' => $this->serializeRule($rule->fresh('campaign'))]);
    }

    public function destroyRule(FollowUpRule $rule)
    {
        $rule->delete();

        return response()->json(['data' => ['message' => 'Regla eliminada.']]);
    }

    protected function validateRule(Request $request, bool $updating = false): array
    {
        $required = $updating ? 'sometimes' : 'required';

        $data = $request->validate([
            'name' => [$required, 'string', 'max:160'],
            'trigger_event' => [$required, Rule::in([
                'call_no_answer', 'call_busy', 'call_failed', 'payment_promise',
                'agreement_broken', 'dtmf_whatsapp', 'dtmf_advisor', 'max_attempts',
            ])],
            'action' => [$required, Rule::in([
                'retry_call', 'schedule_ai_call', 'send_whatsapp', 'create_advisor_task',
                'verify_payment', 'close', 'escalate',
            ])],
            'delay_minutes' => [$required, 'integer', 'between:0,43200'],
            'config' => ['sometimes', 'nullable', 'array'],
            'campaign_uuid' => ['sometimes', 'nullable', 'uuid', 'exists:campaigns,uuid'],
            'active' => ['sometimes', 'boolean'],
        ]);

        if (array_key_exists('campaign_uuid', $data)) {
            $data['campaign_id'] = $data['campaign_uuid'] ? Campaign::where('uuid', $data['campaign_uuid'])->value('id') : null;
            unset($data['campaign_uuid']);
        }

        return $data;
    }

    protected function serializeRule(FollowUpRule $rule): array
    {
        return [
            'uuid' => $rule->uuid,
            'name' => $rule->name,
            'trigger_event' => $rule->trigger_event,
            'action' => $rule->action,
            'delay_minutes' => $rule->delay_minutes,
            'config' => $rule->config,
            'campaign' => $rule->campaign ? ['uuid' => $rule->campaign->uuid, 'name' => $rule->campaign->name] : null,
            'active' => $rule->active,
        ];
    }
}
