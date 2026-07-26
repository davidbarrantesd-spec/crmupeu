<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Calificación crediticia estilo banca peruana (SBS), por días de atraso de
 * la deuda vencida más antigua sin pagar:
 *   normal ≤8d · cpp 9-30d · deficiente 31-60d · dudoso 61-120d · perdida >120d
 * La calcula crm:segment junto con el resto del perfil.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('contacts', function (Blueprint $table) {
            $table->string('credit_rating', 15)->nullable()->index();
            $table->unsignedSmallInteger('current_delay_days')->default(0); // atraso actual máximo
        });
    }

    public function down(): void
    {
        Schema::table('contacts', function (Blueprint $table) {
            $table->dropColumn(['credit_rating', 'current_delay_days']);
        });
    }
};
