# Manual de usuario básico

## Ingreso
Entre a la plataforma con su correo y contraseña. Si la olvidó, use "¿Olvidó su contraseña?".
Su rol (Superadministrador, Administrador, Supervisor, Asesor, Auditor o Solo lectura) determina
qué módulos y botones ve.

## 1. Cargar personas con deuda
- **Individual**: Contactos → Nuevo. Complete nombre, DNI, teléfono (se valida y normaliza) y consentimientos.
- **Masiva**: Contactos → Importar → suba su Excel/CSV → revise el mapeo sugerido de columnas →
  confirme. El proceso corre en segundo plano; al final verá creados/actualizados/duplicados/errores
  y podrá descargar las filas con error. Para deudas use el mismo asistente con tipo "Deudas"
  (se cruzan por DNI o teléfono).

## 2. Crear una campaña de llamadas
Campañas → Nueva campaña (asistente):
1. **Datos**: nombre, tipo (audio grabado / texto a voz / IA conversacional / WhatsApp), horario y
   días permitidos, reintentos.
2. **Segmentación**: filtre por monto, mora, estado de deuda, ciudad, etiquetas, resultado de campaña
   anterior… y presione **Vista previa** para ver cuántas personas entran.
3. **Contenido**:
   - *Audio*: suba un MP3/WAV y configure "presione 1/2/3".
   - *Texto a voz*: escriba el mensaje insertando variables como `{{nombre}}` o `{{saldo}}`.
   - *IA*: elija el prompt publicado, la voz y los mensajes de saludo/despedida.
4. **Reglas**: qué hacer si no contesta, si promete pagar, límite de presupuesto.
5. **Lanzar** ahora, **Programar** para una fecha, o guardar como borrador.

Durante la ejecución puede **pausar, reanudar o cancelar**, ver el avance en tiempo real y hacer una
**llamada de prueba** antes del envío masivo.

## 3. Configurar el agente de IA
Prompts IA → Nuevo. Defina el prompt del sistema, instrucciones, preguntas frecuentes autorizadas,
herramientas habilitadas y reglas de seguridad. Use el **simulador** (botón Probar) para chatear con
el agente como si fuera el deudor antes de publicar. Cada cambio crea una **versión**; solo la
versión publicada se usa en campañas y siempre puede restaurar una anterior.

## 4. Resultados de llamadas
Llamadas: filtre por campaña, estado o resultado. En el detalle verá los eventos, la **grabación**
(si tiene permiso), la **transcripción**, el **resumen** y el resultado estructurado (por ejemplo,
compromiso de pago con fecha y monto). También puede llamar manualmente desde la ficha del contacto
con el botón **Llamar**.

## 5. Acuerdos y seguimientos
Los compromisos de pago se registran automáticamente (llamadas IA) o manualmente. El sistema programa
la verificación al día siguiente del compromiso; si no se cumple, el acuerdo pasa a **Incumplido** y
las reglas generan una nueva gestión. En Seguimientos verá su cola de tareas: complétela indicando
el resultado.

## 6. WhatsApp
La bandeja funciona como WhatsApp Web: conversaciones a la izquierda, chat al centro y la ficha del
contacto (deudas, acuerdos, llamadas) a la derecha. Los mensajes muestran ✓ enviado, ✓✓ entregado y
✓✓ azul leído. El indicador de **ventana de 24 horas** le avisa si puede escribir libremente o si
debe usar una **plantilla aprobada**. Puede asignar, transferir, priorizar, cerrar y reabrir
conversaciones, y agregar notas internas.

## 7. Reportes y panel
El Panel muestra los indicadores del período (tasa de contacto, acuerdos, recuperación estimada,
costos) y gráficos por día, campaña y asesor. En Reportes puede filtrar y **exportar a CSV/Excel**.

## 8. Administración
- **Usuarios y Roles**: cree asesores y ajuste permisos por módulo y acción.
- **Configuración → Integraciones**: credenciales de Twilio, WhatsApp y OpenAI (se guardan cifradas;
  use "Verificar" para probarlas).
- **Costos y límites**: presupuesto máximo, límite diario de llamadas y concurrencia. Al superar el
  presupuesto las campañas se pausan solas.
- **Auditoría**: historial de quién hizo qué, con valores anteriores y nuevos.
