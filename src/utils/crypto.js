/**
 * 加密解密工具
 * 用于敏感数据（如 cookies）的存储加密
 */

const CryptoJS = require('crypto-js');
const config = require('../config');

const SECRET_KEY = config.crypto.secretKey;

/**
 * AES 加密
 */
function encrypt(text) {
  if (!text) return text;
  return CryptoJS.AES.encrypt(text, SECRET_KEY).toString();
}

/**
 * AES 解密
 */
function decrypt(ciphertext) {
  if (!ciphertext) return ciphertext;
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    // 如果解密失败，可能是明文存储的旧数据
    return ciphertext;
  }
}

/**
 * 密码哈希
 */
function hashPassword(password) {
  return CryptoJS.SHA256(password).toString();
}

/**
 * 验证密码
 */
function verifyPassword(password, hash) {
  return hashPassword(password) === hash;
}

module.exports = {
  encrypt,
  decrypt,
  hashPassword,
  verifyPassword
};
