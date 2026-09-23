import mongoose from 'mongoose';

const alertSchema = new mongoose.Schema({
  site_id: { type: String, required: true, ref: 'Site' },
  fired_at: { type: Number, required: true }, // unix epoch seconds
  request_count: { type: Number, required: true }, // observed value that breached
  threshold: { type: Number, required: true }, // threshold at firing time
  message: { type: String, required: true },
  sms_status: {
    type: String,
    enum: ['sent', 'failed', 'skipped'],
    required: true,
  },
});

alertSchema.index({ site_id: 1, fired_at: -1 });

export const Alert = mongoose.model('Alert', alertSchema);
