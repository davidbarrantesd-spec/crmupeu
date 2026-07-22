<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\MessageTemplate;
use App\Models\WhatsappTemplate;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class TemplateController extends Controller
{
    // ---- Plantillas de WhatsApp ----

    public function whatsappIndex()
    {
        return response()->json(['data' => WhatsappTemplate::orderBy('name')->get()->map(fn ($t) => $this->serializeWhatsapp($t))]);
    }

    public function whatsappStore(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', 'unique:whatsapp_templates,name'],
            'language' => ['sometimes', 'string', 'max:10'],
            'category' => ['sometimes', Rule::in(['utility', 'marketing', 'authentication'])],
            'body' => ['required', 'string', 'max:2000'],
            'provider_template_id' => ['nullable', 'string', 'max:120'],
            'variables' => ['sometimes', 'array'],
        ]);

        $template = WhatsappTemplate::create($data + ['status' => 'approved']);

        return response()->json(['data' => $this->serializeWhatsapp($template)], 201);
    }

    public function whatsappUpdate(Request $request, WhatsappTemplate $whatsappTemplate)
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:120', Rule::unique('whatsapp_templates', 'name')->ignore($whatsappTemplate->id)],
            'language' => ['sometimes', 'string', 'max:10'],
            'category' => ['sometimes', Rule::in(['utility', 'marketing', 'authentication'])],
            'body' => ['sometimes', 'string', 'max:2000'],
            'provider_template_id' => ['nullable', 'string', 'max:120'],
            'variables' => ['sometimes', 'array'],
            'status' => ['sometimes', Rule::in(['pending', 'approved', 'rejected'])],
        ]);

        $whatsappTemplate->update($data);

        return response()->json(['data' => $this->serializeWhatsapp($whatsappTemplate)]);
    }

    public function whatsappDestroy(WhatsappTemplate $whatsappTemplate)
    {
        $whatsappTemplate->delete();

        return response()->json(['data' => ['message' => 'Plantilla eliminada.']]);
    }

    // ---- Plantillas de mensajes (TTS / textos) ----

    public function index(Request $request)
    {
        $templates = MessageTemplate::query()
            ->when($request->type, fn ($q, $v) => $q->where('type', $v))
            ->orderBy('name')
            ->get()
            ->map(fn ($t) => $this->serializeMessage($t));

        return response()->json(['data' => $templates]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'type' => ['required', Rule::in(['tts', 'whatsapp_text', 'note'])],
            'body' => ['required', 'string', 'max:4000'],
            'voice' => ['nullable', 'string', 'max:60'],
            'language' => ['sometimes', 'string', 'max:10'],
            'speech_rate' => ['sometimes', 'numeric', 'between:0.5,2'],
        ]);

        $template = MessageTemplate::create($data + ['created_by' => $request->user()->id]);

        return response()->json(['data' => $this->serializeMessage($template)], 201);
    }

    public function update(Request $request, MessageTemplate $template)
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'body' => ['sometimes', 'string', 'max:4000'],
            'voice' => ['nullable', 'string', 'max:60'],
            'language' => ['sometimes', 'string', 'max:10'],
            'speech_rate' => ['sometimes', 'numeric', 'between:0.5,2'],
        ]);

        $template->update($data);

        return response()->json(['data' => $this->serializeMessage($template)]);
    }

    public function destroy(MessageTemplate $template)
    {
        $template->delete();

        return response()->json(['data' => ['message' => 'Plantilla eliminada.']]);
    }

    protected function serializeWhatsapp(WhatsappTemplate $t): array
    {
        return [
            'uuid' => $t->uuid, 'name' => $t->name, 'language' => $t->language,
            'category' => $t->category, 'body' => $t->body, 'status' => $t->status,
            'provider_template_id' => $t->provider_template_id, 'variables' => $t->variables,
        ];
    }

    protected function serializeMessage(MessageTemplate $t): array
    {
        return [
            'uuid' => $t->uuid, 'name' => $t->name, 'type' => $t->type, 'body' => $t->body,
            'voice' => $t->voice, 'language' => $t->language, 'speech_rate' => (float) $t->speech_rate,
        ];
    }
}
