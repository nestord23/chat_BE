# Chat Backend API

Backend para una aplicación de chat en tiempo real construida con Node.js, Express, Socket.IO y Supabase.

## 🚀 Características

- **Autenticación de Usuarios**: Registro y Login con JWT y encriptación de contraseñas (bcryptjs).
- **Chat en Tiempo Real**: Comunicación bidireccional usando Socket.IO.
- **Persistencia de Datos**: Almacenamiento de usuarios y mensajes en Supabase (PostgreSQL).
- **Indicadores de Estado**: Notificaciones de usuario conectado/desconectado y "escribiendo...".
- **Historial de Mensajes**: Recuperación de mensajes anteriores.

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
    JWT_SECRET=tu_clave_secreta_jwt
    NODE_ENV=development
    SUPABASE_URL=tu_url_de_supabase
    SUPABASE_KEY=tu_anon_key_de_supabase
    ```

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
| `online-users` | `[{ id, username, email, socketId }]` | Lista actualizada de usuarios conectados. |
| `user-connected` | `{ username, message }` | Notificación de que un usuario entró. |
| `user-disconnected` | `{ username, message }` | Notificación de que un usuario salió. |
| `user-typing` | `{ username }` | Notificación de que alguien escribe. |
| `user-stop-typing` | `{ username }` | Notificación de que alguien paró de escribir. |
| `error` | `{ message }` | Mensaje de error si algo falla. |
