import mongoose from 'mongoose';

const meetCronConfigSchema = new mongoose.Schema({
  enabled: {
    type: Boolean,
    default: false
  },
  scheduleType: {
    type: String,
    enum: ['daily', 'selective_days'],
    default: 'daily'
  },
  runDays: {
    type: [Number], // 0: Sun, 1: Mon, ..., 6: Sat
    default: [1, 2, 3, 4, 5]
  },
  runTime: {
    type: String, // "06:00" in 24-hour format
    default: '06:00'
  },
  scope: {
    type: String,
    enum: ['all', 'selective'],
    default: 'all'
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
  }
}, { timestamps: true });

const MeetCronConfig = mongoose.model('MeetCronConfig', meetCronConfigSchema);
export default MeetCronConfig;
