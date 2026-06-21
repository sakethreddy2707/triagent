import { BrowserRouter, Routes, Route, NavLink, useNavigate, useSearchParams } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { checkAuthStatus, syncTriage, syncMeetingPrep, clearAllData, loginUrl, logoutUrl } from './api/client'
import EmailTriage from './pages/EmailTriage'
import MeetingPrep from './pages/MeetingPrep'
import ChatBot from './components/ChatBot'
import './index.css'

const queryClient = new QueryClient()

function GmailIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="32" height="32">
      <path fill="#4caf50" d="M45 16.2l-5 2.75-5 4.75V40h7c1.657 0 3-1.343 3-3V16.2z"/>
      <path fill="#1e88e5" d="M3 16.2l3.614 1.71L13 23.7V40H6c-1.657 0-3-1.343-3-3V16.2z"/>
      <polygon fill="#e53935" points="35,11.2 24,19.45 13,11.2 12,17 13,23.7 24,31.95 35,23.7 36,17"/>
      <path fill="#c62828" d="M3,12.298V16.2l10,7.5V11.2L9.876,8.859C9.132,8.301,8.228,8,7.298,8h0C4.924,8,3,9.924,3,12.298z"/>
      <path fill="#fbc02d" d="M45,12.298V16.2l-10,7.5V11.2l3.124-2.341C38.868,8.301,39.772,8,40.702,8h0C43.076,8,45,9.924,45,12.298z"/>
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="32" height="32">
      <path fill="#fff" d="M5 38V14h38v24c0 2.2-1.8 4-4 4H9c-2.2 0-4-1.8-4-4z"/>
      <path fill="#1e88e5" d="M43 10H5v4h38v-4z"/>
      <path fill="#fff" d="M5 10v4h38v-4H5z"/>
      <path fill="#4285f4" d="M34 4H14c-2.2 0-4 1.8-4 4v6h28V8c0-2.2-1.8-4-4-4z"/>
      <path fill="#1e88e5" d="M5 18h38v20H5z" opacity=".1"/>
      <path fill="#1565c0" d="M18 8h-2c-.6 0-1 .4-1 1v4c0 .6.4 1 1 1h2c.6 0 1-.4 1-1V9c0-.6-.4-1-1-1zM32 8h-2c-.6 0-1 .4-1 1v4c0 .6.4 1 1 1h2c.6 0 1-.4 1-1V9c0-.6-.4-1-1-1z"/>
      <path fill="#1e88e5" d="M5 14h38v4H5z"/>
      <text x="24" y="37" textAnchor="middle" fill="#1565c0" fontSize="15" fontWeight="700" fontFamily="sans-serif">20</text>
    </svg>
  )
}

