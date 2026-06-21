import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchMeetingBriefs } from '../api/client'
import type { MeetingBrief } from '../api/client'
import MeetingBriefCard from '../components/MeetingBriefCard'

type AttendanceFilter = 'ALL' | 'REQUIRED' | 'OPTIONAL'

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
function futureDateISO(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function StatCard({
  label, value, color, bg, active, onClick,
}: {
  label: string; value: number; color: string; bg: string; active: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl p-4 text-left border transition-all shadow-sm ${bg} ${
        active ? 'ring-2 ring-indigo-500 border-indigo-300' : 'border-gray-200 hover:border-indigo-200'
      }`}
    >
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </button>
  )
}

export default function MeetingPrep() {
  const [dateFrom, setDateFrom] = useState(todayISO())
  const [dateTo, setDateTo] = useState(futureDateISO(14))
  const [attendanceFilter, setAttendanceFilter] = useState<AttendanceFilter>('ALL')
  const [activeCard, setActiveCard] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['meetings', dateFrom, dateTo],
    queryFn: () => fetchMeetingBriefs(dateFrom, dateTo),
    retry: false,       // don't retry on failure — show error immediately
    staleTime: 0,       // always re-fetch when query key changes
  })

  const filtered = (data ?? []).filter((m: MeetingBrief) => {
    if (attendanceFilter === 'REQUIRED' && m.is_optional) return false
    if (attendanceFilter === 'OPTIONAL' && !m.is_optional) return false
    return true
  })

  const counts = data
    ? {
        total: data.length,
        required: data.filter((m) => !m.is_optional).length,
        optional: data.filter((m) => m.is_optional).length,
      }
    : null

  function handleCard(key: string, filter: AttendanceFilter) {
    if (activeCard === key) {
      setActiveCard(null)
      setAttendanceFilter('ALL')
    } else {
      setActiveCard(key)
      setAttendanceFilter(filter)
    }
  }

  return (
    <div className="space-y-4 w-full">

      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-xl px-5 pt-3 pb-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-gray-700">Meeting Prep</p>
          <p className="text-xs text-gray-400">
            Hit <span className="font-semibold text-indigo-500">Sync Now</span> in the top-right to pull meetings and refresh email context
          </p>
        </div>

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
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          </div>

          {/* Attendance filter */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Attendance</label>
            <select
              value={attendanceFilter}
              onChange={(e) => {
                setAttendanceFilter(e.target.value as AttendanceFilter)
                setActiveCard(null)
              }}
              className="bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 min-w-[150px]"
            >
              <option value="ALL">All meetings</option>
              <option value="REQUIRED">Required only</option>
              <option value="OPTIONAL">Optional only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      {counts && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            label="Total meetings" value={counts.total} color="text-gray-800" bg="bg-white"
            active={activeCard === 'total'}
            onClick={() => handleCard('total', 'ALL')}
          />
          <StatCard
            label="Required" value={counts.required} color="text-indigo-700" bg="bg-indigo-50"
            active={activeCard === 'required'}
            onClick={() => handleCard('required', 'REQUIRED')}
          />
          <StatCard
            label="Optional" value={counts.optional} color="text-gray-500" bg="bg-gray-50"
            active={activeCard === 'optional'}
            onClick={() => handleCard('optional', 'OPTIONAL')}
          />
        </div>
      )}

      {/* States */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm">
          <p className="font-semibold text-red-700 mb-1">Failed to load meetings from database</p>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <p className="text-red-500 font-mono text-xs">{(error as any)?.response?.data?.detail || (error as Error).message}</p>
        </div>
      )}

      {isLoading && (
        <div className="text-center text-gray-400 py-20 text-sm">Loading meetings…</div>
      )}

      {!isLoading && !error && data?.length === 0 && (
        <div className="flex flex-col items-center justify-center py-14 text-center gap-3">
          <div className="text-5xl">🗓️</div>
          <p className="text-gray-700 text-base font-semibold">No meetings found for this date range</p>
          <p className="text-gray-400 text-sm max-w-xs leading-relaxed">
            Click <span className="font-semibold text-indigo-500">Sync Now</span> in the top-right to pull
            meetings from Google Calendar and generate AI briefs. You can also adjust the date range above.
          </p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="space-y-4">
          {filtered.map((brief) => (
            <MeetingBriefCard key={brief.event_id} brief={brief} />
          ))}
        </div>
      )}

      {!isLoading && data && data.length > 0 && filtered.length === 0 && (
        <div className="text-center py-20">
          <p className="text-gray-400 text-sm">No meetings match the current filter.</p>
        </div>
      )}
    </div>
  )
}
