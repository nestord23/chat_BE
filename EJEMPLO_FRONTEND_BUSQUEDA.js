/**
 * EJEMPLO DE IMPLEMENTACIÓN EN FRONTEND
 * Sistema de búsqueda de usuarios con debouncing y manejo de errores
 */

// ============================================
// 1. UTILIDADES
// ============================================

/**
 * Función de debounce para retrasar la ejecución
 * @param {Function} func - Función a ejecutar
 * @param {number} delay - Delay en milisegundos
 */
function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

/**
 * AbortController para cancelar peticiones anteriores
 */
let searchAbortController = null;

// ============================================
// 2. CLASE DE BÚSQUEDA DE USUARIOS
// ============================================

class UserSearchManager {
  constructor(apiBaseUrl = '/api') {
    this.apiBaseUrl = apiBaseUrl;
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutos
    this.minChars = 2;
    this.debounceDelay = 500;
  }

  /**
   * Validación del lado del cliente
   */
  validateQuery(query) {
    if (!query || query.trim().length === 0) {
      return { valid: false, error: 'La búsqueda no puede estar vacía' };
    }

    if (query.length < this.minChars) {
      return { valid: false, error: `Mínimo ${this.minChars} caracteres` };
    }

    if (query.length > 50) {
      return { valid: false, error: 'Máximo 50 caracteres' };
    }

    // Validar caracteres permitidos
    const allowedPattern = /^[a-zA-Z0-9\s\-_áéíóúÁÉÍÓÚñÑüÜ]+$/;
    if (!allowedPattern.test(query)) {
      return { valid: false, error: 'Caracteres no permitidos' };
    }

    return { valid: true };
  }

  /**
   * Verificar caché local
   */
  getCached(query, page = 1, limit = 10) {
    const key = `${query}_${page}_${limit}`;
    const cached = this.cache.get(key);

    if (!cached) return null;

    // Verificar si expiró
    if (Date.now() - cached.timestamp > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }

    console.log('✅ Usando caché local del frontend');
    return cached.data;
  }

  /**
   * Guardar en caché local
   */
  setCache(query, data, page = 1, limit = 10) {
    const key = `${query}_${page}_${limit}`;
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });

    // Limpiar caché si es muy grande
    if (this.cache.size > 50) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  /**
   * Realizar búsqueda en el backend
   */
  async performSearch(query, page = 1, limit = 10) {
    // Validar query
    const validation = this.validateQuery(query);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Verificar caché local primero
    const cached = this.getCached(query, page, limit);
    if (cached) {
      return { ...cached, fromCache: true };
    }

    // Cancelar búsqueda anterior si existe
    if (searchAbortController) {
      searchAbortController.abort();
    }

    // Crear nuevo AbortController
    searchAbortController = new AbortController();

    try {
      const url = `${this.apiBaseUrl}/users/search?q=${encodeURIComponent(
        query
      )}&page=${page}&limit=${limit}`;

      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include', // Importante para cookies de sesión
        headers: {
          'Content-Type': 'application/json',
        },
        signal: searchAbortController.signal,
      });

      // Manejar diferentes códigos de error
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        switch (response.status) {
          case 400:
            throw new Error(errorData.message || 'Búsqueda inválida');
          case 401:
            throw new Error('Debes iniciar sesión para buscar usuarios');
          case 429:
            throw new Error(errorData.message || 'Demasiadas búsquedas. Espera un momento.');
          case 500:
            throw new Error('Error del servidor. Intenta de nuevo más tarde.');
          default:
            throw new Error('Error desconocido');
        }
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Error en la búsqueda');
      }

      // Guardar en caché local
      this.setCache(query, data, page, limit);

      // Indicar si vino del caché del backend
      if (data.cached) {
        console.log('✅ Resultado del caché del backend');
      }

      return data;
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Búsqueda cancelada');
        return null;
      }
      throw error;
    }
  }

  /**
   * Búsqueda con debouncing
   */
  search = debounce(async (query, callback, page = 1, limit = 10) => {
    try {
      const result = await this.performSearch(query, page, limit);
      if (result) {
        callback(null, result);
      }
    } catch (error) {
      callback(error, null);
    }
  }, this.debounceDelay);

  /**
   * Limpiar caché
   */
  clearCache() {
    this.cache.clear();
    console.log('🧹 Caché local limpiado');
  }
}

// ============================================
// 3. EJEMPLO DE USO CON VANILLA JS
// ============================================

// Crear instancia del manager
const userSearch = new UserSearchManager('/api');

// Referencias a elementos del DOM
const searchInput = document.getElementById('userSearchInput');
const resultsContainer = document.getElementById('searchResults');
const loadingIndicator = document.getElementById('loadingIndicator');
const errorContainer = document.getElementById('errorContainer');

/**
 * Mostrar loading
 */
function showLoading() {
  if (loadingIndicator) {
    loadingIndicator.style.display = 'block';
  }
}

/**
 * Ocultar loading
 */
function hideLoading() {
  if (loadingIndicator) {
    loadingIndicator.style.display = 'none';
  }
}

/**
 * Mostrar error
 */
function showError(message) {
  if (errorContainer) {
    errorContainer.textContent = message;
    errorContainer.style.display = 'block';
    setTimeout(() => {
      errorContainer.style.display = 'none';
    }, 5000);
  }
}

/**
 * Renderizar resultados
 */
