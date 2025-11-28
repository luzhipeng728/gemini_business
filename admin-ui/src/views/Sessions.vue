<template>
  <div>
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-2xl font-bold text-gray-900">会话管理</h1>
      <button @click="cleanupSessions" class="btn btn-secondary">
        清理过期
      </button>
    </div>

    <!-- Filters -->
    <div class="card mb-6">
      <div class="flex gap-4 items-end">
        <div>
          <label class="form-label">状态</label>
          <select v-model="filters.status" class="form-input">
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="migrated">Migrated</option>
          </select>
        </div>
        <div>
          <label class="form-label">服务商</label>
          <select v-model="filters.provider_id" class="form-input">
            <option value="">All</option>
            <option v-for="p in providers" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
        <button @click="loadSessions" class="btn btn-primary">筛选</button>
      </div>
    </div>

    <!-- Sessions Table -->
    <div class="card p-0">
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>服务商</th>
              <th>用户</th>
              <th>状态</th>
              <th>消息数</th>
              <th>上下文哈希</th>
              <th>最后访问</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="8" class="text-center py-8 text-gray-500">加载中...</td>
            </tr>
            <tr v-else-if="sessions.length === 0">
              <td colspan="8" class="text-center py-8 text-gray-500">暂无会话</td>
            </tr>
            <tr v-for="session in sessions" :key="session.id">
              <td>{{ session.id }}</td>
              <td>{{ getProviderName(session.provider_id) }}</td>
              <td>{{ session.user_id || '-' }}</td>
              <td>
                <span :class="getStatusBadgeClass(session.status)">
                  {{ session.status }}
                </span>
              </td>
              <td>{{ session.message_count }}</td>
              <td>
                <code class="text-xs bg-gray-100 px-2 py-1 rounded">
                  {{ session.context_hash_head.substring(0, 8) }}...{{ session.context_hash_tail.substring(0, 8) }}
                </code>
              </td>
              <td>{{ formatDate(session.last_accessed_at) }}</td>
              <td>
                <button @click="deleteSession(session)" class="btn btn-sm btn-danger">
                  Delete
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div class="p-4 border-t flex justify-between items-center">
        <div class="text-sm text-gray-600">
          共计: {{ pagination.total }} sessions
        </div>
        <div class="flex gap-2">
          <button
            @click="changePage(pagination.page - 1)"
            :disabled="pagination.page <= 1"
            class="btn btn-sm btn-secondary"
          >
            上一页
          </button>
          <span class="px-3 py-1.5 text-sm">
            第 {{ pagination.page }} 页，共 {{ Math.ceil(pagination.total / pagination.limit) || 1 }}
          </span>
          <button
            @click="changePage(pagination.page + 1)"
            :disabled="pagination.page >= Math.ceil(pagination.total / pagination.limit)"
            class="btn btn-sm btn-secondary"
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../api'

const loading = ref(true)
const sessions = ref([])
const providers = ref([])

const filters = ref({
  status: '',
  provider_id: ''
})

const pagination = ref({
  page: 1,
  limit: 20,
  total: 0
})

onMounted(async () => {
  try {
    const res = await api.getProviders()
    providers.value = res.providers || []
  } catch (error) {
    console.error('Failed to load providers:', error)
  }
  await loadSessions()
})

async function loadSessions() {
  loading.value = true
  try {
    const params = {
      page: pagination.value.page,
      limit: pagination.value.limit,
      ...(filters.value.status && { status: filters.value.status }),
      ...(filters.value.provider_id && { provider_id: filters.value.provider_id })
    }
    const res = await api.getSessions(params)
    sessions.value = res.sessions || []
    pagination.value.total = res.total || 0
  } catch (error) {
    console.error('Failed to load sessions:', error)
  } finally {
    loading.value = false
  }
}

function getProviderName(providerId) {
  const provider = providers.value.find(p => p.id === providerId)
  return provider?.name || `#${providerId}`
}

function getStatusBadgeClass(status) {
  const classes = {
    active: 'badge badge-success',
    expired: 'badge badge-gray',
    migrated: 'badge badge-warning'
  }
  return classes[status] || 'badge badge-gray'
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString()
}

function changePage(page) {
  pagination.value.page = page
  loadSessions()
}

async function deleteSession(session) {
  if (!confirm(`Delete session #${session.id}?`)) return
  try {
    await api.deleteSession(session.id)
    await loadSessions()
  } catch (error) {
    alert('Failed to delete: ' + (error.message || 'Unknown error'))
  }
}

async function cleanupSessions() {
  if (!confirm('Delete all expired sessions?')) return
  try {
    const res = await api.cleanupSessions()
    alert(`Cleaned up ${res.deleted || 0} sessions`)
    await loadSessions()
  } catch (error) {
    alert('Failed to cleanup: ' + (error.message || 'Unknown error'))
  }
}
</script>
