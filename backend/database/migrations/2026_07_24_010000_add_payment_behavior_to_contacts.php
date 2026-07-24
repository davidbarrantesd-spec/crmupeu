<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Perfil de comportamiento de pago del estudiante a lo largo de TODA su
 * trayectoria (no solo su estado actual). Lo calcula crm:segment a diario;
 * guardarlo en columnas permite filtrar/agregar al instante con 15k+ filas.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('contacts', function (Blueprint $table) {
            // puntual | demora_leve | demora_cronica | fin_de_ciclo | sin_historial
            $table->string('payment_behavior', 30)->nullable()->index();
            $table->unsignedSmallInteger('payment_score')->nullable()->index(); // 0-100
            $table->decimal('on_time_rate', 4, 3)->nullable();       // % pagos a tiempo
            $table->smallInteger('avg_delay_days')->nullable();      // atraso promedio
            $table->decimal('end_of_cycle_rate', 4, 3)->nullable();  // % pagos a fin de ciclo
            $table->unsignedSmallInteger('cycles_with_debt')->default(0); // ciclos con actividad
            $table->string('payment_trend', 15)->nullable();         // mejorando|estable|empeorando
        });
    }

    public function down(): void
    {
        Schema::table('contacts', function (Blueprint $table) {
            $table->dropColumn([
                'payment_behavior', 'payment_score', 'on_time_rate', 'avg_delay_days',
                'end_of_cycle_rate', 'cycles_with_debt', 'payment_trend',
            ]);
        });
    }
};
