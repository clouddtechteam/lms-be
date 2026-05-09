import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema({
  meet: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Meet',
    required: true
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  batch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Batch'
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['joined', 'left'],
    default: 'joined'
  }
}, { timestamps: true });

export default mongoose.model('Attendance', attendanceSchema);
