import User from '../models/User.js';
import StudentSubscription from '../models/StudentSubscription.js';
import generateToken from '../utils/generateToken.js';

export const register = async (req, res) => {
  try {
    const { firstName, lastName, email, password, role } = req.body;
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ message: 'Missing fields' });
    }
    const userExists = await User.findOne({ email });
    if (userExists) return res.status(409).json({ message: 'User exists' });

    const user = await User.create({ firstName, lastName, email, password, role: role || 'student' });
    res.status(201).json({
      user: { _id: user._id, firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role },
      token: generateToken(user._id, user.role),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { phone: email }]
    }).select('+password');

    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    let batchIds = [];
    if (user.role === 'student') {
      // Use find() to get ALL subscription records for this student
      const subs = await StudentSubscription.find({ studentId: user._id, status: 'active' });

      for (const sub of subs) {
        // Collect batches from each record (supports both singular batchId and plural batchIds array)
        if (sub.batchIds && sub.batchIds.length > 0) {
          batchIds.push(...sub.batchIds);
        } else if (sub.batchId) {
          batchIds.push(sub.batchId);
        }

        // Deactivate if any sub has expired (optional logic, usually you'd want at least one active)
        if (sub.endDate && new Date(sub.endDate) < new Date()) {
          // You might want to handle partial expiry here
        }
      }
      // Unique IDs only
      batchIds = [...new Set(batchIds.map(id => id.toString()))];
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Account deactivated' });
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    res.json({
      message: 'Login successful',
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        name: user.name,
        email: user.email,
        phone: user.phone,
        enrollmentNo: user.enrollmentNo,
        role: user.role,
        profilePicture: user.profilePicture,
        batchIds
      },
      token: generateToken(user._id, user.role),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    let batchIds = [];
    let enrollmentNo = user.enrollmentNo;

    if (user.role === 'student') {
      // Fetch all subscriptions to aggregate all batches
      const subs = await StudentSubscription.find({ studentId: user._id });
      for (const sub of subs) {
        if (sub.batchIds && sub.batchIds.length > 0) {
          batchIds.push(...sub.batchIds);
        } else if (sub.batchId) {
          batchIds.push(sub.batchId);
        }
        if (!enrollmentNo) enrollmentNo = sub.enrollmentNo;
      }
      batchIds = [...new Set(batchIds.map(id => id.toString()))];
    }

    res.json({
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      name: user.name,
      email: user.email,
      phone: user.phone,
      enrollmentNo,
      role: user.role,
      profilePicture: user.profilePicture,
      batchIds,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const { firstName, lastName, profilePicture } = req.body;
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (profilePicture) user.profilePicture = profilePicture;
    await user.save();
    res.json({ user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id).select('+password');
    if (!user || !(await user.matchPassword(currentPassword))) {
      return res.status(401).json({ message: 'Incorrect password' });
    }
    user.password = newPassword;
    await user.save();
    res.json({ message: 'Success' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json({ users });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const toggleUserStatus = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    user.isActive = !user.isActive;
    await user.save({ validateBeforeSave: false });
    res.json({ isActive: user.isActive });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
