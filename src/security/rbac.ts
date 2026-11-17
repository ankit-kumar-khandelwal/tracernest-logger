import { Permission, Role } from '../types';

export class RBACManager {
  private rolePermissions: Map<string, Set<Permission>>;

  private static readonly DEFAULT_ROLE_PERMISSIONS: Record<string, Permission[]> = {
    admin: [
      'logs:read',
      'logs:stream',
      'logs:clear',
      'logs:export',
      'users:manage',
      'alerts:manage',
      'ttl:manage',
      'audit:read',
      'system:manage'
    ],
    operator: ['logs:read', 'logs:stream', 'logs:export', 'ttl:manage'],
    auditor: ['logs:read', 'logs:export', 'audit:read'],
    viewer: ['logs:read', 'logs:stream']
  };

  constructor(customMap?: Record<string, Permission[]>) {
    this.rolePermissions = new Map();

    // Register defaults
    for (const [role, perms] of Object.entries(RBACManager.DEFAULT_ROLE_PERMISSIONS)) {
      this.rolePermissions.set(role.toLowerCase(), new Set(perms));
    }

    // Overlay custom mappings if provided
    if (customMap) {
      for (const [role, perms] of Object.entries(customMap)) {
        this.rolePermissions.set(role.toLowerCase(), new Set(perms));
      }
    }
  }

  /**
   * Check if a role possesses a specific permission
   */
  public hasPermission(role: Role, permission: Permission): boolean {
    if (!role) return false;
    const perms = this.rolePermissions.get(role.toLowerCase());
    if (!perms) return false;
    return perms.has(permission);
  }

  /**
   * Get all permissions assigned to a role
   */
  public getPermissions(role: Role): Permission[] {
    if (!role) return [];
    const perms = this.rolePermissions.get(role.toLowerCase());
    return perms ? Array.from(perms) : [];
  }

  /**
   * Register or update a role with permissions
   */
  public registerRole(role: string, permissions: Permission[]): void {
    this.rolePermissions.set(role.toLowerCase(), new Set(permissions));
  }

  /**
   * List all registered roles
   */
  public listRoles(): string[] {
    return Array.from(this.rolePermissions.keys());
  }
}