function AuthRedirect() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  useEffect(() => {
    if (params.get('auth') === 'success') {
      queryClient.invalidateQueries({ queryKey: ['auth'] })
      navigate('/', { replace: true })
    }
  }, [params, navigate])
  return null
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
function futureDateISO(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function SyncButton() {
  const qc = useQueryClient()
  const [status, setStatus] = useState<string | null>(null)

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      // Run both syncs in parallel — allSettled so one failure doesn't kill the other
      const [emailOutcome, meetingOutcome] = await Promise.allSettled([
        syncTriage(7),
        syncMeetingPrep(todayISO(), futureDateISO(30)),
      ])
      return { emailOutcome, meetingOutcome }
    },
    onSuccess: ({ emailOutcome, meetingOutcome }) => {
      const emailMsg = emailOutcome.status === 'fulfilled'
        ? `${emailOutcome.value.newly_processed} new emails`
        : `email sync failed`

      let meetingMsg: string
      if (meetingOutcome.status === 'fulfilled') {
        const v = meetingOutcome.value
        meetingMsg = `${v.new_meetings + v.refreshed} meetings synced`
      } else {
        // Extract the backend detail message if available
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const detail = (meetingOutcome.reason as any)?.response?.data?.detail
          || (meetingOutcome.reason as Error)?.message
          || 'unknown error'
        meetingMsg = `meeting sync failed: ${detail}`
      }

      setStatus(`${emailMsg} · ${meetingMsg}`)
      qc.invalidateQueries({ queryKey: ['triage'] })
      qc.invalidateQueries({ queryKey: ['meetings'] })
      setTimeout(() => setStatus(null), 8000)
    },
    onError: () => {
      setStatus('Sync failed — check your connection')
      setTimeout(() => setStatus(null), 4000)
    },
  })

  return (
    <div className="flex items-center gap-2">
      {status && <span className="text-xs text-gray-500">{status}</span>}
      <button
        onClick={() => mutate()}
        disabled={isPending}
        className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors shadow-sm"
      >
        <svg className={`w-3.5 h-3.5 ${isPending ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        {isPending ? 'Syncing…' : 'Sync Now'}
      </button>
    </div>
  )
}

type ModalConfig = { type: 'clear' | 'signout' }

function ConfirmModal({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  danger = false,
}: {
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
  danger?: boolean
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
        <h3 className="text-base font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-500 leading-relaxed mb-6">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
              danger
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function ProfileMenu({ email }: { email: string | null }) {
  const [open, setOpen] = useState(false)
  const [modal, setModal] = useState<ModalConfig | null>(null)
  const [clearing, setClearing] = useState(false)
  const qc = useQueryClient()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  async function confirmClear() {
    setModal(null)
    setClearing(true)
    try {
      await clearAllData()
      qc.invalidateQueries({ queryKey: ['triage'] })
      qc.invalidateQueries({ queryKey: ['meetings'] })
    } finally {
      setClearing(false)
      setOpen(false)
    }
  }

  function confirmSignOut() {
    window.location.href = logoutUrl
  }

  const initials = email ? email.split('@')[0].slice(0, 2).toUpperCase() : null

  return (
    <>
      {modal?.type === 'clear' && (
        <ConfirmModal
          title="Clear all synced data?"
          message="This will remove all your synced emails and meetings from the database. You'll need to click Sync Now again to re-analyze and rebuild your data."
          confirmLabel="Yes, clear it"
          cancelLabel="Cancel"
          onConfirm={confirmClear}
          onCancel={() => setModal(null)}
          danger
        />
      )}
      {modal?.type === 'signout' && (
        <ConfirmModal
          title="Sign out?"
          message="Are you sure you want to sign out? Your synced data will remain saved and be available when you sign back in."
          confirmLabel="Yes, sign out"
          cancelLabel="Cancel"
          onConfirm={confirmSignOut}
          onCancel={() => setModal(null)}
          danger
        />
      )}

      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-9 h-9 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold flex items-center justify-center shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1"
          title="Account"
        >
          {initials ?? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
            </svg>
          )}
        </button>

        {open && (
          <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-2 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-xs text-gray-400 mb-0.5">Signed in as</p>
              <p className="text-sm font-medium text-gray-800 truncate">{email ?? 'Unknown'}</p>
            </div>
            <div className="px-2 pt-1.5 space-y-0.5">
              <button
                onClick={() => setModal({ type: 'clear' })}
                disabled={clearing}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                {clearing ? 'Clearing…' : 'Clear all synced data'}
              </button>
              <button
                onClick={() => setModal({ type: 'signout' })}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function Layout() {
  const { data: auth, isLoading } = useQuery({
    queryKey: ['auth'],
    queryFn: checkAuthStatus,
    retry: false,
  })

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <AuthRedirect />

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 sticky top-0 z-10">
        <div className="w-full flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-2xl font-extrabold text-gray-900 tracking-tight">TriAgent</span>
            <div className="flex items-center gap-2">
              <a
                href="https://mail.google.com"
                target="_blank"
                rel="noopener noreferrer"
                title="Open Gmail"
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors flex items-center"
              >
                <GmailIcon />
              </a>
              <a
                href="https://calendar.google.com"
                target="_blank"
                rel="noopener noreferrer"
                title="Open Google Calendar"
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors flex items-center"
              >
                <CalendarIcon />
              </a>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {auth?.authenticated && (
              <nav className="flex gap-1">
                <NavLink
                  to="/"
                  end
                  className={({ isActive }) =>
                    `px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`
                  }
                >
                  Email Triage
                </NavLink>
                <NavLink
                  to="/meeting-prep"
                  className={({ isActive }) =>
                    `px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`
                  }
                >
                  Meeting Prep
                </NavLink>
              </nav>
            )}

            {!isLoading && auth?.authenticated && <SyncButton />}

            {!isLoading && (
              auth?.authenticated ? (
                <ProfileMenu email={auth.email} />
              ) : (
                <a
                  href={loginUrl}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors shadow-sm"
                >
                  Connect Google
                </a>
              )
            )}
          </div>
        </div>
      </header>

      {/* Main — full width */}
      <main className="flex-1 w-full px-6 py-6">
        {isLoading ? (
          <div className="text-center text-gray-400 mt-20 text-sm">Loading…</div>
        ) : !auth?.authenticated ? (
          <div className="flex flex-col items-center justify-center mt-24 text-center gap-6">
            <div className="text-5xl">📬</div>
            <h1 className="text-3xl font-bold text-gray-900">Welcome to TriAgent</h1>
            <p className="text-gray-500 max-w-md text-sm leading-relaxed">
              Connect your Google account to start triaging emails with AI and prep for your meetings automatically.
            </p>
            <a
              href={loginUrl}
              className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors shadow-sm"
            >
              Connect Google Account
            </a>
          </div>
        ) : (
          <>
            <Routes>
              <Route path="/" element={<EmailTriage />} />
              <Route path="/meeting-prep" element={<MeetingPrep />} />
            </Routes>
            <ChatBot />
          </>
        )}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Layout />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
