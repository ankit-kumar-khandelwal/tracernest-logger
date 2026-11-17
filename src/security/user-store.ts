import { randomBytes } from 'node:crypto';
import { Role, User, UserProfile } from '../types';
import { CryptoSecurity } from './crypto';
import { SqlStore } from './sql-store';

export class UserStore {
  private sqlStore: SqlStore;

  constructor(sqlStore: SqlStore) {
    this.sqlStore = sqlStore;
  }

  /**
   * Returns whether any administrative or user accounts exist
   */
  public hasUsers(): boolean {
    return this.sqlStore.getUserCount() > 0;
  }

  public createUser(username: string, password: string, role: Role): UserProfile {
    const cleanUsername = username.trim().toLowerCase();
    if (!cleanUsername || cleanUsername.length < 3) {
      throw new Error('Username must be at least 3 characters');
    }
    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }

    const existing = this.sqlStore.getUserByUsername(cleanUsername);
    if (existing) {
      throw new Error(`User "${username}" already exists`);
    }

    const { hash, salt } = CryptoSecurity.hashPassword(password);
    const id = `usr_${Date.now()}_${randomBytes(4).toString('hex')}`;

    const user: User = {
      id,
      username: cleanUsername,
      passwordHash: hash,
      salt,
      role: role.toLowerCase(),
      createdAt: Date.now()
    };

    return this.sqlStore.createUser(user);
  }

  public verifyCredentials(username: string, password: string): User | null {
    const cleanUsername = username.trim().toLowerCase();
    const user = this.sqlStore.getUserByUsername(cleanUsername);
    if (!user) return null;

    const isValid = CryptoSecurity.verifyPassword(password, user.salt, user.passwordHash);
    if (isValid) {
      user.lastLoginAt = Date.now();
      this.sqlStore.updateLastLogin(user.id, user.lastLoginAt);
      return user;
    }
    return null;
  }

  public getUserById(id: string): User | null {
    return this.sqlStore.getUserById(id);
  }

  public listUsers(): UserProfile[] {
    return this.sqlStore.listUsers();
  }

  public deleteUser(id: string): boolean {
    const user = this.sqlStore.getUserById(id);
    if (!user) return false;

    // Prevent deleting the last remaining admin
    if (user.role === 'admin') {
      const allUsers = this.sqlStore.listUsers();
      const adminCount = allUsers.filter(u => u.role === 'admin').length;
      if (adminCount <= 1) {
        throw new Error('Cannot delete the only remaining admin account');
      }
    }

    return this.sqlStore.deleteUser(id);
  }

  public updatePassword(userId: string, newPass: string): boolean {
    if (!newPass || newPass.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }
    const { hash, salt } = CryptoSecurity.hashPassword(newPass);
    return this.sqlStore.updateUserPassword(userId, hash, salt, false);
  }

  public changePassword(userId: string, newPass: string): boolean {
    if (!newPass || newPass.length < 6) {
      throw new Error('New password must be at least 6 characters');
    }
    const { hash, salt } = CryptoSecurity.hashPassword(newPass);
    return this.sqlStore.updateUserPassword(userId, hash, salt, false);
  }

  public resetAdminTemporaryPassword(temporaryPassword: string): User {
    if (!temporaryPassword || temporaryPassword.length < 6) {
      throw new Error('Temporary password must be at least 6 characters');
    }
    const { hash, salt } = CryptoSecurity.hashPassword(temporaryPassword);

    let admin = this.sqlStore.getUserByUsername('admin');
    if (!admin) {
      const id = `usr_admin_${randomBytes(4).toString('hex')}`;
      const newUser: User = {
        id,
        username: 'admin',
        passwordHash: hash,
        salt,
        role: 'admin',
        createdAt: Date.now(),
        mustChangePassword: true
      };
      this.sqlStore.createUser(newUser);
      admin = this.sqlStore.getUserById(id)!;
    } else {
      this.sqlStore.updateUserPassword(admin.id, hash, salt, true);
      admin.passwordHash = hash;
      admin.salt = salt;
      admin.mustChangePassword = true;
    }
    return admin;
  }

  public updateRole(userId: string, newRole: Role): boolean {
    return this.sqlStore.updateUserRole(userId, newRole);
  }

  public revokeUserSessions(userId: string): boolean {
    return this.sqlStore.revokeUserSessions(userId);
  }

  public clearAllUsers(): void {
    this.sqlStore.clearAllUsers();
  }
}
