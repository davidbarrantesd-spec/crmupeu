<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('webhook_events', function (Blueprint $table) {
            $table->id();
            $table->string('provider', 30)->index();          // twilio|meta
            $table->string('event_type', 60)->index();        // voice_status|recording|whatsapp_inbound|message_status
            $table->string('idempotency_key', 190)->unique(); // sid+status hash
            $table->jsonb('payload');
            $table->string('status', 20)->default('received'); // received|processed|failed|duplicate
            $table->text('error')->nullable();
            $table->timestamp('processed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('action', 60)->index();     // created|updated|deleted|exported|listened|downloaded|launched|...
            $table->string('module', 60)->index();     // contacts|debts|campaigns|calls|...
            $table->string('auditable_type', 80)->nullable();
            $table->unsignedBigInteger('auditable_id')->nullable();
            $table->jsonb('old_values')->nullable();
            $table->jsonb('new_values')->nullable();
            $table->string('ip', 45)->nullable();
            $table->string('user_agent', 500)->nullable();
            $table->string('reason', 255)->nullable();
            $table->timestamp('created_at')->useCurrent()->index();
            $table->index(['auditable_type', 'auditable_id']);
        });

        Schema::create('system_settings', function (Blueprint $table) {
            $table->id();
            $table->string('key', 120)->unique();
            $table->text('value')->nullable();          // cifrado si is_encrypted
            $table->boolean('is_encrypted')->default(false);
            $table->string('group', 60)->default('general')->index();
            $table->timestamps();
        });

        Schema::create('integrations', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('provider', 40)->unique();   // twilio|whatsapp|openai|storage
            $table->string('status', 20)->default('sandbox'); // sandbox|active|disabled
            $table->text('credentials')->nullable();    // JSON cifrado
            $table->jsonb('config')->nullable();        // configuración no sensible
            $table->timestamp('last_verified_at')->nullable();
            $table->timestamps();
        });

        Schema::create('cost_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('campaign_id')->nullable()->constrained();
            $table->foreignId('call_id')->nullable()->constrained();
            $table->foreignId('message_id')->nullable()->constrained();
            $table->string('type', 30)->index();        // call|whatsapp|transcription|llm
            $table->decimal('amount', 10, 4);
            $table->string('currency', 3)->default('USD');
            $table->date('date')->index();
            $table->timestamps();
        });

        Schema::create('imports', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('type', 30);                 // contacts|debts
            $table->string('filename', 255);
            $table->string('disk_path', 500)->nullable();
            $table->jsonb('column_mapping')->nullable();
            $table->string('status', 20)->default('pending'); // pending|mapping|processing|completed|failed
            $table->unsignedInteger('total_rows')->default(0);
            $table->unsignedInteger('processed_rows')->default(0);
            $table->unsignedInteger('created_count')->default(0);
            $table->unsignedInteger('updated_count')->default(0);
            $table->unsignedInteger('failed_count')->default(0);
            $table->unsignedInteger('duplicate_count')->default(0);
            $table->foreignId('user_id')->nullable()->constrained();
            $table->timestamps();
        });

        Schema::create('import_rows', function (Blueprint $table) {
            $table->id();
            $table->foreignId('import_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('row_number');
            $table->jsonb('data');
            $table->string('status', 20)->default('pending'); // pending|created|updated|duplicate|failed
            $table->text('error')->nullable();
            $table->timestamps();
            $table->index(['import_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('import_rows');
        Schema::dropIfExists('imports');
        Schema::dropIfExists('cost_entries');
        Schema::dropIfExists('integrations');
        Schema::dropIfExists('system_settings');
        Schema::dropIfExists('audit_logs');
        Schema::dropIfExists('webhook_events');
    }
};
