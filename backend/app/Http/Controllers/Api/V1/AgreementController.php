<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\AgreementResource;
use App\Models\Agreement;
use App\Models\Call;
use App\Models\Contact;
use App\Models\Debt;
use App\Models\FollowUp;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AgreementController extends Controller
{
    public function index(Request $request)
    {
        $agreements = Agreement::query()
            ->whereHas('contact', fn ($q) => $q->visibleTo($request->user()))
            ->with(['contact', 'debt', 'call', 'creator'])
            ->when($request->status, fn ($q, $v) => $q->where('status', $v))
            ->when($request->contact, fn ($q, $v) => $q->whereHas('contact', fn ($q2) => $q2->where('uuid', $v)))
            ->when($request->date_from, fn ($q, $v) => $q->where('created_at', '>=', $v))
            ->when($request->date_to, fn ($q, $v) => $q->where('created_at', '<=', $v.' 23:59:59'))
            ->when($request->promise_date_from, fn ($q, $v) => $q->where('promise_date', '>=', $v))
            ->when($request->promise_date_to, fn ($q, $v) => $q->where('promise_date', '<=', $v))
            ->latest()
            ->paginate($request->integer('per_page', 15));

        return AgreementResource::collection($agreements);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'contact_uuid' => ['required', 'uuid', 'exists:contacts,uuid'],
            'debt_uuid' => ['nullable', 'uuid', 'exists:debts,uuid'],
            'call_uuid' => ['nullable', 'uuid', 'exists:calls,uuid'],
            'type' => ['required', Rule::in(['payment_promise', 'partial_payment', 'refinance', 'dispute', 'other'])],
            'description' => ['nullable', 'string', 'max:5000'],
            'amount' => ['nullable', 'numeric', 'min:0'],
            'promise_date' => ['required', 'date'],
            'observations' => ['nullable', 'string', 'max:5000'],
        ]);

        $contact = Contact::where('uuid', $data['contact_uuid'])->firstOrFail();

        $agreement = Agreement::create([
            'contact_id' => $contact->id,
            'debt_id' => isset($data['debt_uuid']) ? Debt::where('uuid', $data['debt_uuid'])->value('id') : null,
            'call_id' => isset($data['call_uuid']) ? Call::where('uuid', $data['call_uuid'])->value('id') : null,
            'type' => $data['type'],
            'description' => $data['description'] ?? null,
            'amount' => $data['amount'] ?? null,
            'promise_date' => $data['promise_date'],
            'status' => 'pending',
            'created_by_type' => 'user',
            'created_by' => $request->user()->id,
            'observations' => $data['observations'] ?? null,
        ]);

        // Verificación automática al día siguiente del compromiso.
        FollowUp::create([
            'contact_id' => $contact->id,
            'agreement_id' => $agreement->id,
            'type' => 'payment_verification',
            'scheduled_at' => \Carbon\Carbon::parse($data['promise_date'])->addDay()->setTime(9, 0),
            'channel' => 'internal',
            'status' => 'pending',
        ]);

        return (new AgreementResource($agreement->load(['contact', 'debt'])))->response()->setStatusCode(201);
    }

    public function show(Agreement $agreement)
    {
        return new AgreementResource($agreement->load(['contact', 'debt', 'call', 'creator']));
    }

    public function update(Request $request, Agreement $agreement)
    {
        $data = $request->validate([
            'status' => ['sometimes', Rule::in(Agreement::STATUSES)],
            'amount' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'promise_date' => ['sometimes', 'date'],
            'description' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'observations' => ['sometimes', 'nullable', 'string', 'max:5000'],
        ]);

        if (isset($data['status']) && $data['status'] !== $agreement->status) {
            $data['confirmed_by'] = $request->user()->id;
            $data['verified_at'] = now();

            if ($data['status'] === 'broken') {
                app(\App\Services\FollowUps\FollowUpRuleEngine::class)->handleBrokenAgreement($agreement);
            }
        }

        $agreement->update($data);

        return new AgreementResource($agreement->fresh(['contact', 'debt', 'creator']));
    }

    public function destroy(Agreement $agreement)
    {
        $agreement->delete();

        return response()->json(['data' => ['message' => 'Acuerdo eliminado.']]);
    }
}
