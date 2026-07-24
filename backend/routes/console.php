<?php

use Illuminate\Support\Facades\Schedule;

Schedule::command('crm:tick')->everyMinute()->withoutOverlapping();
Schedule::command('crm:segment')->dailyAt('03:00')->withoutOverlapping();
Schedule::command('crm:sync-lamb')->everyThirtyMinutes()->withoutOverlapping();
Schedule::command('queue:prune-failed --hours=168')->daily();
Schedule::command('sanctum:prune-expired --hours=24')->daily();
