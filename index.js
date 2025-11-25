const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

// Crear la aplicación Express
const app = express();
const server = http.createServer(app);

// Configurar Socket.IO con CORS
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", // URL de tu frontend
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// Ruta de prueba
app.get("/", (req, res) => {
  res.send("Servidor de Chat funcionando");
});

// Manejar conexiones de WebSocket
io.on("connection", (socket) => {
  console.log("Usuario conectado:", socket.id);

  // Escuchar mensajes del cliente
  socket.on("send-message", (data) => {
    console.log("Mensaje recibido:", data);

    // Enviar el mensaje a todos los clientes conectados
    io.emit("receive-message", {
      id: socket.id,
      message: data.message,
      username: data.username,
      timestamp: new Date(),
    });
  });

  // Cuando un usuario se desconecta
  socket.on("disconnect", () => {
    console.log("Usuario desconectado:", socket.id);
  });
});

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
