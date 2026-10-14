// Player profile stats engine — persistent per-player stats in localStorage.
// Additive only: never touches game logic. The client records a hand once,
// when it sees a fresh handEnd state, keyed by room+handNumber.

const STATS_KEY = 'nikki:poker:playerStats:v1'
const PHOTO_PREFIX = 'nikki:poker:photo:'
const RECORDED_KEY = 'nikki:poker:recordedHands:v1'
const MAX_RECORDED = 300

// Server handEvaluator category names -> strength rank (higher is stronger).
// Matches server/src/game/handEvaluator.js CATEGORY ordering.
export const HAND_RANK = {
  'High Card': 0,
  'One Pair': 1,
  'Two Pair': 2,
  'Three of a Kind': 3,
  Straight: 4,
  Flush: 5,
  'Full House': 6,
  'Four of a Kind': 7,
  'Straight Flush': 8,
  'Royal Flush': 8,
}

// Stable stats key: humans keep their session playerId per device; bots get a
// stable persona key (icon is unique per bot in a room) so AI "regulars" keep
// lifetime stats across rooms on this device.
export function statsKeyFor(p) {
  if (!p) return null
  if (p.isBot) return 'bot:' + (p.icon || p.name || 'bot')
  return 'p:' + p.id
}

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage full/blocked — stats are best-effort */
  }
}

export function loadStats() {
  return readJSON(STATS_KEY, {})
}

function saveStats(s) {
  writeJSON(STATS_KEY, s)
}

export function getStats(key) {
  const all = loadStats()
  return (
    all[key] || {
      name: '',
      icon: '',
      isBot: false,
      hands: 0,
      wins: 0,
      bestHand: null,
      bestHandRank: -1,
      biggestPot: 0,
    }
  )
}

export function winPct(st) {
  if (!st.hands) return 0
  return (st.wins / st.hands) * 100
}

// Local leaderboard: every player seen on this device, ranked by win %.
export function leaderboard(limit = 8) {
  const all = loadStats()
  return Object.entries(all)
    .map(([key, st]) => ({ key, ...st, pct: winPct(st) }))
    .filter((e) => e.hands > 0)
    .sort((a, b) => b.pct - a.pct || b.wins - a.wins || b.hands - a.hands)
    .slice(0, limit)
}

// ---- Profile photos (dataURL, downscaled) ----

export function getPhoto(key) {
  try {
    return localStorage.getItem(PHOTO_PREFIX + key) || null
  } catch {
    return null
  }
}

export function setPhoto(key, dataURL) {
  try {
    if (dataURL) localStorage.setItem(PHOTO_PREFIX + key, dataURL)
    else localStorage.removeItem(PHOTO_PREFIX + key)
  } catch {
    /* ignore quota errors */
  }
}

export function fileToPhotoDataURL(file, maxDim = 256) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        c.getContext('2d').drawImage(img, 0, 0, w, h)
        URL.revokeObjectURL(url)
        resolve(c.toDataURL('image/jpeg', 0.85))
      } catch (e) {
        URL.revokeObjectURL(url)
        reject(e)
      }
    }
    img.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(e)
    }
    img.src = url
  })
}

// ---- Hand recording ----

function alreadyRecorded(handKey) {
  const list = readJSON(RECORDED_KEY, [])
  return Array.isArray(list) && list.includes(handKey)
}

function markRecorded(handKey) {
  const list = readJSON(RECORDED_KEY, [])
  const next = Array.isArray(list) ? list : []
  next.push(handKey)
  writeJSON(RECORDED_KEY, next.slice(-MAX_RECORDED))
}

// Record one completed hand into lifetime stats. Safe to call on every state
// event — each room+handNumber is recorded exactly once. Never throws.
export function recordHandIfNew(state) {
  try {
    const game = state?.game
    if (!game || game.phase !== 'handEnd' || !game.lastResult) return false
    const roomId = state?.room?.id || 'room'
    const handKey = `${roomId}:${game.handNumber}`
    if (alreadyRecorded(handKey)) return false

    const result = game.lastResult
    const awards = result.awards || {}
    const pots = Array.isArray(result.pots) ? result.pots : []
    const totalPot = pots.reduce((s, p) => s + (p.amount || 0), 0)
    const revealById = {}
    for (const r of result.reveal || []) revealById[r.id] = r

    const all = loadStats()
    for (const p of game.players || []) {
      const key = statsKeyFor(p)
      if (!key) continue
      const st = all[key] || {
        name: p.name || '',
        icon: '',
        isBot: !!p.isBot,
        hands: 0,
        wins: 0,
        bestHand: null,
        bestHandRank: -1,
        biggestPot: 0,
      }
      st.name = p.name || st.name
      st.icon = p.icon || st.icon
      st.isBot = !!p.isBot
      st.hands += 1

      const won = (awards[p.id] || 0) > 0
      if (won) {
        st.wins += 1
        if (totalPot > (st.biggestPot || 0)) st.biggestPot = totalPot
        const rev = revealById[p.id]
        if (rev && rev.handName) {
          const rank = HAND_RANK[rev.handName] ?? -1
          if (rank > (st.bestHandRank ?? -1)) {
            st.bestHandRank = rank
            st.bestHand = rev.handName
          }
        }
      }
      all[key] = st
    }
    saveStats(all)
    markRecorded(handKey)
    return true
  } catch {
    return false
  }
}
