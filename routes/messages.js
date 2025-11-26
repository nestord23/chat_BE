const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const logger = require('../config/logger');

// Ruta para obtener historial de mensajes (PROTEGIDA)
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
      messages: messages || []
    });
  } catch (error) {
    logger.error('Error al obtener mensajes:', error);
    // PATCH F: Mensaje genérico en producción
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'production' ? 'Error en el servidor' : error.message
    });
  }
});

module.exports = router;
