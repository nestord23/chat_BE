const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit'); // PARCHE 1: Rate limiting
const validator = require('validator'); // PATCH B: Sanitización
const { createSupabaseServerClient } = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const { csrfProtection, generateToken } = require('../middleware/csrf'); // PATCH A: CSRF

// PARCHE 1: Rate limiter específico para autenticación
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // 5 intentos por IP
  message: { 
    success: false, 
    message: 'Demasiados intentos, intenta de nuevo en 15 minutos' 
  },
  standardHeaders: true,
  legacyHeaders: false,
  statusCode: 429,
});

// PATCH A: Endpoint para obtener token CSRF
router.get('/csrf-token', (req, res) => {
  try {
    const csrfToken = generateToken(req, res);
    res.json({ 
      success: true,
      csrfToken 
    });
  } catch (error) {
    console.error('Error generando token CSRF:', error);
    res.status(500).json({
      success: false,
      message: 'Error al generar token CSRF'
    });
  }
});

// REGISTRO con Supabase Auth
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { email, password, username } = req.body;

    // Validaciones básicas
    if (!email || !password || !username) {
      return res.status(400).json({
        success: false,
        message: 'Por favor proporciona todos los campos'
      });
    }

    // PATCH H: Validar formato de email
    if (!validator.isEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Formato de email inválido'
      });
    }

    // Validar username (3-20 caracteres, alfanumérico)
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return res.status(400).json({
        success: false,
        message: 'El username debe tener entre 3-20 caracteres (solo letras, números y guiones bajos)'
      });
    }

    // Validar contraseña (mínimo 8 caracteres)
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña debe tener al menos 8 caracteres'
      });
    }

    // PATCH B: Sanitizar username para prevenir inyección
    const sanitizedUsername = validator.escape(username.trim());

    const supabase = createSupabaseServerClient(req, res);

    // Registrar usuario con Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email: email.toLowerCase().trim(), // PATCH H: Limpiar email (no normalizar)
      password,
      options: {
        data: {
          username: sanitizedUsername // PATCH B: Usar username sanitizado
        }
      }
    });

    if (error) {
      console.error('Error en registro:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Error al registrar usuario'
      });
    }

    // Supabase automáticamente establece las cookies de sesión
    res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente',
      user: {
        id: data.user.id,
        email: data.user.email,
        username: data.user.user_metadata?.username
      }
    });

  } catch (error) {
    console.error('Error en registro:', error);
    // PATCH F: Mensaje genérico en producción
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'production' ? 'Error en el servidor' : error.message
    });
  }
});

// LOGIN con Supabase Auth
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Por favor proporciona email y password'
      });
    }

    const supabase = createSupabaseServerClient(req, res);

    // Iniciar sesión con Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    // Supabase automáticamente establece las cookies de sesión
    res.json({
      success: true,
      message: 'Login exitoso',
      user: {
        id: data.user.id,
        email: data.user.email,
        username: data.user.user_metadata?.username
      }
    });

  } catch (error) {
    console.error('Error en login:', error);
    // PATCH F: Mensaje genérico en producción
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'production' ? 'Error en el servidor' : error.message
    });
  }
});

// LOGOUT - PARCHE 2: CSRF habilitado en logout para prevenir CSRF attacks
router.post('/logout', csrfProtection, authMiddleware, async (req, res) => {
  try {
    const supabase = createSupabaseServerClient(req, res);

    const { error } = await supabase.auth.signOut();

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Error al cerrar sesión'
      });
    }

    // Supabase automáticamente limpia las cookies
    res.json({
      success: true,
      message: 'Sesión cerrada exitosamente'
    });

  } catch (error) {
    console.error('Error en logout:', error);
    // PATCH F: Mensaje genérico en producción
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'production' ? 'Error en el servidor' : error.message
    });
  }
});

// VERIFICAR SESIÓN
router.get('/session', async (req, res) => {
  try {
    const supabase = createSupabaseServerClient(req, res);

    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session) {
      return res.status(401).json({
        success: false,
        message: 'No hay sesión activa'
      });
    }

    const { data: { user } } = await supabase.auth.getUser();

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.user_metadata?.username
      }
    });

  } catch (error) {
    console.error('Error verificando sesión:', error);
    // PATCH F: Mensaje genérico en producción
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'production' ? 'Error en el servidor' : error.message
    });
  }
});

// REFRESCAR SESIÓN - PATCH A: Protegido con CSRF
router.post('/refresh', csrfProtection, async (req, res) => {
  try {
    const supabase = createSupabaseServerClient(req, res);

    const { data, error } = await supabase.auth.refreshSession();

    if (error) {
      return res.status(401).json({
        success: false,
        message: 'No se pudo refrescar la sesión'
      });
    }

    res.json({
      success: true,
      message: 'Sesión refrescada',
      user: {
        id: data.user.id,
        email: data.user.email,
        username: data.user.user_metadata?.username
      }
    });

  } catch (error) {
    console.error('Error refrescando sesión:', error);
    // PATCH F: Mensaje genérico en producción
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'production' ? 'Error en el servidor' : error.message
    });
  }
});

module.exports = router;