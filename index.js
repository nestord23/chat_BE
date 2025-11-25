require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const supabase = require('./config/supabase');

// Crear la aplicación Express
const app = express();
const server = http.createServer(app);

// Configurar Socket.IO con CORS
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Rutas
app.use('/api/auth', require('./routes/auth'));

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ 
    message: 'Servidor de Chat API funcionando con Supabase',
    version: '1.0.0'
  });
});

// Ruta para obtener historial de mensajes
app.get('/api/messages', async (req, res) => {
  try {
    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
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

  // Agregar usuario a la lista de conectados
  connectedUsers.set(socket.id, {
    id: socket.user.id,
    username: socket.user.username,
    email: socket.user.email,
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
      console.log('📩 Mensaje recibido:', data);

      // Guardar mensaje en Supabase
      const { data: newMessage, error } = await supabase
        .from('messages')
        .insert([
          {
            sender: socket.user.username,
            sender_email: socket.user.email,
            message: data.message
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

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`✅ Conectado a Supabase`);
});