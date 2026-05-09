import express from 'express';
import {
  register,
  login,
  getMe,
  updateProfile,
  changePassword,
  getAllUsers,
  toggleUserStatus,
} from '../controllers/authController.js';
import protect from '../middleware/authMiddleware.js';
import requireRole from '../middleware/roleMiddleware.js';

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);

// Authenticated routes (any role)
router.get('/me', protect, getMe);
router.put('/update-profile', protect, updateProfile);
router.put('/change-password', protect, changePassword);

// Admin-only routes
router.get('/users', protect, requireRole('admin'), getAllUsers);
router.patch('/users/:id/toggle', protect, requireRole('admin'), toggleUserStatus);

export default router;
