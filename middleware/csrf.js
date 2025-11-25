const { doubleCsrf } = require('csrf-csrf');

// Configurar CSRF con double-submit cookie pattern
const {
  invalidCsrfTokenError,
  generateCsrfToken,
  validateRequest,
  doubleCsrfProtection,
} = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET || 'default-csrf-secret-change-in-production',
  cookieName: 'x-csrf-token', // Simplificado para desarrollo
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax', // Cambiar a lax para desarrollo
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getSessionIdentifier: (req) => {
    // Usar el ID de sesión de Supabase si existe, sino usar IP
    return req.user?.id || req.ip || 'anonymous';
  },
});

module.exports = {
  generateToken: generateCsrfToken,
  csrfProtection: doubleCsrfProtection,
  invalidCsrfTokenError,
  validateRequest,
};
