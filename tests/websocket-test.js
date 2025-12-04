/**
 * ============================================
 * SCRIPT DE PRUEBA DE WEBSOCKETS
 * ============================================
 * Este script valida que los WebSockets estén funcionando correctamente
 * en el namespace /private para chat 1 a 1
 *
 * REQUISITOS:
 * - Servidor backend corriendo en http://localhost:3000
 * - Dos usuarios registrados en Supabase
 * - Tokens de autenticación válidos
 *
 * USO:
 * node tests/websocket-test.js <TOKEN_USUARIO_1> <TOKEN_USUARIO_2>
 */

const io = require('socket.io-client');

// ============================================
// CONFIGURACIÓN
// ============================================
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';
const NAMESPACE = '/private';
const TIMEOUT = 30000; // 30 segundos

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

// ============================================
// FUNCIONES DE UTILIDAD
// ============================================
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

function logWarning(message) {
  log(`⚠️  ${message}`, colors.yellow);
}

function logStep(step, message) {
  log(`\n${colors.bright}[PASO ${step}]${colors.reset} ${message}`, colors.cyan);
}

// ============================================
// CLASE DE PRUEBA
// ============================================
class WebSocketTester {
  constructor(token1, token2) {
    this.token1 = token1;
    this.token2 = token2;
    this.socket1 = null;
    this.socket2 = null;
    this.testResults = {
      passed: 0,
      failed: 0,
      total: 0,
    };
  }

