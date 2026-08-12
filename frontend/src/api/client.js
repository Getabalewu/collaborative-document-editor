const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

function getToken() {
  return localStorage.getItem('token');
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

export const api = {
  register: (body) => request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),

  getDocuments: () => request('/documents'),
  getRecentDocuments: () => request('/documents/recent'),
  createDocument: (title) => request('/documents', { method: 'POST', body: JSON.stringify({ title }) }),
  getDocument: (id) => request(`/documents/${id}`),
  openDocument: (id) => request(`/documents/${id}/open`, { method: 'POST' }),
  updateDocument: (id, body) => request(`/documents/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteDocument: (id) => request(`/documents/${id}`, { method: 'DELETE' }),
  duplicateDocument: (id) => request(`/documents/${id}/duplicate`, { method: 'POST' }),
  saveDocument: (id, body) => request(`/documents/${id}/save`, { method: 'POST', body: JSON.stringify(body) }),

  getVersions: (id) => request(`/documents/${id}/versions`),
  restoreVersion: (docId, versionId) =>
    request(`/documents/${docId}/versions/${versionId}/restore`, { method: 'POST' }),

  getComments: (id) => request(`/documents/${id}/comments`),
  addComment: (id, text, parent = null) =>
    request(`/documents/${id}/comments`, { method: 'POST', body: JSON.stringify({ text, parent }) }),
  updateComment: (docId, commentId, body) =>
    request(`/documents/${docId}/comments/${commentId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteComment: (docId, commentId) =>
    request(`/documents/${docId}/comments/${commentId}`, { method: 'DELETE' }),

  forgotPassword: (body) => request('/auth/forgot-password', { method: 'POST', body: JSON.stringify(body) }),
  resetPassword: (body) => request('/auth/reset-password', { method: 'POST', body: JSON.stringify(body) }),
  shareDocument: (id, email, permission) =>
    request(`/documents/${id}/share`, { method: 'POST', body: JSON.stringify({ email, permission }) }),
  removeCollaborator: (docId, userId) =>
    request(`/documents/${docId}/share/${userId}`, { method: 'DELETE' }),
  getCollaborators: (id) => request(`/documents/${id}/collaborators`),
  searchUsers: (q = '') => request(`/documents/search/users?q=${encodeURIComponent(q)}`),
};

export function getSocketUrl() {
  return import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
}
