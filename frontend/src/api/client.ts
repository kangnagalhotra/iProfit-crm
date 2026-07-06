import axios from 'axios';

// In local dev, Vite proxies "/api" to the backend (see vite.config.ts).
// In production (Netlify), the frontend and backend are on different hosts,
// so VITE_API_URL must point at the deployed backend's "/api" URL.
export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('crm_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('crm_token');
      if (location.pathname !== '/login') location.href = '/login';
    }
    return Promise.reject(err);
  },
);
