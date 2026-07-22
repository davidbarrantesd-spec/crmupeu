<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\LoginAudit;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('email', $data['email'])->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            LoginAudit::record('failed', $data['email'], $user?->id);

            throw ValidationException::withMessages(['email' => 'Credenciales incorrectas.']);
        }

        if (! $user->isActive()) {
            LoginAudit::record('failed', $data['email'], $user->id);

            throw ValidationException::withMessages(['email' => 'El usuario está inactivo.']);
        }

        $user->forceFill(['last_login_at' => now()])->save();
        LoginAudit::record('login', $user->email, $user->id);

        $token = $user->createToken('api', ['*'], now()->addHours(12))->plainTextToken;

        return response()->json([
            'data' => [
                'token' => $token,
                'user' => new UserResource($user),
            ],
        ]);
    }

    public function logout(Request $request)
    {
        LoginAudit::record('logout', $request->user()->email, $request->user()->id);
        $request->user()->currentAccessToken()->delete();

        return response()->json(['data' => ['message' => 'Sesión cerrada.']]);
    }

    public function me(Request $request)
    {
        return new UserResource($request->user());
    }

    public function forgotPassword(Request $request)
    {
        $request->validate(['email' => ['required', 'email']]);

        // Respuesta idéntica exista o no el usuario (evita enumeración).
        Password::sendResetLink($request->only('email'));

        return response()->json(['data' => ['message' => 'Si el correo existe, se envió un enlace de recuperación.']]);
    }

    public function resetPassword(Request $request)
    {
        $request->validate([
            'token' => ['required'],
            'email' => ['required', 'email'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $status = Password::reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function (User $user, string $password) {
                $user->forceFill(['password' => $password])->save();
                $user->tokens()->delete();
                LoginAudit::record('password_reset', $user->email, $user->id);
            }
        );

        if ($status !== Password::PASSWORD_RESET) {
            throw ValidationException::withMessages(['email' => __($status)]);
        }

        return response()->json(['data' => ['message' => 'Contraseña restablecida.']]);
    }

    public function changePassword(Request $request)
    {
        $data = $request->validate([
            'current_password' => ['required', 'current_password'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $request->user()->forceFill(['password' => $data['password']])->save();
        LoginAudit::record('password_change', $request->user()->email, $request->user()->id);

        return response()->json(['data' => ['message' => 'Contraseña actualizada.']]);
    }
}
