import { useState } from 'react'
import type { MeetingBrief } from '../api/client'

function BulletList({ title, items, accent }: { title: string; items: string[]; accent: string }) {
  if (!items.length) return null
  return (
    <div>
      <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${accent}`}>{title}</p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm text-gray-700">
            <span className="text-indigo-400 mt-0.5 shrink-0">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function MeetingBriefCard({ brief }: { brief: MeetingBrief }) {
  const [expanded, setExpanded] = useState(false)

  const startDate = new Date(brief.start_time)
  const dateStr = isNaN(startDate.getTime())
    ? brief.start_time
    : startDate.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

  const hasDetails =
    brief.discussion_points.length > 0 ||
    brief.open_action_items.length > 0 ||
    brief.talking_points.length > 0

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm hover:border-indigo-200 hover:shadow-md transition-all">
      <div className="p-5">

        {/* Title row */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 leading-snug">{brief.title}</p>
            <p className="text-sm text-gray-500 mt-0.5">{dateStr}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Required / Optional badge */}
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-md border ${
              brief.is_optional
                ? 'bg-gray-50 text-gray-500 border-gray-200'
                : 'bg-indigo-50 text-indigo-700 border-indigo-200'
            }`}>
              {brief.is_optional ? 'Optional' : 'Required'}
            </span>
            {/* Email count */}
            <span className="text-xs bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
              {brief.related_emails_count} email{brief.related_emails_count !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Attendees */}
        {brief.attendees.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {brief.attendees.map((a) => (
              <span key={a} className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{a}</span>
            ))}
          </div>
        )}

        {/* Context summary (always visible) */}
        <p className="text-sm text-gray-700 leading-relaxed">{brief.context_summary}</p>
      </div>

      {/* Expand toggle — only if there are details */}
      {hasDetails && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-5 py-2.5 bg-gray-50 border-t border-gray-100 text-sm text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
        >
          <span className="font-medium">{expanded ? 'Hide prep notes' : 'Show prep notes'}</span>
          <span className="text-xs">{expanded ? '▲' : '▼'}</span>
        </button>
      )}

      {expanded && (
        <div className="p-5 border-t border-gray-100 space-y-5">
          <BulletList title="Discussion points" items={brief.discussion_points} accent="text-indigo-500" />
          <BulletList title="Open action items" items={brief.open_action_items} accent="text-amber-600" />
          <BulletList title="Talking points" items={brief.talking_points} accent="text-emerald-600" />
        </div>
      )}
    </div>
  )
}
