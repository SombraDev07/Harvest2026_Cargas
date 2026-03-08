import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
});

export const getLoads = async (skip = 0, limit = 100) => {
  const response = await api.get(`/loads?skip=${skip}&limit=${limit}`);
  return response.data;
};

export const getAnalytics = async () => {
  const response = await api.get('/analytics');
  return response.data;
};

export const triggerValidation = async () => {
  const response = await api.post('/validate-all');
  return response.data;
};

export const uploadSpreadsheet = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post('/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export default api;
