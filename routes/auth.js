const express = require('express');
const router = express.Router();
const validator = require('validator');
const { createSupabaseServerClient } = require('../config/supabase');
const authMiddleware = require('../middleware/auth');
const { csrfProtection, generateToken } = require('../middleware/csrf');
const { authLimiter } = require('../middleware/rateLimiters');
const logger = require('../config/logger');

/**
 * @swagger
 * /api/auth/csrf-token:
 *   get:
 *     summary: Obtener token CSRF
 *     tags: [Autenticación]
 *     description: Genera y devuelve un token CSRF para proteger endpoints POST/PUT/DELETE
 *     responses:
 *       200:
 *         description: Token CSRF generado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 csrfToken:
 *                   type: string
 *                   example: "abc123def456"
 *       500:
 *         description: Error al generar token
 */
router.get('/csrf-token', (req, res) => {
  try {
    const csrfToken = generateToken(req, res);
    res.json({
      success: true,
      csrfToken,
    });
  } catch (error) {
    logger.error('Error generando token CSRF:', error);
    res.status(500).json({
      success: false,
      message: 'Error al generar token CSRF',
    });
  }
});

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Registrar nuevo usuario
 *     tags: [Autenticación]
 *     description: Crea una nueva cuenta de usuario con Supabase Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - username
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: usuario@example.com
 *                 description: Email del usuario
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 example: Password123!
 *                 description: Contraseña (mínimo 8 caracteres)
 *               username:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 20
 *                 pattern: '^[a-zA-Z0-9_]{3,20}$'
 *                 example: usuario123
 *                 description: Nombre de usuario (3-20 caracteres, alfanumérico)
 *     responses:
 *       201:
 *         description: Usuario registrado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Usuario registrado exitosamente"
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "123e4567-e89b-12d3-a456-426614174000"
 *                     email:
 *                       type: string
 *                       example: "usuario@example.com"
 *                     username:
 *                       type: string
 *                       example: "usuario123"
 *       400:
 *         description: Datos inválidos o usuario ya existe
 *       429:
 *         description: Demasiados intentos (rate limit)
 *       500:
 *         description: Error del servidor
 */
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { email, password, username } = req.body;

    if (!email || !password || !username) {
      return res.status(400).json({
        success: false,
        message: 'Por favor proporciona todos los campos',
      });
    }

    if (!validator.isEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Formato de email inválido',
      });
    }

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return res.status(400).json({
        success: false,
        message:
          'El username debe tener entre 3-20 caracteres (solo letras, números y guiones bajos)',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña debe tener al menos 8 caracteres',
      });
    }

    const sanitizedUsername = validator.escape(username.trim());
    const supabase = createSupabaseServerClient(req, res);

    const { data, error } = await supabase.auth.signUp({
      email: email.toLowerCase().trim(),
      password,
      options: {
        data: {
          username: sanitizedUsername,
        },
      },
    });

    if (error) {
      logger.error('Error en registro:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Error al registrar usuario',
      });
    }

    console.log('🥳nuevo usuario registrado:', {
      userId: data.user.id,
      email: data.user.email,
      username: data.user.user_metadata?.username,
      timestamp: new Date().toISOString(),
    });

    res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente',
      user: {
        id: data.user.id,
        email: data.user.email,
        username: data.user.user_metadata?.username,
      },
    });
  } catch (error) {
    logger.error('Error en registro:', error);
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'production' ? 'Error en el servidor' : error.message,
    });
  }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Iniciar sesión
 *     tags: [Autenticación]
 *     description: Autentica un usuario con email y contraseña usando Supabase Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: usuario@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: Password123!
 *     responses:
 *       200:
 *         description: Login exitoso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Login exitoso"
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     username:
 *                       type: string
 *       401:
 *         description: Credenciales inválidas
 *       429:
 *         description: Demasiados intentos (rate limit)
 *       500:
 *         description: Error del servidor
 */
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Por favor proporciona email y password',
      });
    }

    const supabase = createSupabaseServerClient(req, res);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas',
      });
    }

    console.log('✅ Usuario ha iniciado sesión:', {
      userId: data.user.id,
      email: data.user.email,
      username: data.user.user_metadata?.username,
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: 'Login exitoso',
      user: {
        id: data.user.id,
        email: data.user.email,
        username: data.user.user_metadata?.username,
      },
    });
  } catch (error) {
    logger.error('Error en login:', error);
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'production' ? 'Error en el servidor' : error.message,
    });
  }
});

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Cerrar sesión
 *     tags: [Autenticación]
 *     description: Cierra la sesión actual del usuario (requiere CSRF token y autenticación)
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: header
 *         name: x-csrf-token
 *         required: true
 *         schema:
 *           type: string
 *         description: Token CSRF obtenido de /api/auth/csrf-token
 *     responses:
 *       200:
 *         description: Sesión cerrada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Sesión cerrada exitosamente"
 *       401:
 *         description: No autenticado
 *       403:
 *         description: Token CSRF inválido
 *       500:
 *         description: Error del servidor
 */
router.post('/logout', csrfProtection, authMiddleware, async (req, res) => {
  try {
    const supabase = createSupabaseServerClient(req, res);

    const { error } = await supabase.auth.signOut();

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Error al cerrar sesión',
      });
    }

    res.json({
      success: true,
      message: 'Sesión cerrada exitosamente',
    });
  } catch (error) {
    logger.error('Error en logout:', error);
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'production' ? 'Error en el servidor' : error.message,
    });
  }
});

/**
 * @swagger
 * /api/auth/session:
 *   get:
 *     summary: Verificar sesión actual
 *     tags: [Autenticación]
 *     description: Obtiene información de la sesión actual del usuario
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Sesión activa
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "123e4567-e89b-12d3-a456-426614174000"
 *                     email:
 *                       type: string
 *                       example: "usuario@example.com"
 *                     username:
 *                       type: string
 *                       example: "usuario123"
 *       401:
 *         description: No hay sesión activa
 *       500:
 *         description: Error del servidor
 */
router.get('/session', async (req, res) => {
  try {
    const supabase = createSupabaseServerClient(req, res);

    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session) {
      return res.status(401).json({
        success: false,
        message: 'No hay sesión activa',
      });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.user_metadata?.username,
      },
    });
  } catch (error) {
    logger.error('Error verificando sesión:', error);
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'production' ? 'Error en el servidor' : error.message,
    });
  }
});

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refrescar sesión
 *     tags: [Autenticación]
 *     description: Renueva el token de sesión actual (requiere CSRF token)
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: header
 *         name: x-csrf-token
 *         required: true
 *         schema:
 *           type: string
 *         description: Token CSRF
 *     responses:
 *       200:
 *         description: Sesión refrescada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Sesión refrescada"
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     username:
 *                       type: string
 *       401:
 *         description: No se pudo refrescar la sesión
 *       403:
 *         description: Token CSRF inválido
 *       500:
 *         description: Error del servidor
 */
router.post('/refresh', csrfProtection, async (req, res) => {
  try {
    const supabase = createSupabaseServerClient(req, res);

    const { data, error } = await supabase.auth.refreshSession();

    if (error) {
      return res.status(401).json({
        success: false,
        message: 'No se pudo refrescar la sesión',
      });
    }

    res.json({
      success: true,
      message: 'Sesión refrescada',
      user: {
        id: data.user.id,
        email: data.user.email,
        username: data.user.user_metadata?.username,
      },
    });
  } catch (error) {
    logger.error('Error refrescando sesión:', error);
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'production' ? 'Error en el servidor' : error.message,
    });
  }
});

module.exports = router;
