import express from 'express';
import { 
  getTrainers, 
  createTrainer, 
  importTrainers, 
  updateTrainer, 
  deleteTrainer 
} from '../controllers/trainerController.js';
import protect from '../middleware/authMiddleware.js';
import requireRole from '../middleware/roleMiddleware.js';

const router = express.Router();

// SECURE ALL TRAINER ROUTES
router.use(protect);

// Get trainers list (Admin/Student/Trainer)
router.get('/', getTrainers);

// Admin only operations
router.post('/', requireRole('admin'), createTrainer);
router.post('/import', requireRole('admin'), importTrainers);
router.put('/:id', requireRole('admin'), updateTrainer);
router.delete('/:id', requireRole('admin'), deleteTrainer);

export default router;
