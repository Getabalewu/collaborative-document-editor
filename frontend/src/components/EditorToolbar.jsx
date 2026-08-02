export default function EditorToolbar({ editor, canEdit }) {
  if (!editor) return null;

  function setLink() {
    const prev = editor.getAttributes('link').href;
    const url = window.prompt('Enter URL', prev || 'https://');
    if (url === null) return;
    if (url.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  }

  function unsetLink() {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
  }

  return (
    <div className="editor-toolbar">
      {/* Headings */}
      <div className="toolbar-group">
        <button
          className={`toolbar-btn ${editor.isActive('heading', { level: 1 }) ? 'active' : ''}`}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          disabled={!canEdit}
          title="Heading 1"
        >
          H1
        </button>
        <button
          className={`toolbar-btn ${editor.isActive('heading', { level: 2 }) ? 'active' : ''}`}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          disabled={!canEdit}
          title="Heading 2"
        >
          H2
        </button>
        <button
          className={`toolbar-btn ${editor.isActive('heading', { level: 3 }) ? 'active' : ''}`}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          disabled={!canEdit}
          title="Heading 3"
        >
          H3
        </button>
      </div>

      {/* Formatting Marks */}
      <div className="toolbar-group">
        <button
          className={`toolbar-btn ${editor.isActive('bold') ? 'active' : ''}`}
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={!canEdit}
          title="Bold (Ctrl+B)"
        >
          <strong>B</strong>
        </button>
        <button
          className={`toolbar-btn ${editor.isActive('italic') ? 'active' : ''}`}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={!canEdit}
          title="Italic (Ctrl+I)"
        >
          <em>I</em>
        </button>
        <button
          className={`toolbar-btn ${editor.isActive('underline') ? 'active' : ''}`}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          disabled={!canEdit}
          title="Underline (Ctrl+U)"
        >
          <u>U</u>
        </button>
      </div>

      {/* Lists */}
      <div className="toolbar-group">
        <button
          className={`toolbar-btn ${editor.isActive('bulletList') ? 'active' : ''}`}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          disabled={!canEdit}
          title="Bullet List"
        >
          • List
        </button>
        <button
          className={`toolbar-btn ${editor.isActive('orderedList') ? 'active' : ''}`}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          disabled={!canEdit}
          title="Numbered List"
        >
          1. List
        </button>
      </div>

      {/* Text Alignment */}
      <div className="toolbar-group">
        <button
          className={`toolbar-btn ${editor.isActive({ textAlign: 'left' }) ? 'active' : ''}`}
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          disabled={!canEdit}
          title="Align Left"
        >
          Left
        </button>
        <button
          className={`toolbar-btn ${editor.isActive({ textAlign: 'center' }) ? 'active' : ''}`}
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          disabled={!canEdit}
          title="Align Center"
        >
          Center
        </button>
        <button
          className={`toolbar-btn ${editor.isActive({ textAlign: 'right' }) ? 'active' : ''}`}
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          disabled={!canEdit}
          title="Align Right"
        >
          Right
        </button>
        <button
          className={`toolbar-btn ${editor.isActive({ textAlign: 'justify' }) ? 'active' : ''}`}
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          disabled={!canEdit}
          title="Justify"
        >
          Justify
        </button>
      </div>

      {/* Hyperlinks */}
      <div className="toolbar-group">
        <button
          className={`toolbar-btn ${editor.isActive('link') ? 'active' : ''}`}
          onClick={setLink}
          disabled={!canEdit}
          title="Insert / Edit Link"
        >
          🔗 Link
        </button>
        {editor.isActive('link') && (
          <button
            className="toolbar-btn"
            onClick={unsetLink}
            disabled={!canEdit}
            title="Remove Link"
          >
            ❌ Remove Link
          </button>
        )}
      </div>
    </div>
  );
}
