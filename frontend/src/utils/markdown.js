export function htmlToMarkdown(html) {
  if (typeof DOMParser === 'undefined') return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');

  function nodeToMarkdown(node, prefix = '') {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || '';
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const tag = node.tagName.toLowerCase();
    const children = Array.from(node.childNodes).map((child) => nodeToMarkdown(child, prefix)).join('');

    switch (tag) {
      case 'h1':
        return `# ${children.trim()}\n\n`;
      case 'h2':
        return `## ${children.trim()}\n\n`;
      case 'h3':
        return `### ${children.trim()}\n\n`;
      case 'h4':
        return `#### ${children.trim()}\n\n`;
      case 'h5':
        return `##### ${children.trim()}\n\n`;
      case 'h6':
        return `###### ${children.trim()}\n\n`;
      case 'p':
        return `${children.trim()}\n\n`;
      case 'strong':
      case 'b':
        return `**${children}**`;
      case 'em':
      case 'i':
        return `*${children}*`;
      case 'u':
        return `__${children}__`;
      case 'a':
        return `[${children}](${node.getAttribute('href') || ''})`;
      case 'li':
        return `${prefix}- ${children.trim()}\n`;
      case 'ul':
        return `${Array.from(node.children).map((child) => nodeToMarkdown(child, prefix)).join('')}\n`;
      case 'ol':
        return `${Array.from(node.children)
          .map((child, index) => `${prefix}${index + 1}. ${nodeToMarkdown(child, prefix).trim()}\n`)
          .join('')}\n`;
      case 'br':
        return '  \n';
      case 'div':
      case 'section':
      case 'article':
      case 'blockquote':
        return `${children}\n`;
      default:
        return children;
    }
  }

  return Array.from(doc.body.childNodes).map((node) => nodeToMarkdown(node)).join('').trim();
}

export function markdownToHtml(markdown) {
  const lines = markdown.split(/\r?\n/);
  const htmlLines = [];
  let activeList = null;

  function flushList() {
    if (!activeList) return;
    htmlLines.push(`</${activeList}>`);
    activeList = null;
  }

  function formatInline(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<u>$1</u>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      htmlLines.push('');
      continue;
    }
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    const unorderedMatch = line.match(/^[-*]\s+(.*)$/);
    const orderedMatch = line.match(/^\d+\.\s+(.*)$/);

    if (headingMatch) {
      flushList();
      const level = Math.min(6, headingMatch[1].length);
      htmlLines.push(`<h${level}>${formatInline(headingMatch[2])}</h${level}>`);
      continue;
    }

    if (unorderedMatch) {
      if (activeList !== 'ul') {
        flushList();
        activeList = 'ul';
        htmlLines.push('<ul>');
      }
      htmlLines.push(`<li>${formatInline(unorderedMatch[1])}</li>`);
      continue;
    }

    if (orderedMatch) {
      if (activeList !== 'ol') {
        flushList();
        activeList = 'ol';
        htmlLines.push('<ol>');
      }
      htmlLines.push(`<li>${formatInline(orderedMatch[1])}</li>`);
      continue;
    }

    htmlLines.push(`<p>${formatInline(line)}</p>`);
  }

  flushList();
  return htmlLines.join('\n');
}
