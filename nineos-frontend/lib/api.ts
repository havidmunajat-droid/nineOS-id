import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1',
  headers: {
    Authorization: `Bearer ${process.env.NEXT_PUBLIC_GATEWAY_TOKEN}`,
    'Content-Type': 'application/json',
  },
});

export default api;

// ── Platforms ──────────────────────────────────────────────────
export const getPlatforms = () => api.get('/platforms').then(r => r.data);
export const getPlatformHealth = (slug: string) => api.get(`/platforms/${slug}/health`).then(r => r.data);

// ── HelpDesk ───────────────────────────────────────────────────
export const getConversations = (slug: string) => api.get(`/platforms/${slug}/helpdesk/conversations`).then(r => r.data);
export const getConversation = (slug: string, id: string) => api.get(`/platforms/${slug}/helpdesk/conversations/${id}`).then(r => r.data);
export const getKnowledgeBase = (slug: string) => api.get(`/platforms/${slug}/helpdesk/knowledge-base`).then(r => r.data);

// ── Social Media ───────────────────────────────────────────────
export const getContent = (slug: string, status?: string) =>
  api.get(`/platforms/${slug}/content`, { params: status ? { status } : {} }).then(r => r.data);
export const getSocialAccounts = (slug: string) => api.get(`/platforms/${slug}/social/accounts`).then(r => r.data);
export const generateContent = (slug: string, prompt: string, media_type: string) =>
  api.post(`/platforms/${slug}/content/generate`, { prompt, media_type }).then(r => r.data);
export const generateMedia = (slug: string, id: string, prompt?: string) =>
  api.post(`/platforms/${slug}/content/${id}/generate-media`, prompt ? { prompt } : {}).then(r => r.data);
export const mediaStatus = (slug: string, id: string, job_id: string) =>
  api.post(`/platforms/${slug}/content/${id}/media-status`, { job_id }).then(r => r.data);
export const publishNow = (slug: string, id: string, channels: string[]) =>
  api.post(`/platforms/${slug}/content/${id}/publish-now`, { channels }).then(r => r.data);

// ── Automation ─────────────────────────────────────────────────
export const getPipelines = () => api.get('/automation/pipelines').then(r => r.data);
export const getAlerts = (status?: string) =>
  api.get('/automation/alerts', { params: status ? { status } : {} }).then(r => r.data);
export const getReportSchedules = () => api.get('/automation/reports/schedules').then(r => r.data);

// ── Virtual Office ─────────────────────────────────────────────
export const getExecutives = () => api.get('/virtual-office/executives').then(r => r.data);
export const getSessions = () => api.get('/virtual-office/sessions').then(r => r.data);
export const getSession = (id: string) => api.get(`/virtual-office/sessions/${id}`).then(r => r.data);
export const createSession = (data: { mode: string; participant_roles: string[]; title?: string }) =>
  api.post('/virtual-office/sessions', data).then(r => r.data);
export const sendMessage = (sessionId: string, message: string) =>
  api.post(`/virtual-office/sessions/${sessionId}/messages`, { message_text: message }).then(r => r.data);
export const getAIStatus = () => api.get('/virtual-office/ai/status').then(r => r.data);
