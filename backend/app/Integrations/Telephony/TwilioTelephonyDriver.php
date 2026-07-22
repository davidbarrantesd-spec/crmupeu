<?php

namespace App\Integrations\Telephony;

use App\Models\Call;
use Illuminate\Support\Facades\Http;
use Twilio\Rest\Client;

class TwilioTelephonyDriver implements TelephonyProvider
{
    public function __construct(
        protected string $accountSid,
        protected string $authToken,
        protected string $fromNumber,
    ) {}

    protected function client(): Client
    {
        return new Client($this->accountSid, $this->authToken);
    }

    public function placeCall(Call $call, string $answerUrl, string $statusCallbackUrl): string
    {
        $twilioCall = $this->client()->calls->create(
            $call->to_number,
            $call->from_number ?: $this->fromNumber,
            [
                'url' => $answerUrl,
                'statusCallback' => $statusCallbackUrl,
                'statusCallbackEvent' => ['initiated', 'ringing', 'answered', 'completed'],
                'statusCallbackMethod' => 'POST',
                'record' => (bool) ($call->campaign?->record_calls ?? true),
                'recordingStatusCallback' => route('webhooks.twilio.recording'),
                'timeout' => 30,
            ]
        );

        return $twilioCall->sid;
    }

    public function cancelCall(string $callSid): void
    {
        $this->client()->calls($callSid)->update(['status' => 'completed']);
    }

    public function fetchRecording(string $recordingUrl): string
    {
        return Http::withBasicAuth($this->accountSid, $this->authToken)
            ->get($recordingUrl.'.mp3')
            ->throw()
            ->body();
    }

    public function verify(): bool
    {
        $account = $this->client()->api->v2010->accounts($this->accountSid)->fetch();

        return $account->status === 'active';
    }

    public function name(): string
    {
        return 'twilio';
    }
}
