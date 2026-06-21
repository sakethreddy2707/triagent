import { useState } from 'react'
import type { TriageResult } from '../api/client'

const PRIORITY_STYLES = {
  HIGH: 'bg-red-100 text-red-700 border border-red-200',
  MEDIUM: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
  LOW: 'bg-green-100 text-green-700 border border-green-200',
}

function ConfidenceDonut({ value }: { value: number }) {
  const r = 18
  const circumference = 2 * Math.PI * r
  const filled = (value / 100) * circumference
  const gap = circumference - filled
  const color = value >= 90 ? '#22c55e' : value >= 70 ? '#eab308' : '#ef4444'

  return (
    <svg width="44" height="44" viewBox="0 0 44 44" className="shrink-0">
      <circle cx="22" cy="22" r={r} fill="none" stroke="#e5e7eb" strokeWidth="4" />
      <circle
        cx="22" cy="22" r={r}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeDasharray={`${filled} ${gap}`}
        strokeLinecap="round"
        transform="rotate(-90 22 22)"
      />
      <text x="22" y="26" textAnchor="middle" fontSize="9" fontWeight="700" fill="#374151">
        {value}%
      </text>
    </svg>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={copy}
      title="Copy to clipboard"
      className="flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-600 transition-colors px-2 py-1 rounded-md hover:bg-indigo-50"
    >
      {copied ? (
        <>
          <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-green-600">Copied</span>
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Copy
        </>
      )}
    </button>
  )
}

export default function TriageCard({ email }: { email: TriageResult }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 hover:border-indigo-200 hover:shadow-sm transition-all shadow-sm">

      {/* Subject + date */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="font-semibold text-gray-900 text-left leading-snug">{email.subject}</p>
        <span className="text-xs text-gray-400 whitespace-nowrap shrink-0 mt-0.5">
          {email.received_at.slice(0, 16)}
        </span>
      </div>

      {/* Sender */}
      <p className="text-sm text-gray-500 text-left mb-3">{email.sender}</p>

      {/* Badges */}
      <div className="flex flex-wrap gap-2 mb-3">
        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-md ${PRIORITY_STYLES[email.priority]}`}>
          {email.priority}
        </span>
        <span className={`text-xs px-2.5 py-0.5 rounded-md border font-medium ${
          email.worth_reviewing === 'YES'
            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
            : 'bg-gray-50 text-gray-400 border-gray-200'
        }`}>
          {email.worth_reviewing === 'YES' ? 'Worth reviewing' : 'Low value'}
        </span>
        {email.gmail_draft_created && (
          <span className="text-xs px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
            Draft saved to Gmail
          </span>
        )}
      </div>

      {/* Summary */}
      <p className="text-sm text-gray-700 leading-relaxed text-left mb-4">{email.summary}</p>

      {/* Confidence donut — right aligned, no label on left */}
      <div className="flex justify-end mb-3">
        <ConfidenceDonut value={email.confidence} />
      </div>

      {/* Draft reply */}
      {email.reply_needed === 'YES' && email.draft_reply && (
        <div className="border border-gray-200 rounded-lg overflow-hidden mt-2">
          {/* Header row */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex-1 flex items-center justify-between text-sm text-gray-600 hover:text-gray-900 transition-colors text-left"
            >
              <span className="font-medium">Suggested reply</span>
              <span className="text-gray-400 text-xs ml-2">{expanded ? '▲' : '▼'}</span>
            </button>
            {expanded && <CopyButton text={email.draft_reply} />}
          </div>

          {expanded && (
            <div className="px-4 py-3 bg-white">
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed text-left">
                {email.draft_reply}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
