/**
 * ============================================
 * SCRIPT PARA OBTENER TOKENS DE AUTENTICACIÓN
 * ============================================
 * Este script te ayuda a obtener tokens de autenticación
 * para usar en las pruebas de WebSocket
 *
 * USO:
 * node tests/get-auth-tokens.js <EMAIL_1> <PASSWORD_1> <EMAIL_2> <PASSWORD_2>
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Colores para la consola
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, colors.green);
}

function logError(message) {
  log(`❌ ${message}`, colors.red);
}

function logInfo(message) {
  log(`ℹ️  ${message}`, colors.blue);
}

async function getAuthToken(email, password, userLabel) {
  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

    logInfo(`Autenticando ${userLabel} (${email})...`);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      logError(`Error al autenticar ${userLabel}: ${error.message}`);
      return null;
    }

    if (!data.session) {
      logError(`No se obtuvo sesión para ${userLabel}`);
      return null;
    }

    logSuccess(`${userLabel} autenticado correctamente`);
    logInfo(`User ID: ${data.user.id}`);
    logInfo(`Email: ${data.user.email}`);

    return {
      token: data.session.access_token,
      userId: data.user.id,
      email: data.user.email,
      username: data.user.user_metadata?.username || data.user.email.split('@')[0],
    };
  } catch (error) {
    logError(`Error inesperado para ${userLabel}: ${error.message}`);
    return null;
  }
}

async function main() {
  log('\n' + '='.repeat(60), colors.bright);
  log('OBTENER TOKENS DE AUTENTICACIÓN', colors.bright);
  log('='.repeat(60) + '\n', colors.bright);

  // Validar variables de entorno
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    logError('Faltan variables de entorno SUPABASE_URL o SUPABASE_ANON_KEY');
    logInfo('Asegúrate de tener un archivo .env configurado');
    process.exit(1);
  }

  // Validar argumentos
  const args = process.argv.slice(2);

  if (args.length < 4) {
    logError('Faltan argumentos');
    log('\nUSO:', colors.bright);
    log('  node tests/get-auth-tokens.js <EMAIL_1> <PASSWORD_1> <EMAIL_2> <PASSWORD_2>\n');
    log('EJEMPLO:', colors.bright);
    log('  node tests/get-auth-tokens.js user1@test.com pass123 user2@test.com pass456\n');
    process.exit(1);
  }

  const [email1, password1, email2, password2] = args;

  // Obtener tokens
  const user1 = await getAuthToken(email1, password1, 'Usuario 1');
  const user2 = await getAuthToken(email2, password2, 'Usuario 2');

  if (!user1 || !user2) {
    logError('\nNo se pudieron obtener todos los tokens');
    process.exit(1);
  }

  // Mostrar resultados
  log('\n' + '='.repeat(60), colors.bright);
  log('TOKENS OBTENIDOS', colors.bright);
  log('='.repeat(60) + '\n', colors.bright);

  log('USUARIO 1:', colors.cyan);
  log(`  Email: ${user1.email}`);
  log(`  Username: ${user1.username}`);
  log(`  User ID: ${user1.userId}`);
  log(`  Token: ${user1.token.substring(0, 50)}...`);

  log('\nUSUARIO 2:', colors.cyan);
  log(`  Email: ${user2.email}`);
  log(`  Username: ${user2.username}`);
  log(`  User ID: ${user2.userId}`);
  log(`  Token: ${user2.token.substring(0, 50)}...`);

  log('\n' + '='.repeat(60), colors.bright);
  log('COMANDO PARA EJECUTAR PRUEBAS', colors.bright);
  log('='.repeat(60) + '\n', colors.bright);

  log('Copia y ejecuta el siguiente comando:\n', colors.yellow);
  log(`node tests/websocket-test.js "${user1.token}" "${user2.token}"\n`, colors.green);

  log('='.repeat(60) + '\n', colors.bright);

  logSuccess('¡Tokens obtenidos exitosamente!');
}

if (require.main === module) {
  main().catch((error) => {
    logError(`Error fatal: ${error.message}`);
    process.exit(1);
  });
}
