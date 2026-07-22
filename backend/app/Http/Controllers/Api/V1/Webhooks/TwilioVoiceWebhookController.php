<?php

namespace App\Http\Controllers\Api\V1\Webhooks;

use App\Http\Controllers\Controller;
use App\Jobs\ProcessCallResultJob;
use App\Jobs\ProcessRecordingJob;
use App\Models\Call;
use App\Models\WebhookEvent;
use App\Services\Calls\TwimlBuilder;
use App\Services\FollowUps\FollowUpRuleEngine;
use Illuminate\Http\Request;

class TwilioVoiceWebhookController extends Controller
{
    /**
     * TwiML que Twilio solicita al contestar la llamada.
     */
    public function answer(Request $request, string $callUuid, TwimlBuilder $twiml)
    {
        $call = Call::where('uuid', $callUuid)->first();

        if (! $call) {
            return response($twiml->hangup(), 200)->header('Content-Type', 'text/xml');
        }

        $call->update(['status' => 'in_progress', 'answered_at' => $call->answered_at ?? now()]);
        $call->addEvent('answered', $request->only(['CallSid', 'From', 'To']));

        $options = $call->events()->where('event', 'options')->first()?->payload ?? [];

        return response($twiml->forAnswer($call, $options), 200)->header('Content-Type', 'text/xml');
    }

    /**
     * Respuesta DTMF del <Gather>.
     */
    public function gather(Request $request, string $callUuid, TwimlBuilder $twiml, FollowUpRuleEngine $ruleEngine)
    {
        $call = Call::where('uuid', $callUuid)->first();
        $digit = (string) $request->input('Digits', '');

        if (! $call) {
            return response($twiml->hangup(), 200)->header('Content-Type', 'text/xml');
        }

        $responses = $call->dtmf_responses ?? [];
        $responses[] = ['digit' => $digit, 'at' => now()->toIso8601String()];
        $call->update(['dtmf_responses' => $responses]);
        $call->addEvent('dtmf', ['digit' => $digit]);

        $action = $call->campaign?->dtmf_options[$digit]['action'] ?? null;
        if ($action) {
            $call->update(['result' => match ($action) {
                'confirm' => 'answered',
                'send_whatsapp' => 'answered',
                'transfer_advisor' => 'requires_advisor',
                default => $call->result,
            }]);
            $ruleEngine->handleDtmf($call, $action);
        }

        return response($twiml->forGather($call, $digit), 200)->header('Content-Type', 'text/xml');
    }

    /**
     * Callbacks de estado de llamada (initiated → ringing → answered → completed).
     */
    public function status(Request $request)
    {
        $sid = $request->input('CallSid');
        $status = $request->input('CallStatus');

        if (! $sid || ! $status) {
            return response()->json(['ok' => false], 422);
        }

        $event = WebhookEvent::recordOnce('twilio', 'voice_status', "voice:{$sid}:{$status}", $request->post());

        if (! $event) {
            return response()->json(['ok' => true, 'duplicate' => true]);
        }

        $call = Call::where('twilio_call_sid', $sid)->first();

        if (! $call) {
            $event->markFailed('Call no encontrada para SID');

            return response()->json(['ok' => true]);
        }

        try {
            $mapped = match ($status) {
                'queued' => 'queued',
                'initiated' => 'dialing',
                'ringing' => 'ringing',
                'in-progress' => 'in_progress',
                'completed' => 'completed',
                'busy' => 'busy',
                'no-answer' => 'no_answer',
                'failed' => 'failed',
                'canceled' => 'cancelled',
                default => null,
            };

            if ($mapped && ! $call->isFinal()) {
                $update = ['status' => $mapped];

                if ($status === 'in-progress' && ! $call->answered_at) {
                    $update['answered_at'] = now();
                }

                if (in_array($mapped, Call::FINAL_STATUSES)) {
                    $update['ended_at'] = now();
                    $update['duration_seconds'] = (int) $request->input('CallDuration', 0);
                    $update['result'] = $call->result ?? match ($mapped) {
                        'completed' => 'answered',
                        'no_answer' => 'no_answer',
                        'busy' => 'busy',
                        'failed' => 'failed',
                        default => null,
                    };
                    if ($request->input('ErrorCode')) {
                        $update['error_code'] = $request->input('ErrorCode');
                    }
                }

                $call->update($update);
                $call->addEvent($status, ['sid' => $sid]);

                if (in_array($mapped, Call::FINAL_STATUSES)) {
                    ProcessCallResultJob::dispatch($call->id);
                } else {
                    broadcast(new \App\Events\CallUpdated($call))->toOthers();
                }
            }

            $event->markProcessed();
        } catch (\Throwable $e) {
            $event->markFailed($e->getMessage());
            throw $e;
        }

        return response()->json(['ok' => true]);
    }

    /**
     * Callback de grabación disponible.
     */
    public function recording(Request $request)
    {
        $recordingSid = $request->input('RecordingSid');
        $callSid = $request->input('CallSid');

        if (! $recordingSid || ! $callSid) {
            return response()->json(['ok' => false], 422);
        }

        $event = WebhookEvent::recordOnce('twilio', 'recording', "recording:{$recordingSid}", $request->post());

        if (! $event) {
            return response()->json(['ok' => true, 'duplicate' => true]);
        }

        $call = Call::where('twilio_call_sid', $callSid)->first();

        if ($call) {
            ProcessRecordingJob::dispatch(
                $call->id,
                $recordingSid,
                (string) $request->input('RecordingUrl'),
                (int) $request->input('RecordingDuration', 0),
            );
            $event->markProcessed();
        } else {
            $event->markFailed('Call no encontrada');
        }

        return response()->json(['ok' => true]);
    }
}
