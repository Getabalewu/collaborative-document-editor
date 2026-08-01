import Document from '../models/Document.js';

export async function getDocumentAccess(documentId, userId) {
  const doc = await Document.findById(documentId).populate('owner', 'name email');
  if (!doc) return { doc: null, permission: null };

  if (doc.owner._id.toString() === userId.toString()) {
    return { doc, permission: 'owner' };
  }

  const collab = doc.collaborators.find((c) => c.user.toString() === userId.toString());
  if (collab) {
    return { doc, permission: collab.permission };
  }

  return { doc: null, permission: null };
}

export function canView(permission) {
  return ['owner', 'viewer', 'commenter', 'editor'].includes(permission);
}

export function canComment(permission) {
  return ['owner', 'commenter', 'editor'].includes(permission);
}

export function canEdit(permission) {
  return ['owner', 'editor'].includes(permission);
}
