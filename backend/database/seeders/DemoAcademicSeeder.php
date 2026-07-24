<?php

namespace Database\Seeders;

use App\Models\AcademicLevel;
use App\Models\Campus;
use App\Models\Career;
use App\Models\Contact;
use App\Models\Faculty;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * Datos demo realistas de la dimensión académica: 3 campus, facultades y
 * carreras reales de la UPeU, ~200 estudiantes con deudas multi-ciclo y
 * comportamientos de pago variados para poblar los 5 segmentos.
 *
 * Todos los contactos llevan source='demo' para poder limpiarlos después:
 *   Contact::where('source','demo')->forceDelete();
 */
class DemoAcademicSeeder extends Seeder
{
    protected array $firstNames = ['Juan', 'María', 'Luis', 'Ana', 'Carlos', 'Rosa', 'José', 'Carmen', 'Miguel', 'Julia', 'Pedro', 'Elena', 'Jorge', 'Lucía', 'David', 'Sofía', 'Daniel', 'Valeria', 'Diego', 'Camila', 'Kevin', 'Fiorella', 'Álvaro', 'Milagros', 'Renzo', 'Estefany'];

    protected array $lastNames = ['Quispe', 'Mamani', 'Flores', 'García', 'Huanca', 'Condori', 'Rodríguez', 'López', 'Choque', 'Vásquez', 'Ramos', 'Torres', 'Apaza', 'Chávez', 'Díaz', 'Salas', 'Paredes', 'Cruz', 'Rojas', 'Gutiérrez'];

    public function run(): void
    {
        $catalog = [
            'Lima' => [
                'Facultad de Ingeniería y Arquitectura' => ['Ingeniería de Sistemas', 'Ingeniería Civil', 'Ingeniería Ambiental', 'Arquitectura'],
                'Facultad de Ciencias Empresariales' => ['Administración', 'Contabilidad', 'Marketing'],
                'Facultad de Ciencias de la Salud' => ['Enfermería', 'Psicología', 'Nutrición'],
            ],
            'Juliaca' => [
                'Facultad de Ingeniería y Arquitectura' => ['Ingeniería de Sistemas', 'Ingeniería Civil'],
                'Facultad de Ciencias de la Salud' => ['Enfermería', 'Psicología'],
            ],
            'Tarapoto' => [
                'Facultad de Ciencias Empresariales' => ['Administración', 'Contabilidad'],
                'Facultad de Ingeniería y Arquitectura' => ['Ingeniería Ambiental'],
            ],
        ];

        $levels = [
            'Pregrado' => 'pregrado',
            'Maestría' => 'posgrado',
            'Doctorado' => 'posgrado',
        ];

        $levelModels = collect($levels)->map(fn ($cat, $name) => AcademicLevel::firstOrCreate(
            ['code' => Str::slug($name)], ['name' => $name, 'category' => $cat]
        ));

        $periods = ['2022-1', '2022-2', '2023-1', '2023-2', '2024-1', '2024-2', '2025-1', '2025-2', '2026-1'];
        $modalities = ['presencial', 'presencial', 'semipresencial', 'virtual']; // sesgo a presencial
        $counter = 1;

        foreach ($catalog as $campusName => $faculties) {
            $campus = Campus::firstOrCreate(['code' => Str::slug($campusName)], ['name' => $campusName]);

            foreach ($faculties as $facultyName => $careers) {
                $faculty = Faculty::firstOrCreate(['code' => Str::slug($facultyName)], ['name' => $facultyName]);

                foreach ($careers as $careerName) {
                    $career = Career::firstOrCreate(
                        ['code' => Str::slug($facultyName.'-'.$careerName)],
                        ['name' => $careerName, 'faculty_id' => $faculty->id]
                    );

                    // 6-9 estudiantes por carrera con perfiles de pago variados
                    $students = random_int(6, 9);
                    for ($i = 0; $i < $students; $i++) {
                        $this->makeStudent($counter++, $campus, $faculty, $career, $levelModels, $periods, $modalities);
                    }
                }
            }
        }

        $this->command?->info('Demo académico sembrado: '.Contact::where('source', 'demo')->count().' estudiantes.');
    }

