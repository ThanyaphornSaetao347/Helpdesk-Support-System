import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

// ✅ เพิ่ม imports ใหม่
import { AuthService } from '../../services/auth.service';
import { permissionEnum } from '../../models/permission.model';
import { PERMISSION_DIRECTIVES } from '../../directives/permission.directive';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [
    CommonModule, 
    RouterModule,
    ...PERMISSION_DIRECTIVES  // ✅ เพิ่ม directives
  ],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.css']
})
export class SidebarComponent implements OnInit {
  private router = inject(Router);

  // ✅ Inject AuthService
  protected authService = inject(AuthService);
  
  // ✅ Export permissionEnum เพื่อใช้ใน template
  protected readonly permissionEnum = permissionEnum;
  
  // State for dropdown menus
  isReportDropdownOpen = false;
  isSettingDropdownOpen = false;

  ngOnInit() {
    // Auto-open appropriate dropdown based on current route
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.updateDropdownState(event.urlAfterRedirects || event.url);
      });

    // Set initial dropdown state
    this.updateDropdownState(this.router.url);
  }

  /**
   * Update dropdown state based on current route
   */
  private updateDropdownState(url: string) {
    // Close all dropdowns first
    this.isReportDropdownOpen = false;
    this.isSettingDropdownOpen = false;

    // Open appropriate dropdown based on current route
    if (url.includes('/reports/')) {
      this.isReportDropdownOpen = true;
    } else if (url.includes('/settings/')) {
      this.isSettingDropdownOpen = true;
    }
  }

  /**
   * Toggle Report dropdown menu
   */
  toggleReportDropdown() {
    console.log('Toggling Report dropdown:', this.isReportDropdownOpen);
    this.isReportDropdownOpen = !this.isReportDropdownOpen;
    // Close other dropdowns
    if (this.isReportDropdownOpen) {
      this.isSettingDropdownOpen = false;
    }
  }

  /**
   * Toggle Setting dropdown menu
   */
  toggleSettingDropdown() {
    console.log('Toggling Setting dropdown:', this.isSettingDropdownOpen);
    this.isSettingDropdownOpen = !this.isSettingDropdownOpen;
    // Close other dropdowns
    if (this.isSettingDropdownOpen) {
      this.isReportDropdownOpen = false;
    }
  }

  /**
   * Close all dropdowns
   */
  closeAllDropdowns() {
    console.log('Closing all dropdowns');
    this.isReportDropdownOpen = false;
    this.isSettingDropdownOpen = false;
  }

  /**
   * Handle navigation and close dropdowns
   */
  navigateTo(route: string) {
    this.router.navigate([route]);
    this.closeAllDropdowns();
  }

  /**
   * Handle menu item click (prevents event bubbling)
   */
  onMenuItemClick(event: Event) {
    event.stopPropagation();
  }

  /**
   * Check if current route is active
   */
  isRouteActive(route: string): boolean {
    return this.router.url === route || this.router.url.startsWith(route + '/');
  }

  /**
   * Check if any child route is active (for parent menu highlighting)
   */
  isParentRouteActive(parentPath: string): boolean {
    return this.router.url.startsWith(parentPath);
  }

  /**
   * Check if settings route is active
   */
  isSettingsRouteActive(): boolean {
    const settingsRoutes = [
      '/settings/general',
      '/settings/user-account', 
      '/settings/project',
      '/settings/ticket-categories',
      '/settings/customers',
      '/settings/customer-for-project' // NEW: เพิ่มเส้นทางใหม่
    ];
    return settingsRoutes.some(route => this.router.url.startsWith(route));
  }

  /**
   * Check if reports route is active
   */
  isReportsRouteActive(): boolean {
    const reportsRoutes = [
      '/reports/weekly',
      '/reports/monthly', 
      '/reports/export'
    ];
    return reportsRoutes.some(route => this.router.url.startsWith(route));
  }
}