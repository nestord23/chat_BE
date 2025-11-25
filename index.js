require('dotenv').config();

// ============================================
// PARCHE 3: Validación de Variables de Entorno
// ============================================
const requiredVars = {
  JWT_SECRET: { minLength: 32 },
  SUPABASE_URL: {},
  SUPABASE_ANON_KEY: {},
  FRONTEND_URL: {}
};

const errors = [];

for (const [varName, options] of Object.entries(requiredVars)) {
  const value = process.env[varName];

  // Verificar si existe
  if (!value || value.trim() === '') {
    errors.push(`❌ ERROR: Variable ${varName} no definida o vacía`);
    continue;
  }

  // Validar longitud mínima si se especifica
  if (options.minLength && value.length < options.minLength) {
    errors.push(
      `❌ ERROR: Variable ${varName} debe tener al menos ${options.minLength} caracteres (actual: ${value.length})`
    );
  }
}

// Si hay errores, mostrarlos y salir
if (errors.length > 0) {
  console.error('\n🚨 ERRORES DE CONFIGURACIÓN:\n');
  errors.forEach(error => console.error(error));
  console.error('\n💡 Asegúrate de tener un archivo .env con todas las variables requeridas.\n');
  process.exit(1);
}

console.log('✅ Variables de entorno validadas correctamente');

// ============================================
// Imports de módulos (DESPUÉS de validación)
// ============================================
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const xss = require('xss');
const cookieParser = require('cookie-parser');
const cookie = require('cookie'); // PATCH G: Parser robusto de cookies
const validator = require('validator'); // PATCH B: Sanitización
const { createSupabaseServerClient } = require('./config/supabase');
const authMiddleware = require('./middleware/auth');
const { csrfProtection } = require('./middleware/csrf'); // PATCH A: CSRF

// Crear la aplicación Express
const app = express();
const server = http.createServer(app);

// Configuración de CORS segura con credenciales
const allowedOrigins = process.env.FRONTEND_URL 
  ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
  : ['http://localhost:5173', 'http://localhost:3000'];

const corsOptions = {
  origin: function (origin, callback) {
    // PATCH E: NO permitir requests sin origin en producción
    if (!origin) {
      if (process.env.NODE_ENV === 'production') {
        return callback(new Error('Origin requerido'));
      }
      // Solo en desarrollo permitir sin origin (para testing con curl/Postman)
      return callback(null, true);
    }
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  },
  credentials: true, // IMPORTANTE: Permitir cookies
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'] // PATCH A: Header CSRF
};

// Configurar Socket.IO con CORS seguro
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true
  }
});

// Middleware de Seguridad
app.use(helmet()); // Headers HTTP seguros
app.use(cors(corsOptions));
app.use(cookieParser()); // IMPORTANTE: Para leer cookies
app.use(express.json({ limit: '10kb' })); // Limitar tamaño del body

// Rate Limiting general
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Demasiadas peticiones.'
    });
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', generalLimiter);

// ============================================
// PARCHE 1 PARTE B: Simplificar montaje de authRoutes
// ============================================
// PARCHE 1: Rate limiter ahora está en routes/auth.js
const authRoutes = require('./routes/auth');

// Montar rutas de autenticación
app.use('/api/auth', authRoutes);

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ 
    message: 'Servidor de Chat API funcionando con Supabase Auth',
    version: '2.0.0',
    status: 'online',
    auth: 'Supabase Auth con cookies HTTPOnly + CSRF Protection'
  });
});

// Ruta para obtener historial de mensajes (PROTEGIDA)
app.get('/api/messages', authMiddleware, async (req, res) => {
  try {
    const supabase = req.supabase;

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
    // PATCH F: Mensaje genérico en producción
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'production' ? 'Error en el servidor' : error.message
    });
  }
});

// Almacenar usuarios conectados
const connectedUsers = new Map();

// Middleware de Socket.IO para autenticación con Supabase
io.use(async (socket, next) => {
  try {
    // PATCH G: Usar cookie.parse() en lugar de parsing manual
    const cookies = socket.handshake.headers.cookie;
    
    if (!cookies) {
      return next(new Error('No hay cookies de autenticación'));
    }

    // PATCH G: Parser robusto de cookies
    const cookieObj = cookie.parse(cookies);

    // Crear un objeto req/res simulado para Supabase
    const mockReq = { cookies: cookieObj };
    const mockRes = {
      cookie: () => {},
      clearCookie: () => {}
    };

    const supabase = createSupabaseServerClient(mockReq, mockRes);

    // Verificar sesión
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session) {
      return next(new Error('Sesión inválida o expirada'));
    }

    // Obtener usuario
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return next(new Error('Usuario no válido'));
    }

    // PATCH B: Sanitizar username antes de usarlo
    const rawUsername = user.user_metadata?.username || user.email.split('@')[0];
    const sanitizedUsername = validator.escape(rawUsername);

    // Adjuntar usuario al socket
    socket.user = {
      id: user.id,
      email: user.email,
      username: sanitizedUsername // PATCH B: Username sanitizado
    };

    next();
  } catch (error) {
    console.error('Error en autenticación Socket.IO:', error);
    next(new Error('Error de autenticación'));
  }
});

// Manejar conexiones de WebSocket
io.on('connection', (socket) => {
  console.log(`✅ Usuario conectado: ${socket.user.username} (${socket.id})`);

  // Agregar usuario a la lista de conectados (SIN EMAIL por seguridad)
  connectedUsers.set(socket.id, {
    id: socket.user.id,
    username: socket.user.username, // Ya sanitizado en el middleware
    socketId: socket.id
  });

  // Enviar lista de usuarios conectados a todos
  io.emit('online-users', Array.from(connectedUsers.values()));

  // Notificar a todos que alguien se conectó
  socket.broadcast.emit('user-connected', {
    username: socket.user.username, // Ya sanitizado
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

      // Crear cliente de Supabase para guardar mensaje
      const mockReq = { cookies: {} };
      const mockRes = { cookie: () => {}, clearCookie: () => {} };
      const supabase = createSupabaseServerClient(mockReq, mockRes);

      // Guardar mensaje en Supabase
      const { data: newMessage, error } = await supabase
        .from('messages')
        .insert([
          {
            sender: socket.user.username, // Ya sanitizado
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
      username: socket.user.username // Ya sanitizado
    });
  });

  // Usuario dejó de escribir
  socket.on('stop-typing', () => {
    socket.broadcast.emit('user-stop-typing', {
      username: socket.user.username // Ya sanitizado
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
      username: socket.user.username, // Ya sanitizado
      message: `${socket.user.username} ha salido del chat`
    });
  });
});

// PATCH F: Manejo de errores global mejorado
app.use((err, req, res, next) => {
  // Loggear error completo internamente
  console.error('[ERROR]', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });

  // PATCH F: NUNCA exponer stack trace al cliente
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' 
      ? 'Error en el servidor' 
      : err.message // Solo en desarrollo
  });
});

// Iniciar el servidor
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`✅ Supabase Auth con cookies HTTPOnly`);
  console.log(`🔒 Seguridad: Helmet, CORS, Rate Limiting, CSRF activados`);
  
  // PATCH D: Advertencia sobre cookies en desarrollo
  if (process.env.NODE_ENV !== 'production') {
    console.warn('⚠️  ADVERTENCIA: Cookies sin flag "secure" en desarrollo');
    console.warn('   Para desarrollo seguro, usa HTTPS local con mkcert');
    console.warn('   Ver: https://github.com/FiloSottile/mkcert');
  }
});