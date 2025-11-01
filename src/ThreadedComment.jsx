import { useState } from 'react'
import './App.css'

// Recursive component for threaded comments
function ThreadedComment({
  comment,
  depth = 0,
  user,
  timeAgo,
  onRate,
  onEdit,
  onDelete,
  onReply,
  editingCommentId,
  editCommentText,
  setEditCommentText,
  onSaveEdit,
  onCancelEdit,
  replyingToId,
  replyText,
  setReplyText,
  onSubmitReply,
  onCancelReply,
  onViewProfile
}) {
  const [collapsed, setCollapsed] = useState(false)

  const isEditing = editingCommentId === comment.id
  const isReplying = replyingToId === comment.id
  const replyTotal = comment.children?.length ?? comment.replyCount ?? 0

  return (
    <div className="threaded-comment" style={{ marginLeft: `${depth * 24}px` }}>
      <div className="comment">
        {isEditing ? (
          <div className="edit-comment-form">
            <textarea
              value={editCommentText}
              onChange={(e) => setEditCommentText(e.target.value)}
              rows="3"
              maxLength={2048}
              className="comment-input"
            />
            <div className="edit-buttons">
              <button onClick={() => onSaveEdit(comment.id)} className="save-btn">
                SAVE
              </button>
              <button onClick={onCancelEdit} className="cancel-btn">
                CANCEL
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="comment-header">
              <div>
                <span
                  className="comment-author author-link"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (comment.authorId && onViewProfile) {
                      onViewProfile(comment.authorId)
                    }
                  }}
                >
                  {comment.author}
                </span>
                <span className="comment-time">· {timeAgo(comment.time)}</span>
                {comment.avgRating !== null && (
                  <span className="comment-rating">
                    · ⭐ {comment.avgRating.toFixed(1)} ({comment.ratingCount})
                  </span>
                )}
              </div>
              {user && user.uid === comment.authorId && (
                <div className="comment-actions">
                  <button
                    onClick={() => onEdit(comment)}
                    className="edit-comment-btn"
                    title="Edit sub-crux"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => onDelete(comment.id)}
                    className="delete-comment-btn"
                    title="Delete sub-crux"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>

            <p className="comment-text">{comment.content}</p>

            {/* Rating section for comment */}
            <div className="comment-rating-section">
              <div className="comment-rating-scale">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(value => (
                  <button
                    key={value}
                    className={`rating-btn-small ${comment.userRating === value ? 'selected' : ''}`}
                    onClick={() => onRate(comment.id, value)}
                    title={`Rate ${value}/11`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            {/* Reply and collapse controls */}
            <div className="comment-controls">
              <button className="reply-btn" onClick={() => onReply(comment.id)}>
                Reply
              </button>
              {replyTotal > 0 && (
                <button className="collapse-btn" onClick={() => setCollapsed(!collapsed)}>
                  {collapsed
                    ? `▶ Show ${replyTotal} ${replyTotal === 1 ? 'reply' : 'replies'}`
                    : `▼ Hide ${replyTotal} ${replyTotal === 1 ? 'reply' : 'replies'}`}
                </button>
              )}
            </div>
          </>
        )}

        {/* Reply form */}
        {isReplying && !isEditing && (
          <div className="reply-form">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Write a reply..."
              rows="3"
              maxLength={2048}
              className="comment-input"
              autoFocus
            />
            <div className="comment-footer">
              <span className={2048 - replyText.length < 0 ? 'count-over' : 'count'}>
                {2048 - replyText.length}
              </span>
              <div>
                <button
                  onClick={() => onSubmitReply(comment.id)}
                  disabled={!replyText.trim() || replyText.length > 2048}
                  className="reply-submit-btn"
                >
                  REPLY
                </button>
                <button onClick={onCancelReply} className="cancel-btn">
                  CANCEL
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Render children recursively */}
      {!collapsed && comment.children && comment.children.length > 0 && (
        <div className="comment-children">
          {comment.children.map(child => (
            <ThreadedComment
              key={child.id}
              comment={child}
              depth={depth + 1}
              user={user}
              timeAgo={timeAgo}
              onRate={onRate}
              onEdit={onEdit}
              onDelete={onDelete}
              onReply={onReply}
              editingCommentId={editingCommentId}
              editCommentText={editCommentText}
              setEditCommentText={setEditCommentText}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              replyingToId={replyingToId}
              replyText={replyText}
              setReplyText={setReplyText}
              onSubmitReply={onSubmitReply}
              onCancelReply={onCancelReply}
              onViewProfile={onViewProfile}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default ThreadedComment
