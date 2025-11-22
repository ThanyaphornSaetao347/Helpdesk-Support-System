import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject, takeUntil, catchError, of, debounceTime, distinctUntilChanged } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

// Services
import { ApiService } from '../../../shared/services/api.service';
import { AuthService } from '../../../shared/services/auth.service';
import { permissionEnum } from '../../../shared/models/permission.model';

// User Account interface - aligned with backend response
export interface UserAccountItem {
  id?: number;
  name: string;
  user_email: string;
  company: string;
  company_address: string;
  user_phone: string;
  company_phone: string;
  username?: string;
  firstname?: string;
  lastname?: string;
  created_date?: string;
  updated_date?: string;
  roles?: Role[];
}

// Role interface for dropdown
export interface Role {
  id: number;
  name: string;
  description?: string;
}

// Create User DTO - matches backend expectations
export interface CreateUserDto {
  username: string;
  password: string;
  firstname: string;
  lastname: string;
  email: string;
  phone: string;
  role_id: number[];
}

// Update User DTO - matches backend expectations (เพิ่ม password field)
export interface UpdateUserDto {
  id?: number;
  username?: string;
  firstname?: string;
  lastname?: string;
  email?: string;
  phone?: string;
  role_id?: number[];
  new_password?: string; // เพิ่ม optional password field สำหรับ admin
}

// User stats interface
export interface UserStats {
  total: number;
  active: number;
  inactive: number;
  newThisMonth: number;
}

// Notification interface
export interface NotificationMessage {
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number;
}

@Component({
  selector: 'app-user-account',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './user-account.component.html',
  styleUrls: ['./user-account.component.css']
})
export class UserAccountComponent implements OnInit, OnDestroy {

  private destroy$ = new Subject<void>();

  // Loading and error states
  isLoading = false;
  hasError = false;
  errorMessage = '';

  // Search properties with debouncing
  searchTerm: string = '';
  private searchSubject = new Subject<string>();

  // User data
  users: UserAccountItem[] = [];
  filteredUsers: UserAccountItem[] = [];
  availableRoles: Role[] = [];

  // User stats
  userStats: UserStats = {
    total: 0,
    active: 0,
    inactive: 0,
    newThisMonth: 0
  };

  // Modal-related properties
  isCreateModalVisible = false;
  isSubmitting = false;
  userForm!: FormGroup;

  // Edit modal properties
  isEditModalVisible = false;
  editingUser: UserAccountItem | null = null;
  editForm!: FormGroup;

  // Notification
  notification: NotificationMessage | null = null;

  constructor(
    private router: Router,
    private apiService: ApiService,
    private authService: AuthService,
    private fb: FormBuilder
  ) { 
    this.initForm();
    this.initEditForm();
    this.initSearchDebounce();
  }

