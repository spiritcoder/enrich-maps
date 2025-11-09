import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const auth = {
  register: (data) => api.post('/api/auth/register', data),
  login: (data) => api.post('/api/auth/login', data),
};

// User API
export const user = {
  getProfile: () => api.get('/api/users/profile'),
  getUsage: () => api.get('/api/users/usage'),
};

// Projects API
export const projects = {
  create: (data) => api.post('/api/projects', data),
  list: () => api.get('/api/projects'),
  get: (id) => api.get(`/api/projects/${id}`),
  delete: (id) => api.delete(`/api/projects/${id}`),
  enrich: (id, enrichmentData) => api.post(`/api/projects/${id}/enrich`, enrichmentData),
  retryFailed: (id) => api.post(`/api/projects/${id}/retry-failed`),
  recalculateResults: (id) => api.post(`/api/projects/${id}/recalculate-results`),
};

// Countries API
export const countries = {
  getAll: () => api.get('/api/countries'),
  getPopular: () => api.get('/api/countries/popular'),
};

// Payments API
export const payments = {
  getPlans: () => api.get('/api/payments/plans'),
  getCreditPackages: () => api.get('/api/payments/credit-packages'),
  purchaseCredits: (data) => api.post('/api/payments/purchase-credits', data),
  updateSubscription: (data) => api.post('/api/payments/update-subscription', data),
  getTransactions: () => api.get('/api/payments/transactions'),
};

// Enrichment API
export const enrichment = {
  getProviders: () => api.get('/api/enrichment/providers'),
  getFields: () => api.get('/api/enrichment/fields'),
  calculateCost: (data) => api.post('/api/enrichment/calculate-cost', data),
};

// Validation API
export const validation = {
  validateExcel: (formData) => api.post('/api/validate-excel', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  }),
};

// Data Enricher Recovery API
export const dataEnricher = {
  retryEnrichment: (id) => api.post(`/api/projects/${id}/retry-enrichment`),
  getStats: (id) => api.get(`/api/projects/${id}/enrichment-stats`),
};

// Excel Lookup API
export const createExcelLookupProject = async (formData) => {
  try {
    const response = await api.post('/api/projects/excel-lookup', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return { success: true, project: response.data.project, validation: response.data.validation };
  } catch (error) {
    const message = error.response?.data?.error || error.message || 'Upload failed';
    throw new Error(message);
  }
};

// Data Enricher API
export const createDataEnricherProject = async (formData) => {
  try {
    const response = await api.post('/api/projects/data-enricher', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return { success: true, project: response.data.project, validation: response.data.validation };
  } catch (error) {
    const message = error.response?.data?.error || error.message || 'Upload failed';
    throw new Error(message);
  }
};

export default api;