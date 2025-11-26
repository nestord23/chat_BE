// Cliente Supabase Admin con Service Role Key
// IMPORTANTE: Este cliente bypasea Row Level Security (RLS)
// Solo usar en operaciones de servidor, NUNCA exponer al cliente

const { createClient } = require('@supabase/supabase-js');
const logger = require('./logger');

// Verificar que las variables existan
if (!process.env.SUPABASE_URL) {
  logger.error('❌ ERROR: SUPABASE_URL no está configurada');
  process.exit(1);
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  logger.error('❌ ERROR: SUPABASE_SERVICE_ROLE_KEY no está configurada');
  process.exit(1);
}

// Crear cliente admin con service role key
// Este cliente tiene permisos completos y bypasea RLS
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

logger.info('✅ Supabase Admin Client inicializado');

module.exports = { supabaseAdmin };
