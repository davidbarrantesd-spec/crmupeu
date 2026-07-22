<?php

namespace App\Events;

use App\Models\Message;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class MessageReceived implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public Message $message) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('conversations')];
    }

    public function broadcastWith(): array
    {
        $conversation = $this->message->conversation;

        return [
            'message' => [
                'uuid' => $this->message->uuid,
                'body' => $this->message->body,
                'direction' => $this->message->direction,
                'type' => $this->message->type,
                'status' => $this->message->status,
                'created_at' => $this->message->created_at->toIso8601String(),
            ],
            'conversation' => [
                'uuid' => $conversation->uuid,
                'unread_count' => $conversation->unread_count,
                'last_message_at' => $conversation->last_message_at?->toIso8601String(),
                'contact_name' => $conversation->contact?->full_name,
            ],
        ];
    }
}
