import mongoose from 'mongoose';

const PERMISSIONS = ['viewer', 'commenter', 'editor'];

const collaboratorSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    permission: { type: String, enum: PERMISSIONS, default: 'viewer' },
  },
  { _id: false }
);

const documentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, default: 'Untitled Document', trim: true },
    content: { type: String, default: '' },
    yjsState: { type: Buffer, default: null },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    collaborators: [collaboratorSchema],
  },
  { timestamps: true }
);

documentSchema.index({ owner: 1, updatedAt: -1 });
documentSchema.index({ 'collaborators.user': 1 });

export const PERMISSION_LEVELS = PERMISSIONS;
export default mongoose.model('Document', documentSchema);
