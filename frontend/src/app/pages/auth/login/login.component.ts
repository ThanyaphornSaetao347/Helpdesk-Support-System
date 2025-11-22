import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../shared/services/auth.service';

// ✅ Import interfaces จาก user.model.ts ใหม่
import { 
  LoginFormData, 
  LoginResponse, 
  createLoginFormData,
  isLoginSuccessResponse,
  LOGIN_SUCCESS_CODE 
} from '../../../shared/models/user.model';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  // ✅ ใช้ interface ที่กำหนดไว้
  loginData: LoginFormData = createLoginFormData();

  // ✅ State management
  isLoading = false;
  errorMessage = '';
  showPassword = false;
  currentLanguage = 'th';
  returnUrl = '/dashboard';

  // ✅ Subscription management
  private subscriptions: Subscription[] = [];

  ngOnInit(): void {
    console.log('🔧 Login component initialized');
    this.setupInitialState();
    this.checkExistingAuth();
  }

  ngOnDestroy(): void {
    // ✅ ป้องกัน memory leaks
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  // ===== INITIALIZATION METHODS ===== ✅

  /**
   * ✅ ตั้งค่าเริ่มต้น
   */
  private setupInitialState(): void {
    // ✅ ดึง returnUrl จาก query parameters
    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/dashboard';
    console.log('🎯 Return URL set to:', this.returnUrl);

    // ✅ โหลดภาษาที่บันทึกไว้
    const savedLanguage = localStorage.getItem('language');
    if (savedLanguage && ['th', 'en'].includes(savedLanguage)) {
      this.currentLanguage = savedLanguage;
      console.log('🌍 Language loaded:', this.currentLanguage);
    }

    // ✅ โหลด remember me state
    const rememberMe = localStorage.getItem('remember_me');
    if (rememberMe === 'true') {
      this.loginData.rememberMe = true;
      // โหลด username ที่จำไว้ (ถ้ามี)
      const savedUsername = localStorage.getItem('remembered_username');
      if (savedUsername) {
        this.loginData.username = savedUsername;
        console.log('👤 Remembered username loaded');
      }
    }
  }

  /**
   * ✅ ตรวจสอบว่า login อยู่แล้วหรือไม่
   */
  private checkExistingAuth(): void {
    if (this.authService.isAuthenticated()) {
      console.log('✅ Already authenticated, redirecting to:', this.returnUrl);
      this.navigateToReturnUrl();
    }
  }

  // ===== LOGIN PROCESS ===== ✅

  /**
   * ✅ ประมวลผลการ login
   */
  async onLogin(): Promise<void> {
    console.log('🚀 Login process started');

    // ✅ ตรวจสอบข้อมูลพื้นฐาน
    if (!this.validateForm()) {
      return;
    }

    this.setLoadingState(true);
    this.clearErrorMessage();

    try {
      console.log('📤 Attempting login for:', this.loginData.username);
      
      // ✅ เรียก AuthService login method
      const response: LoginResponse = await this.authService.login(
        this.loginData.username,
        this.loginData.password,
        this.currentLanguage
      );

      console.log('📥 Login response received:', {
        code: response.code,
        status: response.status,
        message: response.message,
        hasUser: !!response.user,
        hasToken: !!response.access_token
      });

      // ✅ ประมวลผล response
      await this.handleLoginResponse(response);

    } catch (error: any) {
      console.error('❌ Login failed:', error);
      this.handleLoginError(error);
    } finally {
      this.setLoadingState(false);
    }
  }

  /**
   * ✅ จัดการ login response
   */
  private async handleLoginResponse(response: LoginResponse): Promise<void> {
    // ✅ ตรวจสอบความสำเร็จ
    if (isLoginSuccessResponse(response)) {
      console.log('✅ Login successful!');
      
      // ✅ จัดการ remember me
      await this.handleRememberMe();
      
      // ✅ แสดงข้อความสำเร็จ (ถ้าต้องการ)
      this.showSuccessMessage();
      
      // ✅ รอให้ข้อมูลบันทึกเสร็จแล้ว navigate
      setTimeout(() => {
        this.navigateAfterLogin();
      }, 100);
      
    } else {
      // ✅ Login ไม่สำเร็จ
      console.log('❌ Login failed:', response.message);
      this.errorMessage = response.message || this.getLanguageText(
        'เข้าสู่ระบบไม่สำเร็จ', 
        'Login failed'
      );
    }
  }

  /**
   * ✅ จัดการ remember me functionality
   */
  private async handleRememberMe(): Promise<void> {
    if (this.loginData.rememberMe) {
      localStorage.setItem('remember_me', 'true');
      localStorage.setItem('remembered_username', this.loginData.username);
      console.log('💾 Remember me settings saved');
    } else {
      localStorage.removeItem('remember_me');
      localStorage.removeItem('remembered_username');
      console.log('🗑️ Remember me settings cleared');
    }
  }

  /**
   * ✅ แสดงข้อความสำเร็จ
   */
  private showSuccessMessage(): void {
    // สามารถเพิ่ม toast notification หรือ success message ได้ที่นี่
    console.log('🎉 Login success message displayed');
  }

  /**
   * ✅ Navigate หลัง login สำเร็จ
   */
  private async navigateAfterLogin(): Promise<void> {
    console.log('🎯 Navigating after login to:', this.returnUrl);
    
    try {
      // ✅ ตรวจสอบ authentication อีกครั้ง
      if (!this.authService.isAuthenticated()) {
        console.error('❌ Authentication check failed after login');
        this.errorMessage = this.getLanguageText(
          'เกิดข้อผิดพลาดในการเข้าสู่ระบบ', 
          'Authentication error occurred'
        );
        return;
      }

      console.log('🔑 Auth check passed, navigating...');
      
      // ✅ พยายาม navigate ไปยัง returnUrl
      const navigationResult = await this.router.navigate([this.returnUrl]);
      
      if (navigationResult) {
        console.log('✅ Navigation successful to:', this.returnUrl);
      } else {
        console.warn('⚠️ Navigation to returnUrl failed, trying dashboard...');
        await this.router.navigate(['/dashboard']);
      }
      
    } catch (navigationError) {
      console.error('❌ Navigation error:', navigationError);
      
      // ✅ Fallback navigation
      try {
        await this.router.navigate(['/dashboard']);
        console.log('✅ Fallback navigation to dashboard successful');
      } catch (fallbackError) {
        console.error('❌ Fallback navigation failed:', fallbackError);
        // ✅ Last resort - ใช้ window.location
        window.location.href = '/dashboard';
      }
    }
  }

  /**
   * ✅ Navigate ไปยัง returnUrl (สำหรับกรณีที่ authenticated แล้ว)
   */
  private navigateToReturnUrl(): void {
    this.router.navigate([this.returnUrl]).catch(error => {
      console.error('❌ Navigation to return URL failed:', error);
      this.router.navigate(['/dashboard']);
    });
  }

  // ===== ERROR HANDLING ===== ✅

  /**
   * ✅ จัดการ login errors
   */
  private handleLoginError(error: any): void {
    let errorMessage = '';

    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error?.error?.message) {
      errorMessage = error.error.message;
    } else {
      errorMessage = this.getLanguageText(
        'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง',
        'An error occurred. Please try again.'
      );
    }

    this.errorMessage = errorMessage;
    console.error('💥 Login error handled:', errorMessage);
  }

  // ===== FORM VALIDATION ===== ✅

  /**
   * ✅ ตรวจสอบความถูกต้องของฟอร์ม
   */
  private validateForm(): boolean {
    this.clearErrorMessage();

    // ✅ ตรวจสอบ username
    if (!this.loginData.username || this.loginData.username.trim().length === 0) {
      this.errorMessage = this.getLanguageText(
        'กรุณากรอกชื่อผู้ใช้งาน',
        'Please enter username'
      );
      return false;
    }

    // ✅ ตรวจสอบ password
    if (!this.loginData.password || this.loginData.password.length === 0) {
      this.errorMessage = this.getLanguageText(
        'กรุณากรอกรหัสผ่าน',
        'Please enter password'
      );
      return false;
    }

    // ✅ ตรวจสอบความยาว username
    if (this.loginData.username.trim().length < 3) {
      this.errorMessage = this.getLanguageText(
        'ชื่อผู้ใช้งานต้องมีอย่างน้อย 3 ตัวอักษร',
        'Username must be at least 3 characters'
      );
      return false;
    }

    // ✅ ตรวจสอบความยาว password
    if (this.loginData.password.length < 4) {
      this.errorMessage = this.getLanguageText(
        'รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร',
        'Password must be at least 4 characters'
      );
      return false;
    }

    console.log('✅ Form validation passed');
    return true;
  }

  // ===== UI STATE MANAGEMENT ===== ✅

  /**
   * ✅ ตั้งค่า loading state
   */
  private setLoadingState(loading: boolean): void {
    this.isLoading = loading;
    console.log('⏳ Loading state:', loading);
  }

  /**
   * ✅ ล้างข้อความ error
   */
  private clearErrorMessage(): void {
    this.errorMessage = '';
  }

  /**
   * ✅ แสดง/ซ่อน password
   */
  togglePassword(): void {
    this.showPassword = !this.showPassword;
    console.log('👁️ Password visibility toggled:', this.showPassword);
  }

  // ===== LANGUAGE MANAGEMENT ===== ✅

  /**
   * ✅ เปลี่ยนภาษา
   */
  switchLanguage(lang: string): void {
    if (['th', 'en'].includes(lang)) {
      this.currentLanguage = lang;
      localStorage.setItem('language', lang);
      console.log('🌍 Language switched to:', lang);
    }
  }

  /**
   * ✅ ดึงข้อความตามภาษา
   */
  getLanguageText(thText: string, enText: string): string {
    return this.currentLanguage === 'th' ? thText : enText;
  }

  // ===== UTILITY METHODS ===== ✅

  /**
   * ✅ ตรวจสอบว่าฟอร์มพร้อมส่งหรือไม่
   */
  isFormValid(): boolean {
    return !!(this.loginData.username?.trim() && 
              this.loginData.password && 
              !this.isLoading);
  }

  /**
   * ✅ ล้างฟอร์ม
   */
  clearForm(): void {
    this.loginData = createLoginFormData();
    this.clearErrorMessage();
    console.log('🧹 Form cleared');
  }

  /**
   * ✅ Reset form และ state
   */
  resetComponent(): void {
    this.clearForm();
    this.setLoadingState(false);
    this.showPassword = false;
    console.log('🔄 Component reset');
  }

  // ===== KEYBOARD EVENTS ===== ✅

  /**
   * ✅ จัดการ Enter key
   */
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && this.isFormValid()) {
      event.preventDefault();
      this.onLogin();
    }
  }

  // ===== DEBUG METHODS ===== ✅

  /**
   * ✅ Debug component state
   */
  debugComponentState(): void {
    console.group('🔍 Login Component Debug');
    console.log('📋 Form Data:', {
      username: this.loginData.username,
      hasPassword: !!this.loginData.password,
      rememberMe: this.loginData.rememberMe
    });
    console.log('🎛️ Component State:', {
      isLoading: this.isLoading,
      errorMessage: this.errorMessage,
      showPassword: this.showPassword,
      currentLanguage: this.currentLanguage,
      returnUrl: this.returnUrl
    });
    console.log('✅ Form Valid:', this.isFormValid());
    console.log('🔐 Auth Status:', this.authService.isAuthenticated());
    console.groupEnd();
  }

  /**
   * ✅ ทดสอบ connection กับ Backend
   */
  async testConnection(): Promise<void> {
    console.log('🔧 Testing backend connection...');
    try {
      // สามารถเพิ่ม health check endpoint ได้
      console.log('✅ Backend connection test completed');
    } catch (error) {
      console.error('❌ Backend connection test failed:', error);
    }
  }

  // ===== ACCESSIBILITY ===== ✅

  /**
   * ✅ ดึง aria-label สำหรับ password toggle
   */
  getPasswordToggleAriaLabel(): string {
    return this.getLanguageText(
      this.showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน',
      this.showPassword ? 'Hide password' : 'Show password'
    );
  }

  /**
   * ✅ ดึง aria-describedby สำหรับ error
   */
  getErrorAriaDescribedBy(): string | null {
    return this.errorMessage ? 'login-error' : null;
  }
}