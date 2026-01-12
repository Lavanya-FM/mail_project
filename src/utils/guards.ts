import { UserDTO } from '../types/auth';

export function assertValidUser(user: any): asserts user is UserDTO {
  if (!user || typeof user !== 'object') {
    throw new Error('Invalid user object');
  }

  if (typeof user.full_name !== 'string') {
    throw new Error('User.full_name missing or invalid');
  }

  if (typeof user.email !== 'string' || !user.email.includes('@')) {
    throw new Error('User.email missing or invalid');
  }

  // 🚨 Critical: password must NEVER exist
  if ('password' in user) {
    throw new Error('SECURITY ERROR: password leaked to frontend');
  }
}
