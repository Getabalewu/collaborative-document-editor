import { useState, useEffect } from 'react';
import { api } from '../api/client';

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString();
}

export default function EditorSidebar({ documentId, permission, onRestore }) {
  const [tab, setTab] = useState('comments');
  const [comments, setComments] = useState([]);
  const [versions, setVersions] = useState([]);
  const [collaborators, setCollaborators] = useState({ owner: null, collaborators: [] });
  const [commentText, setCommentText] = useState('');
  const [shareEmail, setShareEmail] = useState('');
  const [sharePerm, setSharePerm] = useState('viewer');
  const [shareError, setShareError] = useState('');

  const canComment = ['owner', 'commenter', 'editor'].includes(permission);
  const isOwner = permission === 'owner';

  useEffect(() => {
    loadComments();
    loadVersions();
    if (isOwner) loadCollaborators();
  }, [documentId]);

  async function loadComments() {
    try {
      const { comments: c } = await api.getComments(documentId);
      setComments(c);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadVersions() {
    try {
      const { versions: v } = await api.getVersions(documentId);
      setVersions(v);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadCollaborators() {
    try {
      const data = await api.getCollaborators(documentId);
      setCollaborators(data);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleAddComment(e) {
    e.preventDefault();
    if (!commentText.trim()) return;
    try {
      const comment = await api.addComment(documentId, commentText.trim());
      setComments((prev) => [comment, ...prev]);
      setCommentText('');
    } catch (err) {
      alert(err.message);
    }
  }

  async function toggleResolved(commentId, resolved) {
    try {
      const updated = await api.updateComment(documentId, commentId, { resolved: !resolved });
      setComments((prev) => prev.map((c) => (c._id === commentId ? updated : c)));
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleRestore(versionId) {
    if (!confirm('Restore this version? Current content will be saved first.')) return;
    try {
      const doc = await api.restoreVersion(documentId, versionId);
      onRestore?.(doc);
      loadVersions();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleShare(e) {
    e.preventDefault();
    setShareError('');
    try {
      const { collaborators: c } = await api.shareDocument(documentId, shareEmail, sharePerm);
      setCollaborators((prev) => ({ ...prev, collaborators: c }));
      setShareEmail('');
    } catch (err) {
      setShareError(err.message);
    }
  }

  async function handleRemoveCollab(userId) {
    try {
      await api.removeCollaborator(documentId, userId);
      setCollaborators((prev) => ({
        ...prev,
        collaborators: prev.collaborators.filter((c) => c.user._id !== userId),
      }));
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <aside className="editor-sidebar">
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab ${tab === 'comments' ? 'active' : ''}`}
          onClick={() => setTab('comments')}
        >
          Comments
        </button>
        <button
          className={`sidebar-tab ${tab === 'versions' ? 'active' : ''}`}
          onClick={() => setTab('versions')}
        >
          History
        </button>
        {isOwner && (
          <button
            className={`sidebar-tab ${tab === 'share' ? 'active' : ''}`}
            onClick={() => setTab('share')}
          >
            Share
          </button>
        )}
      </div>

      <div className="sidebar-panel">
        {tab === 'comments' && (
          <>
            {canComment && (
              <form className="comment-form" onSubmit={handleAddComment}>
                <textarea
                  placeholder="Add a comment..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                />
                <button type="submit" className="btn btn-primary btn-sm">Post</button>
              </form>
            )}
            {comments.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No comments yet.</p>
            ) : (
              comments.map((c) => (
                <div key={c._id} className={`comment-item ${c.resolved ? 'resolved' : ''}`}>
                  <div className="comment-author">{c.author?.name}</div>
                  <div className="comment-text">{c.text}</div>
                  <div className="comment-meta">
                    {formatDate(c.createdAt)}
                    {canComment && (
                      <button
                        className="btn btn-sm btn-secondary"
                        style={{ marginLeft: 8 }}
                        onClick={() => toggleResolved(c._id, c.resolved)}
                      >
                        {c.resolved ? 'Reopen' : 'Resolve'}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {tab === 'versions' && (
          <>
            {versions.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No versions saved yet.</p>
            ) : (
              versions.map((v) => (
                <div key={v._id} className="version-item" onClick={() => handleRestore(v._id)}>
                  <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{v.label}</div>
                  <div className="comment-meta">
                    {v.savedBy?.name} · {formatDate(v.createdAt)}
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {tab === 'share' && isOwner && (
          <>
            <form className="share-form" onSubmit={handleShare}>
              <input
                type="email"
                placeholder="Collaborator email"
                value={shareEmail}
                onChange={(e) => setShareEmail(e.target.value)}
                required
                style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}
              />
              <select value={sharePerm} onChange={(e) => setSharePerm(e.target.value)}>
                <option value="viewer">Viewer — can view only</option>
                <option value="commenter">Commenter — can view and comment</option>
                <option value="editor">Editor — can edit</option>
              </select>
              {shareError && <div className="error-message">{shareError}</div>}
              <button type="submit" className="btn btn-primary btn-sm">Share</button>
            </form>

            <div style={{ marginTop: 16 }}>
              <div className="collaborator-item">
                <span>{collaborators.owner?.name} (Owner)</span>
              </div>
              {collaborators.collaborators?.map((c) => (
                <div key={c.user._id} className="collaborator-item">
                  <span>
                    {c.user.name} <span className="badge">{c.permission}</span>
                  </span>
                  <button className="btn-icon" onClick={() => handleRemoveCollab(c.user._id)}>✕</button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
