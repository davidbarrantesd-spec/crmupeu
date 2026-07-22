<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('campaigns', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('name', 160);
            $table->text('description')->nullable();
            $table->string('type', 40)->index(); // recorded_audio|tts|ivr|ai_conversational|whatsapp|mixed
            $table->string('status', 20)->default('draft')->index(); // draft|scheduled|running|paused|finished|cancelled
            $table->timestamp('starts_at')->nullable()->index();
            $table->timestamp('ends_at')->nullable();
            $table->string('timezone', 60)->default('America/Lima');
            $table->time('allowed_from')->default('08:00');
            $table->time('allowed_until')->default('20:00');
            $table->jsonb('allowed_days')->nullable();          // [1..7] ISO
            $table->unsignedTinyInteger('max_attempts')->default(3);
            $table->unsignedInteger('retry_minutes')->default(120);
            $table->unsignedTinyInteger('max_concurrent_calls')->default(5);
            $table->unsignedTinyInteger('priority')->default(5);
            $table->string('segment', 60)->nullable();
            $table->jsonb('segment_filters')->nullable();       // filtros de segmentación
            $table->foreignId('prompt_version_id')->nullable()->constrained();
            $table->string('voice', 60)->nullable();            // Polly.Mia etc.
            $table->string('language', 10)->default('es-MX');
            $table->string('from_number', 30)->nullable();
            $table->text('tts_message')->nullable();            // texto a voz con variables
            $table->string('audio_url', 500)->nullable();       // audio grabado (S3)
            $table->string('audio_path', 500)->nullable();
            $table->text('greeting_message')->nullable();
            $table->text('farewell_message')->nullable();
            $table->jsonb('dtmf_options')->nullable();          // presione 1/2/3, repetir, grabar, transferir
            $table->jsonb('whatsapp_config')->nullable();       // plantilla, follow-up message
            $table->foreignId('whatsapp_template_id')->nullable();
            $table->jsonb('post_call_actions')->nullable();     // enviar whatsapp, etc.
            $table->jsonb('follow_up_rules')->nullable();       // reglas específicas de campaña
            $table->decimal('budget_limit', 12, 2)->nullable();
            $table->decimal('estimated_cost', 12, 2)->default(0);
            $table->boolean('record_calls')->default(true);
            $table->foreignId('created_by')->nullable()->constrained('users');
            $table->foreignId('supervisor_id')->nullable()->constrained('users');
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('campaign_contacts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('campaign_id')->constrained()->cascadeOnDelete();
            $table->foreignId('contact_id')->constrained()->cascadeOnDelete();
            $table->foreignId('debt_id')->nullable()->constrained();
            $table->string('status', 30)->default('pending')->index(); // pending|in_progress|contacted|not_contacted|completed|excluded
            $table->string('last_result', 40)->nullable()->index();
            $table->unsignedTinyInteger('attempts')->default(0);
            $table->timestamp('next_attempt_at')->nullable()->index();
            $table->timestamp('last_attempt_at')->nullable();
            $table->timestamps();
            $table->unique(['campaign_id', 'contact_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('campaign_contacts');
        Schema::dropIfExists('campaigns');
    }
};