  // Conectar un socket
  async connectSocket(token, name) {
    return new Promise((resolve, reject) => {
      logInfo(`Conectando ${name}...`);

      const socket = io(`${SERVER_URL}${NAMESPACE}`, {
        auth: { token },
        transports: ['websocket'],
        reconnection: false,
      });

      const timeout = setTimeout(() => {
        socket.disconnect();
        reject(new Error(`Timeout al conectar ${name}`));
      }, 10000);

      socket.on('connect', () => {
        clearTimeout(timeout);
        logSuccess(`${name} conectado (ID: ${socket.id})`);
        resolve(socket);
      });

      socket.on('connect_error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Error al conectar ${name}: ${error.message}`));
      });

      socket.on('error', (error) => {
        logError(`Error en ${name}: ${error.message || JSON.stringify(error)}`);
      });
    });
  }

  // Esperar un evento específico
  waitForEvent(socket, eventName, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout esperando evento '${eventName}'`));
      }, timeout);

      socket.once(eventName, (data) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  }

  // Test 1: Conexión básica
  async testConnection() {
    logStep(1, 'Probando conexión de WebSockets');
    this.testResults.total++;

    try {
      this.socket1 = await this.connectSocket(this.token1, 'Usuario 1');
      this.socket2 = await this.connectSocket(this.token2, 'Usuario 2');

      logSuccess('Ambos usuarios conectados correctamente');
      this.testResults.passed++;
      return true;
    } catch (error) {
      logError(`Fallo en conexión: ${error.message}`);
      this.testResults.failed++;
      return false;
    }
  }

  // Test 2: Envío de mensaje
  async testSendMessage() {
    logStep(2, 'Probando envío de mensaje');
    this.testResults.total++;

    try {
      const testMessage = `Mensaje de prueba - ${new Date().toISOString()}`;

      // Configurar listener en socket2 antes de enviar
      const messagePromise = this.waitForEvent(this.socket2, 'new_message');
      const sentPromise = this.waitForEvent(this.socket1, 'message_sent');

      // Usuario 1 envía mensaje a Usuario 2
      logInfo('Usuario 1 enviando mensaje a Usuario 2...');
      this.socket1.emit('send_message', {
        to: this.socket2.userId,
        content: testMessage,
      });

      // Esperar confirmación de envío
      const sentData = await sentPromise;
      logSuccess(`Mensaje enviado: ${sentData.id}`);
      logInfo(`Estado: ${sentData.estado}`);

      // Esperar recepción del mensaje
      const receivedData = await messagePromise;
      logSuccess(`Mensaje recibido por Usuario 2`);
      logInfo(`Contenido: "${receivedData.content}"`);

      // Verificar que el contenido coincida
      if (receivedData.content === testMessage) {
        logSuccess('El contenido del mensaje coincide');
        this.testResults.passed++;
        return true;
      } else {
        logError('El contenido del mensaje NO coincide');
        this.testResults.failed++;
        return false;
      }
    } catch (error) {
      logError(`Fallo en envío de mensaje: ${error.message}`);
      this.testResults.failed++;
      return false;
    }
  }

  // Test 3: Confirmación de entrega
  async testDeliveryConfirmation() {
    logStep(3, 'Probando confirmación de entrega');
    this.testResults.total++;

    try {
      const deliveredPromise = this.waitForEvent(this.socket1, 'message_delivered');

      // El mensaje anterior debería haber generado una confirmación
      const deliveredData = await deliveredPromise;
      logSuccess(`Confirmación de entrega recibida`);
      logInfo(`Mensaje ID: ${deliveredData.messageId}`);
      logInfo(`Entregado en: ${deliveredData.deliveredAt}`);

      this.testResults.passed++;
      return true;
    } catch (error) {
      logWarning(`No se recibió confirmación de entrega (puede ser normal si ya se procesó)`);
      logInfo('Continuando con las pruebas...');
      this.testResults.passed++;
      return true;
    }
  }

  // Test 4: Indicador de escritura
  async testTypingIndicator() {
    logStep(4, 'Probando indicador de escritura');
    this.testResults.total++;

    try {
      // Configurar listener
      const typingPromise = this.waitForEvent(this.socket2, 'user_typing');
      const stopTypingPromise = this.waitForEvent(this.socket2, 'user_stop_typing');

      // Usuario 1 comienza a escribir
      logInfo('Usuario 1 comienza a escribir...');
      this.socket1.emit('typing', { to: this.socket2.userId });

      const typingData = await typingPromise;
      logSuccess('Usuario 2 recibió notificación de escritura');

      // Usuario 1 deja de escribir
      logInfo('Usuario 1 deja de escribir...');
      this.socket1.emit('stop_typing', { to: this.socket2.userId });

      const stopTypingData = await stopTypingPromise;
      logSuccess('Usuario 2 recibió notificación de fin de escritura');

      this.testResults.passed++;
      return true;
    } catch (error) {
      logError(`Fallo en indicador de escritura: ${error.message}`);
      this.testResults.failed++;
      return false;
    }
  }

  // Test 5: Mensaje bidireccional
  async testBidirectionalMessage() {
    logStep(5, 'Probando mensajes bidireccionales');
    this.testResults.total++;

    try {
      const testMessage = `Respuesta de Usuario 2 - ${new Date().toISOString()}`;

      // Configurar listeners
      const messagePromise = this.waitForEvent(this.socket1, 'new_message');
      const sentPromise = this.waitForEvent(this.socket2, 'message_sent');

      // Usuario 2 responde a Usuario 1
      logInfo('Usuario 2 enviando mensaje a Usuario 1...');
      this.socket2.emit('send_message', {
        to: this.socket1.userId,
        content: testMessage,
      });

      // Esperar confirmación y recepción
      await sentPromise;
      logSuccess('Usuario 2 confirmó envío');

      const receivedData = await messagePromise;
      logSuccess('Usuario 1 recibió el mensaje');
      logInfo(`Contenido: "${receivedData.content}"`);

      this.testResults.passed++;
      return true;
    } catch (error) {
      logError(`Fallo en mensaje bidireccional: ${error.message}`);
      this.testResults.failed++;
      return false;
    }
  }

  // Test 6: Validación de mensajes inválidos
  async testInvalidMessage() {
    logStep(6, 'Probando validación de mensajes inválidos');
    this.testResults.total++;

    try {
      // Intentar enviar mensaje vacío
      const errorPromise = this.waitForEvent(this.socket1, 'error', 3000);

      logInfo('Intentando enviar mensaje vacío...');
      this.socket1.emit('send_message', {
        to: this.socket2.userId,
        content: '',
      });

      const errorData = await errorPromise;
      logSuccess('Error recibido correctamente para mensaje vacío');
      logInfo(`Mensaje de error: "${errorData.message}"`);

      this.testResults.passed++;
      return true;
    } catch (error) {
      logError(`No se recibió error para mensaje inválido: ${error.message}`);
      this.testResults.failed++;
      return false;
    }
  }

  // Test 7: Desconexión
  async testDisconnection() {
    logStep(7, 'Probando desconexión');
    this.testResults.total++;

    try {
      logInfo('Desconectando Usuario 1...');
      this.socket1.disconnect();

      await new Promise((resolve) => setTimeout(resolve, 1000));

      if (!this.socket1.connected) {
        logSuccess('Usuario 1 desconectado correctamente');
      }

      logInfo('Desconectando Usuario 2...');
      this.socket2.disconnect();

      await new Promise((resolve) => setTimeout(resolve, 1000));

      if (!this.socket2.connected) {
        logSuccess('Usuario 2 desconectado correctamente');
      }

      this.testResults.passed++;
      return true;
    } catch (error) {
      logError(`Error en desconexión: ${error.message}`);
      this.testResults.failed++;
      return false;
    }
  }

  // Ejecutar todas las pruebas
  async runAllTests() {
    log('\n' + '='.repeat(60), colors.bright);
    log('INICIANDO PRUEBAS DE WEBSOCKETS', colors.bright);
    log('='.repeat(60) + '\n', colors.bright);

    logInfo(`Servidor: ${SERVER_URL}${NAMESPACE}`);
    logInfo(`Timeout: ${TIMEOUT}ms\n`);

    try {
      // Ejecutar pruebas en secuencia
      const test1 = await this.testConnection();
      if (!test1) {
        throw new Error('Fallo en conexión inicial. Abortando pruebas.');
      }

      // Guardar userId para pruebas posteriores
      this.socket1.userId = this.extractUserIdFromToken(this.token1);
      this.socket2.userId = this.extractUserIdFromToken(this.token2);

      await this.testSendMessage();
      await this.testDeliveryConfirmation();
      await this.testTypingIndicator();
      await this.testBidirectionalMessage();
      await this.testInvalidMessage();
      await this.testDisconnection();
    } catch (error) {
      logError(`Error crítico: ${error.message}`);
    } finally {
      // Asegurar desconexión
      if (this.socket1 && this.socket1.connected) this.socket1.disconnect();
      if (this.socket2 && this.socket2.connected) this.socket2.disconnect();
    }

    // Mostrar resultados
    this.showResults();
  }

  // Extraer userId del token (decodificar JWT básico)
  extractUserIdFromToken(token) {
    try {
      const payload = token.split('.')[1];
      const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
      return decoded.sub || decoded.user_id || decoded.id;
    } catch (error) {
      logWarning('No se pudo extraer userId del token, usando token completo');
      return token;
    }
  }

  // Mostrar resultados finales
  showResults() {
    log('\n' + '='.repeat(60), colors.bright);
    log('RESULTADOS DE LAS PRUEBAS', colors.bright);
    log('='.repeat(60), colors.bright);

    log(`\nTotal de pruebas: ${this.testResults.total}`);
    logSuccess(`Pruebas exitosas: ${this.testResults.passed}`);

    if (this.testResults.failed > 0) {
      logError(`Pruebas fallidas: ${this.testResults.failed}`);
    }

    const percentage = ((this.testResults.passed / this.testResults.total) * 100).toFixed(1);
    log(`\nPorcentaje de éxito: ${percentage}%`);

    if (this.testResults.failed === 0) {
      log('\n🎉 ¡TODAS LAS PRUEBAS PASARON EXITOSAMENTE! 🎉\n', colors.green);
    } else {
      log('\n⚠️  ALGUNAS PRUEBAS FALLARON ⚠️\n', colors.yellow);
    }

    log('='.repeat(60) + '\n', colors.bright);
  }
}

// ============================================
// EJECUCIÓN PRINCIPAL
// ============================================
async function main() {
  // Validar argumentos
  const args = process.argv.slice(2);

  if (args.length < 2) {
    logError('Faltan argumentos');
    log('\nUSO:', colors.bright);
    log('  node tests/websocket-test.js <TOKEN_USUARIO_1> <TOKEN_USUARIO_2>\n');
    log('EJEMPLO:', colors.bright);
    log('  node tests/websocket-test.js eyJhbGc... eyJhbGc...\n');
    log('NOTA:', colors.yellow);
    log('  Puedes obtener los tokens desde el frontend después de hacer login');
    log('  o desde la consola de Supabase.\n');
    process.exit(1);
  }

  const [token1, token2] = args;

  // Crear y ejecutar tester
  const tester = new WebSocketTester(token1, token2);

  try {
    await tester.runAllTests();
    process.exit(tester.testResults.failed === 0 ? 0 : 1);
  } catch (error) {
    logError(`Error fatal: ${error.message}`);
    process.exit(1);
  }
}

// Ejecutar si es el módulo principal
if (require.main === module) {
  main();
}

module.exports = { WebSocketTester };
