const validator = require('validator');

/**
 * Middleware para validar parámetros de búsqueda
 * Previene consultas abusivas y maliciosas
 */
function validateSearchQuery(req, res, next) {
  const { q } = req.query;

  // 1. Verificar que el parámetro existe
  if (!q) {
    return res.status(400).json({
      success: false,
      message: 'El parámetro de búsqueda es requerido',
    });
  }

  // 2. Verificar longitud mínima (evita búsquedas muy amplias)
  if (q.length < 2) {
    return res.status(400).json({
      success: false,
      message: 'La búsqueda debe tener al menos 2 caracteres',
    });
  }

  // 3. Verificar longitud máxima (previene ataques)
  if (q.length > 50) {
    return res.status(400).json({
      success: false,
      message: 'La búsqueda no puede exceder 50 caracteres',
    });
  }

  // 4. Sanitizar el input (remover caracteres peligrosos)
  const sanitized = validator.escape(q.trim());

  // 5. Validar que no contenga solo espacios
  if (sanitized.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'La búsqueda no puede estar vacía',
    });
  }

  // 6. Verificar que no contenga caracteres especiales peligrosos
  // Permitir solo letras, números, espacios, guiones y guiones bajos
  const allowedPattern = /^[a-zA-Z0-9\s\-_áéíóúÁÉÍÓÚñÑüÜ]+$/;
  if (!allowedPattern.test(q)) {
    return res.status(400).json({
      success: false,
      message: 'La búsqueda contiene caracteres no permitidos',
    });
  }

  // 7. Guardar la query sanitizada para uso posterior
  req.sanitizedQuery = sanitized;

  // 8. Log para monitoreo (opcional)
  console.log(`🔍 [SEARCH] Usuario: ${req.user?.id || 'anónimo'} - Query: "${sanitized}"`);

  next();
}

/**
 * Middleware para validar paginación
 */
function validatePagination(req, res, next) {
  const { page = 1, limit = 10 } = req.query;

  // Convertir a números
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);

  // Validar que sean números válidos
  if (isNaN(pageNum) || pageNum < 1) {
    return res.status(400).json({
      success: false,
      message: 'El número de página debe ser un número positivo',
    });
  }

  if (isNaN(limitNum) || limitNum < 1) {
    return res.status(400).json({
      success: false,
      message: 'El límite debe ser un número positivo',
    });
  }

  // Limitar el máximo de resultados por página (previene consultas muy grandes)
  if (limitNum > 50) {
    return res.status(400).json({
      success: false,
      message: 'El límite máximo es 50 resultados por página',
    });
  }

  // Guardar valores validados
  req.pagination = {
    page: pageNum,
    limit: limitNum,
    offset: (pageNum - 1) * limitNum,
  };

  next();
}

/**
 * Middleware para prevenir búsquedas repetidas muy rápidas
 * (Complementa el rate limiter con detección de búsquedas idénticas)
 */
const recentSearches = new Map();
const SEARCH_COOLDOWN = 2000; // 2 segundos entre búsquedas idénticas

function preventDuplicateSearches(req, res, next) {
  const userId = req.user?.id || req.ip;
  const searchQuery = req.query.q?.toLowerCase().trim();
  const searchKey = `${userId}_${searchQuery}`;

  const lastSearch = recentSearches.get(searchKey);
  const now = Date.now();

  if (lastSearch && now - lastSearch < SEARCH_COOLDOWN) {
    return res.status(429).json({
      success: false,
      message: 'Por favor, espera un momento antes de repetir la misma búsqueda',
    });
  }

  // Guardar timestamp de esta búsqueda
  recentSearches.set(searchKey, now);

  // Limpiar búsquedas antiguas cada 5 minutos
  if (recentSearches.size > 1000) {
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    for (const [key, timestamp] of recentSearches.entries()) {
      if (timestamp < fiveMinutesAgo) {
        recentSearches.delete(key);
      }
    }
  }

  next();
}

module.exports = {
  validateSearchQuery,
  validatePagination,
  preventDuplicateSearches,
};
