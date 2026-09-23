import mongoose from 'mongoose';

const metricSchema = new mongoose.Schema({
  site_id: { type: String, required: true, ref: 'Site' },
  // Unix epoch seconds — cheap to bucket in an aggregation pipeline.
  timestamp: { type: Number, required: true },
  request_count: { type: Number, required: true, min: 0 },
});

metricSchema.index({ site_id: 1, timestamp: 1 });

export const Metric = mongoose.model('Metric', metricSchema);
