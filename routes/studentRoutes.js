import express from 'express';
import { 
  getStudents, 
  createStudent, 
  importStudents, 
  updateStudent, 
  deleteStudent, 
  addSubscription 
} from '../controllers/studentController.js';
import protect from '../middleware/authMiddleware.js';
import requireRole from '../middleware/roleMiddleware.js';

const router = express.Router();

// SECURE ALL STUDENT ROUTES
router.use(protect);

// Admin only operations
router.get('/', requireRole('admin'), getStudents);
router.post('/', requireRole('admin'), createStudent);
router.post('/import', requireRole('admin'), importStudents);
router.post('/add-subscription', requireRole('admin'), addSubscription);
router.put('/:id', requireRole('admin'), updateStudent);
router.delete('/:id', requireRole('admin'), deleteStudent);

export default router;