    protected function makeStudent(int $n, Campus $campus, Faculty $faculty, Career $career, $levels, array $periods, array $modalities): void
    {
        $first = $this->firstNames[array_rand($this->firstNames)];
        $lastA = $this->lastNames[array_rand($this->lastNames)];
        $lastB = $this->lastNames[array_rand($this->lastNames)];

        // Perfil de pago + año de carrera: un alumno de 4to año arrastra ~7
        // ciclos de historia coherente con su perfil.
        $profiles = ['puntual', 'fin_de_ciclo', 'demora_leve', 'demora_cronica', 'cronico', 'inactivo', 'reciente'];
        $profile = $profiles[array_rand($profiles)];
        $careerYear = random_int(1, 5);

        $level = random_int(1, 10) <= 8 ? $levels['Pregrado'] : $levels[random_int(0, 1) ? 'Maestría' : 'Doctorado'];

        $contact = Contact::create([
            'id_persona' => sprintf('P%07d', 1000000 + $n),
            'student_code' => sprintf('20%d%05d', random_int(19, 25), $n),
            'internal_code' => "DEMO-{$n}",
            'first_name' => $first,
            'last_name' => "{$lastA} {$lastB}",
            'dni' => (string) random_int(60000000, 79999999),
            'phone' => '+5199'.random_int(1000000, 9999999),
            'email' => Str::slug("{$first}.{$lastA}").$n.'@upeu.edu.pe',
            'city' => $campus->name,
            'status' => 'active',
            'source' => 'demo',
            'campus_id' => $campus->id,
            'faculty_id' => $faculty->id,
            'career_id' => $career->id,
            'academic_level_id' => $level->id,
            'modality' => $modalities[array_rand($modalities)],
            'enrollment_status' => $profile === 'inactivo' ? 'no_matriculado' : 'matriculado',
        ]);

        $amount = fn () => [350, 450, 450, 520, 650, 890][array_rand([0, 1, 2, 3, 4, 5])];

        $addDebt = function (string $period, string $status, ?int $paidDaysLate = null) use ($contact, $amount) {
            [$year, $sem] = explode('-', $period);
            $due = \Carbon\Carbon::create((int) $year, $sem === '1' ? 4 : 9, 15);
            $a = $amount();

            $contact->debts()->create([
                'code' => strtoupper(Str::random(3)).'-'.$period.'-'.$contact->id.'-'.Str::random(3),
                'concept' => 'Pensión de enseñanza '.($sem === '1' ? 'abril' : 'setiembre')." {$year}",
                'original_amount' => $a,
                'pending_balance' => $status === 'paid' ? 0 : $a,
                'currency' => 'PEN',
                'due_date' => $due,
                'academic_period' => $period,
                'status' => $status,
                'paid_at' => $status === 'paid' ? $due->copy()->addDays($paidDaysLate ?? 0) : null,
                'origin' => 'import',
            ]);
        };

        // Ciclos que este alumno ya cursó según su año de carrera (los más
        // recientes del catálogo; el último es el ciclo en curso 2026-1).
        $myPeriods = array_slice($periods, -($careerYear * 2 - 1));
        $past = array_slice($myPeriods, 0, -1);
        $current = end($myPeriods);

        // Atraso que lleva el pago al TRAMO FINAL del ciclo (jun-jul / nov-dic):
        // vencimiento abril/setiembre + ~60-100 días.
        $eocDelay = fn () => random_int(60, 100);

        match ($profile) {
            // Historial impecable toda la carrera; el ciclo actual ya pagado o por vencer
            'puntual' => collect($past)->each(fn ($p) => $addDebt($p, 'paid', random_int(-10, 8)))
                && $addDebt($current, random_int(0, 1) ? 'paid' : 'pending', random_int(-5, 5)),
            // Siempre paga, pero al final del ciclo — toda su carrera
            'fin_de_ciclo' => collect($past)->each(fn ($p) => $addDebt($p, 'paid', $eocDelay()))
                && $addDebt($current, 'overdue'),
            // Paga con 20-40 días de atraso sistemático
            'demora_leve' => collect($past)->each(fn ($p) => $addDebt($p, 'paid', random_int(20, 40)))
                && $addDebt($current, random_int(0, 1) ? 'paid' : 'overdue', random_int(20, 40)),
            // Atrasos largos (50-90 días) toda la carrera
            'demora_cronica' => collect($past)->each(fn ($p) => $addDebt($p, 'paid', random_int(100, 150)))
                && $addDebt($current, 'overdue'),
            // Pagó al inicio de su carrera y luego dejó de pagar 2-4 ciclos
            'cronico' => collect(array_slice($past, 0, max(0, count($past) - 3)))
                ->each(fn ($p) => $addDebt($p, 'paid', random_int(10, 40)))
                && collect(array_slice($myPeriods, -min(count($myPeriods), random_int(2, 4))))
                    ->each(fn ($p) => $addDebt($p, 'overdue')),
            // Debe y ya no estudia
            'inactivo' => collect(array_slice($past, 0, max(0, count($past) - 2)))
                ->each(fn ($p) => $addDebt($p, 'paid', random_int(0, 30)))
                && collect(array_slice($myPeriods, -random_int(1, 3)))
                    ->each(fn ($p) => $addDebt($p, 'overdue')),
            // Buen historial, solo debe el ciclo actual
            'reciente' => collect($past)->each(fn ($p) => $addDebt($p, 'paid', random_int(0, 12)))
                && $addDebt($current, 'overdue'),
        };
    }
}
