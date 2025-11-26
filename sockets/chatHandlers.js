const cookie = require('cookie');
const validator = require('validator');
const xss = require('xss');
const { createSupabaseServerClient } = require('../config/supabase');
const { supabaseAdmin } = require('../config/supabaseAdmin');
const logger = require('../config/logger');

// Almacenar usuarios conectados
const connectedUsers = new Map();

function setupSocketHandlers(io) {
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
      logger.error('Error en autenticación Socket.IO:', error);
      next(new Error('Error de autenticación'));
    }
  });

  // Manejar conexiones de WebSocket
  io.on('connection', (socket) => {
    logger.info(`✅ Usuario conectado: ${socket.user.username} (${socket.id})`);

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

        logger.info('📩 Mensaje recibido:', sanitizedMessage);

        // Guardar mensaje en Supabase usando Admin Client (bypasea RLS)
        const { data: newMessage, error } = await supabaseAdmin
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
        logger.error('Error al guardar mensaje:', error);
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
      logger.info(`❌ Usuario desconectado: ${socket.user.username}`);
      
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
}

module.exports = { setupSocketHandlers };
