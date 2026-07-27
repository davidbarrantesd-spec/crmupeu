<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withBroadcasting(
        __DIR__.'/../routes/channels.php',
        ['prefix' => '', 'middleware' => ['auth:sanctum']],
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Detrás del proxy de Railway/Vercel hay que confiar en los headers
        // X-Forwarded-*; si no, request()->isSecure() da false y route() genera
        // URLs http:// en los webhooks que se envían a Twilio.
        $middleware->trustProxies(at: '*');

        $middleware->alias([
            'role' => \Spatie\Permission\Middleware\RoleMiddleware::class,
            'permission' => \Spatie\Permission\Middleware\PermissionMiddleware::class,
            'twilio.signature' => \App\Http\Middleware\VerifyTwilioSignature::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->is('broadcasting/*'),
        );

        // El API nunca devuelve errores técnicos crudos: todo mensaje que
        // llega a la interfaz es un aviso claro en español. Los aborts con
        // mensaje propio (ya en español) se respetan; los defaults en inglés
        // de Laravel/Symfony se traducen. El log interno conserva el detalle.
        $exceptions->render(function (Throwable $e, Request $request) {
            if (! ($request->is('api/*') || $request->is('broadcasting/*'))) {
                return null;
            }

            if ($e instanceof \Illuminate\Validation\ValidationException) {
                return null; // 422 con los mensajes de lang/es/validation.php
            }

            if ($e instanceof \Illuminate\Auth\AuthenticationException) {
                return response()->json(['message' => 'Tu sesión expiró. Vuelve a iniciar sesión.'], 401);
            }

            if ($e instanceof \Illuminate\Auth\Access\AuthorizationException
                || $e instanceof \Spatie\Permission\Exceptions\UnauthorizedException) {
                return response()->json(['message' => 'No tienes permiso para realizar esta acción.'], 403);
            }

            if ($e instanceof \Illuminate\Database\Eloquent\ModelNotFoundException
                || $e instanceof \Symfony\Component\HttpKernel\Exception\NotFoundHttpException) {
                return response()->json(['message' => 'No encontramos lo que buscas. Puede que haya sido eliminado.'], 404);
            }

            if ($e instanceof \Illuminate\Http\Exceptions\ThrottleRequestsException) {
                return response()->json(['message' => 'Demasiadas solicitudes seguidas. Espera unos segundos e inténtalo de nuevo.'], 429);
            }

            if ($e instanceof \Symfony\Component\HttpKernel\Exception\HttpException) {
                $message = trim($e->getMessage());
                $defaults = ['', 'Forbidden', 'This action is unauthorized.', 'Unauthorized', 'Bad Request', 'Not Found'];

                if (in_array($message, $defaults, true)) {
                    $message = match (true) {
                        $e->getStatusCode() === 403 => 'No tienes permiso para realizar esta acción.',
                        $e->getStatusCode() === 404 => 'No encontramos lo que buscas.',
                        default => 'No se pudo procesar la solicitud.',
                    };
                }

                return response()->json(['message' => $message], $e->getStatusCode());
            }

            // Cualquier otra excepción = error interno. El detalle queda en el
            // log del servidor; el usuario recibe un aviso humano.
            return response()->json([
                'message' => 'Ocurrió un problema en el servidor. Inténtalo de nuevo en unos minutos; si persiste, avisa al administrador.',
            ], 500);
        });
    })->create();
