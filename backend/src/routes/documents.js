import { Router } from 'express';
import Document from '../models/Document.js';
import DocumentVersion from '../models/DocumentVersion.js';
import RecentDocument from '../models/RecentDocument.js';
import User from '../models/User.js';
import { authMiddleware } from '../middleware/auth.js';
import { getDocumentAccess, canView, canEdit } from '../utils/permissions.js';
import { broadcastRestoreToRoom } from '../socket/collaboration.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const userId = req.user._id;
    const owned = await Document.find({ owner: userId })
      .select('title updatedAt createdAt owner')
      .sort({ updatedAt: -1 })
      .lean();

    const shared = await Document.find({
      owner: { $ne: userId },
      'collaborators.user': userId,
    })
      .populate('owner', 'name email')
      .select('title updatedAt createdAt owner collaborators')
      .sort({ updatedAt: -1 })
      .lean();

    const ownedDocs = owned.map((d) => ({ ...d, role: 'owner' }));
    const sharedDocs = shared.map((d) => {
      const collab = d.collaborators.find((c) => c.user.toString() === userId.toString());
      return { ...d, role: collab?.permission || 'viewer' };
    });

    res.json({ documents: [...ownedDocs, ...sharedDocs] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/recent', async (req, res) => {
  try {
    const recent = await RecentDocument.find({ user: req.user._id })
      .populate({
        path: 'document',
        select: 'title updatedAt createdAt owner collaborators',
        populate: { path: 'owner', select: 'name email' },
      })
      .sort({ openedAt: -1 })
      .limit(10)
      .lean();

    const documents = recent
      .filter((r) => r.document)
      .map((r) => {
        const doc = r.document;
        const isOwner = doc.owner?._id?.toString() === req.user._id.toString();
        const collab = (doc.collaborators || []).find(
          (c) => c.user?.toString?.() === req.user._id.toString()
        );
        return { ...doc, role: isOwner ? 'owner' : collab?.permission || 'viewer' };
      });

    res.json({ documents });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const title = req.body.title?.trim() || 'Untitled Document';
    const doc = await Document.create({
      title,
      owner: req.user._id,
      content: '<p></p>',
    });
    res.status(201).json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/search/users', async (req, res) => {
  try {
    const q = req.query.q?.trim();
    const filter = { _id: { $ne: req.user._id } };

    if (q && q.length > 0) {
      filter.$or = [
        { name: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
      ];
    }

    const users = await User.find(filter)
      .select('name email')
      .limit(20);
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { doc, permission } = await getDocumentAccess(req.params.id, req.user._id);
    if (!doc || !canView(permission)) {
      return res.status(404).json({ error: 'Document not found' });
    }
    const populated = await Document.findById(doc._id)
      .populate('owner', 'name email')
      .populate('collaborators.user', 'name email');
    res.json({ document: populated, permission, hasYjsState: Boolean(populated.yjsState?.length) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/open', async (req, res) => {
  try {
    const { doc, permission } = await getDocumentAccess(req.params.id, req.user._id);
    if (!doc || !canView(permission)) {
      return res.status(404).json({ error: 'Document not found' });
    }
    await RecentDocument.updateOne(
      { user: req.user._id, document: doc._id },
      { $set: { openedAt: new Date() } },
      { upsert: true }
    );
    res.json({ message: 'Recorded' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const { doc, permission } = await getDocumentAccess(req.params.id, req.user._id);
    if (!doc || !canView(permission)) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const updates = {};
    if (req.body.title !== undefined) {
      if (permission !== 'owner') {
        return res.status(403).json({ error: 'Only the owner can rename this document' });
      }
      updates.title = req.body.title.trim();
    }
    if (req.body.content !== undefined) {
      if (!canEdit(permission)) {
        return res.status(403).json({ error: 'You do not have permission to edit this document' });
      }
      updates.content = req.body.content;
    }

    const updated = await Document.findByIdAndUpdate(req.params.id, updates, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { doc, permission } = await getDocumentAccess(req.params.id, req.user._id);
    if (!doc || permission !== 'owner') {
      return res.status(403).json({ error: 'Only the owner can delete this document' });
    }
    await DocumentVersion.deleteMany({ document: doc._id });
    await Document.findByIdAndDelete(doc._id);
    res.json({ message: 'Document deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/duplicate', async (req, res) => {
  try {
    const { doc, permission } = await getDocumentAccess(req.params.id, req.user._id);
    if (!doc || !canView(permission)) {
      return res.status(404).json({ error: 'Document not found' });
    }
    const full = await Document.findById(doc._id);
    const copy = await Document.create({
      title: `${full.title} (Copy)`,
      content: full.content,
      yjsState: full.yjsState,
      owner: req.user._id,
    });
    res.status(201).json(copy);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/save', async (req, res) => {
  try {
    const { doc, permission } = await getDocumentAccess(req.params.id, req.user._id);
    if (!doc || !canEdit(permission)) {
      return res.status(403).json({ error: 'You do not have permission to save this document' });
    }

    const { content, title, createVersion, yjsState } = req.body;
    const updates = {};
    if (content !== undefined) updates.content = content;
    if (yjsState !== undefined) updates.yjsState = Buffer.from(yjsState);
    if (title !== undefined && title.trim() !== doc.title) {
      if (permission !== 'owner') {
        return res.status(403).json({ error: 'Only the owner can rename this document' });
      }
      updates.title = title.trim();
    }

    const updated = await Document.findByIdAndUpdate(req.params.id, updates, { new: true });

    if (createVersion) {
      await DocumentVersion.create({
        document: doc._id,
        title: updated.title,
        content: updated.content,
        yjsState: yjsState !== undefined ? Buffer.from(yjsState) : updated.yjsState,
        savedBy: req.user._id,
        label: req.body.versionLabel || 'Auto-save',
      });
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/versions', async (req, res) => {
  try {
    const { doc, permission } = await getDocumentAccess(req.params.id, req.user._id);
    if (!doc || !canView(permission)) {
      return res.status(404).json({ error: 'Document not found' });
    }
    const versions = await DocumentVersion.find({ document: doc._id })
      .select('-yjsState')
      .populate('savedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ versions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/versions/:versionId/restore', async (req, res) => {
  try {
    const { doc, permission } = await getDocumentAccess(req.params.id, req.user._id);
    if (!doc || !canEdit(permission)) {
      return res.status(403).json({ error: 'You do not have permission to restore versions' });
    }
    const version = await DocumentVersion.findOne({
      _id: req.params.versionId,
      document: doc._id,
    });
    if (!version) {
      return res.status(404).json({ error: 'Version not found' });
    }

    await DocumentVersion.create({
      document: doc._id,
      title: doc.title,
      content: doc.content,
      yjsState: doc.yjsState,
      savedBy: req.user._id,
      label: 'Before restore',
    });

    const updates = { content: version.content, title: version.title };
    if (version.yjsState?.length) {
      updates.yjsState = version.yjsState;
    }
    const updated = await Document.findByIdAndUpdate(doc._id, updates, { new: true });

    if (version.yjsState?.length) {
      const state = Array.from(new Uint8Array(version.yjsState));
      broadcastRestoreToRoom(doc._id.toString(), state);
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/collaborators', async (req, res) => {
  try {
    const { doc, permission } = await getDocumentAccess(req.params.id, req.user._id);
    if (!doc || !canView(permission)) {
      return res.status(404).json({ error: 'Document not found' });
    }
    const populated = await Document.findById(doc._id)
      .populate('owner', 'name email')
      .populate('collaborators.user', 'name email');
    res.json({
      owner: populated.owner,
      collaborators: populated.collaborators,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/share', async (req, res) => {
  try {
    const { doc, permission } = await getDocumentAccess(req.params.id, req.user._id);
    if (!doc || permission !== 'owner') {
      return res.status(403).json({ error: 'Only the owner can share this document' });
    }

    const { email, permission: perm = 'viewer' } = req.body;
    if (!email?.trim()) {
      return res.status(400).json({ error: 'Email is required' });
    }
    if (!['viewer', 'commenter', 'editor'].includes(perm)) {
      return res.status(400).json({ error: 'Invalid permission level' });
    }

    const targetUser = await User.findOne({ email: email.toLowerCase() });
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found with that email' });
    }
    if (targetUser._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ error: 'You cannot share with yourself' });
    }

    const existing = doc.collaborators.find(
      (c) => c.user.toString() === targetUser._id.toString()
    );
    if (existing) {
      existing.permission = perm;
    } else {
      doc.collaborators.push({ user: targetUser._id, permission: perm });
    }
    await doc.save();

    const populated = await Document.findById(doc._id).populate(
      'collaborators.user',
      'name email'
    );
    res.json({ collaborators: populated.collaborators });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/share/:userId', async (req, res) => {
  try {
    const { doc, permission } = await getDocumentAccess(req.params.id, req.user._id);
    if (!doc || permission !== 'owner') {
      return res.status(403).json({ error: 'Only the owner can manage sharing' });
    }
    doc.collaborators = doc.collaborators.filter(
      (c) => c.user.toString() !== req.params.userId
    );
    await doc.save();
    res.json({ message: 'Collaborator removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
