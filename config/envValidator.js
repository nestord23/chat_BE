const logger = require('./logger');

// ============================================
// PARCHE 3: Validación de Variables de Entorno
// ============================================
const requiredVars = {
  SUPABASE_URL: {},
  SUPABASE_ANON_KEY: {},
  SUPABASE_SERVICE_ROLE_KEY: {},
  FRONTEND_URL: {},
};

function validateEnv() {
  const errors = [];

  for (const [varName, options] of Object.entries(requiredVars)) {
    const value = process.env[varName];

    // Verificar si existe
    if (!value || value.trim() === '') {
      errors.push(`❌ ERROR: Variable ${varName} no definida o vacía`);
      continue;
    }

    // Validar longitud mínima si se especifica
    if (options.minLength && value.length < options.minLength) {
      errors.push(
        `❌ ERROR: Variable ${varName} debe tener al menos ${options.minLength} caracteres (actual: ${value.length})`
      );
    }
  }

  // Si hay errores, mostrarlos y salir
  if (errors.length > 0) {
    logger.error('\n🚨 ERRORES DE CONFIGURACIÓN:\n');
    errors.forEach((error) => logger.error(error));
    logger.error('\n💡 Asegúrate de tener un archivo .env con todas las variables requeridas.\n');
    process.exit(1);
  }
}

module.exports = { validateEnv };
