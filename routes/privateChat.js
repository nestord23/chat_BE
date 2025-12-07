const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const logger = require("../config/logger");

/**
 * @swagger
 * /api/chat/conversations:
 *   get:
 *     summary: Obtener lista de conversaciones del usuario
 *     tags: [Chat Privado]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de conversaciones
 *       401:
 *         description: No autenticado
 */
router.get("/conversations", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const supabase = req.supabase;

    const { data, error } = await supabase.rpc("get_conversations", {
      p_user_id: userId,
    });

    if (error) throw error;

    res.json({
      success: true,
      conversations: data || [],
    });
  } catch (error) {
    logger.error("Error al obtener conversaciones:", error);
    res.status(500).json({
      success: false,
      message:
        process.env.NODE_ENV === "production"
          ? "Error en el servidor"
          : error.message,
    });
  }
});

/**
 * @swagger
 * /api/chat/messages/{userId}:
 *   get:
 *     summary: Obtener mensajes de una conversación
 *     tags: [Chat Privado]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 */
router.get("/messages/:userId", authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const otherUserId = req.params.userId;
    const supabase = req.supabase;

    if (!otherUserId) {
      return res.status(400).json({
        success: false,
        message: "ID de usuario requerido",
      });
    }

    // ✅ MEJORA: Usar construcción más clara para evitar duplicados
    const { data: messages, error } = await supabase
      .from("mensajes")
      .select("id, sender_id, receiver_id, contenido, created_at, estado")
      .or(
        `and(sender_id.eq.${currentUserId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${currentUserId})`
      )
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) throw error;

    res.json({
      success: true,
      messages: messages || [],
    });
  } catch (error) {
    logger.error("Error al obtener mensajes:", error);
    res.status(500).json({
      success: false,
      message:
        process.env.NODE_ENV === "production"
          ? "Error en el servidor"
          : error.message,
    });
  }
});

/**
 * @swagger
 * /api/chat/messages:
 *   post:
 *     summary: Enviar un mensaje privado
 *     tags: [Chat Privado]
 *     security:
 *       - bearerAuth: []
 */
router.post("/messages", authMiddleware, async (req, res) => {
  try {
    const senderId = req.user.id;
    const { to, content } = req.body;
    const supabase = req.supabase;

    // Validaciones
    if (!to || !content) {
      return res.status(400).json({
        success: false,
        message: "Destinatario y contenido son requeridos",
      });
    }

    const trimmedContent = content.trim();
    if (trimmedContent.length === 0 || trimmedContent.length > 5000) {
      return res.status(400).json({
        success: false,
        message: "El mensaje debe tener entre 1 y 5000 caracteres",
      });
    }

    // Verificar destinatario
    const { data: receiver, error: receiverError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", to)
      .single();

    if (receiverError || !receiver) {
      return res.status(404).json({
        success: false,
        message: "Usuario destinatario no encontrado",
      });
    }

    // ✅ CRÍTICO: Usar transacción para evitar duplicados
    const { data: newMessage, error: insertError } = await supabase
      .from("mensajes")
      .insert({
        sender_id: senderId,
        receiver_id: to,
        contenido: trimmedContent,
        estado: "enviado",
      })
      .select()
      .single(); // ✅ .single() garantiza un solo resultado

    if (insertError) {
      logger.error("Error al insertar mensaje:", insertError);
      throw insertError;
    }

    logger.info(`📩 Mensaje HTTP enviado: ${senderId} → ${to}`);

    // ✅ IMPORTANTE: Retornar solo el mensaje sin información extra
    res.json({
      success: true,
      message: newMessage,
    });
  } catch (error) {
    logger.error("Error al enviar mensaje via HTTP:", error);
    res.status(500).json({
      success: false,
      message:
        process.env.NODE_ENV === "production"
          ? "Error en el servidor"
          : error.message,
    });
  }
});

/**
 * @swagger
 * /api/chat/unread-count:
 *   get:
 *     summary: Obtener contador de mensajes no leídos
 *     tags: [Chat Privado]
 *     security:
 *       - bearerAuth: []
 */
router.get("/unread-count", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const supabase = req.supabase;

    const { count, error } = await supabase
      .from("mensajes")
      .select("*", { count: "exact", head: true })
      .eq("receiver_id", userId)
      .neq("estado", "visto");

    if (error) throw error;

    res.json({
      success: true,
      unreadCount: count || 0,
    });
  } catch (error) {
    logger.error("Error al obtener mensajes no leídos:", error);
    res.status(500).json({
      success: false,
      message:
        process.env.NODE_ENV === "production"
          ? "Error en el servidor"
          : error.message,
    });
  }
});

/**
 * @swagger
 * /api/chat/messages/{userId}/seen:
 *   put:
 *     summary: Marcar mensajes como vistos
 *     tags: [Chat Privado]
 *     security:
 *       - bearerAuth: []
 */
router.put("/messages/:userId/seen", authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const otherUserId = req.params.userId;
    const supabase = req.supabase;

    if (!otherUserId) {
      return res.status(400).json({
        success: false,
        message: "ID de usuario requerido",
      });
    }

    // ✅ MEJORA: Solo actualizar mensajes que realmente necesitan cambio
    const { error } = await supabase
      .from("mensajes")
      .update({ estado: "visto" })
      .eq("sender_id", otherUserId)
      .eq("receiver_id", currentUserId)
      .in("estado", ["enviado", "entregado"]); // ✅ Evitar actualizar los ya vistos

    if (error) throw error;

    res.json({
      success: true,
      message: "Mensajes marcados como vistos",
    });
  } catch (error) {
    logger.error("Error al marcar conversación como vista:", error);
    res.status(500).json({
      success: false,
      message:
        process.env.NODE_ENV === "production"
          ? "Error en el servidor"
          : error.message,
    });
  }
});

router.get("/users", authMiddleware, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const search = req.query.search || "";
    const supabase = req.supabase;

    let query = supabase
      .from("profiles")
      .select("id, username, avatar_url, bio")
      .neq("id", currentUserId)
      .limit(20);

    if (search) {
      query = query.ilike("username", `%${search}%`);
    }

    const { data: users, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      users: users || [],
    });
  } catch (error) {
    logger.error("Error al buscar usuarios:", error);
    res.status(500).json({
      success: false,
      message:
        process.env.NODE_ENV === "production"
          ? "Error en el servidor"
          : error.message,
    });
  }
});

module.exports = router;
