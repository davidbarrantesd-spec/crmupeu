<?php

use Illuminate\Support\Facades\Schedule;

Schedule::command('crm:tick')->everyMinute()->withoutOverlapping();
Schedule::command('queue:prune-failed --hours=168')->daily();
Schedule::command('sanctum:prune-expired --hours=24')->daily();
