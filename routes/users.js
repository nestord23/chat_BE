const express = require('express');
const router = express.Router();
const { createSupabaseServerClient } = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const { searchLimiter } = require('../middleware/rateLimiters');
const {
  validateSearchQuery,
  validatePagination,
  preventDuplicateSearches,
} = require('../middleware/searchValidation');
const { cacheMiddleware } = require('../middleware/searchCache');
const logger = require('../config/logger');

/**
 * GET /api/users/search
 * Buscar usuarios para iniciar chat
 *
 * Protecciones implementadas:
 * 1. authMiddleware - Requiere autenticación
 * 2. searchLimiter - Máximo 20 búsquedas por minuto
 * 3. validateSearchQuery - Valida y sanitiza el input
 * 4. validatePagination - Valida parámetros de paginación
 * 5. preventDuplicateSearches - Previene búsquedas idénticas muy rápidas
 * 6. cacheMiddleware - Cachea resultados para reducir carga en DB
 */
router.get(
  '/search',
  authMiddleware,
  searchLimiter,
  validateSearchQuery,
  validatePagination,
  preventDuplicateSearches,
  cacheMiddleware,
  async (req, res) => {
    try {
      const supabase = createSupabaseServerClient(req, res);
      const currentUserId = req.user.id;
      const searchQuery = req.sanitizedQuery; // Ya sanitizado por el middleware
      const { page, limit, offset } = req.pagination; // Ya validado por el middleware

      // Buscar usuarios en Supabase
      // Nota: Ajusta esta query según tu esquema de base de datos
      const {
        data: users,
        error,
        count,
      } = await supabase
        .from('profiles') // O la tabla donde guardes los perfiles de usuario
        .select('id, username, email, avatar_url', { count: 'exact' })
        .or(`username.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
        .neq('id', currentUserId) // Excluir al usuario actual
        .range(offset, offset + limit - 1)
        .order('username', { ascending: true });

      if (error) {
        logger.error('Error buscando usuarios:', error);
        return res.status(500).json({
          success: false,
          message: 'Error al buscar usuarios',
        });
      }

      // Log para monitoreo
      res.json({
        success: true,
        data: users,
        pagination: {
          page,
          limit,
          total: count,
          totalPages: Math.ceil(count / limit),
        },
        cached: false, // El middleware cambiará esto a true si viene del caché
      });
    } catch (error) {
      logger.error('Error en búsqueda de usuarios:', error);
      res.status(500).json({
        success: false,
        message: process.env.NODE_ENV === 'production' ? 'Error en el servidor' : error.message,
      });
    }
  }
);

/**
 * GET /api/users/:userId
 * Obtener información de un usuario específico
 */
router.get('/:userId', authMiddleware, async (req, res) => {
  try {
    const supabase = createSupabaseServerClient(req, res);
    const { userId } = req.params;

    // Validar formato de UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de usuario inválido',
      });
    }

    const { data: user, error } = await supabase
      .from('profiles')
      .select('id, username, email, avatar_url')
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
      data: user,
    });
  } catch (error) {
    logger.error('Error obteniendo usuario:', error);
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'production' ? 'Error en el servidor' : error.message,
    });
  }
});

module.exports = router;
