<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('contacts', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('internal_code', 50)->nullable()->index();
            $table->string('first_name', 120);
            $table->string('last_name', 120);
            $table->string('dni', 20)->nullable()->index();
            $table->string('phone', 30)->index();
            $table->string('phone_secondary', 30)->nullable();
            $table->string('email', 190)->nullable()->index();
            $table->string('city', 120)->nullable()->index();
            $table->string('address', 255)->nullable();
            $table->string('status', 30)->default('active')->index(); // active|inactive|invalid_phone|unreachable
            $table->string('source', 60)->nullable();                 // import|manual|api
            $table->string('segment', 60)->nullable()->index();
            $table->boolean('call_consent')->default(true);
            $table->boolean('whatsapp_consent')->default(true);
            $table->boolean('do_not_contact')->default(false)->index();
            $table->string('do_not_contact_reason', 255)->nullable();
            $table->boolean('phone_valid')->default(true);
            $table->jsonb('extra_data')->nullable();
            $table->timestamps();
            $table->softDeletes();
            $table->index(['last_name', 'first_name']);
        });

        Schema::create('tags', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('name', 60)->unique();
            $table->string('color', 20)->default('#6366f1');
            $table->timestamps();
        });

        Schema::create('contact_tags', function (Blueprint $table) {
            $table->id();
            $table->foreignId('contact_id')->constrained()->cascadeOnDelete();
            $table->foreignId('tag_id')->constrained()->cascadeOnDelete();
            $table->unique(['contact_id', 'tag_id']);
        });

        Schema::create('internal_notes', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('notable_type', 60);
            $table->unsignedBigInteger('notable_id');
            $table->foreignId('user_id')->constrained();
            $table->text('body');
            $table->timestamps();
            $table->index(['notable_type', 'notable_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('internal_notes');
        Schema::dropIfExists('contact_tags');
        Schema::dropIfExists('tags');
        Schema::dropIfExists('contacts');
    }
};
