import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Batch',
      required: true,
    },
    enrollmentNo: {
      type: String,
      required: [true, 'Enrollment number is required'],
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'partial', 'paid'],
      default: 'pending',
    },
    totalAmount: {
      type: Number,
      required: true,
      default: 0,
    },
    paidAmount: {
      type: Number,
      default: 0,
    },
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['active', 'completed', 'dropped'],
      default: 'active',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Prevent a student from being added to the same batch twice
subscriptionSchema.index({ studentId: 1, batchId: 1 }, { unique: true });

// Virtual for due amount
subscriptionSchema.virtual('dueAmount').get(function () {
  return this.totalAmount - this.paidAmount;
});

const StudentSubscription = mongoose.model('StudentSubscription', subscriptionSchema);
export default StudentSubscription;
