import cron from 'node-cron';
import MeetCronConfig from '../models/MeetCronConfig.js';
import Batch from '../models/Batch.js';
import { syncMeetingsForBatches } from './zoomService.js';

let activeCronTask = null;

/**
 * Execute meeting generation logic based on config
 */
export const runMeetingGenerationJob = async () => {
  const config = await MeetCronConfig.findOne() || await MeetCronConfig.create({});
  config.lastRunAt = new Date();
  config.lastRunStatus = 'running';
  await config.save();

  try {
    const todayDay = new Date().getDay(); // 0: Sun, 1: Mon, ...

    let targetBatchQuery = {};

    if (config.scope === 'selective' && config.batchIds && config.batchIds.length > 0) {
      targetBatchQuery._id = { $in: config.batchIds };
    }

    const batches = await Batch.find(targetBatchQuery);

    // Filter batches that are scheduled for today (if weekdays specified)
    const eligibleBatches = batches.filter(b => {
      if (!b.weekdays || b.weekdays.length === 0) return true;
      return b.weekdays.includes(todayDay);
    });

    if (eligibleBatches.length === 0) {
      config.lastRunStatus = 'success';
      config.lastRunSummary = `No batches scheduled for today (Day ${todayDay}).`;
      await config.save();
      return { total: 0, successful: 0, failed: 0, summary: config.lastRunSummary };
    }

    const batchIdsToSync = eligibleBatches.map(b => b._id);
    const results = await syncMeetingsForBatches(batchIdsToSync);

    config.lastRunStatus = results.failed === 0 ? 'success' : (results.successful > 0 ? 'partial' : 'failed');
    config.lastRunSummary = `Generated ${results.successful} / ${results.total} meetings successfully (${results.failed} failed).`;
    await config.save();

    console.log(`[MeetCron] Job completed: ${config.lastRunSummary}`);
    return { ...results, summary: config.lastRunSummary };
  } catch (error) {
    config.lastRunStatus = 'failed';
    config.lastRunSummary = `Error: ${error.message}`;
    await config.save();
    console.error(`[MeetCron] Job failed:`, error);
    throw error;
  }
};

/**
 * Initialize or reschedule cron based on database configuration
 */
export const reloadCron = async () => {
  if (activeCronTask) {
    activeCronTask.stop();
    activeCronTask = null;
    console.log('[MeetCron] Existing cron task stopped.');
  }

  let config = await MeetCronConfig.findOne();
  if (!config) {
    config = await MeetCronConfig.create({});
  }

  if (!config.enabled) {
    console.log('[MeetCron] Auto-generation cron is disabled.');
    return;
  }

  // Parse time "HH:mm"
  const [hourStr, minStr] = (config.runTime || '06:00').split(':');
  const minute = parseInt(minStr, 10) || 0;
  const hour = parseInt(hourStr, 10) || 6;

  // Parse days
  let daysCron = '*';
  if (config.runDays && config.runDays.length > 0 && config.runDays.length < 7) {
    daysCron = config.runDays.join(',');
  }

  // Cron format: "minute hour * * day-of-week"
  const cronExpression = `${minute} ${hour} * * ${daysCron}`;
  console.log(`[MeetCron] Scheduling auto-generation cron: "${cronExpression}"`);

  activeCronTask = cron.schedule(cronExpression, async () => {
    console.log('[MeetCron] Running scheduled meeting generation...');
    await runMeetingGenerationJob();
  });
};

/**
 * Initial boot function to run on server start
 */
export const initMeetCron = async () => {
  try {
    await reloadCron();
  } catch (err) {
    console.error('[MeetCron] Failed to initialize cron scheduler:', err);
  }
};
