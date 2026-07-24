<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'twilio' => [
        'sid' => env('TWILIO_ACCOUNT_SID'),
        'token' => env('TWILIO_AUTH_TOKEN'),
        'phone_number' => env('TWILIO_PHONE_NUMBER'),
        'whatsapp_from' => env('TWILIO_WHATSAPP_FROM'),
        'validate_signature' => env('TWILIO_VALIDATE_SIGNATURE', true),
        // URL pública wss:// del servidor crm:relay (voz conversacional IA).
        'relay_url' => env('CONVERSATION_RELAY_URL'),
    ],

    // Sistema académico UPeU (ver docs/INTEGRACION-LAMB.md)
    'lamb' => [
        'url' => env('LAMB_API_URL'),
        'token' => env('LAMB_API_TOKEN'),
    ],

    'telephony' => [
        'driver' => env('TELEPHONY_DRIVER', 'sandbox'),
    ],

    'whatsapp' => [
        'driver' => env('WHATSAPP_DRIVER', 'sandbox'),
    ],

    'llm' => [
        'driver' => env('LLM_DRIVER', 'mock'),
    ],

    'anthropic' => [
        'key' => env('ANTHROPIC_API_KEY'),
        'model' => env('ANTHROPIC_MODEL', 'claude-opus-4-8'),
    ],

    'openai' => [
        'key' => env('OPENAI_API_KEY'),
        'model' => env('OPENAI_MODEL', 'gpt-4o'),
    ],

    'limits' => [
        'call_max_concurrency' => (int) env('CALL_MAX_CONCURRENCY', 5),
        'call_daily_limit' => (int) env('CALL_DAILY_LIMIT', 1000),
        'cost_budget_alert_pct' => (int) env('COST_BUDGET_ALERT_PCT', 80),
    ],
];
