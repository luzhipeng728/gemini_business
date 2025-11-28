/**
 * API 测试脚本
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';
let API_KEY = '';

async function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(data)
          });
        } catch {
          resolve({
            status: res.statusCode,
            data
          });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    return true;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('========================================');
  console.log('Gemini API Gateway Tests');
  console.log('========================================\n');

  let passed = 0;
  let failed = 0;

  // 1. Health Check
  if (await test('Health Check', async () => {
    const res = await request('GET', '/health');
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    if (res.data.status !== 'ok') throw new Error('Health not ok');
  })) passed++; else failed++;

  // 2. Ready Check
  if (await test('Ready Check', async () => {
    const res = await request('GET', '/ready');
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    if (res.data.status !== 'ready') throw new Error('Not ready');
  })) passed++; else failed++;

  // 3. Status Check
  if (await test('Status Check', async () => {
    const res = await request('GET', '/status');
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    if (!res.data.providers) throw new Error('No providers info');
  })) passed++; else failed++;

  // 4. Models List (without auth - should fail)
  if (await test('Models List (no auth) - should fail', async () => {
    const res = await request('GET', '/v1beta/models');
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  })) passed++; else failed++;

  // 5. Admin Stats (with Basic Auth)
  if (await test('Admin Stats (Basic Auth)', async () => {
    const auth = Buffer.from('admin:admin123').toString('base64');
    const res = await request('GET', '/admin/stats/overview', null, {
      'Authorization': `Basic ${auth}`
    });
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    if (!res.data.providers) throw new Error('No providers stats');
  })) passed++; else failed++;

  // 6. Get Provider Groups
  if (await test('Get Provider Groups', async () => {
    const auth = Buffer.from('admin:admin123').toString('base64');
    const res = await request('GET', '/admin/provider-groups', null, {
      'Authorization': `Basic ${auth}`
    });
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    if (!res.data.groups) throw new Error('No groups');
  })) passed++; else failed++;

  // 7. Get Users
  if (await test('Get Users', async () => {
    const auth = Buffer.from('admin:admin123').toString('base64');
    const res = await request('GET', '/admin/users', null, {
      'Authorization': `Basic ${auth}`
    });
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    if (!res.data.users) throw new Error('No users');
  })) passed++; else failed++;

  // 8. Get Admin API Keys
  if (await test('Get Admin API Keys', async () => {
    const auth = Buffer.from('admin:admin123').toString('base64');
    const res = await request('GET', '/admin/users/1/api-keys', null, {
      'Authorization': `Basic ${auth}`
    });
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    if (!res.data.api_keys || res.data.api_keys.length === 0) {
      throw new Error('No API keys');
    }
    API_KEY = res.data.api_keys[0].api_key;
    console.log(`  API Key: ${API_KEY.substring(0, 20)}...`);
  })) passed++; else failed++;

  // 9. Models List (with API Key)
  if (await test('Models List (with API Key)', async () => {
    const res = await request('GET', '/v1beta/models', null, {
      'x-goog-api-key': API_KEY
    });
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    if (!res.data.models || res.data.models.length === 0) {
      throw new Error('No models');
    }
    console.log(`  Found ${res.data.models.length} models`);
  })) passed++; else failed++;

  // 10. Get Provider Stats
  if (await test('Get Provider Stats', async () => {
    const auth = Buffer.from('admin:admin123').toString('base64');
    const res = await request('GET', '/admin/stats/providers', null, {
      'Authorization': `Basic ${auth}`
    });
    if (res.status !== 200) throw new Error(`Status: ${res.status}`);
    console.log(`  Total providers: ${res.data.summary?.total || 0}`);
    console.log(`  Active providers: ${res.data.summary?.active || 0}`);
  })) passed++; else failed++;

  // Summary
  console.log('\n========================================');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('========================================\n');

  if (failed > 0) {
    console.log('⚠️  Some tests failed. Make sure:');
    console.log('   1. Server is running (npm start)');
    console.log('   2. Database is set up (npm run setup-db)');
    console.log('   3. Admin user exists (username: admin, password: admin123)');
  } else {
    console.log('✅ All tests passed!');
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
