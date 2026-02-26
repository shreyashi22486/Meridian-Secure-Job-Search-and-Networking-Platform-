/**
 * API client — all backend calls go through here.
 * Uses cookies for auth (HttpOnly, so no manual token management).
 */
import axios from 'axios';

const api = axios.create({
    baseURL: '/api',
    withCredentials: true,          // Send cookies with every request
    headers: { 'Content-Type': 'application/json' },
});

// Attach CSRF token to mutating requests
api.interceptors.request.use((config) => {
    if (['post', 'put', 'delete', 'patch'].includes(config.method)) {
        const csrfToken = localStorage.getItem('csrf_token');
        if (csrfToken) {
            config.headers['X-CSRF-Token'] = csrfToken;
        }
    }
    return config;
});

// Auto-refresh on 401 (skip for auth endpoints and initial user fetch)
const skipRefreshUrls = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout', '/auth/csrf', '/users/me'];
api.interceptors.response.use(
    (res) => res,
    async (error) => {
        const original = error.config;
        const shouldSkip = skipRefreshUrls.some(url => original.url?.includes(url));
        if (error.response?.status === 401 && !original._retry && !shouldSkip) {
            original._retry = true;
            try {
                await api.post('/auth/refresh');
                return api(original);
            } catch {
                // Refresh failed — let the calling code handle it
                return Promise.reject(error);
            }
        }
        return Promise.reject(error);
    }
);

// ─── Auth ─────────────────────────────────────────────────────────────────

export const authApi = {
    register: (data) => api.post('/auth/register', data),
    login: (data) => api.post('/auth/login', data),
    verify2FA: (data) => api.post('/auth/verify-2fa', data),
    setup2FA: () => api.post('/auth/setup-2fa'),
    confirm2FA: (code) => api.post('/auth/confirm-2fa', { code }),
    refresh: () => api.post('/auth/refresh'),
    logout: () => api.post('/auth/logout'),
    getCSRF: () => api.get('/auth/csrf'),
    sessions: () => api.get('/auth/sessions'),
    revokeSession: (id) => api.delete(`/auth/sessions/${id}`),
};

// ─── Users ────────────────────────────────────────────────────────────────

export const userApi = {
    me: () => api.get('/users/me'),
    updateProfile: (data) => api.put('/users/me', data),
    changePassword: (data) => api.put('/users/me/password', data),
    getUser: (id) => api.get(`/users/${id}`),
};

// ─── Resumes ──────────────────────────────────────────────────────────────

export const resumeApi = {
    upload: (file) => {
        const fd = new FormData();
        fd.append('file', file);
        return api.post('/resumes/upload', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },
    list: () => api.get('/resumes/me'),
    download: (id) => api.get(`/resumes/${id}/download`, { responseType: 'blob' }),
    remove: (id) => api.delete(`/resumes/${id}`),
};

// ─── Admin ────────────────────────────────────────────────────────────────

export const adminApi = {
    listUsers: (params) => api.get('/admin/users', { params }),
    changeRole: (userId, role) => api.put(`/admin/users/${userId}/role`, null, { params: { role } }),
    suspend: (userId) => api.put(`/admin/users/${userId}/suspend`),
    deleteUser: (userId) => api.delete(`/admin/users/${userId}`),
    auditLogs: (params) => api.get('/admin/audit-logs', { params }),
};

export default api;
