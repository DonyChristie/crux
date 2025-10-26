import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, getDoc, collection, onSnapshot, setDoc, serverTimestamp, deleteDoc, addDoc, query, orderBy } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, db, signInWithGoogle, signInWithEmail, signUpWithEmail, logout } from './firebase'
import './App.css'

function PostDetail() {
  const { postId } = useParams()
  const navigate = useNavigate()
  const [post, setPost] = useState(null)
  const [user, setUser] = useState(null)
  const [postLoading, setPostLoading] = useState(true)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authMode, setAuthMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')

  // Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)
    })
    return () => unsubscribe()
  }, [])

  // Fetch post and ratings
  useEffect(() => {
    let ratingsUnsubscribe = null

    const fetchPost = async () => {
      try {
        console.log('Fetching post:', postId)
        const postDoc = await getDoc(doc(db, 'posts', postId))
        console.log('Post exists?', postDoc.exists())

        if (!postDoc.exists()) {
          console.log('Post not found, navigating home')
          navigate('/')
          return
        }

        const postData = {
          id: postDoc.id,
          ...postDoc.data(),
          time: postDoc.data().createdAt?.toDate() || new Date(),
          avgRating: null,
          ratingCount: 0,
          userRating: null
        }

        console.log('Post data:', postData)
        setPost(postData)
        console.log('Setting postLoading to false')
        setPostLoading(false)

        // Set up rating listener
        const ratingsRef = collection(db, 'posts', postId, 'ratings')
        ratingsUnsubscribe = onSnapshot(ratingsRef, (ratingsSnapshot) => {
          const ratings = ratingsSnapshot.docs.map(doc => doc.data().rating)
          const avgRating = ratings.length > 0
            ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
            : null

          const userRating = user && ratingsSnapshot.docs.find(d => d.id === user.uid)
            ? ratingsSnapshot.docs.find(d => d.id === user.uid).data().rating
            : null

          setPost(prev => ({
            ...prev,
            avgRating,
            ratingCount: ratings.length,
            userRating
          }))
        })
      } catch (error) {
        console.error('Error fetching post:', error)
        navigate('/')
      }
    }

    fetchPost()

    return () => {
      if (ratingsUnsubscribe) {
        ratingsUnsubscribe()
      }
    }
  }, [postId, user, navigate])

  // Fetch comments
  useEffect(() => {
    console.log('Setting up comments listener for post:', postId)
    const commentsRef = collection(db, 'posts', postId, 'comments')
    const q = query(commentsRef, orderBy('createdAt', 'asc'))

    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log('Comments snapshot:', snapshot.docs.length, 'comments')
      const commentsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        time: doc.data().createdAt?.toDate() || new Date()
      }))
      console.log('Comments data:', commentsData)
      setComments(commentsData)
    }, (error) => {
      console.error('Error fetching comments:', error)
    })

    return () => unsubscribe()
  }, [postId])

  const handleRating = async (rating) => {
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

  const handleDeletePost = async () => {
    if (!window.confirm('Are you sure you want to delete this crux?')) return

    try {
      await deleteDoc(doc(db, 'posts', postId))
      navigate('/')
    } catch (error) {
      console.error('Error deleting post:', error)
    }
  }

  const handleAddComment = async (e) => {
    e.preventDefault()
    if (!commentText.trim() || commentText.length > 2048 || !user) return

    try {
      await addDoc(collection(db, 'posts', postId, 'comments'), {
        content: commentText.trim(),
        authorId: user.uid,
        author: user.displayName || user.email?.split('@')[0] || 'Anonymous',
        createdAt: serverTimestamp()
      })
      setCommentText('')
    } catch (error) {
      console.error('Error adding comment:', error)
    }
  }

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm('Delete this comment?')) return

    try {
      await deleteDoc(doc(db, 'posts', postId, 'comments', commentId))
    } catch (error) {
      console.error('Error deleting comment:', error)
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
    if (!date) return 'just now'
    const seconds = Math.floor((new Date() - date) / 1000)
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
    return `${Math.floor(seconds / 86400)}d`
  }

  if (postLoading) {
    return (
      <div className="app">
        <div className="container">
          <header className="header">
            <div className="header-content">
              <h1>CRUX</h1>
            </div>
          </header>
          <div style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
            Loading...
          </div>
        </div>
      </div>
    )
  }

  if (!post) {
    console.log('No post, returning null')
    return null
  }

  console.log('Rendering post:', post)

  return (
    <div className="app">
      <div className="container">
        <header className="header">
          <div className="header-content">
            <h1 onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>CRUX</h1>
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

        <div className="post-detail">
          <button onClick={() => navigate('/')} className="back-btn">
            ← BACK TO FEED
          </button>

          <div className="post">
            <div className="avatar">A</div>
            <div className="post-content">
              <div className="post-header">
                <span className="author">{post.author || 'Anonymous'}</span>
                <span className="time">· {timeAgo(post.time)}</span>
                {user && user.uid === post.authorId && (
                  <button
                    onClick={handleDeletePost}
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

              <div className="rating-section">
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
                      onClick={() => handleRating(value)}
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

              {/* Comments Section */}
              <div className="comments-section">
                <div className="comments-header">
                  <span className="comments-label">
                    {comments.length} {comments.length === 1 ? 'COMMENT' : 'COMMENTS'}
                  </span>
                </div>

                {user && (
                  <form onSubmit={handleAddComment} className="comment-form">
                    <textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="ADD A COMMENT..."
                      rows="3"
                      maxLength={2048}
                      className="comment-input"
                    />
                    <div className="comment-footer">
                      <span className={2048 - commentText.length < 0 ? 'count-over' : 'count'}>
                        {2048 - commentText.length}
                      </span>
                      <button type="submit" disabled={!commentText.trim() || commentText.length > 2048}>
                        ADD COMMENT
                      </button>
                    </div>
                  </form>
                )}

                {!user && (
                  <div className="comment-auth-notice">
                    Sign in to add comments
                  </div>
                )}

                <div className="comments-list">
                  {comments.map(comment => (
                    <div key={comment.id} className="comment">
                      <div className="comment-header">
                        <div>
                          <span className="comment-author">{comment.author}</span>
                          <span className="comment-time">· {timeAgo(comment.time)}</span>
                        </div>
                        {user && user.uid === comment.authorId && (
                          <button
                            onClick={() => handleDeleteComment(comment.id)}
                            className="delete-comment-btn"
                            title="Delete comment"
                          >
                            ×
                          </button>
                        )}
                      </div>
                      <p className="comment-text">{comment.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
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

export default PostDetail
