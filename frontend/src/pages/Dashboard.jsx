import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { api } from '../api/client';
import ShareModal from '../components/ShareModal';

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [documents, setDocuments] = useState([]);
  const [recentDocuments, setRecentDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [renameId, setRenameId] = useState(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [shareDoc, setShareDoc] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);

  const loadDocuments = useCallback(async () => {
    try {
      const [{ documents: docs }, { documents: recent }] = await Promise.all([
        api.getDocuments(),
        api.getRecentDocuments().catch(() => ({ documents: [] })),
      ]);
      setDocuments(docs);
      setRecentDocuments(recent);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  async function handleCreate() {
    try {
      const doc = await api.createDocument();
      navigate(`/doc/${doc._id}`);
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDelete(id, e) {
    e.stopPropagation();
    if (!confirm('Delete this document?')) return;
    try {
      await api.deleteDocument(id);
      setDocuments((prev) => prev.filter((d) => d._id !== id));
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDuplicate(id, e) {
    e.stopPropagation();
    try {
      const copy = await api.duplicateDocument(id);
      setDocuments((prev) => [copy, ...prev]);
    } catch (err) {
      alert(err.message);
    }
  }

  function startRename(doc, e) {
    e.stopPropagation();
    setRenameId(doc._id);
    setRenameTitle(doc.title);
  }

  async function confirmRename() {
    if (!renameId || !renameTitle.trim()) return;
    try {
      await api.updateDocument(renameId, { title: renameTitle.trim() });
      setDocuments((prev) =>
        prev.map((d) => (d._id === renameId ? { ...d, title: renameTitle.trim() } : d))
      );
      setRenameId(null);
    } catch (err) {
      alert(err.message);
    }
  }

  function toggleActionsMenu(e, id) {
    e.stopPropagation();
    setOpenMenuId((prev) => (prev === id ? null : id));
  }

  useEffect(() => {
    function handleWindowClick() {
      setOpenMenuId(null);
    }
    function handleKey(e) {
      if (e.key === 'Escape') setOpenMenuId(null);
    }
    window.addEventListener('click', handleWindowClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('click', handleWindowClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, []);

  const filtered = documents.filter((d) =>
    d.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <span className="logo">SyncWrite</span>
        <div className="user-info">
          <button className="btn btn-secondary btn-sm" onClick={toggleTheme}>
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <span className="user-name">{user?.name}</span>
          <button className="btn btn-secondary btn-sm" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      <main className="dashboard-main">
        <div className="dashboard-toolbar">
          <h2>My Documents</h2>
          <div style={{ display: 'flex', gap: 12 }}>
            <input
              className="search-input"
              placeholder="Search documents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="btn btn-primary" onClick={handleCreate}>
              + New Document
            </button>
          </div>
        </div>

        {!loading && recentDocuments.length > 0 && (
          <section className="recent-section">
            <h3>Recently Opened</h3>
            <div className="recent-list">
              {recentDocuments.map((doc) => (
                <div
                  key={doc._id}
                  className="recent-chip"
                  onClick={() => navigate(`/doc/${doc._id}`)}
                  title={`${doc.title} — ${doc.owner?.name || 'You'}`}
                >
                  <span className="recent-chip-title">{doc.title}</span>
                  <span className="recent-chip-role">
                    {doc.role !== 'owner' ? doc.role : 'Owner'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {loading ? (
          <div className="empty-state">Loading documents...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <h3>No documents yet</h3>
            <p>Create your first document to get started.</p>
          </div>
        ) : (
          <div className="doc-list">
            {filtered.map((doc) => (
              <div
                key={doc._id}
                className="doc-item"
                onDoubleClick={() => navigate(`/doc/${doc._id}`)}
                style={{ cursor: 'pointer' }}
              >
                <div className="doc-item-info" onClick={() => navigate(`/doc/${doc._id}`)}>
                  <div className="doc-item-title">
                    {doc.title}
                    {doc.role && doc.role !== 'owner' && (
                      <span className="badge">{doc.role}</span>
                    )}
                  </div>
                  <div className="doc-item-meta">
                    Updated {formatDate(doc.updatedAt)}
                    {doc.owner?.name && doc.role !== 'owner' && ` · Shared by ${doc.owner.name}`}
                  </div>
                </div>
                <div className="doc-item-actions">
                  <button
                    className="doc-actions-toggle btn-icon"
                    aria-haspopup="true"
                    aria-label="Open document actions"
                    aria-expanded={openMenuId === doc._id}
                    onClick={(e) => toggleActionsMenu(e, doc._id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleActionsMenu(e, doc._id);
                      }
                    }}
                  >
                    ⋯
                  </button>

                  {openMenuId === doc._id && (
                    <div className="doc-actions-menu" onClick={(e) => e.stopPropagation()} role="menu">
                      {doc.role === 'owner' && (
                        <button
                          className="doc-actions-item"
                          role="menuitem"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShareDoc(doc);
                            setOpenMenuId(null);
                          }}
                        >
                          <span className="action-icon">👥</span>
                          <span>Share</span>
                        </button>
                      )}

                      {doc.role === 'owner' && (
                        <button
                          className="doc-actions-item"
                          role="menuitem"
                          onClick={(e) => {
                            e.stopPropagation();
                            startRename(doc, e);
                            setOpenMenuId(null);
                          }}
                        >
                          <span className="action-icon">✏️</span>
                          <span>Edit</span>
                        </button>
                      )}

                      <button
                        className="doc-actions-item"
                        role="menuitem"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDuplicate(doc._id, e);
                          setOpenMenuId(null);
                        }}
                      >
                        <span className="action-icon">📋</span>
                        <span>Duplicate</span>
                      </button>

                      {doc.role === 'owner' && (
                        <button
                          className="doc-actions-item"
                          role="menuitem"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(doc._id, e);
                            setOpenMenuId(null);
                          }}
                        >
                          <span className="action-icon">🗑️</span>
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {renameId && (
        <div className="modal-overlay" onClick={() => setRenameId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Rename Document</h3>
            <input
              className="form-group input"
              style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}
              value={renameTitle}
              onChange={(e) => setRenameTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirmRename()}
              autoFocus
            />
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setRenameId(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmRename}>Save</button>
            </div>
          </div>
        </div>
      )}

      {shareDoc && (
        <ShareModal
          documentId={shareDoc._id}
          documentTitle={shareDoc.title}
          onClose={() => setShareDoc(null)}
        />
      )}
    </div>
  );
}
