import jwt from 'jsonwebtoken';
import User from '../models/User.js';

/**
 * Middleware: Verify JWT token from Authorization header
 * Attaches decoded user payload to req.user
 */
const protect = async (req, res, next) => {
  let token;


  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }



  if (!token) {
    return res.status(401).json({ message: 'Not authorized — no token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, role, iat, exp }
    next();
  } catch (error) {
    const msg = error.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    return res.status(401).json({ message: msg });
  }
};

export default protect;
