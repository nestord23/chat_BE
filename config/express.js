const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const express = require('express');

function configureExpress(app) {
  // Configuración de CORS segura con credenciales
  const allowedOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map((url) => url.trim())
    : ['http://localhost:5173', 'http://localhost:3000'];

  const corsOptions = {
    origin: function (origin, callback) {
      // En desarrollo: permitir todos los orígenes para debugging
      if (process.env.NODE_ENV !== 'production') {
        console.log('🔍 [CORS DEBUG] Request desde origen:', origin || 'sin origin');
        return callback(null, true);
      }

      // En producción: validar origin estrictamente
      if (!origin) {
        return callback(new Error('Origin requerido'));
      }

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        console.error('❌ [CORS] Origen rechazado:', origin);
        console.error('📋 [CORS] Orígenes permitidos:', allowedOrigins);
        callback(new Error('No permitido por CORS'));
      }
    },
    credentials: true, // IMPORTANTE: Permitir cookies
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'], // PATCH A: Header CSRF
  };

  // Middleware de Seguridad
  app.use(helmet()); // Headers HTTP seguros
  app.use(cors(corsOptions));
  app.use(cookieParser()); // IMPORTANTE: Para leer cookies
  app.use(express.json({ limit: '10kb' })); // Limitar tamaño del body

  // Rate Limiting general
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        message: 'Demasiadas peticiones.',
      });
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api/', generalLimiter);

  return { allowedOrigins };
}

module.exports = { configureExpress };
