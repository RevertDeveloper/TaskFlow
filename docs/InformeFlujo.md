# TaskFlow - Informe del flujo de la aplicacion

## 1. Que es TaskFlow

TaskFlow es un gestor personal de tareas pensado para capturar algo en pocos segundos y continuar trabajando. Permite crear tareas escribiendolas o dictandolas, organizarlas en listas y consultar por separado lo que esta pendiente y lo que ya se ha terminado.

La pantalla principal siempre prioriza las tareas pendientes. El historial conserva las tareas completadas y los cambios importantes, pero no compite visualmente con el trabajo que queda por hacer.

## 2. Entrada y acceso

La persona entra en TaskFlow desde su navegador o desde la PWA instalada.

- Si ya tiene una sesion activa en Carlos Revert Accounts, TaskFlow la reconoce automaticamente.
- Si no esta autenticada, puede iniciar sesion, registrarse o verificar su correo desde los flujos delegados a Accounts.
- TaskFlow no crea ni administra una segunda contrasena. La cuenta, la sesion, el bloqueo y la verificacion del correo pertenecen a Accounts.
- Si la sesion caduca, la cuenta esta bloqueada o Accounts no esta disponible, TaskFlow evita mostrar datos privados y presenta un estado recuperable.
- Cerrar la sesion la cierra para el conjunto de aplicaciones que usan Accounts, no solo para TaskFlow.

Una vez identificada la persona, todas sus listas, tareas, historial, borradores de voz y operaciones pendientes quedan asociados a su cuenta. Nunca se acepta como identidad un usuario escrito en un formulario, una URL o una cabecera del navegador.

## 3. La pantalla principal

Al acceder, TaskFlow muestra un espacio de trabajo con:

- las listas disponibles;
- la Inbox, que existe siempre y sirve como destino predeterminado;
- las tareas pendientes agrupadas por lista;
- el numero de tareas pendientes;
- el acceso al historial;
- el estado de almacenamiento y sincronizacion cuando corresponda.

La navegacion se adapta a ordenador, tablet y movil. En movil se puede cambiar de seccion con la navegacion inferior y recorrer las listas con controles tactiles.

## 4. Crear y organizar tareas manualmente

El flujo habitual es deliberadamente corto:

1. La persona escribe el titulo en la captura rapida.
2. Pulsa Enter o el boton de crear.
3. La tarea aparece inmediatamente como pendiente en Inbox.
4. Si lo desea, abre la tarea para completar la descripcion, cambiarla de lista o editar el titulo.

No es obligatorio escoger una lista ni escribir una descripcion para crearla. La interfaz ofrece una respuesta inmediata y, si la operacion remota falla, deshace el cambio visual o permite reintentarlo sin perder el control.

Tambien se pueden crear, editar, archivar, restaurar y eliminar listas. Inbox esta protegida: no se puede eliminar ni archivar. Al eliminar una lista normal, sus tareas vuelven a Inbox en lugar de desaparecer.

Sobre cada tarea se puede:

- editar el titulo o la descripcion;
- moverla a otra lista;
- marcarla como completada;
- reabrirla si vuelve a estar pendiente;
- eliminarla logicamente con confirmacion.

Completar una tarea no borra su informacion. Reabrirla la devuelve a pendientes y elimina su fecha de finalizacion. Cada cambio importante deja una entrada interna de historial para que el recorrido de la tarea pueda reconstruirse.

## 5. Historial

El historial muestra las tareas completadas y los cambios realizados, ordenados de forma estable y paginada. Se puede consultar de forma global o filtrado por lista.

Desde el historial se puede reabrir una tarea completada. Las tareas pendientes no se mezclan con esta vista, por lo que la pantalla principal sigue siendo una lista de trabajo y no un registro de actividad.

## 6. Donde se guardan los datos

TaskFlow ofrece dos modos de trabajo:

### Cloud

Los datos principales se guardan en la cuenta remota. El navegador mantiene una copia local para que la interfaz responda con rapidez y pueda conservar cambios pendientes si la conexion se interrumpe.

La copia local no sustituye a la cuenta remota: el servidor es la referencia principal. La interfaz indica si los datos estan sincronizados, se estan enviando, estan pendientes o son antiguos.

### Device

Los datos se guardan en el dispositivo y se puede trabajar sin conexion. En este modo los cambios permanecen locales y no se envian a la nube hasta que la persona decida volver a Cloud y complete el proceso de transferencia.

La experiencia de crear, editar, completar y consultar tareas es la misma en ambos modos. Lo que cambia es donde reside la informacion y si existe sincronizacion remota.

## 7. Cambio entre Cloud y Device

Cambiar de modo no es un simple interruptor. Antes de activarlo, TaskFlow prepara una copia de los datos, comprueba su estructura, cantidades e integridad y, cuando es necesario, combina los cambios.

