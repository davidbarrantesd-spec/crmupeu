<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('calls', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('contact_id')->constrained();
            $table->foreignId('campaign_id')->nullable()->constrained();
            $table->foreignId('debt_id')->nullable()->constrained();
            $table->string('type', 30)->index();  // recorded_audio|tts|ivr|ai_conversational|manual
            $table->string('from_number', 30)->nullable();
            $table->string('to_number', 30);
            $table->string('status', 30)->default('pending')->index();
            // pending|scheduled|queued|dialing|ringing|in_progress|completed|no_answer|busy|failed|cancelled|rejected
            $table->string('result', 40)->nullable()->index();
            // answered|no_answer|busy|failed|voicemail|payment_promise|refused|requires_advisor|wrong_number|hung_up
            $table->timestamp('scheduled_at')->nullable()->index();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('answered_at')->nullable();
            $table->timestamp('ended_at')->nullable();
            $table->unsignedInteger('duration_seconds')->nullable();
            $table->decimal('estimated_cost', 8, 4)->default(0);
            $table->string('twilio_call_sid', 64)->nullable()->index();
            $table->unsignedTinyInteger('attempt_number')->default(1);
            $table->jsonb('dtmf_responses')->nullable();
            $table->text('summary')->nullable();
            $table->jsonb('structured_result')->nullable();
            $table->text('error_message')->nullable();
            $table->string('error_code', 30)->nullable();
            $table->foreignId('user_id')->nullable()->constrained();  // asesor responsable (manual)
            $table->foreignId('prompt_version_id')->nullable()->constrained();
            $table->timestamp('next_follow_up_at')->nullable();
            $table->timestamps();
            $table->index(['campaign_id', 'status']);
            $table->index(['contact_id', 'created_at']);
        });

        Schema::create('call_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('call_id')->constrained()->cascadeOnDelete();
            $table->string('event', 40)->index();  // initiated|ringing|answered|completed|dtmf|error|...
            $table->jsonb('payload')->nullable();
            $table->timestamp('created_at')->useCurrent();
        });

        Schema::create('recordings', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('call_id')->constrained()->cascadeOnDelete();
            $table->string('recording_sid', 64)->nullable()->index();
            $table->string('url', 500);           // URL en S3/R2
            $table->string('disk_path', 500)->nullable();
            $table->unsignedInteger('duration_seconds')->nullable();
            $table->unsignedBigInteger('size_bytes')->nullable();
            $table->string('mime_type', 60)->default('audio/mpeg');
            $table->string('hash', 64)->nullable();
            $table->jsonb('metadata')->nullable();
            $table->timestamps();
        });

        Schema::create('transcriptions', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('call_id')->constrained()->cascadeOnDelete();
            $table->foreignId('recording_id')->nullable()->constrained()->nullOnDelete();
            $table->text('text');
            $table->jsonb('segments')->nullable(); // [{speaker, start, end, text}]
            $table->string('language', 10)->default('es');
            $table->string('provider', 30)->default('mock');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transcriptions');
        Schema::dropIfExists('recordings');
        Schema::dropIfExists('call_events');
        Schema::dropIfExists('calls');
    }
};
