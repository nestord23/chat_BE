# 📱 Guía Frontend: Sistema de Chat 1-a-1

Esta guía te explica **paso a paso** cómo implementar la funcionalidad de chat privado en tu frontend.

---

## 📋 Tabla de Contenidos

1. [Arquitectura del Sistema](#arquitectura-del-sistema)
2. [Flujo Completo de Usuario](#flujo-completo-de-usuario)
3. [Endpoints API Disponibles](#endpoints-api-disponibles)
4. [Implementación Frontend](#implementación-frontend)
5. [WebSocket (Socket.IO)](#websocket-socketio)
6. [Ejemplos de Código](#ejemplos-de-código)

---

## 🏗️ Arquitectura del Sistema

Tu backend tiene **2 sistemas de chat**:

### 1. **Chat Grupal** (namespace `/`)

- Para mensajes públicos a todos los usuarios conectados
- WebSocket en namespace raíz

### 2. **Chat Privado 1-a-1** (namespace `/private`) ⭐

- Para conversaciones privadas entre dos usuarios
- WebSocket en namespace `/private`
- **Esta guía se enfoca en este**

---

## 🔄 Flujo Completo de Usuario

```
┌─────────────────────────────────────────────────────────────┐
│                    FLUJO DE CHAT PRIVADO                     │
└─────────────────────────────────────────────────────────────┘

1. 👤 REGISTRO/LOGIN
   ↓
   POST /api/auth/register  o  POST /api/auth/login
   ↓
   ✅ Usuario autenticado (cookies HTTPOnly establecidas)

2. 🔍 BUSCAR USUARIOS
   ↓
   GET /api/chat/users?search=nombre
   ↓
   📋 Lista de usuarios disponibles

3. 💬 SELECCIONAR USUARIO PARA CHATEAR
   ↓
   GET /api/chat/messages/:userId
   ↓
   📨 Historial de mensajes con ese usuario

4. 🔌 CONECTAR WEBSOCKET
   ↓
   io.connect('http://localhost:3001/private')
   ↓
   ⚡ Conexión en tiempo real establecida

5. 📤 ENVIAR MENSAJE
   ↓
   socket.emit('send_message', { receiverId, content })
   ↓
   ✅ Mensaje guardado en BD y enviado al receptor

6. 📥 RECIBIR MENSAJES
   ↓
   socket.on('new_message', (message) => { ... })
   ↓
   🔔 Actualizar UI con nuevo mensaje
```

---

## 🌐 Endpoints API Disponibles

### **Autenticación**

#### 1. **Registrar Usuario**

```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "usuario@example.com",
  "password": "password123",
  "username": "mi_username"
}
```

**Respuesta exitosa:**

```json
{
  "success": true,
  "message": "Usuario registrado exitosamente",
  "user": {
    "id": "uuid-del-usuario",
    "email": "usuario@example.com",
    "username": "mi_username"
  }
}
```

#### 2. **Iniciar Sesión**

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "usuario@example.com",
  "password": "password123"
}
```

**Respuesta exitosa:**

```json
{
  "success": true,
  "message": "Login exitoso",
  "user": {
    "id": "uuid-del-usuario",
    "email": "usuario@example.com",
    "username": "mi_username"
  }
}
```

#### 3. **Verificar Sesión Actual**

```http
GET /api/auth/session
```

**Respuesta:**

```json
{
  "success": true,
  "user": {
    "id": "uuid-del-usuario",
    "email": "usuario@example.com",
    "username": "mi_username"
  }
}
```

---

### **Chat Privado**

#### 4. **Buscar Usuarios** ⭐

```http
GET /api/chat/users?search=nombre_usuario
Authorization: Cookie (automático)
```

**Respuesta:**

```json
{
  "success": true,
  "users": [
    {
      "id": "uuid-usuario-1",
      "username": "juan_perez",
      "avatar_url": "https://...",
      "bio": "Desarrollador web"
    },
    {
      "id": "uuid-usuario-2",
      "username": "maria_garcia",
      "avatar_url": null,
      "bio": null
    }
  ]
}
```

#### 5. **Obtener Conversaciones**

```http
GET /api/chat/conversations
Authorization: Cookie (automático)
```

**Respuesta:**

```json
{
  "success": true,
  "conversations": [
    {
      "user_id": "uuid-otro-usuario",
      "username": "juan_perez",
      "avatar_url": "https://...",
      "ultimo_mensaje": "Hola, ¿cómo estás?",
      "ultimo_mensaje_fecha": "2025-11-28T10:30:00Z",
      "mensajes_no_leidos": 3
    }
  ]
}
```

#### 6. **Obtener Mensajes de una Conversación**

```http
GET /api/chat/messages/:userId
Authorization: Cookie (automático)
```

**Ejemplo:**

```http
GET /api/chat/messages/uuid-de-juan
```

**Respuesta:**

```json
{
  "success": true,
  "messages": [
    {
      "id": 1,
      "sender_id": "mi-uuid",
      "receiver_id": "uuid-de-juan",
      "contenido": "Hola Juan!",
      "created_at": "2025-11-28T10:00:00Z",
      "estado": "visto"
    },
    {
      "id": 2,
      "sender_id": "uuid-de-juan",
      "receiver_id": "mi-uuid",
      "contenido": "Hola! ¿Cómo estás?",
      "created_at": "2025-11-28T10:01:00Z",
      "estado": "visto"
    }
  ]
}
```

#### 7. **Marcar Conversación como Vista**

```http
POST /api/chat/mark-conversation-seen/:userId
Authorization: Cookie (automático)
```

#### 8. **Contador de Mensajes No Leídos**

```http
GET /api/chat/unread-count
Authorization: Cookie (automático)
```

**Respuesta:**

```json
{
  "success": true,
  "unreadCount": 5
}
```

---

## 💻 Implementación Frontend

### **Paso 1: Configurar Axios con Credenciales**

```javascript
// src/api/axios.js
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3001/api',
  withCredentials: true, // ⭐ IMPORTANTE: Enviar cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

export default api;
```

---

### **Paso 2: Crear Servicio de Autenticación**

```javascript
// src/services/authService.js
import api from '../api/axios';

export const authService = {
  // Registrar nuevo usuario
  async register(email, password, username) {
    const response = await api.post('/auth/register', {
      email,
      password,
      username,
    });
    return response.data;
  },

  // Iniciar sesión
  async login(email, password) {
    const response = await api.post('/auth/login', {
      email,
      password,
    });
    return response.data;
  },

  // Verificar sesión actual
  async getSession() {
    const response = await api.get('/auth/session');
    return response.data;
  },

  // Cerrar sesión
  async logout(csrfToken) {
    const response = await api.post(
      '/auth/logout',
      {},
      {
        headers: {
          'x-csrf-token': csrfToken,
        },
      }
    );
    return response.data;
  },
};
```

---

### **Paso 3: Crear Servicio de Chat**

```javascript
// src/services/chatService.js
import api from '../api/axios';

export const chatService = {
  // Buscar usuarios
  async searchUsers(searchTerm = '') {
    const response = await api.get('/chat/users', {
      params: { search: searchTerm },
    });
    return response.data;
  },

  // Obtener conversaciones
  async getConversations() {
    const response = await api.get('/chat/conversations');
    return response.data;
  },

  // Obtener mensajes de una conversación
  async getMessages(userId) {
    const response = await api.get(`/chat/messages/${userId}`);
    return response.data;
  },

  // Marcar conversación como vista
  async markConversationSeen(userId) {
    const response = await api.post(`/chat/mark-conversation-seen/${userId}`);
    return response.data;
  },

  // Obtener contador de no leídos
  async getUnreadCount() {
    const response = await api.get('/chat/unread-count');
    return response.data;
  },
};
```

---

## ⚡ WebSocket (Socket.IO)

### **Paso 4: Configurar Socket.IO Client**

```bash
npm install socket.io-client
```

```javascript
// src/services/socketService.js
import { io } from 'socket.io-client';

class SocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
  }

  // Conectar al namespace de chat privado
  connect() {
    if (this.socket?.connected) {
      console.log('Socket ya conectado');
      return;
    }

    this.socket = io('http://localhost:3001/private', {
      withCredentials: true, // ⭐ IMPORTANTE: Enviar cookies
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.setupEventListeners();
  }

  setupEventListeners() {
    // Conexión exitosa
    this.socket.on('connect', () => {
      console.log('✅ Socket conectado:', this.socket.id);
      this.isConnected = true;
    });

    // Error de autenticación
    this.socket.on('auth_error', (error) => {
      console.error('❌ Error de autenticación:', error);
      this.disconnect();
    });

    // Desconexión
    this.socket.on('disconnect', (reason) => {
      console.log('🔌 Socket desconectado:', reason);
      this.isConnected = false;
    });

    // Error general
    this.socket.on('error', (error) => {
      console.error('❌ Error de socket:', error);
    });
  }

  // Enviar mensaje
  sendMessage(receiverId, content) {
    if (!this.isConnected) {
      throw new Error('Socket no conectado');
    }

    return new Promise((resolve, reject) => {
      this.socket.emit('send_message', { receiverId, content }, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.message));
        }
      });
    });
  }

  // Escuchar nuevos mensajes
  onNewMessage(callback) {
    this.socket.on('new_message', callback);
  }

  // Escuchar actualizaciones de estado
  onMessageStatusUpdate(callback) {
    this.socket.on('message_status_update', callback);
  }

  // Escuchar notificaciones de escritura
  onUserTyping(callback) {
    this.socket.on('user_typing', callback);
  }

  // Emitir que estás escribiendo
  emitTyping(receiverId) {
    this.socket.emit('typing', { receiverId });
  }

  // Desconectar
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  // Remover listeners
  removeAllListeners() {
    if (this.socket) {
      this.socket.removeAllListeners();
    }
  }
}

export default new SocketService();
```

---

## 📝 Ejemplos de Código

### **Ejemplo 1: Componente de Login**

```jsx
// src/components/Login.jsx
import { useState } from 'react';
import { authService } from '../services/authService';

function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authService.login(email, password);
      console.log('Login exitoso:', response);
      onLoginSuccess(response.user);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleLogin}>
      <h2>Iniciar Sesión</h2>

      {error && <div className="error">{error}</div>}

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />

      <input
        type="password"
        placeholder="Contraseña"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />

      <button type="submit" disabled={loading}>
        {loading ? 'Cargando...' : 'Iniciar Sesión'}
      </button>
    </form>
  );
}

