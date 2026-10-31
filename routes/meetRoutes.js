import express from 'express';
import {
  getMeetByBatch,
  createOrUpdateMeet,
  getSignature,
  getMyLiveClasses,
  getTrainerLiveClasses,
  getCronConfig,
  updateCronConfig,
  triggerCronNow,
  wakeAndSyncCron
} from '../controllers/meetController.js';
import protect from '../middleware/authMiddleware.js';
import requireRole from '../middleware/roleMiddleware.js';

const router = express.Router();

// Public wake-and-sync endpoint for external schedulers (Render / cron-job.org)
router.get('/cron/wake-and-sync', wakeAndSyncCron);
router.post('/cron/wake-and-sync', wakeAndSyncCron);

// Temporarily move signature above protect to debug
router.post('/signature', getSignature);

// SECURE ALL OTHER ROUTES
router.use(protect);

// Admin only: Cron & automation routes
router.get('/cron/config', requireRole(['admin']), getCronConfig);
router.put('/cron/config', requireRole(['admin']), updateCronConfig);
router.post('/cron/trigger-now', requireRole(['admin']), triggerCronNow);

// Student specific: Get all live classes based on their subscription
router.get('/my-live-classes', getMyLiveClasses);

// Trainer specific: Get all live classes for their assigned batches
router.get('/trainer-live-classes', requireRole(['trainer', 'admin']), getTrainerLiveClasses);

// Get meet by batch (restricted to authenticated users)
router.get('/batch/:batchId', getMeetByBatch);

// Admin/Trainer only: Create or update meet
router.post('/', requireRole(['admin', 'trainer']), createOrUpdateMeet);

export default router;
