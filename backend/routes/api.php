<?php

use App\Http\Controllers\Api\V1\AgreementController;
use App\Http\Controllers\Api\V1\AuditLogController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\CallController;
use App\Http\Controllers\Api\V1\CampaignController;
use App\Http\Controllers\Api\V1\ContactController;
use App\Http\Controllers\Api\V1\ConversationController;
use App\Http\Controllers\Api\V1\DashboardController;
use App\Http\Controllers\Api\V1\DebtController;
use App\Http\Controllers\Api\V1\FollowUpController;
use App\Http\Controllers\Api\V1\ImportController;
use App\Http\Controllers\Api\V1\PromptController;
use App\Http\Controllers\Api\V1\ReportController;
use App\Http\Controllers\Api\V1\RoleController;
use App\Http\Controllers\Api\V1\SettingController;
use App\Http\Controllers\Api\V1\TemplateController;
use App\Http\Controllers\Api\V1\UserController;
use App\Http\Controllers\Api\V1\Webhooks\TwilioVoiceWebhookController;
use App\Http\Controllers\Api\V1\Webhooks\TwilioWhatsAppWebhookController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {

    // ---- Auth (público, con rate limit estricto) ----
    Route::prefix('auth')->group(function () {
        Route::post('login', [AuthController::class, 'login'])->middleware('throttle:5,1');
        Route::post('forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:3,1');
        Route::post('reset-password', [AuthController::class, 'resetPassword'])->middleware('throttle:5,1');

        Route::middleware('auth:sanctum')->group(function () {
            Route::post('logout', [AuthController::class, 'logout']);
            Route::get('me', [AuthController::class, 'me']);
            Route::put('password', [AuthController::class, 'changePassword']);
        });
    });

    // ---- Webhooks Twilio (firma validada, sin auth Bearer) ----
    Route::prefix('webhooks/twilio')->middleware('twilio.signature')->group(function () {
        Route::post('voice/status', [TwilioVoiceWebhookController::class, 'status'])->name('webhooks.twilio.status');
        Route::post('voice/answer/{callUuid}', [TwilioVoiceWebhookController::class, 'answer'])->name('webhooks.twilio.answer');
        Route::post('voice/gather/{callUuid}', [TwilioVoiceWebhookController::class, 'gather'])->name('webhooks.twilio.gather');
        Route::post('voice/recording', [TwilioVoiceWebhookController::class, 'recording'])->name('webhooks.twilio.recording');
        Route::post('whatsapp', [TwilioWhatsAppWebhookController::class, 'inbound'])->name('webhooks.twilio.whatsapp');
        Route::post('whatsapp/status', [TwilioWhatsAppWebhookController::class, 'status'])->name('webhooks.twilio.whatsapp.status');
    });

    // ---- API autenticada ----
    Route::middleware(['auth:sanctum', 'throttle:120,1'])->group(function () {

        Route::get('dashboard', [DashboardController::class, 'index'])->middleware('permission:dashboard.view');

        // Usuarios y roles
        Route::middleware('permission:users.view')->group(function () {
            Route::get('users', [UserController::class, 'index']);
            Route::get('users/{user:uuid}', [UserController::class, 'show']);
        });
        Route::post('users', [UserController::class, 'store'])->middleware('permission:users.create');
        Route::put('users/{user:uuid}', [UserController::class, 'update'])->middleware('permission:users.edit');
        Route::delete('users/{user:uuid}', [UserController::class, 'destroy'])->middleware('permission:users.delete');

        Route::get('roles', [RoleController::class, 'index'])->middleware('permission:roles.view');
        Route::get('permissions', [RoleController::class, 'permissions'])->middleware('permission:roles.view');
        Route::post('roles', [RoleController::class, 'store'])->middleware('permission:roles.create');
        Route::put('roles/{role}', [RoleController::class, 'update'])->middleware('permission:roles.edit');
        Route::delete('roles/{role}', [RoleController::class, 'destroy'])->middleware('permission:roles.delete');

        // Contactos
        Route::middleware('permission:contacts.view')->group(function () {
            Route::get('contacts', [ContactController::class, 'index']);
            Route::get('contacts/duplicates', [ContactController::class, 'duplicates']);
            Route::get('contacts/{contact:uuid}', [ContactController::class, 'show']);
            Route::get('contacts/{contact:uuid}/timeline', [ContactController::class, 'timeline']);
        });
        Route::post('contacts', [ContactController::class, 'store'])->middleware('permission:contacts.create');
        Route::put('contacts/{contact:uuid}', [ContactController::class, 'update'])->middleware('permission:contacts.edit');
        Route::delete('contacts/{contact:uuid}', [ContactController::class, 'destroy'])->middleware('permission:contacts.delete');
        Route::post('contacts/{contact:uuid}/tags', [ContactController::class, 'syncTags'])->middleware('permission:contacts.edit');
        Route::post('contacts/{contact:uuid}/notes', [ContactController::class, 'addNote'])->middleware('permission:contacts.edit');
        Route::post('contacts/{contact:uuid}/merge', [ContactController::class, 'merge'])->middleware('permission:contacts.edit');
        Route::post('contacts/export', [ContactController::class, 'export'])->middleware('permission:contacts.export');

        // Deudas
        Route::get('debts', [DebtController::class, 'index'])->middleware('permission:debts.view');
        Route::get('debts/{debt:uuid}', [DebtController::class, 'show'])->middleware('permission:debts.view');
        Route::post('debts', [DebtController::class, 'store'])->middleware('permission:debts.create');
        Route::put('debts/{debt:uuid}', [DebtController::class, 'update'])->middleware('permission:debts.edit');
        Route::delete('debts/{debt:uuid}', [DebtController::class, 'destroy'])->middleware('permission:debts.delete');

        // Importación
        Route::middleware('permission:contacts.create')->group(function () {
            Route::get('imports', [ImportController::class, 'index']);
            Route::post('imports', [ImportController::class, 'store']);
            Route::get('imports/{import:uuid}', [ImportController::class, 'show']);
            Route::post('imports/{import:uuid}/mapping', [ImportController::class, 'mapping']);
            Route::get('imports/{import:uuid}/errors', [ImportController::class, 'errors']);
        });

        // Campañas
        Route::middleware('permission:campaigns.view')->group(function () {
            Route::get('campaigns', [CampaignController::class, 'index']);
            Route::get('campaigns/{campaign:uuid}', [CampaignController::class, 'show']);
            Route::get('campaigns/{campaign:uuid}/progress', [CampaignController::class, 'progress']);
            Route::get('campaigns/{campaign:uuid}/contacts', [CampaignController::class, 'contacts']);
        });
        Route::post('campaigns', [CampaignController::class, 'store'])->middleware('permission:campaigns.create');
        Route::post('campaigns/preview-segment', [CampaignController::class, 'previewSegment'])->middleware('permission:campaigns.create');
        Route::put('campaigns/{campaign:uuid}', [CampaignController::class, 'update'])->middleware('permission:campaigns.edit');
        Route::delete('campaigns/{campaign:uuid}', [CampaignController::class, 'destroy'])->middleware('permission:campaigns.delete');
        Route::middleware('permission:campaigns.launch')->group(function () {
            Route::post('campaigns/{campaign:uuid}/launch', [CampaignController::class, 'launch']);
            Route::post('campaigns/{campaign:uuid}/schedule', [CampaignController::class, 'schedule']);
            Route::post('campaigns/{campaign:uuid}/pause', [CampaignController::class, 'pause']);
            Route::post('campaigns/{campaign:uuid}/resume', [CampaignController::class, 'resume']);
            Route::post('campaigns/{campaign:uuid}/cancel', [CampaignController::class, 'cancel']);
            Route::post('campaigns/{campaign:uuid}/test', [CampaignController::class, 'test']);
        });
        Route::post('campaigns/{campaign:uuid}/duplicate', [CampaignController::class, 'duplicate'])->middleware('permission:campaigns.create');
        Route::post('campaigns/{campaign:uuid}/contacts', [CampaignController::class, 'addContacts'])->middleware('permission:campaigns.edit');
        Route::delete('campaigns/{campaign:uuid}/contacts/{contact:uuid}', [CampaignController::class, 'removeContact'])->middleware('permission:campaigns.edit');
        Route::post('campaigns/{campaign:uuid}/audio', [CampaignController::class, 'uploadAudio'])->middleware('permission:campaigns.edit');

        // Llamadas
        Route::get('calls', [CallController::class, 'index'])->middleware('permission:calls.view');
        Route::get('calls/{call:uuid}', [CallController::class, 'show'])->middleware('permission:calls.view');
        Route::post('calls', [CallController::class, 'store'])->middleware('permission:calls.create');
        Route::post('calls/{call:uuid}/cancel', [CallController::class, 'cancel'])->middleware('permission:calls.edit');
        Route::get('calls/{call:uuid}/recording-url', [CallController::class, 'recordingUrl'])->middleware('permission:recordings.listen');

        // Prompts IA
        Route::middleware('permission:prompts.view')->group(function () {
            Route::get('prompts', [PromptController::class, 'index']);
            Route::get('prompts/{prompt:uuid}', [PromptController::class, 'show']);
        });
        Route::middleware('permission:prompts.edit')->group(function () {
            Route::post('prompts', [PromptController::class, 'store']);
            Route::put('prompts/{prompt:uuid}', [PromptController::class, 'update']);
            Route::delete('prompts/{prompt:uuid}', [PromptController::class, 'destroy']);
            Route::post('prompts/{prompt:uuid}/versions', [PromptController::class, 'storeVersion']);
            Route::post('prompts/{prompt:uuid}/versions/{version}/publish', [PromptController::class, 'publishVersion']);
            Route::post('prompts/{prompt:uuid}/versions/{version}/restore', [PromptController::class, 'restoreVersion']);
            Route::post('prompts/{prompt:uuid}/duplicate', [PromptController::class, 'duplicate']);
        });
        Route::post('prompts/{prompt:uuid}/simulate', [PromptController::class, 'simulate'])->middleware('permission:prompts.view');

        // Acuerdos
        Route::get('agreements', [AgreementController::class, 'index'])->middleware('permission:agreements.view');
        Route::get('agreements/{agreement:uuid}', [AgreementController::class, 'show'])->middleware('permission:agreements.view');
        Route::post('agreements', [AgreementController::class, 'store'])->middleware('permission:agreements.create');
        Route::put('agreements/{agreement:uuid}', [AgreementController::class, 'update'])->middleware('permission:agreements.edit');
        Route::delete('agreements/{agreement:uuid}', [AgreementController::class, 'destroy'])->middleware('permission:agreements.delete');

        // Seguimientos y reglas
        Route::get('follow-ups', [FollowUpController::class, 'index'])->middleware('permission:follow_ups.view');
        Route::post('follow-ups', [FollowUpController::class, 'store'])->middleware('permission:follow_ups.create');
        Route::put('follow-ups/{followUp:uuid}', [FollowUpController::class, 'update'])->middleware('permission:follow_ups.edit');
        Route::get('follow-up-rules', [FollowUpController::class, 'rules'])->middleware('permission:follow_ups.view');
        Route::post('follow-up-rules', [FollowUpController::class, 'storeRule'])->middleware('permission:follow_ups.edit');
        Route::put('follow-up-rules/{rule:uuid}', [FollowUpController::class, 'updateRule'])->middleware('permission:follow_ups.edit');
        Route::delete('follow-up-rules/{rule:uuid}', [FollowUpController::class, 'destroyRule'])->middleware('permission:follow_ups.edit');

        // WhatsApp
        Route::middleware('permission:whatsapp.view')->group(function () {
            Route::get('conversations', [ConversationController::class, 'index']);
            Route::get('conversations/{conversation:uuid}', [ConversationController::class, 'show']);
            Route::get('conversations/{conversation:uuid}/messages', [ConversationController::class, 'messages']);
        });
        Route::middleware('permission:whatsapp.reply')->group(function () {
            Route::post('conversations', [ConversationController::class, 'store']);
            Route::post('conversations/{conversation:uuid}/messages', [ConversationController::class, 'sendMessage']);
            Route::post('conversations/{conversation:uuid}/assign', [ConversationController::class, 'assign']);
            Route::post('conversations/{conversation:uuid}/close', [ConversationController::class, 'close']);
            Route::post('conversations/{conversation:uuid}/reopen', [ConversationController::class, 'reopen']);
            Route::post('conversations/{conversation:uuid}/read', [ConversationController::class, 'markRead']);
            Route::put('conversations/{conversation:uuid}', [ConversationController::class, 'update']);
        });

        // Plantillas
        Route::get('whatsapp-templates', [TemplateController::class, 'whatsappIndex'])->middleware('permission:whatsapp.view');
        Route::post('whatsapp-templates', [TemplateController::class, 'whatsappStore'])->middleware('permission:templates.edit');
        Route::put('whatsapp-templates/{whatsappTemplate:uuid}', [TemplateController::class, 'whatsappUpdate'])->middleware('permission:templates.edit');
        Route::delete('whatsapp-templates/{whatsappTemplate:uuid}', [TemplateController::class, 'whatsappDestroy'])->middleware('permission:templates.edit');
        Route::get('templates', [TemplateController::class, 'index'])->middleware('permission:templates.view');
        Route::post('templates', [TemplateController::class, 'store'])->middleware('permission:templates.edit');
        Route::put('templates/{template:uuid}', [TemplateController::class, 'update'])->middleware('permission:templates.edit');
        Route::delete('templates/{template:uuid}', [TemplateController::class, 'destroy'])->middleware('permission:templates.edit');

        // Reportes
        Route::middleware('permission:reports.view')->group(function () {
            Route::get('reports/calls', [ReportController::class, 'calls']);
            Route::get('reports/agreements', [ReportController::class, 'agreements']);
            Route::get('reports/campaigns', [ReportController::class, 'campaigns']);
            Route::get('reports/advisors', [ReportController::class, 'advisors']);
        });

        // Auditoría
        Route::get('audit-logs', [AuditLogController::class, 'index'])->middleware('permission:audit.view');

        // Configuración e integraciones
        Route::middleware('permission:settings.view')->group(function () {
            Route::get('settings', [SettingController::class, 'index']);
            Route::get('integrations', [SettingController::class, 'integrations']);
            Route::get('costs/summary', [SettingController::class, 'costsSummary']);
        });
        Route::middleware('permission:settings.edit')->group(function () {
            Route::put('settings', [SettingController::class, 'update']);
            Route::put('integrations/{provider}', [SettingController::class, 'updateIntegration']);
            Route::post('integrations/{provider}/verify', [SettingController::class, 'verifyIntegration']);
        });
    });
});
