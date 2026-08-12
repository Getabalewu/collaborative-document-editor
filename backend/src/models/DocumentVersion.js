import mongoose from 'mongoose';

const versionSchema = new mongoose.Schema(
  {
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
    title: { type: String, required: true },
    content: { type: String, default: '' },
    yjsState: { type: Buffer, default: null },
    savedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    label: { type: String, default: 'Auto-save' },
  },
  { timestamps: true }
);

versionSchema.index({ document: 1, createdAt: -1 });

export default mongoose.model('DocumentVersion', versionSchema);
