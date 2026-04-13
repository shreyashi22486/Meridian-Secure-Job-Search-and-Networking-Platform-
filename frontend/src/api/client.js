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

// Auto-refresh on 401 with deduplication to prevent race conditions.
// When multiple requests get 401 simultaneously (e.g., during 2FA setup when
// the access token expires), only ONE refresh request is made. All other 401'd
// requests wait for it, then retry with the new token.
const skipRefreshUrls = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout', '/auth/csrf', '/users/me'];
let refreshPromise = null; // Shared promise for concurrent refresh deduplication

api.interceptors.response.use(
    (res) => res,
    async (error) => {
        const original = error.config;
        const shouldSkip = skipRefreshUrls.some(url => original.url?.includes(url));
        if (error.response?.status === 401 && !original._retry && !shouldSkip) {
            original._retry = true;
            try {
                // If a refresh is already in progress, wait for it
                if (!refreshPromise) {
                    refreshPromise = api.post('/auth/refresh').finally(() => {
                        refreshPromise = null;
                    });
                }
                await refreshPromise;
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
    // Core profile
    me: () => api.get('/users/me'),
    updateProfile: (data) => api.put('/users/me', data),
    changePassword: (data) => api.put('/users/me/password', data),
    getUser: (id) => api.get(`/users/${id}`),

    // Avatar — upload via multipart, serve via authenticated blob fetch
    avatarUpload: (file) => {
        const fd = new FormData();
        fd.append('file', file);
        return api.put('/users/me/avatar', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },
    // Returns a blob URL suitable for <img src="...">
    getMyAvatarBlob: async () => {
        const resp = await api.get('/users/me/avatar', { responseType: 'blob' });
        return URL.createObjectURL(resp.data);
    },

    // Education CRUD
    addEducation: (data) => api.post('/users/me/education', data),
    updateEducation: (id, data) => api.put(`/users/me/education/${id}`, data),
    deleteEducation: (id) => api.delete(`/users/me/education/${id}`),

    // Experience CRUD
    addExperience: (data) => api.post('/users/me/experience', data),
    updateExperience: (id, data) => api.put(`/users/me/experience/${id}`, data),
    deleteExperience: (id) => api.delete(`/users/me/experience/${id}`),

    // Skills
    addSkill: (data) => api.post('/users/me/skills', data),
    deleteSkill: (id) => api.delete(`/users/me/skills/${id}`),

    // Privacy
    getPrivacy: () => api.get('/users/me/privacy'),
    updatePrivacy: (data) => api.put('/users/me/privacy', data),

    // Profile viewers
    getViewers: () => api.get('/users/me/viewers'),

    // Other user's avatar as blob URL
    getUserAvatarBlob: async (userId) => {
        try {
            const resp = await api.get(`/users/${userId}/avatar`, { responseType: 'blob' });
            return URL.createObjectURL(resp.data);
        } catch {
            return null;
        }
    },
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
    download: (id, otpCode) => api.get(`/resumes/${id}/download`, {
        responseType: 'blob',
        params: otpCode ? { otp_code: otpCode } : {},
    }),
    verify: (id) => api.get(`/resumes/${id}/verify`),
    remove: (id) => api.delete(`/resumes/${id}`),
};

// ─── Admin ────────────────────────────────────────────────────────────────

export const adminApi = {
    listUsers: (params) => api.get('/admin/users', { params }),
    changeRole: (userId, role) => api.put(`/admin/users/${userId}/role`, null, { params: { role } }),
    suspend: (userId) => api.put(`/admin/users/${userId}/suspend`),
    deleteUser: (userId, otpCode) => api.delete(`/admin/users/${userId}`, {
        params: otpCode ? { otp_code: otpCode } : {},
    }),
    auditLogs: (params) => api.get('/admin/audit-logs', { params }),
    verifyAuditLogs: () => api.get('/admin/audit-logs/verify'),
    // Blockchain
    listBlocks: () => api.get('/admin/blockchain'),
    verifyBlockchain: () => api.get('/admin/blockchain/verify'),
    verifyCheckpoints: () => api.get('/admin/blockchain/verify-checkpoints'),
    exportChain: () => api.get('/admin/blockchain/export'),
    getBlock: (num) => api.get(`/admin/blockchain/block/${num}`),
};

// ─── Companies ────────────────────────────────────────────────────────────

export const companyApi = {
    create: (data) => api.post('/companies/', data),
    list: (params) => api.get('/companies/', { params }),
    get: (id) => api.get(`/companies/${id}`),
    update: (id, data) => api.put(`/companies/${id}`, data),
    remove: (id) => api.delete(`/companies/${id}`),
    addAdmin: (companyId, data) => api.post(`/companies/${companyId}/admins`, data),
    removeAdmin: (companyId, userId) => api.delete(`/companies/${companyId}/admins/${userId}`),
};

// ─── Jobs ─────────────────────────────────────────────────────────────────

export const jobApi = {
    create: (data) => api.post('/jobs/', data),
    search: (params) => api.get('/jobs/', { params }),
    get: (id) => api.get(`/jobs/${id}`),
    update: (id, data) => api.put(`/jobs/${id}`, data),
    remove: (id) => api.delete(`/jobs/${id}`),
    recommended: () => api.get('/jobs/recommended'),
};

// ─── Applications ─────────────────────────────────────────────────────

export const applicationApi = {
    apply: (data) => api.post('/applications/', data),
    myApplications: () => api.get('/applications/me'),
    withdraw: (id) => api.delete(`/applications/${id}`),
    listApplicants: (jobId) => api.get(`/applications/job/${jobId}`),
    updateStatus: (id, status) => api.put(`/applications/${id}/status`, { status }),
    updateNotes: (id, notes) => api.put(`/applications/${id}/notes`, { notes }),
};

export default api;
