<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('agreements', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('contact_id')->constrained();
            $table->foreignId('debt_id')->nullable()->constrained();
            $table->foreignId('call_id')->nullable()->constrained();
            $table->foreignId('conversation_id')->nullable();
            $table->string('type', 40)->default('payment_promise'); // payment_promise|partial_payment|refinance|dispute|other
            $table->text('description')->nullable();
            $table->decimal('amount', 12, 2)->nullable();
            $table->date('promise_date')->nullable()->index();
            $table->string('status', 20)->default('pending')->index(); // pending|fulfilled|broken|rescheduled|cancelled|in_review
            $table->string('created_by_type', 20)->default('user'); // user|ai
            $table->foreignId('created_by')->nullable()->constrained('users');
            $table->foreignId('confirmed_by')->nullable()->constrained('users');
            $table->timestamp('verified_at')->nullable();
            $table->text('observations')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['status', 'promise_date']);
        });

        Schema::create('follow_up_rules', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('name', 160);
            $table->string('trigger_event', 60)->index();
            // call_no_answer|call_busy|call_failed|payment_promise|agreement_broken|dtmf_whatsapp|dtmf_advisor|max_attempts
            $table->string('action', 60);
            // retry_call|schedule_ai_call|send_whatsapp|create_advisor_task|verify_payment|close|escalate
            $table->unsignedInteger('delay_minutes')->default(120);
            $table->jsonb('config')->nullable();      // plantilla, prioridad, canal, etc.
            $table->foreignId('campaign_id')->nullable()->constrained(); // null = regla global
            $table->boolean('active')->default(true);
            $table->timestamps();
        });

        Schema::create('follow_ups', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('contact_id')->constrained();
            $table->foreignId('campaign_id')->nullable()->constrained();
            $table->foreignId('agreement_id')->nullable()->constrained();
            $table->foreignId('call_id')->nullable()->constrained();
            $table->string('type', 40)->index(); // auto_call|ai_call|whatsapp|manual_call|payment_verification|advisor_task
            $table->timestamp('scheduled_at')->index();
            $table->string('channel', 20)->default('voice'); // voice|whatsapp|internal
            $table->unsignedTinyInteger('priority')->default(5);
            $table->string('status', 20)->default('pending')->index(); // pending|in_progress|done|cancelled|expired
            $table->unsignedTinyInteger('attempt_number')->default(1);
            $table->foreignId('follow_up_rule_id')->nullable()->constrained();
            $table->foreignId('assigned_to')->nullable()->constrained('users');
            $table->string('result', 60)->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->index(['status', 'scheduled_at']);
        });

        Schema::create('assignments', function (Blueprint $table) {
            $table->id();
            $table->string('assignable_type', 60);
            $table->unsignedBigInteger('assignable_id');
            $table->foreignId('user_id')->constrained();
            $table->foreignId('assigned_by')->nullable()->constrained('users');
            $table->timestamp('created_at')->useCurrent();
            $table->index(['assignable_type', 'assignable_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('assignments');
        Schema::dropIfExists('follow_ups');
        Schema::dropIfExists('follow_up_rules');
        Schema::dropIfExists('agreements');
    }
};
