export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

if (!API_BASE_URL) {
  console.warn('VITE_API_BASE_URL is not set. API calls will use the current origin.');
}

export const apiUrl = (path: string): string => `${API_BASE_URL}${path}`;
