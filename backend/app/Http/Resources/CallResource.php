<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CallResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $user = $request->user();

        return [
            'uuid' => $this->uuid,
            'contact' => new ContactResource($this->whenLoaded('contact')),
            'campaign' => $this->whenLoaded('campaign', fn () => ['uuid' => $this->campaign->uuid, 'name' => $this->campaign->name, 'type' => $this->campaign->type]),
            'type' => $this->type,
            'from_number' => $this->from_number,
            'to_number' => $this->to_number,
            'status' => $this->status,
            'result' => $this->result,
            'scheduled_at' => $this->scheduled_at?->toIso8601String(),
            'started_at' => $this->started_at?->toIso8601String(),
            'answered_at' => $this->answered_at?->toIso8601String(),
            'ended_at' => $this->ended_at?->toIso8601String(),
            'duration_seconds' => $this->duration_seconds,
            'estimated_cost' => $this->when($user?->can('finance.view') ?? false, (float) $this->estimated_cost),
            'twilio_call_sid' => $this->twilio_call_sid,
            'attempt_number' => $this->attempt_number,
            'dtmf_responses' => $this->dtmf_responses,
            'summary' => $this->summary,
            'structured_result' => $this->structured_result,
            'error_message' => $this->error_message,
            'error_code' => $this->error_code,
            'events' => $this->whenLoaded('events', fn () => $this->events->map(fn ($e) => [
                'event' => $e->event, 'payload' => $e->payload, 'at' => $e->created_at?->toIso8601String(),
            ])),
            'recordings' => $this->when(
                ($user?->can('recordings.listen') ?? false) && $this->relationLoaded('recordings'),
                fn () => $this->recordings->map(fn ($r) => [
                    'uuid' => $r->uuid, 'duration_seconds' => $r->duration_seconds,
                    'size_bytes' => $r->size_bytes, 'mime_type' => $r->mime_type,
                ])
            ),
            'transcription' => $this->when(
                ($user?->can('transcriptions.view') ?? false) && $this->relationLoaded('transcription') && $this->transcription,
                fn () => ['text' => $this->transcription->text, 'segments' => $this->transcription->segments, 'provider' => $this->transcription->provider]
            ),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
