<?php

use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('calls', fn ($user) => $user->isActive() && $user->can('calls.view'));

Broadcast::channel('conversations', fn ($user) => $user->isActive() && $user->can('whatsapp.view'));

Broadcast::channel('campaigns.{uuid}', fn ($user) => $user->isActive() && $user->can('campaigns.view'));
