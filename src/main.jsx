import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import PostDetail from './PostDetail'
import TagFeed from './TagFeed'
import Tags from './Tags'
import UserProfile from './UserProfile'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/post/:postId" element={<PostDetail />} />
        <Route path="/tag/:tag" element={<TagFeed />} />
        <Route path="/tags" element={<Tags />} />
        <Route path="/user/:userId" element={<UserProfile />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
