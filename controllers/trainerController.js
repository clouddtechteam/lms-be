import mongoose from 'mongoose';
import User from '../models/User.js';
import Batch from '../models/Batch.js';

export const getTrainers = async (req, res) => {
  try {
    const trainers = await User.find({ role: 'trainer' }).populate('batchIds');
    res.json(trainers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createTrainer = async (req, res) => {
  try {
    const { name, email, phone, batchIds } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({ message: 'Name and email are required' });
    }

    const nameParts = (name || '').trim().split(' ');
    const firstName = nameParts[0] || 'Trainer';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '.';

    let resolvedBatchObjectIds = [];
    if (batchIds) {
      const idArray = Array.isArray(batchIds) ? batchIds : [batchIds];
      for (const id of idArray) {
        if (!id) continue;
        const batch = await Batch.findOne({ $or: [{ batchId: String(id) }, { name: String(id) }] });
        if (batch) resolvedBatchObjectIds.push(batch._id);
      }
    }

    const trainer = await User.create({
      firstName,
      lastName,
      email,
      phone,
      password: phone ? String(phone) : 'trainer123',
      role: 'trainer',
      batchIds: resolvedBatchObjectIds,
      isActive: true
    });
    res.status(201).json(trainer);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const importTrainers = async (req, res) => {
  try {
    const trainersData = req.body;
    const results = [];
    const errors = [];
    for (const row of trainersData) {
      try {
        const { name, email, phone, batchid } = row;
        const nameParts = (name || '').trim().split(' ');
        const firstName = nameParts[0] || 'Trainer';
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '.';
        let resolvedBatchObjectIds = [];
        if (batchid) {
          const idArray = String(batchid).split(',').map(s => s.trim());
          for (const id of idArray) {
            const batch = await Batch.findOne({ $or: [{ batchId: id }, { name: id }] });
            if (batch) resolvedBatchObjectIds.push(batch._id);
          }
        }
        const trainer = await User.create({ firstName, lastName, email, phone, password: String(phone), role: 'trainer', batchIds: resolvedBatchObjectIds });
        results.push(trainer);
      } catch (err) {
        errors.push({ row, error: err.message });
      }
    }
    res.json({ imported: results.length, errors });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateTrainer = async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, phone, batchIds } = req.body;
    
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: 'Trainer not found' });

    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (phone) user.phone = phone;
    
    if (batchIds) {
      const resolvedBatchObjectIds = [];
      const idArray = Array.isArray(batchIds) ? batchIds : [batchIds];
      for (const idVal of idArray) {
        if (!idVal) continue;
        const batch = await Batch.findOne({ $or: [{ batchId: String(idVal) }, { name: String(idVal) }, { _id: mongoose.isValidObjectId(idVal) ? idVal : undefined }] });
        if (batch) resolvedBatchObjectIds.push(batch._id);
      }
      user.batchIds = resolvedBatchObjectIds;
    }
    
    await user.save();
    res.json({ message: 'Trainer updated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteTrainer = async (req, res) => {
  try {
    const { id } = req.params;
    await User.findByIdAndDelete(id);
    res.json({ message: 'Trainer removed successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