  ngOnInit(): void {
    this.loadRoles();
    this.loadUserData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Initialize form with proper validation including confirm password
   */
  private initForm(): void {
    this.userForm = this.fb.group({
      username: ['', [
        Validators.required, 
        Validators.minLength(3), 
        Validators.maxLength(50),
        Validators.pattern(/^[a-zA-Z0-9_-]+$/) // Username pattern
      ]],
      password: ['', [
        Validators.required, 
        Validators.minLength(8), 
        Validators.maxLength(50)
      ]],
      confirmPassword: ['', [
        Validators.required
      ]],
      firstname: ['', [
        Validators.required, 
        Validators.minLength(2), 
        Validators.maxLength(50),
        Validators.pattern(/^[a-zA-ZÀ-ÿ\s\-\.]+$/) // Allow Thai, English, spaces, hyphens, dots
      ]],
      lastname: ['', [
        Validators.required, 
        Validators.minLength(2), 
        Validators.maxLength(50),
        Validators.pattern(/^[a-zA-ZÀ-ÿ\s\-\.]+$/)
      ]],
      email: ['', [
        Validators.required, 
        Validators.email,
        Validators.pattern(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)
      ]],
      phone: ['', [
        Validators.required, 
        Validators.pattern(/^[\d\s\-\+\(\)]{8,15}$/) // Phone pattern
      ]],
      role_id: [[], [Validators.required]] // Array of role IDs
    }, { validators: this.passwordMatchValidator }); // Add custom validator

    console.log('User form initialized with validation rules');
  }

  /**
   * Initialize edit form with proper validation - เพิ่ม password fields
   */
  private initEditForm(): void {
    this.editForm = this.fb.group({
      username: ['', [
        Validators.required, 
        Validators.minLength(3), 
        Validators.maxLength(50),
        Validators.pattern(/^[a-zA-Z0-9_-]+$/)
      ]],
      firstname: ['', [
        Validators.required, 
        Validators.minLength(2), 
        Validators.maxLength(50),
        Validators.pattern(/^[a-zA-ZÀ-ÿ\s\-\.]+$/)
      ]],
      lastname: ['', [
        Validators.required, 
        Validators.minLength(2), 
        Validators.maxLength(50),
        Validators.pattern(/^[a-zA-ZÀ-ÿ\s\-\.]+$/)
      ]],
      email: ['', [
        Validators.required, 
        Validators.email,
        Validators.pattern(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)
      ]],
      phone: ['', [
        Validators.required, 
        Validators.pattern(/^[\d\s\-\+\(\)]{8,15}$/)
      ]],
      role_id: [[], [Validators.required]],
      // เพิ่ม password fields สำหรับ admin
      newPassword: ['', [
        Validators.minLength(8),
        Validators.maxLength(50)
      ]],
      confirmPassword: ['']
    }, { validators: this.editPasswordMatchValidator }); // เพิ่ม custom validator สำหรับ edit form

    console.log('Edit form initialized with validation rules including password fields');
  }

  /**
   * Initialize search with debouncing
   */
  private initSearchDebounce(): void {
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(searchTerm => {
      this.searchTerm = searchTerm;
      this.filterUsers();
    });
  }

  /**
   * Load available roles from API
   */
  loadRoles(): void {
    this.apiService.get('master_role/all_roles')
      .pipe(
        takeUntil(this.destroy$),
        catchError((error: HttpErrorResponse) => {
          console.error('Error loading roles:', error);
          this.showNotification('warning', 'Failed to load available roles');
          return of([]);
        })
      )
      .subscribe({
        next: (response: any) => {
          console.log('Roles API Response:', response);
          
          if (this.isValidRolesResponse(response)) {
            this.availableRoles = this.extractRolesData(response);
            console.log(`Successfully loaded ${this.availableRoles.length} roles`);
          } else {
            console.warn('Invalid roles response format:', response);
            this.availableRoles = [];
          }
        }
      });
  }

  /**
   * Validate roles response format
   */
  private isValidRolesResponse(response: any): boolean {
    if (!response) return false;
    
    // Check for backend format
    if (response.status === true && Array.isArray(response.data)) return true;
    if (response.success && Array.isArray(response.data)) return true;
    if (Array.isArray(response)) return true;
    
    return false;
  }

  /**
   * Extract roles data from response
   */
  private extractRolesData(response: any): Role[] {
    let rolesArray: any[] = [];
    
    if (response.status === true && Array.isArray(response.data)) {
      rolesArray = response.data;
    } else if (response.success && Array.isArray(response.data)) {
      rolesArray = response.data;
    } else if (Array.isArray(response)) {
      rolesArray = response;
    }
    
    return rolesArray.map(role => ({
      id: role.id || role.role_id,
      name: role.name || role.role_name,
      description: role.description
    }));
  }

  /**
   * Custom validator for password matching (Create form)
   */
  private passwordMatchValidator(formGroup: FormGroup): {[key: string]: any} | null {
    const password = formGroup.get('password');
    const confirmPassword = formGroup.get('confirmPassword');
    
    if (!password || !confirmPassword) {
      return null;
    }

    // Only validate if both fields have values
    if (password.value && confirmPassword.value) {
      if (password.value !== confirmPassword.value) {
        confirmPassword.setErrors({ passwordMismatch: true });
        return { passwordMismatch: true };
      } else {
        // Clear the error if passwords match
        if (confirmPassword.hasError('passwordMismatch')) {
          const errors = confirmPassword.errors;
          delete errors?.['passwordMismatch'];
          confirmPassword.setErrors(Object.keys(errors || {}).length > 0 ? errors : null);
        }
      }
    }

    return null;
  }

  /**
   * Custom validator for password matching (Edit form) - เฉพาะเมื่อใส่ password
   */
  private editPasswordMatchValidator(formGroup: FormGroup): {[key: string]: any} | null {
    const newPassword = formGroup.get('newPassword');
    const confirmPassword = formGroup.get('confirmPassword');
    
    if (!newPassword || !confirmPassword) {
      return null;
    }

    const newPasswordValue = newPassword.value;
    const confirmPasswordValue = confirmPassword.value;

    // ถ้าใส่ newPassword แต่ไม่ใส่ confirmPassword
    if (newPasswordValue && !confirmPasswordValue) {
      confirmPassword.setErrors({ required: true });
      return { confirmPasswordRequired: true };
    }

    // ถ้าใส่ confirmPassword แต่ไม่ใส่ newPassword
    if (confirmPasswordValue && !newPasswordValue) {
      newPassword.setErrors({ required: true });
      return { newPasswordRequired: true };
    }

    // ถ้าใส่ทั้งสอง field แต่ไม่ตรงกัน
    if (newPasswordValue && confirmPasswordValue && newPasswordValue !== confirmPasswordValue) {
      confirmPassword.setErrors({ passwordMismatch: true });
      return { passwordMismatch: true };
    }

    // Clear errors if everything is valid
    if (newPasswordValue && confirmPasswordValue && newPasswordValue === confirmPasswordValue) {
      if (confirmPassword.hasError('passwordMismatch') || confirmPassword.hasError('required')) {
        const errors = { ...confirmPassword.errors };
        delete errors['passwordMismatch'];
        delete errors['required'];
        confirmPassword.setErrors(Object.keys(errors).length > 0 ? errors : null);
      }
      if (newPassword.hasError('required')) {
        const errors = { ...newPassword.errors };
        delete errors['required'];
        newPassword.setErrors(Object.keys(errors).length > 0 ? errors : null);
      }
    }

    return null;
  }

  /**
   * Check if field is invalid and show errors
   */
  isFieldInvalid(fieldName: string, formGroup?: FormGroup): boolean {
    const form = formGroup || this.userForm;
    const field = form.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  /**
   * Get specific field error message with enhanced error handling
   */
  getFieldError(fieldName: string, formGroup?: FormGroup): string {
    const form = formGroup || this.userForm;
    const field = form.get(fieldName);
    if (!field || !field.errors) return '';

    const errors = field.errors;
    
    if (errors['required']) {
      // Special case for confirm password in edit form
      if (fieldName === 'confirmPassword' && formGroup === this.editForm) {
        return 'Confirm password is required when setting a new password';
      }
      return `${this.getFieldDisplayName(fieldName)} is required`;
    }
    if (errors['minlength']) return `${this.getFieldDisplayName(fieldName)} must be at least ${errors['minlength'].requiredLength} characters`;
    if (errors['maxlength']) return `${this.getFieldDisplayName(fieldName)} cannot exceed ${errors['maxlength'].requiredLength} characters`;
    if (errors['email']) return 'Please enter a valid email address';
    if (errors['passwordMismatch']) return 'Passwords do not match';
    if (errors['pattern']) {
      if (fieldName === 'phone') return 'Please enter a valid phone number (8-15 digits)';
      if (fieldName === 'username') return 'Username can only contain letters, numbers, underscore, and hyphen';
      if (fieldName === 'firstname' || fieldName === 'lastname') return 'Name can only contain letters, spaces, hyphens, and dots';
      if (fieldName === 'password' || fieldName === 'newPassword') return 'Password must contain at least 8 characters';
      return 'Invalid format';
    }

    return 'Invalid input';
  }

  /**
   * Get user-friendly field display names
   */
  private getFieldDisplayName(fieldName: string): string {
    const displayNames: {[key: string]: string} = {
      'username': 'Username',
      'password': 'Password', 
      'confirmPassword': 'Confirm Password',
      'newPassword': 'New Password',
      'firstname': 'First Name',
      'lastname': 'Last Name',
      'email': 'Email',
      'phone': 'Phone Number',
      'role_id': 'Roles'
    };
    
    return displayNames[fieldName] || fieldName;
  }

  /**
   * Check if password fields are being used in edit form
   */
  isChangingPassword(): boolean {
    if (!this.editForm) return false;
    const newPassword = this.editForm.get('newPassword')?.value;
    const confirmPassword = this.editForm.get('confirmPassword')?.value;
    return !!(newPassword || confirmPassword);
  }

  /**
   * Load user data from API with improved error handling
   */
  loadUserData(forceRefresh: boolean = false): void {
    this.isLoading = true;
    this.hasError = false;
    this.errorMessage = '';

    console.log('Loading user account data from API...');

    this.apiService.get('users/account')
      .pipe(
        takeUntil(this.destroy$),
        catchError((error: HttpErrorResponse) => {
          console.error('Error loading user data:', error);
          this.handleApiError(error);
          return of(null);
        })
      )
      .subscribe({
        next: (response: any) => {
          console.log('Users API Response received:', response);
          
          if (this.isValidApiResponse(response)) {
            const userData = this.extractUserData(response);
            console.log('Extracted user data:', userData);
            
            // รอให้ availableRoles โหลดเสร็จก่อน normalize
            if (this.availableRoles.length === 0) {
              console.log('Waiting for roles to load...');
              // รอ 1 วินาทีแล้วลองใหม่
              setTimeout(() => {
                const normalizedData = this.normalizeUserDataWithRoles(userData);
                this.updateUsersList(normalizedData, forceRefresh);
              }, 1000);
            } else {
              const normalizedData = this.normalizeUserDataWithRoles(userData);
              this.updateUsersList(normalizedData, forceRefresh);
            }
          } else {
            console.warn('Invalid API response format:', response);
            this.handleApiError(new Error('Invalid response format') as any);
          }
          
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Subscription error:', error);
          this.isLoading = false;
        }
      });
  }

  /**
   * Update users list with normalized data
   */
  private updateUsersList(normalizedData: UserAccountItem[], forceRefresh: boolean): void {
    this.users = normalizedData;
    this.filterUsers();
    this.calculateUserStats();
    
    console.log(`Successfully loaded ${this.users.length} users`);
    
    if (forceRefresh) {
      this.showNotification('success', 'User data refreshed successfully');
    }
  }

  /**
   * Normalize user data with role mapping
   */
  private normalizeUserDataWithRoles(users: any[]): UserAccountItem[] {
    return users.map((user, index) => {
      // Try to get ID from various possible field names
      const userId = user.id || user.user_id || user.userId;
      
      // Normalize roles data - รองรับรูปแบบ roles ที่หลากหลาย
      let normalizedRoles: Role[] = [];
      
      // กรณีที่มี role_ids (array of numbers)
      if (user.role_ids && Array.isArray(user.role_ids)) {
        console.log(`Processing role_ids for user ${userId}:`, user.role_ids);
        console.log('Available roles for mapping:', this.availableRoles);
        
        normalizedRoles = user.role_ids.map((roleId: number) => {
          // หา role name จาก availableRoles
          const roleInfo = this.availableRoles.find(r => r.id === roleId);
          const role = {
            id: roleId,
            name: roleInfo?.name || `Role ${roleId}`,
            description: roleInfo?.description || ''
          };
          
          console.log(`Mapped role ${roleId}:`, role);
          return role;
        }).filter((role: Role) => role.id !== undefined);
      }
      // กรณีที่มี roles (array of objects) - รูปแบบเดิม
      else if (user.roles && Array.isArray(user.roles)) {
        normalizedRoles = user.roles.map((role: any) => ({
          id: role.id || role.role_id || role.roleId,
          name: role.name || role.role_name || role.roleName || 'Unknown Role',
          description: role.description || role.desc
        }));
      }
      
      // จัดการ name fields - ลองหาข้อมูลจากหลาย sources
      let firstname = user.firstname || user.first_name || '';
      let lastname = user.lastname || user.last_name || '';
      
      // ถ้าไม่มี firstname/lastname แต่มี name ให้ split name
      if (!firstname && !lastname && user.name) {
        const nameParts = user.name.trim().split(' ');
        firstname = nameParts[0] || '';
        lastname = nameParts.slice(1).join(' ') || '';
      }
      
      // ถ้ายังไม่มี name ให้สร้างจาก firstname + lastname
      const displayName = user.name || `${firstname} ${lastname}`.trim() || 'Unknown User';
      
      // Ensure all required fields exist with proper types
      const normalized: UserAccountItem = {
        id: userId || (index + 1000),
        name: this.sanitizeString(displayName),
        user_email: this.sanitizeString(user.user_email || user.email || '').toLowerCase(),
        company: this.sanitizeString(user.company || ''),
        company_address: this.sanitizeString(user.company_address || ''),
        user_phone: this.sanitizeString(user.user_phone || user.phone || ''),
        company_phone: this.sanitizeString(user.company_phone || ''),
        username: this.sanitizeString(user.username || ''),
        firstname: this.sanitizeString(firstname),
        lastname: this.sanitizeString(lastname),
        created_date: user.created_date || new Date().toISOString(),
        updated_date: user.updated_date,
        roles: normalizedRoles
      };

      // Debug comprehensive user data
      console.log('Complete user normalization:', {
        userId: normalized.id,
        originalUser: user,
        normalizedUser: normalized,
        rolesMapping: {
          originalRoleIds: user.role_ids,
          normalizedRoles: normalizedRoles,
          availableRolesCount: this.availableRoles.length
        }
      });

      return normalized;
    });
  }

  /**
   * Validate API response format
   */
  private isValidApiResponse(response: any): boolean {
    if (!response) return false;
    
    // Check for backend format: {code, status, message, data}
    if (response.status === true && Array.isArray(response.data)) return true;
    
    // Check for standard format: {success, data}
    if (response.success && Array.isArray(response.data)) return true;
    
    // Check for direct array
    if (Array.isArray(response)) return true;
    
    return false;
  }

  /**
   * Extract user data from various response formats
   */
  private extractUserData(response: any): any[] {
    if (response.status === true && Array.isArray(response.data)) {
      return response.data; // Backend format
    }
    
    if (response.success && Array.isArray(response.data)) {
      return response.data; // Standard format
    }
    
    if (Array.isArray(response)) {
      return response; // Direct array
    }
    
    return [];
  }

  /**
   * Handle API errors with detailed messages
   */
  private handleApiError(error: HttpErrorResponse | Error): void {
    this.hasError = true;
    this.isLoading = false;

    if (error instanceof HttpErrorResponse) {
      switch (error.status) {
        case 401:
          this.errorMessage = 'Authentication required. Please log in again.';
          this.showNotification('error', 'Session expired. Please log in again.');
          break;
        case 403:
          this.errorMessage = 'You do not have permission to view user data.';
          break;
        case 404:
          this.errorMessage = 'User data endpoint not found.';
          break;
        case 500:
          this.errorMessage = 'Server error. Please try again later.';
          break;
        case 0:
          this.errorMessage = 'Unable to connect to server. Please check your internet connection.';
          break;
        default:
          this.errorMessage = error.error?.message || 'Failed to load user data. Please try again.';
      }
    } else {
      this.errorMessage = error.message || 'An unexpected error occurred.';
    }

    console.error('API Error:', this.errorMessage);
  }

  /**
   * Sanitize string inputs
   */
  private sanitizeString(input: any): string {
    if (typeof input !== 'string') return '';
    return input.trim();
  }

  /**
   * Calculate user statistics
   */
  private calculateUserStats(): void {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();

    this.userStats = {
      total: this.users.length,
      active: this.users.length, // Assuming all users are active for now
      inactive: 0,
      newThisMonth: this.users.filter(user => {
        if (!user.created_date) return false;
        try {
          const createdDate = new Date(user.created_date);
          return createdDate.getMonth() === currentMonth && 
                 createdDate.getFullYear() === currentYear;
        } catch {
          return false;
        }
      }).length
    };

    console.log('User statistics calculated:', this.userStats);
  }

  /**
   * Filter users with improved search
   */
  filterUsers(): void {
    if (!this.searchTerm.trim()) {
      this.filteredUsers = [...this.users];
    } else {
      const searchTerm = this.searchTerm.toLowerCase().trim();
      this.filteredUsers = this.users.filter(user => 
        this.matchesSearchTerm(user, searchTerm)
      );
    }

    console.log(`Filtered: ${this.filteredUsers.length} of ${this.users.length} users`);
  }

  /**
   * Enhanced search matching
   */
  private matchesSearchTerm(user: UserAccountItem, searchTerm: string): boolean {
    const searchableFields = [
      user.name,
      user.user_email,
      user.company,
      user.company_address,
      user.user_phone,
      user.company_phone,
      user.username,
      user.firstname,
      user.lastname
    ];

    return searchableFields.some(field =>
      field ? field.toLowerCase().includes(searchTerm) : false
    );
  }

  /**
   * Handle search input with debouncing
   */
  onSearchChange(): void {
    this.searchSubject.next(this.searchTerm);
  }

  // ============ MODAL METHODS ============

  /**
   * Open create user modal
   */
  createNewUser(): void {
    console.log('Opening create user modal');
    this.isCreateModalVisible = true;
    this.resetCreateForm();
  }

  /**
   * Close create modal with confirmation if form is dirty
   */
  onModalClose(): void {
    if (this.isSubmitting) return;

    if (this.userForm.dirty) {
      const confirmClose = confirm('You have unsaved changes. Are you sure you want to close?');
      if (!confirmClose) return;
    }

    this.resetCreateForm();
    this.isCreateModalVisible = false;
    console.log('Create user modal closed');
  }

  /**
   * Close edit modal with confirmation if form is dirty
   */
  onEditModalClose(): void {
    if (this.isSubmitting) return;

    if (this.editForm.dirty) {
      const confirmClose = confirm('You have unsaved changes. Are you sure you want to close?');
      if (!confirmClose) return;
    }

    this.resetEditForm();
    this.isEditModalVisible = false;
    this.editingUser = null;
    console.log('Edit user modal closed');
  }

  /**
   * Handle backdrop click
   */
  onBackdropClick(): void {
    this.onModalClose();
  }

  /**
   * Handle edit backdrop click
   */
  onEditBackdropClick(): void {
    this.onEditModalClose();
  }

  /**
   * Reset edit form to initial state
   */
  private resetEditForm(): void {
    this.editForm.reset();
    this.isSubmitting = false;
    this.clearNotification();
    console.log('Edit form reset');
  }

  /**
   * Handle form submission with validation including password confirmation
   */
  onSubmit(): void {
    console.log('Form submission initiated');
    
    // Mark all fields as touched to show validation errors
    this.markFormGroupTouched(this.userForm);

    // Validate form including password match
    if (this.userForm.valid && !this.isSubmitting) {
      // Additional check for password matching
      const password = this.userForm.value.password;
      const confirmPassword = this.userForm.value.confirmPassword;
      
      if (password !== confirmPassword) {
        this.showNotification('error', 'Passwords do not match');
        return;
      }
      
      this.isSubmitting = true;
      
      // Prepare data - exclude confirmPassword field
      const formData: CreateUserDto = {
        username: this.userForm.value.username.trim(),
        password: this.userForm.value.password.trim(), // Only send password, not confirmPassword
        firstname: this.userForm.value.firstname.trim(),
        lastname: this.userForm.value.lastname.trim(),
        email: this.userForm.value.email.trim().toLowerCase(),
        phone: this.userForm.value.phone.trim(),
        role_id: this.userForm.value.role_id || []
      };
      
      console.log('Creating user with data:', formData);
      this.createUserViaApi(formData);
    } else {
      console.log('Form is invalid or already submitting');
      
      // Show specific validation errors
      const errors = this.getFormValidationErrors();
      if (errors.length > 0) {
        this.showNotification('error', `Please correct the following errors: ${errors.join(', ')}`);
      } else {
        this.showNotification('error', 'Please correct the errors before submitting');
      }
    }
  }

  /**
   * Get list of validation errors for better user feedback
   */
  private getFormValidationErrors(formGroup?: FormGroup): string[] {
    const form = formGroup || this.userForm;
    const errors: string[] = [];
    
    Object.keys(form.controls).forEach(fieldName => {
      const field = form.get(fieldName);
      if (field && field.invalid && (field.dirty || field.touched)) {
        const fieldError = this.getFieldError(fieldName, form);
        if (fieldError && !errors.includes(fieldError)) {
          errors.push(fieldError);
        }
      }
    });
    
    // Check for form-level errors (like password mismatch)
    if (form.hasError('passwordMismatch')) {
      errors.push('Passwords do not match');
    }
    
    return errors;
  }

  /**
   * Reset form to initial state with proper cleanup
   */
  private resetCreateForm(): void {
    this.userForm.reset({
      role_id: []
    });
    
    // Clear any form-level errors
    this.userForm.setErrors(null);
    
    // Clear individual field errors
    Object.keys(this.userForm.controls).forEach(fieldName => {
      const field = this.userForm.get(fieldName);
      if (field) {
        field.setErrors(null);
        field.markAsUntouched();
        field.markAsPristine();
      }
    });
    
    this.isSubmitting = false;
    this.clearNotification();
    console.log('User form reset completely');
  }

  /**
   * Enhanced password strength checker (optional utility)
   */
  getPasswordStrength(password: string): {
    score: number;
    level: string;
    feedback: string[];
  } {
    if (!password) {
      return { score: 0, level: 'none', feedback: ['Enter a password'] };
    }

    let score = 0;
    const feedback: string[] = [];

    // Length check
    if (password.length >= 8) {
      score += 1;
    } else {
      feedback.push('At least 8 characters');
    }

    // Uppercase check
    if (/[A-Z]/.test(password)) {
      score += 1;
    } else {
      feedback.push('One uppercase letter');
    }

    // Lowercase check
    if (/[a-z]/.test(password)) {
      score += 1;
    } else {
      feedback.push('One lowercase letter');
    }

    // Number check
    if (/\d/.test(password)) {
      score += 1;
    } else {
      feedback.push('One number');
    }

    // Special character check
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      score += 1;
    } else {
      feedback.push('One special character');
    }

    // Determine level
    let level = 'weak';
    if (score >= 4) level = 'strong';
    else if (score >= 3) level = 'good';
    else if (score >= 2) level = 'fair';

    return { score, level, feedback };
  }

  /**
   * Check if passwords match (utility method)
   */
  doPasswordsMatch(): boolean {
    const password = this.userForm.get('password')?.value;
    const confirmPassword = this.userForm.get('confirmPassword')?.value;
    
    if (!password || !confirmPassword) return false;
    return password === confirmPassword;
  }

  /**
   * Handle password field changes to trigger validation
   */
  onPasswordChange(): void {
    const confirmPasswordField = this.userForm.get('confirmPassword');
    if (confirmPasswordField && confirmPasswordField.value) {
      // Trigger validation for confirm password field
      confirmPasswordField.updateValueAndValidity();
    }
  }

  /**
   * Handle confirm password field changes
   */
  onConfirmPasswordChange(): void {
    const confirmPasswordField = this.userForm.get('confirmPassword');
    if (confirmPasswordField) {
      // Trigger form-level validation
      this.userForm.updateValueAndValidity();
    }
  }

  /**
   * Handle edit form submission - อัพเดทเพื่อรองรับ password
   */
  onEditSubmit(): void {
    console.log('Edit form submission initiated');
    
    if (!this.editingUser?.id) {
      this.showNotification('error', 'No user selected for editing');
      return;
    }

    // Mark all fields as touched to show validation errors
    this.markFormGroupTouched(this.editForm);

    if (this.editForm.valid && !this.isSubmitting) {
      this.isSubmitting = true;
      
      // เตรียมข้อมูลพื้นฐาน
      const formData: UpdateUserDto = {
        id: this.editingUser.id,
        username: this.editForm.value.username.trim(),
        firstname: this.editForm.value.firstname.trim(),
        lastname: this.editForm.value.lastname.trim(),
        email: this.editForm.value.email.trim().toLowerCase(),
        phone: this.editForm.value.phone.trim(),
        role_id: this.editForm.value.role_id || []
      };

      // เพิ่ม password หากมีการกรอก
      const newPassword = this.editForm.value.newPassword;
      if (newPassword && newPassword.trim()) {
        formData.new_password = newPassword.trim();
        console.log('Password will be updated');
      }
      
      console.log('Updating user with complete data:', formData);
      this.updateUserViaApi(this.editingUser.id, formData);
    } else {
      console.log('Edit form is invalid or already submitting');
      
      // Show specific validation errors
      const errors = this.getFormValidationErrors(this.editForm);
      if (errors.length > 0) {
        this.showNotification('error', `Please correct the following errors: ${errors.join(', ')}`);
      } else {
        this.showNotification('error', 'Please correct the errors before submitting');
      }
    }
  }

  /**
   * Mark all form fields as touched
   */
  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  /**
   * Create user via API
   */
  private createUserViaApi(userData: CreateUserDto): void {
    this.apiService.post('users', userData)
      .pipe(
        takeUntil(this.destroy$),
        catchError((error: HttpErrorResponse) => {
          console.error('Error creating user:', error);
          this.handleCreateUserError(error);
          this.isSubmitting = false;
          return of(null);
        })
      )
      .subscribe({
        next: (response: any) => {
          this.isSubmitting = false;
          
          if (this.isValidCreateResponse(response)) {
            const newUser = this.extractCreatedUser(response);
            this.onUserCreated(newUser);
          } else {
            this.showNotification('error', 'Failed to create user. Invalid response from server.');
          }
        },
        error: (error: any) => {
          console.error('Subscription error:', error);
          this.showNotification('error', 'Network error. Please check your connection and try again.');
          this.isSubmitting = false;
        }
      });
  }

  /**
   * Update user via API - อัพเดทเพื่อแสดงข้อความที่เหมาะสมเกี่ยวกับ password
   */
  private updateUserViaApi(userId: number, userData: UpdateUserDto): void {
    console.log('Updating user with ID:', userId);
    console.log('Complete update payload:', userData);
    
    const endpoint = `users/update/${userId}`;
    console.log('API endpoint:', endpoint);
    
    this.apiService.patch(endpoint, userData)
      .pipe(
        takeUntil(this.destroy$),
        catchError((error: HttpErrorResponse) => {
          console.error('Error updating user:', error);
          this.handleUpdateUserError(error);
          this.isSubmitting = false;
          return of(null);
        })
      )
      .subscribe({
        next: (response: any) => {
          console.log('Update response:', response);
          this.isSubmitting = false;
          
          if (this.isValidUpdateResponse(response)) {
            const updatedUser = this.extractUpdatedUser(response);
            // ส่งข้อมูลว่ามีการอัพเดท password ด้วยหรือไม่
            this.onUserUpdated(userId, updatedUser, !!userData.new_password);
          } else {
            console.error('Invalid update response:', response);
            this.showNotification('error', 'Failed to update user. Invalid response from server.');
          }
        },
        error: (error) => {
          console.error('Subscription error:', error);
          this.showNotification('error', 'Network error. Please check your connection and try again.');
          this.isSubmitting = false;
        }
      });
  }

  /**
   * Validate create user response
   */
  private isValidCreateResponse(response: any): boolean {
    if (!response) return false;
    
    // Check for success response with data
    if (response.success && response.data) return true;
    
    // Check for direct user object with ID
    if (response.id && response.name) return true;
    
    return false;
  }

  /**
   * Validate update user response
   */
  private isValidUpdateResponse(response: any): boolean {
    if (!response) return false;
    
    // Check for success response
    if (response.success || response.status === true) return true;
    
    // Check for direct user object with ID
    if (response.id && response.name) return true;
    
    return false;
  }

  /**
   * Extract created user from response
   */
  private extractCreatedUser(response: any): UserAccountItem {
    if (response.success && response.data) {
      return response.data;
    }
    
    return response;
  }

  /**
   * Extract updated user from response
   */
  private extractUpdatedUser(response: any): UserAccountItem {
    if (response.success && response.data) {
      return response.data;
    }
    
    if (response.status === true && response.data) {
      return response.data;
    }
    
    return response;
  }

  /**
   * Handle create user API errors
   */
  private handleCreateUserError(error: HttpErrorResponse): void {
    let errorMessage = 'Failed to create user. Please try again.';

    switch (error.status) {
      case 400:
        errorMessage = error.error?.message || 'Invalid input data. Please check your entries.';
        break;
      case 401:
        errorMessage = 'Authentication required. Please log in again.';
        break;
      case 403:
        errorMessage = 'You do not have permission to create users.';
        break;
      case 409:
        errorMessage = 'A user with this username or email already exists.';
        break;
      case 422:
        errorMessage = 'Validation failed. Please check your input data.';
        break;
    }

    this.showNotification('error', errorMessage);
  }

  /**
   * Handle update user API errors
   */
  private handleUpdateUserError(error: HttpErrorResponse): void {
    let errorMessage = 'Failed to update user. Please try again.';

    switch (error.status) {
      case 400:
        errorMessage = error.error?.message || 'Invalid input data. Please check your entries.';
        break;
      case 401:
        errorMessage = 'Authentication required. Please log in again.';
        break;
      case 403:
        errorMessage = 'You do not have permission to update users.';
        break;
      case 404:
        errorMessage = 'User not found.';
        break;
      case 409:
        errorMessage = 'A user with this username or email already exists.';
        break;
      case 422:
        errorMessage = 'Validation failed. Please check your input data.';
        break;
    }

    this.showNotification('error', errorMessage);
  }

  /**
   * Handle successful user creation
   */
  private onUserCreated(newUser: any): void {
    console.log('User created successfully:', newUser);
    
    const normalizedUser = this.normalizeUserDataWithRoles([newUser])[0];
    
    // Add to local array
    this.users.unshift(normalizedUser);
    this.filterUsers();
    this.calculateUserStats();

    // Close modal and show success
    this.isCreateModalVisible = false;
    this.showNotification('success', `User "${normalizedUser.name}" created successfully!`);
    
    // Refresh data from server after a short delay
    setTimeout(() => {
      this.refreshData();
    }, 1000);
  }

  /**
   * Handle successful user update - อัพเดทเพื่อแสดงข้อความที่เหมาะสม
   */
  private onUserUpdated(userId: number, updatedUser: any, passwordChanged: boolean = false): void {
    console.log('User updated successfully:', updatedUser);
    
    const normalizedUser = this.normalizeUserDataWithRoles([updatedUser])[0];
    
    // Update in local array
    const userIndex = this.users.findIndex(u => u.id === userId);
    if (userIndex !== -1) {
      this.users[userIndex] = normalizedUser;
    }
    
    this.filterUsers();
    this.calculateUserStats();

    // Close modal and show appropriate success message
    this.isEditModalVisible = false;
    this.editingUser = null;
    
    let successMessage = `User "${normalizedUser.name}" updated successfully`;
    if (passwordChanged) {
      successMessage += ' and password has been changed';
    }
    successMessage += '!';
    
    this.showNotification('success', successMessage);
    
    // Refresh data from server after a short delay
    setTimeout(() => {
      this.refreshData();
    }, 1000);
  }

  // ============ USER ACTIONS ============

  /**
   * Edit user - แก้ไขให้ดึงข้อมูลครบถ้วน และเคลียร์ password fields
   */
  editUser(userId: number): void {
    const user = this.users.find(u => u.id === userId);
    if (!user) {
      this.showNotification('error', 'User not found');
      return;
    }

    console.log('Opening edit modal for user:', userId);
    console.log('Complete user data:', user);
    
    // Debug: แสดงข้อมูลทั้งหมดของ user
    console.log('User fields check:', {
      id: user.id,
      name: user.name,
      username: user.username,
      firstname: user.firstname,
      lastname: user.lastname,
      user_email: user.user_email,
      user_phone: user.user_phone,
      roles: user.roles,
      'roles length': user.roles?.length || 0
    });
    
    // Extract role IDs from user data - ปรับปรุงการดึง role IDs
    let roleIds: number[] = [];
    
    if (user.roles && Array.isArray(user.roles)) {
      console.log('Processing user roles:', user.roles);
      roleIds = user.roles.map(role => {
        console.log('Processing role:', role);
        // Handle different role ID field names
        const roleId = role.id || (role as any).role_id || (role as any).roleId;
        console.log('Extracted role ID:', roleId);
        return roleId;
      }).filter(id => id !== undefined && id !== null);
    }
    
    console.log('Final extracted role IDs:', roleIds);
    
    // Set editing user and populate form with complete data
    this.editingUser = user;
    
    // Reset form first to clear any previous data
    this.editForm.reset();
    
    // Prepare form data with fallbacks
    const formData = {
      username: user.username || '',
      firstname: user.firstname || user.name?.split(' ')[0] || '', // ลองดึงจาก name ถ้าไม่มี firstname
      lastname: user.lastname || user.name?.split(' ').slice(1).join(' ') || '', // ลองดึงจาก name ถ้าไม่มี lastname
      email: user.user_email || '', 
      phone: user.user_phone || '', 
      role_id: roleIds,
      // เคลียร์ password fields เมื่อเปิด modal
      newPassword: '',
      confirmPassword: ''
    };
    
    console.log('Form data to populate:', formData);
    
    // Populate form with user data
    this.editForm.patchValue(formData);
    
    // Mark form as pristine after setting values
    this.editForm.markAsPristine();
    
    console.log('Edit form populated with values:', this.editForm.value);
    console.log('Form role_id control value:', this.editForm.get('role_id')?.value);
    
    // Double-check roles selection
    setTimeout(() => {
      console.log('After timeout - form role_id value:', this.editForm.get('role_id')?.value);
      console.log('Available roles for comparison:', this.availableRoles);
      
      // Debug roles selection
      if (roleIds.length > 0) {
        roleIds.forEach(roleId => {
          const isSelected = this.isRoleSelected(roleId, this.editForm);
          console.log(`Role ${roleId} is selected:`, isSelected);
        });
      }
    }, 100);
    
    this.isEditModalVisible = true;
  }

  /**
   * Delete user with confirmation
   */
  deleteUser(userId: number): void {
    const user = this.users.find(u => u.id === userId);
    if (!user) {
      this.showNotification('error', 'User not found');
      return;
    }

    const confirmMessage = `Are you sure you want to delete user "${user.name}"?\n\nThis action cannot be undone.`;

    if (confirm(confirmMessage)) {
      this.performDeleteUser(userId, user.name);
    }
  }

  /**
   * Perform user deletion
   */
  private performDeleteUser(userId: number, userName: string): void {
    console.log('Deleting user:', { userId, userName });

    this.isLoading = true;

    // Use the backend endpoint pattern: delete/:id
    this.apiService.delete(`users/delete/${userId}`)
      .pipe(
        takeUntil(this.destroy$),
        catchError((error: HttpErrorResponse) => {
          console.error('Error deleting user:', error);
          this.handleDeleteUserError(error, userName);
          this.isLoading = false;
          return of(null);
        })
      )
      .subscribe({
        next: (response: any) => {
          console.log('User deleted successfully:', response);
          
          // Remove from local array
          this.users = this.users.filter(u => u.id !== userId);
          this.filterUsers();
          this.calculateUserStats();
          
          this.showNotification('success', `User "${userName}" deleted successfully`);
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Subscription error:', error);
          this.showNotification('error', `Failed to delete user "${userName}"`);
          this.isLoading = false;
        }
      });
  }

  /**
   * Handle delete user API errors
   */
  private handleDeleteUserError(error: HttpErrorResponse, userName: string): void {
    let errorMessage = `Failed to delete user "${userName}". Please try again.`;

    switch (error.status) {
      case 401:
        errorMessage = 'Authentication required. Please log in again.';
        break;
      case 403:
        errorMessage = 'You do not have permission to delete users.';
        break;
      case 404:
        errorMessage = 'User not found.';
        break;
      case 409:
        errorMessage = 'Cannot delete user. It may be referenced by other records.';
        break;
    }

    this.showNotification('error', errorMessage);
  }

  /**
   * Refresh user data
   */
  refreshData(): void {
    console.log('Refreshing user data...');
    this.loadUserData(true);
  }

  // ============ PERMISSION METHODS ============

  canManageUsers(): boolean {
    return this.authService.hasPermission(permissionEnum.ADD_USER) ||
           this.authService.hasPermission(permissionEnum.DEL_USER) ||
           this.authService.isAdmin();
  }

  canEditUser(user: UserAccountItem): boolean {
    return this.authService.isAdmin() || 
           this.authService.hasPermission(permissionEnum.ADD_USER);
  }

  canDeleteUser(user: UserAccountItem): boolean {
    return this.authService.isAdmin() || 
           this.authService.hasPermission(permissionEnum.DEL_USER);
  }

  canCreateUser(): boolean {
    return this.authService.hasPermission(permissionEnum.ADD_USER) ||
           this.authService.isAdmin();
  }

  // ============ WRAPPER METHODS WITH PERMISSION CHECK ============

  onCreateNewUser(): void {
    if (!this.canCreateUser()) {
      this.showPermissionDeniedMessage('create new user');
      return;
    }
    this.createNewUser();
  }

  /**
   * แก้ไข onEditUser เพื่อเพิ่มการตรวจสอบ
   */
  onEditUser(userId: number): void {
    console.log('Edit clicked. userId:', userId);

    const user = this.users.find(u => u.id === userId);
    console.log('Found user:', user);
    if (!user) {
      console.warn('User not found with id:', userId);
      return;
    }

    // Debug user roles ก่อนเริ่ม edit
    this.debugUserRoles(user);
    this.validateUserRoles(user);

    const isReal = this.isRealDatabaseId(user);
    console.log('isRealDatabaseId:', isReal);
    if (!isReal) {
      this.showNotification('warning', 'Cannot edit user: Invalid database ID');
      return;
    }

    const canEdit = this.canEditUser(user);
    console.log('canEditUser:', canEdit);
    if (!canEdit) {
      this.showPermissionDeniedMessage('edit user');
      return;
    }

    console.log('All checks passed. Calling editUser...');
    this.editUser(userId);
  }

  onDeleteUser(userId: number): void {
    const user = this.users.find(u => u.id === userId);
    if (!user) return;

    // Check if it's a real database ID
    if (!this.isRealDatabaseId(user)) {
      this.showNotification('warning', 'Cannot delete user: Invalid database ID');
      return;
    }

    if (!this.canDeleteUser(user)) {
      this.showPermissionDeniedMessage('delete user');
      return;
    }
    this.deleteUser(userId);
  }

  // ============ UTILITY METHODS ============

  /**
   * Get safe user display name
   */
  getUserDisplayName(user: UserAccountItem): string {
    return user.name || `${user.firstname || ''} ${user.lastname || ''}`.trim() || 'Unknown User';
  }

  /**
   * Get user initial for avatar
   */
  getUserInitial(user: UserAccountItem): string {
    const name = this.getUserDisplayName(user);
    return name.charAt(0).toUpperCase();
  }

  /**
   * Get safe user ID
   */
  getUserId(user: UserAccountItem): number {
    return user.id || 0;
  }

  /**
   * Check if user has valid ID - for showing UI buttons
   */
  hasValidId(user: UserAccountItem): boolean {
    return user.id !== undefined && 
           user.id !== null && 
           user.id > 0 && 
           Number.isInteger(user.id);
  }

  /**
   * Check if user ID is from database - for API calls
   */
  isRealDatabaseId(user: UserAccountItem): boolean {
    // Real database IDs are typically < 1000, fallback IDs are 1000+
    return user.id !== undefined && 
           user.id !== null && 
           user.id > 0 && 
           user.id < 1000;
  }

  /**
   * Track by function for ngFor optimization
   */
  trackByUserId(index: number, user: UserAccountItem): number {
    return user.id || index;
  }

  /**
   * Track by function for roles ngFor optimization
   */
  trackRoleById(index: number, role: Role): number {
    return role.id || index;
  }

  /**
   * Debug: ตรวจสอบว่า roles ถูกโหลดมาถูกต้องหรือไม่
   */
  debugUserRoles(user: UserAccountItem): void {
    console.log('Debug user roles:', {
      userId: user.id,
      userName: user.name,
      roles: user.roles,
      roleIds: user.roles?.map(r => r.id),
      roleNames: user.roles?.map(r => r.name)
    });
  }

  /**
   * ตรวจสอบว่า role ID ที่เลือกอยู่ตรงกับข้อมูล user หรือไม่
   */
  validateUserRoles(user: UserAccountItem): boolean {
    if (!user.roles || !Array.isArray(user.roles)) {
      console.warn('User has no roles or invalid roles data:', user);
      return false;
    }
    
    const hasValidRoles = user.roles.every(role => 
      role.id !== undefined && 
      role.id !== null && 
      typeof role.name === 'string'
    );
    
    if (!hasValidRoles) {
      console.warn('User has invalid role data:', user.roles);
    }
    
    return hasValidRoles;
  }

  /**
   * Get user roles display - แสดงเฉพาะ roles ที่สำคัญ
   */
  getUserRoles(user: UserAccountItem): string {
    if (!user.roles || user.roles.length === 0) {
      return 'No roles assigned';
    }

    const importantRoles: string[] = [];
    
    // ตรวจสอบ role_ids และแสดงเฉพาะ roles ที่สำคัญ
    user.roles.forEach(role => {
      switch (role.id) {
        case 1:
          importantRoles.push('User');
          break;
        case 8:
          importantRoles.push('Supporter');
          break;
        case 15:
          importantRoles.push('Admin');
          break;
        // ไม่แสดง roles อื่นๆ
      }
    });

    // ถ้าไม่มี important roles แต่มี roles อื่น
    if (importantRoles.length === 0 && user.roles.length > 0) {
      return 'Other roles';
    }

    // ถ้าไม่มี roles เลย
    if (importantRoles.length === 0) {
      return 'No roles assigned';
    }

    return importantRoles.join(', ');
  }

  /**
   * Get user important roles as array - สำหรับการแสดงผลแบบ badges
   */
  getUserImportantRoles(user: UserAccountItem): Array<{name: string, type: string}> {
    if (!user.roles || user.roles.length === 0) {
      return [];
    }

    const importantRoles: Array<{name: string, type: string}> = [];
    
    // ตรวจสอบ role_ids และแสดงเฉพาะ roles ที่สำคัญพร้อม type สำหรับ styling
    user.roles.forEach(role => {
      switch (role.id) {
        case 1:
          importantRoles.push({name: 'User', type: 'user'});
          break;
        case 8:
          importantRoles.push({name: 'Supporter', type: 'supporter'});
          break;
        case 15:
          importantRoles.push({name: 'Admin', type: 'admin'});
          break;
        // ไม่แสดง roles อื่นๆ
      }
    });

    return importantRoles;
  }

  /**
   * Get role name by ID
   */
  getRoleName(roleId: number): string {
    const role = this.availableRoles.find(r => r.id === roleId);
    return role ? role.name : `Role ${roleId}`;
  }

  /**
   * Get formatted stats for display
   */
  getStatsDisplay(): {
    total: string;
    active: string;
    inactive: string;
    newThisMonth: string;
  } {
    return {
      total: this.userStats.total.toLocaleString(),
      active: this.userStats.active.toLocaleString(),
      inactive: this.userStats.inactive.toLocaleString(),
      newThisMonth: this.userStats.newThisMonth.toLocaleString()
    };
  }

  /**
   * Get permission required message
   */
  getPermissionRequiredMessage(): string {
    return 'ต้องมีสิทธิ์ "เพิ่มผู้ใช้" หรือ "ลบผู้ใช้" เพื่อดำเนินการนี้';
  }

  /**
   * Show permission denied message
   */
  private showPermissionDeniedMessage(action: string): void {
    const message = `You don't have permission to ${action}.\n\n${this.getPermissionRequiredMessage()}`;
    this.showNotification('error', message);
  }

  /**
   * Check if role is selected in form
   */
  isRoleSelected(roleId: number, formGroup?: FormGroup): boolean {
    const form = formGroup || this.userForm;
    const selectedRoles = form.get('role_id')?.value || [];
    return selectedRoles.includes(roleId);
  }

  /**
   * Toggle role selection
   */
  toggleRoleSelection(roleId: number, formGroup?: FormGroup): void {
    const form = formGroup || this.userForm;
    const roleControl = form.get('role_id');
    if (!roleControl) return;

    const currentRoles = roleControl.value || [];
    const isSelected = currentRoles.includes(roleId);

    if (isSelected) {
      // Remove role
      const updatedRoles = currentRoles.filter((id: number) => id !== roleId);
      roleControl.setValue(updatedRoles);
    } else {
      // Add role
      const updatedRoles = [...currentRoles, roleId];
      roleControl.setValue(updatedRoles);
    }

    // Mark as touched for validation
    roleControl.markAsTouched();
  }

  /**
   * Get selected role names
   */
  getSelectedRoleNames(formGroup?: FormGroup): string {
    const form = formGroup || this.userForm;
    const selectedRoleIds = form.get('role_id')?.value || [];
    
    if (selectedRoleIds.length === 0) {
      return 'No roles selected';
    }

    const roleNames = selectedRoleIds.map((id: number) => this.getRoleName(id));
    return roleNames.join(', ');
  }

  // ============ NOTIFICATION METHODS ============

  /**
   * Show notification message
   */
  private showNotification(type: NotificationMessage['type'], message: string, duration: number = 5000): void {
    this.notification = { type, message, duration };
    
    // Auto-clear notification after duration
    setTimeout(() => {
      this.clearNotification();
    }, duration);
  }

  /**
   * Clear current notification
   */
  clearNotification(): void {
    this.notification = null;
  }

  // ============ DATE FORMATTING METHODS ============

  /**
   * Format date for display
   */
  formatDate(dateString: string | undefined): string {
    if (!dateString) return 'N/A';

    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'N/A';

      return date.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      console.warn('Error formatting date:', dateString, error);
      return 'N/A';
    }
  }

  /**
   * Format datetime for display
   */
  formatDateTime(dateTimeString: string | undefined): string {
    if (!dateTimeString) return 'N/A';

    try {
      const date = new Date(dateTimeString);
      if (isNaN(date.getTime())) return 'N/A';

      return date.toLocaleString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      console.warn('Error formatting datetime:', dateTimeString, error);
      return 'N/A';
    }
  }
}