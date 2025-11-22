import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Subject, takeUntil, catchError, of } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

// Services
import { ApiService } from '../../../shared/services/api.service';
import { AuthService } from '../../../shared/services/auth.service';

// Interfaces
export interface UserInfo {
  id: number;
  username: string;
  firstname: string;
  lastname: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;
}

export interface UpdateProfileDto {
  firstname: string;
  lastname: string;
  email: string;
  phone: string;
  current_password?: string;
  new_password?: string;
}

export interface NotificationMessage {
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number;
}

@Component({
  selector: 'app-my-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './my-profile.component.html',
  styleUrls: ['./my-profile.component.css']
})
export class MyProfileComponent implements OnInit, OnDestroy {

  private destroy$ = new Subject<void>();

  // Form and loading states
  userForm!: FormGroup;
  isSubmitting = false;

  // User information
  userInfo: UserInfo = {
    id: 0,
    username: '',
    firstname: '',
    lastname: '',
    fullName: '',
    email: '',
    phone: '',
    role: ''
  };

  // Notification
  notification: NotificationMessage | null = null;

  constructor(
    private router: Router,
    private apiService: ApiService,
    private authService: AuthService,
    private fb: FormBuilder
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    this.loadUserProfile();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Initialize profile form with validation
   */
  private initForm(): void {
    this.userForm = this.fb.group({
      username: [{ value: '', disabled: true }], // Username is read-only
      firstname: ['', [
        Validators.required,
        Validators.minLength(2),
        Validators.maxLength(50),
        Validators.pattern(/^[a-zA-ZÀ-ÿก-๙\s\-\.]+$/) // รองรับภาษาไทย
      ]],
      lastname: ['', [
        Validators.required,
        Validators.minLength(2),
        Validators.maxLength(50),
        Validators.pattern(/^[a-zA-ZÀ-ÿก-๙\s\-\.]+$/) // รองรับภาษาไทย
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
      // Password fields - all optional
      currentPassword: [''],
      newPassword: ['', [
        Validators.minLength(8),
        Validators.maxLength(50)
      ]],
      confirmPassword: ['']
    }, { validators: this.passwordMatchValidator });

    console.log('Profile form initialized');
  }

  /**
   * Custom validator to check if new password and confirm password match
   */
  private passwordMatchValidator(group: FormGroup): { [key: string]: boolean } | null {
    const newPassword = group.get('newPassword')?.value;
    const confirmPassword = group.get('confirmPassword')?.value;
    const currentPassword = group.get('currentPassword')?.value;

    // If trying to change password, current password is required
    if ((newPassword || confirmPassword) && !currentPassword) {
      group.get('currentPassword')?.setErrors({ required: true });
      return { currentPasswordRequired: true };
    }

    // If new password is provided, confirm password must match
    if (newPassword && newPassword !== confirmPassword) {
      group.get('confirmPassword')?.setErrors({ mismatch: true });
      return { passwordMismatch: true };
    }

    // Clear errors if validation passes
    if (newPassword === confirmPassword) {
      const confirmControl = group.get('confirmPassword');
      if (confirmControl?.hasError('mismatch')) {
        confirmControl.setErrors(null);
      }
    }

    return null;
  }

  /**
   * ✅ UPDATED: Load current user profile data from API with localStorage fallback
   * API: GET /api/users/:id
   * Response: { code: 1, status: "success", message: "...", data: {...} }
   */
  private loadUserProfile(): void {
    // Get current user from AuthService
    const currentUser = this.authService.getCurrentUser();
    
    if (!currentUser) {
      console.error('No user logged in');
      this.showNotification('error', 'Unable to load user profile. Please login again.');
      this.router.navigate(['/login']);
      return;
    }

    console.log('🔍 Current user data from AuthService (localStorage):', currentUser);

    // ✅ STRATEGY: Try API first, fallback to localStorage if API fails
    console.log(`📡 Attempting to load profile from API: GET /api/users/${currentUser.id}`);
    
    this.apiService.get(`users/${currentUser.id}`)
      .pipe(
        takeUntil(this.destroy$),
        catchError((error: HttpErrorResponse) => {
          console.warn('⚠️ API call failed, using localStorage data as fallback');
          console.error('API Error details:', error);
          
          // Show warning notification (not error, since we have fallback)
          this.showNotification('warning', 'Using cached profile data. Unable to fetch latest data from server.');
          
          // Fallback: Use data from localStorage
          this.loadUserProfileFromLocalStorage(currentUser);
          
          return of(null);
        })
      )
      .subscribe({
        next: (response: any) => {
          if (response) {
            console.log('✅ API Response received:', response);
            
            // ✅ Backend response structure: { code, status, message, data }
            if (response.status === 'success' && response.data) {
              console.log('📝 Processing API user data:', response.data);
              
              // Backend returns data with these fields:
              // - id, username, firstname, lastname, user_email, user_phone
              this.populateUserInfo(response.data);
              this.populateForm();
              
              console.log('✅ Profile loaded successfully from API');
            } else {
              console.warn('⚠️ API response format unexpected:', response);
              console.log('📦 Falling back to localStorage');
              this.loadUserProfileFromLocalStorage(currentUser);
            }
          } else {
            console.log('📦 API returned null, using localStorage');
            this.loadUserProfileFromLocalStorage(currentUser);
          }
        }
      });
  }

  /**
   * ✅ NEW: Load user profile from localStorage (AuthService)
   */
  private loadUserProfileFromLocalStorage(currentUser: any): void {
    console.log('📦 Loading profile from localStorage/AuthService');
    
    // Use AuthService methods for accurate role detection
    let userRole = 'User'; // Default
    
    // Try to get role from AuthService helper methods
    if (this.authService.isAdmin()) {
      userRole = 'Admin';
    } else if (this.authService.isSupporter()) {
      userRole = 'Supporter';
    } else if (this.authService.isUser()) {
      userRole = 'User';
    }
    
    // Fallback to getUserRoleName if AuthService methods don't work
    if (userRole === 'User' && currentUser.roles && currentUser.roles.length > 0) {
      const detectedRole = this.getUserRoleName(currentUser.roles);
      if (detectedRole !== 'User') {
        userRole = detectedRole;
      }
    }

    console.log('🔍 Detected user role:', userRole, 'from roles:', currentUser.roles);

    // ✅ Flexible field mapping - support multiple field name variations
    const firstname = currentUser.firstname || currentUser.first_name || '';
    const lastname = currentUser.lastname || currentUser.last_name || '';
    const email = currentUser.email || currentUser.user_email || '';
    const phone = currentUser.phone || currentUser.user_phone || '';

    this.userInfo = {
      id: currentUser.id || 0,
      username: currentUser.username || '',
      firstname: firstname,
      lastname: lastname,
      fullName: this.getFullName(firstname, lastname, currentUser.username),
      email: email,
      phone: phone,
      role: userRole
    };

    console.log('✅ User info populated from localStorage:', this.userInfo);

    // Populate form with user data
    this.populateForm();
    
    console.log('✅ User profile loaded from AuthService');
  }

  /**
   * Get full name from user data
   */
  private getFullName(firstname?: string, lastname?: string, username?: string): string {
    if (firstname || lastname) {
      return `${firstname || ''} ${lastname || ''}`.trim();
    }
    return username || 'User';
  }

  /**
   * ✅ FIXED: Get user role name from roles array with proper handling
   * Supports: role IDs (number), role names (string), and role objects
   */
  private getUserRoleName(roles: any[]): string {
    if (!roles || roles.length === 0) {
      console.warn('No roles provided, defaulting to User');
      return 'User';
    }

    console.log('🔍 Getting role name from:', roles);

    // Priority: Admin (15) > Supporter (8) > User (1)
    for (const role of roles) {
      // Case 1: Role is a number (role ID)
      if (typeof role === 'number') {
        if (role === 15) return 'Admin';
        if (role === 8) return 'Supporter';
        if (role === 1) return 'User';
      }
      // Case 2: Role is a string (role name)
      else if (typeof role === 'string') {
        const roleLower = role.toLowerCase();
        if (roleLower === 'admin') return 'Admin';
        if (roleLower === 'supporter') return 'Supporter';
        if (roleLower === 'user') return 'User';
      }
      // Case 3: Role is an object with id property
      else if (typeof role === 'object' && role !== null) {
        if (role.id === 15 || role.name?.toLowerCase() === 'admin') return 'Admin';
        if (role.id === 8 || role.name?.toLowerCase() === 'supporter') return 'Supporter';
        if (role.id === 1 || role.name?.toLowerCase() === 'user') return 'User';
      }
    }

    // Default fallback
    console.warn('Could not determine role from:', roles);
    return 'User';
  }

  /**
   * ✅ UPDATED: Populate user info from API response with flexible field mapping
   * Backend API returns: { id, username, firstname, lastname, user_email, user_phone }
   * Note: Backend does NOT include roles in this response
   */
  private populateUserInfo(data: any): void {
    console.log('📝 Populating user info from API data:', data);
    
    // Backend uses: user_email, user_phone (with underscore)
    const firstname = data.firstname || data.first_name || '';
    const lastname = data.lastname || data.last_name || '';
    const email = data.user_email || data.email || '';  // ✅ Changed: Try user_email first
    const phone = data.user_phone || data.phone || '';  // ✅ Changed: Try user_phone first
    
    // ✅ Get role from AuthService since backend doesn't include it in this endpoint
    let userRole = 'User'; // Default
    if (this.authService.isAdmin()) {
      userRole = 'Admin';
    } else if (this.authService.isSupporter()) {
      userRole = 'Supporter';
    } else if (this.authService.isUser()) {
      userRole = 'User';
    }
    
    // If backend includes roles, use it (for future compatibility)
    if (data.roles && Array.isArray(data.roles) && data.roles.length > 0) {
      userRole = this.getUserRoleName(data.roles);
    }
    
    this.userInfo = {
      id: data.id,
      username: data.username,
      firstname: firstname,
      lastname: lastname,
      fullName: this.getFullName(firstname, lastname, data.username),
      email: email,
      phone: phone,
      role: userRole
    };
    
    console.log('✅ User info populated from API:', this.userInfo);
  }

  /**
   * ✅ UPDATED: Populate form with user data with debug logging
   */
  private populateForm(): void {
    console.log('📝 Populating form with user info:', this.userInfo);
    
    const formData = {
      username: this.userInfo.username,
      firstname: this.userInfo.firstname,
      lastname: this.userInfo.lastname,
      email: this.userInfo.email,
      phone: this.userInfo.phone
    };
    
    console.log('📝 Form data to populate:', formData);
    
    // Populate form
    this.userForm.patchValue(formData);
    
    // Mark form as pristine after setting values
    this.userForm.markAsPristine();
    
    console.log('✅ Form populated. Current form values:', this.userForm.value);
    console.log('✅ Form controls status:', {
      username: this.userForm.get('username')?.value,
      firstname: this.userForm.get('firstname')?.value,
      lastname: this.userForm.get('lastname')?.value,
      email: this.userForm.get('email')?.value,
      phone: this.userForm.get('phone')?.value
    });
  }

  /**
   * Get user initial for avatar
   */
  getUserInitial(): string {
    if (this.userInfo.firstname) {
      return this.userInfo.firstname.charAt(0).toUpperCase();
    }
    if (this.userInfo.username) {
      return this.userInfo.username.charAt(0).toUpperCase();
    }
    return 'U';
  }

  /**
   * Handle change photo button click
   */
  onChangePhoto(): void {
    // Implement photo change functionality
    console.log('Change photo clicked');
    this.showNotification('info', 'Photo change functionality coming soon!');
  }

  /**
   * Handle form submission
   */
  onSubmit(): void {
    if (this.userForm.invalid) {
      this.markFormGroupTouched(this.userForm);
      this.showNotification('error', 'Please fill in all required fields correctly');
      return;
    }

    this.isSubmitting = true;

    const formValue = this.userForm.getRawValue(); // getRawValue includes disabled fields

    // Prepare update data
    const updateData: UpdateProfileDto = {
      firstname: formValue.firstname,
      lastname: formValue.lastname,
      email: formValue.email,
      phone: formValue.phone
    };

    // Add password fields if provided
    if (formValue.currentPassword && formValue.newPassword) {
      updateData.current_password = formValue.currentPassword;
      updateData.new_password = formValue.newPassword;
    }

    this.updateUserProfile(updateData);
  }

  /**
   * Update user profile via API
   */
  private updateUserProfile(data: UpdateProfileDto): void {
    console.log('Updating profile with data:', data);

    // ✅ OPTION 1: Use API (uncomment when API is ready)
    /*
    this.apiService.put(`users/${this.userInfo.id}/profile`, data)
      .pipe(
        takeUntil(this.destroy$),
        catchError((error: HttpErrorResponse) => {
          console.error('Error updating profile:', error);
          this.showNotification('error', this.getErrorMessage(error));
          this.isSubmitting = false;
          return of(null);
        })
      )
      .subscribe({
        next: (response: any) => {
          if (response) {
            this.handleUpdateSuccess(response);
          }
        }
      });
    */

    // ✅ OPTION 2: Simulate API call (for testing without backend)
    setTimeout(() => {
      this.isSubmitting = false;
      this.showNotification('success', 'Profile updated successfully!');
      
      // Update local user info
      this.userInfo.firstname = data.firstname;
      this.userInfo.lastname = data.lastname;
      this.userInfo.email = data.email;
      this.userInfo.phone = data.phone;
      this.userInfo.fullName = `${data.firstname} ${data.lastname}`;

      // Clear password fields
      this.userForm.patchValue({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });

      // ✅ FIXED: Update localStorage instead of calling updateCurrentUser
      this.updateLocalUserData(data);
      
      console.log('✅ Profile updated successfully');
    }, 1000);
  }

  /**
   * ✅ NEW: Update user data in localStorage
   */
  private updateLocalUserData(data: UpdateProfileDto): void {
    try {
      // Get current user from localStorage
      const currentUserJson = localStorage.getItem('currentUser');
      if (currentUserJson) {
        const currentUser = JSON.parse(currentUserJson);
        
        // Update user data
        currentUser.firstname = data.firstname;
        currentUser.lastname = data.lastname;
        currentUser.email = data.email;
        currentUser.phone = data.phone;
        
        // Save back to localStorage
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        
        console.log('✅ User data updated in localStorage');
        
        // Trigger auth state update (if AuthService has this method)
        // this.authService.refreshUserData();
      }
    } catch (error) {
      console.error('Error updating localStorage:', error);
    }
  }

  /**
   * Handle successful profile update
   */
  private handleUpdateSuccess(response: any): void {
    this.isSubmitting = false;
    this.showNotification('success', 'Profile updated successfully!');

    // Reload user data
    this.loadUserProfile();

    // Clear password fields
    this.userForm.patchValue({
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    });
  }

  /**
   * Get error message from HTTP error response
   */
  private getErrorMessage(error: HttpErrorResponse): string {
    if (error.error?.message) {
      return error.error.message;
    }
    if (error.status === 401) {
      return 'Current password is incorrect';
    }
    if (error.status === 400) {
      return 'Invalid data provided';
    }
    return 'Failed to update profile. Please try again.';
  }

  /**
   * Mark all form fields as touched to show validation errors
   */
  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();

      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }

  /**
   * Check if a form field is invalid and touched
   */
  isFieldInvalid(fieldName: string): boolean {
    const field = this.userForm.get(fieldName);
    return !!(field && field.invalid && (field.dirty || field.touched));
  }

  /**
   * Get error message for a form field
   */
  getFieldError(fieldName: string): string {
    const field = this.userForm.get(fieldName);
    
    if (!field || !field.errors) {
      return '';
    }

    const errors = field.errors;

    if (errors['required']) {
      return 'This field is required';
    }
    if (errors['email']) {
      return 'Please enter a valid email address';
    }
    if (errors['minlength']) {
      const minLength = errors['minlength'].requiredLength;
      return `Minimum ${minLength} characters required`;
    }
    if (errors['maxlength']) {
      const maxLength = errors['maxlength'].requiredLength;
      return `Maximum ${maxLength} characters allowed`;
    }
    if (errors['pattern']) {
      if (fieldName === 'phone') {
        return 'Please enter a valid phone number';
      }
      if (fieldName === 'email') {
        return 'Please enter a valid email address';
      }
      if (fieldName === 'firstname' || fieldName === 'lastname') {
        return 'Only letters, spaces, hyphens, and dots allowed';
      }
      return 'Invalid format';
    }
    if (errors['mismatch']) {
      return 'Passwords do not match';
    }

    return 'Invalid value';
  }

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
}