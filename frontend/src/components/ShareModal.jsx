import { useState, useEffect } from 'react';
import { api } from '../api/client';

export default function ShareModal({ documentId, documentTitle, onClose }) {
  const [userList, setUserList] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const [permission, setPermission] = useState('editor');
  const [collaborators, setCollaborators] = useState({ owner: null, collaborators: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    async function loadData() {
      try {
        const [collabData, userData] = await Promise.all([
          api.getCollaborators(documentId),
          api.searchUsers(''),
        ]);
        setCollaborators(collabData);
        setUserList(userData.users || []);
        if (userData.users?.length > 0) {
          setSelectedEmail(userData.users[0].email);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [documentId]);

  async function handleShare(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    const emailToShare = selectedEmail || customEmail.trim();
    if (!emailToShare) {
      setError('Please select or enter a user email');
      return;
    }
    try {
      const { collaborators: c } = await api.shareDocument(documentId, emailToShare, permission);
      setCollaborators((prev) => ({ ...prev, collaborators: c }));
      setSuccess(`Successfully shared with ${emailToShare} as ${permission}`);
      setCustomEmail('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleUpdatePermission(email, newPerm) {
    try {
      const { collaborators: c } = await api.shareDocument(documentId, email, newPerm);
      setCollaborators((prev) => ({ ...prev, collaborators: c }));
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleRemove(userId) {
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480, width: '90%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>👥 Share "{documentTitle || 'Document'}"</h3>
          <button className="btn-icon" onClick={onClose} style={{ fontSize: '1.2rem' }}>✕</button>
        </div>

        {loading ? (
          <div>Loading user list...</div>
        ) : (
          <div>
            <form onSubmit={handleShare} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>
                  1. Select Registered User:
                </label>
                {userList.length > 0 ? (
                  <select
                    value={selectedEmail}
                    onChange={(e) => setSelectedEmail(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}
                  >
                    {userList.map((u) => (
                      <option key={u._id} value={u.email}>
                        {u.name} ({u.email})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="email"
                    placeholder="Enter user email..."
                    value={customEmail}
                    onChange={(e) => setCustomEmail(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}
                  />
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>
                  2. Assign Permission Role:
                </label>
                <select
                  value={permission}
                  onChange={(e) => setPermission(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}
                >
                  <option value="editor">Editor — Can edit content & add comments</option>
                  <option value="commenter">Commenter — Can view & add comments</option>
                  <option value="viewer">Viewer — Can view content only</option>
                </select>
              </div>

              {error && <div className="error-message">{error}</div>}
              {success && <div style={{ color: 'green', fontSize: '0.85rem' }}>{success}</div>}

              <button type="submit" className="btn btn-primary" style={{ marginTop: 8 }}>
                Share Access
              </button>
            </form>

            <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <h4 style={{ fontSize: '0.95rem', marginBottom: 12 }}>Collaborators with access</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                  <span>👑 <strong>{collaborators.owner?.name}</strong> (Owner)</span>
                </div>
                {collaborators.collaborators?.map((c) => (
                  <div key={c.user._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: '1px solid #eee' }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: '0.85rem' }}>{c.user.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.user.email}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <select
                        value={c.permission}
                        onChange={(e) => handleUpdatePermission(c.user.email, e.target.value)}
                        style={{ padding: '4px 8px', fontSize: '0.8rem', borderRadius: 4 }}
                      >
                        <option value="editor">Editor</option>
                        <option value="commenter">Commenter</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <button className="btn-icon" title="Remove User" onClick={() => handleRemove(c.user._id)}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: 20 }}>
          <button className="btn btn-secondary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
