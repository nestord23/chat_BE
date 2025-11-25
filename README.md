# Chat Backend API

Backend para una aplicación de chat en tiempo real construida con Node.js, Express, Socket.IO y Supabase.

## 🚀 Características

- **Autenticación de Usuarios**: Registro y Login con JWT y encriptación de contraseñas (bcryptjs).
- **Chat en Tiempo Real**: Comunicación bidireccional usando Socket.IO.
- **Persistencia de Datos**: Almacenamiento de usuarios y mensajes en Supabase (PostgreSQL).
- **Indicadores de Estado**: Notificaciones de usuario conectado/desconectado y "escribiendo...".
- **Historial de Mensajes**: Recuperación de mensajes anteriores.
- **🔒 Seguridad Avanzada**:
  - **Helmet**: Headers HTTP seguros
  - **CORS**: Configurado para permitir solo orígenes autorizados
  - **Rate Limiting**: Protección contra ataques de fuerza bruta y DDoS
  - **Validación de Entrada**: Validación estricta de emails, usernames y contraseñas
  - **Sanitización XSS**: Limpieza de mensajes para prevenir inyección de código
  - **Autenticación JWT**: Protección de endpoints y WebSocket
  - **Contraseñas Seguras**: Mínimo 8 caracteres con letras y números

## 🛠️ Tecnologías

- [Node.js](https://nodejs.org/)
- [Express](https://expressjs.com/)
- [Socket.IO](https://socket.io/)
- [Supabase](https://supabase.com/)
- [JWT](https://jwt.io/)

## 📋 Prerrequisitos

- Node.js (v18 o superior)
- Una cuenta y proyecto en Supabase

## ⚙️ Configuración

1.  **Instalar dependencias**:
    ```bash
    npm install
    ```

2.  **Variables de Entorno**:
    Crea un archivo `.env` en la raíz del proyecto con las siguientes variables:

    ```env
    PORT=3001
    JWT_SECRET=tu_clave_secreta_jwt_muy_segura
    NODE_ENV=development
    FRONTEND_URL=http://localhost:5173
    SUPABASE_URL=tu_url_de_supabase
    SUPABASE_KEY=tu_anon_key_de_supabase
    ```

    **Importante**: 
    - `JWT_SECRET`: Usa una clave larga y aleatoria (mínimo 32 caracteres)
    - `FRONTEND_URL`: URL de tu frontend (puedes usar múltiples separadas por comas: `http://localhost:5173,https://miapp.com`)

3.  **Base de Datos (Supabase)**:
    Asegúrate de tener las siguientes tablas creadas en tu proyecto de Supabase:

    **Tabla `users`**:
    - `id` (uuid, primary key, default: uuid_generate_v4())
    - `username` (text, unique)
    - `email` (text, unique)
    - `password` (text)
    - `created_at` (timestamp, default: now())

    **Tabla `messages`**:
    - `id` (bigint, primary key, identity)
    - `sender` (text)
    - `sender_email` (text)
    - `message` (text)
    - `timestamp` (timestamp, default: now())

## ▶️ Ejecución

**Modo Desarrollo (con nodemon):**
```bash
npm run dev
```

**Modo Producción:**
```bash
npm start
```

## 📡 API Endpoints

### Autenticación (`/api/auth`)

| Método | Endpoint    | Descripción                  | Body                          | Headers |
| ------ | ----------- | ---------------------------- | ----------------------------- | ------- |
| POST   | `/register` | Registrar nuevo usuario      | `{ username, email, password }` | - |
| POST   | `/login`    | Iniciar sesión               | `{ email, password }`         | - |
| GET    | `/verify`   | Verificar token              | -                             | `Authorization: Bearer <token>` |

### Mensajes (`/api`)

| Método | Endpoint    | Descripción                  |
| ------ | ----------- | ---------------------------- |
| GET    | `/messages` | Obtener historial de mensajes (últimos 50) |

## 🔌 Eventos Socket.IO

El servidor escucha y emite los siguientes eventos. La conexión requiere autenticación mediante token JWT en el handshake.

### Conexión
```javascript
const socket = io('http://localhost:3001', {
  auth: {
    token: 'TU_JWT_TOKEN'
  }
});
```

### Eventos del Cliente (Client -> Server)

| Evento | Payload | Descripción |
| ------ | ------- | ----------- |
| `send-message` | `{ message: string }` | Enviar un nuevo mensaje. |
| `typing` | - | Indicar que el usuario está escribiendo. |
| `stop-typing` | - | Indicar que el usuario dejó de escribir. |

### Eventos del Servidor (Server -> Client)

| Evento | Payload | Descripción |
| ------ | ------- | ----------- |
| `receive-message` | `{ id, sender, message, timestamp }` | Recibir un mensaje nuevo. |
| `online-users` | `[{ id, username, socketId }]` | Lista actualizada de usuarios conectados. |
| `user-connected` | `{ username, message }` | Notificación de que un usuario entró. |
| `user-disconnected` | `{ username, message }` | Notificación de que un usuario salió. |
| `user-typing` | `{ username }` | Notificación de que alguien escribe. |
| `user-stop-typing` | `{ username }` | Notificación de que alguien paró de escribir. |
| `error` | `{ message }` | Mensaje de error si algo falla. |

## 🔒 Medidas de Seguridad Implementadas

### Protección contra Ataques Comunes

1. **XSS (Cross-Site Scripting)**: 
   - Sanitización de todos los mensajes con la librería `xss`
   - Validación estricta de inputs

2. **SQL Injection**: 
   - Uso de Supabase con queries parametrizadas
   - Validación de datos antes de consultas

3. **Brute Force**: 
   - Rate limiting en rutas de autenticación (5 intentos/15 min)
   - Rate limiting general (100 peticiones/15 min)

4. **CORS**: 
   - Solo permite orígenes específicos configurados en `FRONTEND_URL`
   - Credenciales habilitadas solo para orígenes autorizados

5. **DoS (Denial of Service)**: 
   - Límite de tamaño de body (10kb)
   - Rate limiting por IP
   - Límite de longitud de mensajes (1000 caracteres)

6. **Exposición de Información**: 
   - No se revelan emails en Socket.IO
   - Mensajes de error genéricos en producción
   - No se indica si un email existe durante login

### Validaciones Implementadas

- **Email**: Formato válido usando `validator`
- **Username**: 3-20 caracteres, solo letras, números y guiones bajos
- **Contraseña**: Mínimo 8 caracteres, al menos una letra y un número
- **Mensajes**: Máximo 1000 caracteres, sanitizados contra XSS

### Recomendaciones Adicionales

Para producción, considera:
- Usar HTTPS (certificado SSL/TLS)
- Configurar `JWT_SECRET` con al menos 32 caracteres aleatorios
- Habilitar logs de seguridad
- Implementar 2FA (autenticación de dos factores)
- Monitorear intentos de login fallidos
- Configurar backups automáticos de la base de datos

