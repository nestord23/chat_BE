# 🛡️ Resumen: Protección del Backend Implementada

## ✅ Archivos Creados

### Middleware (Backend)

1. **`middleware/rateLimiters.js`**

   - ✅ `searchLimiter` - 20 búsquedas/minuto
   - ✅ `authLimiter` - 5 intentos/15min
   - ✅ `messageLimiter` - 30 mensajes/minuto
   - ✅ `strictLimiter` - 3 intentos/hora

2. **`middleware/searchValidation.js`**

   - ✅ `validateSearchQuery` - Sanitización y validación
   - ✅ `validatePagination` - Límites de paginación
   - ✅ `preventDuplicateSearches` - Anti-spam de búsquedas

3. **`middleware/searchCache.js`**
   - ✅ Sistema de caché en memoria
   - ✅ TTL de 5 minutos
   - ✅ Máximo 100 entradas
   - ✅ Limpieza automática

### Rutas (Backend)

4. **`routes/users.js`** (NUEVO)

   - ✅ GET `/api/users/search` - Búsqueda protegida
   - ✅ GET `/api/users/:userId` - Obtener usuario

5. **`routes/auth.js`** (ACTUALIZADO)

   - ✅ Usa `authLimiter` centralizado

6. **`index.js`** (ACTUALIZADO)
   - ✅ Registra ruta `/api/users`

### Documentación

7. **`PROTECCION_BACKEND.md`**

   - ✅ Documentación completa
   - ✅ Ejemplos de uso
   - ✅ Configuración por ambiente

8. **`EJEMPLO_FRONTEND_BUSQUEDA.js`**
   - ✅ Clase `UserSearchManager`
   - ✅ Ejemplo Vanilla JS
   - ✅ Ejemplo React
   - ✅ CSS incluido

---

## 🔒 Capas de Protección

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND                             │
│  1. Debouncing (500ms)                                  │
│  2. Validación mínima (2 chars)                         │
│  3. Caché local (5 min)                                 │
│  4. AbortController (cancelar peticiones)               │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│                    BACKEND                              │
│  5. authMiddleware → Requiere autenticación             │
│  6. searchLimiter → 20 búsquedas/minuto                 │
│  7. validateSearchQuery → Sanitiza input                │
│  8. validatePagination → Limita resultados              │
│  9. preventDuplicateSearches → Anti-spam                │
│  10. cacheMiddleware → Caché del servidor               │
│  11. Consulta a Supabase (solo si no hay caché)         │
└─────────────────────────────────────────────────────────┘
```

---

## 📊 Flujo de una Búsqueda

```
Usuario escribe "john"
    │
    ├─ Frontend valida (≥2 chars) ✅
    │
    ├─ Debounce espera 500ms ⏱️
    │
    ├─ Verifica caché local ❌ (no existe)
    │
    └─ Hace petición al backend
        │
        ├─ authMiddleware ✅ (autenticado)
        │
        ├─ searchLimiter ✅ (15/20 búsquedas)
        │
        ├─ validateSearchQuery ✅ (válido)
        │
        ├─ validatePagination ✅ (page=1, limit=10)
        │
        ├─ preventDuplicateSearches ✅ (no duplicado)
        │
        ├─ cacheMiddleware ❌ (no en caché)
        │
        ├─ Consulta Supabase 🔍
        │
        ├─ Guarda en caché del backend 💾
        │
        └─ Retorna resultados ✅
            │
            ├─ Frontend guarda en caché local 💾
            │
            └─ Muestra resultados al usuario 👤
```

---

## 🎯 Límites Configurados

| Endpoint              | Límite | Ventana | Key         |
| --------------------- | ------ | ------- | ----------- |
| `/api/users/search`   | 20 req | 1 min   | userId o IP |
| `/api/auth/login`     | 5 req  | 15 min  | IP + email  |
| `/api/auth/register`  | 5 req  | 15 min  | IP + email  |
| Mensajes (WebSocket)  | 30 msg | 1 min   | userId      |
| Operaciones sensibles | 3 req  | 1 hora  | userId o IP |

---

## 🚀 Cómo Usar

### Backend (Ya está listo)

```bash
# El backend ya está configurado
# Solo asegúrate de tener la tabla 'profiles' en Supabase
```

### Frontend (Implementar)

#### Opción 1: Vanilla JavaScript

```javascript
// Copiar el código de EJEMPLO_FRONTEND_BUSQUEDA.js
const userSearch = new UserSearchManager('/api');

