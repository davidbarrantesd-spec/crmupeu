<?php

return [
    'paths' => ['api/*', 'broadcasting/auth'],

    'allowed_methods' => ['*'],

    // El frontend se sirve desde el dominio propio y, de respaldo, desde el
    // alias de Vercel. FRONTEND_URL_ALT permite añadir el segundo (o cualquier
    // otro origen extra) sin abrir CORS a '*'.
    'allowed_origins' => array_values(array_unique(array_filter([
        env('FRONTEND_URL', 'http://localhost:5173'),
        env('FRONTEND_URL_ALT'),
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:5199',
        'http://127.0.0.1:5199',
    ]))),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => ['Content-Disposition'],

    'max_age' => 3600,

    'supports_credentials' => false,
];
