<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Dimensión académica UPeU: catálogos Campus/Facultad/Carrera, nivel y
 * modalidad en contactos (estudiantes), ciclo académico en deudas, alcance
 * por usuario y segmento de comportamiento de pago. Preparado para la
 * integración con LAMB (llave maestra id_persona).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('campuses', function (Blueprint $table) {
            $table->id();
            $table->string('code', 80)->unique();   // código LAMB
            $table->string('name', 120);
            $table->timestamps();
        });

        Schema::create('faculties', function (Blueprint $table) {
            $table->id();
            $table->string('code', 80)->unique();
            $table->string('name', 160);
            $table->timestamps();
        });

        Schema::create('careers', function (Blueprint $table) {
            $table->id();
            $table->string('code', 80)->unique();
            $table->string('name', 160);
            $table->foreignId('faculty_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });

        // Catálogo flexible: Pregrado, Maestría, Doctorado, y los que vengan
        // (segunda especialidad, etc.). category agrupa para filtros gruesos.
        Schema::create('academic_levels', function (Blueprint $table) {
            $table->id();
            $table->string('code', 80)->unique();
            $table->string('name', 120);
            $table->string('category', 30)->index(); // pregrado|posgrado|otro
            $table->timestamps();
        });

        Schema::table('contacts', function (Blueprint $table) {
            $table->string('id_persona', 40)->nullable()->unique();   // llave maestra LAMB
            $table->string('student_code', 40)->nullable()->index();
            $table->foreignId('campus_id')->nullable()->constrained('campuses')->nullOnDelete();
            $table->foreignId('faculty_id')->nullable()->constrained('faculties')->nullOnDelete();
            $table->foreignId('career_id')->nullable()->constrained('careers')->nullOnDelete();
            $table->foreignId('academic_level_id')->nullable()->constrained('academic_levels')->nullOnDelete();
            $table->string('modality', 30)->nullable()->index();       // presencial|semipresencial|virtual
            $table->string('enrollment_status', 30)->nullable()->index(); // matriculado|no_matriculado
            $table->string('payment_segment', 40)->nullable()->index();   // ver crm:segment
            $table->timestamp('payment_segment_updated_at')->nullable();
            $table->timestamp('lamb_synced_at')->nullable();
        });

        Schema::table('debts', function (Blueprint $table) {
            $table->string('academic_period', 10)->nullable()->index(); // 2026-1
            $table->date('paid_at')->nullable();                        // para comportamiento de pago
        });

        // Alcance del usuario: cada fila es un permiso; campos en null actúan
        // como comodín (solo campus => toda la facultad/carrera de ese campus).
        // Usuario SIN filas = ve todo (superadmin/roles globales).
        Schema::create('user_scopes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('campus_id')->nullable()->constrained('campuses')->cascadeOnDelete();
            $table->foreignId('faculty_id')->nullable()->constrained('faculties')->cascadeOnDelete();
            $table->foreignId('career_id')->nullable()->constrained('careers')->cascadeOnDelete();
            $table->timestamps();
            $table->index(['user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_scopes');

        Schema::table('debts', function (Blueprint $table) {
            $table->dropColumn(['academic_period', 'paid_at']);
        });

        Schema::table('contacts', function (Blueprint $table) {
            $table->dropConstrainedForeignId('campus_id');
            $table->dropConstrainedForeignId('faculty_id');
            $table->dropConstrainedForeignId('career_id');
            $table->dropConstrainedForeignId('academic_level_id');
            $table->dropColumn([
                'id_persona', 'student_code', 'modality', 'enrollment_status',
                'payment_segment', 'payment_segment_updated_at', 'lamb_synced_at',
            ]);
        });

        Schema::dropIfExists('academic_levels');
        Schema::dropIfExists('careers');
        Schema::dropIfExists('faculties');
        Schema::dropIfExists('campuses');
    }
};
