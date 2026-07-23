<?php

namespace App\Integrations;

use App\Integrations\Llm\AnthropicDriver;
use App\Integrations\Llm\LlmProvider;
use App\Integrations\Llm\MockLlmDriver;
use App\Integrations\Llm\OpenAiDriver;
use App\Integrations\Messaging\SandboxWhatsAppDriver;
use App\Integrations\Messaging\TwilioWhatsAppDriver;
use App\Integrations\Messaging\WhatsAppProvider;
use App\Integrations\Telephony\SandboxTelephonyDriver;
use App\Integrations\Telephony\TelephonyProvider;
use App\Integrations\Telephony\TwilioTelephonyDriver;
use App\Models\Integration;

/**
 * Resuelve el driver de cada integración. Prioridad: credenciales guardadas
 * en la tabla integrations (cifradas) → variables de entorno → sandbox/mock.
 */
class IntegrationManager
{
    public function telephony(): TelephonyProvider
    {
        [$driver, $creds] = $this->resolve('twilio', 'services.telephony.driver', [
            'account_sid' => config('services.twilio.sid'),
            'auth_token' => config('services.twilio.token'),
            'phone_number' => config('services.twilio.phone_number'),
        ]);

        if ($driver === 'twilio' && ! empty($creds['account_sid']) && ! empty($creds['auth_token'])) {
            return new TwilioTelephonyDriver($creds['account_sid'], $creds['auth_token'], $creds['phone_number'] ?? '');
        }

        return new SandboxTelephonyDriver;
    }

    public function whatsapp(): WhatsAppProvider
    {
        [$driver, $creds] = $this->resolve('whatsapp', 'services.whatsapp.driver', [
            'account_sid' => config('services.twilio.sid'),
            'auth_token' => config('services.twilio.token'),
            'from_number' => config('services.twilio.whatsapp_from'),
        ]);

        if ($driver === 'twilio' && ! empty($creds['account_sid']) && ! empty($creds['auth_token'])) {
            return new TwilioWhatsAppDriver($creds['account_sid'], $creds['auth_token'], $creds['from_number'] ?? '');
        }

        return new SandboxWhatsAppDriver;
    }

    /** Driver LLM memoizado: en procesos de larga vida (workers de voz) evita
     * releer/desencriptar credenciales y recrear el cliente HTTP en cada turno
     * (el cliente vivo reutiliza la conexión TLS con la API). TTL corto para
     * recoger cambios de credenciales sin reiniciar. */
    protected ?LlmProvider $llmDriver = null;

    protected int $llmDriverExpiresAt = 0;

    public function llm(): LlmProvider
    {
        if ($this->llmDriver && time() < $this->llmDriverExpiresAt) {
            return $this->llmDriver;
        }

        $this->llmDriver = $this->resolveLlm();
        $this->llmDriverExpiresAt = time() + 300;

        return $this->llmDriver;
    }

    protected function resolveLlm(): LlmProvider
    {
        // Anthropic (Claude) tiene prioridad si está configurado en BD o env.
        $anthropic = Integration::where('provider', 'anthropic')->first();
        if ($anthropic && $anthropic->status === 'active') {
            $creds = $anthropic->getCredentials();
            if (! empty($creds['api_key'])) {
                return new AnthropicDriver($creds['api_key'], $creds['model'] ?? config('services.anthropic.model'));
            }
        }

        if (config('services.llm.driver') === 'anthropic' && config('services.anthropic.key')) {
            return new AnthropicDriver(config('services.anthropic.key'), config('services.anthropic.model'));
        }

        [$driver, $creds] = $this->resolve('openai', 'services.llm.driver', [
            'api_key' => config('services.openai.key'),
            'model' => config('services.openai.model', 'gpt-4o'),
        ]);

        if ($driver === 'openai' && ! empty($creds['api_key'])) {
            return new OpenAiDriver($creds['api_key'], $creds['model'] ?? 'gpt-4o');
        }

        return new MockLlmDriver;
    }

    /**
     * @return array{0: string, 1: array}
     */
    protected function resolve(string $provider, string $driverConfigKey, array $envCredentials): array
    {
        $integration = Integration::where('provider', $provider)->first();

        if ($integration && $integration->status === 'active') {
            $creds = $integration->getCredentials() + $envCredentials;

            return [$this->realDriverName($provider), $creds];
        }

        $driver = config($driverConfigKey, 'sandbox');

        return [$driver, $envCredentials];
    }

    protected function realDriverName(string $provider): string
    {
        return match ($provider) {
            'twilio', 'whatsapp' => 'twilio',
            'openai' => 'openai',
            default => 'sandbox',
        };
    }
}
