import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError, firstValueFrom } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';

// Import interfaces จาก user.model.ts ที่อัปเดตแล้ว
import {
  LoginRequest,
  LoginResponse,
  TokenData,
  User,
  AuthState,
  UserWithPermissions,
  createEmptyAuthState,
  isLoginSuccessResponse,
  extractTokenData,
  extractUserData,
  createAuthStateFromLoginResponse
} from '../models/user.model';

// Import permission-related types with Role ID support
import {
  permissionEnum,
  UserRole,
  RoleId,
  ROLES,
  ROLE_IDS,
  ROLE_PERMISSIONS,
  ROLE_ID_PERMISSIONS,
  ROLE_ID_TO_NAME,
  ROLE_NAME_TO_ID,
  getRolePermissions,
  getRoleIdPermissions,
  getPermissionsFromRoles,
  getPermissionsFromRoleIds,
  validateAndNormalizePermissions,
  validateAndNormalizeRoles,
  convertRoleIdsToNames,
  convertRoleNamesToIds,
  getSafeFallbackPermissions,
  getSafeFallbackRoles,
  isAdminByRoleId,
  isSupporterByRoleId,
  isUserByRoleId,
  checkAccess as checkAccessPermission  // ✅ เพิ่ม import และเปลี่ยนชื่อเพื่อหลีกเลี่ยงชื่อซ้ำ
} from '../models/permission.model';

