const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const express = require('express');

function configureExpress(app) {
  // Configuración de CORS segura con credenciales
  const allowedOrigins = process.env.FRONTEND_URL 
    ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
    : ['http://localhost:5173', 'http://localhost:3000'];

  const corsOptions = {
    origin: function (origin, callback) {
      // PATCH E: NO permitir requests sin origin en producción
      if (!origin) {
        if (process.env.NODE_ENV === 'production') {
          return callback(new Error('Origin requerido'));
        }
        // Solo en desarrollo permitir sin origin (para testing con curl/Postman)
        return callback(null, true);
      }
      
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('No permitido por CORS'));
      }
    },
    credentials: true, // IMPORTANTE: Permitir cookies
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'] // PATCH A: Header CSRF
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
        message: 'Demasiadas peticiones.'
      });
    },
    standardHeaders: true,
    legacyHeaders: false
  });

  app.use('/api/', generalLimiter);

  return { allowedOrigins };
}

module.exports = { configureExpress };
