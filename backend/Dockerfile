# Backend — Laravel 12 sobre FrankenPHP (Caddy + PHP embebido).
# Una sola imagen para los 4 servicios de Railway; cada servicio sobreescribe
# el startCommand (ver docs/DEPLOYMENT.md):
#   api        → CMD por defecto (servidor web, concurrente)
#   worker     → php artisan queue:work
#   scheduler  → php artisan schedule:work
#   reverb     → php artisan reverb:start
# PHP 8.4: composer.lock fija Symfony 8.1, que requiere >= 8.4.1.
FROM dunglas/frankenphp:1-php8.4

# Extensiones requeridas por la aplicación.
RUN install-php-extensions \
        pdo_pgsql \
        pgsql \
        redis \
        zip \
        intl \
        bcmath \
        pcntl \
        gd \
        opcache

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app

# Capa de dependencias cacheable: solo se reconstruye si cambian los manifiestos.
COPY composer.json composer.lock ./
RUN composer install \
        --no-dev \
        --no-scripts \
        --no-autoloader \
        --prefer-dist \
        --no-interaction

COPY . .

RUN composer dump-autoload --optimize --no-dev --no-interaction \
    && mkdir -p storage/framework/{cache,sessions,views} storage/logs bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache

# FrankenPHP sirve desde public/. Railway inyecta PORT en tiempo de ejecución,
# por eso SERVER_NAME se resuelve en el CMD y no como ENV fijo.
EXPOSE 8000

CMD ["sh", "-c", "php artisan config:cache && php artisan route:cache && SERVER_NAME=\":${PORT:-8000}\" frankenphp run --config /etc/caddy/Caddyfile"]
