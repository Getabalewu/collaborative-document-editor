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
import * as Y from 'yjs';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { htmlToMarkdown, markdownToHtml } from '../utils/markdown';
import { SocketIOProvider } from '../hooks/useCollaboration';
import EditorToolbar from '../components/EditorToolbar';
import EditorSidebar from '../components/EditorSidebar';
import NotificationBar from '../components/NotificationBar';
import ShareModal from '../components/ShareModal';

function CollaborativeEditor({ ydoc, provider, user, canEdit, initialContent, onUpdate, onEditorReady }) {
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
    content: initialContent,
    onUpdate,
  });

  useEffect(() => {
    if (!editor || !initialContent) return;
    if (provider?.synced) return;

    editor.commands.setContent(initialContent);
  }, [editor, initialContent, provider]);

  useEffect(() => {
    if (!editor) return;
    onEditorReady?.(editor);
  }, [editor, onEditorReady]);

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
  const [showShareModal, setShowShareModal] = useState(false);
  const [initialContent, setInitialContent] = useState('<p></p>');
  const [notification, setNotification] = useState('');
  const [editorInstance, setEditorInstance] = useState(null);

  const { theme, toggleTheme } = useTheme();
  const ydocRef = useRef(null);
  const markdownInputRef = useRef(null);
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
      setNotification('Document saved');
      setTimeout(() => setSaveStatus(''), 2000);
    } catch {
      setSaveStatus('Save failed');
      setNotification('Save failed');
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

  function handleExportMarkdown() {
    if (!editorInstance) return;
    const markdown = htmlToMarkdown(editorInstance.getHTML());
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title || 'document'}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setNotification('Markdown exported');
  }

  function handleImportClick() {
    markdownInputRef.current?.click();
  }

  async function handleImportFile(file) {
    if (!file) return;
    const text = await file.text();
    const html = markdownToHtml(text);
    setInitialContent(html);
    editorHtmlRef.current = html;
    editorInstance?.commands?.setContent?.(html);
    setNotification('Markdown imported');
  }

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
        setInitialContent(doc.content || '<p></p>');
        editorHtmlRef.current = doc.content || '<p></p>';

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
        setTimeout(() => {
          if (mounted) setCollabReady(true);
        }, 300);
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

    const handleShortcut = async (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (canEdit) {
          await handleAutoSave();
        }
      }
    };
    window.addEventListener('keydown', handleShortcut);

    return () => {
      mounted = false;
      clearTimeout(saveTimerRef.current);
      clearTimeout(titleTimerRef.current);
      clearInterval(versionInterval);
      window.removeEventListener('keydown', handleShortcut);
      providerRef.current?.destroy();
    };
  }, [id, navigate, canEdit, handleAutoSave]);

  function handleTitleChange(e) {
    const newTitle = e.target.value;
    setTitle(newTitle);
    if (permission === 'owner') {
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
          disabled={permission !== 'owner'}
          title={permission !== 'owner' ? 'Only the document owner can rename' : ''}
          placeholder="Document title"
        />
        <div className="editor-header-actions">
          <button className="btn btn-secondary btn-sm" onClick={toggleTheme}>
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleExportMarkdown} disabled={!editorInstance}>
            Export MD
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleImportClick}>
            Import MD
          </button>
          <input
            ref={markdownInputRef}
            type="file"
            accept=".md,text/markdown"
            style={{ display: 'none' }}
            onChange={(e) => handleImportFile(e.target.files?.[0])}
          />
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
          {permission === 'owner' && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowShareModal(true)}>
              👥 Share
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => setShowSidebar((s) => !s)}>
            {showSidebar ? 'Hide Panel' : 'Show Panel'}
          </button>
        </div>
      </header>

      {permission !== 'owner' && (
        <div className="readonly-banner">
          Role: <strong>{permission.toUpperCase()}</strong> —{' '}
          {permission === 'editor'
            ? 'You can edit content (Only the Owner can rename, share, or restore versions).'
            : permission === 'commenter'
            ? 'You can view content and add comments.'
            : 'You have view-only access.'}
        </div>
      )}

      {typingUsers.length > 0 && (
        <div className="typing-indicator">
          {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
        </div>
      )}

      <NotificationBar message={notification} />
      <div className="editor-body">
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <CollaborativeEditor
            ydoc={ydocRef.current}
            provider={providerRef.current}
            user={user}
            canEdit={canEdit}
            initialContent={initialContent}
            onUpdate={handleEditorUpdate}
            onEditorReady={setEditorInstance}
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
