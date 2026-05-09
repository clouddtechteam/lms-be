import Batch from '../models/Batch.js';
import User from '../models/User.js';
import StudentSubscription from '../models/StudentSubscription.js';
import { parseExcel } from '../utils/excelParser.js';

// @desc    Get all batches
// @route   GET /api/batches
// @access  Private (any auth user)
export const getBatches = async (req, res) => {
  try {
    const batches = await Batch.find().populate('createdBy', 'name');
    res.json(batches);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch batches', error: error.message });
  }
};

// @desc    Get batch details
// @route   GET /api/batches/:id
export const getBatchDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const batch = await Batch.findById(id);
    if (!batch) return res.status(404).json({ message: 'Batch not found' });

    const trainers = await User.find({ role: 'trainer', batchIds: id }).select('firstName lastName email phone profilePicture enrollmentNo');
    
    // Find students via subscriptions
    const subscriptions = await StudentSubscription.find({ batchId: id }).populate('studentId', 'firstName lastName name email phone profilePicture enrollmentNo');
    const students = subscriptions.map(s => ({
      ...s.studentId.toObject(),
      enrollmentNo: s.enrollmentNo || s.studentId.enrollmentNo // use sub enrollment no if exists
    }));

    res.json({
      batch,
      trainers,
      students
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch batch details', error: error.message });
  }
};

// @desc    Create a batch
// @route   POST /api/batches
// @access  Private (Admin)
export const createBatch = async (req, res) => {
  try {
    const { name, startTime, endTime, batchId } = req.body;

    if (!name || !startTime || !endTime) {
      return res.status(400).json({ message: 'Batch Name, Start Time and End Time are required' });
    }

    const existingBatch = await Batch.findOne({ name });
    if (existingBatch) {
      return res.status(400).json({ message: `Batch '${name}' already exists.` });
    }

    const batch = await Batch.create({
      batchId: batchId || undefined,
      name,
      startTime,
      endTime,
      createdBy: req.user?.id,
    });

    res.status(201).json(batch);
  } catch (error) {
    res.status(500).json({ message: 'Failed to create batch', error: error.message });
  }
};

const formatExcelTime = (val) => {
  if (!val) return '';
  if (val instanceof Date) {
    const h = String(val.getHours()).padStart(2, '0');
    const m = String(val.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
  if (typeof val === 'number') {
    if (val < 1) {
      const minutes = Math.round(val * 24 * 60);
      const h = String(Math.floor(minutes / 60)).padStart(2, '0');
      const m = String(minutes % 60).padStart(2, '0');
      return `${h}:${m}`;
    } else {
      const h = String(Math.floor(val)).padStart(2, '0');
      const m = String(Math.round((val % 1) * 60)).padStart(2, '0');
      return `${h}:${m}`;
    }
  }
  const str = String(val);
  const match = str.match(/\b(\d{2}:\d{2})(?::\d{2})?\b/);
  if (match) return match[1];
  return str;
};

// @desc    Import batches from Excel
// @route   POST /api/batches/import
// @access  Private (Admin)
export const importBatches = async (req, res) => {
  try {
    const data = req.body.data;
    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ message: 'Data array is required' });
    }

    const batchIdsInFile = data.map(d => String(d.batchId || d.name || '')).filter(Boolean);
    const existingBatches = await Batch.find({ $or: [{ batchId: { $in: batchIdsInFile } }, { name: { $in: batchIdsInFile } }] });

    if (existingBatches.length > 0) {
      const existingNames = existingBatches.map(b => b.batchId || b.name);
      return res.status(400).json({ message: `Duplicate batch ids found: ${existingNames.join(', ')}. Import aborted.` });
    }

    const batchesToCreate = data.map((row) => ({
      batchId: row.batchId ? String(row.batchId) : undefined,
      name: row.name || row.batchId ? String(row.name || row.batchId) : 'Unnamed Batch',
      startTime: formatExcelTime(row.startTime),
      endTime: formatExcelTime(row.endTime),
      createdBy: req.user.id,
    }));

    const createdBatches = await Batch.insertMany(batchesToCreate);
    res.status(201).json({ message: `${createdBatches.length} batches imported successfully`, count: createdBatches.length });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Duplicate batch detected. Please check batch numbers.', error: error.message });
    }
    res.status(500).json({ message: 'Import failed', error: error.message });
  }
};

// @desc    Update batch
// @route   PUT /api/batches/:id
export const updateBatch = async (req, res) => {
  try {
    const batch = await Batch.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!batch) return res.status(404).json({ message: 'Batch not found' });
    res.json(batch);
  } catch (error) {
    res.status(500).json({ message: 'Update failed', error: error.message });
  }
};

// @desc    Delete batch
// @route   DELETE /api/batches/:id
export const deleteBatch = async (req, res) => {
  try {
    const batch = await Batch.findByIdAndDelete(req.params.id);
    if (!batch) return res.status(404).json({ message: 'Batch not found' });
    res.json({ message: 'Batch deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Delete failed', error: error.message });
  }
};