function renderResults(users, pagination) {
  if (!resultsContainer) return;

  // Limpiar resultados anteriores
  resultsContainer.innerHTML = '';

  if (!users || users.length === 0) {
    resultsContainer.innerHTML = '<p class="no-results">No se encontraron usuarios</p>';
    return;
  }

  // Crear lista de usuarios
  const userList = document.createElement('ul');
  userList.className = 'user-list';

  users.forEach((user) => {
    const userItem = document.createElement('li');
    userItem.className = 'user-item';
    userItem.innerHTML = `
      <div class="user-avatar">
        <img src="${user.avatar_url || '/default-avatar.png'}" alt="${user.username}">
      </div>
      <div class="user-info">
        <h4>${user.username}</h4>
        <p>${user.email}</p>
      </div>
      <button class="btn-start-chat" data-user-id="${user.id}">
        Iniciar Chat
      </button>
    `;
    userList.appendChild(userItem);
  });

  resultsContainer.appendChild(userList);

  // Agregar paginación si es necesario
  if (pagination && pagination.totalPages > 1) {
    const paginationDiv = document.createElement('div');
    paginationDiv.className = 'pagination';
    paginationDiv.innerHTML = `
      <p>Página ${pagination.page} de ${pagination.totalPages}</p>
      <p>Total: ${pagination.total} usuarios</p>
    `;
    resultsContainer.appendChild(paginationDiv);
  }

  // Agregar event listeners a los botones
  document.querySelectorAll('.btn-start-chat').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const userId = e.target.dataset.userId;
      startChat(userId);
    });
  });
}

/**
 * Iniciar chat con un usuario
 */
function startChat(userId) {
  console.log('Iniciando chat con usuario:', userId);
  // Aquí implementarías la lógica para iniciar el chat
  // Por ejemplo, redirigir a la página de chat o abrir un modal
}

/**
 * Manejar input de búsqueda
 */
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();

    // Si está vacío o muy corto, limpiar resultados
    if (query.length < 2) {
      resultsContainer.innerHTML = '';
      return;
    }

    // Mostrar loading
    showLoading();

    // Realizar búsqueda con debouncing
    userSearch.search(query, (error, result) => {
      hideLoading();

      if (error) {
        showError(error.message);
        resultsContainer.innerHTML = '';
        return;
      }

      if (result) {
        renderResults(result.data, result.pagination);
      }
    });
  });

  // Limpiar resultados cuando se borra el input
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      resultsContainer.innerHTML = '';
    }
  });
}

// ============================================
// 4. EJEMPLO DE USO CON REACT
// ============================================

/*
import React, { useState, useCallback } from 'react';

const UserSearch = () => {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState(null);

  const userSearch = new UserSearchManager('/api');

  const handleSearch = useCallback((searchQuery) => {
    if (searchQuery.length < 2) {
      setUsers([]);
      return;
    }

    setLoading(true);
    setError(null);

    userSearch.search(searchQuery, (err, result) => {
      setLoading(false);

      if (err) {
        setError(err.message);
        setUsers([]);
        return;
      }

      if (result) {
        setUsers(result.data);
        setPagination(result.pagination);
      }
    });
  }, []);

  const handleInputChange = (e) => {
    const value = e.target.value;
    setQuery(value);
    handleSearch(value);
  };

  const startChat = (userId) => {
    console.log('Iniciando chat con:', userId);
    // Implementar lógica de chat
  };

  return (
    <div className="user-search">
      <input
        type="text"
        value={query}
        onChange={handleInputChange}
        placeholder="Buscar usuarios..."
        className="search-input"
      />

      {loading && <div className="loading">Buscando...</div>}
      
      {error && <div className="error">{error}</div>}

      <div className="results">
        {users.length === 0 && query.length >= 2 && !loading && (
          <p>No se encontraron usuarios</p>
        )}

        {users.map((user) => (
          <div key={user.id} className="user-item">
            <img src={user.avatar_url || '/default-avatar.png'} alt={user.username} />
            <div>
              <h4>{user.username}</h4>
              <p>{user.email}</p>
            </div>
            <button onClick={() => startChat(user.id)}>
              Iniciar Chat
            </button>
          </div>
        ))}
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="pagination">
          <p>Página {pagination.page} de {pagination.totalPages}</p>
        </div>
      )}
    </div>
  );
};

export default UserSearch;
*/

// ============================================
// 5. ESTILOS CSS BÁSICOS
// ============================================

/*
.user-search {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
}

.search-input {
  width: 100%;
  padding: 12px;
  font-size: 16px;
  border: 2px solid #ddd;
  border-radius: 8px;
  margin-bottom: 20px;
}

.search-input:focus {
  outline: none;
  border-color: #007bff;
}

.loading {
  text-align: center;
  padding: 20px;
  color: #666;
}

.error {
  background-color: #fee;
  color: #c00;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.user-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.user-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  margin-bottom: 8px;
  transition: background-color 0.2s;
}

.user-item:hover {
  background-color: #f5f5f5;
}

.user-avatar img {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
}

.user-info {
  flex: 1;
}

.user-info h4 {
  margin: 0 0 4px 0;
  font-size: 16px;
}

.user-info p {
  margin: 0;
  font-size: 14px;
  color: #666;
}

.btn-start-chat {
  padding: 8px 16px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s;
}

.btn-start-chat:hover {
  background-color: #0056b3;
}

.no-results {
  text-align: center;
  color: #666;
  padding: 40px 20px;
}

.pagination {
  text-align: center;
  margin-top: 20px;
  padding: 12px;
  background-color: #f5f5f5;
  border-radius: 8px;
}

.pagination p {
  margin: 4px 0;
  color: #666;
  font-size: 14px;
}
*/
