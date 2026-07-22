<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->uuid('uuid')->nullable()->unique()->after('id');
            $table->string('status', 20)->default('active')->index()->after('password'); // active|inactive
            $table->string('phone', 30)->nullable()->after('email');
            $table->timestamp('last_login_at')->nullable();
            $table->softDeletes();
        });

        Schema::create('login_audits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('email')->index();
            $table->string('event', 30)->index(); // login|logout|failed|password_reset
            $table->string('ip', 45)->nullable();
            $table->string('user_agent', 500)->nullable();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('login_audits');
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['uuid', 'status', 'phone', 'last_login_at', 'deleted_at']);
        });
    }
};
