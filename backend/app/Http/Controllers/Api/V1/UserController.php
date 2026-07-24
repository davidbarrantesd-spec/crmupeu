<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    public function index(Request $request)
    {
        $users = User::query()
            ->when($request->search, fn ($q, $s) => $q->where(fn ($q2) => $q2
                ->where('name', 'ilike', "%{$s}%")->orWhere('email', 'ilike', "%{$s}%")))
            ->when($request->status, fn ($q, $status) => $q->where('status', $status))
            ->when($request->role, fn ($q, $role) => $q->role($role))
            ->orderBy('name')
            ->paginate($request->integer('per_page', 15));

        return UserResource::collection($users);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'unique:users,email'],
            'phone' => ['nullable', 'string', 'max:30'],
            'password' => ['required', 'string', 'min:8'],
            'status' => ['sometimes', Rule::in(['active', 'inactive'])],
            'roles' => ['required', 'array', 'min:1'],
            'roles.*' => ['string', 'exists:roles,name'],
            'scopes' => ['sometimes', 'array'],
            'scopes.*.campus_id' => ['nullable', 'integer', 'exists:campuses,id'],
            'scopes.*.faculty_id' => ['nullable', 'integer', 'exists:faculties,id'],
            'scopes.*.career_id' => ['nullable', 'integer', 'exists:careers,id'],
        ]);

        $user = User::create(collect($data)->except(['roles', 'scopes'])->all());
        $user->syncRoles($data['roles']);
        $this->syncScopes($user, $data['scopes'] ?? null);

        AuditLog::record('created', 'users', $user, ['new_values' => ['email' => $user->email, 'roles' => $data['roles']]]);

        return (new UserResource($user))->response()->setStatusCode(201);
    }

    public function show(User $user)
    {
        return new UserResource($user);
    }

    public function update(Request $request, User $user)
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'email' => ['sometimes', 'email', Rule::unique('users', 'email')->ignore($user->id)],
            'phone' => ['nullable', 'string', 'max:30'],
            'password' => ['sometimes', 'nullable', 'string', 'min:8'],
            'status' => ['sometimes', Rule::in(['active', 'inactive'])],
            'roles' => ['sometimes', 'array'],
            'roles.*' => ['string', 'exists:roles,name'],
            'scopes' => ['sometimes', 'array'],
            'scopes.*.campus_id' => ['nullable', 'integer', 'exists:campuses,id'],
            'scopes.*.faculty_id' => ['nullable', 'integer', 'exists:faculties,id'],
            'scopes.*.career_id' => ['nullable', 'integer', 'exists:careers,id'],
        ]);

        $old = ['roles' => $user->getRoleNames(), 'status' => $user->status];

        if (empty($data['password'])) {
            unset($data['password']);
        }

        $user->update(collect($data)->except(['roles', 'scopes'])->all());

        if (array_key_exists('scopes', $data)) {
            $this->syncScopes($user, $data['scopes']);
        }

        if (isset($data['roles'])) {
            $user->syncRoles($data['roles']);
        }

        if ($user->status === 'inactive') {
            $user->tokens()->delete();
        }

        AuditLog::record('updated', 'users', $user, [
            'old_values' => $old,
            'new_values' => ['roles' => $user->getRoleNames(), 'status' => $user->status],
        ]);

        return new UserResource($user);
    }

    public function destroy(User $user)
    {
        abort_if($user->id === auth()->id(), 422, 'No puedes eliminar tu propio usuario.');

        $user->tokens()->delete();
        $user->delete();
        AuditLog::record('deleted', 'users', $user);

        return response()->json(['data' => ['message' => 'Usuario eliminado.']]);
    }

    /**
     * Reemplaza el alcance académico completo del usuario. Filas con los tres
     * campos en null se descartan (equivaldrían a acceso global explícito,
     * que se representa con CERO filas).
     */
    protected function syncScopes(User $user, ?array $scopes): void
    {
        if ($scopes === null) {
            return;
        }

        $user->scopes()->delete();

        foreach ($scopes as $scope) {
            $row = array_filter([
                'campus_id' => $scope['campus_id'] ?? null,
                'faculty_id' => $scope['faculty_id'] ?? null,
                'career_id' => $scope['career_id'] ?? null,
            ]);

            if ($row !== []) {
                $user->scopes()->create($row);
            }
        }
    }
}
