<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('debts', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('contact_id')->constrained()->cascadeOnDelete();
            $table->string('code', 60)->index();
            $table->string('concept', 190);
            $table->decimal('original_amount', 12, 2);
            $table->decimal('pending_balance', 12, 2)->index();
            $table->string('currency', 3)->default('PEN');
            $table->date('due_date')->nullable()->index();
            $table->string('status', 30)->default('pending')->index(); // pending|overdue|partial|paid|refinanced|cancelled|in_review
            $table->unsignedSmallInteger('installments')->default(1);
            $table->unsignedSmallInteger('overdue_installments')->default(0);
            $table->date('last_payment_date')->nullable();
            $table->string('origin', 60)->nullable(); // import|api|manual|sync
            $table->text('observations')->nullable();
            $table->jsonb('extra_data')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->unique(['contact_id', 'code']);
        });

        Schema::create('debt_sync_logs', function (Blueprint $table) {
            $table->id();
            $table->string('source', 60);               // excel|api|manual|lamb
            $table->string('status', 20);               // ok|error
            $table->unsignedInteger('records_processed')->default(0);
            $table->unsignedInteger('records_failed')->default(0);
            $table->jsonb('details')->nullable();
            $table->foreignId('user_id')->nullable()->constrained();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('debt_sync_logs');
        Schema::dropIfExists('debts');
    }
};
