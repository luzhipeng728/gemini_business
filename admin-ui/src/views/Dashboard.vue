<template>
  <div>
    <!-- Header -->
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-slate-900">仪表盘</h1>
      <p class="text-slate-500 mt-1">API 网关运行概览</p>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <!-- Providers Card -->
      <div class="stats-card group">
        <div class="stats-card-icon bg-blue-500">
          <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2"/>
          </svg>
        </div>
        <div class="flex-1">
          <p class="text-sm font-medium text-slate-500 uppercase tracking-wide">服务商</p>
          <p class="text-3xl font-bold text-slate-900 mt-1">{{ stats.providers?.total || 0 }}</p>
          <div class="flex items-center gap-3 mt-2 text-sm">
            <span class="flex items-center text-emerald-600">
              <span class="w-2 h-2 bg-emerald-500 rounded-full mr-1.5"></span>
              {{ stats.providers?.active || 0 }} 活跃
            </span>
            <span class="flex items-center text-red-600">
              <span class="w-2 h-2 bg-red-500 rounded-full mr-1.5"></span>
              {{ stats.providers?.failed || 0 }} 异常
            </span>
          </div>
        </div>
      </div>

      <!-- Users Card -->
      <div class="stats-card group">
        <div class="stats-card-icon bg-violet-500">
          <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/>
          </svg>
        </div>
        <div class="flex-1">
          <p class="text-sm font-medium text-slate-500 uppercase tracking-wide">用户</p>
          <p class="text-3xl font-bold text-slate-900 mt-1">{{ stats.users?.total || 0 }}</p>
          <div class="flex items-center gap-3 mt-2 text-sm">
            <span class="flex items-center text-emerald-600">
              <span class="w-2 h-2 bg-emerald-500 rounded-full mr-1.5"></span>
              {{ stats.users?.active || 0 }} 活跃
            </span>
          </div>
        </div>
      </div>

      <!-- Sessions Card -->
      <div class="stats-card group">
        <div class="stats-card-icon bg-amber-500">
          <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
          </svg>
        </div>
        <div class="flex-1">
          <p class="text-sm font-medium text-slate-500 uppercase tracking-wide">会话</p>
          <p class="text-3xl font-bold text-slate-900 mt-1">{{ stats.sessions?.active || 0 }}</p>
          <div class="flex items-center gap-3 mt-2 text-sm text-slate-500">
            共 {{ stats.sessions?.total || 0 }} 个会话
          </div>
        </div>
      </div>

      <!-- Requests Card -->
      <div class="stats-card group">
        <div class="stats-card-icon bg-emerald-500">
          <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
          </svg>
        </div>
        <div class="flex-1">
          <p class="text-sm font-medium text-slate-500 uppercase tracking-wide">请求</p>
          <p class="text-3xl font-bold text-slate-900 mt-1">{{ formatNumber(stats.requests?.total || 0) }}</p>
          <div class="flex items-center gap-3 mt-2 text-sm text-slate-500">
            今日 <span class="text-blue-600 font-medium">{{ formatNumber(stats.requests?.today || 0) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Provider Status -->
      <div class="card">
        <div class="flex items-center justify-between mb-6">
          <h3 class="text-lg font-semibold text-slate-900">服务商状态</h3>
          <router-link to="/providers" class="text-sm text-blue-600 hover:text-blue-700 font-medium">
            查看全部 →
          </router-link>
        </div>

        <div v-if="loading" class="flex items-center justify-center py-12 text-slate-400">
          <svg class="animate-spin h-8 w-8 mr-3" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          加载中...
        </div>

        <div v-else-if="!providerStats.providers?.length" class="flex flex-col items-center justify-center py-12 text-slate-400">
          <svg class="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2"/>
          </svg>
          <p class="text-lg font-medium text-slate-600">暂无服务商</p>
          <p class="text-sm">添加服务商以开始路由 API 请求</p>
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="provider in providerStats.providers?.slice(0, 5)"
            :key="provider.id"
            class="flex items-center justify-between p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                <span class="text-white font-bold text-sm">{{ provider.name.charAt(0).toUpperCase() }}</span>
              </div>
              <div>
                <div class="font-semibold text-slate-900">{{ provider.name }}</div>
                <div class="text-sm text-slate-500">
                  负载: {{ provider.current_load }}/{{ provider.max_concurrent }}
                </div>
              </div>
            </div>
            <div class="flex items-center gap-4">
              <div class="text-right">
                <div class="text-sm text-slate-500">健康度</div>
                <div :class="getHealthClass(provider.health_score)" class="font-bold">
                  {{ provider.health_score }}%
                </div>
              </div>
              <span :class="getStatusBadgeClass(provider.status)">
                {{ provider.status }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- System Info -->
      <div class="card">
        <div class="flex items-center justify-between mb-6">
          <h3 class="text-lg font-semibold text-slate-900">系统信息</h3>
          <span class="px-2.5 py-1 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
            系统运行正常
          </span>
        </div>

        <div class="space-y-4">
          <div class="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                <svg class="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2"/>
                </svg>
              </div>
              <span class="font-medium text-slate-700">服务器状态</span>
            </div>
            <span class="status-badge status-online">在线</span>
          </div>

          <div class="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/>
                </svg>
              </div>
              <span class="font-medium text-slate-700">数据库</span>
            </div>
            <span class="status-badge status-online">已连接</span>
          </div>

          <div class="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center">
                <svg class="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                </svg>
              </div>
              <span class="font-medium text-slate-700">平均健康度</span>
            </div>
            <span class="text-lg font-bold text-slate-900">{{ Math.round(providerStats.summary?.avgHealth || 0) }}%</span>
          </div>

          <div class="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <svg class="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
              </div>
              <span class="font-medium text-slate-700">总容量</span>
            </div>
            <span class="text-lg font-bold text-slate-900">{{ providerStats.summary?.totalCapacity || 0 }} <span class="text-sm font-normal text-slate-500">并发</span></span>
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
const stats = ref({})
const providerStats = ref({})

onMounted(async () => {
  try {
    const [overview, providers] = await Promise.all([
      api.getOverview(),
      api.getProviderStats()
    ])
    stats.value = overview
    providerStats.value = providers
  } catch (error) {
    console.error('Failed to load dashboard data:', error)
  } finally {
    loading.value = false
  }
})

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
  return num.toString()
}

function getHealthClass(score) {
  if (score >= 80) return 'text-green-600 font-medium'
  if (score >= 50) return 'text-yellow-600 font-medium'
  return 'text-red-600 font-medium'
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
</script>
