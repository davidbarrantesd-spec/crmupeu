<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('call_prompts', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('name', 120);
            $table->string('type', 40)->default('collections'); // collections|support|survey|custom
            $table->text('description')->nullable();
            $table->string('status', 20)->default('draft')->index(); // draft|published|inactive
            $table->unsignedInteger('current_version')->default(1);
            $table->foreignId('created_by')->nullable()->constrained('users');
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('prompt_versions', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('call_prompt_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('version');
            $table->text('system_prompt');
            $table->text('instructions')->nullable();
            $table->text('greeting_message')->nullable();
            $table->text('farewell_message')->nullable();
            $table->jsonb('variables')->nullable();        // variables disponibles
            $table->jsonb('enabled_tools')->nullable();    // tools habilitadas
            $table->jsonb('guardrails')->nullable();       // datos prohibidos, reglas de seguridad
            $table->jsonb('faq')->nullable();              // preguntas frecuentes
            $table->jsonb('extraction_fields')->nullable();// campos que debe extraer la IA
            $table->unsignedSmallInteger('max_duration_seconds')->default(300);
            $table->string('status', 20)->default('draft'); // draft|published|archived
            $table->timestamp('published_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users');
            $table->timestamps();
            $table->unique(['call_prompt_id', 'version']);
        });

        Schema::create('ai_sessions', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('call_id')->nullable()->index();      // null en simulaciones
            $table->foreignId('prompt_version_id')->nullable()->constrained();
            $table->foreignId('contact_id')->nullable()->constrained();
            $table->string('mode', 20)->default('live');            // live|simulation
            $table->string('status', 20)->default('active');        // active|completed|failed
            $table->jsonb('messages')->nullable();                  // historial de turnos
            $table->jsonb('tool_calls')->nullable();
            $table->jsonb('structured_result')->nullable();
            $table->unsignedInteger('total_tokens')->default(0);
            $table->foreignId('user_id')->nullable()->constrained(); // quien simula
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_sessions');
        Schema::dropIfExists('prompt_versions');
        Schema::dropIfExists('call_prompts');
    }
};
