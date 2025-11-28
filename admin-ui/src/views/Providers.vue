<template>
  <div>
    <div class="flex justify-between items-center mb-6">
      <div class="flex items-center gap-3">
        <h1 class="text-2xl font-bold text-gray-900">服务商管理</h1>
        <button @click="showHelpModal = true" class="text-blue-600 hover:text-blue-700" title="查看帮助">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </button>
      </div>
      <div class="flex gap-2">
        <button @click="showHelpModal = true" class="btn btn-secondary">
          帮助教程
        </button>
        <button @click="showBulkModal = true" class="btn btn-secondary">
          批量导入
        </button>
        <button @click="showAddModal = true" class="btn btn-primary">
          添加服务商
        </button>
      </div>
    </div>

    <!-- Groups Tabs -->
    <div class="flex gap-2 mb-4 overflow-x-auto pb-2">
      <button
        @click="selectedGroup = null"
        :class="['btn btn-sm', selectedGroup === null ? 'btn-primary' : 'btn-secondary']"
      >
        All ({{ providers.length }})
      </button>
      <button
        v-for="group in groups"
        :key="group.id"
        @click="selectedGroup = group.id"
        :class="['btn btn-sm', selectedGroup === group.id ? 'btn-primary' : 'btn-secondary']"
      >
        {{ group.name }} ({{ getGroupCount(group.id) }})
      </button>
      <button @click="showGroupModal = true" class="btn btn-sm btn-secondary">
        + 分组
      </button>
    </div>

    <!-- Providers Table -->
    <div class="card p-0">
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>分组</th>
              <th>状态</th>
              <th>健康度</th>
              <th>负载</th>
              <th>请求</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="7" class="text-center py-8 text-gray-500">加载中...</td>
            </tr>
            <tr v-else-if="filteredProviders.length === 0">
              <td colspan="7" class="text-center py-8 text-gray-500">暂无服务商</td>
            </tr>
            <tr v-for="provider in filteredProviders" :key="provider.id">
              <td class="font-medium">{{ provider.name }}</td>
              <td>{{ getGroupName(provider.group_id) }}</td>
              <td>
                <span :class="getStatusBadgeClass(provider.status)">
                  {{ provider.status }}
                </span>
              </td>
              <td>
                <div class="flex items-center">
                  <div class="w-16 bg-gray-200 rounded-full h-2 mr-2">
                    <div
                      :class="getHealthBarClass(provider.health_score)"
                      :style="{ width: provider.health_score + '%' }"
                      class="h-2 rounded-full"
                    ></div>
                  </div>
                  <span class="text-sm">{{ provider.health_score }}%</span>
                </div>
              </td>
              <td>{{ provider.current_load }}/{{ provider.max_concurrent }}</td>
              <td>
                <span class="text-gray-900">{{ provider.total_requests }}</span>
                <span class="text-red-500 ml-1" v-if="provider.failed_requests > 0">
                  ({{ provider.failed_requests }} 失败)
                </span>
              </td>
              <td>
                <div class="flex gap-1">
                  <button
                    @click="editProvider(provider)"
                    class="btn btn-sm btn-secondary"
                  >
                    Edit
                  </button>
                  <button
                    @click="resetProvider(provider)"
                    class="btn btn-sm btn-secondary"
                  >
                    Reset
                  </button>
                  <button
                    @click="confirmDelete(provider)"
                    class="btn btn-sm btn-danger"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Add/编辑服务商 Modal -->
    <div v-if="showAddModal || editingProvider" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
        <div class="p-6">
          <h3 class="text-lg font-semibold mb-4">
            {{ editingProvider ? '编辑服务商' : '添加服务商' }}
          </h3>
          <form @submit.prevent="saveProvider" class="space-y-4">
            <div>
              <label class="form-label">名称</label>
              <input v-model="form.name" class="form-input" required />
            </div>
            <div>
              <label class="form-label">分组</label>
              <select v-model="form.group_id" class="form-input">
                <option :value="null">无分组</option>
                <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
              </select>
            </div>
            <div>
              <label class="form-label">Cookies (JSON)</label>
              <textarea v-model="form.cookies" class="form-input h-32" required></textarea>
            </div>
            <div>
              <label class="form-label">CSE Session Index</label>
              <input v-model="form.csesidx" class="form-input" required />
            </div>
            <div>
              <label class="form-label">最大并发</label>
              <input v-model.number="form.max_concurrent" type="number" min="1" class="form-input" />
            </div>
            <div class="flex justify-end gap-2 pt-4">
              <button type="button" @click="closeModal" class="btn btn-secondary">取消</button>
              <button type="submit" class="btn btn-primary">保存</button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- 批量导入 Modal -->
    <div v-if="showBulkModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4">
        <div class="p-6">
          <h3 class="text-lg font-semibold mb-4">批量导入 Providers</h3>
          <div class="space-y-4">
            <div>
              <label class="form-label">分组</label>
              <select v-model="bulkForm.group_id" class="form-input">
                <option :value="null">无分组</option>
                <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
              </select>
            </div>
            <div>
              <label class="form-label">服务商数据 (JSON 数组)</label>
              <textarea
                v-model="bulkForm.data"
                class="form-input h-64 font-mono text-sm"
                placeholder='[{"name": "Provider 1", "cookies": {...}, "csesidx": "..."}]'
              ></textarea>
            </div>
            <div class="flex justify-end gap-2 pt-4">
              <button type="button" @click="showBulkModal = false" class="btn btn-secondary">取消</button>
              <button @click="bulkImport" class="btn btn-primary">导入</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Group Modal -->
    <div v-if="showGroupModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div class="p-6">
          <h3 class="text-lg font-semibold mb-4">添加服务商分组</h3>
          <form @submit.prevent="saveGroup" class="space-y-4">
            <div>
              <label class="form-label">名称</label>
              <input v-model="groupForm.name" class="form-input" required />
            </div>
            <div>
              <label class="form-label">描述</label>
              <input v-model="groupForm.description" class="form-input" />
            </div>
            <div>
              <label class="form-label">优先级</label>
              <input v-model.number="groupForm.priority" type="number" class="form-input" />
            </div>
            <div class="flex justify-end gap-2 pt-4">
              <button type="button" @click="showGroupModal = false" class="btn btn-secondary">取消</button>
              <button type="submit" class="btn btn-primary">保存</button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Help Tutorial Modal -->
    <div v-if="showHelpModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 my-8">
        <div class="p-6">
          <div class="flex justify-between items-center mb-6">
            <h3 class="text-xl font-semibold text-gray-900">服务商添加教程</h3>
            <button @click="showHelpModal = false" class="text-gray-400 hover:text-gray-600">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <div class="space-y-6 text-gray-700">
            <!-- 概述 -->
            <div class="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
              <h4 class="font-semibold text-blue-800 mb-2">什么是服务商？</h4>
              <p class="text-sm text-blue-700">服务商是 Gemini Business 账号的配置信息，系统会自动在多个服务商之间进行负载均衡和故障转移。</p>
            </div>

            <!-- 需要的信息 -->
            <div>
              <h4 class="font-semibold text-gray-900 mb-3">添加服务商需要以下信息：</h4>
              <div class="space-y-4">
                <div class="bg-gray-50 p-4 rounded-lg">
                  <div class="flex items-start gap-3">
                    <span class="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-medium">1</span>
                    <div>
                      <h5 class="font-medium text-gray-900">Cookies (核心必填)</h5>
                      <p class="text-sm text-gray-600 mt-1">从浏览器获取的 Gemini Business 登录 Cookies，支持 JSON 格式或字符串格式。</p>
                      <div class="mt-2 bg-gray-100 p-3 rounded text-xs font-mono overflow-x-auto">
                        <pre class="whitespace-pre-wrap">{
  "NID": "xxx...",
  "__Secure-C_SES": "CSE.xxx...",
  "__Host-C_OSES": "COS.xxx..."
}</pre>
                      </div>
                      <p class="text-xs text-gray-500 mt-2">或直接粘贴 Cookie 字符串：<code class="bg-gray-100 px-1 rounded">NID=xxx; __Secure-C_SES=xxx; __Host-C_OSES=xxx</code></p>
                    </div>
                  </div>
                </div>

                <div class="bg-gray-50 p-4 rounded-lg">
                  <div class="flex items-start gap-3">
                    <span class="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-medium">2</span>
                    <div>
                      <h5 class="font-medium text-gray-900">CSE Session Index (csesidx)</h5>
                      <p class="text-sm text-gray-600 mt-1">Gemini Business 会话索引，从网络请求中获取。</p>
                      <p class="text-xs text-gray-500 mt-1">示例值: <code class="bg-gray-100 px-1 rounded">1585284838</code></p>
                    </div>
                  </div>
                </div>

                <div class="bg-gray-50 p-4 rounded-lg">
                  <div class="flex items-start gap-3">
                    <span class="flex-shrink-0 w-6 h-6 bg-gray-400 text-white rounded-full flex items-center justify-center text-sm font-medium">3</span>
                    <div>
                      <h5 class="font-medium text-gray-900">名称 (可选)</h5>
                      <p class="text-sm text-gray-600 mt-1">便于识别的名称，如 "主账号"、"备用1" 等。</p>
                    </div>
                  </div>
                </div>

                <div class="bg-gray-50 p-4 rounded-lg">
                  <div class="flex items-start gap-3">
                    <span class="flex-shrink-0 w-6 h-6 bg-gray-400 text-white rounded-full flex items-center justify-center text-sm font-medium">4</span>
                    <div>
                      <h5 class="font-medium text-gray-900">最大并发数 (可选)</h5>
                      <p class="text-sm text-gray-600 mt-1">默认为 10，可根据账号限额调整。</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 如何获取 -->
            <div>
              <h4 class="font-semibold text-gray-900 mb-3">如何获取 Cookies 和 csesidx？</h4>
              <ol class="space-y-2 text-sm">
                <li class="flex gap-2">
                  <span class="text-blue-500 font-medium">1.</span>
                  <span>打开浏览器，访问 <code class="bg-gray-100 px-1 rounded">https://business.gemini.google</code></span>
                </li>
                <li class="flex gap-2">
                  <span class="text-blue-500 font-medium">2.</span>
                  <span>使用 Google Workspace 账号登录</span>
                </li>
                <li class="flex gap-2">
                  <span class="text-blue-500 font-medium">3.</span>
                  <span>按 F12 打开开发者工具，切换到 "Network" (网络) 选项卡</span>
                </li>
                <li class="flex gap-2">
                  <span class="text-blue-500 font-medium">4.</span>
                  <span>发送一条消息，找到请求 URL 中的 <code class="bg-gray-100 px-1 rounded">csesidx=xxx</code> 参数</span>
                </li>
                <li class="flex gap-2">
                  <span class="text-blue-500 font-medium">5.</span>
                  <span>切换到 "Application" → "Cookies" → <code class="bg-gray-100 px-1 rounded">https://business.gemini.google</code></span>
                </li>
                <li class="flex gap-2">
                  <span class="text-blue-500 font-medium">6.</span>
                  <span>复制 <code class="bg-gray-100 px-1 rounded">NID</code>、<code class="bg-gray-100 px-1 rounded">__Secure-C_SES</code>、<code class="bg-gray-100 px-1 rounded">__Host-C_OSES</code> 的值</span>
                </li>
              </ol>
            </div>

            <!-- 提示 -->
            <div class="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded">
              <h4 class="font-semibold text-yellow-800 mb-2">注意事项</h4>
              <ul class="text-sm text-yellow-700 space-y-1">
                <li>• Cookies 会过期，如果服务商状态变为 "failed"，需要更新 Cookies</li>
                <li>• 建议添加多个服务商账号，实现负载均衡和高可用</li>
                <li>• 需要 Google Workspace 企业账号才能访问 Gemini Business</li>
              </ul>
            </div>
          </div>

          <div class="flex justify-end pt-6">
            <button @click="showHelpModal = false" class="btn btn-primary">我知道了</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import api from '../api'

