const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const logger = require('../config/logger');

/**
 * @swagger
 * /api/messages:
 *   get:
 *     summary: Obtener historial de mensajes del chat grupal
 *     tags: [Mensajes]
 *     description: Retorna los últimos 50 mensajes del chat grupal (requiere autenticación)
 *     security:
 *       - bearerAuth: []
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
 *                       sender:
 *                         type: string
 *                         example: "usuario123"
 *                       message:
 *                         type: string
 *                         example: "Hola a todos!"
 *                       timestamp:
 *                         type: string
 *                         format: date-time
 *                         example: "2024-01-01T12:00:00Z"
 *       401:
 *         description: No autenticado
 *       500:
 *         description: Error del servidor
 */
router.get('/', authMiddleware, async (req, res) => {
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
      messages: messages || [],
    });
  } catch (error) {
    logger.error('Error al obtener mensajes:', error);
    // PATCH F: Mensaje genérico en producción
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'production' ? 'Error en el servidor' : error.message,
    });
  }
});

module.exports = router;
