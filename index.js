require('dotenv').config();

// Validar variables de entorno
const { validateEnv } = require('./config/envValidator');
validateEnv();

// ============================================
// Imports de módulos (DESPUÉS de validación)
// ============================================
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { configureExpress } = require('./config/express');
const { setupSocketHandlers } = require('./sockets/chatHandlers'); // Chat grupal
const { setupPrivateChatHandlers } = require('./sockets/privateChatHandlers'); // Chat 1 a 1
const logger = require('./config/logger');

// Crear la aplicación Express
const app = express();
const server = http.createServer(app);

// Configurar Express middleware
const { allowedOrigins } = configureExpress(app);

// ============================================
// CONFIGURAR SOCKET.IO CON DOS NAMESPACES
// ============================================

// Namespace para chat grupal (existente)
const groupChatIO = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

// Namespace para chat privado 1 a 1 (nuevo)
const privateChatIO = groupChatIO.of('/private');

// ============================================
// RUTAS API
// ============================================
const authRoutes = require('./routes/auth');
const messagesRoutes = require('./routes/messages');
const privateChatRoutes = require('./routes/privateChat'); // Nuevo
const usersRoutes = require('./routes/users'); // Búsqueda de usuarios

// Montar rutas
app.use('/api/auth', authRoutes);
app.use('/api/messages', messagesRoutes); // Chat grupal
app.use('/api/chat', privateChatRoutes); // Chat privado
app.use('/api/users', usersRoutes); // Búsqueda de usuarios

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({
    message: 'Servidor de Chat API funcionando con Supabase Auth',
    version: '3.0.0',
    status: 'online',
    features: {
      auth: 'Supabase Auth con cookies HTTPOnly + CSRF Protection',
      groupChat: 'WebSocket en namespace raíz',
      privateChat: 'WebSocket en namespace /private',
      userSearch: 'Búsqueda de usuarios con protección anti-abuso',
    },
  });
});

// ============================================
// CONFIGURAR MANEJADORES DE SOCKET.IO
// ============================================

// Chat grupal (namespace raíz)
setupSocketHandlers(groupChatIO);

// Chat privado 1 a 1 (namespace /private)
setupPrivateChatHandlers(privateChatIO);

// ============================================
// MANEJO DE ERRORES GLOBAL
// ============================================
app.use((err, req, res, next) => {
  // Loggear error completo internamente
  logger.error('[ERROR]', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString(),
  });

  // PATCH F: NUNCA exponer stack trace al cliente
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Error en el servidor' : err.message, // Solo en desarrollo
  });
});

// ============================================
// INICIAR SERVIDOR
// ============================================
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  logger.info(`🚀 Servidor corriendo en puerto ${PORT}`);
});
