const { doubleCsrf } = require('csrf-csrf');

// Configurar CSRF con double-submit cookie pattern
const csrfOptions = {
  getSecret: () => {
    // PARCHE 4: CSRF_SECRET obligatorio en producción
    if (process.env.NODE_ENV === 'production' && !process.env.CSRF_SECRET) {
      throw new Error('❌ CSRF_SECRET es obligatorio en producción');
    }
    return process.env.CSRF_SECRET || 'default-csrf-secret-change-in-production';
  },
  cookieName: 'x-csrf-token',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getTokenFromRequest: (req) => {
    // Buscar el token en el header
    return req.headers['x-csrf-token'] || null;
  },
  getSessionIdentifier: (req) => {
    // Usar siempre la IP para evitar problemas con req.user undefined
    return req.ip || req.connection?.remoteAddress || 'anonymous';
  },
};

let generateCsrfToken, doubleCsrfProtection, invalidCsrfTokenError;

try {
  const csrfResult = doubleCsrf(csrfOptions);
  generateCsrfToken = csrfResult.generateCsrfToken;
  doubleCsrfProtection = csrfResult.doubleCsrfProtection;
  invalidCsrfTokenError = csrfResult.invalidCsrfTokenError;
} catch (error) {
  console.error('❌ Error al configurar CSRF:', error.message);
  throw error;
}

// Exportar con nombres consistentes
module.exports = {
  generateToken: generateCsrfToken,
  csrfProtection: doubleCsrfProtection,
  invalidCsrfTokenError,
};