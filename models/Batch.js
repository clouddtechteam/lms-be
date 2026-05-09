import mongoose from 'mongoose';

const batchSchema = new mongoose.Schema(
  {
    batchId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Batch name is required'],
      trim: true,
      unique: true,
    },
    startTime: {
      type: String, // e.g. "10:00"
      required: [true, 'Start time is required'],
    },
    endTime: {
      type: String, // e.g. "11:00"
      required: [true, 'End time is required'],
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

const Batch = mongoose.model('Batch', batchSchema);
export default Batch;
