<?php

namespace App\Http\Controllers\Api\V1\Webhooks;

use App\Events\MessageStatusUpdated;
use App\Http\Controllers\Controller;
use App\Models\Message;
use App\Models\WebhookEvent;
use App\Services\WhatsApp\WhatsAppService;
use Illuminate\Http\Request;

class TwilioWhatsAppWebhookController extends Controller
{
    /**
     * Mensajes entrantes de WhatsApp.
     */
    public function inbound(Request $request, WhatsAppService $service)
    {
        $sid = $request->input('MessageSid', $request->input('SmsSid'));

        if (! $sid) {
            return response()->json(['ok' => false], 422);
        }

        $event = WebhookEvent::recordOnce('twilio', 'whatsapp_inbound', "wa-in:{$sid}", $request->post());

        if (! $event) {
            return response()->json(['ok' => true, 'duplicate' => true]);
        }

        try {
            $service->receiveInbound(
                (string) $request->input('From', ''),
                (string) $request->input('Body', ''),
                $sid,
                $request->input('MediaUrl0'),
                $request->input('MediaContentType0'),
            );

            $event->markProcessed();
        } catch (\Throwable $e) {
            $event->markFailed($e->getMessage());
            throw $e;
        }

        // Twilio espera TwiML vacío para no responder automáticamente.
        return response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', 200)
            ->header('Content-Type', 'text/xml');
    }

    /**
     * Callbacks de estado de mensajes salientes (sent → delivered → read / failed).
     */
    public function status(Request $request)
    {
        $sid = $request->input('MessageSid', $request->input('SmsSid'));
        $status = $request->input('MessageStatus', $request->input('SmsStatus'));

        if (! $sid || ! $status) {
            return response()->json(['ok' => false], 422);
        }

        $event = WebhookEvent::recordOnce('twilio', 'message_status', "wa-status:{$sid}:{$status}", $request->post());

        if (! $event) {
            return response()->json(['ok' => true, 'duplicate' => true]);
        }

        $message = Message::where('message_sid', $sid)->first();

        if ($message) {
            $mapped = match ($status) {
                'queued', 'accepted' => 'queued',
                'sent' => 'sent',
                'delivered' => 'delivered',
                'read' => 'read',
                'failed', 'undelivered' => 'failed',
                default => null,
            };

            // No retroceder estados (read no vuelve a delivered).
            $order = ['queued' => 0, 'sent' => 1, 'delivered' => 2, 'read' => 3, 'failed' => 9];
            if ($mapped && ($order[$mapped] ?? 0) > ($order[$message->status] ?? 0)) {
                $message->update([
                    'status' => $mapped,
                    'error_message' => $status === 'failed' ? $request->input('ErrorMessage', 'Error de entrega') : null,
                ]);
                broadcast(new MessageStatusUpdated($message))->toOthers();
            }

            $event->markProcessed();
        } else {
            $event->markFailed('Mensaje no encontrado para SID');
        }

        return response()->json(['ok' => true]);
    }
}
