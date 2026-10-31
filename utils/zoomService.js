import Meet from '../models/Meet.js';
import Batch from '../models/Batch.js';

let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Retrieve Server-to-Server OAuth Access Token from Zoom
 */
export const getZoomAccessToken = async () => {
  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID || process.env.ZOOM_SDK_KEY;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET || process.env.ZOOM_SDK_SECRET;

  if (!accountId || !clientId || !clientSecret) {
    throw new Error('Zoom Server-to-Server OAuth credentials missing in .env (ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID/SDK_KEY, ZOOM_CLIENT_SECRET/SDK_SECRET)');
  }

  // Return cached token if valid with 60s buffer
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const url = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error_description || data.message || `Zoom OAuth Failed (${response.status})`);
  }

  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in * 1000);

  return cachedToken;
};

/**
 * Helper to convert batch HH:mm time to a Date object for today
 */
const getTodayTimeDate = (timeStr) => {
  if (!timeStr) return new Date();
  const [hours, minutes] = timeStr.split(':').map(Number);
  const d = new Date();
  d.setHours(hours || 0, minutes || 0, 0, 0);
  return d;
};

/**
 * Create a new Zoom meeting for a given Batch via Zoom REST API
 */
export const createZoomMeetingForBatch = async (batch) => {
  const accessToken = await getZoomAccessToken();

  const startTime = getTodayTimeDate(batch.startTime);
  const endTime = getTodayTimeDate(batch.endTime);
  const duration = Math.max(15, Math.floor((endTime - startTime) / (1000 * 60))) || 60;

  const meetingPayload = {
    topic: `${batch.name} - Class`,
    type: 2, // Scheduled meeting
    start_time: startTime.toISOString(),
    duration: duration,
    timezone: 'Asia/Kolkata',
    settings: {
      host_video: true,
      participant_video: true,
      join_before_host: true,
      waiting_room: false,
      mute_upon_entry: false
    }
  };

  const response = await fetch('https://api.zoom.us/v2/users/me/meetings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(meetingPayload)
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || `Zoom API meeting creation failed (${response.status})`);
  }

  const meetingNumber = String(data.id).replace(/\s/g, '');
  const password = data.password || '';
  const joinUrl = data.join_url || `https://us02web.zoom.us/j/${meetingNumber}?pwd=${password}`;

  // Upsert into Meet collection
  const meet = await Meet.findOneAndUpdate(
    { batch: batch._id },
    {
      batch: batch._id,
      meetingNumber,
      password,
      joinUrl,
      startTime,
      endTime,
      duration,
      status: 'scheduled'
    },
    { upsert: true, new: true }
  );

  return {
    batchId: batch._id,
    batchName: batch.name,
    meetingNumber,
    password,
    joinUrl,
    meetId: meet._id
  };
};

/**
 * Generate meetings for specific batches or all active batches
 */
export const syncMeetingsForBatches = async (batchIds = null) => {
  let query = {};
  if (batchIds && batchIds.length > 0) {
    query = { _id: { $in: batchIds } };
  }

  const batches = await Batch.find(query);
  const results = {
    total: batches.length,
    successful: 0,
    failed: 0,
    details: []
  };

  for (const batch of batches) {
    try {
      const res = await createZoomMeetingForBatch(batch);
      results.successful++;
      results.details.push({
        batchId: batch._id,
        batchName: batch.name,
        status: 'success',
        meetingNumber: res.meetingNumber,
        password: res.password,
        joinUrl: res.joinUrl
      });
    } catch (err) {
      results.failed++;
      results.details.push({
        batchId: batch._id,
        batchName: batch.name,
        status: 'error',
        error: err.message
      });
    }
  }

  return results;
};
