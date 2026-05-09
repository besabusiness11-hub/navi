import { randomBytes } from 'crypto';

export const generateApiKey = () =>
  `navi_sk_live_${randomBytes(20).toString('hex')}`;

export const generateToken = () =>
  randomBytes(32).toString('hex');
