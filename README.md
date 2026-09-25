# LIA · Asistente Académica Inteligente

Primera versión funcional de una aplicación web académica para la asignatura **Tecnologías de la Información** de la **Licenciatura en Administración**.

## Estructura

- `index.html`: estructura semántica de la interfaz.
- `css/lia.css`: identidad visual, animaciones y adaptación responsive.
- `js/lia.js`: interacción del chat, menú móvil, saludo animado y lectura del catálogo.
- `admin/index.html`: panel docente para gestionar materias y fuentes.
- `css/admin.css`: estilos del panel de administración.
- `js/admin.js`: gestión del catálogo mediante la API local, con respaldo en el navegador.
- `data/catalogo.js`: materias y fuentes iniciales de LIA.
- `server/server.js`: servidor web y API local sin dependencias externas.
- `server/data/catalog.json`: almacenamiento permanente de materias y fuentes.
- `server/data/catalog.example.json`: catálogo de muestra utilizado al instalar LIA.
- `login.html`, `css/login.css` y `js/login.js`: acceso protegido al panel docente.
- `railway.json`: configuración de despliegue para Railway.
- `package.json`: comandos para iniciar y comprobar el proyecto.
- `assets/logo-lia.png`: logotipo oficial proporcionado para LIA.
- `assets/avatar-lia.png`: retrato proporcionado para representar a LIA.
- `assets/materiales/`: documentos académicos disponibles en la biblioteca.

## Cómo probarla

La forma recomendada es iniciar el servidor local. Abre PowerShell en la carpeta `LIA` y ejecuta:

```powershell
npm start
```

Después visita `http://127.0.0.1:4173` en un navegador moderno. Desde el menú puedes entrar en **Administración docente** para agregar materias, páginas web, videos y otras fuentes. Los cambios se guardarán en `server/data/catalog.json` y estarán disponibles para todos los navegadores que usen ese servidor.

Antes de iniciar el servidor, configura `LIA_ADMIN_USER`, `LIA_ADMIN_PASSWORD` y `LIA_SESSION_SECRET` como variables de entorno. Consulta `.env.example`; las credenciales reales nunca deben agregarse al repositorio.

Para validar sintaxis y ejecutar la prueba de seguridad antes de publicar:

```powershell
npm run check
npm test
```

El servidor solo publica la interfaz, los estilos, los scripts y los materiales autorizados. Archivos como `.env`, `.git`, `package.json`, el código del servidor y el catálogo interno no son accesibles por URL.

También puedes abrir `index.html` directamente. En ese caso, LIA activa el modo de respaldo y guarda los cambios únicamente en `localStorage` del navegador.

## Personalización pendiente

El logotipo transparente y el retrato oficial de LIA ya están integrados. Para futuras actualizaciones, basta con sustituir los archivos correspondientes conservando sus nombres.

## Alcance de esta versión

El chat se conecta a la API Responses de OpenAI cuando `OPENAI_API_KEY` está configurada en el servidor. Utiliza `gpt-5-mini` por defecto y permite cambiarlo mediante `OPENAI_MODEL`. La clave nunca se envía al navegador.

LIA incorpora instrucciones y una validación previa de integridad académica: explica, orienta y revisa avances, pero no realiza tareas o evaluaciones para entregar. En esta etapa utiliza conocimiento general y los metadatos del catálogo; todavía no extrae el texto completo de documentos, no se conecta a Drive y no realiza búsquedas web.

El panel docente requiere una sesión válida y las actualizaciones del catálogo están protegidas en el servidor. El chat todavía no utiliza inteligencia artificial y la carga segura de archivos corresponde a una etapa posterior.

## Repositorio privado

El archivo `.gitignore` evita subir datos dinámicos, variables privadas y materiales académicos locales. El código puede mantenerse en un repositorio privado de GitHub; los documentos se conectarán posteriormente mediante almacenamiento privado.
