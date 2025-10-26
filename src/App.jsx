import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, setDoc, getDoc, getDocs, deleteDoc } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, db, signInWithGoogle, signInWithEmail, signUpWithEmail, logout } from './firebase'
import './App.css'

const examplePosts = [
  "The key to understanding consciousness might not be in neuroscience but in information theory.",
  "If we're living in a simulation, the strongest evidence would be mathematical impossibilities, not glitches.",
  "Most people underestimate how much their worldview is shaped by the decade they grew up in.",
  "The hardest part of changing your mind isn't finding new evidence - it's admitting you were wrong.",
  "We treat attention like it's infinite, but it might be our most finite resource.",
  "The best ideas often come from combining two seemingly unrelated fields.",
  "If you can't explain something simply, you might not understand it as well as you think.",
  "The future belongs to people who can unlearn as quickly as they learn.",
  "We're optimizing for engagement when we should be optimizing for understanding.",
  "The most important skill in the 21st century might be knowing what to ignore.",
  "Your beliefs should pay rent - if they don't help you predict or explain the world, why keep them?",
  "We undervalue optionality. Having choices is often more valuable than making the 'perfect' choice.",
  "The map is not the territory, but most arguments are about maps, not territories.",
  "If an idea can't survive contact with reality, it's not reality that's wrong.",
  "The stories we tell ourselves about ourselves are the most persuasive lies we believe.",
  "Changing the incentives changes everything. Most problems are incentive problems.",
  "We live in an age of abundance pretending we're in an age of scarcity.",
  "The crux of most disagreements is different underlying assumptions, not different logic.",
  "If you're not embarrassed by your past self, you're probably not growing.",
  "The question isn't whether you have biases - it's whether you're aware of them."
].map((content, i) => ({
  id: Date.now() - i * 60000,
  content,
  author: 'Anonymous',
  time: new Date(Date.now() - i * 60000)
}))

function App() {
  const navigate = useNavigate()
  const [posts, setPosts] = useState([])
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [tags, setTags] = useState('')
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authMode, setAuthMode] = useState('signin') // 'signin' or 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')

  // Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)
      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  // Firestore listener for posts
  useEffect(() => {
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'))
    const unsubscribes = []

    const postsUnsubscribe = onSnapshot(q, (snapshot) => {
      const postsData = snapshot.docs.map(postDoc => ({
        id: postDoc.id,
        ...postDoc.data(),
        time: postDoc.data().createdAt?.toDate() || new Date(),
        avgRating: null,
        ratingCount: 0,
        userRating: null
      }))

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
      setPosts(examplePosts)
    })

    return () => {
      postsUnsubscribe()
      unsubscribes.forEach(unsub => unsub())
    }
  }, [user])

  const handlePost = async (e) => {
    e.preventDefault()
    if (!text.trim() || text.length > 2048 || title.length > 144 || !user) return

    try {
      // Parse tags: comma-separated, trim whitespace, filter empty
      const tagArray = tags
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0)

      await addDoc(collection(db, 'posts'), {
        title: title.trim(),
        content: text.trim(),
        tags: tagArray,
        authorId: user.uid,
        author: user.displayName || user.email?.split('@')[0] || 'Anonymous',
        createdAt: serverTimestamp()
      })
      setTitle('')
      setText('')
      setTags('')
    } catch (error) {
      console.error('Error posting:', error)
    }
  }

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

  const remainingTitle = 144 - title.length
  const remainingContent = 2048 - text.length

  // Scroll fade effect
  useEffect(() => {
    const handleScroll = () => {
      const posts = document.querySelectorAll('.post')
      const windowHeight = window.innerHeight
      const centerY = windowHeight / 2
      const fadeDistance = windowHeight * 0.3 // Fade zone is 30% of screen height

      posts.forEach(post => {
        const rect = post.getBoundingClientRect()
        const postCenterY = rect.top + rect.height / 2

        let opacity = 1

        // Fade from top
        if (postCenterY < centerY) {
          const distanceFromTop = postCenterY
          if (distanceFromTop < fadeDistance) {
            opacity = distanceFromTop / fadeDistance
          }
        }
        // Fade from bottom
        else {
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
    // Use requestAnimationFrame to ensure DOM is ready
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
            <h1>CRUX</h1>
            {user ? (
              <div className="user-info">
                <span className="user-name">{user.displayName || user.email}</span>
                <button onClick={handleLogout} className="logout-btn">LOGOUT</button>
              </div>
            ) : (
              <button onClick={openAuthModal} className="signin-btn">SIGN IN</button>
            )}
          </div>
        </header>

        <div className="compose">
          <div className="avatar">A</div>
          <form onSubmit={handlePost} className="compose-form">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="TITLE (OPTIONAL)"
              maxLength={144}
              className="title-input"
            />
            <div className="title-count">
              <span className={remainingTitle < 0 ? 'count-over' : 'count'}>{remainingTitle}</span>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="TRANSMIT YOUR MISSION-CRITICAL INSIGHT..."
              rows="5"
            />
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="TAGS (COMMA-SEPARATED, E.G. AI SAFETY, LONGTERMISM, EXISTENTIAL RISK)"
              className="tags-input"
            />
            <div className="compose-footer">
              <span className={remainingContent < 0 ? 'count-over' : 'count'}>{remainingContent}</span>
              <button type="submit" disabled={!text.trim() || remainingContent < 0 || remainingTitle < 0 || !user}>
                {user ? 'POST' : 'SIGN IN TO POST'}
              </button>
            </div>
            {!user && (
              <div className="auth-notice">Sign in to transmit your crux</div>
            )}
          </form>
        </div>

        <div className="feed">
          {posts.map(post => (
            <div key={post.id} className="post" onClick={() => navigate(`/post/${post.id}`)} style={{ cursor: 'pointer' }}>
              <div className="avatar">A</div>
              <div className="post-content">
                <div className="post-header">
                  <span className="author">{post.author || 'Anonymous'}</span>
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
                      <span key={i} className="tag">{tag}</span>
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
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRating(post.id, value)
                        }}
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
          ))}
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

export default App
