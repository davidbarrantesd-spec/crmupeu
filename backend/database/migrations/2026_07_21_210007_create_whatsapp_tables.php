<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('conversations', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('contact_id')->constrained();
            $table->string('channel', 20)->default('whatsapp');
            $table->string('phone', 30)->index();
            $table->string('status', 20)->default('open')->index(); // open|pending|closed
            $table->unsignedTinyInteger('priority')->default(5);
            $table->foreignId('assigned_to')->nullable()->constrained('users');
            $table->foreignId('campaign_id')->nullable()->constrained();
            $table->timestamp('last_message_at')->nullable()->index();
            $table->timestamp('last_inbound_at')->nullable();   // para ventana 24h
            $table->unsignedInteger('unread_count')->default(0);
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('messages', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('conversation_id')->constrained()->cascadeOnDelete();
            $table->string('direction', 10)->index();          // inbound|outbound
            $table->string('type', 20)->default('text');       // text|template|image|audio|document|video
            $table->text('body')->nullable();
            $table->string('media_url', 500)->nullable();
            $table->string('media_mime', 60)->nullable();
            $table->string('status', 20)->default('queued')->index(); // queued|sent|delivered|read|failed
            $table->string('message_sid', 64)->nullable()->index();
            $table->foreignId('whatsapp_template_id')->nullable();
            $table->foreignId('user_id')->nullable()->constrained();  // asesor emisor
            $table->string('sent_by_type', 20)->default('user');      // user|ai|campaign|system
            $table->text('error_message')->nullable();
            $table->jsonb('metadata')->nullable();
            $table->timestamps();
            $table->index(['conversation_id', 'created_at']);
        });

        Schema::create('whatsapp_templates', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('name', 120)->unique();
            $table->string('language', 10)->default('es');
            $table->string('category', 40)->default('utility');
            $table->text('body');                              // con variables {{1}}, {{nombre}}
            $table->string('provider_template_id', 120)->nullable(); // content SID de Twilio
            $table->string('status', 20)->default('approved'); // pending|approved|rejected
            $table->jsonb('variables')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('message_templates', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->string('name', 120);
            $table->string('type', 20)->default('tts');        // tts|whatsapp_text|note
            $table->text('body');
            $table->string('voice', 60)->nullable();
            $table->string('language', 10)->default('es-MX');
            $table->decimal('speech_rate', 3, 2)->default(1.0);
            $table->foreignId('created_by')->nullable()->constrained('users');
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::table('agreements', function (Blueprint $table) {
            $table->foreign('conversation_id')->references('id')->on('conversations')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('agreements', fn (Blueprint $t) => $t->dropForeign(['conversation_id']));
        Schema::dropIfExists('message_templates');
        Schema::dropIfExists('whatsapp_templates');
        Schema::dropIfExists('messages');
        Schema::dropIfExists('conversations');
    }
};
