import User from '../models/User.js';
import Batch from '../models/Batch.js';
import StudentSubscription from '../models/StudentSubscription.js';

export const getStudents = async (req, res) => {
  try {
    const students = await User.find({ role: 'student' });
    const studentsWithSubs = await Promise.all(students.map(async (student) => {
      const subscriptions = await StudentSubscription.find({ studentId: student._id }).populate('batchId');
      return { ...student.toObject(), subscriptions };
    }));
    res.json(studentsWithSubs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createStudent = async (req, res) => {
  try {
    const { firstName: fName, lastName: lName, name, email, phone, enrollmentNo, dob, batchId, status, startDate, endDate } = req.body;

    let firstName = fName;
    let lastName = lName;

    // Fallback to name splitting if firstName/lastName not provided
    if (!firstName) {
      const nameParts = (name || '').trim().split(' ');
      firstName = nameParts[0] || 'Student';
      if (!lastName) {
        lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '.';
      }
    }
    
    if (!lastName) lastName = '.';

    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        firstName,
        lastName,
        email,
        phone,
        dob: dob ? new Date(dob) : undefined,
        password: phone ? String(phone) : 'student123',
        role: 'student',
        isActive: true
      });
    }

    if (batchId) {
      const idArray = Array.isArray(batchId) ? batchId : String(batchId).split(',').map(s => s.trim());
      for (const id of idArray) {
        if (!id) continue;
        const batch = await Batch.findOne({ $or: [{ batchId: String(id) }, { name: String(id) }] });
        if (batch) {
          const existingSub = await StudentSubscription.findOne({ studentId: user._id, batchId: batch._id });
          if (!existingSub) {
            await StudentSubscription.create({
              studentId: user._id,
              batchId: batch._id,
              enrollmentNo: enrollmentNo || `ENR-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              status: status || 'active',
              startDate: startDate ? new Date(startDate) : undefined,
              endDate: endDate ? new Date(endDate) : undefined
            });
          }
        }
      }
      // Set active status based on provided dates
      const isStillActive = (status || 'active') === 'active' && (!endDate || new Date(endDate) >= new Date());
      user.isActive = isStillActive;
      await user.save();
    }
    res.status(201).json(user);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const importStudents = async (req, res) => {
  try {
    const studentsData = req.body;
    const results = [];
    const errors = [];
    for (const row of studentsData) {
      try {
        const { Name, Email, Phone, 'Enrollment No': enrollmentNo, 'D.O.B': dob, batchId, status, startDate, endDate } = row;
        const name = Name || row.name;
        const email = Email || row.email;
        const phone = Phone || row.phone;
        const nameParts = (name || '').trim().split(' ');
        const firstName = nameParts[0] || 'Student';
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '.';

        let user = await User.findOne({ email });
        if (!user) {
          user = await User.create({ firstName, lastName, email, phone, dob: dob ? new Date(dob) : undefined, password: String(phone), role: 'student' });
        }

        if (batchId) {
          const idArray = String(batchId).split(',').map(s => s.trim());
          for (const id of idArray) {
            if (!id) continue;
            const batchSearch = await Batch.findOne({ $or: [{ batchId: id }, { name: id }] });
            if (batchSearch) {
              const existingSub = await StudentSubscription.findOne({ studentId: user._id, batchId: batchSearch._id });
              if (!existingSub) {
                await StudentSubscription.create({ studentId: user._id, batchId: batchSearch._id, enrollmentNo: enrollmentNo || `ENR-${Math.floor(Math.random() * 100000)}`, status: status || 'active', startDate: startDate ? new Date(startDate) : undefined, endDate: endDate ? new Date(endDate) : undefined });
              }
            }
          }
          const isStillActive = (status || 'active') === 'active' && (!endDate || new Date(endDate) >= new Date());
          user.isActive = isStillActive;
          await user.save();
        }
        results.push(user);
      } catch (err) {
        errors.push({ row, error: err.message });
      }
    }
    res.json({ imported: results.length, errors });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, phone, dob, subscriptions } = req.body;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: 'Student not found' });
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (phone) user.phone = phone;
    if (dob) user.dob = new Date(dob);
    await user.save();

    if (subscriptions && Array.isArray(subscriptions)) {
      let hasActiveSub = false;
      for (const sub of subscriptions) {
        if (sub._id) {
          const updatedSub = await StudentSubscription.findByIdAndUpdate(sub._id, {
            enrollmentNo: sub.enrollmentNo,
            status: sub.status,
            startDate: sub.startDate ? new Date(sub.startDate) : undefined,
            endDate: sub.endDate ? new Date(sub.endDate) : undefined
          }, { new: true });

          if (updatedSub.status === 'active' && (!updatedSub.endDate || new Date(updatedSub.endDate) >= new Date())) {
            hasActiveSub = true;
          }
        }
      }
      user.isActive = hasActiveSub;
      await user.save();
    }
    res.json({ message: 'Student updated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteStudent = async (req, res) => {
  try {
    const { id } = req.params;
    await User.findByIdAndDelete(id);
    await StudentSubscription.deleteMany({ studentId: id });
    res.json({ message: 'Student removed successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
export const addSubscription = async (req, res) => {
  try {
    const { studentId, batchId } = req.body;
    if (!studentId || !batchId) return res.status(400).json({ message: 'Student and Batch IDs are required' });

    const batch = await Batch.findById(batchId);
    if (!batch) return res.status(404).json({ message: 'Batch not found' });

    const existingSub = await StudentSubscription.findOne({ studentId, batchId });
    if (existingSub) return res.status(400).json({ message: 'Student already subscribed to this batch' });

    const subscription = await StudentSubscription.create({
      studentId,
      batchId,
      enrollmentNo: `ENR-${Date.now()}`,
      status: 'active'
    });

    // Ensure user is active
    await User.findByIdAndUpdate(studentId, { isActive: true });

    res.status(201).json(subscription);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
