const { createSupabaseServerClient } = require('../config/supabase');

// Middleware para verificar autenticación con Supabase
const authMiddleware = async (req, res, next) => {
  try {
    const supabase = createSupabaseServerClient(req, res);
    
    // Obtener sesión actual desde las cookies
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session) {
      return res.status(401).json({
        success: false,
        message: 'No autenticado. Por favor inicia sesión.'
      });
    }

    // Obtener datos del usuario
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return res.status(401).json({
        success: false,
        message: 'Usuario no válido'
      });
    }

    // Adjuntar usuario y sesión al request
    req.user = user;
    req.session = session;
    req.supabase = supabase;

    next();
  } catch (error) {
    console.error('Error en authMiddleware:', error);
    res.status(500).json({
      success: false,
      message: 'Error al verificar autenticación'
    });
  }
};

module.exports = authMiddleware;