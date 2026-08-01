import { Router } from 'express';
import Comment from '../models/Comment.js';
import { authMiddleware } from '../middleware/auth.js';
import { getDocumentAccess, canView, canComment } from '../utils/permissions.js';

const router = Router({ mergeParams: true });
router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const { doc, permission } = await getDocumentAccess(req.params.id, req.user._id);
    if (!doc || !canView(permission)) {
      return res.status(404).json({ error: 'Document not found' });
    }
    const comments = await Comment.find({ document: doc._id })
      .populate('author', 'name email')
      .sort({ createdAt: -1 });
    res.json({ comments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { doc, permission } = await getDocumentAccess(req.params.id, req.user._id);
    if (!doc || !canComment(permission)) {
      return res.status(403).json({ error: 'You do not have permission to comment' });
    }
    const text = req.body.text?.trim();
    if (!text) {
      return res.status(400).json({ error: 'Comment text is required' });
    }
    const comment = await Comment.create({
      document: doc._id,
      author: req.user._id,
      text,
    });
    const populated = await Comment.findById(comment._id).populate('author', 'name email');
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:commentId', async (req, res) => {
  try {
    const { doc, permission } = await getDocumentAccess(req.params.id, req.user._id);
    if (!doc || !canComment(permission)) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    const comment = await Comment.findOne({ _id: req.params.commentId, document: doc._id });
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    if (req.body.resolved !== undefined) {
      comment.resolved = req.body.resolved;
    }
    if (req.body.text !== undefined && comment.author.toString() === req.user._id.toString()) {
      comment.text = req.body.text.trim();
    }
    await comment.save();
    const populated = await Comment.findById(comment._id).populate('author', 'name email');
    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:commentId', async (req, res) => {
  try {
    const { doc, permission } = await getDocumentAccess(req.params.id, req.user._id);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    const comment = await Comment.findOne({ _id: req.params.commentId, document: doc._id });
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    const isAuthor = comment.author.toString() === req.user._id.toString();
    if (!isAuthor && permission !== 'owner') {
      return res.status(403).json({ error: 'Permission denied' });
    }
    await comment.deleteOne();
    res.json({ message: 'Comment deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
