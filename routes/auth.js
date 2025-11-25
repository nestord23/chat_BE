const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const validator = require('validator');
const supabase = require('../config/supabase');
const authMiddleware = require('../middleware/auth');

// REGISTRO
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validar que vengan todos los datos
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Por favor proporciona todos los campos'
      });
    }

    // Validar formato de email
    if (!validator.isEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Formato de email inválido'
      });
    }

    // Validar username (solo letras, números y guiones bajos, 3-20 caracteres)
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return res.status(400).json({
        success: false,
        message: 'El username debe tener entre 3-20 caracteres (solo letras, números y guiones bajos)'
      });
    }

    // Validar fortaleza de contraseña (mínimo 8 caracteres, al menos una letra y un número)
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña debe tener al menos 8 caracteres'
      });
    }

    if (!/(?=.*[a-zA-Z])(?=.*[0-9])/.test(password)) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña debe contener al menos una letra y un número'
      });
    }

    // Sanitizar email y username
    const sanitizedEmail = validator.normalizeEmail(email);
    const sanitizedUsername = validator.escape(username.trim());

    // Verificar si el usuario ya existe
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .or(`email.eq.${sanitizedEmail},username.eq.${sanitizedUsername}`)
      .single();

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'El usuario o email ya existe'
      });
    }

    // Encriptar password con bcrypt (12 rounds para mayor seguridad)
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Crear usuario en Supabase
    const { data: newUser, error } = await supabase
      .from('users')
      .insert([
        {
          username: sanitizedUsername,
          email: sanitizedEmail,
          password: hashedPassword
        }
      ])
      .select('id, username, email, created_at')
      .single();

    if (error) {
      console.error('Error al crear usuario:', error);
      return res.status(500).json({
        success: false,
        message: 'Error al crear usuario'
      });
    }

    // Crear token JWT
    const token = jwt.sign(
      { 
        id: newUser.id, 
        username: newUser.username,
        email: newUser.email 
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente',
      token,
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email
      }
    });

  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({
      success: false,
      message: 'Error en el servidor'
    });
  }
});

// LOGIN
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validar datos
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Por favor proporciona email y password'
      });
    }

    // Validar formato de email
    if (!validator.isEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Formato de email inválido'
      });
    }

    // Sanitizar email
    const sanitizedEmail = validator.normalizeEmail(email);

    // Buscar usuario
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', sanitizedEmail)
      .single();

    if (error || !user) {
      // No revelar si el email existe o no (seguridad)
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    // Verificar password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas'
      });
    }

    // Crear token JWT
    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username,
        email: user.email 
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Login exitoso',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({
      success: false,
      message: 'Error en el servidor'
    });
  }
});

// VERIFICAR TOKEN
router.get('/verify', authMiddleware, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, username, email, created_at')
      .eq('id', req.user.id)
      .single();
    
    if (error || !user) {
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado'
      });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Error en verify:', error);
    res.status(500).json({
      success: false,
      message: 'Error en el servidor'
    });
  }
});

module.exports = router;