# Protección del Backend contra Abuso de Consultas

Este documento explica todas las estrategias implementadas para proteger el backend de consultas abusivas, especialmente en la funcionalidad de búsqueda de usuarios.

## 📋 Tabla de Contenidos

1. [Resumen de Protecciones](#resumen-de-protecciones)
2. [Rate Limiting](#rate-limiting)
3. [Validación de Entrada](#validación-de-entrada)
4. [Sistema de Caché](#sistema-de-caché)
5. [Prevención de Duplicados](#prevención-de-duplicados)
6. [Uso en el Frontend](#uso-en-el-frontend)
7. [Monitoreo y Logs](#monitoreo-y-logs)

---

## Resumen de Protecciones

El sistema implementa **6 capas de protección**:

1. ✅ **Rate Limiting por IP/Usuario** - Limita peticiones por tiempo
2. ✅ **Validación y Sanitización** - Previene inyecciones y datos maliciosos
3. ✅ **Caché en Memoria** - Reduce carga en la base de datos
4. ✅ **Prevención de Duplicados** - Detecta búsquedas idénticas repetidas
5. ✅ **Autenticación Requerida** - Solo usuarios autenticados pueden buscar
6. ✅ **Paginación Limitada** - Máximo 50 resultados por página

---

## Rate Limiting

### Archivos Involucrados

- `middleware/rateLimiters.js` - Definición de limitadores
- `routes/users.js` - Aplicación en rutas de búsqueda

### Configuración

#### 1. Búsqueda de Usuarios (`searchLimiter`)

```javascript
windowMs: 1 * 60 * 1000; // 1 minuto
max: 20; // Máximo 20 búsquedas por minuto
```

**Comportamiento:**

- Cuenta búsquedas por usuario autenticado (si está logueado)
- Si no está autenticado, cuenta por IP
- Retorna error 429 cuando se excede el límite
- Incluye header `RateLimit-*` con información del límite

**Respuesta cuando se excede:**

```json
{
  "success": false,
  "message": "Demasiadas búsquedas. Por favor, espera un momento antes de intentar de nuevo.",
  "retryAfter": 45 // Segundos hasta que se resetee
}
```

#### 2. Autenticación (`authLimiter`)

```javascript
windowMs: 15 * 60 * 1000; // 15 minutos
max: 5; // Máximo 5 intentos
```

**Uso:** Login y registro
**Previene:** Ataques de fuerza bruta

#### 3. Mensajes (`messageLimiter`)

```javascript
windowMs: 1 * 60 * 1000; // 1 minuto
max: 30; // Máximo 30 mensajes por minuto
```

**Previene:** Spam de mensajes

#### 4. Operaciones Sensibles (`strictLimiter`)

```javascript
windowMs: 60 * 60 * 1000; // 1 hora
max: 3; // Máximo 3 intentos por hora
```

**Uso:** Cambio de contraseña, eliminación de cuenta

---

## Validación de Entrada

### Archivo: `middleware/searchValidation.js`

### 1. Validación de Query (`validateSearchQuery`)

**Validaciones aplicadas:**

```javascript
// ❌ Query vacío
if (!q) return error;

// ❌ Menos de 2 caracteres
if (q.length < 2) return error;

// ❌ Más de 50 caracteres
if (q.length > 50) return error;

// ✅ Sanitización
const sanitized = validator.escape(q.trim());

// ❌ Solo caracteres permitidos (letras, números, espacios, -, _)
const allowedPattern = /^[a-zA-Z0-9\s\-_áéíóúÁÉÍÓÚñÑüÜ]+$/;
if (!allowedPattern.test(q)) return error;
```

**Resultado:**

- Query sanitizado disponible en `req.sanitizedQuery`
- Previene inyección SQL/NoSQL
- Previene XSS

### 2. Validación de Paginación (`validatePagination`)

```javascript
// Valores por defecto
page = 1
limit = 10

// Validaciones
page >= 1
limit >= 1 && limit <= 50  // Máximo 50 resultados

// Resultado en req.pagination
{
  page: 1,
  limit: 10,
  offset: 0  // Calculado automáticamente
}
```

---

## Sistema de Caché

### Archivo: `middleware/searchCache.js`

### Configuración

```javascript
maxSize: 100; // Máximo 100 búsquedas en caché
ttl: 5 * 60 * 1000; // 5 minutos de vida
```

### Funcionamiento

1. **Primera búsqueda:** Se consulta la base de datos
2. **Resultado se guarda** en caché con timestamp
3. **Búsquedas posteriores** (mismo query + filtros) se sirven del caché
4. **Después de 5 minutos** la entrada expira y se consulta DB nuevamente

### Estadísticas

El caché mantiene estadísticas de rendimiento:

```javascript
searchCache.getStats()
// Retorna:
{
  size: 45,           // Entradas actuales
  maxSize: 100,       // Máximo permitido
  hits: 120,          // Veces que se usó el caché
  misses: 30,         // Veces que no estaba en caché
  hitRate: "80.00",   // Porcentaje de aciertos
  ttl: 300000         // Tiempo de vida en ms
}
```

### Limpieza Automática

- Cada 10 minutos se eliminan entradas expiradas
- Si el caché está lleno, se elimina la entrada más antigua (FIFO)

---

## Prevención de Duplicados

### Archivo: `middleware/searchValidation.js`

### Función: `preventDuplicateSearches`

**Previene:** Búsquedas idénticas en menos de 2 segundos

```javascript
SEARCH_COOLDOWN = 2000; // 2 segundos
```

**Ejemplo:**

1. Usuario busca "john" → ✅ Permitido
2. Usuario busca "john" 1 segundo después → ❌ Bloqueado
3. Usuario busca "john" 3 segundos después → ✅ Permitido

**Respuesta cuando se bloquea:**

```json
{
  "success": false,
  "message": "Por favor, espera un momento antes de repetir la misma búsqueda"
}
```

---

## Uso en el Frontend

### Implementación Recomendada

```javascript
// 1. Implementar Debouncing (ya lo tienes)
const debounce = (func, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
};

// 2. Función de búsqueda
const searchUsers = async (query) => {
  try {
    const response = await fetch(
      `/api/users/search?q=${encodeURIComponent(query)}&page=1&limit=10`,
      {
        credentials: 'include', // Importante para cookies
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        // Rate limit excedido
        const data = await response.json();
        console.warn('Rate limit:', data.message);
        // Mostrar mensaje al usuario
        return;
      }
      throw new Error('Error en la búsqueda');
    }

    const data = await response.json();

    // Verificar si viene del caché
    if (data.cached) {
      console.log('✅ Resultado del caché');
    }

    return data.data; // Array de usuarios
  } catch (error) {
    console.error('Error:', error);
  }
};

// 3. Aplicar debouncing
const debouncedSearch = debounce(searchUsers, 500);

// 4. Usar en el input
inputElement.addEventListener('input', (e) => {
  const query = e.target.value;

  // Validación mínima en frontend
  if (query.length < 2) {
    // Limpiar resultados
    return;
  }

  debouncedSearch(query);
});
```

### Manejo de Errores

```javascript
// Manejar diferentes códigos de error
const handleSearchError = (response) => {
  switch (response.status) {
    case 400:
      return 'Búsqueda inválida';
    case 401:
      return 'Debes iniciar sesión';
    case 429:
      return 'Demasiadas búsquedas, espera un momento';
    case 500:
      return 'Error del servidor';
    default:
      return 'Error desconocido';
  }
};
```

---

## Monitoreo y Logs

### Logs Implementados

#### 1. Búsquedas Exitosas

```javascript
console.log(`🔍 [SEARCH] Usuario: ${userId} - Query: "${query}"`);
```

#### 2. Rate Limit Excedido

```javascript
console.warn(`⚠️ [RATE LIMIT] Búsqueda bloqueada para ${ip} - Usuario: ${userId}`);
```

#### 3. Caché Hit

```javascript
console.log(`✅ [CACHE HIT] Query: "${query}" - Hit rate: 80%`);
```

#### 4. Caché Set

```javascript
console.log(`💾 [CACHE SET] Query: "${query}" - Cache size: 45/100`);
```

### Métricas Recomendadas

Para producción, considera implementar:

1. **Conteo de búsquedas por usuario**
   - Identificar usuarios que abusan del sistema
2. **Tasa de aciertos del caché**
   - Optimizar el TTL según el hit rate
3. **Búsquedas más frecuentes**
   - Identificar patrones de uso
4. **Tiempo de respuesta**
   - Monitorear rendimiento de la DB

---

## Ejemplo de Flujo Completo

```
Usuario escribe "joh" en el input
    ↓
Frontend: Debounce espera 500ms
    ↓
Usuario deja de escribir
    ↓
Frontend: Hace petición GET /api/users/search?q=joh
    ↓
Backend: authMiddleware → ✅ Usuario autenticado
    ↓
Backend: searchLimiter → ✅ 15/20 búsquedas usadas
    ↓
Backend: validateSearchQuery → ✅ "joh" es válido
    ↓
Backend: validatePagination → ✅ page=1, limit=10
    ↓
Backend: preventDuplicateSearches → ✅ No es duplicado
    ↓
Backend: cacheMiddleware → ❌ No está en caché
    ↓
Backend: Consulta a Supabase
    ↓
Backend: Guarda resultado en caché
    ↓
Backend: Retorna resultados
    ↓
Frontend: Muestra usuarios encontrados
```

---

## Configuración Recomendada por Entorno

### Desarrollo

```javascript
searchLimiter: {
  max: 100;
} // Más permisivo
ttl: 1 * 60 * 1000; // 1 minuto de caché
```

### Producción

```javascript
searchLimiter: {
  max: 20;
} // Más restrictivo
ttl: 5 * 60 * 1000; // 5 minutos de caché
```

---

## Resumen de Archivos Creados

1. ✅ `middleware/rateLimiters.js` - Rate limiters especializados
2. ✅ `middleware/searchValidation.js` - Validación de búsquedas
3. ✅ `middleware/searchCache.js` - Sistema de caché
4. ✅ `routes/users.js` - Ruta de búsqueda protegida
5. ✅ `index.js` - Registro de rutas (actualizado)
6. ✅ `routes/auth.js` - Uso de rate limiter centralizado (actualizado)

---

## Próximos Pasos Recomendados

1. **Crear tabla de perfiles** en Supabase si no existe
2. **Ajustar los límites** según tu caso de uso
3. **Implementar el frontend** con debouncing
4. **Monitorear logs** para ajustar configuración
5. **Considerar Redis** para caché distribuido en producción

---

## Preguntas Frecuentes

### ¿Por qué usar caché en memoria y no Redis?

Para aplicaciones pequeñas/medianas, el caché en memoria es suficiente y más simple. Para aplicaciones con múltiples instancias del servidor, considera Redis.

### ¿Cómo ajusto los límites?

Edita `middleware/rateLimiters.js` y modifica los valores de `max` y `windowMs`.

### ¿El caché se comparte entre usuarios?

Sí, el caché es global. Si dos usuarios buscan "john", ambos obtendrán el mismo resultado cacheado.

### ¿Qué pasa si reinicio el servidor?

El caché en memoria se pierde. Esto es normal y esperado. Si necesitas persistencia, usa Redis.

---

## Contacto y Soporte

Para más información sobre la implementación, revisa los comentarios en cada archivo de middleware.