// Re-export TokenData สำหรับ api.service.ts
export type { TokenData } from '../models/user.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = environment.apiUrl;

  // State Management with proper types
  private authStateSubject = new BehaviorSubject<AuthState>(createEmptyAuthState());
  public authState$ = this.authStateSubject.asObservable();

  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  // Token management
  private tokenSubject = new BehaviorSubject<string | null>(null);
  private warningSubject = new BehaviorSubject<boolean>(false);
  private refreshInProgress = false;

  // ✅ NEW: Role ID storage for backend compatibility
  private userRoleIds: RoleId[] = [];

  constructor(
    private http: HttpClient,
    private router: Router
  ) {
    console.log('🔧 AuthService initialized with Role ID support');
    this.loadUserFromStorage();
    this.initTokenCheck();
  }

  // ===== CORE LOGIN METHOD ===== 

  /**
   * ✅ UPDATED: เข้าสู่ระบบผ่าน Backend API with Role ID support
   */
  async login(username: string, password: string, language: string = 'th'): Promise<LoginResponse> {
    console.log('🔄 Starting login process for:', username);

    try {
      // Set loading state
      this.updateAuthState({ isLoading: true });

      const headers = new HttpHeaders({
        'Content-Type': 'application/json',
        'language': language
      });

      const body: LoginRequest = {
        username: username.trim(),
        password: password
      };

      console.log('📤 Sending login request to:', `${this.apiUrl}/auth/login`);

      const response = await firstValueFrom(
        this.http.post<LoginResponse>(`${this.apiUrl}/auth/login`, body, { headers })
          .pipe(
            tap(res => {
              console.log('📥 Raw backend response:', res);
              console.log('🔍 Response analysis:', {
                hasUser: !!res.user,
                hasToken: !!res.access_token,
                hasPermissions: !!res.permission,
                permissionType: typeof res.permission,
                permissionLength: res.permission?.length,
                hasRoles: !!res.roles,
                roleType: typeof res.roles,
                roleLength: res.roles?.length,
                responseCode: res.code,
                responseStatus: res.status
              });
            }),
            catchError((error: HttpErrorResponse) => this.handleLoginError(error))
          )
      );

      console.log('📋 Processing login response...');

      // Debug login response
      this.debugLoginResponse(response);

      // ตรวจสอบความสำเร็จของ response
      if (isLoginSuccessResponse(response)) {
        console.log('✅ Login successful, processing tokens and user data');

        const tokenData = extractTokenData(response);
        const userData = extractUserData(response);

        // เพิ่มการตรวจสอบ null/undefined
        if (!tokenData) {
          console.error('❌ Failed to extract token data:', response);
          throw new Error('Invalid token data in response');
        }

        if (!userData) {
          console.error('❌ Failed to extract user data:', response);
          throw new Error('Invalid user data in response');
        }

        console.log('🔍 Extracted data:', {
          tokenData: {
            hasAccessToken: !!tokenData.access_token,
            hasRefreshToken: !!tokenData.refresh_token,
            expiresAt: tokenData.expires_at
          },
          userData: {
            id: userData.id,
            username: userData.username,
            roles: userData.roles
          }
        });

        // บันทึก tokens
        this.setTokens(tokenData);

        // บันทึก user data
        this.setCurrentUser(userData);

        // ✅ UPDATED: แก้ไขการจัดการ permissions และ roles ด้วย safe validation + Role ID support
        let userPermissions: number[] = [];
        let userRoles: UserRole[] = [];
        let userRoleIds: RoleId[] = [];

        try {
          // Validate และ normalize permissions
          if (response.permission) {
            userPermissions = validateAndNormalizePermissions(response.permission);
            // console.log('🔍 Validated permissions:', userPermissions);
          }

          // ✅ NEW: Handle role data from backend (could be IDs or names)
          if (response.roles) {
            console.log('🔍 Processing roles from response:', response.roles, typeof response.roles);

            if (Array.isArray(response.roles)) {
              const firstRole = response.roles[0];

              if (typeof firstRole === 'number') {
                // Backend sent role IDs - กรอง role IDs ที่ valid
                const validRoleIds: RoleId[] = [];
                for (const roleId of response.roles) {
                  if (typeof roleId === 'number' && Object.values(ROLE_IDS).includes(roleId as RoleId)) {
                    validRoleIds.push(roleId as RoleId);
                  }
                }
                userRoleIds = validRoleIds;
                userRoles = convertRoleIdsToNames(userRoleIds);
                console.log('🔍 Converted role IDs to names:', { userRoleIds, userRoles });
              } else if (typeof firstRole === 'string') {
                // Backend sent role names - validate and convert
                userRoles = validateAndNormalizeRoles(response.roles as UserRole[]);
                userRoleIds = convertRoleNamesToIds(userRoles);
                // console.log('🔍 Validated role names and converted to IDs:', { userRoles, userRoleIds });
              } else {
                console.warn('Unknown role format:', firstRole);
                // Fallback to safe defaults
                userRoles = getSafeFallbackRoles();
                userRoleIds = convertRoleNamesToIds(userRoles);
              }
            }
          } else if (userData.roles) {
            // Fallback to user data roles
            userRoles = validateAndNormalizeRoles(userData.roles);
            userRoleIds = convertRoleNamesToIds(userRoles);
          }

          console.log('👥 Final roles:', { userRoles, userRoleIds });

          // ใช้ fallback ถ้าไม่มีข้อมูล
          if (userPermissions.length === 0) {
            console.log('🔄 Using fallback permissions');

            if (userRoleIds.length > 0) {
              // ลองดึง permissions จาก role IDs ก่อน
              userPermissions = getPermissionsFromRoleIds(userRoleIds);
              console.log('🔍 Permissions from role IDs:', userPermissions);
            } else if (userRoles.length > 0) {
              // ถ้าไม่ได้ลองดึงจาก role names
              userPermissions = getPermissionsFromRoles(userRoles);
              console.log('🔍 Permissions from role names:', userPermissions);
            }

            // ถ้ายังไม่มี ใช้ safe fallback
            if (userPermissions.length === 0) {
              userPermissions = getSafeFallbackPermissions();
              console.warn('⚠️ Using safe fallback permissions:', userPermissions);
            }
          }

          if (userRoles.length === 0) {
            console.log('🔄 No roles from backend, inferring from permissions');

            // Infer role from permissions
            const hasAdminPermissions = userPermissions.includes(15) && // ADD_USER
              userPermissions.includes(16) && // DEL_USER
              userPermissions.includes(17);   // MANAGE_CATEGORY

            const hasSupporterPermissions = userPermissions.includes(13) && // VIEW_ALL_TICKETS
              userPermissions.includes(5) &&  // CHANGE_STATUS
              !hasAdminPermissions;

            if (hasAdminPermissions) {
              console.log('✅ Detected ADMIN permissions - assigning ADMIN role');
              userRoles = [ROLES.ADMIN];
              userRoleIds = [ROLE_IDS.ADMIN];
            } else if (hasSupporterPermissions) {
              console.log('✅ Detected SUPPORTER permissions - assigning SUPPORTER role');
              userRoles = [ROLES.SUPPORTER];
              userRoleIds = [ROLE_IDS.SUPPORTER];
            } else {
              console.log('🔄 Using fallback USER role');
              userRoles = getSafeFallbackRoles();
              userRoleIds = convertRoleNamesToIds(userRoles);
            }

            console.log('⚡ Inferred roles:', { userRoles, userRoleIds, basedOnPermissions: userPermissions });
          }

          // บันทึกข้อมูล
          this.setUserPermissions(userPermissions);
          this.setUserRoles(userRoles);
          this.setUserRoleIds(userRoleIds); // ✅ NEW: Store role IDs

          // สร้าง auth state
          const newAuthState = createAuthStateFromLoginResponse(response, userData, tokenData.access_token);
          this.authStateSubject.next(newAuthState);

          console.log('🎉 Login process completed successfully');
          console.log('📊 Final user status:', {
            username: userData.username,
            roles: userRoles,
            roleIds: userRoleIds,
            permissions: userPermissions,
            isAuthenticated: this.isAuthenticated(),
            canCreateTickets: this.hasPermission(1),
            canViewOwnTickets: this.hasPermission(12),
            isAdmin: this.isAdmin(),
            isSupporter: this.isSupporter()
          });

          // ตรวจสอบว่า user สามารถเข้าถึงได้หรือไม่
          setTimeout(() => {
            this.validateUserAccess();
          }, 100);

        } catch (validationError) {
          console.error('❌ Error during permission/role validation:', validationError);

          // ใช้ safe fallback ทั้งหมด
          const fallbackPermissions = getSafeFallbackPermissions();
          const fallbackRoles = getSafeFallbackRoles();
          const fallbackRoleIds = convertRoleNamesToIds(fallbackRoles);

          this.setUserPermissions(fallbackPermissions);
          this.setUserRoles(fallbackRoles);
          this.setUserRoleIds(fallbackRoleIds);

          console.log('🛡️ Applied safe fallback settings:', {
            permissions: fallbackPermissions,
            roles: fallbackRoles,
            roleIds: fallbackRoleIds
          });

          // ยังคงให้ login สำเร็จ
          const newAuthState = createAuthStateFromLoginResponse(response, userData, tokenData.access_token);
          this.authStateSubject.next(newAuthState);
        }

      } else {
        console.log('❌ Login failed:', response.message);
        this.updateAuthState({ isLoading: false });
      }

      return response;

    } catch (error: any) {
      console.error('❌ Login error:', error);
      this.updateAuthState({ isLoading: false });

      // ส่งต่อ error โดยไม่แปลง format
      throw error;
    }
  }

  // ===== ✅ NEW: ROLE ID MANAGEMENT =====

  /**
   * ✅ NEW: บันทึก role IDs (สำหรับ backend compatibility)
   */
  setUserRoleIds(roleIds: RoleId[]): void {
    try {
      // Validate role IDs ก่อนบันทึก
      const validRoleIds = roleIds.filter(id =>
        Object.values(ROLE_IDS).includes(id)
      );

      this.userRoleIds = validRoleIds;
      localStorage.setItem('user_role_ids', JSON.stringify(validRoleIds));
      console.log('🔢 Role IDs saved:', validRoleIds);
    } catch (error) {
      console.error('❌ Error saving role IDs:', error);
      // ใช้ fallback role ID
      this.userRoleIds = [ROLE_IDS.USER];
      localStorage.setItem('user_role_ids', JSON.stringify([ROLE_IDS.USER]));
    }
  }

  /**
   * ✅ NEW: ดึง role IDs
   */
  getUserRoleIds(): RoleId[] {
    try {
      const roleIdsStr = localStorage.getItem('user_role_ids');
      return roleIdsStr ? JSON.parse(roleIdsStr) : this.userRoleIds;
    } catch (error) {
      console.error('❌ Error loading role IDs:', error);
      return [ROLE_IDS.USER];
    }
  }

  /**
   * ✅ NEW: ตรวจสอบ role โดยใช้ role ID
   */
  hasRoleId(roleId: RoleId): boolean {
    const userRoleIds = this.getUserRoleIds();
    return userRoleIds.includes(roleId);
  }

  // ===== ✅ UPDATED: ROLE MANAGEMENT WITH ID SUPPORT =====

  /**
   * ✅ UPDATED: บันทึก roles with validation
   */
  setUserRoles(roles: UserRole[]): void {
    try {
      // Validate roles ก่อนบันทึก
      const validRoles = roles.filter(role =>
        typeof role === 'string' && Object.values(ROLES).includes(role)
      );

      localStorage.setItem('user_roles', JSON.stringify(validRoles));
      console.log('👥 Roles saved:', validRoles);

      // ✅ Also update role IDs for consistency
      const roleIds = convertRoleNamesToIds(validRoles);
      this.setUserRoleIds(roleIds);

    } catch (error) {
      console.error('❌ Error saving roles:', error);
      // ใช้ fallback role
      localStorage.setItem('user_roles', JSON.stringify([ROLES.USER]));
    }
  }

  /**
   * ✅ UPDATED: ดึง roles
   */
  getUserRoles(): UserRole[] {
    try {
      const rolesStr = localStorage.getItem('user_roles');
      return rolesStr ? JSON.parse(rolesStr) : [];
    } catch (error) {
      console.error('❌ Error loading roles:', error);
      return [];
    }
  }

  /**
   * ✅ UPDATED: ตรวจสอบว่าเป็น Admin หรือไม่ (ใช้ role ID)
   */
  isAdmin(): boolean {
    return this.hasRoleId(ROLE_IDS.ADMIN) || this.hasRole(ROLES.ADMIN);
  }

  /**
   * ✅ UPDATED: ตรวจสอบว่าเป็น Supporter หรือไม่ (ใช้ role ID)
   */
  isSupporter(): boolean {
    return this.hasRoleId(ROLE_IDS.SUPPORTER) || this.hasRole(ROLES.SUPPORTER);
  }

  /**
   * ✅ UPDATED: ตรวจสอบว่าเป็น User หรือไม่ (ใช้ role ID)
   */
  isUser(): boolean {
    return this.hasRoleId(ROLE_IDS.USER) || this.hasRole(ROLES.USER);
  }

  /**
   * ✅ UPDATED: ดึง primary role โดยพิจารณา role ID
   */
  getPrimaryRole(): UserRole | null {
    if (this.hasRoleId(ROLE_IDS.ADMIN)) return ROLES.ADMIN;
    if (this.hasRoleId(ROLE_IDS.SUPPORTER)) return ROLES.SUPPORTER;
    if (this.hasRoleId(ROLE_IDS.USER)) return ROLES.USER;

    // Fallback to role name check
    if (this.hasRole(ROLES.ADMIN)) return ROLES.ADMIN;
    if (this.hasRole(ROLES.SUPPORTER)) return ROLES.SUPPORTER;
    if (this.hasRole(ROLES.USER)) return ROLES.USER;

    return null;
  }

  /**
   * ✅ UPDATED: ดึง permissions ที่ได้จาก roles (รวม role ID)
   */
  getEffectivePermissions(): number[] {
    const userRoles = this.getUserRoles();
    const userRoleIds = this.getUserRoleIds();
    const directPermissions = this.getUserPermissions();

    // ดึง permissions จากทั้ง role names และ role IDs
    const rolePermissions = getPermissionsFromRoles(userRoles);
    const roleIdPermissions = getPermissionsFromRoleIds(userRoleIds);

    // รวม permissions จาก roles และ direct permissions
    const allPermissions = [...new Set([
      ...directPermissions,
      ...rolePermissions,
      ...roleIdPermissions
    ])];

    return allPermissions;
  }

  // ===== TOKEN MANAGEMENT ===== (no changes needed)

  /**
   * บันทึก tokens ลง localStorage
   */
  setTokens(tokenData: TokenData): void {
    try {
      localStorage.setItem('access_token', tokenData.access_token);

      if (tokenData.refresh_token) {
        localStorage.setItem('refresh_token', tokenData.refresh_token);
      }

      if (tokenData.expires_at) {
        localStorage.setItem('token_expires_at', tokenData.expires_at);
      }

      if (tokenData.token_expires_timestamp) {
        localStorage.setItem('token_expires_timestamp', tokenData.token_expires_timestamp.toString());
      }

      this.tokenSubject.next(tokenData.access_token);
      console.log('💾 Tokens saved to localStorage');

    } catch (error) {
      console.error('❌ Error saving tokens:', error);
    }
  }

  /**
   * ดึง access token
   */
  getToken(): string | null {
    return localStorage.getItem('access_token');
  }

  /**
   * ดึง refresh token
   */
  getRefreshToken(): string | null {
    return localStorage.getItem('refresh_token');
  }

  /**
   * ตรวจสอบว่า token หมดอายุแล้วหรือยัง
   */
  isTokenExpired(): boolean {
    const token = this.getToken();
    if (!token) return true;

    try {
      // ลอง decode JWT token
      const payload = JSON.parse(atob(token.split('.')[1]));
      const currentTime = Math.floor(Date.now() / 1000);
      const isExpired = payload.exp < currentTime;

      if (isExpired) {
        console.log('⏰ Token is expired');
      }

      return isExpired;
    } catch (error) {
      console.error('❌ Error checking token expiry:', error);
      return true;
    }
  }

  /**
   * ตรวจสอบว่า token ใกล้หมดอายุหรือยัง (5 นาที)
   */
  isTokenExpiring(): boolean {
    const token = this.getToken();
    if (!token) return false;

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const currentTime = Math.floor(Date.now() / 1000);
      const timeLeft = payload.exp - currentTime;
      return timeLeft <= 300; // 5 minutes
    } catch (error) {
      return false;
    }
  }

  /**
   * ตรวจสอบว่ามี token ที่ใช้งานได้หรือไม่
   */
  hasValidToken(): boolean {
    const token = this.getToken();
    if (!token) return false;
    return !this.isTokenExpired();
  }

  // ===== USER MANAGEMENT ===== (no changes needed)

  /**
   * บันทึก user data
   */
  // ใน auth.service.ts - แก้ไข setCurrentUser() method

  setCurrentUser(user: User | UserWithPermissions): void {
    try {
      // ✅ เพิ่ม roles เข้าไปใน user object ก่อนบันทึก
      const userRoles = this.getUserRoles();
      const userRoleIds = this.getUserRoleIds();
      const userPermissions = this.getUserPermissions();

      const userWithRoles = {
        ...user,
        roles: userRoles,           // ✅ เพิ่ม roles
        role_ids: userRoleIds,      // ✅ เพิ่ม role IDs
        permissions: userPermissions // ✅ เพิ่ม permissions
      };

      localStorage.setItem('user_data', JSON.stringify(userWithRoles));
      this.currentUserSubject.next(userWithRoles);

      console.log('👤 User data saved with roles:', {
        username: user.username,
        roles: userRoles,
        roleIds: userRoleIds,
        permissions: userPermissions
      });
    } catch (error) {
      console.error('❌ Error saving user data:', error);
    }
  }

  /**
   * ดึง user data
   */
  getCurrentUser(): any {
    // แก้ให้อ่านจาก 'user_data' แทน 'currentUser'
    const userStr = localStorage.getItem('user_data');

    if (!userStr) {
      console.warn('No user data in storage');
      return null;
    }

    try {
      const user = JSON.parse(userStr);

      // console.log('getCurrentUser():', {
      //   user,
      //   roles: user?.roles,
      //   rolesType: typeof user?.roles,
      //   rolesIsArray: Array.isArray(user?.roles),
      //   allKeys: Object.keys(user || {})
      // });

      return user;
    } catch (error) {
      console.error('Error parsing user data:', error);
      return null;
    }
  }

  /**
   * ดึง user data พร้อม permissions และ roles
   */
  getCurrentUserWithPermissions(): UserWithPermissions | null {
    const user = this.getCurrentUser();
    if (!user) return null;

    const permissions = this.getUserPermissions();
    const roles = this.getUserRoles();

    return {
      ...user,
      permissions,
      roles,
      effective_permissions: permissions
    };
  }

  // ===== PERMISSION MANAGEMENT ===== (no changes needed)

  /**
   * บันทึก permissions (รับ number[] โดยตรง) - Enhanced with validation
   */
  setUserPermissions(permissions: number[]): void {
    try {
      // Validate permissions ก่อนบันทึก
      const validPermissions = permissions.filter(p =>
        typeof p === 'number' && !isNaN(p) && p >= 1 && p <= 20
      );

      localStorage.setItem('user_permissions', JSON.stringify(validPermissions));
      console.log('🔍 Permissions saved:', validPermissions);
    } catch (error) {
      console.error('❌ Error saving permissions:', error);
      // ใช้ fallback permissions
      localStorage.setItem('user_permissions', JSON.stringify([1, 12, 14])); // Basic user permissions
    }
  }

  /**
   * ดึง permissions (return number[] โดยตรง)
   */
  getUserPermissions(): number[] {
    try {
      const permStr = localStorage.getItem('user_permissions');
      return permStr ? JSON.parse(permStr) : [];
    } catch (error) {
      console.error('❌ Error loading permissions:', error);
      return [];
    }
  }

  /**
   * ตรวจสอบสิทธิ์เดี่ยว (รับ number)
   */
  hasPermission(permission: number): boolean {
    const permissions = this.getEffectivePermissions(); // ใช้ effective permissions
    return permissions.includes(permission);
  }

  /**
   * ตรวจสอบสิทธิ์หลายตัว (ต้องมีทั้งหมด)
   */
  hasAllPermissions(permissions: number[]): boolean {
    const userPermissions = this.getEffectivePermissions();
    return permissions.every(permission => userPermissions.includes(permission));
  }

  /**
   * ตรวจสอบสิทธิ์หลายตัว (มีอย่างน้อย 1 ตัว)
   */
  hasAnyPermission(permissions: number[]): boolean {
    const userPermissions = this.getEffectivePermissions();
    return permissions.some(permission => userPermissions.includes(permission));
  }

  // ===== ROLE MANAGEMENT ===== (existing methods with no changes for backward compatibility)

  /**
   * ตรวจสอบ role เดี่ยว
   */
  hasRole(role: UserRole): boolean {
    const currentUser = this.getCurrentUser();

    if (!currentUser) {
      console.warn('⚠️ No current user for role check');
      return false;
    }

    // ✅ ลองหา roles จากทุก property ที่เป็นไปได้
    const roles = currentUser.roles ||
      currentUser.role ||
      currentUser.userRoles ||
      currentUser.user_roles ||
      [];

    // console.log('🎭 hasRole() check:', {
    //   checkingFor: role,
    //   currentRoles: roles,
    //   normalizedRoles: validateAndNormalizeRoles(roles),
    //   result: validateAndNormalizeRoles(roles).includes(role)
    // });

    return validateAndNormalizeRoles(roles).includes(role);
  }

  /**
   * ตรวจสอบ roles หลายตัว (ต้องมีทั้งหมด)
   */
  hasAllRoles(roles: UserRole[]): boolean {
    const userRoles = this.getUserRoles();
    return roles.every(role => userRoles.includes(role));
  }

  /**
   * ตรวจสอบ roles หลายตัว (มีอย่างน้อย 1 ตัว)
   */
  hasAnyRole(roles: UserRole[]): boolean {
    const userRoles = this.getUserRoles();
    return roles.some(role => userRoles.includes(role));
  }

  // ===== ACCESS CONTROL ===== (no changes needed)

  /**
   * ตรวจสอบการเข้าถึงแบบรวม (permissions + roles)
   */
  checkAccess(
    requiredPermissions?: number[],
    requiredRoles?: UserRole[]
  ): any {
    const userPermissions = this.getEffectivePermissions();
    const userRoles = this.getUserRoles();

    // ✅ เรียกใช้ function ที่ import มาแทน
    return checkAccessPermission(userPermissions, userRoles, requiredPermissions, requiredRoles);
  }

  /**
   * ตรวจสอบว่าสามารถจัดการ tickets ได้หรือไม่
   */
  canManageTickets(): boolean {
    return this.hasAnyPermission([
      13, // VIEW_ALL_TICKETS
      5,  // CHANGE_STATUS
      9   // ASSIGNEE
    ]);
  }

  /**
   * ตรวจสอบว่าสามารถจัดการ users ได้หรือไม่
   */
  canManageUsers(): boolean {
    return this.hasAnyPermission([
      15, // ADD_USER
      16  // DEL_USER
    ]);
  }

  /**
   * ตรวจสอบว่าสามารถสร้าง ticket ได้หรือไม่
   */
  canCreateTickets(): boolean {
    return this.hasPermission(1); // CREATE_TICKET
  }

  /**
   * ตรวจสอบว่าสามารถดู tickets ทั้งหมดได้หรือไม่
   */
  canViewAllTickets(): boolean {
    return this.hasPermission(13); // VIEW_ALL_TICKETS
  }

  /**
   * ตรวจสอบว่าสามารถดูแค่ tickets ของตัวเองได้หรือไม่
   */
  canViewOwnTicketsOnly(): boolean {
    return this.hasPermission(12) && // VIEW_OWN_TICKETS
      !this.hasPermission(13);  // และไม่มี VIEW_ALL_TICKETS
  }

  // ===== AUTHENTICATION STATUS ===== (no changes needed)

  /**
   * ตรวจสอบการ authentication
   */
  isAuthenticated(): boolean {
    const token = this.getToken();
    const user = this.getCurrentUser();

    const isAuth = !!(token && user && !this.isTokenExpired());

    console.log('🔍 Authentication check:', {
      hasToken: !!token,
      hasUser: !!user,
      tokenExpired: token ? this.isTokenExpired() : 'No token',
      isAuthenticated: isAuth
    });

    return isAuth;
  }

  /**
   * Alias สำหรับ isAuthenticated
   */
  isLoggedIn(): boolean {
    return this.isAuthenticated();
  }

  // ===== LOGOUT ===== (no changes needed)

  /**
   * ออกจากระบบ
   */
  logout(): void {
    console.log('🚪 Starting logout process');

    const refreshToken = this.getRefreshToken();

    // เรียก logout API ถ้ามี refresh token
    if (refreshToken) {
      const headers = new HttpHeaders({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.getToken()}`
      });

      this.http.post(`${this.apiUrl}/logout`,
        { refresh_token: refreshToken },
        { headers }
      ).subscribe({
        next: () => console.log('✅ Logout API successful'),
        error: (error) => console.error('❌ Logout API failed:', error),
        complete: () => this.clearAuthData()
      });
    } else {
      this.clearAuthData();
    }
  }

  /**
   * ล้างข้อมูล authentication และ redirect
   */
  clearAuthData(): void {
    console.log('🧹 Clearing authentication data');

    // ล้าง localStorage
    const keysToRemove = [
      'access_token',
      'refresh_token',
      'token_expires_at',
      'token_expires_timestamp',
      'user_data',
      'user_permissions',
      'user_roles',
      'user_role_ids', // ✅ NEW: Clear role IDs
      'remember_me'
    ];

    keysToRemove.forEach(key => localStorage.removeItem(key));

    // รีเซ็ต subjects
    this.currentUserSubject.next(null);
    this.tokenSubject.next(null);
    this.warningSubject.next(false);
    this.authStateSubject.next(createEmptyAuthState());
    this.refreshInProgress = false;
    this.userRoleIds = []; // ✅ NEW: Clear role IDs in memory

    console.log('🏠 Redirecting to login page');
    this.router.navigate(['/login']);
  }

  /**
   * Alias สำหรับ clearAuthData (ใช้ใน api.service.ts)
   */
  clearTokensAndRedirect(): void {
    this.clearAuthData();
  }

  // ===== ✅ UPDATED: USER ACCESS VALIDATION WITH ROLE ID SUPPORT =====

  /**
   * ✅ UPDATED: ตรวจสอบการเข้าถึงของ user หลัง login with role ID support
   */
  private validateUserAccess(): void {
    console.group('🔍 Validating User Access (with Role IDs)');

    const user = this.getCurrentUser();
    const roles = this.getUserRoles();
    const roleIds = this.getUserRoleIds();
    const permissions = this.getEffectivePermissions();

    console.log('User validation:', {
      hasUser: !!user,
      username: user?.username,
      roles: roles,
      roleIds: roleIds,
      permissions: permissions,
      isAuthenticated: this.isAuthenticated(),
      canViewDashboard: this.hasPermission(19), // VIEW_DASHBOARD
      isAdmin: this.isAdmin(),
      isSupporter: this.isSupporter(),
      isUser: this.isUser()
    });

    // ตรวจสอบว่า user มีสิทธิ์ขั้นต้นหรือไม่
    const hasBasicAccess = (roles.length > 0 || roleIds.length > 0) && (
      this.hasPermission(1) || // CREATE_TICKET
      this.hasPermission(12) || // VIEW_OWN_TICKETS
      this.hasPermission(13) || // VIEW_ALL_TICKETS
      this.isAdmin() ||
      this.isSupporter()
    );

    if (!hasBasicAccess) {
      console.warn('⚠️ User has no basic access permissions!');
      console.log('Available permissions:', permissions);
      console.log('Available roles:', roles);
      console.log('Available role IDs:', roleIds);
    }

    // ✅ NEW: Validate role ID consistency
    const expectedRoleIds = convertRoleNamesToIds(roles);
    const roleIdConsistency = JSON.stringify(roleIds.sort()) === JSON.stringify(expectedRoleIds.sort());

    if (!roleIdConsistency) {
      console.warn('⚠️ Role ID and role name inconsistency detected:', {
        roleNames: roles,
        expectedRoleIds,
        actualRoleIds: roleIds
      });
    }

    console.groupEnd();
  }

  // ===== ✅ UPDATED: DEBUG METHODS WITH ROLE ID SUPPORT =====

  /**
   * Debug authentication status
   */
  debugAuthStatus(): void {
    console.group('🔍 Authentication Debug Info (with Role IDs)');

    const token = this.getToken();
    const user = this.getCurrentUser();
    const permissions = this.getUserPermissions();
    const roles = this.getUserRoles();
    const roleIds = this.getUserRoleIds();
    const effectivePermissions = this.getEffectivePermissions();

    console.log('📋 Basic Info:', {
      hasToken: !!token,
      hasUser: !!user,
      permissionCount: permissions.length,
      roleCount: roles.length,
      roleIdCount: roleIds.length,
      effectivePermissionCount: effectivePermissions.length
    });

    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        console.log('🔑 Token Info:', {
          userId: payload.sub || payload.user_id,
          username: payload.username,
          expiresAt: new Date(payload.exp * 1000).toISOString(),
          isExpired: this.isTokenExpired(),
          isExpiring: this.isTokenExpiring()
        });
      } catch (error) {
        console.error('❌ Cannot decode token:', error);
      }
    }

    if (user) {
      console.log('👤 User Info:', {
        id: user.id,
        username: user.username,
        fullName: `${user.firstname} ${user.lastname}`
      });
    }

    console.log('🔍 Auth Methods:', {
      isAuthenticated: this.isAuthenticated(),
      hasValidToken: this.hasValidToken(),
      isLoggedIn: this.isLoggedIn(),
      isAdmin: this.isAdmin(),
      isSupporter: this.isSupporter(),
      isUser: this.isUser(),
      primaryRole: this.getPrimaryRole()
    });

    console.log('🔍 Permissions:', permissions);
    console.log('👥 Roles:', roles);
    console.log('🔢 Role IDs:', roleIds);
    console.log('⚡ Effective Permissions:', effectivePermissions);

    console.log('🎯 Access Control:', {
      canManageTickets: this.canManageTickets(),
      canManageUsers: this.canManageUsers(),
      canCreateTickets: this.canCreateTickets(),
      canViewAllTickets: this.canViewAllTickets(),
      canViewOwnTicketsOnly: this.canViewOwnTicketsOnly()
    });

    // ✅ NEW: Role ID validation
    console.log('🔢 Role ID Validation:', {
      roleIds,
      roleNames: roles,
      expectedRoleIds: convertRoleNamesToIds(roles),
      actualRoleIds: roleIds,
      isConsistent: JSON.stringify(roleIds.sort()) === JSON.stringify(convertRoleNamesToIds(roles).sort())
    });

    console.groupEnd();
  }

  /**
   * ✅ NEW: Debug role ID system specifically
   */
  debugRoleIdSystem(): void {
    console.group('🔢 Role ID System Debug');

    const roles = this.getUserRoles();
    const roleIds = this.getUserRoleIds();

    console.log('Current Role Data:', {
      roleNames: roles,
      roleIds: roleIds,
      roleIdPermissions: roleIds.map(id => ({
        id,
        name: ROLE_ID_TO_NAME[id],
        permissions: getRoleIdPermissions(id)
      }))
    });

    console.log('Role ID Checks:', {
      hasAdminRoleId: this.hasRoleId(ROLE_IDS.ADMIN),
      hasSupporterRoleId: this.hasRoleId(ROLE_IDS.SUPPORTER),
      hasUserRoleId: this.hasRoleId(ROLE_IDS.USER),
      isAdminByRoleId: isAdminByRoleId(roleIds),
      isSupporterByRoleId: isSupporterByRoleId(roleIds),
      isUserByRoleId: isUserByRoleId(roleIds)
    });

    console.groupEnd();
  }

  // ===== TOKEN REFRESH (ถ้า Backend รองรับ) ===== (no changes needed)

  /**
   * รีเฟรช access token
   */
  refreshAccessToken(): Observable<TokenData> {
    const refreshToken = this.getRefreshToken();

    if (!refreshToken) {
      return throwError(() => 'No refresh token available');
    }

    if (this.refreshInProgress) {
      // ถ้ากำลัง refresh อยู่ ให้รอ
      return new Observable(observer => {
        const checkInterval = setInterval(() => {
          if (!this.refreshInProgress) {
            clearInterval(checkInterval);
            const newToken = this.getToken();
            if (newToken) {
              observer.next({
                access_token: newToken,
                refresh_token: this.getRefreshToken()!
              });
              observer.complete();
            } else {
              observer.error('Token refresh failed');
            }
          }
        }, 100);
      });
    }

    this.refreshInProgress = true;

    const headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    const body = { refresh_token: refreshToken };

    return this.http.post<any>(`${this.apiUrl}/refresh`, body, { headers })
      .pipe(
        tap((response: any) => {
          if (response.access_token) {
            const tokenData: TokenData = {
              access_token: response.access_token,
              refresh_token: response.refresh_token || refreshToken,
              expires_at: response.expires_at
            };

            this.setTokens(tokenData);
            this.warningSubject.next(false);
            console.log('✅ Token refreshed successfully');
          } else {
            throw new Error('Invalid refresh response');
          }

          this.refreshInProgress = false;
        }),
        catchError((error) => {
          console.error('❌ Token refresh failed:', error);
          this.refreshInProgress = false;
          this.clearAuthData();
          return throwError(() => 'Token refresh failed');
        })
      );
  }

  // ===== PRIVATE HELPER METHODS ===== (no changes needed)

  /**
   * โหลด user data จาก localStorage เมื่อเริ่มต้น
   */
  private loadUserFromStorage(): void {
    console.log('📂 Loading user data from storage');

    const token = this.getToken();
    const user = this.getCurrentUser();
    const permissions = this.getUserPermissions();
    const roles = this.getUserRoles();
    const roleIds = this.getUserRoleIds(); // ✅ NEW: Load role IDs

    if (token && user && !this.isTokenExpired()) {
      console.log('✅ Valid session found, restoring auth state');

      this.tokenSubject.next(token);
      this.currentUserSubject.next(user);
      this.userRoleIds = roleIds; // ✅ NEW: Restore role IDs to memory

      this.updateAuthState({
        isAuthenticated: true,
        isLoading: false,
        user: user,
        token: token,
        permissions: permissions,
        roles: roles,
        last_activity: new Date(),
        effective_permissions: this.getEffectivePermissions()
      });

    } else {
      console.log('❌ No valid session found');
      this.clearAuthData();
    }
  }

  /**
   * อัปเดต auth state
   */
  private updateAuthState(updates: Partial<AuthState>): void {
    const currentState = this.authStateSubject.value;
    const newState = { ...currentState, ...updates };
    this.authStateSubject.next(newState);
  }

  /**
   * จัดการ login errors
   */
  private handleLoginError(error: HttpErrorResponse): Observable<never> {
    console.error('❌ Login API error:', error);

    let errorMessage = 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ';

    if (error.status === 0) {
      errorMessage = 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาตรวจสอบ:\n' +
        '1. Backend server ทำงานอยู่หรือไม่\n' +
        '2. IP address ถูกต้องหรือไม่\n' +
        '3. Port 3000 เปิดอยู่หรือไม่';
    } else if (error.status === 404) {
      errorMessage = 'ไม่พบ API endpoint กรุณาตรวจสอบ:\n' +
        '1. Backend API path ถูกต้องหรือไม่\n' +
        '2. Route /api/login มีอยู่หรือไม่';
    } else if (error.status === 401) {
      errorMessage = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
    } else if (error.status === 403) {
      errorMessage = 'บัญชีของคุณถูกระงับการใช้งาน';
    } else if (error.status === 429) {
      errorMessage = 'มีการพยายามเข้าสู่ระบบมากเกินไป กรุณาลองใหม่ในภายหลัง';
    } else if (error.error?.message) {
      errorMessage = error.error.message;
    }

    // เพิ่มข้อมูล debug ใน console
    console.error('🔍 Debug info:', {
      status: error.status,
      statusText: error.statusText,
      url: error.url,
      message: error.message,
      error: error.error
    });

    return throwError(() => new Error(errorMessage));
  }

  /**
   * Debug method - แสดงข้อมูล login response
   */
  debugLoginResponse(response: LoginResponse): void {
    console.group('🔍 Login Response Debug');
    console.log('Response structure:', {
      code: response.code,
      status: response.status,
      message: response.message,
      hasUser: !!response.user,
      hasToken: !!response.access_token,
      hasPermissions: !!response.permission,
      permissionCount: response.permission?.length || 0,
      permissions: response.permission,
      hasRoles: !!response.roles,
      roleType: typeof response.roles,
      roles: response.roles
    });

    if (response.user) {
      console.log('User data:', response.user);
    }

    // ✅ NEW: Debug role processing
    if (response.roles) {
      console.log('Role processing debug:', {
        rawRoles: response.roles,
        roleType: typeof response.roles,
        isArray: Array.isArray(response.roles),
        firstRoleType: Array.isArray(response.roles) ? typeof response.roles[0] : 'N/A'
      });
    }

    console.groupEnd();
  }

  /**
   * ตั้งค่า token check timer
   */
  private initTokenCheck(): void {
    setInterval(() => {
      const token = this.getToken();

      if (!token) return;

      if (this.isTokenExpired()) {
        console.log('⏰ Token expired, attempting refresh...');
        this.refreshAccessToken().subscribe({
          next: () => console.log('✅ Auto refresh successful'),
          error: (error) => {
            console.error('❌ Auto refresh failed:', error);
            // AuthService จะ auto logout ใน refreshAccessToken method
          }
        });
      } else if (this.isTokenExpiring() && !this.warningSubject.value) {
        console.log('⚠️ Token expiring soon, showing warning');
        this.warningSubject.next(true);

        // Auto refresh เมื่อใกล้หมดอายุ
        this.refreshAccessToken().subscribe({
          next: () => console.log('✅ Proactive refresh successful'),
          error: (error) => console.error('❌ Proactive refresh failed:', error)
        });
      }
    }, 30000); // ตรวจสอบทุก 30 วินาที
  }

  // ===== OBSERVABLE GETTERS ===== (no changes needed)

  /**
   * ดู warning status (token ใกล้หมดอายุ)
   */
  getWarningStatus(): Observable<boolean> {
    return this.warningSubject.asObservable();
  }

  /**
   * ดู token changes
   */
  getTokenChanges(): Observable<string | null> {
    return this.tokenSubject.asObservable();
  }

  /**
   * Manual refresh สำหรับ UI
   */
  manualRefresh(): Observable<TokenData> {
    return this.refreshAccessToken();
  }

  // ===== ADVANCED PERMISSION METHODS ===== (no changes needed)

  /**
   * ตรวจสอบ permission พร้อม fallback logic
   */
  hasPermissionWithFallback(permission: permissionEnum, fallbackRoles?: UserRole[]): boolean {
    // ตรวจสอบ direct permission ก่อน
    if (this.hasPermission(permission)) {
      return true;
    }

    // ถ้าไม่มี ลองตรวจสอบผ่าน roles
    if (fallbackRoles && this.hasAnyRole(fallbackRoles)) {
      return true;
    }

    // ตรวจสอบผ่าน role permissions mapping
    const userRoles = this.getUserRoles();
    return userRoles.some(role => {
      const rolePermissions = getRolePermissions(role);
      return rolePermissions.includes(permission);
    });
  }

  /**
   * ดึงรายการ permissions ที่ขาดหายไป
   */
  getMissingPermissions(requiredPermissions: number[]): number[] {
    const userPermissions = this.getEffectivePermissions();
    return requiredPermissions.filter(permission => !userPermissions.includes(permission));
  }

  /**
   * ดึงรายการ roles ที่ขาดหายไป
   */
  getMissingRoles(requiredRoles: UserRole[]): UserRole[] {
    const userRoles = this.getUserRoles();
    return requiredRoles.filter(role => !userRoles.includes(role));
  }

  // ===== ✅ NEW: ROLE ID SPECIFIC METHODS =====

  /**
   * ✅ NEW: ดึงรายการ role IDs ที่ขาดหายไป
   */
  getMissingRoleIds(requiredRoleIds: RoleId[]): RoleId[] {
    const userRoleIds = this.getUserRoleIds();
    return requiredRoleIds.filter(roleId => !userRoleIds.includes(roleId));
  }

  /**
   * ✅ NEW: ตรวจสอบ permission โดยใช้ role ID fallback
   */
  hasPermissionWithRoleIdFallback(permission: permissionEnum, fallbackRoleIds?: RoleId[]): boolean {
    // ตรวจสอบ direct permission ก่อน
    if (this.hasPermission(permission)) {
      return true;
    }

    // ถ้าไม่มี ลองตรวจสอบผ่าน role IDs
    if (fallbackRoleIds && fallbackRoleIds.some(roleId => this.hasRoleId(roleId))) {
      return true;
    }

    // ตรวจสอบผ่าน role ID permissions mapping
    const userRoleIds = this.getUserRoleIds();
    return userRoleIds.some(roleId => {
      const rolePermissions = getRoleIdPermissions(roleId);
      return rolePermissions.includes(permission);
    });
  }

  // ===== ✅ UPDATED: DEBUG AND UTILITY METHODS =====

  /**
   * ดูสถานะ permission ปัจจุบัน
   */
  checkCurrentPermissionStatus(): void {
    console.group('🔍 Current Permission Status (with Role IDs)');

    const user = this.getCurrentUser();
    const permissions = this.getUserPermissions();
    const roles = this.getUserRoles();
    const roleIds = this.getUserRoleIds();
    const effectivePermissions = this.getEffectivePermissions();

    console.log('Current Status:', {
      isAuthenticated: this.isAuthenticated(),
      hasUser: !!user,
      username: user?.username,
      rolesCount: roles.length,
      roles: roles,
      roleIdsCount: roleIds.length,
      roleIds: roleIds,
      directPermissions: permissions.length,
      directPermissionsList: permissions,
      effectivePermissions: effectivePermissions.length,
      effectivePermissionsList: effectivePermissions,
      isAdmin: this.isAdmin(),
      isSupporter: this.isSupporter(),
      isUser: this.isUser(),
      canManageTickets: this.canManageTickets(),
      canViewAllTickets: this.canViewAllTickets()
    });

    // ตรวจสอบข้อมูลใน localStorage
    console.log('LocalStorage Data:', {
      hasUserData: !!localStorage.getItem('user_data'),
      hasPermissions: !!localStorage.getItem('user_permissions'),
      hasRoles: !!localStorage.getItem('user_roles'),
      hasRoleIds: !!localStorage.getItem('user_role_ids'),
      hasToken: !!localStorage.getItem('access_token')
    });

    console.groupEnd();
  }

  /**
   * Debug permissions ใน localStorage
   */
  debugPermissionsInStorage(): void {
    console.group('🔍 Permissions Storage Debug');

    const permStr = localStorage.getItem('user_permissions');
    const rolesStr = localStorage.getItem('user_roles');
    const roleIdsStr = localStorage.getItem('user_role_ids');

    console.log('Raw localStorage data:', {
      permissions: permStr,
      roles: rolesStr,
      roleIds: roleIdsStr
    });

    if (permStr) {
      try {
        const parsedPermissions = JSON.parse(permStr);
        console.log('Parsed permissions:', {
          type: typeof parsedPermissions,
          isArray: Array.isArray(parsedPermissions),
          length: parsedPermissions?.length,
          values: parsedPermissions,
          mapped: parsedPermissions?.map((p: any) => ({
            original: p,
            type: typeof p,
            asNumber: parseInt(p, 10),
            isValid: !isNaN(parseInt(p, 10))
          }))
        });
      } catch (error) {
        console.error('Error parsing permissions:', error);
      }
    }

    console.log('Current getUserPermissions():', this.getUserPermissions());
    console.log('Current getUserRoles():', this.getUserRoles());
    console.log('Current getUserRoleIds():', this.getUserRoleIds());

    console.groupEnd();
  }

  /**
   * ดึงข้อมูล auth state สำหรับ debug
   */
  getAuthState(): AuthState {
    return this.authStateSubject.value;
  }

  /**
   * ดึงสถิติการใช้งาน
   */
  getUsageStats(): {
    loginTime: Date | null;
    lastActivity: Date | null;
    sessionDuration: number;
    tokenRefreshCount: number;
  } {
    const authState = this.getAuthState();
    const loginTime = authState.last_activity;
    const now = new Date();

    return {
      loginTime: loginTime,
      lastActivity: authState.last_activity,
      sessionDuration: loginTime ? now.getTime() - loginTime.getTime() : 0,
      tokenRefreshCount: 0 // TODO: implement refresh counter if needed
    };
  }

  /**
   * ดูข้อมูล token
   */
  getTokenInfo(): any {
    const token = this.getToken();
    if (!token) return null;

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const currentTime = Math.floor(Date.now() / 1000);
      const timeLeft = payload.exp - currentTime;

      return {
        user_id: payload.sub || payload.user_id,
        username: payload.username,
        expires_at: new Date(payload.exp * 1000).toISOString(),
        time_left_seconds: timeLeft,
        time_left_minutes: Math.floor(timeLeft / 60),
        is_expired: timeLeft <= 0,
        is_expiring: timeLeft <= 300
      };
    } catch (error) {
      return null;
    }
  }
}