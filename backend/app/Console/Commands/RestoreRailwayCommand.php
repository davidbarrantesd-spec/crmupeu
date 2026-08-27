<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

/**
 * Restauración de emergencia hacia el Postgres de Railway (2026-08: Neon agotó
 * su cuota y la red local bloquea todos los puertos salvo 443, así que el
 * respaldo viaja DENTRO del deploy y se ejecuta desde el propio contenedor,
 * que sí alcanza postgres.railway.internal).
 *
 * Idempotente: no toca una base que ya tenga datos (salvo --force).
 * Tras restaurar: limpia credenciales cifradas con el APP_KEY local
 * (indescifrables en producción) y crea el usuario admin de producción.
 */
class RestoreRailwayCommand extends Command
{
    protected $signature = 'crm:restore-railway {--force}';

    protected $description = 'Restaura el respaldo empaquetado hacia RESTORE_DB_URL (uso interno de emergencia)';

    public function handle(): int
    {
        $url = env('RESTORE_DB_URL');
        $file = database_path('railway-restore.sql');

        if (! $url) {
            $this->error('Falta RESTORE_DB_URL.');

            return self::FAILURE;
        }
        if (! is_file($file)) {
            $this->error('No existe el archivo de respaldo.');

            return self::FAILURE;
        }

        set_time_limit(600);
        $p = parse_url($url);
        $dsn = sprintf('pgsql:host=%s;port=%d;dbname=%s', $p['host'], $p['port'] ?? 5432, ltrim($p['path'], '/'));
        $pdo = new \PDO($dsn, $p['user'], urldecode($p['pass'] ?? ''), [\PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION]);

        // Guard de idempotencia
        $has = (bool) $pdo->query("select to_regclass('public.contacts')")->fetchColumn();
        if ($has && ! $this->option('force')) {
            $n = (int) $pdo->query('select count(*) from contacts')->fetchColumn();
            if ($n > 0) {
                $this->info("La base destino ya tiene {$n} contactos; nada que hacer (usa --force para reintentar).");

                return self::SUCCESS;
            }
        }

        $this->info('Ejecutando respaldo ('.round(filesize($file) / 1e6, 1).' MB)...');
        // Esquema limpio: una restauración a medias (deploy interrumpido,
        // migraciones previas) dejaría tablas duplicadas.
        $pdo->exec('drop schema public cascade; create schema public;');
        $pdo->exec(file_get_contents($file));

        // Credenciales del entorno local no sirven aquí (APP_KEY distinto).
        $pdo->exec('truncate integrations, personal_access_tokens restart identity cascade');

        // Usuario admin de producción
        $pass = env('RESTORE_ADMIN_PASSWORD');
        if ($pass) {
            $hash = password_hash($pass, PASSWORD_BCRYPT);
            $pdo->prepare("insert into users (uuid, name, email, password, status, created_at, updated_at)
                values (gen_random_uuid(), 'David Barrantes', 'claudedti.itam@upeu.edu.pe', ?, 'active', now(), now())
                on conflict (email) do update set password = excluded.password, status = 'active'")->execute([$hash]);
            $rid = $pdo->query("select id from roles where name = 'Superadministrador' limit 1")->fetchColumn();
            $uid = $pdo->query("select id from users where email = 'claudedti.itam@upeu.edu.pe'")->fetchColumn();
            if ($rid && $uid) {
                $pdo->prepare("insert into model_has_roles (role_id, model_type, model_id) values (?, 'App\\Models\\User', ?) on conflict do nothing")
                    ->execute([$rid, $uid]);
            }
        }

        $c = $pdo->query('select count(*) from contacts')->fetchColumn();
        $d = $pdo->query('select count(*) from debts')->fetchColumn();
        $this->info("Restauración completa: {$c} contactos, {$d} deudas.");

        return self::SUCCESS;
    }
}
