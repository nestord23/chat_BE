require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const xss = require('xss');
const supabase = require('./config/supabase');
const authMiddleware = require('./middleware/auth');

// Crear la aplicación Express
const app = express();
const server = http.createServer(app);

// Configuración de CORS segura
const allowedOrigins = process.env.FRONTEND_URL 
  ? process.env.FRONTEND_URL.split(',') 
  : ['http://localhost:5173', 'http://localhost:3000'];

const corsOptions = {
  origin: function (origin, callback) {
    // Permitir requests sin origin (como mobile apps o curl requests en desarrollo)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// Configurar Socket.IO con CORS seguro
const io = new Server(server, {
  cors: corsOptions
});

// Middleware de Seguridad
app.use(helmet()); // Headers HTTP seguros
app.use(cors(corsOptions));
app.use(express.json({ limit: '10kb' })); // Limitar tamaño del body para evitar DoS

// Rate Limiting - Protección contra fuerza bruta
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // 5 intentos por IP
  message: { 
    success: false, 
    message: 'Demasiados intentos. Intenta de nuevo en 15 minutos.' 
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate Limiting general
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // 100 peticiones por IP
  message: { 
    success: false, 
    message: 'Demasiadas peticiones. Intenta de nuevo más tarde.' 
  }
});

// Aplicar rate limiting
app.use('/api/', generalLimiter);

// Rutas de autenticación con rate limiting específico
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth', require('./routes/auth'));

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ 
    message: 'Servidor de Chat API funcionando con Supabase',
    version: '1.0.0',
    status: 'online'
  });
});

// Ruta para obtener historial de mensajes (PROTEGIDA)
app.get('/api/messages', authMiddleware, async (req, res) => {
  try {
    const { data: messages, error } = await supabase
      .from('messages')
      .select('id, sender, message, timestamp')
      .order('timestamp', { ascending: true })
      .limit(50);
    
    if (error) throw error;

    res.json({
      success: true,
      messages: messages || []
    });
  } catch (error) {
    console.error('Error al obtener mensajes:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener mensajes'
    });
  }
});

// Almacenar usuarios conectados
const connectedUsers = new Map();

// Middleware de Socket.IO para autenticación
io.use((socket, next) => {
  const token = socket.handshake.auth.token;

  if (!token) {
    return next(new Error('Token no proporcionado'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (error) {
    next(new Error('Token inválido'));
  }
});

// Manejar conexiones de WebSocket
io.on('connection', (socket) => {
  console.log(`✅ Usuario conectado: ${socket.user.username} (${socket.id})`);

  // Agregar usuario a la lista de conectados (SIN EMAIL por seguridad)
  connectedUsers.set(socket.id, {
    id: socket.user.id,
    username: socket.user.username,
    socketId: socket.id
  });

  // Enviar lista de usuarios conectados a todos
  io.emit('online-users', Array.from(connectedUsers.values()));

  // Notificar a todos que alguien se conectó
  socket.broadcast.emit('user-connected', {
    username: socket.user.username,
    message: `${socket.user.username} se ha unido al chat`
  });

  // Escuchar mensajes del cliente
  socket.on('send-message', async (data) => {
    try {
      // Validar que el mensaje existe y no está vacío
      if (!data || !data.message || typeof data.message !== 'string') {
        return socket.emit('error', { message: 'Mensaje inválido' });
      }

      // Limitar longitud del mensaje
      if (data.message.length > 1000) {
        return socket.emit('error', { message: 'Mensaje demasiado largo (máximo 1000 caracteres)' });
      }

      // Sanitizar mensaje para prevenir XSS
      const sanitizedMessage = xss(data.message.trim());

      if (!sanitizedMessage) {
        return socket.emit('error', { message: 'Mensaje vacío' });
      }

      console.log('📩 Mensaje recibido:', sanitizedMessage);

      // Guardar mensaje en Supabase
      const { data: newMessage, error } = await supabase
        .from('messages')
        .insert([
          {
            sender: socket.user.username,
            sender_email: socket.user.email,
            message: sanitizedMessage
          }
        ])
        .select()
        .single();

      if (error) throw error;

      // Enviar el mensaje a todos los clientes conectados
      io.emit('receive-message', {
        id: newMessage.id,
        sender: newMessage.sender,
        message: newMessage.message,
        timestamp: newMessage.timestamp
      });

    } catch (error) {
      console.error('Error al guardar mensaje:', error);
      socket.emit('error', { message: 'Error al enviar mensaje' });
    }
  });

  // Usuario está escribiendo
  socket.on('typing', () => {
    socket.broadcast.emit('user-typing', {
      username: socket.user.username
    });
  });

  // Usuario dejó de escribir
  socket.on('stop-typing', () => {
    socket.broadcast.emit('user-stop-typing', {
      username: socket.user.username
    });
  });

  // Cuando un usuario se desconecta
  socket.on('disconnect', () => {
    console.log(`❌ Usuario desconectado: ${socket.user.username}`);
    
    connectedUsers.delete(socket.id);

    // Enviar lista actualizada de usuarios conectados
    io.emit('online-users', Array.from(connectedUsers.values()));

    // Notificar a todos que alguien se desconectó
    socket.broadcast.emit('user-disconnected', {
      username: socket.user.username,
      message: `${socket.user.username} ha salido del chat`
    });
  });
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' 
      ? 'Error en el servidor' 
      : err.message
  });
});

// Iniciar el servidor
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`✅ Conectado a Supabase`);
  console.log(`🔒 Seguridad: Helmet, CORS, Rate Limiting activados`);
});