const request = require('supertest');
const path = require('path');

// Mock de Supabase para tests
jest.mock('../config/supabase', () => ({
  createSupabaseServerClient: jest.fn(() => ({
    auth: {
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
      getSession: jest.fn(),
      getUser: jest.fn(),
      refreshSession: jest.fn(),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
    })),
  })),
}));

// Mock de CSRF middleware
jest.mock('../middleware/csrf', () => ({
  generateToken: jest.fn(() => 'mock-csrf-token'),
  csrfProtection: (req, res, next) => next(),
  invalidCsrfTokenError: Error,
  validateRequest: jest.fn(),
}));

// Importar app después de los mocks
const app = require('../index');

describe('Security Patches Tests', () => {
  
  describe('PATCH H: Email Validation', () => {
    it('should reject invalid email format', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'invalid-email',
          password: 'password123',
          username: 'testuser'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('email inválido');
    });
  });

  describe('PATCH A: CSRF Protection', () => {
    it('should provide CSRF token endpoint', async () => {
      const response = await request(app)
        .get('/api/auth/csrf-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('csrfToken');
    });
  });

  describe('Basic Auth Flow', () => {
    it('should return 400 for missing fields in register', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com'
          // Missing password and username
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should return 400 for missing fields in login', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com'
          // Missing password
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should validate username format', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123',
          username: 'ab' // Too short
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('3-20 caracteres');
    });

    it('should validate password length', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'short', // Too short
          username: 'testuser'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('8 caracteres');
    });
  });
});

describe('API Endpoints', () => {
  it('should return server info on root endpoint', async () => {
    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('message');
    expect(response.body).toHaveProperty('status', 'online');
  });
});
