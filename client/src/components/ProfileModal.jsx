import { useRef, useState } from 'react'
import { avatarFor } from '../lib.js'
import {
  statsKeyFor,
  getStats,
  getPhoto,
  setPhoto,
  fileToPhotoDataURL,
  winPct,
  leaderboard,
} from '../stats.js'

// Player profile modal — opens when a seat avatar is clicked.
// Shows lifetime (device-local) stats, best hand, biggest pot, a small
// leaderboard, and lets the user upload their own photo via the pencil icon.
export default function ProfileModal({ player, onClose }) {
  const key = statsKeyFor(player)
  const [photo, setPhotoState] = useState(() => getPhoto(key))
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)

  const st = getStats(key)
  const pct = winPct(st)
  const losses = Math.max(0, st.hands - st.wins)
  const leaders = leaderboard(8)
  const myRank = leaders.findIndex((e) => e.key === key)
  const defaultAvatar = player.icon || avatarFor(player.name || '?')

  const onPickFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setSaving(true)
    try {
      const dataURL = await fileToPhotoDataURL(file)
      setPhoto(key, dataURL)
      setPhotoState(dataURL)
    } catch {
      /* keep existing photo on failure */
    }
    setSaving(false)
  }

  const stop = (e) => e.stopPropagation()

  return (
    <div className="profile-overlay" onClick={onClose}>
      <div className="profile-panel" onClick={stop} role="dialog" aria-label={`${player.name} profile`}>
        <button className="profile-close" onClick={onClose} aria-label="Close profile">
          ✕
        </button>

        <div className="profile-head">
          <div className="profile-pic-wrap">
            {photo ? (
              <img className="profile-photo" src={photo} alt={`${player.name}`} />
            ) : (
              <span className="profile-avatar">{defaultAvatar}</span>
            )}
            <button
              className="profile-pencil"
              title="Upload your own photo"
              aria-label="Upload your own photo"
              onClick={() => fileRef.current?.click()}
              disabled={saving}
            >
              {saving ? '…' : '✏️'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={onPickFile}
            />
          </div>
          <div className="profile-id">
            <div className="profile-name">{player.name}</div>
            {player.isBot ? <span className="badge ai-badge">AI regular</span> : null}
            {myRank >= 0 ? <div className="profile-rank">🏅 Rank #{myRank + 1} on this device</div> : null}
          </div>
        </div>

        <div className="profile-grid">
          <div className="profile-stat">
            <span className="profile-stat-num">{st.hands}</span>
            <span className="profile-stat-label">Games</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-num">{st.wins}</span>
            <span className="profile-stat-label">Wins</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-num">{losses}</span>
            <span className="profile-stat-label">Losses</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-num">{pct.toFixed(1)}%</span>
            <span className="profile-stat-label">Win %</span>
          </div>
        </div>

        <div className="profile-records">
          <div className="profile-record">
            <span className="profile-record-label">🃏 Best hand ever</span>
            <span className="profile-record-value">{st.bestHand || '—'}</span>
          </div>
          <div className="profile-record">
            <span className="profile-record-label">💰 Biggest pot won</span>
            <span className="profile-record-value">
              {st.biggestPot ? st.biggestPot.toLocaleString() : '—'}
            </span>
          </div>
        </div>

        {st.hands === 0 ? (
          <div className="profile-empty">No completed hands tracked yet — play a hand and check back.</div>
        ) : null}

        {leaders.length > 1 ? (
          <div className="profile-board">
            <div className="profile-board-title">Device leaderboard</div>
            {leaders.map((e, i) => (
              <div key={e.key} className={'profile-board-row' + (e.key === key ? ' me' : '')}>
                <span className="profile-board-rank">#{i + 1}</span>
                <span className="profile-board-avatar">{e.icon || avatarFor(e.name || '?')}</span>
                <span className="profile-board-name">{e.name || '?'}</span>
                <span className="profile-board-pct">{e.pct.toFixed(1)}%</span>
                <span className="profile-board-wl">
                  {e.wins}W–{Math.max(0, e.hands - e.wins)}L
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
