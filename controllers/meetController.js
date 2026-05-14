import Meet from '../models/Meet.js';
import Batch from '../models/Batch.js';
import StudentSubscription from '../models/StudentSubscription.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
export const getMeetByBatch = async (req, res) => {
  try {
    const { batchId } = req.params;
    const meets = await Meet.find({ batch: batchId }).populate('batch');
    res.json(meets);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createOrUpdateMeet = async (req, res) => {
  try {
    const { batchId, meetingNumber, password, status } = req.body;

    const batch = await Batch.findById(batchId);
    if (!batch) return res.status(404).json({ message: 'Batch not found' });

    // Helper to convert time string (HH:mm) to Date
    const getTodayTimeDate = (timeStr) => {
      const [hours, minutes] = timeStr.split(':').map(Number);
      const d = new Date();
      d.setHours(hours, minutes, 0, 0);
      return d;
    };

    let meet = await Meet.findOne({ batch: batchId });

    const startTime = getTodayTimeDate(batch.startTime);
    const endTime = getTodayTimeDate(batch.endTime);
    const duration = Math.floor((endTime - startTime) / (1000 * 60)); // in minutes

    if (meet) {
      meet.meetingNumber = meetingNumber.replace(/\s/g, '');
      meet.password = password;
      meet.startTime = startTime;
      meet.endTime = endTime;
      meet.duration = duration;
      if (status) meet.status = status;
      await meet.save();
    } else {
      meet = await Meet.create({
        batch: batchId,
        meetingNumber: meetingNumber.replace(/\s/g, ''),
        password,
        startTime,
        endTime,
        duration,
        status: status || 'scheduled'
      });
    }

    res.json(meet);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getSignature = (req, res) => {
  const { meetingNumber, role } = req.body;

  const sdkKey = process.env.ZOOM_SDK_KEY;
  const sdkSecret = process.env.ZOOM_SDK_SECRET;

  const iat = Math.floor(Date.now() / 1000) - 30;
  const exp = iat + 60 * 60 * 2;

  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    sdkKey: sdkKey,
    mn: String(meetingNumber).replace(/\s/g, ""),
    role: Number(role),
    iat: iat,
    exp: exp,
    appKey: sdkKey,
    tokenExp: exp
  };

  const sHeader = JSON.stringify(header);
  const sPayload = JSON.stringify(payload);

  const base64Header = Buffer.from(sHeader).toString("base64url");
  const base64Payload = Buffer.from(sPayload).toString("base64url");

  const signaturePart = crypto
    .createHmac("sha256", sdkSecret)
    .update(`${base64Header}.${base64Payload}`)
    .digest("base64url");

  const signature = `${base64Header}.${base64Payload}.${signaturePart}`;

  res.json({ signature, sdkKey });
};

export const getMyLiveClasses = async (req, res) => {
  try {
    const studentId = req.user.id;
    const todayWeekday = new Date().getDay();

    // 1. Get ALL active subscriptions for this student
    const subs = await StudentSubscription.find({ studentId, status: 'active' });
    if (!subs || subs.length === 0) return res.json([]);

    // 2. Aggregate all batch IDs
    let batchIds = [];
    subs.forEach(sub => {
      if (sub.batchIds && sub.batchIds.length > 0) {
        batchIds.push(...sub.batchIds);
      } else if (sub.batchId) {
        batchIds.push(sub.batchId);
      }
    });

    if (batchIds.length === 0) return res.json([]);

    // 3. Fetch batches
    const batches = await Batch.find({ _id: { $in: batchIds } });
    if (batches.length === 0) return res.json([]);

    // 4. Fetch meetings for these batches
    const meetings = await Meet.find({
      batch: { $in: batchIds },
      status: { $ne: 'ended' }
    }).populate('batch');

    // 5. Create a map of batchId -> meeting
    const meetingMap = {};
    meetings.forEach(m => {
      meetingMap[String(m.batch?._id || m.batch)] = m;
    });

    // 6. Return the batches as "meets" (placeholders if no meet exists)
    const result = batches.map(batch => {
      const bId = String(batch._id);
      const existingMeet = meetingMap[bId];

      if (existingMeet) return existingMeet;

      return {
        _id: `placeholder-${bId}`,
        batch: batch,
        meetingNumber: 'Not Scheduled',
        status: 'scheduled',
        isPlaceholder: true
      };
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getTrainerLiveClasses = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    // 1. Get batches where trainer is explicitly assigned
    const assignedBatchIds = user?.batchIds || [];

    // 2. ALSO get batches where trainer is the creator
    const createdBatches = await Batch.find({ createdBy: userId });
    const createdBatchIds = createdBatches.map(b => b._id);

    // 3. Combine and deduplicate
    const allBatchIdStrings = [...new Set([
      ...assignedBatchIds.map(id => id.toString()),
      ...createdBatchIds.map(id => id.toString())
    ])];

    if (allBatchIdStrings.length === 0) return res.json([]);

    // 4. Fetch the actual batch objects
    const batches = await Batch.find({ _id: { $in: allBatchIdStrings } });

    // 5. Fetch all meetings for these batches that haven't ended
    const meetings = await Meet.find({
      batch: { $in: allBatchIdStrings },
      status: { $ne: 'ended' }
    }).populate('batch');

    // 6. Create a map of batchId -> meeting for quick lookup
    const meetingMap = {};
    meetings.forEach(m => {
      meetingMap[String(m.batch?._id || m.batch)] = m;
    });

    // 7. Ensure every batch (assigned or created) is represented in the output
    const result = batches.map(batch => {
      const bId = String(batch._id);
      const existingMeet = meetingMap[bId];

      if (existingMeet) return existingMeet;

      // If no meeting exists, return a skeleton "scheduled" meet object for the UI
      return {
        _id: `new-${bId}`,
        batch: batch,
        meetingNumber: 'Not Started',
        status: 'scheduled',
        isPlaceholder: true
      };
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
