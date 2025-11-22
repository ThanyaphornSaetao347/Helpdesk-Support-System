import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Subject, takeUntil, catchError, of } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

import { ApiService } from '../../../shared/services/api.service';
import { AuthService } from '../../../shared/services/auth.service';
import { permissionEnum } from '../../../shared/models/permission.model';

// ============ INTERFACES ============
export interface CFPProjectData {
  project_id: number;
  project_name: string;
  project_status: boolean;
  customers: CFPCustomerData[];
}

export interface CFPCustomerData {
  customer_id: number;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  assigned_users: AssignedUser[];
  customer_count: number;
  user_count: number;
  open_ticket_count: number;
}

export interface AssignedUser {
  name: string;
  user_id: number;
  cfp_id?: number;
}

export interface ProjectItem {
  id: number;
  name: string;
  description?: string;
  status: 'active' | 'inactive';
  created_date: string;
  created_by: number;
  updated_date?: string;
  updated_by?: number;
  total_customers?: number;
  total_users?: number;
  total_open_tickets?: number;
}

@Component({
  selector: 'app-customer-for-projects',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './customer-for-project.component.html',
  styleUrls: ['./customer-for-project.component.css']
})
export class CustomerForProjectComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  // ============ COMPONENT STATE ============
  isLoading = false;
  hasError = false;
  errorMessage = '';

  // Search and filter
  projectSearchTerm = '';
  selectedStatusFilter = 'all';

  // Data arrays
  projects: ProjectItem[] = [];
  filteredProjects: ProjectItem[] = [];
  cfpData: CFPProjectData[] = [];

  // Options
  statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' }
  ];

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private apiService: ApiService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.loadCFPData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ============ DATA LOADING ============
  loadCFPData(): void {
    this.isLoading = true;
    this.hasError = false;

    this.apiService.get('customer-for-project/cfp-data')
      .pipe(
        takeUntil(this.destroy$),
        catchError(this.handleError.bind(this))
      )
      .subscribe({
        next: (response: any) => {
          this.isLoading = false;
          if (response?.status === 1 && response.data) {
            this.cfpData = response.data;
            this.transformCFPDataToProjects();
          }
          this.filterProjects();
        },
        error: () => {
          this.isLoading = false;
          this.filterProjects();
        }
      });
  }

  private transformCFPDataToProjects(): void {
    this.projects = this.cfpData.map(cfpProject => {
      const totalCustomers = cfpProject.customers.length;
      const totalUsers = cfpProject.customers.reduce((sum, c) => sum + c.user_count, 0);
      const totalOpenTickets = cfpProject.customers.reduce((sum, c) => sum + c.open_ticket_count, 0);

      return {
        id: cfpProject.project_id,
        name: cfpProject.project_name,
        description: `${totalCustomers} customer(s), ${totalUsers} user(s)`,
        status: cfpProject.project_status ? 'active' as const : 'inactive' as const,
        created_date: new Date().toISOString(),
        created_by: 1,
        total_customers: totalCustomers,
        total_users: totalUsers,
        total_open_tickets: totalOpenTickets
      };
    });
  }

  // ============ NAVIGATION ============
  navigateToProjectDetail(project: ProjectItem): void {
    this.router.navigate(['/settings/customer-for-project', project.id]);
  }

  // ============ FILTERING ============
  filterProjects(): void {
    const searchTerm = this.projectSearchTerm.toLowerCase();
    this.filteredProjects = this.projects.filter(project => {
      const matchesSearch = !searchTerm ||
        project.name.toLowerCase().includes(searchTerm) ||
        (project.description && project.description.toLowerCase().includes(searchTerm));

      const matchesStatus = this.selectedStatusFilter === 'all' ||
        project.status === this.selectedStatusFilter;

      return matchesSearch && matchesStatus;
    });
  }

  onProjectSearchChange(): void {
    this.filterProjects();
  }

  onStatusFilterChange(): void {
    this.filterProjects();
  }

  // ============ UTILITY METHODS ============
  getProjectAvatarLetter(projectName: string): string {
    return projectName ? projectName.charAt(0).toUpperCase() : '?';
  }

  getStatusBadgeClass(status: string): string {
    const statusMap: { [key: string]: string } = {
      active: 'status-active',
      inactive: 'status-inactive'
    };
    return statusMap[status.toLowerCase()] || 'status-default';
  }

  getTotalCustomers(): number {
    return this.projects.reduce((sum, project) => sum + (project.total_customers || 0), 0);
  }

  getTotalUsers(): number {
    return this.projects.reduce((sum, project) => sum + (project.total_users || 0), 0);
  }

  getTotalOpenTickets(): number {
    return this.projects.reduce((sum, project) => sum + (project.total_open_tickets || 0), 0);
  }

  formatDate(dateString: string | undefined): string {
    if (!dateString) return 'N/A';

    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'N/A';

      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      console.warn('Error formatting date:', dateString, error);
      return 'N/A';
    }
  }

  // ============ PERMISSION METHODS ============
  canManageProjects(): boolean {
    return this.authService.hasPermission(permissionEnum.MANAGE_PROJECT) || this.authService.isAdmin();
  }

  // ============ TRACK BY FUNCTIONS ============
  trackByProjectId(index: number, project: ProjectItem): number {
    return project.id;
  }

  // ============ ERROR HANDLING ============
  private handleError(error: HttpErrorResponse) {
    console.error('API Error:', error);
    this.hasError = true;
    this.errorMessage = 'Failed to load projects. Please try again.';

    if (error.status === 401) {
      this.authService.logout();
      this.router.navigate(['/login']);
    }

    return of(null);
  }

  private showSuccess(message: string): void {
    alert(message);
    console.log('Success:', message);
  }

  private showError(message: string): void {
    alert(message);
    console.error('Error:', message);
  }
}