import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { SocketIOProvider } from '../hooks/useCollaboration';
import EditorToolbar from '../components/EditorToolbar';
import EditorSidebar from '../components/EditorSidebar';

function CollaborativeEditor({ ydoc, provider, user, canEdit, onUpdate }) {
  const userColor = getColor(user?.id || 'default');

  useEffect(() => {
    provider?.setUser({ name: user?.name, color: userColor });
  }, [provider, user, userColor]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ history: false }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: 'Start writing...' }),
      Collaboration.configure({ document: ydoc }),
      CollaborationCursor.configure({
        provider,
        user: { name: user?.name, color: userColor },
      }),
    ],
    editable: canEdit,
    onUpdate,
  });

  useEffect(() => {
    if (editor) editor.setEditable(canEdit);
  }, [editor, canEdit]);

  return (
    <>
      <EditorToolbar editor={editor} canEdit={canEdit} />
      <div className="editor-content-wrapper">
        <div className="editor-content">
          <EditorContent editor={editor} />
        </div>
      </div>
    </>
  );
}

export default function Editor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [title, setTitle] = useState('Untitled Document');
  const [permission, setPermission] = useState(null);
  const [canEdit, setCanEdit] = useState(false);
  const [presence, setPresence] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [saveStatus, setSaveStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [collabReady, setCollabReady] = useState(false);

  const ydocRef = useRef(null);
  const providerRef = useRef(null);
  const saveTimerRef = useRef(null);
  const titleTimerRef = useRef(null);
  const editorHtmlRef = useRef('');

  const handleAutoSave = useCallback(async () => {
    if (!canEdit) return;
    setSaveStatus('Saving...');
    try {
      await api.saveDocument(id, {
        content: editorHtmlRef.current,
        title,
        createVersion: false,
      });
      setSaveStatus('Saved');
      setTimeout(() => setSaveStatus(''), 2000);
    } catch {
      setSaveStatus('Save failed');
    }
  }, [id, title, canEdit]);

  const handleEditorUpdate = useCallback(({ editor }) => {
    if (!canEdit) return;
    editorHtmlRef.current = editor.getHTML();
    providerRef.current?.emitTyping(true);
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      providerRef.current?.emitTyping(false);
      handleAutoSave();
    }, 1500);
  }, [canEdit, handleAutoSave]);

  useEffect(() => {
    let mounted = true;
    const token = localStorage.getItem('token');

    async function init() {
      try {
        const { document: doc, permission: perm } = await api.getDocument(id);
        if (!mounted) return;

        setTitle(doc.title);
        setPermission(perm);
        setCanEdit(['owner', 'editor'].includes(perm));

        const { default: Y } = await import('yjs');
        const ydoc = new Y.Doc();
        ydocRef.current = ydoc;

        const provider = new SocketIOProvider(id, ydoc, {
          token,
          onSynced: () => {
            if (mounted) setCollabReady(true);
          },
          onPermission: ({ permission: p, canEdit: ce }) => {
            setPermission(p);
            setCanEdit(ce);
          },
          onPresence: (users) => setPresence(users),
          onTyping: ({ name, isTyping }) => {
            setTypingUsers((prev) => {
              if (isTyping) return prev.includes(name) ? prev : [...prev, name];
              return prev.filter((n) => n !== name);
            });
          },
          onError: (msg) => console.error(msg),
        });
        providerRef.current = provider;
        setLoading(false);
      } catch (err) {
        alert(err.message);
        navigate('/');
      }
    }

    init();

    const versionInterval = setInterval(() => {
      if (editorHtmlRef.current) {
        api.saveDocument(id, {
          content: editorHtmlRef.current,
          title,
          createVersion: true,
          versionLabel: 'Auto-save',
        }).catch(() => {});
      }
    }, 60000);

    return () => {
      mounted = false;
      clearTimeout(saveTimerRef.current);
      clearTimeout(titleTimerRef.current);
      clearInterval(versionInterval);
      providerRef.current?.destroy();
    };
  }, [id, navigate]);

  function handleTitleChange(e) {
    const newTitle = e.target.value;
    setTitle(newTitle);
    if (canEdit) {
      clearTimeout(titleTimerRef.current);
      titleTimerRef.current = setTimeout(async () => {
        try {
          await api.updateDocument(id, { title: newTitle });
        } catch (err) {
          console.error(err);
        }
      }, 800);
    }
  }

  function getInitials(name) {
    return name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '?';
  }

  if (loading || !collabReady) {
    return <div className="loading-screen">Loading document...</div>;
  }

  return (
    <div className="editor-page">
      <header className="editor-header">
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/')}>
          ← Back
        </button>
        <input
          className="editor-title-input"
          value={title}
          onChange={handleTitleChange}
          disabled={!canEdit}
          placeholder="Document title"
        />
        <div className="editor-header-actions">
          <span className={`save-status ${saveStatus === 'Saved' ? 'saved' : ''}`}>
            {saveStatus}
          </span>
          <div className="presence-bar">
            {presence.map((u, i) => (
              <div
                key={`${u.name}-${i}`}
                className="presence-avatar"
                title={`${u.name} (online)`}
                style={{ backgroundColor: u.color }}
              >
                {getInitials(u.name)}
              </div>
            ))}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowSidebar((s) => !s)}>
            {showSidebar ? 'Hide Panel' : 'Show Panel'}
          </button>
        </div>
      </header>

      {!canEdit && (
        <div className="readonly-banner">
          You have {permission} access — editing is disabled.
        </div>
      )}

      {typingUsers.length > 0 && (
        <div className="typing-indicator">
          {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
        </div>
      )}

      <div className="editor-body">
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <CollaborativeEditor
            ydoc={ydocRef.current}
            provider={providerRef.current}
            user={user}
            canEdit={canEdit}
            onUpdate={handleEditorUpdate}
          />
        </div>
        {showSidebar && (
          <EditorSidebar
            documentId={id}
            permission={permission}
            onRestore={() => window.location.reload()}
          />
        )}
      </div>
    </div>
  );
}

function getColor(id) {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}
