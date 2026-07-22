<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\AgreementResource;
use App\Http\Resources\CallResource;
use App\Http\Resources\ConversationResource;
use App\Http\Resources\MessageResource;
use App\Models\AuditLog;
use App\Models\Contact;
use App\Models\Conversation;
use App\Models\User;
use App\Models\WhatsappTemplate;
use App\Services\WhatsApp\WhatsAppService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class ConversationController extends Controller
{
    public function __construct(protected WhatsAppService $service) {}

    public function index(Request $request)
    {
        $conversations = Conversation::query()
            ->with(['contact.tags', 'assignee', 'messages' => fn ($q) => $q->latest()->limit(1)])
            ->when($request->status, fn ($q, $v) => $q->where('status', $v))
            ->when($request->assigned_to, fn ($q, $v) => $q->whereHas('assignee', fn ($q2) => $q2->where('uuid', $v)))
            ->when($request->boolean('unread'), fn ($q) => $q->where('unread_count', '>', 0))
            ->when($request->search, fn ($q, $s) => $q->where(fn ($q2) => $q2
                ->where('phone', 'ilike', "%{$s}%")
                ->orWhereHas('contact', fn ($q3) => $q3->where('first_name', 'ilike', "%{$s}%")
                    ->orWhere('last_name', 'ilike', "%{$s}%"))))
            ->orderByDesc('last_message_at')
            ->paginate($request->integer('per_page', 25));

        return ConversationResource::collection($conversations);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'contact_uuid' => ['required', 'uuid', 'exists:contacts,uuid'],
            'template_uuid' => ['required', 'uuid', 'exists:whatsapp_templates,uuid'],
            'variables' => ['sometimes', 'array'],
        ]);

        $contact = Contact::where('uuid', $data['contact_uuid'])->firstOrFail();
        $template = WhatsappTemplate::where('uuid', $data['template_uuid'])->firstOrFail();

        $message = $this->service->sendTemplate($contact, $template, $data['variables'] ?? [], $request->user()->id);

        return (new ConversationResource($message->conversation->load(['contact.tags', 'assignee'])))
            ->response()->setStatusCode(201);
    }

    public function show(Conversation $conversation)
    {
        $conversation->load(['contact.tags', 'contact.debts', 'assignee']);

        return response()->json(['data' => (new ConversationResource($conversation))->resolve() + [
            'contact_agreements' => AgreementResource::collection(
                $conversation->contact->agreements()->latest()->limit(5)->get()
            ),
            'contact_calls' => CallResource::collection(
                $conversation->contact->calls()->latest()->limit(5)->get()
            ),
            'notes' => $conversation->contact->notes()->with('user')->latest()->limit(10)->get()
                ->map(fn ($n) => ['uuid' => $n->uuid, 'body' => $n->body, 'user' => $n->user?->name, 'created_at' => $n->created_at->toIso8601String()]),
        ]]);
    }

    public function messages(Request $request, Conversation $conversation)
    {
        $messages = $conversation->messages()
            ->with('user')
            ->when($request->before, fn ($q, $v) => $q->where('id', '<', \App\Models\Message::where('uuid', $v)->value('id') ?? PHP_INT_MAX))
            ->latest()
            ->limit($request->integer('limit', 50))
            ->get()
            ->reverse()
            ->values();

        return MessageResource::collection($messages);
    }

    public function sendMessage(Request $request, Conversation $conversation)
    {
        $data = $request->validate([
            'body' => ['nullable', 'string', 'max:4096', 'required_without_all:template_uuid,file'],
            'template_uuid' => ['nullable', 'uuid', 'exists:whatsapp_templates,uuid'],
            'variables' => ['sometimes', 'array'],
            'file' => ['nullable', 'file', 'max:10240', 'mimes:jpg,jpeg,png,pdf,mp3,mp4,ogg'],
        ]);

        $contact = $conversation->contact;

        if (! empty($data['template_uuid'])) {
            $template = WhatsappTemplate::where('uuid', $data['template_uuid'])->firstOrFail();
            $message = $this->service->sendTemplate($contact, $template, $data['variables'] ?? [], $request->user()->id);
        } else {
            $mediaUrl = null;
            if ($request->hasFile('file')) {
                $path = $request->file('file')->store("attachments/{$conversation->uuid}", 's3');
                $mediaUrl = Storage::disk('s3')->url($path);
            }
            $message = $this->service->sendText($contact, $data['body'] ?? '', $request->user()->id, mediaUrl: $mediaUrl);
        }

        return (new MessageResource($message->load('user')))->response()->setStatusCode(201);
    }

    public function assign(Request $request, Conversation $conversation)
    {
        $data = $request->validate(['user_uuid' => ['required', 'uuid', 'exists:users,uuid']]);

        $user = User::where('uuid', $data['user_uuid'])->firstOrFail();
        $conversation->update(['assigned_to' => $user->id]);

        AuditLog::record('assigned', 'conversations', $conversation, ['new_values' => ['assigned_to' => $user->name]]);

        return new ConversationResource($conversation->fresh(['contact.tags', 'assignee']));
    }

    public function close(Conversation $conversation)
    {
        $conversation->update(['status' => 'closed']);

        return new ConversationResource($conversation->fresh(['contact.tags', 'assignee']));
    }

    public function reopen(Conversation $conversation)
    {
        $conversation->update(['status' => 'open']);

        return new ConversationResource($conversation->fresh(['contact.tags', 'assignee']));
    }

    public function markRead(Conversation $conversation)
    {
        $conversation->update(['unread_count' => 0]);

        return new ConversationResource($conversation->fresh(['contact.tags', 'assignee']));
    }

    public function update(Request $request, Conversation $conversation)
    {
        $data = $request->validate(['priority' => ['required', 'integer', 'between:1,10']]);

        $conversation->update($data);

        return new ConversationResource($conversation->fresh(['contact.tags', 'assignee']));
    }
}