const loading = ref(true)
const providers = ref([])
const groups = ref([])
const selectedGroup = ref(null)

const showAddModal = ref(false)
const showBulkModal = ref(false)
const showGroupModal = ref(false)
const showHelpModal = ref(false)
const editingProvider = ref(null)

const form = ref({
  name: '',
  group_id: null,
  cookies: '',
  csesidx: '',
  max_concurrent: 10
})

const bulkForm = ref({
  group_id: null,
  data: ''
})

const groupForm = ref({
  name: '',
  description: '',
  priority: 0
})

const filteredProviders = computed(() => {
  if (selectedGroup.value === null) return providers.value
  return providers.value.filter(p => p.group_id === selectedGroup.value)
})

onMounted(async () => {
  await loadData()
})

async function loadData() {
  loading.value = true
  try {
    const [providersRes, groupsRes] = await Promise.all([
      api.getProviders(),
      api.getProviderGroups()
    ])
    providers.value = providersRes.providers || []
    groups.value = groupsRes.groups || []
  } catch (error) {
    console.error('Failed to load providers:', error)
  } finally {
    loading.value = false
  }
}

function getGroupName(groupId) {
  if (!groupId) return '-'
  const group = groups.value.find(g => g.id === groupId)
  return group?.name || '-'
}

function getGroupCount(groupId) {
  return providers.value.filter(p => p.group_id === groupId).length
}

