import 'dotenv/config';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// 1. Password hashing round-trip
const hash = await bcrypt.hash('MyPassword123', 12);
console.log('bcrypt hash:', hash.slice(0, 20) + '...');
console.log('verify OK :', await bcrypt.compare('MyPassword123', hash));
console.log('verify bad:', await bcrypt.compare('wrong', hash));

// 2. JWT sign + verify
const secret = process.env.JWT_ACCESS_SECRET;
const token = jwt.sign(
  { sub: 'u1', email: 'a@b.com', role: 'CUSTOMER' },
  secret,
  { expiresIn: '15m', issuer: 'bankflow', audience: 'bankflow-client' },
);
console.log('jwt token :', token.slice(0, 30) + '...');

const decoded = jwt.verify(token, secret, {
  issuer: 'bankflow',
  audience: 'bankflow-client',
});
console.log('jwt decoded:', decoded);