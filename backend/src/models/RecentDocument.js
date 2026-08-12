import mongoose from 'mongoose';

const recentDocumentSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
    openedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

recentDocumentSchema.index({ user: 1, openedAt: -1 });
recentDocumentSchema.index({ user: 1, document: 1 }, { unique: true });

export default mongoose.model('RecentDocument', recentDocumentSchema);
