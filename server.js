import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import batchRoutes from './routes/batchRoutes.js';
import trainerRoutes from './routes/trainerRoutes.js';
import studentRoutes from './routes/studentRoutes.js';
import meetRoutes from './routes/meetRoutes.js';



dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

connectDB();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/trainers', trainerRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/meet', meetRoutes);



app.get('/api/health', (req, res) => {
  res.json({ status: 'LMS API running', time: new Date().toISOString() });
});

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Server error', error: err.message });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
