import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
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
  const location = useLocation()
  const savingDraftRef = useRef(false)
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
  const [nextPostTime, setNextPostTime] = useState(null)
  const [timeUntilPost, setTimeUntilPost] = useState('')
  const [sortBy, setSortBy] = useState('recency') // 'recency', 'rating', or 'mostRated'
  const [theme, setTheme] = useState(() => {
    // Load theme from localStorage or default to 'clean'
    return localStorage.getItem('crux-theme') || 'clean'
  })
  const [drafts, setDrafts] = useState([])
  const [showDraftsModal, setShowDraftsModal] = useState(false)
  const [currentDraftId, setCurrentDraftId] = useState(null)
  const [isDraftDirty, setIsDraftDirty] = useState(false)
  const [draftStatus, setDraftStatus] = useState('')
  const [savingDraft, setSavingDraft] = useState(false)

  const hasDraftContent = useMemo(() => {
    return title.trim().length > 0 || text.trim().length > 0 || tags.trim().length > 0
  }, [title, text, tags])
  const canSaveDraft = user && hasDraftContent

  const localDraftKey = useMemo(() => user ? `crux-drafts-${user.uid}` : 'crux-drafts-guest', [user])

  const sortDraftList = useCallback((list) => {
    return [...list].sort((a, b) => {
      const toTime = (value) => {
        if (value instanceof Date) return value.getTime()
        if (value && typeof value.toDate === 'function') return value.toDate().getTime()
        if (typeof value === 'string') {
          const parsed = Date.parse(value)
          return Number.isNaN(parsed) ? 0 : parsed
        }
        return 0
      }
      return toTime(b.updatedAt) - toTime(a.updatedAt)
    })
  }, [])

  const loadDraftsFromLocal = useCallback(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = localStorage.getItem(localDraftKey)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.map(draft => ({
        ...draft,
        tags: Array.isArray(draft.tags) ? draft.tags : [],
        updatedAt: draft.updatedAt ? new Date(draft.updatedAt) : null,
        createdAt: draft.createdAt ? new Date(draft.createdAt) : null
      }))
    } catch (error) {
      console.error('Error loading drafts from localStorage:', error)
      return []
    }
  }, [localDraftKey])

  const persistDraftsToLocal = useCallback((draftList) => {
    if (typeof window === 'undefined') return
    try {
      const serializable = draftList.map(draft => ({
        ...draft,
        tags: Array.isArray(draft.tags) ? draft.tags : [],
        updatedAt: draft.updatedAt instanceof Date ? draft.updatedAt.toISOString() : draft.updatedAt,
        createdAt: draft.createdAt instanceof Date ? draft.createdAt.toISOString() : draft.createdAt
      }))
      localStorage.setItem(localDraftKey, JSON.stringify(serializable))
    } catch (error) {
      console.error('Error saving drafts to localStorage:', error)
    }
  }, [localDraftKey])

  const updateDrafts = useCallback((updater) => {
    setDrafts(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      const normalized = Array.isArray(next) ? next : []
      persistDraftsToLocal(normalized)
      return normalized
    })
  }, [persistDraftsToLocal])

  useEffect(() => {
    const localDrafts = loadDraftsFromLocal()
    updateDrafts(() => sortDraftList(localDrafts))
  }, [loadDraftsFromLocal, updateDrafts, sortDraftList])

  const saveDraft = useCallback(async ({ auto = false, skipEmpty = false } = {}) => {
    if (!hasDraftContent) {
      if (!skipEmpty && !auto) {
        setDraftStatus('Nothing to save')
      }
      return null
    }

    if (savingDraftRef.current) {
      return currentDraftId
    }

    savingDraftRef.current = true
    setSavingDraft(true)

    const tagArray = tags
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0)

    const now = new Date()
    let draftId = currentDraftId || null
    let remoteFailed = false

    if (user) {
      try {
        const draftsRef = collection(db, 'users', user.uid, 'drafts')
        const draftDocRef = draftId ? doc(draftsRef, draftId) : doc(draftsRef)
        draftId = draftDocRef.id
        const remotePayload = {
          title: title.trim(),
          content: text.trim(),
          tags: tagArray,
          updatedAt: serverTimestamp()
        }
        if (!currentDraftId) {
          remotePayload.createdAt = serverTimestamp()
        }
        await setDoc(draftDocRef, remotePayload, { merge: true })
      } catch (error) {
        remoteFailed = true
        console.error('Error saving draft to Firestore:', error)
      }
    }

    if (!draftId) {
      draftId = `local-${Date.now()}`
    }

    let savedDraftId = draftId

    try {
      updateDrafts(prev => {
        const existingIndex = prev.findIndex(draft => draft.id === draftId)
        const existingDraft = existingIndex !== -1 ? prev[existingIndex] : null
        const draftForState = {
          id: draftId,
          title: title.trim(),
          content: text.trim(),
          tags: tagArray,
          updatedAt: now,
          createdAt: existingDraft?.createdAt || now
        }

        if (existingIndex !== -1) {
          const next = [...prev]
          next[existingIndex] = draftForState
          return sortDraftList(next)
        }

        return sortDraftList([draftForState, ...prev])
      })

      setCurrentDraftId(draftId)
      setIsDraftDirty(false)

      if (!auto) {
        if (!user) {
          setDraftStatus('Draft saved locally')
        } else if (remoteFailed) {
          setDraftStatus('Draft saved locally (sync pending)')
        } else {
          setDraftStatus('Draft saved')
        }
      }

      savedDraftId = draftId
    } finally {
      savingDraftRef.current = false
      setSavingDraft(false)
    }

    return savedDraftId
  }, [hasDraftContent, currentDraftId, tags, title, text, user, updateDrafts, sortDraftList])

  const ensureDraftSaved = useCallback(async () => {
    if (user && isDraftDirty && hasDraftContent) {
      await saveDraft({ auto: true, skipEmpty: true })
    }
  }, [user, isDraftDirty, hasDraftContent, saveDraft])

  const navigateWithDraftSave = useCallback((path, options = {}) => {
    const handleNavigation = () => {
      if (location.pathname === path) {
        if (path === '/') {
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }
      } else {
        navigate(path, options)
      }
    }

    if (isDraftDirty && hasDraftContent) {
      saveDraft({ auto: true, skipEmpty: true }).finally(handleNavigation)
    } else {
      handleNavigation()
    }
  }, [location.pathname, isDraftDirty, hasDraftContent, saveDraft, navigate])

  const handleSaveDraftClick = useCallback(async () => {
    await saveDraft()
  }, [saveDraft])

  const handleOpenDrafts = useCallback(async () => {
    await saveDraft({ auto: true, skipEmpty: true })
    setShowDraftsModal(true)
  }, [saveDraft])

  const handleCloseDrafts = () => {
    setShowDraftsModal(false)
  }

  const handleLoadDraft = (draft) => {
    setTitle(draft.title || '')
    setText(draft.content || '')
    setTags(
      draft.tags && Array.isArray(draft.tags)
        ? draft.tags.join(', ')
        : (draft.tags || '')
    )
    setCurrentDraftId(draft.id)
    setIsDraftDirty(false)
    setShowDraftsModal(false)
    setDraftStatus('Draft loaded')
  }

  const handleDeleteDraft = async (draftId) => {
    if (!draftId) return

    let remoteFailed = false
    if (user) {
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'drafts', draftId))
      } catch (error) {
        remoteFailed = true
        console.error('Error deleting draft from Firestore:', error)
      }
    }

    updateDrafts(prev => prev.filter(draft => draft.id !== draftId))

    if (draftId === currentDraftId) {
      setCurrentDraftId(null)
    }

    setDraftStatus(remoteFailed ? 'Draft removed locally (sync pending)' : 'Draft deleted')
  }

  const handleHeadingClick = () => {
    navigateWithDraftSave('/')
  }

  const handleTagsClick = () => {
    navigateWithDraftSave('/tags')
  }

  const handleOpenPost = (postId) => {
    navigateWithDraftSave(`/post/${postId}`)
  }

  const handleTagClick = (event, tag) => {
    event.stopPropagation()
    navigateWithDraftSave(`/tag/${encodeURIComponent(tag)}`)
  }

  // Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)
      setLoading(false)

      if (currentUser) {
        const syncProfile = async () => {
          try {
            const userRef = doc(db, 'users', currentUser.uid)
            const snapshot = await getDoc(userRef)
            const baseProfile = {
              displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Anonymous',
              displayNameLower: (currentUser.displayName || currentUser.email || 'anonymous').toLowerCase(),
              email: currentUser.email || null,
              photoURL: currentUser.photoURL || null,
              updatedAt: serverTimestamp()
            }

            if (snapshot.exists()) {
              await setDoc(userRef, baseProfile, { merge: true })
            } else {
              await setDoc(userRef, { ...baseProfile, createdAt: serverTimestamp() }, { merge: true })
            }
          } catch (error) {
            console.error('Error syncing user profile:', error)
          }
        }
        syncProfile()
      }
    })
    return () => unsubscribe()
  }, [])

  // Drafts listener
  useEffect(() => {
    if (!user) {
      const localDrafts = loadDraftsFromLocal()
      updateDrafts(() => sortDraftList(localDrafts))
      setCurrentDraftId(null)
      return
    }

    const draftsRef = collection(db, 'users', user.uid, 'drafts')
    const draftsQuery = query(draftsRef, orderBy('updatedAt', 'desc'))

    const unsubscribe = onSnapshot(draftsQuery, (snapshot) => {
      const draftsData = snapshot.docs.map(docSnap => {
        const data = docSnap.data()
        return {
          id: docSnap.id,
          ...data,
          tags: Array.isArray(data.tags) ? data.tags : [],
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : null,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null
        }
      })
      const localDrafts = loadDraftsFromLocal()
      const remoteIds = new Set(draftsData.map(draft => draft.id))
      const mergedDrafts = [...draftsData, ...localDrafts.filter(draft => !remoteIds.has(draft.id))]
      updateDrafts(() => sortDraftList(mergedDrafts))
    }, (error) => {
      console.error('Error loading drafts:', error)
      const localDrafts = loadDraftsFromLocal()
      updateDrafts(() => sortDraftList(localDrafts))
    })

    return () => unsubscribe()
  }, [user, loadDraftsFromLocal, updateDrafts, sortDraftList])

  useEffect(() => {
    if (location.state?.openDrafts && user) {
      saveDraft({ auto: true, skipEmpty: true }).finally(() => setShowDraftsModal(true))
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location, user, navigate, saveDraft])

  useEffect(() => {
    if (!draftStatus) return
    const timeout = setTimeout(() => setDraftStatus(''), 3000)
    return () => clearTimeout(timeout)
  }, [draftStatus])

  // Check when user can post next
  useEffect(() => {
    if (!user) {
      setNextPostTime(null)
      setTimeUntilPost('')
      return
    }

    const checkLastPost = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid))
        if (userDoc.exists() && userDoc.data().lastPostAt) {
          const lastPost = userDoc.data().lastPostAt.toDate()
          const nextPost = new Date(lastPost.getTime() + 24 * 60 * 60 * 1000)
          setNextPostTime(nextPost)
        } else {
          setNextPostTime(null)
        }
      } catch (error) {
        console.error('Error checking last post:', error)
      }
    }

    checkLastPost()
  }, [user])

  // Update time until next post every second
  useEffect(() => {
    if (!nextPostTime) {
      setTimeUntilPost('')
      return
    }

    const updateTimer = () => {
      const now = new Date()
      const diff = nextPostTime - now

      if (diff <= 0) {
        setTimeUntilPost('')
        setNextPostTime(null)
        return
      }

      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)

      setTimeUntilPost(`${hours}h ${minutes}m ${seconds}s`)
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [nextPostTime])

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

    // Check if user can post (24 hour limit)
    if (nextPostTime && new Date() < nextPostTime) {
      alert(`You can post again in ${timeUntilPost}`)
      return
    }

    try {
      const now = new Date()

      // Set next post time BEFORE creating the post to prevent double-posting
      const nextAllowedPost = new Date(now.getTime() + 24 * 60 * 60 * 1000)
      setNextPostTime(nextAllowedPost)

      // Parse tags: comma-separated, trim whitespace, filter empty
      const tagArray = tags
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0)

      // Create the post
      await addDoc(collection(db, 'posts'), {
        title: title.trim(),
        content: text.trim(),
        tags: tagArray,
        authorId: user.uid,
        author: user.displayName || user.email?.split('@')[0] || 'Anonymous',
        createdAt: serverTimestamp()
      })

      // Update user's last post timestamp
      await setDoc(doc(db, 'users', user.uid), {
        lastPostAt: serverTimestamp()
      }, { merge: true })

      if (currentDraftId) {
        try {
          await deleteDoc(doc(db, 'users', user.uid, 'drafts', currentDraftId))
        } catch (deleteError) {
          console.error('Error deleting draft after posting:', deleteError)
        }
      }

      setTitle('')
      setText('')
      setTags('')
      setCurrentDraftId(null)
      setIsDraftDirty(false)
      setDraftStatus('')

      alert('Crux posted successfully! You can post again in 24 hours.')
    } catch (error) {
      console.error('Error posting:', error)
      alert('Error posting crux. Please try again.')
      // Reset nextPostTime if posting failed
      setNextPostTime(null)
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
      await ensureDraftSaved()
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

  // Save theme to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('crux-theme', theme)
    // Apply theme class to body
    document.body.className = theme === 'starry' ? 'theme-starry' : 'theme-clean'
  }, [theme])

  // Scroll fade effect (only in starry mode)
  useEffect(() => {
    if (theme !== 'starry') {
      // Reset all post opacities to 1 in clean mode
      const posts = document.querySelectorAll('.post')
      posts.forEach(post => {
        post.style.opacity = 1
      })
      return
    }

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
  }, [posts, theme])

  const toggleTheme = () => {
    setTheme(prev => prev === 'clean' ? 'starry' : 'clean')
  }

  return (
    <div className="app">
      <div className="container">
        <header className="header">
          <div className="header-content">
            <h1 onClick={handleHeadingClick} style={{ cursor: 'pointer' }}>CRUX</h1>
            <div className="header-nav">
              <button onClick={toggleTheme} className="theme-toggle" title={theme === 'clean' ? 'Switch to Starry theme' : 'Switch to Clean theme'}>
                {theme === 'clean' ? '✦' : '●'}
              </button>
              <button onClick={handleTagsClick} className="nav-link">
                TAGS
              </button>
              {user ? (
                <div className="user-info">
                  <button type="button" onClick={handleOpenDrafts} className="user-name-btn">
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

        <div className="compose">
          <div className="avatar">A</div>
          <form onSubmit={handlePost} className="compose-form">
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setIsDraftDirty(true)
              }}
              placeholder="TITLE (OPTIONAL)"
              maxLength={144}
              className="title-input"
              disabled={nextPostTime && new Date() < nextPostTime}
            />
            <div className="title-count">
              <span className={remainingTitle < 0 ? 'count-over' : 'count'}>{remainingTitle}</span>
            </div>
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setIsDraftDirty(true)
              }}
              placeholder="TRANSMIT YOUR MISSION-CRITICAL INSIGHT..."
              rows="5"
              disabled={nextPostTime && new Date() < nextPostTime}
            />
            <div className="action-relevance-hint">
              Consider: Strategic intelligence · Ease of implementation · Opportunity cost · Leverage · Scalability · Novelty · Robustness
            </div>
            <input
              type="text"
              value={tags}
              onChange={(e) => {
                setTags(e.target.value)
                setIsDraftDirty(true)
              }}
              placeholder="TAGS (COMMA-SEPARATED, E.G. AI SAFETY, LONGTERMISM, EXISTENTIAL RISK)"
              className="tags-input"
              disabled={nextPostTime && new Date() < nextPostTime}
            />
            <div className="compose-footer">
              <span className={remainingContent < 0 ? 'count-over' : 'count'}>{remainingContent}</span>
              <div className="compose-buttons">
                <button
                  type="button"
                  className="save-draft-btn"
                  onClick={handleSaveDraftClick}
                  disabled={!canSaveDraft || savingDraft || (!isDraftDirty && currentDraftId)}
                >
                  {savingDraft
                    ? 'SAVING...'
                    : (!isDraftDirty && currentDraftId ? 'DRAFT SAVED' : 'SAVE DRAFT')}
                </button>
                <button type="submit" disabled={!text.trim() || remainingContent < 0 || remainingTitle < 0 || !user || (nextPostTime && new Date() < nextPostTime)}>
                  {!user ? 'SIGN IN TO POST' : (nextPostTime && new Date() < nextPostTime) ? `NEXT POST IN ${timeUntilPost}` : 'POST'}
                </button>
              </div>
            </div>
            {draftStatus && <div className="draft-status">{draftStatus}</div>}
            {!user && (
              <div className="auth-notice">Sign in to transmit your crux</div>
            )}
            {user && nextPostTime && new Date() < nextPostTime && (
              <div className="rate-limit-notice">
                One crux per day. Next post available in {timeUntilPost}
              </div>
            )}
          </form>
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
          {posts
            .sort((a, b) => {
              if (sortBy === 'rating') {
                // Sort by rating (highest first), then by recency as tiebreaker
                const ratingA = a.avgRating ?? -1
                const ratingB = b.avgRating ?? -1
                if (ratingB !== ratingA) {
                  return ratingB - ratingA
                }
                return b.time - a.time
              } else if (sortBy === 'mostRated') {
                // Sort by rating count (most ratings first), then by recency as tiebreaker
                const countA = a.ratingCount ?? 0
                const countB = b.ratingCount ?? 0
                if (countB !== countA) {
                  return countB - countA
                }
                return b.time - a.time
              } else {
                // Sort by recency (newest first)
                return b.time - a.time
              }
            })
            .map(post => (
            <div key={post.id} className="post" onClick={() => handleOpenPost(post.id)} style={{ cursor: 'pointer' }}>
              <div className="avatar">A</div>
              <div className="post-content">
                <div className="post-header">
                  <span
                    className="author author-link"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (post.authorId) {
                        navigateWithDraftSave(`/user/${post.authorId}`)
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
                    {post.tags.map((tag, i) => (
                      <span
                        key={i}
                        className="tag"
                        onClick={(e) => handleTagClick(e, tag)}
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

        {showDraftsModal && (
          <div className="modal-overlay" onClick={handleCloseDrafts}>
            <div className="modal drafts-modal" onClick={(e) => e.stopPropagation()}>
              <div className="drafts-header">
                <h2 className="drafts-title">DRAFTS</h2>
                <button type="button" className="modal-close" onClick={handleCloseDrafts}>×</button>
              </div>
              <div className="drafts-list">
                {drafts.length === 0 ? (
                  <div className="no-drafts">No drafts yet</div>
                ) : (
                  drafts.map(draft => (
                    <div key={draft.id} className={`draft-item${draft.id === currentDraftId ? ' current' : ''}`}>
                      <div className="draft-info">
                        <div className="draft-title-text">{draft.title || 'Untitled Draft'}</div>
                        <div className="draft-meta">
                          {draft.updatedAt
                            ? `Updated ${timeAgo(draft.updatedAt)}`
                            : 'Saving...'}
                          {draft.tags && draft.tags.length > 0 ? ` · ${draft.tags.join(', ')}` : ''}
                        </div>
                        {draft.content && (
                          <div className="draft-snippet">
                            {draft.content.length > 160 ? `${draft.content.slice(0, 157)}…` : draft.content}
                          </div>
                        )}
                      </div>
                      <div className="draft-actions">
                        <button type="button" className="load-draft-btn" onClick={() => handleLoadDraft(draft)}>LOAD</button>
                        <button type="button" className="delete-draft-btn" onClick={() => handleDeleteDraft(draft.id)}>DELETE</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

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
