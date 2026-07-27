<?php

/**
 * Mensajes de validación en español. Sin este archivo, Laravel devuelve la
 * clave cruda ("validation.required") en las respuestas 422 y la interfaz
 * muestra ese texto críptico al usuario.
 */
return [
    'required' => 'El campo :attribute es obligatorio.',
    'required_if' => 'El campo :attribute es obligatorio.',
    'string' => 'El campo :attribute debe ser texto.',
    'numeric' => 'El campo :attribute debe ser un número.',
    'integer' => 'El campo :attribute debe ser un número entero.',
    'boolean' => 'El campo :attribute debe ser verdadero o falso.',
    'date' => 'El campo :attribute debe ser una fecha válida.',
    'email' => 'El campo :attribute debe ser un correo válido.',
    'uuid' => 'El campo :attribute no es válido.',
    'array' => 'El campo :attribute debe ser una lista.',
    'in' => 'El valor de :attribute no está permitido.',
    'exists' => 'El :attribute seleccionado no existe.',
    'unique' => 'El :attribute ya está registrado.',
    'prohibited' => 'El campo :attribute no se puede modificar.',
    'regex' => 'El formato de :attribute no es válido.',
    'url' => 'El campo :attribute debe ser una URL válida.',
    'min' => [
        'numeric' => 'El campo :attribute debe ser al menos :min.',
        'string' => 'El campo :attribute debe tener al menos :min caracteres.',
        'array' => 'El campo :attribute debe tener al menos :min elementos.',
    ],
    'max' => [
        'numeric' => 'El campo :attribute no debe ser mayor que :max.',
        'string' => 'El campo :attribute no debe superar :max caracteres.',
        'array' => 'El campo :attribute no debe tener más de :max elementos.',
    ],
    'size' => [
        'string' => 'El campo :attribute debe tener exactamente :size caracteres.',
    ],

    'attributes' => [
        'code' => 'código',
        'concept' => 'concepto',
        'original_amount' => 'monto original',
        'pending_balance' => 'saldo pendiente',
        'currency' => 'moneda',
        'due_date' => 'fecha de vencimiento',
        'academic_period' => 'periodo académico',
        'status' => 'estado',
        'contact_uuid' => 'contacto',
        'first_name' => 'nombres',
        'last_name' => 'apellidos',
        'phone' => 'teléfono',
        'email' => 'correo',
        'dni' => 'DNI',
        'name' => 'nombre',
        'password' => 'contraseña',
        'roles' => 'roles',
        'tts_message' => 'mensaje',
        'prompt_version_uuid' => 'prompt de IA',
        'segment_filters' => 'filtros de segmentación',
        'id_persona' => 'ID persona',
        'student_code' => 'código de estudiante',
    ],
];
