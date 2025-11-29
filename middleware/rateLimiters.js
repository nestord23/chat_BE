const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

/**
 * Rate Limiter para búsqueda de usuarios
 * Más restrictivo que el general para prevenir abuso
 */
const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 20, // Máximo 20 búsquedas por minuto por IP
  message: {
    success: false,
    message: 'Demasiadas búsquedas. Por favor, espera un momento antes de intentar de nuevo.',
  },
  standardHeaders: true, // Retorna info del rate limit en los headers `RateLimit-*`
  legacyHeaders: false, // Deshabilita los headers `X-RateLimit-*`
  skipSuccessfulRequests: false, // Cuenta todas las peticiones, incluso las exitosas
  skipFailedRequests: false,
  // Función para generar una key única por usuario/IP
  keyGenerator: (req) => {
    // Si el usuario está autenticado, usar su ID
    if (req.user && req.user.id) {
      return `search_user_${req.user.id}`;
    }
    // Si no, usar la IP
    return `search_ip_${ipKeyGenerator(req)}`;
  },
  // Handler personalizado cuando se excede el límite
  handler: (req, res) => {
    console.warn(
      `⚠️ [RATE LIMIT] Búsqueda bloqueada para ${req.ip} - Usuario: ${req.user?.id || 'anónimo'}`
    );
    res.status(429).json({
      success: false,
      message: 'Demasiadas búsquedas. Por favor, espera un momento antes de intentar de nuevo.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000), // Segundos hasta que se resetee
    });
  },
});

/**
 * Rate Limiter para autenticación (login/registro)
 * Muy restrictivo para prevenir ataques de fuerza bruta
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // Máximo 5 intentos por ventana
  message: {
    success: false,
    message: 'Demasiados intentos de autenticación. Intenta de nuevo en 15 minutos.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // No contar peticiones exitosas
  keyGenerator: (req) => {
    // Usar IP + email para el rate limit
    const email = req.body?.email || 'unknown';
    return `auth_${ipKeyGenerator(req)}_${email}`;
  },
  handler: (req, res) => {
    console.warn(
      `🚨 [RATE LIMIT] Intento de autenticación bloqueado - IP: ${req.ip} - Email: ${req.body?.email}`
    );
    res.status(429).json({
      success: false,
      message: 'Demasiados intentos de autenticación. Intenta de nuevo en 15 minutos.',
    });
  },
});

/**
 * Rate Limiter para mensajes
 * Previene spam de mensajes
 */
const messageLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 30, // Máximo 30 mensajes por minuto
  message: {
    success: false,
    message: 'Estás enviando mensajes muy rápido. Por favor, espera un momento.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    if (req.user && req.user.id) {
      return `message_user_${req.user.id}`;
    }
    return `message_ip_${ipKeyGenerator(req)}`;
  },
  handler: (req, res) => {
    console.warn(`⚠️ [RATE LIMIT] Spam de mensajes detectado - Usuario: ${req.user?.id || req.ip}`);
    res.status(429).json({
      success: false,
      message: 'Estás enviando mensajes muy rápido. Por favor, espera un momento.',
    });
  },
});

/**
 * Rate Limiter estricto para operaciones sensibles
 * (cambio de contraseña, eliminación de cuenta, etc.)
 */
const strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3, // Máximo 3 intentos por hora
  message: {
    success: false,
    message: 'Demasiados intentos. Por favor, espera antes de intentar de nuevo.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  keyGenerator: (req) => {
    if (req.user && req.user.id) {
      return `strict_user_${req.user.id}`;
    }
    return `strict_ip_${ipKeyGenerator(req)}`;
  },
});

module.exports = {
  searchLimiter,
  authLimiter,
  messageLimiter,
  strictLimiter,
};
