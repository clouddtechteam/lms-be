import express from 'express';
import {
  getBatches,
  createBatch,
  importBatches,
  updateBatch,
  deleteBatch,
  getBatchDetails,
} from '../controllers/batchController.js';
import protect from '../middleware/authMiddleware.js';
import requireRole from '../middleware/roleMiddleware.js';
import upload from '../middleware/uploadMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

router.get('/', getBatches);
router.get('/:id/details', requireRole('admin', 'trainer'), getBatchDetails);

// Admin / Trainer can manage batches
router.post('/', requireRole('admin', 'trainer'), createBatch);
router.post('/import', requireRole('admin'), upload.single('file'), importBatches);
router.put('/:id', requireRole('admin', 'trainer'), updateBatch);
router.delete('/:id', requireRole('admin'), deleteBatch);

export default router;