searchInput.addEventListener('input', (e) => {
  userSearch.search(e.target.value, (error, result) => {
    if (error) {
      showError(error.message);
      return;
    }
    renderResults(result.data);
  });
});
```

#### Opción 2: React

```jsx
// Ver ejemplo completo en EJEMPLO_FRONTEND_BUSQUEDA.js
import UserSearch from './components/UserSearch';

function App() {
  return <UserSearch />;
}
```

---

## 📝 Tabla de Supabase Requerida

```sql
-- Crear tabla de perfiles (si no existe)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para búsqueda rápida
CREATE INDEX idx_profiles_username ON profiles(username);
CREATE INDEX idx_profiles_email ON profiles(email);

-- Trigger para crear perfil automáticamente al registrarse
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, email)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'username',
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

## 🧪 Probar la Implementación

### 1. Iniciar el servidor

```bash
npm run dev
```

### 2. Probar con curl

#### Búsqueda exitosa

```bash
curl -X GET "http://localhost:3001/api/users/search?q=john" \
  -H "Cookie: sb-access-token=YOUR_TOKEN" \
  -v
```

#### Exceder rate limit (hacer 21 peticiones en 1 minuto)

```bash
for i in {1..21}; do
  curl -X GET "http://localhost:3001/api/users/search?q=test$i" \
    -H "Cookie: sb-access-token=YOUR_TOKEN"
  sleep 2
done
```

#### Query inválido

```bash
curl -X GET "http://localhost:3001/api/users/search?q=a" \
  -H "Cookie: sb-access-token=YOUR_TOKEN"
# Respuesta: "La búsqueda debe tener al menos 2 caracteres"
```

---

## 📈 Monitoreo

### Ver logs en tiempo real

```bash
# Los logs se guardan en /logs
tail -f logs/combined.log
```

### Estadísticas del caché

```javascript
// En el código del backend, puedes acceder a:
const { searchCache } = require('./middleware/searchCache');
console.log(searchCache.getStats());

// Retorna:
// {
//   size: 45,
//   maxSize: 100,
//   hits: 120,
//   misses: 30,
//   hitRate: "80.00"
// }
```

---

## ⚙️ Configuración por Ambiente

### Desarrollo (`.env`)

```env
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
```

### Producción (`.env`)

```env
NODE_ENV=production
FRONTEND_URL=https://tu-dominio.com
```

---

## 🔧 Ajustar Límites

### Para desarrollo (más permisivo)

```javascript
// middleware/rateLimiters.js
const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100, // ← Cambiar de 20 a 100
  // ...
});
```

### Para producción (más restrictivo)

```javascript
const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10, // ← Cambiar de 20 a 10
  // ...
});
```

---

## ❓ Preguntas Frecuentes

### ¿Qué pasa si el usuario hace F5 constantemente?

- El rate limiter lo bloqueará después de 20 búsquedas en 1 minuto
- El caché servirá resultados sin consultar la DB

### ¿El caché se pierde al reiniciar?

- Sí, el caché en memoria se pierde
- Para persistencia, considera Redis en producción

### ¿Cómo sé si funciona el rate limiting?

- Haz 21 búsquedas en menos de 1 minuto
- La petición 21 retornará error 429

### ¿Puedo usar esto para otros endpoints?

- ¡Sí! Los middlewares son reutilizables
- Ejemplo: búsqueda de mensajes, productos, etc.

---

## 🎉 Resumen Final

### ✅ Lo que tienes ahora:

1. **Backend protegido** contra abuso de consultas
2. **Rate limiting** por usuario/IP
3. **Validación robusta** de inputs
4. **Caché en dos niveles** (frontend + backend)
5. **Prevención de spam** de búsquedas
6. **Documentación completa**
7. **Ejemplos de implementación** frontend

### 🚀 Próximos pasos:

1. Crear tabla `profiles` en Supabase
2. Implementar el frontend usando los ejemplos
3. Probar con usuarios reales
4. Ajustar límites según necesidad
5. Monitorear logs y métricas

---

## 📚 Archivos de Referencia

- `PROTECCION_BACKEND.md` - Documentación detallada
- `EJEMPLO_FRONTEND_BUSQUEDA.js` - Código frontend completo
- `middleware/rateLimiters.js` - Configuración de límites
- `middleware/searchValidation.js` - Validaciones
- `middleware/searchCache.js` - Sistema de caché
- `routes/users.js` - Endpoint de búsqueda

---

**¡Todo listo para proteger tu backend! 🛡️**
