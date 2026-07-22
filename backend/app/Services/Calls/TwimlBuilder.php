<?php

namespace App\Services\Calls;

use App\Models\Call;
use App\Services\Shared\VariableRenderer;

/**
 * Genera el TwiML que Twilio ejecuta al contestar la llamada.
 */
class TwimlBuilder
{
    public function __construct(protected VariableRenderer $renderer) {}

    public function forAnswer(Call $call, array $options = []): string
    {
        return match ($call->type) {
            'recorded_audio', 'ivr' => $this->recordedAudio($call, $options),
            'tts' => $this->textToSpeech($call, $options),
            'ai_conversational' => $this->aiConversational($call),
            default => $this->hangup('Gracias, hasta luego.'),
        };
    }

    protected function recordedAudio(Call $call, array $options): string
    {
        $campaign = $call->campaign;
        $audioUrl = $options['audio_url'] ?? $campaign?->audio_url;
        $dtmf = $campaign?->dtmf_options ?? [];
        $gatherUrl = route('webhooks.twilio.gather', $call->uuid);

        $inner = $audioUrl
            ? '<Play>'.e($audioUrl).'</Play>'
            : '<Say language="es-MX">'.e($this->renderMessage($call, $campaign?->tts_message ?? 'Le llamamos del área de cobranzas.')).'</Say>';

        if ($dtmf) {
            $hints = [];
            foreach (['1' => 'confirmar', '2' => 'recibir información por WhatsApp', '3' => 'hablar con un asesor'] as $digit => $label) {
                if (isset($dtmf[$digit])) {
                    $hints[] = "presione {$digit} para {$label}";
                }
            }
            $hintText = $hints ? '<Say language="es-MX">'.e(ucfirst(implode(', ', $hints)).'.').'</Say>' : '';

            return $this->document(
                '<Gather input="dtmf" numDigits="1" timeout="6" action="'.e($gatherUrl).'" method="POST">'
                .$inner.$hintText
                .'</Gather>'
                .'<Say language="es-MX">No recibimos respuesta. Hasta luego.</Say>'
            );
        }

        return $this->document($inner.'<Hangup/>');
    }

    protected function textToSpeech(Call $call, array $options): string
    {
        $campaign = $call->campaign;
        $message = $this->renderMessage($call, $options['tts_message'] ?? $campaign?->tts_message ?? '');
        $voice = $campaign?->voice ? ' voice="'.e($campaign->voice).'"' : '';
        $language = e($campaign?->language ?? 'es-MX');

        $say = '<Say language="'.$language.'"'.$voice.'>'.e($message).'</Say>';

        if ($campaign?->dtmf_options) {
            return $this->recordedAudio($call, ['audio_url' => null] + $options);
        }

        return $this->document($say.'<Hangup/>');
    }

    /**
     * En producción usa Twilio ConversationRelay (WebSocket bidireccional con el agente IA).
     * El endpoint relay corre en el mismo backend (routes/api → AiConversationController).
     */
    protected function aiConversational(Call $call): string
    {
        $greeting = $this->renderMessage(
            $call,
            $call->promptVersion?->greeting_message ?? 'Buenos días, le saluda la asistente virtual de cobranzas.'
        );

        $wsUrl = str_replace(['http://', 'https://'], ['ws://', 'wss://'], config('app.url')).'/api/v1/ai/relay/'.$call->uuid;

        return $this->document(
            '<Connect><ConversationRelay url="'.e($wsUrl).'" welcomeGreeting="'.e($greeting).'" language="es-MX" transcriptionProvider="google"/></Connect>'
        );
    }

    public function forGather(Call $call, string $digit): string
    {
        $dtmf = $call->campaign?->dtmf_options ?? [];
        $action = $dtmf[$digit]['action'] ?? null;

        return match ($action) {
            'confirm' => $this->document('<Say language="es-MX">Gracias por confirmar. Hasta luego.</Say><Hangup/>'),
            'send_whatsapp' => $this->document('<Say language="es-MX">Le enviaremos la información por WhatsApp. Hasta luego.</Say><Hangup/>'),
            'transfer_advisor' => $this->document('<Say language="es-MX">Lo comunicamos con un asesor, un momento por favor.</Say>'
                .(isset($dtmf[$digit]['transfer_to']) ? '<Dial>'.e($dtmf[$digit]['transfer_to']).'</Dial>' : '<Hangup/>')),
            'repeat' => $this->forAnswer($call),
            default => $this->hangup('Opción no válida. Hasta luego.'),
        };
    }

    public function hangup(string $message = ''): string
    {
        $say = $message ? '<Say language="es-MX">'.e($message).'</Say>' : '';

        return $this->document($say.'<Hangup/>');
    }

    protected function renderMessage(Call $call, string $template): string
    {
        return $this->renderer->render($template, $call->contact, $call->debt, $call->campaign);
    }

    protected function document(string $inner): string
    {
        return '<?xml version="1.0" encoding="UTF-8"?><Response>'.$inner.'</Response>';
    }
}
