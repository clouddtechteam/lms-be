import dotenv from 'dotenv';
import connectDB from '../config/db.js';
import Meet from '../models/Meet.js';
import Batch from '../models/Batch.js';
import {
  getCrudAccessToken,
  getZoomMeetingDetails,
  deleteZoomMeeting,
  listAllZoomMeetings,
  autoCleanupOldMeetings
} from '../utils/zoomCrudService.js';

dotenv.config();

// Parse CLI flags
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const keepArgIndex = args.indexOf('--keep');
const specifiedKeepId = keepArgIndex !== -1 && args[keepArgIndex + 1] ? args[keepArgIndex + 1].trim() : null;

const run = async () => {
  console.log('====================================================');
  console.log('   Zoom Meeting Cleanup & DB Sync Utility           ');
  console.log('   (Powered by Zoom CRUD Service)                   ');
  console.log('====================================================');
  if (isDryRun) {
    console.log('⚠️  DRY RUN MODE ENABLED: No meetings will be deleted or modified.\n');
  }

  // 1. Connect to Database
  await connectDB();

  // 2. Authenticate with Zoom CRUD OAuth
  console.log('\n🔐 Authenticating with Zoom CRUD S2S OAuth...');
  try {
    await getCrudAccessToken();
    console.log('✅ Zoom CRUD OAuth authenticated successfully.');
  } catch (err) {
    console.error('❌ Failed to authenticate with Zoom CRUD credentials:', err.message);
    process.exit(1);
  }

  // 3. Scan MongoDB & Clean Orphaned Records (from previously deleted batches)
  console.log('\n🔍 Scanning MongoDB for existing Meet records...');
  const validBatchIds = new Set((await Batch.find({}, '_id')).map(b => String(b._id)));
  const allMeetsRaw = await Meet.find();
  const orphanedMeets = allMeetsRaw.filter(m => !validBatchIds.has(String(m.batch)));
  if (orphanedMeets.length > 0) {
    if (!isDryRun) {
      for (const om of orphanedMeets) {
        await Meet.findByIdAndDelete(om._id);
      }
      console.log(`🧹 Cleaned up ${orphanedMeets.length} orphaned Meet record(s) from deleted batches.`);
    } else {
      console.log(`  [DRY-RUN] Would clean up ${orphanedMeets.length} orphaned Meet record(s).`);
    }
  }

  const allMeets = await Meet.find().populate('batch', 'name');
  console.log(`Found ${allMeets.length} valid Meet record(s) in database matching active batches.`);

  const dbMeetingNumbers = new Set(
    allMeets
      .map(m => String(m.meetingNumber || '').replace(/\s/g, ''))
      .filter(num => /^\d{9,11}$/.test(num))
  );

  // 4. Scan Zoom Account
  console.log('\n📡 Scanning Zoom account via CRUD API...');
  const scheduledMeetings = await listAllZoomMeetings('scheduled');
  const upcomingMeetings = await listAllZoomMeetings('upcoming');

  const zoomAccountMeetings = new Map();
  [...scheduledListOrEmpty(scheduledMeetings), ...scheduledListOrEmpty(upcomingMeetings)].forEach(m => {
    zoomAccountMeetings.set(String(m.id), m);
  });

  console.log(`Found ${zoomAccountMeetings.size} meeting(s) in Zoom account.`);

  // 5. Select target meeting to keep
  let targetMeetingId = specifiedKeepId;
  let targetDetails = null;

  if (targetMeetingId) {
    console.log(`\nTarget meeting specified via --keep: ${targetMeetingId}`);
    targetDetails = zoomAccountMeetings.get(targetMeetingId) || await getZoomMeetingDetails(targetMeetingId);
  } else {
    // Look for newest scheduled meeting in Zoom
    const scheduledSorted = [...zoomAccountMeetings.values()]
      .filter(d => d.type === 2)
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    if (scheduledSorted.length > 0) {
      targetMeetingId = String(scheduledSorted[0].id);
      targetDetails = scheduledSorted[0];
    } else {
      // Find latest in DB
      const latestInDb = allMeets
        .filter(m => /^\d{9,11}$/.test(m.meetingNumber))
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];

      if (latestInDb) {
        targetMeetingId = String(latestInDb.meetingNumber).replace(/\s/g, '');
        targetDetails = await getZoomMeetingDetails(targetMeetingId);
      }
    }
  }

  if (!targetMeetingId) {
    console.error('❌ Could not identify any meeting to keep. Please specify one with --keep <meetingId>');
    process.exit(1);
  }

  console.log('\n====================================================');
  console.log(`🎯 RETAINED SINGLE MEETING: ${targetMeetingId}`);
  if (targetDetails) {
    console.log(`   Topic:    ${targetDetails.topic}`);
    console.log(`   Join URL: ${targetDetails.join_url}`);
    console.log(`   Password: ${targetDetails.password || '(not set)'}`);
  }
  console.log('====================================================\n');

  // Reference meet for DB update
  const refDbMeet = allMeets.find(m => String(m.meetingNumber).replace(/\s/g, '') === targetMeetingId && m.joinUrl && m.password);
  const retainedPassword = targetDetails?.password || refDbMeet?.password || '';
  const retainedJoinUrl = targetDetails?.join_url || refDbMeet?.joinUrl || `https://us02web.zoom.us/j/${targetMeetingId}${retainedPassword ? `?pwd=${retainedPassword}` : ''}`;

  // 6. Delete old meetings from Zoom account
  if (isDryRun) {
    let wouldDelete = 0;
    for (const [id, meeting] of zoomAccountMeetings.entries()) {
      if (id !== targetMeetingId && meeting.type !== 4) {
        console.log(`  [DRY-RUN] Would delete meeting ${id} ("${meeting.topic}") from Zoom.`);
        wouldDelete++;
      }
    }
    console.log(`[DRY-RUN] Would delete ${wouldDelete} old meeting(s) from Zoom.`);
  } else {
    console.log('🗑️  Executing auto-cleanup on Zoom account...');
    const cleanupResult = await autoCleanupOldMeetings({ keepMeetingNumber: targetMeetingId, strictSingle: true });
    console.log(`✅ Deleted ${cleanupResult.deleted} old meeting(s) from Zoom.`);
  }

  // 7. Synchronize DB records
  console.log('\n📦 Synchronizing MongoDB Meet collection...');
  let updatedCount = 0;
  if (isDryRun) {
    console.log(`  [DRY-RUN] Would update all ${allMeets.length} Meet documents to reference ${targetMeetingId}.`);
  } else {
    for (const meet of allMeets) {
      const needsUpdate =
        meet.meetingNumber !== targetMeetingId ||
        meet.password !== retainedPassword ||
        meet.joinUrl !== retainedJoinUrl ||
        meet.status !== 'scheduled';

      if (needsUpdate) {
        meet.meetingNumber = targetMeetingId;
        meet.password = retainedPassword;
        meet.joinUrl = retainedJoinUrl;
        meet.status = 'scheduled';
        await meet.save();
        updatedCount++;
      }
    }
    console.log(`✅ Updated ${updatedCount} Meet record(s) in DB to point to ${targetMeetingId}.`);
  }

  console.log('\n====================================================');
  console.log('   Cleanup Finished Successfully                    ');
  console.log(`   Active Meeting in DB & Zoom: ${targetMeetingId}`);
  console.log('====================================================\n');
  process.exit(0);
};

function scheduledListOrEmpty(val) {
  return Array.isArray(val) ? val : [];
}

run().catch(err => {
  console.error('\n❌ Fatal error during cleanup:', err);
  process.exit(1);
});
