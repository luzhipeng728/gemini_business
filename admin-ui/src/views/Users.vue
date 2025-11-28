<template>
  <div>
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-2xl font-bold text-gray-900">用户管理</h1>
      <button @click="showAddModal = true" class="btn btn-primary">
        添加用户
      </button>
    </div>

    <!-- Users Table -->
    <div class="card p-0">
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>用户名</th>
              <th>邮箱</th>
              <th>角色</th>
              <th>状态</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="6" class="text-center py-8 text-gray-500">加载中...</td>
            </tr>
            <tr v-else-if="users.length === 0">
              <td colspan="6" class="text-center py-8 text-gray-500">暂无用户</td>
            </tr>
            <tr v-for="user in users" :key="user.id">
              <td class="font-medium">{{ user.username }}</td>
              <td>{{ user.email || '-' }}</td>
              <td>
                <span :class="user.is_admin ? 'badge badge-warning' : 'badge badge-gray'">
                  {{ user.is_admin ? '管理员' : '普通用户' }}
                </span>
              </td>
              <td>
                <span :class="user.is_active ? 'badge badge-success' : 'badge badge-danger'">
                  {{ user.is_active ? '启用' : '禁用' }}
                </span>
              </td>
              <td>{{ formatDate(user.created_at) }}</td>
              <td>
                <div class="flex gap-1">
                  <button @click="showApiKeys(user)" class="btn btn-sm btn-secondary">
                    API Keys
                  </button>
                  <button @click="editUser(user)" class="btn btn-sm btn-secondary">
                    Edit
                  </button>
                  <button
                    @click="confirmDelete(user)"
                    class="btn btn-sm btn-danger"
                    :disabled="user.is_admin && users.filter(u => u.is_admin).length === 1"
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

    <!-- Add/编辑用户 Modal -->
    <div v-if="showAddModal || editingUser" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div class="p-6">
          <h3 class="text-lg font-semibold mb-4">
            {{ editingUser ? '编辑用户' : '添加用户' }}
          </h3>
          <form @submit.prevent="saveUser" class="space-y-4">
            <div>
              <label class="form-label">用户名</label>
              <input v-model="form.username" class="form-input" required :disabled="!!editingUser" />
            </div>
            <div>
              <label class="form-label">邮箱</label>
              <input v-model="form.email" type="email" class="form-input" />
            </div>
            <div v-if="!editingUser">
              <label class="form-label">密码</label>
              <input v-model="form.password" type="password" class="form-input" required />
            </div>
            <div v-else>
              <label class="form-label">新密码 (留空保持不变)</label>
              <input v-model="form.password" type="password" class="form-input" />
            </div>
            <div class="flex items-center gap-4">
              <label class="flex items-center">
                <input v-model="form.is_admin" type="checkbox" class="mr-2" />
                Admin
              </label>
              <label class="flex items-center">
                <input v-model="form.is_active" type="checkbox" class="mr-2" />
                Active
              </label>
            </div>
            <div class="flex justify-end gap-2 pt-4">
              <button type="button" @click="closeModal" class="btn btn-secondary">取消</button>
              <button type="submit" class="btn btn-primary">保存</button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- API Keys Modal -->
    <div v-if="showKeysModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4">
        <div class="p-6">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-semibold">API 密钥 - {{ selectedUser?.username }}</h3>
            <button @click="showKeysModal = false" class="text-gray-500 hover:text-gray-700">
              &times;
            </button>
          </div>

          <div class="space-y-4">
            <div class="flex gap-2">
              <input v-model="newKeyName" class="form-input flex-1" placeholder="密钥名称 (可选)" />
              <button @click="createApiKey" class="btn btn-primary">创建密钥</button>
            </div>

            <div class="table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>API 密钥</th>
                    <th>状态</th>
                    <th>使用量</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="apiKeys.length === 0">
                    <td colspan="5" class="text-center py-4 text-gray-500">暂无 API 密钥</td>
                  </tr>
                  <tr v-for="key in apiKeys" :key="key.id">
                    <td>{{ key.name }}</td>
                    <td>
                      <code class="text-sm bg-gray-100 px-2 py-1 rounded">
                        {{ showFullKey[key.id] ? key.api_key : key.api_key.substring(0, 20) + '...' }}
                      </code>
                      <button @click="toggleKeyVisibility(key.id)" class="ml-2 text-primary-600 text-sm">
                        {{ showFullKey[key.id] ? '隐藏' : '显示' }}
                      </button>
                    </td>
                    <td>
                      <span :class="key.is_active ? 'badge badge-success' : 'badge badge-danger'">
                        {{ key.is_active ? '启用' : '已撤销' }}
                      </span>
                    </td>
                    <td>{{ key.daily_usage }}/{{ key.daily_limit }}</td>
                    <td>
                      <button
                        @click="revokeKey(key)"
                        class="btn btn-sm btn-danger"
                        :disabled="!key.is_active"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../api'

