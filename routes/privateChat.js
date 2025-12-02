const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const logger = require('../config/logger');

/**
 * @swagger
 * /api/chat/conversations:
 *   get:
 *     summary: Obtener lista de conversaciones del usuario
 *     tags: [Chat Privado]
 *     description: Retorna todas las conversaciones activas del usuario autenticado
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de conversaciones obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 conversations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       user_id:
 *                         type: string
 *                         example: "123e4567-e89b-12d3-a456-426614174000"
 *                       username:
 *                         type: string
 *                         example: "usuario123"
 *                       avatar_url:
 *                         type: string
 *                         example: "https://example.com/avatar.jpg"
 *                       last_message:
 *                         type: string
 *                         example: "Hola, ¿cómo estás?"
 *                       unread_count:
 *                         type: integer
 *                         example: 3
 *       401:
 *         description: No autenticado
 *       500:
 *         description: Error del servidor
 */
router.get('/conversations', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const supabase = req.supabase;

    // Llamar a la función de Supabase
    const { data, error } = await supabase.rpc('get_conversations', { p_user_id: userId });

    if (error) throw error;

    res.json({
      success: true,
      conversations: data || [],
    });
  } catch (error) {
    logger.error('Error al obtener conversaciones:', error);
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'production' ? 'Error en el servidor' : error.message,
    });
  }
});

/**
 * @swagger
 * /api/chat/conversations:
 *   post:
 *     summary: Iniciar una nueva conversación
 *     tags: [Chat Privado]
 *     description: Crea o recupera una conversación con otro usuario
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *                 example: "123e4567-e89b-12d3-a456-426614174000"
 *                 description: ID del usuario con quien iniciar la conversación
 *     responses:
 *       200:
 *         description: Conversación iniciada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 conversation:
 *                   type: object
 *                   properties:
 *                     user_id:
 *                       type: string
 *                       example: "123e4567-e89b-12d3-a456-426614174000"
 *                     username:
 *                       type: string
 *                       example: "usuario123"
 *                     avatar_url:
 *                       type: string
 *                       example: "https://example.com/avatar.jpg"
 *                     last_message:
 *                       type: string
 *                       nullable: true
 *                       example: null
 *                     unread_count:
 *                       type: integer
 *                       example: 0
 *       400:
 *         description: ID de usuario no proporcionado
 *       401:
 *         description: No autenticado
 *       404:
 *         description: Usuario no encontrado
 *       500:
 *         description: Error del servidor
 */
router.post('/conversations', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.body;
    const supabase = req.supabase;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'ID de usuario requerido',
      });
    }

    // Verificar si el usuario existe
    const { data: user, error } = await supabase
      .from('perfiles')
      .select('id, username, avatar_url')
      .eq('id', userId)
      .single();

    if (error || !user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado',
      });
    }

    res.json({
      success: true,
      conversation: {
        user_id: user.id,
        username: user.username,
        avatar_url: user.avatar_url,
        last_message: null,
        unread_count: 0,
      },
    });
  } catch (error) {
    logger.error('Error al iniciar conversación:', error);
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'production' ? 'Error en el servidor' : error.message,
    });
  }
});

/**
 * @swagger
 * /api/chat/messages/{userId}:
 *   get:
 *     summary: Obtener mensajes de una conversación específica
 *     tags: [Chat Privado]
 *     description: Retorna los últimos 100 mensajes entre el usuario autenticado y otro usuario
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del usuario con quien se tiene la conversación
 *         example: "123e4567-e89b-12d3-a456-426614174000"
 *     responses:
 *       200:
 *         description: Mensajes obtenidos exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 messages:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: "123e4567-e89b-12d3-a456-426614174000"
 *                       sender_id:
 *                         type: string
 *                         example: "123e4567-e89b-12d3-a456-426614174000"
 *                       receiver_id:
 *                         type: string
 *                         example: "987e6543-e21b-12d3-a456-426614174000"
 *                       contenido:
 *                         type: string
 *                         example: "Hola, ¿cómo estás?"
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                         example: "2024-01-01T12:00:00Z"
 *                       estado:
 *                         type: string
 *                         enum: [enviado, entregado, visto]
 *                         example: "visto"
 *       400:
 *         description: ID de usuario no proporcionado
 *       401:
 *         description: No autenticado
 *       500:
 *         description: Error del servidor
 */
