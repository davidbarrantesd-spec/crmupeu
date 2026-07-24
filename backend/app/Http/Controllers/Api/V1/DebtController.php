<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\DebtResource;
use App\Models\Contact;
use App\Models\Debt;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class DebtController extends Controller
{
    public function index(Request $request)
    {
        $debts = Debt::query()
            ->whereHas('contact', fn ($q) => $q->visibleTo($request->user()))
            ->with('contact.career', 'contact.campus')
            ->when($request->search, fn ($q, $s) => $q->where(fn ($q2) => $q2
                ->where('code', 'ilike', "%{$s}%")
                ->orWhere('concept', 'ilike', "%{$s}%")
                ->orWhereHas('contact', fn ($q3) => $q3->where('first_name', 'ilike', "%{$s}%")
                    ->orWhere('last_name', 'ilike', "%{$s}%")->orWhere('dni', 'ilike', "%{$s}%"))))
            ->when($request->status, fn ($q, $v) => $q->where('status', $v))
            ->when($request->contact, fn ($q, $v) => $q->whereHas('contact', fn ($q2) => $q2->where('uuid', $v)))
            ->when($request->boolean('overdue'), fn ($q) => $q->where('due_date', '<', now())->whereNotIn('status', ['paid', 'cancelled']))
            ->when($request->min_balance, fn ($q, $v) => $q->where('pending_balance', '>=', $v))
            ->when($request->max_balance, fn ($q, $v) => $q->where('pending_balance', '<=', $v))
            ->when($request->due_before, fn ($q, $v) => $q->where('due_date', '<=', $v))
            ->when($request->due_after, fn ($q, $v) => $q->where('due_date', '>=', $v))
            ->when($request->academic_period, fn ($q, $v) => $q->where('academic_period', $v))
            ->when($request->campus_id, fn ($q, $v) => $q->whereHas('contact', fn ($q2) => $q2->where('campus_id', $v)))
            ->when($request->faculty_id, fn ($q, $v) => $q->whereHas('contact', fn ($q2) => $q2->where('faculty_id', $v)))
            ->when($request->career_id, fn ($q, $v) => $q->whereHas('contact', fn ($q2) => $q2->where('career_id', $v)))
            ->orderBy($request->get('sort', 'created_at'), $request->get('dir', 'desc'))
            ->paginate($request->integer('per_page', 15));

        return DebtResource::collection($debts);
    }

    public function store(Request $request)
    {
        $data = $this->validateDebt($request);

        $contact = Contact::where('uuid', $data['contact_uuid'])->firstOrFail();

        $debt = Debt::create(collect($data)->except('contact_uuid')->all() + [
            'contact_id' => $contact->id,
            'origin' => 'manual',
        ]);

        return (new DebtResource($debt->load('contact')))->response()->setStatusCode(201);
    }

    public function show(Debt $debt)
    {
        return new DebtResource($debt->load(['contact', 'agreements']));
    }

    public function update(Request $request, Debt $debt)
    {
        $data = $this->validateDebt($request, updating: true);

        $debt->update($data);

        return new DebtResource($debt->load('contact'));
    }

    public function destroy(Debt $debt)
    {
        $debt->delete();

        return response()->json(['data' => ['message' => 'Deuda eliminada.']]);
    }

    protected function validateDebt(Request $request, bool $updating = false): array
    {
        $required = $updating ? 'sometimes' : 'required';

        return $request->validate([
            'contact_uuid' => [$updating ? 'prohibited' : 'required', 'uuid', 'exists:contacts,uuid'],
            'code' => [$required, 'string', 'max:60'],
            'concept' => [$required, 'string', 'max:190'],
            'original_amount' => [$required, 'numeric', 'min:0'],
            'pending_balance' => [$required, 'numeric', 'min:0'],
            'currency' => ['sometimes', 'string', 'size:3'],
            'due_date' => ['nullable', 'date'],
            'status' => ['sometimes', Rule::in(Debt::STATUSES)],
            'installments' => ['sometimes', 'integer', 'min:1'],
            'overdue_installments' => ['sometimes', 'integer', 'min:0'],
            'last_payment_date' => ['nullable', 'date'],
            'academic_period' => ['nullable', 'string', 'max:10', 'regex:/^\d{4}-\d{1,2}$/'],
            'paid_at' => ['nullable', 'date'],
            'observations' => ['nullable', 'string', 'max:5000'],
            'extra_data' => ['nullable', 'array'],
        ]);
    }
}
