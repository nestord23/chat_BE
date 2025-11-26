const validator = require('validator');
const xss = require('xss');
const { supabaseAdmin } = require('../config/supabaseAdmin');
const logger = require('../config/logger');

// Mapa de usuarios conectados: userId → socket
const usuariosConectados = new Map();

// Rate limiting en memoria: userId → { count, resetAt }
const rateLimits = new Map();
const RATE_LIMIT_MAX = 100; // mensajes por minuto
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minuto

/**
 * Verificar rate limit para un usuario
 */
function checkRateLimit(userId) {
  const now = Date.now();
  const userLimit = rateLimits.get(userId);

  if (!userLimit || now > userLimit.resetAt) {
    // Crear o resetear límite
    rateLimits.set(userId, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW
    });
    return true;
  }

  if (userLimit.count >= RATE_LIMIT_MAX) {
    return false; // Límite excedido
  }

  userLimit.count++;
  return true;
}

/**
 * Sanitizar contenido del mensaje
 */
function sanitizeMessage(content) {
  if (typeof content !== 'string') return null;
  
  const trimmed = content.trim();
  if (trimmed.length === 0 || trimmed.length > 5000) return null;
  
  // Sanitizar XSS
  return xss(trimmed);
}

/**
 * Configurar handlers de Socket.IO para chat 1 a 1
 */
function setupPrivateChatHandlers(io) {
  // Middleware de autenticación
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Token de autenticación requerido'));
      }

      // Validar token con Supabase
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

      if (error || !user) {
        logger.error('Error en autenticación WebSocket:', error);
        return next(new Error('Token inválido o expirado'));
      }

      // Adjuntar userId al socket
      socket.userId = user.id;
      socket.userEmail = user.email;
      socket.username = user.user_metadata?.username || user.email.split('@')[0];

      logger.info(`✅ Usuario autenticado en WebSocket: ${socket.username} (${socket.userId})`);
      next();
    } catch (error) {
      logger.error('Error en middleware de autenticación:', error);
      next(new Error('Error de autenticación'));
    }
  });

  // Manejar conexiones
  io.on('connection', (socket) => {
    const userId = socket.userId;
    logger.info(`🔌 Usuario conectado: ${socket.username} (${userId})`);

    // Agregar al mapa de usuarios conectados
    usuariosConectados.set(userId, socket);

    // Emitir estado online (opcional)
    socket.broadcast.emit('user_status', {
      userId,
      status: 'online'
    });

    // ============================================
    // EVENTO: send_message
    // ============================================
    socket.on('send_message', async ({ to, content }) => {
      try {
        // Validar rate limit
        if (!checkRateLimit(userId)) {
          return socket.emit('error', {
            message: 'Límite de mensajes excedido. Intenta en un minuto.'
          });
        }

        // Validar destinatario
        if (!to || typeof to !== 'string') {
          return socket.emit('error', { message: 'Destinatario inválido' });
        }

        // Sanitizar contenido
        const sanitizedContent = sanitizeMessage(content);
        if (!sanitizedContent) {
          return socket.emit('error', {
            message: 'Mensaje inválido. Debe tener entre 1 y 5000 caracteres.'
          });
        }

        // Insertar mensaje en Supabase
        const { data: newMessage, error } = await supabaseAdmin
          .from('mensajes')
          .insert([
            {
              sender_id: userId,
              receiver_id: to,
              contenido: sanitizedContent,
              estado: 'enviado'
            }
          ])
          .select()
          .single();

        if (error) {
          logger.error('Error al guardar mensaje:', error);
          return socket.emit('error', { message: 'Error al enviar mensaje' });
        }

        logger.info(`📩 Mensaje guardado: ${userId} → ${to}`);

        // Verificar si destinatario está online
        const receiverSocket = usuariosConectados.get(to);

        if (receiverSocket) {
          // Destinatario online: emitir mensaje
          receiverSocket.emit('new_message', {
            id: newMessage.id,
            from: userId,
            content: newMessage.contenido,
            created_at: newMessage.created_at
          });

          // Actualizar estado a 'entregado'
          await supabaseAdmin
            .from('mensajes')
            .update({ estado: 'entregado' })
            .eq('id', newMessage.id);

          // Notificar al remitente que fue entregado
          socket.emit('message_delivered', {
            messageId: newMessage.id,
            deliveredAt: new Date().toISOString()
          });

          logger.info(`✅ Mensaje entregado: ${newMessage.id}`);
        } else {
          logger.info(`📭 Destinatario offline, mensaje queda en 'enviado'`);
        }

        // Confirmar al remitente que se envió
        socket.emit('message_sent', {
          id: newMessage.id,
          to,
          content: newMessage.contenido,
          created_at: newMessage.created_at,
          estado: receiverSocket ? 'entregado' : 'enviado'
        });

      } catch (error) {
        logger.error('Error en send_message:', error);
        socket.emit('error', { message: 'Error al procesar mensaje' });
      }
    });

    // ============================================
    // EVENTO: mark_seen
    // ============================================
    socket.on('mark_seen', async ({ messageId }) => {
      try {
        if (!messageId) {
          return socket.emit('error', { message: 'ID de mensaje requerido' });
        }

        // Actualizar estado a 'visto' (RLS valida que eres el destinatario)
        const { data: updatedMessage, error } = await supabaseAdmin
          .from('mensajes')
          .update({ estado: 'visto' })
          .eq('id', messageId)
          .eq('receiver_id', userId) // Solo el destinatario puede marcar como visto
          .select('sender_id')
          .single();

        if (error) {
          logger.error('Error al marcar mensaje como visto:', error);
          return socket.emit('error', { message: 'Error al actualizar estado' });
        }

        if (!updatedMessage) {
          return socket.emit('error', { message: 'Mensaje no encontrado' });
        }

        logger.info(`👁️ Mensaje marcado como visto: ${messageId}`);

        // Notificar al remitente si está online
        const senderSocket = usuariosConectados.get(updatedMessage.sender_id);
        if (senderSocket) {
          senderSocket.emit('message_seen', {
            messageId,
            seenAt: new Date().toISOString()
          });
        }

      } catch (error) {
        logger.error('Error en mark_seen:', error);
        socket.emit('error', { message: 'Error al procesar solicitud' });
      }
    });

    // ============================================
    // EVENTO: typing
    // ============================================
    socket.on('typing', ({ to }) => {
      if (!to) return;

      const receiverSocket = usuariosConectados.get(to);
      if (receiverSocket) {
        receiverSocket.emit('user_typing', { from: userId });
      }
    });

    // ============================================
    // EVENTO: stop_typing
    // ============================================
    socket.on('stop_typing', ({ to }) => {
      if (!to) return;

      const receiverSocket = usuariosConectados.get(to);
      if (receiverSocket) {
        receiverSocket.emit('user_stop_typing', { from: userId });
      }
    });

    // ============================================
    // EVENTO: disconnect
    // ============================================
    socket.on('disconnect', () => {
      logger.info(`🔌 Usuario desconectado: ${socket.username} (${userId})`);

      // Eliminar del mapa
      usuariosConectados.delete(userId);

      // Emitir estado offline (opcional)
      socket.broadcast.emit('user_status', {
        userId,
        status: 'offline'
      });
    });
  });

  // Limpiar rate limits cada 5 minutos
  setInterval(() => {
    const now = Date.now();
    for (const [userId, limit] of rateLimits.entries()) {
      if (now > limit.resetAt) {
        rateLimits.delete(userId);
      }
    }
  }, 5 * 60 * 1000);
}

module.exports = { setupPrivateChatHandlers };
