import Meet from '../models/Meet.js';

let cachedCrudToken = null;
let crudTokenExpiresAt = 0;

/**
 * Retrieve Server-to-Server OAuth Access Token from Zoom using CRUD credentials
 */
export const getCrudAccessToken = async () => {
  const accountId = process.env.ZOOM_CRUD_ACCOUNT_ID || process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CRUD_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CRUD_CLIENT_SECRET;

  if (!accountId || !clientId || !clientSecret) {
    throw new Error('Zoom CRUD OAuth credentials missing in .env (ZOOM_CRUD_ACCOUNT_ID, ZOOM_CRUD_CLIENT_ID, ZOOM_CRUD_CLIENT_SECRET)');
  }

  // Return cached token if still valid (60s buffer)
  if (cachedCrudToken && Date.now() < crudTokenExpiresAt - 60000) {
    return cachedCrudToken;
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
    const errorMsg = data.reason || data.error_description || data.message || data.error || `Zoom CRUD OAuth Failed (${response.status})`;
    throw new Error(errorMsg);
  }

  cachedCrudToken = data.access_token;
  crudTokenExpiresAt = Date.now() + (data.expires_in * 1000);

  return cachedCrudToken;
};

/**
 * Retrieve details for a specific Zoom meeting ID via Zoom REST API
 * @param {string|number} meetingId
 * @returns {Promise<Object|null>}
 */
export const getZoomMeetingDetails = async (meetingId) => {
  if (!meetingId) return null;
  const cleanId = String(meetingId).replace(/\s/g, '');
  if (!/^\d{9,11}$/.test(cleanId)) return null;

  try {
    const token = await getCrudAccessToken();
    const response = await fetch(`https://api.zoom.us/v2/meetings/${cleanId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.status === 404) return null;

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      console.warn(`[ZoomCrudService] Failed to fetch details for meeting ${cleanId} (${response.status}):`, data.message);
      return null;
    }

    return await response.json();
  } catch (err) {
    console.error(`[ZoomCrudService] Error getting meeting details for ${cleanId}:`, err.message);
    return null;
  }
};

/**
 * List all meetings from the Zoom account with pagination
 * @param {string} type - 'scheduled', 'upcoming', 'live'
 * @returns {Promise<Array>}
 */
export const listAllZoomMeetings = async (type = 'scheduled') => {
  try {
    const token = await getCrudAccessToken();
    let allMeetings = [];
    let nextPageToken = '';

    do {
      const url = new URL('https://api.zoom.us/v2/users/me/meetings');
      url.searchParams.set('type', type);
      url.searchParams.set('page_size', '300');
      if (nextPageToken) {
        url.searchParams.set('next_page_token', nextPageToken);
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        console.warn(`[ZoomCrudService] Failed to list meetings (${response.status}):`, data.message);
        break;
      }

      if (Array.isArray(data.meetings)) {
        allMeetings.push(...data.meetings);
      }

      nextPageToken = data.next_page_token || '';
    } while (nextPageToken);

    return allMeetings;
  } catch (err) {
    console.error(`[ZoomCrudService] Error listing meetings:`, err.message);
    return [];
  }
};

/**
 * Delete a Zoom meeting by meeting ID using CRUD app credentials
 * @param {string|number} meetingId
 * @returns {Promise<boolean>}
 */
export const deleteZoomMeeting = async (meetingId) => {
  if (!meetingId) return false;
  const cleanId = String(meetingId).replace(/\s/g, '');
  if (!/^\d{9,11}$/.test(cleanId)) return false;

  try {
    const token = await getCrudAccessToken();
    const response = await fetch(`https://api.zoom.us/v2/meetings/${cleanId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.status === 204 || response.status === 404) {
      console.log(`[ZoomCrudService] Meeting ${cleanId} deleted from Zoom account (HTTP ${response.status})`);
      return true;
    }

    const data = await response.json().catch(() => ({}));
    console.warn(`[ZoomCrudService] Meeting deletion failed for ${cleanId} (${response.status}):`, data.message || response.statusText);
    return false;
  } catch (err) {
    console.error(`[ZoomCrudService] Error deleting meeting ${cleanId}:`, err.message);
    return false;
  }
};

/**
 * Automatically clean up all old Zoom meetings in the account, keeping only specified active meeting ID(s)
 * @param {Object} options
 * @param {string|number} options.keepMeetingNumber - The single active meeting to retain
 * @param {Array<string|number>} [options.keepMeetingNumbers] - Optional list of meeting numbers to retain
 * @returns {Promise<{ deleted: number, skipped: number, remaining: number }>}
 */
export const autoCleanupOldMeetings = async (options = {}) => {
  const keepSet = new Set();
  if (options.keepMeetingNumber) {
    keepSet.add(String(options.keepMeetingNumber).replace(/\s/g, ''));
  }
  if (Array.isArray(options.keepMeetingNumbers)) {
    options.keepMeetingNumbers.forEach(num => {
      if (num) keepSet.add(String(num).replace(/\s/g, ''));
    });
  }

  // Automatically protect all active meeting numbers currently assigned to any batch in MongoDB
  // (unless strictSingle is explicitly requested)
  if (!options.strictSingle) {
    try {
      const activeMeetsInDb = await Meet.find({ status: { $ne: 'ended' } }, 'meetingNumber');
      activeMeetsInDb.forEach(m => {
        if (m.meetingNumber && /^\d{9,11}$/.test(m.meetingNumber)) {
          keepSet.add(String(m.meetingNumber).replace(/\s/g, ''));
        }
      });
    } catch (dbErr) {
      // Non-fatal if DB is not connected
    }
  }

  if (keepSet.size === 0) {
    console.warn('[ZoomCrudService] autoCleanupOldMeetings called without any keepMeetingNumber. Skipping deletion to prevent data loss.');
    return { deleted: 0, skipped: 0, remaining: 0 };
  }

  console.log(`[ZoomCrudService] Running auto-cleanup. Retaining active meeting(s):`, [...keepSet]);

  try {
    const [scheduledList, upcomingList] = await Promise.all([
      listAllZoomMeetings('scheduled'),
      listAllZoomMeetings('upcoming')
    ]);

    // Deduplicate meetings found by ID
    const meetingsMap = new Map();
    [...scheduledList, ...upcomingList].forEach(m => {
      meetingsMap.set(String(m.id), m);
    });

    let deletedCount = 0;
    let skippedCount = 0;

    for (const [id, meeting] of meetingsMap.entries()) {
      if (keepSet.has(id)) {
        continue; // Keep this active meeting
      }

      // Do not attempt to delete Personal Meeting Room (PMI type 4)
      if (meeting.type === 4) {
        skippedCount++;
        continue;
      }

      const success = await deleteZoomMeeting(id);
      if (success) {
        deletedCount++;
      }
    }

    console.log(`[ZoomCrudService] Auto-cleanup complete. Deleted ${deletedCount} old meeting(s). Skipped ${skippedCount}. Active meeting(s) kept: ${keepSet.size}`);
    return { deleted: deletedCount, skipped: skippedCount, remaining: keepSet.size };
  } catch (err) {
    console.error('[ZoomCrudService] Auto-cleanup encountered an error:', err.message);
    return { deleted: 0, skipped: 0, remaining: keepSet.size, error: err.message };
  }
};
