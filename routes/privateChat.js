const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const logger = require('../config/logger');

// ============================================
// GET /api/chat/conversations
// Obtener lista de conversaciones del usuario
// ============================================
router.get('/conversations', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const supabase = req.supabase;

    // Llamar a la función de Supabase
    const { data, error } = await supabase
      .rpc('get_conversations', { user_id: userId });

    if (error) throw error;

    res.json({
      success: true,
      conversations: data || []
    });
  } catch (error) {
    logger.error('Error al obtener conversaciones:', error);
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'production' ? 'Error en el servidor' : error.message
    });
  }
});

// ============================================
// GET /api/chat/messages/:userId
// Obtener mensajes de una conversación específica
// ============================================
router.get('/messages/:userId', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const otherUserId = req.params.userId;
    const supabase = req.supabase;

    // Validar parámetros
    if (!otherUserId) {
      return res.status(400).json({
        success: false,
        message: 'ID de usuario requerido'
      });
    }

    // Obtener mensajes entre los dos usuarios
    const { data: messages, error } = await supabase
      .from('mensajes')
      .select('id, sender_id, receiver_id, contenido, created_at, estado')
      .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${currentUserId})`)
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) throw error;

    res.json({
      success: true,
      messages: messages || []
    });
  } catch (error) {
    logger.error('Error al obtener mensajes:', error);
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'production' ? 'Error en el servidor' : error.message
    });
  }
});

// ============================================
// GET /api/chat/unread-count
// Obtener contador de mensajes no leídos
// ============================================
router.get('/unread-count', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const supabase = req.supabase;

    const { count, error } = await supabase
      .from('mensajes')
      .select('*', { count: 'exact', head: true })
      .eq('receiver_id', userId)
      .neq('estado', 'visto');

    if (error) throw error;

    res.json({
      success: true,
      unreadCount: count || 0
    });
  } catch (error) {
    logger.error('Error al obtener mensajes no leídos:', error);
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'production' ? 'Error en el servidor' : error.message
    });
  }
});

// ============================================
// POST /api/chat/mark-conversation-seen/:userId
// Marcar todos los mensajes de una conversación como vistos
// ============================================
router.post('/mark-conversation-seen/:userId', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const otherUserId = req.params.userId;
    const supabase = req.supabase;

    if (!otherUserId) {
      return res.status(400).json({
        success: false,
        message: 'ID de usuario requerido'
      });
    }

    // Marcar como vistos todos los mensajes del otro usuario
    const { error } = await supabase
      .from('mensajes')
      .update({ estado: 'visto' })
      .eq('sender_id', otherUserId)
      .eq('receiver_id', currentUserId)
      .neq('estado', 'visto');

    if (error) throw error;

    res.json({
      success: true,
      message: 'Mensajes marcados como vistos'
    });
  } catch (error) {
    logger.error('Error al marcar conversación como vista:', error);
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'production' ? 'Error en el servidor' : error.message
    });
  }
});

// ============================================
// GET /api/chat/users
// Buscar usuarios para iniciar conversación
// ============================================
router.get('/users', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const search = req.query.search || '';
    const supabase = req.supabase;

    let query = supabase
      .from('perfiles')
      .select('id, username, avatar_url, bio')
      .neq('id', currentUserId) // Excluir al usuario actual
      .limit(20);

    // Si hay búsqueda, filtrar por username
    if (search) {
      query = query.ilike('username', `%${search}%`);
    }

    const { data: users, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      users: users || []
    });
  } catch (error) {
    logger.error('Error al buscar usuarios:', error);
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'production' ? 'Error en el servidor' : error.message
    });
  }
});

module.exports = router;
