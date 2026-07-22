<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CampaignResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'uuid' => $this->uuid,
            'name' => $this->name,
            'description' => $this->description,
            'type' => $this->type,
            'status' => $this->status,
            'starts_at' => $this->starts_at?->toIso8601String(),
            'ends_at' => $this->ends_at?->toIso8601String(),
            'timezone' => $this->timezone,
            'allowed_from' => $this->allowed_from,
            'allowed_until' => $this->allowed_until,
            'allowed_days' => $this->allowed_days,
            'max_attempts' => $this->max_attempts,
            'retry_minutes' => $this->retry_minutes,
            'max_concurrent_calls' => $this->max_concurrent_calls,
            'priority' => $this->priority,
            'segment' => $this->segment,
            'segment_filters' => $this->segment_filters,
            'prompt_version' => new PromptVersionResource($this->whenLoaded('promptVersion')),
            'voice' => $this->voice,
            'language' => $this->language,
            'from_number' => $this->from_number,
            'tts_message' => $this->tts_message,
            'audio_url' => $this->audio_url,
            'greeting_message' => $this->greeting_message,
            'farewell_message' => $this->farewell_message,
            'dtmf_options' => $this->dtmf_options,
            'whatsapp_config' => $this->whatsapp_config,
            'post_call_actions' => $this->post_call_actions,
            'budget_limit' => $this->budget_limit !== null ? (float) $this->budget_limit : null,
            'estimated_cost' => (float) $this->estimated_cost,
            'record_calls' => $this->record_calls,
            'creator' => $this->whenLoaded('creator', fn () => ['uuid' => $this->creator->uuid, 'name' => $this->creator->name]),
            'supervisor' => $this->whenLoaded('supervisor', fn () => ['uuid' => $this->supervisor->uuid, 'name' => $this->supervisor->name]),
            'contacts_count' => $this->whenCounted('campaignContacts'),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
