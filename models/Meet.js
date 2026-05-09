import mongoose from 'mongoose';

const meetSchema = new mongoose.Schema({
  batch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Batch',
  },
  provider: {
    type: String,
    default: 'zoom'
  },
  meetingNumber: {
    type: String,
    required: true
  },
  password: {
    type: String,
    required: true
  },
  startTime: Date,
  endTime: Date,
  duration: Number,
  status: {
    type: String,
    enum: ['scheduled', 'live', 'ended'],
    default: 'scheduled'
  }
}, { timestamps: true });

// Ensure one meet per batch
meetSchema.index(
  { batch: 1 },
  { unique: true, partialFilterExpression: { batch: { $exists: true } } }
);

const Meet = mongoose.model('Meet', meetSchema);
export default Meet;
