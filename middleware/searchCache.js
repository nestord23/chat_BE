/**
 * Sistema de caché en memoria para búsquedas de usuarios
 * Reduce la carga en la base de datos para búsquedas frecuentes
 */
class SearchCache {
  constructor(options = {}) {
    this.cache = new Map();
    this.maxSize = options.maxSize || 100; // Máximo de entradas en caché
    this.ttl = options.ttl || 5 * 60 * 1000; // Time to live: 5 minutos por defecto
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Genera una key única para la búsqueda
   */
  generateKey(query, filters = {}) {
    const normalizedQuery = query.toLowerCase().trim();
    const filterString = JSON.stringify(filters);
    return `${normalizedQuery}_${filterString}`;
  }

  /**
   * Obtiene un resultado del caché
   */
  get(query, filters = {}) {
    const key = this.generateKey(query, filters);
    const cached = this.cache.get(key);

    if (!cached) {
      this.misses++;
      return null;
    }

    // Verificar si el caché ha expirado
    const now = Date.now();
    if (now - cached.timestamp > this.ttl) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    console.log(`✅ [CACHE HIT] Query: "${query}" - Hit rate: ${this.getHitRate()}%`);
    return cached.data;
  }

  /**
   * Guarda un resultado en el caché
   */
  set(query, data, filters = {}) {
    const key = this.generateKey(query, filters);

    // Si el caché está lleno, eliminar la entrada más antigua
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });

    console.log(
      `💾 [CACHE SET] Query: "${query}" - Cache size: ${this.cache.size}/${this.maxSize}`
    );
  }

  /**
   * Invalida una entrada específica del caché
   */
  invalidate(query, filters = {}) {
    const key = this.generateKey(query, filters);
    this.cache.delete(key);
    console.log(`🗑️ [CACHE INVALIDATE] Query: "${query}"`);
  }

  /**
   * Limpia todo el caché
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    console.log(`🧹 [CACHE CLEAR] Eliminadas ${size} entradas`);
  }

  /**
   * Limpia entradas expiradas
   */
  cleanExpired() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 [CACHE CLEANUP] Eliminadas ${cleaned} entradas expiradas`);
    }
  }

  /**
   * Obtiene estadísticas del caché
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.getHitRate(),
      ttl: this.ttl,
    };
  }

  /**
   * Calcula el hit rate del caché
   */
  getHitRate() {
    const total = this.hits + this.misses;
    if (total === 0) return 0;
    return ((this.hits / total) * 100).toFixed(2);
  }
}

// Crear instancia singleton del caché
const searchCache = new SearchCache({
  maxSize: 100, // Máximo 100 búsquedas en caché
  ttl: 5 * 60 * 1000, // 5 minutos
});

// Limpiar entradas expiradas cada 10 minutos
setInterval(() => {
  searchCache.cleanExpired();
}, 10 * 60 * 1000);

/**
 * Middleware para usar el caché en las búsquedas
 */
function cacheMiddleware(req, res, next) {
  const query = req.query.q || req.sanitizedQuery;
  const filters = {
    page: req.pagination?.page,
    limit: req.pagination?.limit,
  };

  // Intentar obtener del caché
  const cachedResult = searchCache.get(query, filters);

  if (cachedResult) {
    // Si hay resultado en caché, devolverlo directamente
    return res.json({
      success: true,
      data: cachedResult,
      cached: true,
    });
  }

  // Si no hay caché, guardar la función original de res.json
  const originalJson = res.json.bind(res);

  // Sobrescribir res.json para cachear la respuesta
  res.json = function (body) {
    // Solo cachear respuestas exitosas
    if (body.success && body.data) {
      searchCache.set(query, body.data, filters);
    }
    return originalJson(body);
  };

  next();
}

module.exports = {
  SearchCache,
  searchCache,
  cacheMiddleware,
};
