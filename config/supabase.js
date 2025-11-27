// NOTA: dotenv se carga en index.js, no aquí
const { createServerClient } = require('@supabase/ssr');
const logger = require('./logger');



// Crear cliente de Supabase para servidor con manejo de cookies
const createSupabaseServerClient = (req, res) => {
  return createServerClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
      cookies: {
        get: (name) => {
          return req.cookies[name];
        },
        set: (name, value, options) => {
          res.cookie(name, value, {
            ...options,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict', // PATCH A: strict para máxima protección CSRF
            path: '/',
          });
        },
        remove: (name, options) => {
          res.clearCookie(name, {
            ...options,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict', // PATCH A: strict para máxima protección CSRF
            path: '/',
          });
        },
      },
    }
  );
};

module.exports = { createSupabaseServerClient };