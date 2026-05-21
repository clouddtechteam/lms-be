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
    const warnings = [];

    // Helper function to dynamically match field values across many variations
    const getVal = (row, aliases) => {
      for (const alias of aliases) {
        // Direct match
        if (row[alias] !== undefined && row[alias] !== null && String(row[alias]).trim() !== '') {
          return String(row[alias]).trim();
        }
        // Normalize keys (lowercase, no non-alphanumeric chars) to compare
        const normalizedAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
        const foundKey = Object.keys(row).find(
          (k) => k.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedAlias
        );
        if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && String(row[foundKey]).trim() !== '') {
          return String(row[foundKey]).trim();
        }
      }
      return undefined;
    };

    for (const row of studentsData) {
      try {
        const name = getVal(row, ['name', 'Name', 'studentName', 'Student Name', 'fullName', 'Full Name']);
        let email = getVal(row, ['email', 'Email', 'emailAddress', 'Email Address', 'mail', 'Mail']);
        const phoneVal = getVal(row, ['phone', 'Phone', 'phoneNumber', 'Phone Number', 'mobile', 'Mobile', 'contact', 'Contact']);
        const enrollmentNo = getVal(row, ['enrollmentNo', 'EnrollmentNo', 'Enrollment No', 'enrollment_no', 'enrollmen', 'Enrollmen', 'enrollment', 'Enrollment', 'enrollmentId', 'Enrollment ID', 'enrollment_id']);
        const dobVal = getVal(row, ['dob', 'DOB', 'd.o.b', 'D.O.B', 'dateOfBirth', 'Date of Birth', 'birthDate', 'birthday']);
        const batchIdVal = getVal(row, ['batchId', 'batch', 'Batch', 'batch_id', 'Batch ID', 'batchName', 'Batch Name', 'class', 'Class']);
        const statusVal = getVal(row, ['status', 'Status', 'state', 'State']);
        const startDateVal = getVal(row, ['startDate', 'StartDate', 'start_date', 'Start Date', 'start', 'Start']);
        const endDateVal = getVal(row, ['endDate', 'EndDate', 'end_date', 'End Date', 'end', 'End', 'expiryDate', 'Expiry Date', 'expiry']);

        // Normalize scientific notation phone numbers
        let phone = '';
        if (phoneVal !== undefined && phoneVal !== null) {
          let str = String(phoneVal).trim();
          if (/e\+/i.test(str)) {
            const num = Number(str);
            if (!isNaN(num)) {
              phone = String(num);
            } else {
              phone = str;
            }
          } else {
            phone = str;
          }
        }

        // If email not provided, fallback to phone@mallucompass.com
        if ((!email || !email.trim()) && phone) {
          email = `${phone}@mallucompass.com`;
        }

        const nameParts = (name || '').trim().split(' ');
        const firstName = nameParts[0] || 'Student';
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '.';

        let user = await User.findOne({ email });
        if (!user) {
          user = await User.create({ firstName, lastName, email, phone, dob: dobVal ? new Date(dobVal) : undefined, password: phone ? String(phone) : 'student123', role: 'student' });
        }

        if (batchIdVal) {
          const idArray = String(batchIdVal).split(',').map(s => s.trim());
          let assignedAnySub = false;

          for (const id of idArray) {
            if (!id) continue;
            // Escape regex chars for safe search
            const safeId = id.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            // Try matching by exact ID, name, or case-insensitive ID/name
            const batchSearch = await Batch.findOne({
              $or: [
                { batchId: id },
                { name: id },
                { batchId: { $regex: new RegExp('^' + safeId + '$', 'i') } },
                { name: { $regex: new RegExp('^' + safeId + '$', 'i') } }
              ]
            });

            if (batchSearch) {
              const existingSub = await StudentSubscription.findOne({ studentId: user._id, batchId: batchSearch._id });
              if (!existingSub) {
                await StudentSubscription.create({
                  studentId: user._id,
                  batchId: batchSearch._id,
                  enrollmentNo: enrollmentNo || `ENR-${Math.floor(Math.random() * 100000)}`,
                  status: statusVal || 'active',
                  startDate: startDateVal ? new Date(startDateVal) : undefined,
                  endDate: endDateVal ? new Date(endDateVal) : undefined
                });
              }
              assignedAnySub = true;
            } else {
              warnings.push(`Batch "${id}" specified for student "${firstName} ${lastName !== '.' ? lastName : ''}" was not found in the database. Subscription skipped.`);
            }
          }

          if (assignedAnySub) {
            const isStillActive = (statusVal || 'active') === 'active' && (!endDateVal || new Date(endDateVal) >= new Date());
            user.isActive = isStillActive;
            await user.save();
          }
        } else if (enrollmentNo) {
          // If enrollmentNo is provided but no batch is specified, warn that it can't be saved without a batch
          warnings.push(`Enrollment ID "${enrollmentNo}" for student "${firstName} ${lastName !== '.' ? lastName : ''}" could not be saved because no batch was assigned.`);
        }
        
        results.push(user);
      } catch (err) {
        errors.push({ row, error: err.message });
      }
    }
    res.json({ imported: results.length, errors, warnings });
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
