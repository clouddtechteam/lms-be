import cron from 'node-cron';
import MeetCronConfig from '../models/MeetCronConfig.js';
import Batch from '../models/Batch.js';
import { syncMeetingsForBatches } from './zoomService.js';

let activeCronTask = null;

/**
 * Execute meeting generation logic based on config
 * @param {Object} options
 * @param {boolean} options.isManual - If true, bypasses day-of-week restriction so admin can generate anytime
 * @param {Array} options.batchIdsOverride - Optional list of specific batch IDs to sync
 */
export const runMeetingGenerationJob = async (options = {}) => {
  const { isManual = false, batchIdsOverride = null } = options;
  const config = await MeetCronConfig.findOne() || await MeetCronConfig.create({});
  config.lastRunAt = new Date();
  config.lastRunStatus = 'running';
  await config.save();

  try {
    const todayDay = new Date().getDay(); // 0: Sun, 1: Mon, ...

    let targetBatchQuery = {};

    if (batchIdsOverride && batchIdsOverride.length > 0) {
      targetBatchQuery._id = { $in: batchIdsOverride };
    } else if (config.scope === 'selective' && config.batchIds && config.batchIds.length > 0) {
      targetBatchQuery._id = { $in: config.batchIds };
    }

    const batches = await Batch.find(targetBatchQuery);

    if (batches.length === 0) {
      config.lastRunStatus = 'failed';
      config.lastRunSummary = config.scope === 'selective'
        ? 'No batches selected in saved configuration. Please select batches under "Selective Batches" and save.'
        : 'No batches found in the LMS to sync.';
      config.lastRunResults = [];
      await config.save();
      return { total: 0, successful: 0, failed: 0, summary: config.lastRunSummary, details: [] };
    }

    // If manual trigger, generate for all targeted batches regardless of current day.
    // If automated cron, only generate for batches active today (if weekdays specified).
    const eligibleBatches = isManual
      ? batches
      : batches.filter(b => {
          if (!b.weekdays || b.weekdays.length === 0) return true;
          return b.weekdays.includes(todayDay);
        });

    if (eligibleBatches.length === 0) {
      config.lastRunStatus = 'success';
      config.lastRunSummary = `No batches scheduled for today (Day ${todayDay}).`;
      config.lastRunResults = [];
      await config.save();
      return { total: 0, successful: 0, failed: 0, summary: config.lastRunSummary, details: [] };
    }

    const batchIdsToSync = eligibleBatches.map(b => b._id);
    const results = await syncMeetingsForBatches(batchIdsToSync, config.linkMode || 'single_shared');

    config.lastRunStatus = results.failed === 0 ? 'success' : (results.successful > 0 ? 'partial' : 'failed');
    config.lastRunSummary = `Generated ${results.successful} / ${results.total} meetings successfully (${results.failed} failed).`;
    config.lastRunResults = results.details || [];
    await config.save();

    console.log(`[MeetCron] Job completed: ${config.lastRunSummary}`);
    return { ...results, summary: config.lastRunSummary };
  } catch (error) {
    config.lastRunStatus = 'failed';
    config.lastRunSummary = `Error: ${error.message}`;
    config.lastRunResults = [];
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

  let cronExpression = `${minute} ${hour} * * *`;

  if (config.scheduleType === 'interval') {
    const intervalDays = Math.max(1, parseInt(config.refreshIntervalDays) || 1);
    if (intervalDays > 1) {
      cronExpression = `${minute} ${hour} */${intervalDays} * *`;
    }
  } else if (config.scheduleType === 'selective_days') {
    if (config.runDays && config.runDays.length > 0 && config.runDays.length < 7) {
      cronExpression = `${minute} ${hour} * * ${config.runDays.join(',')}`;
    }
  }

  console.log(`[MeetCron] Scheduling auto-generation cron: "${cronExpression}"`);

  activeCronTask = cron.schedule(cronExpression, async () => {
    console.log('[MeetCron] Running scheduled meeting generation...');
    await runMeetingGenerationJob({ isManual: false });
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
