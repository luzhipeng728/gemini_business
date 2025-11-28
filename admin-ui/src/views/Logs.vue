<template>
  <div>
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-2xl font-bold text-gray-900">请求日志</h1>
    </div>

    <!-- Filters -->
    <div class="card mb-6">
      <div class="flex flex-wrap gap-4 items-end">
        <div>
          <label class="form-label">用户</label>
          <select v-model="filters.user_id" class="form-input">
            <option value="">全部</option>
            <option v-for="u in users" :key="u.id" :value="u.id">{{ u.username }}</option>
          </select>
        </div>
        <div>
          <label class="form-label">服务商</label>
          <select v-model="filters.provider_id" class="form-input">
            <option value="">全部</option>
            <option v-for="p in providers" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
        <div>
          <label class="form-label">模型</label>
          <input v-model="filters.model" class="form-input" placeholder="e.g. gemini-2.0-flash" />
        </div>
        <div>
          <label class="form-label">状态</label>
          <select v-model="filters.status_code" class="form-input">
            <option value="">全部</option>
            <option value="200">成功 (200)</option>
            <option value="400">错误请求 (4xx)</option>
            <option value="500">服务错误 (5xx)</option>
          </select>
        </div>
        <button @click="loadLogs" class="btn btn-primary">筛选</button>
      </div>
    </div>

    <!-- Logs Table -->
    <div class="card p-0">
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>用户</th>
              <th>服务商</th>
              <th>模型</th>
              <th>类型</th>
              <th>Token</th>
              <th>延迟</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="8" class="text-center py-8 text-gray-500">加载中...</td>
            </tr>
            <tr v-else-if="logs.length === 0">
              <td colspan="8" class="text-center py-8 text-gray-500">暂无日志</td>
            </tr>
            <tr v-for="log in logs" :key="log.id" :class="{ 'bg-red-50': log.status_code >= 400 }">
              <td class="text-sm">{{ formatDate(log.created_at) }}</td>
              <td>{{ getUserName(log.user_id) }}</td>
              <td>{{ getProviderName(log.provider_id) }}</td>
              <td>
                <code class="text-xs bg-gray-100 px-2 py-1 rounded">{{ log.model }}</code>
              </td>
              <td>{{ log.request_type }}</td>
              <td>
                <span class="text-green-600">{{ log.input_tokens || 0 }}</span>
                /
                <span class="text-blue-600">{{ log.output_tokens || 0 }}</span>
              </td>
              <td>{{ log.latency_ms }}ms</td>
              <td>
                <span :class="getStatusClass(log.status_code)">
                  {{ log.status_code }}
                </span>
                <span v-if="log.error_message" class="block text-xs text-red-600 max-w-xs truncate" :title="log.error_message">
                  {{ log.error_message }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      <div class="p-4 border-t flex justify-between items-center">
        <div class="text-sm text-gray-600">
          共计: {{ pagination.total }} 条日志
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
const logs = ref([])
const users = ref([])
const providers = ref([])

const filters = ref({
  user_id: '',
  provider_id: '',
  model: '',
  status_code: ''
})

const pagination = ref({
  page: 1,
  limit: 50,
  total: 0
})

onMounted(async () => {
  try {
    const [usersRes, providersRes] = await Promise.all([
      api.getUsers(),
      api.getProviders()
    ])
    users.value = usersRes.users || []
    providers.value = providersRes.providers || []
  } catch (error) {
    console.error('Failed to load filters:', error)
  }
  await loadLogs()
})

async function loadLogs() {
  loading.value = true
  try {
    const params = {
      page: pagination.value.page,
      limit: pagination.value.limit,
      ...(filters.value.user_id && { user_id: filters.value.user_id }),
      ...(filters.value.provider_id && { provider_id: filters.value.provider_id }),
      ...(filters.value.model && { model: filters.value.model }),
      ...(filters.value.status_code && { status_code: filters.value.status_code })
    }
    const res = await api.getLogs(params)
    logs.value = res.logs || []
    pagination.value.total = res.total || 0
  } catch (error) {
    console.error('Failed to load logs:', error)
  } finally {
    loading.value = false
  }
}

function getUserName(userId) {
  if (!userId) return '-'
  const user = users.value.find(u => u.id === userId)
  return user?.username || `#${userId}`
}

function getProviderName(providerId) {
  if (!providerId) return '-'
  const provider = providers.value.find(p => p.id === providerId)
  return provider?.name || `#${providerId}`
}

function getStatusClass(status) {
  if (status >= 500) return 'badge badge-danger'
  if (status >= 400) return 'badge badge-warning'
  return 'badge badge-success'
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString()
}

function changePage(page) {
  pagination.value.page = page
  loadLogs()
}
</script>