const loading = ref(true)
const users = ref([])

const showAddModal = ref(false)
const showKeysModal = ref(false)
const editingUser = ref(null)
const selectedUser = ref(null)
const apiKeys = ref([])
const newKeyName = ref('')
const showFullKey = ref({})

const form = ref({
  username: '',
  email: '',
  password: '',
  is_admin: false,
  is_active: true
})

onMounted(async () => {
  await loadUsers()
})

async function loadUsers() {
  loading.value = true
  try {
    const res = await api.getUsers()
    users.value = res.users || []
  } catch (error) {
    console.error('Failed to load users:', error)
  } finally {
    loading.value = false
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString()
}

function editUser(user) {
  editingUser.value = user
  form.value = {
    username: user.username,
    email: user.email || '',
    password: '',
    is_admin: user.is_admin,
    is_active: user.is_active
  }
}

function closeModal() {
  showAddModal.value = false
  editingUser.value = null
  form.value = {
    username: '',
    email: '',
    password: '',
    is_admin: false,
    is_active: true
  }
}

async function saveUser() {
  try {
    const data = { ...form.value }
    if (!data.password) delete data.password

    if (editingUser.value) {
      await api.updateUser(editingUser.value.id, data)
    } else {
      await api.createUser(data)
    }
    closeModal()
    await loadUsers()
  } catch (error) {
    alert('Failed to save user: ' + (error.message || 'Unknown error'))
  }
}

async function confirmDelete(user) {
  if (!confirm(`Delete user "${user.username}"? This will also delete all their API keys.`)) return
  try {
    await api.deleteUser(user.id)
    await loadUsers()
  } catch (error) {
    alert('Failed to delete: ' + (error.message || 'Unknown error'))
  }
}

async function showApiKeys(user) {
  selectedUser.value = user
  showKeysModal.value = true
  try {
    const res = await api.getUserApiKeys(user.id)
    apiKeys.value = res.api_keys || []
  } catch (error) {
    console.error('Failed to load API keys:', error)
  }
}

function toggleKeyVisibility(keyId) {
  showFullKey.value[keyId] = !showFullKey.value[keyId]
}

async function createApiKey() {
  try {
    await api.createApiKey(selectedUser.value.id, { name: newKeyName.value || 'New Key' })
    newKeyName.value = ''
    const res = await api.getUserApiKeys(selectedUser.value.id)
    apiKeys.value = res.api_keys || []
  } catch (error) {
    alert('Failed to create key: ' + (error.message || 'Unknown error'))
  }
}

async function revokeKey(key) {
  if (!confirm(`Revoke API key "${key.name}"?`)) return
  try {
    await api.revokeApiKey(selectedUser.value.id, key.id)
    const res = await api.getUserApiKeys(selectedUser.value.id)
    apiKeys.value = res.api_keys || []
  } catch (error) {
    alert('Failed to revoke key: ' + (error.message || 'Unknown error'))
  }
}
</script>
