import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { collection, query, orderBy, onSnapshot, doc, setDoc, serverTimestamp, deleteDoc } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, db, signInWithGoogle, signInWithEmail, signUpWithEmail, logout } from './firebase'
import './App.css'

function TagFeed() {
  const navigate = useNavigate()
  const { tag } = useParams()
  const [posts, setPosts] = useState([])
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authMode, setAuthMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [sortBy, setSortBy] = useState('rating') // 'recency', 'rating', or 'mostRated'
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('crux-theme') || 'clean'
  })

  // Parse multiple tags from URL (tags separated by +)
  const selectedTags = tag ? decodeURIComponent(tag).split('+').map(t => t.trim()) : []

  // Helper functions for tag management
  const addTagToFilter = (newTag) => {
    if (selectedTags.some(t => t.toLowerCase() === newTag.toLowerCase())) return
    const updatedTags = [...selectedTags, newTag]
    const tagString = updatedTags.map(t => encodeURIComponent(t)).join('+')
    navigate(`/tag/${tagString}`)
  }

  const removeTagFromFilter = (tagToRemove) => {
    const updatedTags = selectedTags.filter(t => t.toLowerCase() !== tagToRemove.toLowerCase())
    if (updatedTags.length === 0) {
      navigate('/')
    } else {
      const tagString = updatedTags.map(t => encodeURIComponent(t)).join('+')
      navigate(`/tag/${tagString}`)
    }
  }

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

  // Firestore listener for posts with tag filter
  useEffect(() => {
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'))
    const unsubscribes = []

    const postsUnsubscribe = onSnapshot(q, (snapshot) => {
      const postsData = snapshot.docs
        .map(postDoc => ({
          id: postDoc.id,
          ...postDoc.data(),
          time: postDoc.data().createdAt?.toDate() || new Date(),
          avgRating: null,
          ratingCount: 0,
          userRating: null
        }))
        .filter(post => {
          // Filter by multiple tags - post must have ALL selected tags
          if (!post.tags || !Array.isArray(post.tags)) return false
          return selectedTags.every(selectedTag =>
            post.tags.some(postTag => postTag.toLowerCase() === selectedTag.toLowerCase())
          )
        })

      setPosts(postsData)

      // Set up rating listeners for each post
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
      console.error('Error fetching posts:', error)
      setPosts([])
    })

    return () => {
      postsUnsubscribe()
      unsubscribes.forEach(unsub => unsub())
    }
  }, [user, tag])

  const handleDeletePost = async (postId) => {
    if (!window.confirm('Are you sure you want to delete this crux?')) return

    try {
      await deleteDoc(doc(db, 'posts', postId))
    } catch (error) {
      console.error('Error deleting post:', error)
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

  const timeAgo = (date) => {
    const seconds = Math.floor((new Date() - date) / 1000)
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
    return `${Math.floor(seconds / 86400)}d`
  }

  const sortedPosts = [...posts].sort((a, b) => {
    if (sortBy === 'rating') {
      const ratingA = a.avgRating ?? -1
      const ratingB = b.avgRating ?? -1
      if (ratingB !== ratingA) {
        return ratingB - ratingA
      }
      return b.time - a.time
    } else if (sortBy === 'mostRated') {
      const countA = a.ratingCount ?? 0
      const countB = b.ratingCount ?? 0
      if (countB !== countA) {
        return countB - countA
      }
      return b.time - a.time
    } else {
      return b.time - a.time
    }
  })

  // Scroll fade effect
  useEffect(() => {
    const handleScroll = () => {
      const posts = document.querySelectorAll('.post')
      const windowHeight = window.innerHeight
      const centerY = windowHeight / 2
      const fadeDistance = windowHeight * 0.3

      posts.forEach(post => {
        const rect = post.getBoundingClientRect()
        const postCenterY = rect.top + rect.height / 2

        let opacity = 1

        if (postCenterY < centerY) {
          const distanceFromTop = postCenterY
          if (distanceFromTop < fadeDistance) {
            opacity = distanceFromTop / fadeDistance
          }
        } else {
          const distanceFromBottom = windowHeight - postCenterY
          if (distanceFromBottom < fadeDistance) {
            opacity = distanceFromBottom / fadeDistance
          }
        }

        opacity = Math.max(0, Math.min(1, opacity))
        post.style.opacity = opacity
      })
    }

    window.addEventListener('scroll', handleScroll)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        handleScroll()
      })
    })

    return () => window.removeEventListener('scroll', handleScroll)
  }, [posts])

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

        <div className="tag-filter-header">
          <button onClick={() => navigate('/')} className="back-btn">
            ← BACK TO ALL
          </button>
          <div className="active-tags-container">
            <span className="tag-label">
              {selectedTags.length === 1 ? 'FILTERING BY TAG:' : 'FILTERING BY TAGS:'}
            </span>
            <div className="active-tags">
              {selectedTags.map((selectedTag, i) => (
                <span key={i} className="tag active-tag-name removable">
                  {selectedTag}
                  <button
                    onClick={() => removeTagFromFilter(selectedTag)}
                    className="remove-tag-btn"
                    title="Remove tag"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="filter-sort-bar">
          <div className="filter-section">
            <span className="filter-label">SORT BY:</span>
            <div className="sort-buttons">
              <button
                className={`filter-btn ${sortBy === 'recency' ? 'active' : ''}`}
                onClick={() => setSortBy('recency')}
              >
                NEWEST
              </button>
              <button
                className={`filter-btn ${sortBy === 'rating' ? 'active' : ''}`}
                onClick={() => setSortBy('rating')}
              >
                TOP RATED
              </button>
              <button
                className={`filter-btn ${sortBy === 'mostRated' ? 'active' : ''}`}
                onClick={() => setSortBy('mostRated')}
              >
                MOST RATED
              </button>
            </div>
          </div>
        </div>

        <div className="feed">
          {sortedPosts.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
              No cruxes found for these tags yet.
            </div>
          ) : (
            sortedPosts.map(post => (
              <div key={post.id} className="post" onClick={() => navigate(`/post/${post.id}`)} style={{ cursor: 'pointer' }}>
                <div className="avatar">A</div>
                <div className="post-content">
                  <div className="post-header">
                    <span
                      className="author author-link"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (post.authorId) {
                          navigate(`/user/${post.authorId}`)
                        }
                      }}
                    >
                      {post.author || 'Anonymous'}
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
                      {post.tags.map((t, i) => {
                        const isSelected = selectedTags.some(st => st.toLowerCase() === t.toLowerCase())
                        return (
                          <span
                            key={i}
                            className={`tag ${isSelected ? 'tag-active' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (isSelected) {
                                removeTagFromFilter(t)
                              } else {
                                addTagToFilter(t)
                              }
                            }}
                            style={{ cursor: 'pointer' }}
                            title={isSelected ? 'Click to remove from filter' : 'Click to add to filter'}
                          >
                            {t}
                          </span>
                        )
                      })}
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

export default TagFeed
