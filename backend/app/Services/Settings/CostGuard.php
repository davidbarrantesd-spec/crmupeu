<?php

namespace App\Services\Settings;

use App\Models\Call;
use App\Models\CostEntry;
use App\Models\SystemSetting;
use Illuminate\Validation\ValidationException;

/**
 * Controla límites de concurrencia, volumen diario y presupuesto.
 */
class CostGuard
{
    public function assertCallAllowed(): void
    {
        $dailyLimit = (int) SystemSetting::getValue('limits.call_daily_limit', config('services.limits.call_daily_limit'));
        $todayCalls = Call::whereDate('created_at', now()->toDateString())->count();

        if ($dailyLimit > 0 && $todayCalls >= $dailyLimit) {
            throw ValidationException::withMessages([
                'limit' => "Se alcanzó el límite diario de llamadas ({$dailyLimit}).",
            ]);
        }

        $budget = (float) SystemSetting::getValue('limits.monthly_budget', 0);
        if ($budget > 0) {
            $spent = (float) CostEntry::whereBetween('date', [now()->startOfMonth(), now()->endOfMonth()])->sum('amount');
            if ($spent >= $budget) {
                throw ValidationException::withMessages([
                    'limit' => 'Se alcanzó el presupuesto mensual configurado. Llamadas detenidas automáticamente.',
                ]);
            }
        }
    }

    public function maxConcurrency(?int $campaignLimit = null): int
    {
        $global = (int) SystemSetting::getValue('limits.call_max_concurrency', config('services.limits.call_max_concurrency'));

        return $campaignLimit ? min($global, $campaignLimit) : $global;
    }

    public function currentActiveCalls(): int
    {
        return Call::whereIn('status', Call::ACTIVE_STATUSES)->count();
    }
}