export default Login;
```

---

### **Ejemplo 2: Componente de Búsqueda de Usuarios**

```jsx
// src/components/UserSearch.jsx
import { useState, useEffect } from 'react';
import { chatService } from '../services/chatService';

function UserSearch({ onSelectUser }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    searchUsers();
  }, [searchTerm]);

  const searchUsers = async () => {
    setLoading(true);
    try {
      const response = await chatService.searchUsers(searchTerm);
      setUsers(response.users);
    } catch (error) {
      console.error('Error buscando usuarios:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="user-search">
      <h3>Buscar Usuarios</h3>

      <input
        type="text"
        placeholder="Buscar por username..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />

      {loading && <p>Buscando...</p>}

      <div className="user-list">
        {users.map((user) => (
          <div key={user.id} className="user-item" onClick={() => onSelectUser(user)}>
            <img src={user.avatar_url || '/default-avatar.png'} alt={user.username} />
            <div>
              <h4>{user.username}</h4>
              {user.bio && <p>{user.bio}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default UserSearch;
```

---

### **Ejemplo 3: Componente de Chat**

```jsx
// src/components/ChatWindow.jsx
import { useState, useEffect, useRef } from 'react';
import { chatService } from '../services/chatService';
import socketService from '../services/socketService';

function ChatWindow({ currentUser, selectedUser }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Cargar mensajes al seleccionar usuario
  useEffect(() => {
    if (selectedUser) {
      loadMessages();
      markAsSeen();
    }
  }, [selectedUser]);

  // Configurar listeners de socket
  useEffect(() => {
    // Escuchar nuevos mensajes
    socketService.onNewMessage((message) => {
      // Solo agregar si es de la conversación actual
      if (message.sender_id === selectedUser.id || message.receiver_id === selectedUser.id) {
        setMessages((prev) => [...prev, message]);
        scrollToBottom();
      }
    });

    return () => {
      socketService.removeAllListeners();
    };
  }, [selectedUser]);

  const loadMessages = async () => {
    setLoading(true);
    try {
      const response = await chatService.getMessages(selectedUser.id);
      setMessages(response.messages);
      scrollToBottom();
    } catch (error) {
      console.error('Error cargando mensajes:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsSeen = async () => {
    try {
      await chatService.markConversationSeen(selectedUser.id);
    } catch (error) {
      console.error('Error marcando como visto:', error);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();

    if (!newMessage.trim()) return;

    try {
      const response = await socketService.sendMessage(selectedUser.id, newMessage.trim());

      // Agregar mensaje a la lista
      setMessages((prev) => [...prev, response.message]);
      setNewMessage('');
      scrollToBottom();
    } catch (error) {
      console.error('Error enviando mensaje:', error);
      alert('Error al enviar mensaje');
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  if (!selectedUser) {
    return <div className="no-chat">Selecciona un usuario para chatear</div>;
  }

  return (
    <div className="chat-window">
      {/* Header */}
      <div className="chat-header">
        <img src={selectedUser.avatar_url || '/default-avatar.png'} alt="" />
        <h3>{selectedUser.username}</h3>
      </div>

      {/* Mensajes */}
      <div className="messages-container">
        {loading && <p>Cargando mensajes...</p>}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`message ${msg.sender_id === currentUser.id ? 'sent' : 'received'}`}
          >
            <p>{msg.contenido}</p>
            <span className="timestamp">{new Date(msg.created_at).toLocaleTimeString()}</span>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} className="message-input">
        <input
          type="text"
          placeholder="Escribe un mensaje..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
        />
        <button type="submit">Enviar</button>
      </form>
    </div>
  );
}

export default ChatWindow;
```

---

### **Ejemplo 4: App Principal**

```jsx
// src/App.jsx
import { useState, useEffect } from 'react';
import Login from './components/Login';
import UserSearch from './components/UserSearch';
import ChatWindow from './components/ChatWindow';
import { authService } from './services/authService';
import socketService from './services/socketService';

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Verificar sesión al cargar
  useEffect(() => {
    checkSession();
  }, []);

  // Conectar socket cuando hay usuario
  useEffect(() => {
    if (currentUser) {
      socketService.connect();
    } else {
      socketService.disconnect();
    }

    return () => {
      socketService.disconnect();
    };
  }, [currentUser]);

  const checkSession = async () => {
    try {
      const response = await authService.getSession();
      setCurrentUser(response.user);
    } catch (error) {
      console.log('No hay sesión activa');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
  };

  const handleSelectUser = (user) => {
    setSelectedUser(user);
  };

  if (loading) {
    return <div>Cargando...</div>;
  }

  if (!currentUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="current-user">
          <h2>Hola, {currentUser.username}!</h2>
        </div>
        <UserSearch onSelectUser={handleSelectUser} />
      </aside>

      <main className="main-content">
        <ChatWindow currentUser={currentUser} selectedUser={selectedUser} />
      </main>
    </div>
  );
}

export default App;
```

---

## 🎨 CSS Básico

```css
/* src/App.css */
.app {
  display: flex;
  height: 100vh;
}

.sidebar {
  width: 300px;
  border-right: 1px solid #ddd;
  overflow-y: auto;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.chat-window {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.chat-header {
  padding: 1rem;
  border-bottom: 1px solid #ddd;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.message {
  margin-bottom: 1rem;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  max-width: 70%;
}

.message.sent {
  background: #007bff;
  color: white;
  margin-left: auto;
}

.message.received {
  background: #f1f1f1;
}

.message-input {
  padding: 1rem;
  border-top: 1px solid #ddd;
  display: flex;
  gap: 0.5rem;
}

.message-input input {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.user-item {
  padding: 1rem;
  cursor: pointer;
  border-bottom: 1px solid #eee;
  display: flex;
  gap: 1rem;
  align-items: center;
}

.user-item:hover {
  background: #f5f5f5;
}

.user-item img {
  width: 40px;
  height: 40px;
  border-radius: 50%;
}
```

---

## ✅ Checklist de Implementación

- [ ] Instalar dependencias: `axios`, `socket.io-client`
- [ ] Configurar Axios con `withCredentials: true`
- [ ] Crear servicios: `authService`, `chatService`, `socketService`
- [ ] Implementar componente de Login/Registro
- [ ] Implementar componente de búsqueda de usuarios
- [ ] Implementar componente de chat
- [ ] Conectar Socket.IO al namespace `/private`
- [ ] Manejar eventos de socket: `new_message`, `message_status_update`
- [ ] Implementar envío de mensajes
- [ ] Implementar recepción de mensajes en tiempo real
- [ ] Agregar manejo de errores
- [ ] Agregar indicadores de carga
- [ ] Probar con múltiples usuarios

---

## 🐛 Troubleshooting

### Error: "No permitido por CORS"

- Verifica que `withCredentials: true` esté en Axios y Socket.IO
- Verifica que el backend esté corriendo en `http://localhost:3001`

### Error: "auth_error" en Socket

- Verifica que el usuario esté logueado
- Verifica que las cookies se estén enviando

### Mensajes no se reciben en tiempo real

- Verifica que el socket esté conectado: `socketService.isConnected`
- Revisa la consola del navegador y del backend

---

## 📚 Recursos Adicionales

- [Socket.IO Client Docs](https://socket.io/docs/v4/client-api/)
- [Axios Docs](https://axios-http.com/docs/intro)
- [React Hooks](https://react.dev/reference/react)

---

**¡Listo para empezar a construir! 🚀**
