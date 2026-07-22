<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\Request;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

class RoleController extends Controller
{
    public function index()
    {
        $roles = Role::with('permissions')->get()->map(fn ($role) => [
            'id' => $role->id,
            'name' => $role->name,
            'permissions' => $role->permissions->pluck('name'),
            'users_count' => $role->users()->count(),
        ]);

        return response()->json(['data' => $roles]);
    }

    public function permissions()
    {
        $grouped = Permission::all()
            ->groupBy(fn ($p) => explode('.', $p->name)[0])
            ->map(fn ($group) => $group->pluck('name'));

        return response()->json(['data' => $grouped]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:60', 'unique:roles,name'],
            'permissions' => ['array'],
            'permissions.*' => ['string', 'exists:permissions,name'],
        ]);

        $role = Role::create(['name' => $data['name'], 'guard_name' => 'web']);
        $role->syncPermissions($data['permissions'] ?? []);

        AuditLog::record('created', 'roles', null, ['new_values' => $data]);

        return response()->json(['data' => ['id' => $role->id, 'name' => $role->name]], 201);
    }

    public function update(Request $request, Role $role)
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:60'],
            'permissions' => ['sometimes', 'array'],
            'permissions.*' => ['string', 'exists:permissions,name'],
        ]);

        $old = ['name' => $role->name, 'permissions' => $role->permissions->pluck('name')];

        if (isset($data['name']) && $role->name !== 'Superadministrador') {
            $role->update(['name' => $data['name']]);
        }

        if (isset($data['permissions'])) {
            $role->syncPermissions($data['permissions']);
        }

        AuditLog::record('updated', 'roles', null, [
            'old_values' => $old,
            'new_values' => ['name' => $role->name, 'permissions' => $role->fresh()->permissions->pluck('name')],
        ]);

        return response()->json(['data' => ['id' => $role->id, 'name' => $role->name]]);
    }

    public function destroy(Role $role)
    {
        abort_if(in_array($role->name, ['Superadministrador']), 422, 'Este rol no se puede eliminar.');
        abort_if($role->users()->exists(), 422, 'El rol tiene usuarios asignados.');

        $role->delete();
        AuditLog::record('deleted', 'roles', null, ['old_values' => ['name' => $role->name]]);

        return response()->json(['data' => ['message' => 'Rol eliminado.']]);
    }
}
