/**
 * API Client
 */

import axios from 'axios'

const api = axios.create({
  baseURL: '/admin',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Add auth interceptor
api.interceptors.request.use(config => {
  const auth = localStorage.getItem('admin_auth')
  if (auth) {
    config.headers['Authorization'] = `Basic ${auth}`
  }
  return config
})

// Handle errors
api.interceptors.response.use(
  response => response.data,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('admin_auth')
      window.location.href = '/login'
    }
    return Promise.reject(error.response?.data || error)
  }
)

export default {
  // Auth
  login(username, password) {
    const auth = btoa(`${username}:${password}`)
    localStorage.setItem('admin_auth', auth)
    return this.getOverview()
  },

  logout() {
    localStorage.removeItem('admin_auth')
  },

  isAuthenticated() {
    return !!localStorage.getItem('admin_auth')
  },

  // Stats
  getOverview() {
    return api.get('/stats/overview')
  },

  getProviderStats() {
    return api.get('/stats/providers')
  },

  getRequestStats(timeRange = '24h') {
    return api.get(`/stats/requests?range=${timeRange}`)
  },

  // Provider Groups
  getProviderGroups() {
    return api.get('/provider-groups')
  },

  createProviderGroup(data) {
    return api.post('/provider-groups', data)
  },

  updateProviderGroup(id, data) {
    return api.put(`/provider-groups/${id}`, data)
  },

  deleteProviderGroup(id) {
    return api.delete(`/provider-groups/${id}`)
  },

  // Providers
  getProviders(groupId = null) {
    const url = groupId ? `/providers?group_id=${groupId}` : '/providers'
    return api.get(url)
  },

  createProvider(data) {
    return api.post('/providers', data)
  },

  updateProvider(id, data) {
    return api.put(`/providers/${id}`, data)
  },

  deleteProvider(id) {
    return api.delete(`/providers/${id}`)
  },

  bulkCreateProviders(data) {
    return api.post('/providers/bulk', data)
  },

  resetProviderStats(id) {
    return api.post(`/providers/${id}/reset`)
  },

  // Users
  getUsers() {
    return api.get('/users')
  },

  createUser(data) {
    return api.post('/users', data)
  },

  updateUser(id, data) {
    return api.put(`/users/${id}`, data)
  },

  deleteUser(id) {
    return api.delete(`/users/${id}`)
  },

  // API Keys
  getUserApiKeys(userId) {
    return api.get(`/users/${userId}/api-keys`)
  },

  createApiKey(userId, data) {
    return api.post(`/users/${userId}/api-keys`, data)
  },

  revokeApiKey(userId, keyId) {
    return api.delete(`/users/${userId}/api-keys/${keyId}`)
  },

  // Sessions
  getSessions(params = {}) {
    const query = new URLSearchParams(params).toString()
    return api.get(`/sessions?${query}`)
  },

  deleteSession(id) {
    return api.delete(`/sessions/${id}`)
  },

  cleanupSessions() {
    return api.post('/sessions/cleanup')
  },

  // Logs
  getLogs(params = {}) {
    const query = new URLSearchParams(params).toString()
    return api.get(`/logs?${query}`)
  }
}
