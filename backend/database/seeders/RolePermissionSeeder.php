<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class RolePermissionSeeder extends Seeder
{
    public function run(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $modules = [
            'dashboard' => ['view'],
            'users' => ['view', 'create', 'edit', 'delete'],
            'roles' => ['view', 'create', 'edit', 'delete'],
            'contacts' => ['view', 'create', 'edit', 'delete', 'export'],
            'debts' => ['view', 'create', 'edit', 'delete'],
            'campaigns' => ['view', 'create', 'edit', 'delete', 'launch'],
            'calls' => ['view', 'create', 'edit'],
            'prompts' => ['view', 'edit'],
            'agreements' => ['view', 'create', 'edit', 'delete'],
            'follow_ups' => ['view', 'create', 'edit'],
            'whatsapp' => ['view', 'reply'],
            'templates' => ['view', 'edit'],
            'reports' => ['view'],
            'audit' => ['view'],
            'settings' => ['view', 'edit'],
            'recordings' => ['listen'],
            'transcriptions' => ['view'],
            'finance' => ['view'],
        ];

        $all = [];
        foreach ($modules as $module => $actions) {
            foreach ($actions as $action) {
                $all[] = "{$module}.{$action}";
                Permission::findOrCreate("{$module}.{$action}", 'web');
            }
        }

        $roles = [
            'Superadministrador' => $all,

            'Administrador' => array_values(array_diff($all, ['roles.delete'])),

            'Supervisor' => [
                'dashboard.view',
                'contacts.view', 'contacts.create', 'contacts.edit', 'contacts.export',
                'debts.view', 'debts.create', 'debts.edit',
                'campaigns.view', 'campaigns.create', 'campaigns.edit', 'campaigns.launch',
                'calls.view', 'calls.create', 'calls.edit',
                'prompts.view', 'prompts.edit',
                'agreements.view', 'agreements.create', 'agreements.edit',
                'follow_ups.view', 'follow_ups.create', 'follow_ups.edit',
                'whatsapp.view', 'whatsapp.reply',
                'templates.view', 'templates.edit',
                'reports.view', 'recordings.listen', 'transcriptions.view', 'finance.view',
            ],

            'Asesor' => [
                'dashboard.view',
                'contacts.view', 'contacts.edit',
                'debts.view',
                'campaigns.view',
                'calls.view', 'calls.create',
                'agreements.view', 'agreements.create', 'agreements.edit',
                'follow_ups.view', 'follow_ups.edit',
                'whatsapp.view', 'whatsapp.reply',
                'templates.view',
                'recordings.listen', 'transcriptions.view',
            ],

            'Auditor' => [
                'dashboard.view', 'contacts.view', 'debts.view', 'campaigns.view',
                'calls.view', 'agreements.view', 'follow_ups.view', 'whatsapp.view',
                'reports.view', 'audit.view', 'recordings.listen', 'transcriptions.view', 'finance.view',
            ],

            'Solo lectura' => [
                'dashboard.view', 'contacts.view', 'debts.view', 'campaigns.view',
                'calls.view', 'agreements.view', 'follow_ups.view', 'reports.view',
            ],
        ];

        foreach ($roles as $name => $permissions) {
            $role = Role::findOrCreate($name, 'web');
            $role->syncPermissions($permissions);
        }
    }
}
