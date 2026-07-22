<?php

namespace App\Integrations\Messaging;

use Twilio\Rest\Client;

class TwilioWhatsAppDriver implements WhatsAppProvider
{
    public function __construct(
        protected string $accountSid,
        protected string $authToken,
        protected string $fromNumber, // ej. whatsapp:+14155238886
    ) {}

    protected function client(): Client
    {
        return new Client($this->accountSid, $this->authToken);
    }

    public function send(string $to, array $payload, string $statusCallbackUrl): string
    {
        $options = [
            'from' => str_starts_with($this->fromNumber, 'whatsapp:') ? $this->fromNumber : 'whatsapp:'.$this->fromNumber,
            'statusCallback' => $statusCallbackUrl,
        ];

        if (! empty($payload['template_sid'])) {
            $options['contentSid'] = $payload['template_sid'];
            if (! empty($payload['variables'])) {
                $options['contentVariables'] = json_encode($payload['variables']);
            }
        } else {
            $options['body'] = $payload['body'] ?? '';
        }

        if (! empty($payload['media_url'])) {
            $options['mediaUrl'] = [$payload['media_url']];
        }

        $to = str_starts_with($to, 'whatsapp:') ? $to : 'whatsapp:'.$to;
        $message = $this->client()->messages->create($to, $options);

        return $message->sid;
    }

    public function verify(): bool
    {
        $account = $this->client()->api->v2010->accounts($this->accountSid)->fetch();

        return $account->status === 'active';
    }

    public function name(): string
    {
        return 'twilio_whatsapp';
    }
}
