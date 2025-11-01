import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, db, signInWithGoogle, signInWithEmail, signUpWithEmail, logout } from './firebase'
import './App.css'

function Tags() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authMode, setAuthMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [tagStats, setTagStats] = useState([])
  const [sortBy, setSortBy] = useState('popularity') // 'popularity', 'alphabetical', 'avgRating'
  const [searchQuery, setSearchQuery] = useState('')
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('crux-theme') || 'clean'
  })

  // Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  // Apply theme
  useEffect(() => {
    document.body.className = theme === 'starry' ? 'theme-starry' : 'theme-clean'
  }, [theme])

  const toggleTheme = () => {
    const newTheme = theme === 'clean' ? 'starry' : 'clean'
    setTheme(newTheme)
    localStorage.setItem('crux-theme', newTheme)
  }

  // Fetch all posts and calculate tag statistics
  useEffect(() => {
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'))

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const tagMap = new Map()

      // Process all posts
      for (const postDoc of snapshot.docs) {
        const post = postDoc.data()

        if (post.tags && Array.isArray(post.tags)) {
          for (const tag of post.tags) {
            const tagLower = tag.toLowerCase()

            if (!tagMap.has(tagLower)) {
              tagMap.set(tagLower, {
                tag: tag,
                count: 0,
                totalRating: 0,
                ratingCount: 0,
                avgRating: null,
                postIds: new Set()
              })
            }

            const tagData = tagMap.get(tagLower)
            tagData.count++
            tagData.postIds.add(postDoc.id)
          }
        }
      }

      // Fetch ratings for tag statistics
      const tagStatsArray = []
      for (const [tagLower, tagData] of tagMap.entries()) {
        let totalRating = 0
        let ratingCount = 0

        // Get ratings for all posts with this tag
        for (const postId of tagData.postIds) {
          const ratingsSnapshot = await new Promise((resolve) => {
            const ratingsRef = collection(db, 'posts', postId, 'ratings')
            const ratingsUnsub = onSnapshot(ratingsRef, (snap) => {
              ratingsUnsub()
              resolve(snap)
            })
          })

          ratingsSnapshot.docs.forEach(doc => {
            totalRating += doc.data().rating
            ratingCount++
          })
        }

        tagStatsArray.push({
          tag: tagData.tag,
          count: tagData.count,
          avgRating: ratingCount > 0 ? totalRating / ratingCount : null,
          ratingCount: ratingCount
        })
      }

      setTagStats(tagStatsArray)
    })

    return () => unsubscribe()
  }, [])

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle()
      setShowAuthModal(false)
    } catch (error) {
      console.error('Sign in error:', error)
      setAuthError(error.message)
    }
  }

  const handleEmailAuth = async (e) => {
    e.preventDefault()
    setAuthError('')

    try {
      if (authMode === 'signin') {
        await signInWithEmail(email, password)
      } else {
        await signUpWithEmail(email, password)
      }
      setShowAuthModal(false)
      setEmail('')
      setPassword('')
    } catch (error) {
      console.error('Auth error:', error)
      setAuthError(error.message.replace('Firebase: ', '').replace(/\(auth.*\)/, ''))
    }
  }

  const openAuthModal = () => {
    setShowAuthModal(true)
    setAuthError('')
    setEmail('')
    setPassword('')
  }

  const handleLogout = async () => {
    try {
      await logout()
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  // Filter and sort tags
  const filteredAndSortedTags = tagStats
    .filter(tag => tag.tag.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      switch (sortBy) {
        case 'alphabetical':
          return a.tag.localeCompare(b.tag)
        case 'avgRating':
          const ratingA = a.avgRating ?? -1
          const ratingB = b.avgRating ?? -1
          if (ratingB !== ratingA) return ratingB - ratingA
          return b.count - a.count // Tiebreaker by popularity
        case 'popularity':
        default:
          return b.count - a.count
      }
    })

  return (
    <div className="app">
      <div className="container">
        <header className="header">
          <div className="header-content">
            <h1 onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>CRUX</h1>
            <div className="header-nav">
              <button onClick={toggleTheme} className="theme-toggle" title={theme === 'clean' ? 'Switch to Starry theme' : 'Switch to Clean theme'}>
                {theme === 'clean' ? '✦' : '●'}
              </button>
              {user ? (
                <div className="user-info">
                  <button
                    type="button"
                    onClick={() => navigate('/', { state: { openDrafts: true } })}
                    className="user-name-btn"
                  >
                    {user.displayName || user.email}
                  </button>
                  <button type="button" onClick={handleLogout} className="logout-btn">LOGOUT</button>
                </div>
              ) : (
                <button onClick={openAuthModal} className="signin-btn">SIGN IN</button>
              )}
            </div>
          </div>
        </header>

        <div className="tags-page-header">
          <button onClick={() => navigate('/')} className="back-btn">
            ← BACK TO FEED
          </button>
          <h2 className="tags-page-title">ALL TAGS</h2>
        </div>

        <div className="tags-controls">
          <div className="tags-search">
            <input
              type="text"
              placeholder="SEARCH TAGS..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="tags-search-input"
            />
          </div>

          <div className="tags-sort">
            <span className="filter-label">SORT BY:</span>
            <div className="sort-buttons">
              <button
                className={`filter-btn ${sortBy === 'popularity' ? 'active' : ''}`}
                onClick={() => setSortBy('popularity')}
              >
                MOST USED
              </button>
              <button
                className={`filter-btn ${sortBy === 'avgRating' ? 'active' : ''}`}
                onClick={() => setSortBy('avgRating')}
              >
                TOP RATED
              </button>
              <button
                className={`filter-btn ${sortBy === 'alphabetical' ? 'active' : ''}`}
                onClick={() => setSortBy('alphabetical')}
              >
                A-Z
              </button>
            </div>
          </div>
        </div>

        <div className="tags-stats-summary">
          <div className="stat-box">
            <div className="stat-number">{tagStats.length}</div>
            <div className="stat-label">TOTAL TAGS</div>
          </div>
          <div className="stat-box">
            <div className="stat-number">
              {tagStats.reduce((sum, tag) => sum + tag.count, 0)}
            </div>
            <div className="stat-label">TAG INSTANCES</div>
          </div>
        </div>

        <div className="tags-grid">
          {filteredAndSortedTags.length === 0 ? (
            <div className="no-tags">
              {searchQuery ? `No tags matching "${searchQuery}"` : 'No tags yet'}
            </div>
          ) : (
            filteredAndSortedTags.map((tagStat, i) => (
              <div
                key={i}
                className="tag-card"
                onClick={() => navigate(`/tag/${encodeURIComponent(tagStat.tag)}`)}
              >
                <div className="tag-card-header">
                  <span className="tag-card-name">{tagStat.tag}</span>
                </div>
                <div className="tag-card-stats">
                  <div className="tag-stat">
                    <span className="tag-stat-value">{tagStat.count}</span>
                    <span className="tag-stat-label">
                      {tagStat.count === 1 ? 'crux' : 'cruxes'}
                    </span>
                  </div>
                  {tagStat.avgRating !== null && (
                    <div className="tag-stat">
                      <span className="tag-stat-value">{tagStat.avgRating.toFixed(1)}</span>
                      <span className="tag-stat-label">avg rating</span>
                    </div>
                  )}
                  {tagStat.ratingCount > 0 && (
                    <div className="tag-stat">
                      <span className="tag-stat-value">{tagStat.ratingCount}</span>
                      <span className="tag-stat-label">
                        {tagStat.ratingCount === 1 ? 'rating' : 'ratings'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {showAuthModal && (
          <div className="modal-overlay" onClick={() => setShowAuthModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setShowAuthModal(false)}>×</button>

              <h2 className="modal-title">
                {authMode === 'signin' ? 'SIGN IN' : 'CREATE ACCOUNT'}
              </h2>

              <div className="auth-tabs">
                <button
                  className={`auth-tab ${authMode === 'signin' ? 'active' : ''}`}
                  onClick={() => { setAuthMode('signin'); setAuthError(''); }}
                >
                  SIGN IN
                </button>
                <button
                  className={`auth-tab ${authMode === 'signup' ? 'active' : ''}`}
                  onClick={() => { setAuthMode('signup'); setAuthError(''); }}
                >
                  SIGN UP
                </button>
              </div>

              <button onClick={handleGoogleSignIn} className="google-signin">
                <svg width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  <path fill="none" d="M0 0h48v48H0z"/>
                </svg>
                Continue with Google
              </button>

              <div className="auth-divider">
                <span>OR</span>
              </div>

              {authError && <div className="auth-error">{authError}</div>}

              <form onSubmit={handleEmailAuth}>
                <input
                  type="email"
                  placeholder="EMAIL"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <input
                  type="password"
                  placeholder="PASSWORD"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button type="submit">
                  {authMode === 'signin' ? 'SIGN IN' : 'SIGN UP'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Tags