router.get('/messages/:userId', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const otherUserId = req.params.userId;
    const supabase = req.supabase;

    // Validar parámetros
    if (!otherUserId) {
      return res.status(400).json({
        success: false,
        message: 'ID de usuario requerido',
      });
    }

    // Obtener mensajes entre los dos usuarios
    const { data: messages, error } = await supabase
      .from('mensajes')
      .select('id, sender_id, receiver_id, contenido, created_at, estado')
      .or(
        `and(sender_id.eq.${currentUserId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${currentUserId})`
      )
      .order('created_at', { ascending: true })
      .limit(100);

    if (error) throw error;

    res.json({
      success: true,
      messages: messages || [],
    });
  } catch (error) {
    logger.error('Error al obtener mensajes:', error);
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'production' ? 'Error en el servidor' : error.message,
    });
  }
});

/**
 * @swagger
 * /api/chat/unread-count:
 *   get:
 *     summary: Obtener contador de mensajes no leídos
 *     tags: [Chat Privado]
 *     description: Retorna el número total de mensajes no leídos del usuario autenticado
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Contador obtenido exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 unreadCount:
 *                   type: integer
 *                   example: 5
 *       401:
 *         description: No autenticado
 *       500:
 *         description: Error del servidor
 */
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
      unreadCount: count || 0,
    });
  } catch (error) {
    logger.error('Error al obtener mensajes no leídos:', error);
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'production' ? 'Error en el servidor' : error.message,
    });
  }
});

/**
 * @swagger
 * /api/chat/messages/{userId}/seen:
 *   put:
 *     summary: Marcar mensajes como vistos
 *     tags: [Chat Privado]
 *     description: Marca todos los mensajes de una conversación como vistos
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del usuario de la conversación
 *         example: "123e4567-e89b-12d3-a456-426614174000"
 *     responses:
 *       200:
 *         description: Mensajes marcados como vistos exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Mensajes marcados como vistos"
 *       400:
 *         description: ID de usuario no proporcionado
 *       401:
 *         description: No autenticado
 *       500:
 *         description: Error del servidor
 */
router.put('/messages/:userId/seen', authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const otherUserId = req.params.userId;
    const supabase = req.supabase;

    if (!otherUserId) {
      return res.status(400).json({
        success: false,
        message: 'ID de usuario requerido',
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
      message: 'Mensajes marcados como vistos',
    });
  } catch (error) {
    logger.error('Error al marcar conversación como vista:', error);
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'production' ? 'Error en el servidor' : error.message,
    });
  }
});

/**
 * @swagger
 * /api/chat/users:
 *   get:
 *     summary: Buscar usuarios para iniciar conversación
 *     tags: [Chat Privado]
 *     description: Busca usuarios disponibles para iniciar un chat (excluye al usuario actual)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Término de búsqueda para filtrar por username
 *         example: "juan"
 *     responses:
 *       200:
 *         description: Usuarios encontrados exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 users:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: "123e4567-e89b-12d3-a456-426614174000"
 *                       username:
 *                         type: string
 *                         example: "usuario123"
 *                       avatar_url:
 *                         type: string
 *                         example: "https://example.com/avatar.jpg"
 *                       bio:
 *                         type: string
 *                         example: "Desarrollador web"
 *       401:
 *         description: No autenticado
 *       500:
 *         description: Error del servidor
 */
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
      users: users || [],
    });
  } catch (error) {
    logger.error('Error al buscar usuarios:', error);
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'production' ? 'Error en el servidor' : error.message,
    });
  }
});

module.exports = router;
