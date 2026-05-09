import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import connectDB from '../config/db.js';

dotenv.config();

const seedUsers = [
  // ── Admin ──────────────────────────────────
  {
    firstName: 'Super',
    lastName: 'Admin',
    email: 'admin@lms.com',
    password: 'Admin@123',
    role: 'admin',
  },

  // ── Trainers ───────────────────────────────
  {
    firstName: 'Ali',
    lastName: 'Hassan',
    email: 'ali.trainer@lms.com',
    password: 'Train@123',
    role: 'trainer',
  },
  {
    firstName: 'Sara',
    lastName: 'Khan',
    email: 'sara.trainer@lms.com',
    password: 'Train@123',
    role: 'trainer',
  },

  // ── Students ───────────────────────────────
  {
    firstName: 'Ahmed',
    lastName: 'Raza',
    email: 'ahmed.student@lms.com',
    password: 'Study@123',
    role: 'student',
  },
  {
    firstName: 'Zara',
    lastName: 'Malik',
    email: 'zara.student@lms.com',
    password: 'Study@123',
    role: 'student',
  },
  {
    firstName: 'Bilal',
    lastName: 'Anwar',
    email: 'bilal.student@lms.com',
    password: 'Study@123',
    role: 'student',
  },
];

const seed = async () => {
  await connectDB();

  const mode = process.argv[2]; // 'destroy' to wipe only

  if (mode === 'destroy') {
    await User.deleteMany({});
    console.log('🗑️  All users deleted.');
    process.exit(0);
  }

  // Remove existing seed users by email so re-running is safe
  const emails = seedUsers.map((u) => u.email);
  await User.deleteMany({ email: { $in: emails } });

  // Insert — model's pre-save hook will hash passwords
  for (const userData of seedUsers) {
    await User.create(userData);
  }

  console.log(`\n✅ Seeded ${seedUsers.length} users:\n`);
  console.table(
    seedUsers.map(({ firstName, lastName, email, role }) => ({
      name: `${firstName} ${lastName}`,
      email,
      role,
    }))
  );
  console.log('\n');
  process.exit(0);
};

seed().catch((err) => {
  console.error('❌ Seeder error:', err);
  process.exit(1);
});
