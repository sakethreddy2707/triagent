import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchTriageForRange } from '../api/client'
import type { TriageResult } from '../api/client'
import TriageCard from '../components/TriageCard'

type Priority = 'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'
type ShowFilter = 'all' | 'worth_reviewing' | 'draft_saved'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function sevenDaysAgoISO() {
  const d = new Date()
  d.setDate(d.getDate() - 6)
  return d.toISOString().slice(0, 10)
}

interface StatCardProps {
  label: string
  value: number
  color: string
  bg: string
  active: boolean
  onClick: () => void
}

function StatCard({ label, value, color, bg, active, onClick }: StatCardProps) {
  return (
    <button
      onClick={onClick}
      className={`${bg} border rounded-xl p-4 text-center shadow-sm transition-all w-full
        ${active ? 'border-indigo-400 ring-2 ring-indigo-300 shadow-md' : 'border-gray-200 hover:border-indigo-200 hover:shadow-md'}`}
    >
      <div className={`text-2xl font-bold ${active ? 'text-indigo-600' : color}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </button>
  )
}

export default function EmailTriage() {
  const [dateFrom, setDateFrom] = useState(sevenDaysAgoISO())
  const [dateTo, setDateTo] = useState(todayISO())
  const [priority, setPriority] = useState<Priority>('ALL')
  const [showFilter, setShowFilter] = useState<ShowFilter>('all')
  const [activeCard, setActiveCard] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['triage', dateFrom, dateTo],
    queryFn: () => fetchTriageForRange(dateFrom, dateTo),
  })

  function handleStatClick(card: string, newPriority?: Priority, newShow?: ShowFilter) {
    if (activeCard === card) {
      // Deselect — reset filters
      setActiveCard(null)
      setPriority('ALL')
      setShowFilter('all')
    } else {
      setActiveCard(card)
      if (newPriority !== undefined) setPriority(newPriority)
      if (newShow !== undefined) setShowFilter(newShow)
    }
  }

  function handleDropdownPriority(val: Priority) {
    setPriority(val)
    if (val !== 'ALL') setActiveCard(val)
    else if (showFilter === 'all') setActiveCard(null)
  }

  function handleDropdownShow(val: ShowFilter) {
    setShowFilter(val)
    if (val === 'draft_saved') setActiveCard('draft_saved')
    else if (val === 'worth_reviewing') setActiveCard('worth_reviewing')
    else if (priority === 'ALL') setActiveCard(null)
  }

  const filtered = (data ?? []).filter((e: TriageResult) => {
    if (priority !== 'ALL' && e.priority !== priority) return false
    if (showFilter === 'worth_reviewing' && e.worth_reviewing !== 'YES') return false
    if (showFilter === 'draft_saved' && !e.gmail_draft_created) return false
    return true
  })

  const counts = data
    ? {
        total: data.length,
        high: data.filter((e) => e.priority === 'HIGH').length,
        medium: data.filter((e) => e.priority === 'MEDIUM').length,
        low: data.filter((e) => e.priority === 'LOW').length,
        drafts: data.filter((e) => e.gmail_draft_created).length,
      }
    : null

  return (
    <div className="space-y-4 w-full">

      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-xl px-5 pt-3 pb-4 shadow-sm">
        {/* Top row: title + hint */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-gray-700">Email Triage</p>
          <p className="text-xs text-gray-400">
            Hit <span className="font-semibold text-indigo-500">Sync Now</span> in the top-right to pull new emails into the database
          </p>
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap items-end gap-5">
          {/* Date range */}
          <div className="flex items-end gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
              <input
                type="date"
                value={dateFrom}
                max={dateTo}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <span className="text-gray-400 text-sm pb-1.5">→</span>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
              <input
                type="date"
                value={dateTo}
                min={dateFrom}
                max={todayISO()}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          </div>

          {/* Priority dropdown */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
            <select
              value={priority}
              onChange={(e) => handleDropdownPriority(e.target.value as Priority)}
              className="bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 min-w-[130px]"
            >
              <option value="ALL">All priorities</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>

          {/* Show dropdown */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Show</label>
            <select
              value={showFilter}
              onChange={(e) => handleDropdownShow(e.target.value as ShowFilter)}
              className="bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 min-w-[180px]"
            >
              <option value="all">All emails</option>
              <option value="worth_reviewing">Worth reviewing</option>
              <option value="draft_saved">Draft saved to Gmail</option>
            </select>
          </div>
        </div>
      </div>

      {/* Stat cards — clickable */}
      {counts && (
        <div className="grid grid-cols-5 gap-3">
          <StatCard label="Total" value={counts.total} color="text-gray-800" bg="bg-white"
            active={activeCard === 'total'}
            onClick={() => handleStatClick('total', 'ALL', 'all')} />
          <StatCard label="High" value={counts.high} color="text-red-600" bg="bg-red-50"
            active={activeCard === 'HIGH'}
            onClick={() => handleStatClick('HIGH', 'HIGH', 'all')} />
          <StatCard label="Medium" value={counts.medium} color="text-yellow-600" bg="bg-yellow-50"
            active={activeCard === 'MEDIUM'}
            onClick={() => handleStatClick('MEDIUM', 'MEDIUM', 'all')} />
          <StatCard label="Low" value={counts.low} color="text-green-600" bg="bg-green-50"
            active={activeCard === 'LOW'}
            onClick={() => handleStatClick('LOW', 'LOW', 'all')} />
          <StatCard label="Drafts saved" value={counts.drafts} color="text-indigo-600" bg="bg-indigo-50"
            active={activeCard === 'draft_saved'}
            onClick={() => handleStatClick('draft_saved', 'ALL', 'draft_saved')} />
        </div>
      )}

      {/* States */}
      {isLoading && <div className="text-center text-gray-400 py-20 text-sm">Loading emails…</div>}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-600 text-sm">
          {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && data && filtered.length === 0 && (
        <div className="text-center py-20">
          <div className="text-4xl mb-3">📭</div>
          <p className="text-gray-500 text-sm">
            {data.length === 0
              ? 'No emails synced for this range. Click Sync Now to pull emails.'
              : 'No emails match the current filters.'}
          </p>
        </div>
      )}

      {/* Email cards */}
      <div className="space-y-3">
        {filtered.map((email) => (
          <TriageCard key={email.email_id} email={email} />
        ))}
      </div>
    </div>
  )
}
