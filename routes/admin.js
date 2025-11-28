/**
 * Admin API Routes
 * Backend management APIs for users, providers, sessions, and settings
 */

const userManager = require('../lib/user-manager');
const providerManager = require('../lib/provider-manager');
const db = require('../lib/db');

/**
 * Admin authentication middleware
 */
async function adminAuth(req, res) {
  // Check for admin session or basic auth
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Authentication required' }));
    return null;
  }

  if (authHeader.startsWith('Basic ')) {
    const base64Credentials = authHeader.slice(6);
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');

    const user = await userManager.authenticate(username, password);
    if (user && user.is_admin) {
      return user;
    }
  }

  // Also check API key with admin privilege
  if (authHeader.startsWith('Bearer ')) {
    const apiKey = authHeader.slice(7);
    const keyInfo = await userManager.validateApiKey(apiKey);
    if (keyInfo && keyInfo.is_admin) {
      return keyInfo;
    }
  }

  res.writeHead(403, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Admin access required' }));
  return null;
}

/**
 * Parse JSON body from request
 */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Send JSON response
 */
function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Handle admin routes
 */
async function handleAdminRoute(req, res, pathname) {
  // CORS headers for admin panel
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  // Check admin auth for all routes
  const admin = await adminAuth(req, res);
  if (!admin) return true;

  const method = req.method;
  const path = pathname.replace('/admin', '');

  try {
    // ==================== User Management ====================
    if (path === '/users' && method === 'GET') {
      const users = await userManager.getAllUsers();
      sendJson(res, 200, { users });
      return true;
    }

    if (path === '/users' && method === 'POST') {
      const body = await parseBody(req);
      const userId = await userManager.createUser(body);
      sendJson(res, 201, { id: userId, message: 'User created' });
      return true;
    }

    const userMatch = path.match(/^\/users\/(\d+)$/);
    if (userMatch) {
      const userId = parseInt(userMatch[1]);

      if (method === 'GET') {
        const user = await userManager.getUser(userId);
        if (!user) {
          sendJson(res, 404, { error: 'User not found' });
        } else {
          sendJson(res, 200, user);
        }
        return true;
      }

      if (method === 'PUT') {
        const body = await parseBody(req);
        await userManager.updateUser(userId, body);
        sendJson(res, 200, { message: 'User updated' });
        return true;
      }

      if (method === 'DELETE') {
        await userManager.deleteUser(userId);
        sendJson(res, 200, { message: 'User deleted' });
        return true;
      }
    }

    // ==================== API Key Management ====================
    const apiKeysMatch = path.match(/^\/users\/(\d+)\/api-keys$/);
    if (apiKeysMatch && method === 'GET') {
      const userId = parseInt(apiKeysMatch[1]);
      const keys = await userManager.getUserApiKeys(userId);
      sendJson(res, 200, { api_keys: keys });
      return true;
    }

    if (apiKeysMatch && method === 'POST') {
      const userId = parseInt(apiKeysMatch[1]);
      const body = await parseBody(req);
      const keyInfo = await userManager.createApiKey(userId, body);
      sendJson(res, 201, keyInfo);
      return true;
    }

    const apiKeyMatch = path.match(/^\/api-keys\/(\d+)$/);
    if (apiKeyMatch) {
      const keyId = parseInt(apiKeyMatch[1]);

      if (method === 'PUT') {
        const body = await parseBody(req);
        await userManager.updateApiKey(keyId, body);
        sendJson(res, 200, { message: 'API key updated' });
        return true;
      }

      if (method === 'DELETE') {
        await userManager.deleteApiKey(keyId);
        sendJson(res, 200, { message: 'API key deleted' });
        return true;
      }
    }

    // ==================== Provider Management ====================
    if (path === '/providers' && method === 'GET') {
      const providers = await providerManager.getAllProviders();
      // Hide sensitive data in listing
      const safeProviders = providers.map(p => ({
        ...p,
        cookies: p.cookies ? '[HIDDEN]' : null,
        csesidx: p.csesidx ? p.csesidx.substring(0, 20) + '...' : null
      }));
      sendJson(res, 200, { providers: safeProviders });
      return true;
    }

    if (path === '/providers' && method === 'POST') {
      const body = await parseBody(req);
      const providerId = await providerManager.createProvider(body);
      sendJson(res, 201, { id: providerId, message: 'Provider created' });
      return true;
    }

    const providerMatch = path.match(/^\/providers\/(\d+)$/);
    if (providerMatch) {
      const providerId = parseInt(providerMatch[1]);

      if (method === 'GET') {
        const provider = await providerManager.getProvider(providerId);
        if (!provider) {
          sendJson(res, 404, { error: 'Provider not found' });
        } else {
          sendJson(res, 200, provider);
        }
        return true;
      }

      if (method === 'PUT') {
        const body = await parseBody(req);
        await providerManager.updateProvider(providerId, body);
        sendJson(res, 200, { message: 'Provider updated' });
        return true;
      }

      if (method === 'DELETE') {
        await providerManager.deleteProvider(providerId);
        sendJson(res, 200, { message: 'Provider deleted' });
        return true;
      }
    }

    const providerStatsMatch = path.match(/^\/providers\/(\d+)\/stats$/);
    if (providerStatsMatch && method === 'GET') {
      const providerId = parseInt(providerStatsMatch[1]);
      const stats = await providerManager.getProviderStats(providerId);
      if (!stats) {
        sendJson(res, 404, { error: 'Provider not found' });
      } else {
        sendJson(res, 200, stats);
      }
      return true;
    }

    // ==================== User-Provider Bindings ====================
    const bindingsMatch = path.match(/^\/users\/(\d+)\/providers$/);
    if (bindingsMatch && method === 'GET') {
      const userId = parseInt(bindingsMatch[1]);
      const providers = await providerManager.getUserProviders(userId);
      sendJson(res, 200, { providers });
      return true;
    }

    if (bindingsMatch && method === 'POST') {
      const userId = parseInt(bindingsMatch[1]);
      const body = await parseBody(req);
      await providerManager.bindUserProvider(userId, body.provider_id, body.is_default || false);
      sendJson(res, 200, { message: 'Provider bound to user' });
      return true;
    }

    const unbindMatch = path.match(/^\/users\/(\d+)\/providers\/(\d+)$/);
    if (unbindMatch && method === 'DELETE') {
      const userId = parseInt(unbindMatch[1]);
      const providerId = parseInt(unbindMatch[2]);
      await providerManager.unbindUserProvider(userId, providerId);
      sendJson(res, 200, { message: 'Provider unbound from user' });
      return true;
    }

    // ==================== Session Management ====================
    if (path === '/sessions' && method === 'GET') {
      const sessions = await db.query(
        `SELECT s.*, p.name as provider_name, u.username
         FROM sessions s
         LEFT JOIN providers p ON s.provider_id = p.id
         LEFT JOIN users u ON s.user_id = u.id
         WHERE s.is_active = TRUE
         ORDER BY s.last_accessed_at DESC
         LIMIT 100`
      );
      sendJson(res, 200, { sessions });
      return true;
    }

    const sessionMatch = path.match(/^\/sessions\/(\d+)$/);
    if (sessionMatch && method === 'DELETE') {
      const sessionId = parseInt(sessionMatch[1]);
      await db.update('DELETE FROM sessions WHERE id = ?', [sessionId]);
      sendJson(res, 200, { message: 'Session deleted' });
      return true;
    }

    // ==================== System Settings ====================
    if (path === '/settings' && method === 'GET') {
      const settings = await db.query('SELECT * FROM system_settings');
      const settingsObj = {};
      settings.forEach(s => {
        settingsObj[s.setting_key] = s.setting_value;
      });
      sendJson(res, 200, { settings: settingsObj });
      return true;
    }

    if (path === '/settings' && method === 'PUT') {
      const body = await parseBody(req);
      for (const [key, value] of Object.entries(body)) {
        await db.update(
          `INSERT INTO system_settings (setting_key, setting_value)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE setting_value = ?`,
          [key, value, value]
        );
      }
      sendJson(res, 200, { message: 'Settings updated' });
      return true;
    }

    // ==================== Statistics ====================
    if (path === '/stats' && method === 'GET') {
      const [userCount] = await db.query('SELECT COUNT(*) as count FROM users');
      const [providerCount] = await db.query('SELECT COUNT(*) as count FROM providers WHERE is_active = TRUE');
      const [sessionCount] = await db.query('SELECT COUNT(*) as count FROM sessions WHERE is_active = TRUE');
      const [requestCount] = await db.query('SELECT COUNT(*) as count FROM request_logs WHERE created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)');

      const recentErrors = await db.query(
        `SELECT * FROM request_logs
         WHERE error_message IS NOT NULL
         ORDER BY created_at DESC
         LIMIT 10`
      );

      sendJson(res, 200, {
        users: userCount.count,
        active_providers: providerCount.count,
        active_sessions: sessionCount.count,
        requests_24h: requestCount.count,
        recent_errors: recentErrors
      });
      return true;
    }

    // ==================== Request Logs ====================
    if (path === '/logs' && method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const limit = parseInt(url.searchParams.get('limit')) || 100;
      const offset = parseInt(url.searchParams.get('offset')) || 0;

      const logs = await db.query(
        `SELECT rl.*, u.username, p.name as provider_name
         FROM request_logs rl
         LEFT JOIN users u ON rl.user_id = u.id
         LEFT JOIN providers p ON rl.provider_id = p.id
         ORDER BY rl.created_at DESC
         LIMIT ? OFFSET ?`,
        [limit, offset]
      );

      sendJson(res, 200, { logs });
      return true;
    }

    // Route not found
    sendJson(res, 404, { error: 'Admin route not found' });
    return true;

  } catch (error) {
    console.error('Admin API error:', error);
    sendJson(res, 500, { error: error.message });
    return true;
  }
}

module.exports = { handleAdminRoute };
