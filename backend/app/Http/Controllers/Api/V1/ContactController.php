<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\ContactResource;
use App\Models\AuditLog;
use App\Models\Contact;
use App\Services\Contacts\ContactService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ContactController extends Controller
{
    public function __construct(protected ContactService $service) {}

    public function index(Request $request)
    {
        $contacts = Contact::query()
            ->visibleTo($request->user())
            ->with(['tags', 'debts', 'campus', 'faculty', 'career', 'academicLevel'])
            ->withSum(['debts as total_pending' => fn ($q) => $q->whereNotIn('status', ['paid', 'cancelled'])], 'pending_balance')
            ->when($request->search, fn ($q, $s) => $q->where(fn ($q2) => $q2
                ->where('first_name', 'ilike', "%{$s}%")
                ->orWhere('last_name', 'ilike', "%{$s}%")
                ->orWhere('dni', 'ilike', "%{$s}%")
                ->orWhere('phone', 'ilike', "%{$s}%")
                ->orWhere('internal_code', 'ilike', "%{$s}%")
                ->orWhere('student_code', 'ilike', "%{$s}%")
                ->orWhere('id_persona', 'ilike', "%{$s}%")))
            ->when($request->status, fn ($q, $v) => $q->where('status', $v))
            ->when($request->segment, fn ($q, $v) => $q->where('segment', $v))
            ->when($request->city, fn ($q, $v) => $q->where('city', $v))
            ->when($request->tag, fn ($q, $v) => $q->whereHas('tags', fn ($q2) => $q2->where('name', $v)))
            ->when($request->filled('do_not_contact'), fn ($q) => $q->where('do_not_contact', $request->boolean('do_not_contact')))
            ->when($request->boolean('has_debt'), fn ($q) => $q->whereHas('debts', fn ($q2) => $q2->whereNotIn('status', ['paid', 'cancelled'])))
            // Filtros académicos
            ->when($request->campus_id, fn ($q, $v) => $q->where('campus_id', $v))
            ->when($request->faculty_id, fn ($q, $v) => $q->where('faculty_id', $v))
            ->when($request->career_id, fn ($q, $v) => $q->where('career_id', $v))
            ->when($request->academic_level_id, fn ($q, $v) => $q->where('academic_level_id', $v))
            ->when($request->modality, fn ($q, $v) => $q->where('modality', $v))
            ->when($request->enrollment_status, fn ($q, $v) => $q->where('enrollment_status', $v))
            ->when($request->payment_segment, fn ($q, $v) => $q->where('payment_segment', $v))
            ->when($request->payment_behavior, fn ($q, $v) => $q->where('payment_behavior', $v))
            ->when($request->min_score, fn ($q, $v) => $q->where('payment_score', '>=', (int) $v))
            ->when($request->max_score, fn ($q, $v) => $q->where('payment_score', '<=', (int) $v))
            ->when($request->academic_period, fn ($q, $v) => $q->whereHas('debts', fn ($q2) => $q2->where('academic_period', $v)))
            ->when(
                $request->get('sort') === 'total_debt',
                fn ($q) => $q->orderByDesc('total_pending'),
                fn ($q) => $q->orderBy($request->get('sort', 'created_at'), $request->get('dir', 'desc'))
            )
            ->paginate($request->integer('per_page', 15));

        return ContactResource::collection($contacts);
    }

    public function store(Request $request)
    {
        $data = $this->validateContact($request);

        $phone = ContactService::normalizePhone($data['phone']);
        abort_if(! $phone, 422, 'Teléfono inválido.');
        $data['phone'] = $phone;
        $data['phone_secondary'] = ContactService::normalizePhone($data['phone_secondary'] ?? null);
        $data['source'] = 'manual';

        $contact = Contact::create(collect($data)->except('tags')->all());

        if (! empty($data['tags'])) {
            $this->service->syncTags($contact, $data['tags']);
        }

        return (new ContactResource($contact->load(['tags', 'debts'])))->response()->setStatusCode(201);
    }

    public function show(Contact $contact)
    {
        $this->assertInScope($contact);

        $contact->load(['tags', 'debts', 'campus', 'faculty', 'career', 'academicLevel']);

        return (new ContactResource($contact))->additional(['payment_timeline' => app(\App\Services\Reports\PaymentBehaviorService::class)->timeline($contact)]);
    }

    /** Restricción dura de alcance también en accesos directos por uuid. */
    protected function assertInScope(Contact $contact): void
    {
        abort_unless(
            Contact::visibleTo(request()->user())->whereKey($contact->id)->exists(),
            403, 'El contacto está fuera de tu alcance académico.'
        );
    }

    public function update(Request $request, Contact $contact)
    {
        $this->assertInScope($contact);

        $data = $this->validateContact($request, $contact);

        if (isset($data['phone'])) {
            $phone = ContactService::normalizePhone($data['phone']);
            abort_if(! $phone, 422, 'Teléfono inválido.');
            $data['phone'] = $phone;
        }
        if (array_key_exists('phone_secondary', $data)) {
            $data['phone_secondary'] = ContactService::normalizePhone($data['phone_secondary']);
        }

        $contact->update(collect($data)->except('tags')->all());

        if (isset($data['tags'])) {
            $this->service->syncTags($contact, $data['tags']);
        }

        return new ContactResource($contact->load(['tags', 'debts']));
    }

    public function destroy(Contact $contact)
    {
        $this->assertInScope($contact);
        $contact->delete();

        return response()->json(['data' => ['message' => 'Contacto eliminado.']]);
    }

    public function timeline(Contact $contact)
    {
        return response()->json(['data' => $this->service->timeline($contact)]);
    }

    public function syncTags(Request $request, Contact $contact)
    {
        $data = $request->validate(['tags' => ['required', 'array'], 'tags.*' => ['string', 'max:60']]);
        $this->service->syncTags($contact, $data['tags']);

        return new ContactResource($contact->load(['tags', 'debts']));
    }

    public function addNote(Request $request, Contact $contact)
    {
        $data = $request->validate(['body' => ['required', 'string', 'max:5000']]);

        $note = $contact->notes()->create(['user_id' => $request->user()->id, 'body' => $data['body']]);

        return response()->json(['data' => [
            'uuid' => $note->uuid, 'body' => $note->body,
            'user' => $request->user()->name,
            'created_at' => $note->created_at->toIso8601String(),
        ]], 201);
    }

    public function duplicates()
    {
        $groups = collect($this->service->findDuplicates())->map(fn ($g) => [
            'field' => $g['field'],
            'value' => $g['value'],
            'contacts' => ContactResource::collection($g['contacts']),
        ]);

        return response()->json(['data' => $groups]);
    }

    public function merge(Request $request, Contact $contact)
    {
        $data = $request->validate(['duplicate_uuid' => ['required', 'uuid', 'exists:contacts,uuid']]);

        $duplicate = Contact::where('uuid', $data['duplicate_uuid'])->firstOrFail();
        abort_if($duplicate->id === $contact->id, 422, 'No se puede unificar un contacto consigo mismo.');

        $merged = $this->service->merge($contact, $duplicate);

        return new ContactResource($merged->load(['tags', 'debts']));
    }

    public function export(Request $request)
    {
        AuditLog::record('exported', 'contacts');

        $columns = ['internal_code', 'first_name', 'last_name', 'dni', 'phone', 'phone_secondary', 'email', 'city', 'address', 'status', 'segment'];

        return response()->streamDownload(function () use ($columns) {
            $out = fopen('php://output', 'w');
            fputcsv($out, $columns);
            Contact::orderBy('id')->chunk(500, function ($contacts) use ($out, $columns) {
                foreach ($contacts as $contact) {
                    fputcsv($out, array_map(fn ($c) => $contact->{$c}, $columns));
                }
            });
            fclose($out);
        }, 'contactos_'.now()->format('Ymd_His').'.csv', ['Content-Type' => 'text/csv']);
    }

    protected function validateContact(Request $request, ?Contact $contact = null): array
    {
        $required = $contact ? 'sometimes' : 'required';

        return $request->validate([
            'internal_code' => ['nullable', 'string', 'max:50'],
            'first_name' => [$required, 'string', 'max:120'],
            'last_name' => [$required, 'string', 'max:120'],
            'dni' => ['nullable', 'string', 'max:20'],
            'phone' => [$required, 'string', 'max:30'],
            'phone_secondary' => ['nullable', 'string', 'max:30'],
            'email' => ['nullable', 'email', 'max:190'],
            'city' => ['nullable', 'string', 'max:120'],
            'address' => ['nullable', 'string', 'max:255'],
            'status' => ['sometimes', Rule::in(['active', 'inactive', 'invalid_phone', 'unreachable'])],
            'segment' => ['nullable', 'string', 'max:60'],
            'call_consent' => ['sometimes', 'boolean'],
            'whatsapp_consent' => ['sometimes', 'boolean'],
            'do_not_contact' => ['sometimes', 'boolean'],
            'do_not_contact_reason' => ['nullable', 'string', 'max:255'],
            'phone_valid' => ['sometimes', 'boolean'],
            'tags' => ['sometimes', 'array'],
            'tags.*' => ['string', 'max:60'],
            // Dimensión académica (integración LAMB)
            'id_persona' => ['nullable', 'string', 'max:40', Rule::unique('contacts', 'id_persona')->ignore($contact?->id)],
            'student_code' => ['nullable', 'string', 'max:40'],
            'campus_id' => ['nullable', 'integer', 'exists:campuses,id'],
            'faculty_id' => ['nullable', 'integer', 'exists:faculties,id'],
            'career_id' => ['nullable', 'integer', 'exists:careers,id'],
            'academic_level_id' => ['nullable', 'integer', 'exists:academic_levels,id'],
            'modality' => ['nullable', Rule::in(AcademicCatalogController::MODALITIES)],
            'enrollment_status' => ['nullable', Rule::in(['matriculado', 'no_matriculado'])],
        ]);
    }
}
