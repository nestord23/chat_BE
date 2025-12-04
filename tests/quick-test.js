#!/usr/bin/env node

/**
 * ============================================
 * SCRIPT DE PRUEBA RÁPIDA DE WEBSOCKETS
 * ============================================
 * Este es un script simplificado para una prueba rápida
 *
 * USO:
 * npm run test:websocket
 *
 * O directamente:
 * node tests/quick-test.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const io = require('socket.io-client');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Colores
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(`${colors.cyan}${prompt}${colors.reset}`, resolve);
  });
}

async function authenticate(email, password) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data.session.access_token;
}

async function testConnection(token, userName) {
  return new Promise((resolve, reject) => {
    const PORT = process.env.PORT || 3001;
    const socket = io(`http://localhost:${PORT}/private`, {
      auth: { token },
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      log(`✅ ${userName} conectado (ID: ${socket.id})`, colors.green);
      resolve(socket);
    });

    socket.on('connect_error', (error) => {
      log(`❌ Error al conectar ${userName}: ${error.message}`, colors.red);
      reject(error);
    });

    socket.on('error', (error) => {
      log(`❌ Error: ${error.message || JSON.stringify(error)}`, colors.red);
    });

    setTimeout(() => {
      reject(new Error('Timeout'));
    }, 10000);
  });
}

async function main() {
  log('\n' + '='.repeat(60), colors.bright);
  log('🧪 PRUEBA RÁPIDA DE WEBSOCKETS', colors.bright);
  log('='.repeat(60) + '\n', colors.bright);

  try {
    // Verificar variables de entorno
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      throw new Error('Faltan variables de entorno SUPABASE_URL o SUPABASE_ANON_KEY');
    }

    log('Este script probará la conexión WebSocket con dos usuarios.\n', colors.yellow);

    // Obtener credenciales del Usuario 1
    log('USUARIO 1:', colors.cyan);
    const email1 = await question('  Email: ');
    const password1 = await question('  Password: ');

    // Obtener credenciales del Usuario 2
    log('\nUSUARIO 2:', colors.cyan);
    const email2 = await question('  Email: ');
    const password2 = await question('  Password: ');

    log('\n' + '-'.repeat(60), colors.bright);
    log('Autenticando usuarios...', colors.yellow);
    log('-'.repeat(60) + '\n', colors.bright);

    // Autenticar
    const token1 = await authenticate(email1, password1);
    log('✅ Usuario 1 autenticado', colors.green);

    const token2 = await authenticate(email2, password2);
    log('✅ Usuario 2 autenticado', colors.green);

    log('\n' + '-'.repeat(60), colors.bright);
    log('Conectando a WebSocket...', colors.yellow);
    log('-'.repeat(60) + '\n', colors.bright);

    // Conectar
    const socket1 = await testConnection(token1, 'Usuario 1');
    const socket2 = await testConnection(token2, 'Usuario 2');

    log('\n' + '-'.repeat(60), colors.bright);
    log('Probando envío de mensaje...', colors.yellow);
    log('-'.repeat(60) + '\n', colors.bright);

    // Configurar listeners
    socket2.on('new_message', (data) => {
      log(`✅ Usuario 2 recibió mensaje: "${data.content}"`, colors.green);
    });

    socket1.on('message_sent', (data) => {
      log(`✅ Usuario 1 confirmó envío del mensaje`, colors.green);
    });

    // Enviar mensaje de prueba
    const testMessage = `Mensaje de prueba - ${new Date().toISOString()}`;
    log(`📤 Usuario 1 enviando: "${testMessage}"`, colors.blue);

    // Extraer userId del token2
    const payload = token2.split('.')[1];
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
    const userId2 = decoded.sub;

    socket1.emit('send_message', {
      to: userId2,
      content: testMessage,
    });

    // Esperar un momento para ver los resultados
    await new Promise((resolve) => setTimeout(resolve, 3000));

    log('\n' + '-'.repeat(60), colors.bright);
    log('Desconectando...', colors.yellow);
    log('-'.repeat(60) + '\n', colors.bright);

    socket1.disconnect();
    socket2.disconnect();

    log('✅ Desconectado', colors.green);

    log('\n' + '='.repeat(60), colors.bright);
    log('🎉 PRUEBA COMPLETADA EXITOSAMENTE', colors.green);
    log('='.repeat(60) + '\n', colors.bright);

    log(
      'Si viste los mensajes de confirmación arriba, ¡los WebSockets están funcionando!\n',
      colors.yellow
    );
  } catch (error) {
    log('\n' + '='.repeat(60), colors.bright);
    log('❌ ERROR EN LA PRUEBA', colors.red);
    log('='.repeat(60) + '\n', colors.bright);
    log(`Error: ${error.message}\n`, colors.red);

    if (error.message.includes('SUPABASE')) {
      log('💡 Solución: Verifica tu archivo .env', colors.yellow);
    } else if (error.message.includes('Timeout')) {
      log('💡 Solución: Asegúrate de que el servidor esté corriendo (npm run dev)', colors.yellow);
    } else if (error.message.includes('Invalid')) {
      log('💡 Solución: Verifica que las credenciales sean correctas', colors.yellow);
    }

    process.exit(1);
  } finally {
    rl.close();
  }
}

if (require.main === module) {
  main();
}
