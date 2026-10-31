import mongoose from 'mongoose';

const meetCronConfigSchema = new mongoose.Schema({
  enabled: {
    type: Boolean,
    default: false
  },
  scheduleType: {
    type: String,
    enum: ['daily', 'interval', 'selective_days'],
    default: 'daily'
  },
  refreshIntervalDays: {
    type: Number, // e.g. 1 (every day), 2 (every 2 days), 7 (every week)
    default: 1
  },
  runDays: {
    type: [Number], // 0: Sun, 1: Mon, ..., 6: Sat
    default: [1, 2, 3, 4, 5]
  },
  runTime: {
    type: String, // "02:00" in 24-hour IST format
    default: '02:00'
  },
  scope: {
    type: String,
    enum: ['all', 'selective'],
    default: 'all'
  },
  linkMode: {
    type: String,
    enum: ['single_shared', 'per_batch'],
    default: 'single_shared'
  },
  batchIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Batch'
  }],
  lastRunAt: {
    type: Date
  },
  lastRunStatus: {
    type: String,
    enum: ['idle', 'running', 'success', 'failed', 'partial'],
    default: 'idle'
  },
  lastRunSummary: {
    type: String,
    default: ''
  },
  lastRunResults: [{
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch' },
    batchName: String,
    meetingNumber: String,
    password: String,
    joinUrl: String,
    status: String,
    error: String
  }]
}, { timestamps: true });

const MeetCronConfig = mongoose.model('MeetCronConfig', meetCronConfigSchema);
export default MeetCronConfig;
