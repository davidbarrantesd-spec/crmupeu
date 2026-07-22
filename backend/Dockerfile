# Backend — Laravel 12 (PHP 8.3+)
FROM php:8.3-fpm-alpine AS base

RUN apk add --no-cache postgresql-dev libzip-dev icu-dev oniguruma-dev libpng-dev supervisor \
    && docker-php-ext-install pdo_pgsql pgsql zip intl bcmath pcntl gd opcache \
    && apk add --no-cache $PHPIZE_DEPS && pecl install redis && docker-php-ext-enable redis \
    && apk del $PHPIZE_DEPS

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/html

COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist

COPY . .
RUN composer dump-autoload --optimize \
    && chown -R www-data:www-data storage bootstrap/cache

# --- Servidor web (php-fpm + artisan serve para despliegues simples) ---
FROM base AS web
EXPOSE 8000
CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8000"]

# --- Worker de colas ---
FROM base AS worker
CMD ["php", "artisan", "queue:work", "--tries=3", "--backoff=10", "--max-time=3600"]

# --- Scheduler ---
FROM base AS scheduler
CMD ["php", "artisan", "schedule:work"]

# --- Reverb (websockets) ---
FROM base AS reverb
EXPOSE 8081
CMD ["php", "artisan", "reverb:start", "--host=0.0.0.0", "--port=8081"]
