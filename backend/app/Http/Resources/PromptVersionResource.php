<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PromptVersionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'uuid' => $this->uuid,
            'version' => $this->version,
            'system_prompt' => $this->system_prompt,
            'instructions' => $this->instructions,
            'greeting_message' => $this->greeting_message,
            'farewell_message' => $this->farewell_message,
            'variables' => $this->variables,
            'enabled_tools' => $this->enabled_tools,
            'guardrails' => $this->guardrails,
            'faq' => $this->faq,
            'extraction_fields' => $this->extraction_fields,
            'max_duration_seconds' => $this->max_duration_seconds,
            'status' => $this->status,
            'published_at' => $this->published_at?->toIso8601String(),
            'prompt' => $this->whenLoaded('prompt', fn () => ['uuid' => $this->prompt->uuid, 'name' => $this->prompt->name]),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