- De Cloud a Device: descarga los datos remotos, los verifica y solo entonces activa el modo local.
- De Device a Cloud: revisa los datos locales, los envia, resuelve los cambios incompatibles y descarga el resultado final antes de activar Cloud.
- Si algo falla durante la transferencia, se conserva el modo anterior y sus datos.

Los reinicios estan separados para evitar errores: se puede borrar la informacion local del dispositivo, borrar los datos de TaskFlow en la nube o cerrar la cuenta de Accounts. Un reinicio local o cloud nunca elimina la cuenta de identidad.

## 8. Trabajo sin conexion y sincronizacion

La PWA permite continuar usando la aplicacion cuando la red es lenta o no existe. Las acciones locales se guardan junto con una cola de operaciones pendientes. Al recuperar la conexion, TaskFlow las envia automaticamente, reintenta los fallos transitorios y evita duplicar una misma accion.

La sincronizacion puede recibir cambios de varios dispositivos. Si dos dispositivos modifican la misma tarea, se aplica una regla determinista basada en la version mas reciente del servidor. Las eliminaciones tambien se conservan como marcas de borrado para que una copia antigua no haga reaparecer una tarea.

La persona ve el estado del proceso, pero no necesita gestionar cursores, reintentos ni lotes. Si un cambio no puede aceptarse, se informa del error y se conserva una ruta de recuperacion en lugar de ocultar una perdida.

## 9. Crear tareas con la voz

La voz sigue un flujo separado porque necesita procesamiento adicional:

1. La persona concede permiso al microfono y graba una entrada.
2. Puede cancelar la grabacion; existen limites de duracion y tamano.
3. El audio se envia temporalmente para obtener una transcripcion.
4. El sistema transforma la transcripcion en uno o varios borradores de tarea.
5. Propone una lista usando, por este orden, una lista indicada expresamente, el contexto, la clasificacion y, como ultimo recurso, Inbox.
6. La persona revisa el resultado antes de crear nada.
7. Puede editar titulos y descripciones, cambiar listas, eliminar borradores o crear solo los seleccionados.
8. Al confirmar, TaskFlow crea las tareas y sus eventos de forma controlada, evitando duplicarlas si se pulsa dos veces.

La IA nunca crea directamente tareas a partir de una respuesta sin validar. Tampoco crea listas inventadas. Si la transcripcion es ambigua, la respuesta no es valida, la lista ya no existe o el proveedor falla, el borrador queda en revision o se muestra un error recuperable.

El audio original es temporal y se elimina despues de la transcripcion por defecto. La voz necesita conexion con el backend; no se promete voz offline en el MVP.

## 10. Lo que ocurre automaticamente

Sin que la persona tenga que gestionarlo, TaskFlow:

- comprueba la sesion y evita mezclar datos entre cuentas;
- asigna cada dato a su propietario;
- crea Inbox cuando es necesario y la mantiene protegida;
- registra los eventos relevantes sin guardar audio, contrasenas, cookies, prompts ni respuestas privadas de IA;
- mantiene una copia local cuando el modo lo permite;
- encola, reintenta y deduplica cambios pendientes;
- valida los datos recibidos antes de guardarlos;
- controla los limites de voz y el consumo de operaciones de IA;
- muestra estados de carga, sincronizacion, error y recuperacion;
- conserva copias de seguridad cloud y procedimientos de restauracion en produccion.

Las operaciones manuales no consumen cuota de IA. Las operaciones de transcripcion y extraccion inteligente si deben autorizarse antes de ejecutarse; si la cuota no esta disponible o Accounts no responde, el procesamiento se detiene de forma segura.

## 11. Privacidad y fallos

La aplicacion esta diseñada para fallar de forma visible y conservadora. Una cuenta sin acceso no ve tareas antiguas de otra persona; un cambio fallido no se presenta como guardado; una importacion incompleta no activa el nuevo modo; y una salida de IA dudosa no se convierte automaticamente en una tarea.

Las credenciales de proveedores y la clave interna de Accounts permanecen en el backend. El navegador solo recibe la informacion necesaria para usar la aplicacion. La cache, los registros y el audio temporal tienen politicas que evitan convertir datos privados en informacion publica o permanente.

## 12. Alcance inicial

El MVP cubre captura manual, listas, pendientes, completado y reapertura, historial, Cloud, Device, sincronizacion, PWA offline y flujo de voz con revision.

Quedan para una fase posterior las prioridades, fechas y recordatorios avanzados, tareas recurrentes, etiquetas, subtareas, calendario, adjuntos, busqueda semantica, IA local offline y colaboracion entre varias personas. Estas funciones no se asumen ni se crean automaticamente por adelantado.
