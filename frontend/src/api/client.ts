import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
})

export interface TriageResult {
  email_id: string
  subject: string
  sender: string
  received_at: string
  summary: string
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  worth_reviewing: 'YES' | 'NO'
  reply_needed: 'YES' | 'NO'
  draft_reply: string | null
  confidence: number
  gmail_draft_created: boolean
}

export interface SyncResult {
  fetched: number
  already_cached: number
  newly_processed: number
}

export interface MeetingBrief {
  event_id: string
  title: string
  start_time: string
  meeting_date: string | null
  attendees: string[]
  is_optional: boolean
  related_emails_count: number
  context_summary: string
  discussion_points: string[]
  open_action_items: string[]
  talking_points: string[]
}

export interface MeetingSyncResult {
  fetched: number
  new_meetings: number
  refreshed: number
  skipped: number
}

export interface AuthStatus {
  authenticated: boolean
  email: string | null
}

export const checkAuthStatus = () =>
  api.get<AuthStatus>('/api/auth/status').then((r) => r.data)

// Read from DB for a date range
export const fetchTriageForRange = (dateFrom: string, dateTo: string) =>
  api.get<TriageResult[]>('/api/triage', { params: { date_from: dateFrom, date_to: dateTo } }).then((r) => r.data)

// Sync new emails from Gmail → Claude → DB
export const syncTriage = (daysBack = 7) =>
  api.post<SyncResult>('/api/triage/sync', { days_back: daysBack }).then((r) => r.data)

export const fetchMeetingBriefs = (dateFrom: string, dateTo: string) =>
  api.get<MeetingBrief[]>('/api/meeting-prep', { params: { date_from: dateFrom, date_to: dateTo } }).then((r) => r.data)

export const syncMeetingPrep = (dateFrom: string, dateTo: string) =>
  api.post<MeetingSyncResult>('/api/meeting-prep/sync', { date_from: dateFrom, date_to: dateTo }).then((r) => r.data)

export const clearAllData = () =>
  api.delete('/api/cache/all').then((r) => r.data)

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export const sendChatMessage = (message: string, history: ChatMessage[]) =>
  api.post<{ reply: string }>('/api/chat', { message, history }).then((r) => r.data)

export const loginUrl = `${API_BASE}/api/auth/login`
export const logoutUrl = `${API_BASE}/api/auth/logout`
