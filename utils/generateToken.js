import jwt from 'jsonwebtoken';

/**
 * Generate a signed JWT for a user
 * @param {string} id - User's MongoDB ObjectId
 * @param {string} role - User's role
 * @returns {string} Signed JWT token
 */
const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

export default generateToken;
