import mongoose from 'mongoose';
import crypto from 'node:crypto';

const siteSchema = new mongoose.Schema(
  {
    // Human-friendly id used in URLs and by agents, e.g. "demo-site".
    _id: { type: String, required: true },
    name: { type: String, required: true },
    api_key: { type: String, required: true, unique: true, index: true },
    alert_threshold: { type: Number, required: true, default: 100, min: 1 },
    phone_number: { type: String, default: null },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

siteSchema.virtual('id').get(function () {
  return this._id;
});

export const newApiKey = () => 'flux_' + crypto.randomBytes(16).toString('hex');

export const Site = mongoose.model('Site', siteSchema);
