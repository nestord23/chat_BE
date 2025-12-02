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
 * @swagger
 * /api/users/search:
 *   get:
 *     summary: Buscar usuarios para iniciar chat
 *     tags: [Usuarios]
 *     description: |
 *       Busca usuarios por username o email con paginación.
 *
 *       **Protecciones implementadas:**
 *       - Requiere autenticación
 *       - Rate limit: 20 búsquedas por minuto
 *       - Validación y sanitización de input
 *       - Validación de parámetros de paginación
 *       - Prevención de búsquedas duplicadas
 *       - Caché de resultados
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Término de búsqueda (username o email)
 *         example: "juan"
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Número de página
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 50
 *         description: Resultados por página (máximo 50)
 *         example: 10
 *     responses:
 *       200:
 *         description: Búsqueda exitosa
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
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
 *                       email:
 *                         type: string
 *                         example: "usuario@example.com"
 *                       avatar_url:
 *                         type: string
 *                         example: "https://example.com/avatar.jpg"
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 10
 *                     total:
 *                       type: integer
 *                       example: 42
 *                     totalPages:
 *                       type: integer
 *                       example: 5
 *                 cached:
 *                   type: boolean
 *                   example: false
 *       400:
 *         description: Parámetros de búsqueda inválidos
 *       401:
 *         description: No autenticado
 *       429:
 *         description: Demasiadas búsquedas (rate limit)
 *       500:
 *         description: Error del servidor
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
 * @swagger
 * /api/users/{userId}:
 *   get:
 *     summary: Obtener información de un usuario específico
 *     tags: [Usuarios]
 *     description: Retorna los datos públicos de un usuario por su ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID del usuario (UUID)
 *         example: "123e4567-e89b-12d3-a456-426614174000"
 *     responses:
 *       200:
 *         description: Usuario encontrado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "123e4567-e89b-12d3-a456-426614174000"
 *                     username:
 *                       type: string
 *                       example: "usuario123"
 *                     email:
 *                       type: string
 *                       example: "usuario@example.com"
 *                     avatar_url:
 *                       type: string
 *                       example: "https://example.com/avatar.jpg"
 *       400:
 *         description: ID de usuario inválido
 *       401:
 *         description: No autenticado
 *       404:
 *         description: Usuario no encontrado
 *       500:
 *         description: Error del servidor
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