function getStatusBadgeClass(status) {
  const classes = {
    active: 'badge badge-success',
    cooling: 'badge badge-warning',
    failed: 'badge badge-danger',
    inactive: 'badge badge-gray'
  }
  return classes[status] || 'badge badge-gray'
}

function getHealthBarClass(score) {
  if (score >= 80) return 'bg-green-500'
  if (score >= 50) return 'bg-yellow-500'
  return 'bg-red-500'
}

function editProvider(provider) {
  editingProvider.value = provider
  form.value = {
    name: provider.name,
    group_id: provider.group_id,
    cookies: provider.cookies,
    csesidx: provider.csesidx,
    max_concurrent: provider.max_concurrent
  }
}

function closeModal() {
  showAddModal.value = false
  editingProvider.value = null
  form.value = {
    name: '',
    group_id: null,
    cookies: '',
    csesidx: '',
    max_concurrent: 10
  }
}

async function saveProvider() {
  try {
    if (editingProvider.value) {
      await api.updateProvider(editingProvider.value.id, form.value)
    } else {
      await api.createProvider(form.value)
    }
    closeModal()
    await loadData()
  } catch (error) {
    alert('Failed to save provider: ' + (error.message || 'Unknown error'))
  }
}

async function bulkImport() {
  try {
    const data = JSON.parse(bulkForm.value.data)
    const providersData = data.map(p => ({
      ...p,
      group_id: bulkForm.value.group_id
    }))
    await api.bulkCreateProviders({ providers: providersData })
    showBulkModal.value = false
    bulkForm.value = { group_id: null, data: '' }
    await loadData()
  } catch (error) {
    alert('Failed to import: ' + (error.message || 'Invalid JSON'))
  }
}

async function saveGroup() {
  try {
    await api.createProviderGroup(groupForm.value)
    showGroupModal.value = false
    groupForm.value = { name: '', description: '', priority: 0 }
    await loadData()
  } catch (error) {
    alert('Failed to save group: ' + (error.message || 'Unknown error'))
  }
}

async function resetProvider(provider) {
  if (!confirm(`Reset stats for ${provider.name}?`)) return
  try {
    await api.resetProviderStats(provider.id)
    await loadData()
  } catch (error) {
    alert('Failed to reset: ' + (error.message || 'Unknown error'))
  }
}

async function confirmDelete(provider) {
  if (!confirm(`Delete provider "${provider.name}"? This cannot be undone.`)) return
  try {
    await api.deleteProvider(provider.id)
    await loadData()
  } catch (error) {
    alert('Failed to delete: ' + (error.message || 'Unknown error'))
  }
}
</script>
