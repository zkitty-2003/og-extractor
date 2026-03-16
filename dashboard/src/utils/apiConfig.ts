// Basic API configuration
// In development, we use the local backend port 10001
// In production (Docker), we serve from the same origin or via Nginx proxy, so use relative path ''
export const API_BASE_URL = import.meta.env.PROD ? '' : 'http://localhost:10001';
export const DASHBOARD_API_BASE = `${API_BASE_URL}/api/dashboard`;
export const USER_API_BASE = `${API_BASE_URL}/api/user`;
export const AUTH_API_BASE = `${API_BASE_URL}/api/auth`;
