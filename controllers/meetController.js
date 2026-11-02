import Meet from '../models/Meet.js';
import Batch from '../models/Batch.js';
import StudentSubscription from '../models/StudentSubscription.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import MeetCronConfig from '../models/MeetCronConfig.js';
import { reloadCron, runMeetingGenerationJob } from '../utils/cronService.js';
import { deleteZoomMeeting } from '../utils/zoomService.js';
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
    const { batchId, meetingNumber, password, joinUrl, status } = req.body;

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
    const oldMeetingNumber = meet?.meetingNumber;

    const startTime = getTodayTimeDate(batch.startTime);
    const endTime = getTodayTimeDate(batch.endTime);
    const duration = Math.floor((endTime - startTime) / (1000 * 60)); // in minutes

    const cleanMeetingNumber = meetingNumber.replace(/\s/g, '');
    const cleanJoinUrl = joinUrl || `https://us02web.zoom.us/j/${cleanMeetingNumber}?pwd=${password}`;

    if (meet) {
      meet.meetingNumber = cleanMeetingNumber;
      meet.password = password;
      meet.joinUrl = cleanJoinUrl;
      meet.startTime = startTime;
      meet.endTime = endTime;
      meet.duration = duration;
      if (status) meet.status = status;
      await meet.save();

      // Deactivate old Zoom meeting if meeting number changed
      if (oldMeetingNumber && oldMeetingNumber !== cleanMeetingNumber) {
        deleteZoomMeeting(oldMeetingNumber).catch(err => {
          console.warn(`[MeetController] Non-fatal error deactivating old meeting ${oldMeetingNumber}:`, err.message);
        });
      }
    } else {
      meet = await Meet.create({
        batch: batchId,
        meetingNumber: cleanMeetingNumber,
        password,
        joinUrl: cleanJoinUrl,
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

// ── Cron & Automation Controllers ──
export const getCronConfig = async (req, res) => {
  try {
    let config = await MeetCronConfig.findOne().populate('batchIds', 'name batchId startTime endTime weekdays');
    if (!config) {
      config = await MeetCronConfig.create({});
    }
    res.json(config);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateCronConfig = async (req, res) => {
  try {
    const { enabled, scheduleType, refreshIntervalDays, runDays, runTime, scope, linkMode, batchIds } = req.body;
    let config = await MeetCronConfig.findOne();
    if (!config) {
      config = new MeetCronConfig();
    }

    if (enabled !== undefined) config.enabled = enabled;
    if (scheduleType !== undefined) config.scheduleType = scheduleType;
    if (refreshIntervalDays !== undefined) config.refreshIntervalDays = Math.max(1, parseInt(refreshIntervalDays) || 1);
    if (runDays !== undefined) config.runDays = runDays;
    if (runTime !== undefined) config.runTime = runTime;
    if (scope !== undefined) config.scope = scope;
    if (linkMode !== undefined) config.linkMode = linkMode;
    if (batchIds !== undefined) config.batchIds = batchIds;

    await config.save();
    await reloadCron();

    res.json({ message: 'Cron configuration saved and reloaded', config });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const triggerCronNow = async (req, res) => {
  try {
    const { batchIds } = req.body || {};
    const results = await runMeetingGenerationJob({ isManual: true, batchIdsOverride: batchIds });
    res.json({ message: 'Meeting generation completed', results });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Public webhook endpoint for external schedulers (e.g. cron-job.org / Render Cron)
 * to wake up Render Free tier at 2:00 AM IST and trigger meeting sync
 */
export const wakeAndSyncCron = async (req, res) => {
  try {
    const providedSecret = req.query.secret || req.headers['x-cron-secret'];
    const validSecret = process.env.CRON_SECRET || process.env.ZOOM_SECRET_TOKEN || 'cron_sync_2am';

    if (providedSecret !== validSecret) {
      return res.status(401).json({ message: 'Unauthorized: Invalid cron secret' });
    }

    console.log('[MeetCron] External wake-and-sync triggered at:', new Date().toISOString());
    const results = await runMeetingGenerationJob({ isManual: false });
    res.json({ message: 'External cron sync completed successfully', results });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
