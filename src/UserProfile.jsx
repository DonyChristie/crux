import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import {
  auth,
  db,
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  logout
} from './firebase'
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore'
import './App.css'

function UserProfile() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [posts, setPosts] = useState([])
  const [user, setUser] = useState(null)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [loadingPosts, setLoadingPosts] = useState(true)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authMode, setAuthMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [sortBy, setSortBy] = useState('rating') // 'rating' or 'recency'
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('crux-theme') || 'clean'
  })

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)
    })
    return () => unsubscribe()
  }, [])

  // Theme handling
  useEffect(() => {
    document.body.className = theme === 'starry' ? 'theme-starry' : 'theme-clean'
  }, [theme])

  const toggleTheme = () => {
    const newTheme = theme === 'clean' ? 'starry' : 'clean'
    setTheme(newTheme)
    localStorage.setItem('crux-theme', newTheme)
  }

  // Load profile
  useEffect(() => {
    if (!userId) return

    const loadProfile = async () => {
      setLoadingProfile(true)
      try {
        const profileRef = doc(db, 'users', userId)
        const snapshot = await getDoc(profileRef)
        if (snapshot.exists()) {
          setProfile({ id: snapshot.id, ...snapshot.data() })
        } else {
          setProfile(null)
        }
      } catch (error) {
        console.error('Error loading user profile:', error)
        setProfile(null)
      } finally {
        setLoadingProfile(false)
      }
    }

    loadProfile()
  }, [userId])

  // Load posts for user
  useEffect(() => {
    if (!userId) return

    setLoadingPosts(true)
    const postsQuery = query(
      collection(db, 'posts'),
      where('authorId', '==', userId),
      orderBy('createdAt', 'desc')
    )

    const unsubscribes = []

    const unsubscribe = onSnapshot(postsQuery, (snapshot) => {
      const postsData = snapshot.docs.map(postDoc => ({
        id: postDoc.id,
        ...postDoc.data(),
        time: postDoc.data().createdAt?.toDate() || new Date(),
        avgRating: null,
        ratingCount: 0,
        userRating: null
      }))

      setPosts(postsData)
      setLoadingPosts(false)

      postsData.forEach(post => {
        const ratingsRef = collection(db, 'posts', post.id, 'ratings')
        const ratingsUnsubscribe = onSnapshot(ratingsRef, (ratingsSnapshot) => {
          const ratings = ratingsSnapshot.docs.map(doc => doc.data().rating)
          const avgRating = ratings.length > 0
            ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
            : null

          const userRating = user && ratingsSnapshot.docs.find(d => d.id === user.uid)
            ? ratingsSnapshot.docs.find(d => d.id === user.uid).data().rating
            : null

          setPosts(prevPosts => prevPosts.map(p =>
            p.id === post.id
              ? { ...p, avgRating, ratingCount: ratings.length, userRating }
              : p
          ))
        })
        unsubscribes.push(ratingsUnsubscribe)
      })
    }, (error) => {
      console.error('Error loading user posts:', error)
      setPosts([])
      setLoadingPosts(false)
    })

    return () => {
      unsubscribe()
      unsubscribes.forEach(unsub => unsub())
    }
  }, [userId, user])

  const handleDeletePost = async (postId) => {
    if (!window.confirm('Delete this crux?')) return
    try {
      await deleteDoc(doc(db, 'posts', postId))
    } catch (error) {
      console.error('Error deleting post:', error)
    }
  }

  const handleRating = async (postId, rating) => {
    if (!user) {
      openAuthModal()
      return
    }

    try {
      await setDoc(doc(db, 'posts', postId, 'ratings', user.uid), {
        rating,
        userId: user.uid,
        createdAt: serverTimestamp()
      })
    } catch (error) {
      console.error('Error rating post:', error)
    }
  }

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

  const timeAgo = (date) => {
    const seconds = Math.floor((new Date() - date) / 1000)
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
    return `${Math.floor(seconds / 86400)}d`
  }

  const sortedPosts = useMemo(() => {
    const copy = [...posts]
    if (sortBy === 'rating') {
      return copy.sort((a, b) => {
        const ratingA = a.avgRating ?? -1
        const ratingB = b.avgRating ?? -1
        if (ratingB !== ratingA) return ratingB - ratingA
        return b.time - a.time
      })
    }

    return copy.sort((a, b) => b.time - a.time)
  }, [posts, sortBy])

  const memberSince = profile?.createdAt?.toDate
    ? profile.createdAt.toDate()
    : null

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

        <div className="profile-header">
          <button onClick={() => navigate(-1)} className="back-btn">
            ← BACK
          </button>
          {loadingProfile ? (
            <div className="profile-loading">Loading profile…</div>
          ) : !profile ? (
            <div className="profile-missing">
              User not found.
            </div>
          ) : (
            <div className="profile-summary">
              <div className="profile-avatar">
                {profile.displayName?.[0]?.toUpperCase() || 'U'}
              </div>
              <div>
                <h2 className="profile-name">{profile.displayName || 'Anonymous'}</h2>
                <div className="profile-meta">
                  {memberSince && (
                    <span>
                      Member since {memberSince.toLocaleDateString(undefined, { year: 'numeric', month: 'short' })}
                    </span>
                  )}
                  <span>
                    {posts.length} {posts.length === 1 ? 'crux' : 'cruxes'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="filter-sort-bar profile-sort-bar">
          <div className="filter-section">
            <span className="filter-label">SORT CRUXES BY:</span>
            <div className="sort-buttons">
              <button
                className={`filter-btn ${sortBy === 'rating' ? 'active' : ''}`}
                onClick={() => setSortBy('rating')}
              >
                IMPORTANCE
              </button>
              <button
                className={`filter-btn ${sortBy === 'recency' ? 'active' : ''}`}
                onClick={() => setSortBy('recency')}
              >
                RECENCY
              </button>
            </div>
          </div>
        </div>

        <div className="feed">
          {loadingPosts ? (
            <div className="profile-loading">Loading cruxes…</div>
          ) : sortedPosts.length === 0 ? (
            <div className="profile-empty">
              No cruxes yet.
            </div>
          ) : (
            sortedPosts.map(post => (
              <div
                key={post.id}
                className="post"
                onClick={() => navigate(`/post/${post.id}`)}
                style={{ cursor: 'pointer' }}
              >
                <div className="avatar">A</div>
                <div className="post-content">
                  <div className="post-header">
                    <span
                      className="author author-link"
                      onClick={(e) => {
                        e.stopPropagation()
                      }}
                    >
                      {profile?.displayName || post.author || 'Anonymous'}
                    </span>
                    <span className="time">· {timeAgo(post.time)}</span>
                    {user && user.uid === post.authorId && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeletePost(post.id)
                        }}
                        className="delete-btn"
                        title="Delete this crux"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  {post.title && <h2 className="post-title">{post.title}</h2>}
                  {post.tags && post.tags.length > 0 && (
                    <div className="tags">
                      {post.tags.map((tag, i) => (
                        <span
                          key={i}
                          className="tag"
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/tag/${encodeURIComponent(tag)}`)
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="post-text">{post.content}</p>
                  <div className="rating-section" onClick={(e) => e.stopPropagation()}>
                    <div className="rating-header">
                      <span className="rating-label">CRUX RATING</span>
                      {post.avgRating !== null && (
                        <span className="avg-rating">
                          {post.avgRating.toFixed(1)}/11 ({post.ratingCount} {post.ratingCount === 1 ? 'rating' : 'ratings'})
                        </span>
                      )}
                    </div>
                    <div className="rating-scale">
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(value => (
                        <button
                          key={value}
                          className={`rating-btn ${post.userRating === value ? 'selected' : ''} ${value === 0 ? 'zero' : value === 11 ? 'eleven' : ''}`}
                          onClick={() => handleRating(post.id, value)}
                          title={value === 0 ? 'No relevance (100% certain)' : value === 11 ? 'Guaranteed best future (100% certain)' : `${value}/11`}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                    <div className="rating-legend">
                      <span className="legend-item">0 = No relevance</span>
                      <span className="legend-item">11 = Guaranteed best future</span>
                    </div>
                  </div>
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

              <form onSubmit={handleEmailAuth} className="auth-form">
                <input
                  type="email"
                  placeholder="EMAIL"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="auth-input"
                />
                <input
                  type="password"
                  placeholder="PASSWORD"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="auth-input"
                  minLength={6}
                />

                {authError && <div className="auth-error">{authError}</div>}

                <button type="submit" className="auth-submit">
                  {authMode === 'signin' ? 'SIGN IN' : 'CREATE ACCOUNT'}
                </button>
              </form>

              <div className="auth-divider">
                <span>OR</span>
              </div>

              <button onClick={handleGoogleSignIn} className="google-signin">
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                CONTINUE WITH GOOGLE
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default UserProfile
