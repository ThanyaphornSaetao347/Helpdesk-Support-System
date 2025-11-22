import { Component, OnInit, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { ApiService, MasterFilterCategory, MasterFilterProject, AllTicketData } from '../../../shared/services/api.service';
import { AuthService } from '../../../shared/services/auth.service';
import { permissionEnum, UserRole, ROLES } from '../../../shared/models/permission.model';
import { UserWithPermissions } from '../../../shared/models/user.model';
import { HasPermissionDirective, HasRoleDirective } from '../../../shared/directives/permission.directive';
import { saveAs } from 'file-saver';

@Component({
  selector: 'app-ticket-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ticket-list.component.html',
  styleUrls: ['./ticket-list.component.css']
})
export class TicketListComponent implements OnInit, OnDestroy {

  private apiService = inject(ApiService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  // Permission Enums
  readonly permissionEnum = permissionEnum;
  readonly ROLES = ROLES;

  // User and Permission Data
  currentUser: UserWithPermissions | null = null;
  userPermissions: permissionEnum[] = [];
  userRoles: UserRole[] = [];

  // View Mode Configuration
  viewMode: 'all' | 'own-only' = 'all';
  canViewAllTickets = false;
  canViewOwnTickets = false;
  canCreateTickets = false;
  canManageTickets = false;

  // Ticket Data
  tickets: AllTicketData[] = [];
  filteredTickets: AllTicketData[] = [];
  isLoading = false;
  ticketsError = '';
  noTicketsFound = false;

  // Pagination state
  pagination = {
    currentPage: 1,
    perPage: 25, // ✅ เปลี่ยนจาก 10 เป็น 25 ให้ตรงกับ Backend
    totalRows: 0,
    totalPages: 1
  };

  // Filter Data
  categories: MasterFilterCategory[] = [];
  projects: MasterFilterProject[] = [];
  statuses: { id: number; name: string }[] = [];
  loadingFilters = false;
  filterError = '';

  // Status Management
  statusCacheLoaded = false;
  isLoadingStatuses = false;
  statusError = '';

  // Filter Values
  selectedPriority: string = '';
  selectedStatus: string = '';
  selectedCategory: string = '';
  selectedProject: string = '';
  searchText: string = '';

  // Search timeout for debouncing
  private searchTimeout: any = null;

  // Priority Options - ✅ แก้ให้ถูกต้อง: 1=Low, 2=Medium, 3=High
  priorityOptions = [
    { value: '', label: 'All Priority' },
    { value: '3', label: 'High' },
    { value: '2', label: 'Medium' },
    { value: '1', label: 'Low' }
  ];

  // Status Options
  statusOptions = [
    { value: '', label: 'All Status' },
    { value: '1', label: 'Pending' },
    { value: '2', label: 'Open Ticket' },
    { value: '3', label: 'In Progress' },
    { value: '4', label: 'Resolved' },
    { value: '5', label: 'Complete' },
    { value: '6', label: 'Cancel' }
  ];

  ngOnInit(): void {
    console.log('🎫 TicketListComponent initialized');

    this.loadStatuses();
    this.loadUserData();
    this.determineViewMode();
    this.checkPermissions();
    this.loadStatusCache();
    this.loadMasterFilters();
    this.loadTickets();
  }

  ngOnDestroy(): void {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
  }

  // ===== USER DATA & PERMISSIONS =====

  private loadUserData(): void {
    this.currentUser = this.authService.getCurrentUserWithPermissions();
    this.userPermissions = this.authService.getUserPermissions();
    this.userRoles = this.authService.getUserRoles();

    console.log('👤 User data loaded:', {
      username: this.currentUser?.username,
      permissions: this.userPermissions.length,
      roles: this.userRoles,
      primaryRole: this.authService.getPrimaryRole()
    });
  }

  private determineViewMode(): void {
    const routeViewMode = this.route.snapshot.data['viewMode'];
    if (routeViewMode === 'own-only') {
      this.viewMode = 'own-only';
      console.log('📋 View mode set to: own-only (from route data)');
    } else {
      if (this.authService.hasPermission(permissionEnum.VIEW_ALL_TICKETS)) {
        this.viewMode = 'all';
        console.log('📋 View mode set to: all (has VIEW_ALL_TICKETS permission)');
      } else if (this.authService.hasPermission(permissionEnum.VIEW_OWN_TICKETS)) {
        this.viewMode = 'own-only';
        console.log('📋 View mode set to: own-only (has VIEW_OWN_TICKETS permission only)');
      } else {
        console.warn('⚠️ User has no ticket viewing permissions');
        this.viewMode = 'own-only';
      }
    }
  }

  private checkPermissions(): void {
    this.canViewAllTickets = this.authService.hasPermission(permissionEnum.VIEW_ALL_TICKETS);
    this.canViewOwnTickets = this.authService.hasPermission(permissionEnum.VIEW_OWN_TICKETS);
    this.canCreateTickets = this.authService.hasPermission(permissionEnum.CREATE_TICKET);
    this.canManageTickets = this.authService.canManageTickets();

    console.log('🔍 Permission check results:', {
      canViewAllTickets: this.canViewAllTickets,
      canViewOwnTickets: this.canViewOwnTickets,
      canCreateTickets: this.canCreateTickets,
      canManageTickets: this.canManageTickets,
      viewMode: this.viewMode
    });

    if (!this.canViewAllTickets && !this.canViewOwnTickets) {
      console.error('❌ User has no ticket viewing permissions, redirecting to dashboard');
      this.router.navigate(['/dashboard']);
      return;
    }
  }

  // ===== PERMISSION HELPER METHODS =====

  hasPermission(permission: permissionEnum): boolean {
    return this.authService.hasPermission(permission);
  }

  hasRole(role: UserRole): boolean {
    return this.authService.hasRole(role);
  }

  hasAnyRole(roles: UserRole[]): boolean {
    return this.authService.hasAnyRole(roles);
  }

  canEditTicket(ticket: AllTicketData): boolean {
    if (this.hasAnyRole([ROLES.ADMIN, ROLES.SUPPORTER])) {
      return this.hasPermission(permissionEnum.EDIT_TICKET) ||
        this.hasPermission(permissionEnum.CHANGE_STATUS);
    }

    if (this.hasRole(ROLES.USER)) {
      return this.hasPermission(permissionEnum.EDIT_TICKET) &&
        ticket.create_by === this.currentUser?.id;
    }

    return false;
  }

  canDeleteTicket(ticket: AllTicketData): boolean {
    if (this.hasRole(ROLES.ADMIN)) {
      return this.hasPermission(permissionEnum.DELETE_TICKET);
    }

    if (this.hasRole(ROLES.USER)) {
      return this.hasPermission(permissionEnum.DELETE_TICKET) &&
        ticket.create_by === this.currentUser?.id &&
        ticket.status_id === 1;
    }

    return false;
  }

  canChangeStatus(ticket: AllTicketData): boolean {
    return this.hasPermission(permissionEnum.CHANGE_STATUS) &&
      this.hasAnyRole([ROLES.ADMIN, ROLES.SUPPORTER]);
  }

  canAssignTicket(ticket: AllTicketData): boolean {
    return this.hasPermission(permissionEnum.ASSIGNEE) &&
      this.hasAnyRole([ROLES.ADMIN, ROLES.SUPPORTER]);
  }

  canReplyToTicket(ticket: AllTicketData): boolean {
    return this.hasPermission(permissionEnum.REPLY_TICKET) &&
      this.hasAnyRole([ROLES.ADMIN, ROLES.SUPPORTER]);
  }

  canSolveProblem(ticket: AllTicketData): boolean {
    return this.hasPermission(permissionEnum.SOLVE_PROBLEM) &&
      this.hasAnyRole([ROLES.ADMIN, ROLES.SUPPORTER]);
  }

  canRateSatisfaction(ticket: AllTicketData): boolean {
    return this.hasPermission(permissionEnum.SATISFACTION) &&
      ticket.create_by === this.currentUser?.id &&
      ticket.status_id === 5;
  }

  // ===== DATA LOADING =====

  private loadStatusCache(): void {
    console.log('=== Loading Status Cache ===');

    if (this.apiService.isStatusCacheLoaded()) {
      this.statusCacheLoaded = true;
      console.log('✅ Status cache already loaded');
      return;
    }

    this.isLoadingStatuses = true;
    this.statusError = '';

    this.apiService.loadAndCacheStatuses().subscribe({
      next: (success) => {
        if (success) {
          this.statusCacheLoaded = true;
          console.log('✅ Status cache loaded successfully');
        } else {
          console.warn('Status cache loading failed, using defaults');
          this.statusError = 'ไม่สามารถโหลดข้อมูลสถานะได้';
        }
        this.isLoadingStatuses = false;
      },
      error: (error) => {
        console.error('❌ Error loading status cache:', error);
        this.statusError = 'เกิดข้อผิดพลาดในการโหลดสถานะ';
        this.isLoadingStatuses = false;
      }
    });
  }

  private loadStatuses(): void {
    this.statuses = [
      { id: 1, name: 'Pending' },
      { id: 2, name: 'Open Ticket' },
      { id: 3, name: 'In Progress' },
      { id: 4, name: 'Resolved' },
      { id: 5, name: 'Complete' },
      { id: 6, name: 'Cancel' }
    ];
  }

  private loadTickets(page: number = 1): void {
    console.log(`=== Loading Tickets (page=${page}) ===`);
    console.log('🎯 Current filters:', {
      searchText: this.searchText,
      selectedPriority: this.selectedPriority,
      selectedStatus: this.selectedStatus,
      selectedProject: this.selectedProject,
      selectedCategory: this.selectedCategory
    });

    this.isLoading = true;
    this.ticketsError = '';
    this.noTicketsFound = false;

    const params: any = {
      page,
      perPage: 25
    };

    if (this.searchText && this.searchText.trim()) {
      params.search = this.searchText.trim();
    }
    if (this.selectedPriority) {
      params.priority = Number(this.selectedPriority);
    }
    if (this.selectedStatus) {
      params.status_id = Number(this.selectedStatus);
    }
    if (this.selectedCategory) {
      params.category_id = Number(this.selectedCategory);
      params.categories_id = Number(this.selectedCategory);
    }
    if (this.selectedProject) {
      params.project_id = Number(this.selectedProject);
    }

    console.log('📤 Sending params to API:', params);

    this.apiService.getAllTickets(params).subscribe({
      next: (res: any) => {
        console.log('✅ Response from backend:', res);

        if (res?.success && Array.isArray(res.data)) {
          // ✅ ใช้ข้อมูลจาก Backend โดยตรง (Backend filter แล้ว)
          const allTickets = [...res.data];

          this.tickets = allTickets;
          this.filteredTickets = allTickets;

          // ✅ ใช้ pagination จาก Backend เสมอ
          // Backend รู้จำนวนข้อมูลทั้งหมดที่ตรงกับ filter
          this.pagination = res.pagination ? {
            currentPage: res.pagination.currentPage || page,
            perPage: res.pagination.perPage || 25,
            totalRows: res.pagination.totalRows || allTickets.length,
            totalPages: res.pagination.totalPages || 1
          } : {
            currentPage: page,
            perPage: 25,
            totalRows: allTickets.length,
            totalPages: Math.ceil(allTickets.length / 25)
          };

          this.noTicketsFound = allTickets.length === 0 && this.pagination.totalRows === 0;

          console.log('📦 Final tickets:', allTickets.length);
          console.log('📊 Pagination:', this.pagination);
          console.log('📍 Total rows:', this.pagination.totalRows);
          console.log('📄 Total pages:', this.pagination.totalPages);
        } else {
          this.tickets = [];
          this.filteredTickets = [];
          this.noTicketsFound = true;
          console.warn('⚠️ Invalid response structure:', res);
        }

        this.isLoading = false;
      },
      error: (error) => {
        console.error('❌ Error loading tickets:', error);
        this.ticketsError = typeof error === 'string'
          ? error
          : 'เกิดข้อผิดพลาดในการโหลดตั๋ว';
        this.isLoading = false;
        this.noTicketsFound = true;
      }
    });
  }

  private filterTicketsLocally(tickets: AllTicketData[]): AllTicketData[] {
    let filtered = [...tickets];

    console.log('🔍 Filtering tickets locally...');
    console.log('Before filter:', filtered.length);

    // ✅ เช็คว่ามี filter อะไรบ้าง
    const hasFilters = this.selectedPriority || this.selectedStatus ||
      this.selectedCategory || this.selectedProject ||
      this.searchText?.trim();

    if (!hasFilters) {
      console.log('⚠️ No filters applied, returning all tickets');
      return filtered;
    }

    if (this.selectedPriority && this.selectedPriority.trim()) {
      const beforeCount = filtered.length;
      const selectedPriorityNum = Number(this.selectedPriority);

      filtered = filtered.filter(ticket => {
        const ticketPriorityNum = Number(ticket.priority_id);
        return ticketPriorityNum === selectedPriorityNum;
      });

      console.log(`🎯 Priority filter (${this.selectedPriority}): ${filtered.length} of ${beforeCount}`);
    }

    if (this.selectedStatus && this.selectedStatus.trim()) {
      const beforeCount = filtered.length;
      const statusId = Number(this.selectedStatus);
      filtered = filtered.filter(ticket => ticket.status_id === statusId);
      console.log(`📊 Status filter (${statusId}): ${filtered.length} of ${beforeCount}`);
    }

    if (this.selectedCategory && this.selectedCategory.trim()) {
      const beforeCount = filtered.length;
      const categoryId = Number(this.selectedCategory);
      filtered = filtered.filter(ticket => ticket.categories_id === categoryId);
      console.log(`🏷️ Category filter (${categoryId}): ${filtered.length} of ${beforeCount}`);
    }

    if (this.selectedProject && this.selectedProject.trim()) {
      const beforeCount = filtered.length;
      const projectId = Number(this.selectedProject);
      filtered = filtered.filter(ticket => ticket.project_id === projectId);
      console.log(`📁 Project filter (${projectId}): ${filtered.length} of ${beforeCount}`);
    }

    if (this.searchText && this.searchText.trim()) {
      const beforeCount = filtered.length;
      const searchLower = this.searchText.trim().toLowerCase();
      filtered = filtered.filter(ticket => {
        const anyTicket = ticket as any;
        const matchTicketNo = ticket.ticket_no?.toLowerCase().includes(searchLower) || false;
        const matchDescription = ticket.issue_description?.toLowerCase().includes(searchLower) || false;
        const matchProject = ticket.project_name?.toLowerCase().includes(searchLower) || false;
        const matchCategory = ticket.categories_name?.toLowerCase().includes(searchLower) || false;
        // ✅ ค้นหาจาก field "name" ด้วย
        const matchUserName = anyTicket.name?.toLowerCase().includes(searchLower) || false;
        const matchUser = ticket.user_name?.toLowerCase().includes(searchLower) || false;

        return matchTicketNo || matchDescription || matchProject || matchUserName || matchUser || matchCategory;
      });
      console.log(`🔍 Search filter ("${searchLower}"): ${filtered.length} of ${beforeCount}`);
    }

    console.log('After all filters:', filtered.length);
    return filtered;
  }

  changePage(page: number): void {
    if (!this.pagination) return;
    if (page < 1 || page > this.pagination.totalPages) return;
    if (page === this.pagination.currentPage) return;

    console.log('➡️ Changing to page:', page);
    this.loadTickets(page);
  }

  getDisplayedPages(): (number | string)[] {
    const total = this.pagination?.totalPages || 1;
    const current = this.pagination?.currentPage || 1;
    const delta = 2;
    const range: (number | string)[] = [];
    const pages: (number | string)[] = [];

    for (let i = Math.max(2, current - delta); i <= Math.min(total - 1, current + delta); i++) {
      range.push(i);
    }

    if (current - delta > 2) {
      pages.push(1, '...');
    } else {
      for (let i = 1; i < Math.max(2, current - delta); i++) {
        pages.push(i);
      }
    }

    pages.push(...range);

    if (current + delta < total - 1) {
      pages.push('...', total);
    } else {
      for (let i = Math.min(total - 1, current + delta) + 1; i <= total; i++) {
        pages.push(i);
      }
    }

    return pages;
  }

  private filterTicketsByPermission(tickets: AllTicketData[]): AllTicketData[] {
    if (this.viewMode === 'all' && this.canViewAllTickets) {
      return tickets;
    } else if (this.canViewOwnTickets && this.currentUser) {
      return tickets.filter(ticket => ticket.create_by === this.currentUser!.id);
    } else {
      console.warn('⚠️ User has no permission to view tickets');
      return [];
    }
  }

  loadMasterFilters(): void {
    this.loadingFilters = true;
    this.filterError = '';

    this.apiService.getAllMasterFilter().subscribe({
      next: (response) => {
        console.log('Master filter response:', response);

        const resData = response.data?.data;

        if (response.data?.code === 1 && resData) {
          this.categories = resData.categories ?? [];
          this.projects = resData.projects ?? [];

          console.log('Categories loaded:', this.categories.length);
          console.log('Projects loaded:', this.projects.length);
        } else {
          this.filterError = response.data?.message || 'ไม่สามารถโหลดข้อมูล filter ได้';
        }

        this.loadingFilters = false;
      },
      error: (error) => {
        console.error('Error loading master filters:', error);
        this.filterError = typeof error === 'string'
          ? error
          : 'เกิดข้อผิดพลาดในการโหลดข้อมูล filter';
        this.loadingFilters = false;
      }
    });
  }

  // ===== SEARCH & FILTER METHODS =====

  onPriorityChangeModel(value: string): void {
    console.log('🎯 Priority changed via ngModel:', value);
    this.applyFilters();
  }

  onStatusChangeModel(value: string): void {
    console.log('📊 Status changed via ngModel:', value);
    this.applyFilters();
  }

  onCategoryChangeModel(value: string): void {
    console.log('🏷️ Category changed via ngModel:', value);
    this.applyFilters();
  }

  onProjectChangeModel(value: string): void {
    console.log('📁 Project changed via ngModel:', value);
    this.applyFilters();
  }

  applyFilters(): void {
    console.log('🎯 Applying filters - reloading from API');
    console.log('Current filter values:', {
      searchText: this.searchText,
      selectedPriority: this.selectedPriority,
      selectedStatus: this.selectedStatus,
      selectedProject: this.selectedProject,
      selectedCategory: this.selectedCategory
    });

    this.loadTickets(1);
  }

  onSearchInput(event: any): void {
    this.searchText = event.target.value;
    console.log('🔍 Search input changed:', this.searchText);
  }

  onSearchChange(): void {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    this.searchTimeout = setTimeout(() => {
      console.log('🔍 Search triggered (debounced):', this.searchText);
      this.applyFilters();
    }, 300);
  }

  clearSearch(): void {
    this.searchText = '';
    console.log('🧹 Search cleared');
    this.applyFilters();
  }

  onPriorityChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const newValue = target.value;
    console.log('🎯 Priority changing from:', this.selectedPriority, 'to:', newValue);
    this.selectedPriority = newValue;

    setTimeout(() => {
      console.log('🎯 Priority value after update:', this.selectedPriority);
      this.applyFilters();
    }, 0);
  }

  onStatusChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const newValue = target.value;
    console.log('📊 Status changing from:', this.selectedStatus, 'to:', newValue);
    this.selectedStatus = newValue;

    setTimeout(() => {
      console.log('📊 Status value after update:', this.selectedStatus);
      this.applyFilters();
    }, 0);
  }

  onProjectChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const newValue = target.value;
    console.log('📁 Project changing from:', this.selectedProject, 'to:', newValue);
    this.selectedProject = newValue;

    setTimeout(() => {
      console.log('📁 Project value after update:', this.selectedProject);
      this.applyFilters();
    }, 0);
  }

  onCategoryChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const newValue = target.value;
    console.log('🏷️ Category changing from:', this.selectedCategory, 'to:', newValue);
    this.selectedCategory = newValue;

    setTimeout(() => {
      console.log('🏷️ Category value after update:', this.selectedCategory);
      this.applyFilters();
    }, 0);
  }

  clearFilters(): void {
    console.log('🧹 Clearing all filters');
    this.searchText = '';
    this.selectedPriority = '';
    this.selectedStatus = '';
    this.selectedProject = '';
    this.selectedCategory = '';

    this.loadTickets(1);
  }

  exportExcel(): void {
    console.log('📊 Exporting Excel with current filters');

    const filter = {
      search: this.searchText?.trim() || '',
      priority: this.selectedPriority || '',
      status: this.selectedStatus || '',
      category: this.selectedCategory || '',
      project: this.selectedProject || ''
    };

    console.log('Export filter:', filter);

    this.apiService.exportTicketsExcel(filter).subscribe({
      next: (blob: Blob) => {
        const fileName = `Helpdesk_Tickets_${new Date().toISOString().slice(0, 10)}.xlsx`;
        saveAs(blob, fileName);
        console.log('✅ Excel exported successfully:', fileName);
      },
      error: (err) => {
        console.error('❌ Export Excel failed:', err);
        alert('เกิดข้อผิดพลาดในการ Export Excel');
      }
    });
  }

  // ===== STATUS MANAGEMENT =====

  // ✅ เพิ่ม helper function สำหรับ normalize status name
  private normalizeStatusName(statusName: string): string {
    const normalized = statusName.toLowerCase().trim();

    // Map status names ที่อาจแตกต่างกัน
    const statusMap: { [key: string]: string } = {
      'created': 'Pending',
      'pending': 'Pending',
      'open': 'Open Ticket',
      'open ticket': 'Open Ticket',
      'in progress': 'In Progress',
      'progress': 'In Progress',
      'resolved': 'Resolved',
      'complete': 'Complete',
      'completed': 'Complete',
      'cancel': 'Cancel',
      'cancelled': 'Cancel',
      'canceled': 'Cancel'
    };

    return statusMap[normalized] || statusName;
  }

  getStatusText(statusId: number): string {
    // ✅ ใช้ข้อมูลจาก cache ก่อนถ้ามี
    if (this.statusCacheLoaded) {
      const cachedName = this.apiService.getCachedStatusName(statusId);
      return this.normalizeStatusName(cachedName);
    }

    // ✅ Fallback ถ้า cache ยังไม่โหลด
    switch (statusId) {
      case 1: return 'Pending';
      case 2: return 'Open Ticket';
      case 3: return 'In Progress';
      case 4: return 'Resolved';
      case 5: return 'Complete';
      case 6: return 'Cancel';
      default: return 'Unknown';
    }
  }

  getStatusBadgeClass(statusId: number): string {
    switch (statusId) {
      case 1: return 'badge-pending';        // Pending - สีเหลือง
      case 2: return 'badge-in-progress';    // Open Ticket - สีฟ้าอ่อน
      case 3: return 'badge-hold';           // In Progress - สีเทา
      case 4: return 'badge-resolved';       // Resolved - สีเขียวอ่อน
      case 5: return 'badge-complete';       // Complete - สีเขียวเข้ม
      case 6: return 'badge-cancel';         // Cancel - สีแดง
      default: return 'badge-pending';
    }
  }

  getStatusIcon(statusId: number): string {
    switch (statusId) {
      case 1: return 'bi-clock';                // Pending - นาฬิกา
      case 2: return 'bi-folder2-open';         // Open Ticket - โฟลเดอร์เปิด
      case 3: return 'bi-chat-dots';            // In Progress - ไอคอนแชท (ตามรูป)
      case 4: return 'bi-clipboard-check';      // Resolved - คลิปบอร์ดติ๊ก
      case 5: return 'bi-check-circle';         // Complete - วงกลมติ๊ก
      case 6: return 'bi-x-circle';             // Cancel - วงกลมX
      default: return 'bi-clock';
    }
  }

  // ===== STYLING METHODS =====

  // ✅ Helper method สำหรับแสดงชื่อผู้ใช้
  getUserDisplayName(ticket: AllTicketData): string {
    // ลำดับความสำคัญในการแสดงชื่อ:
    // 1. name (ชื่อจริงจาก Backend) ✅
    // 2. user_name (ถ้ามี)
    // 3. username (ถ้ามี)  
    // 4. email (ถ้ามี)
    // 5. User ID
    // 6. Unknown User (ถ้าไม่มีข้อมูลเลย)

    const anyTicket = ticket as any;

    // ✅ ลำดับแรก: ชื่อจาก field "name"
    if (anyTicket.name && anyTicket.name.trim()) {
      return anyTicket.name;
    }

    if (ticket.user_name && ticket.user_name.trim()) {
      return ticket.user_name;
    }

    if (anyTicket.username && anyTicket.username.trim()) {
      return anyTicket.username;
    }

    if (anyTicket.user_email && anyTicket.user_email.trim()) {
      return anyTicket.user_email;
    }

    if (anyTicket.creator_name && anyTicket.creator_name.trim()) {
      return anyTicket.creator_name;
    }

    if (anyTicket.created_by_name && anyTicket.created_by_name.trim()) {
      return anyTicket.created_by_name;
    }

    // ถ้าไม่มีชื่อ แสดง User ID แทน
    if (ticket.create_by) {
      return `User #${ticket.create_by}`;
    }

    return 'Unknown User';
  }

  // ✅ แปลง priority number เป็น string (แก้ไขให้ถูกต้อง)
  getPriorityLevel(priority: any): string {
    const priorityNum = Number(priority);
    switch (priorityNum) {
      case 3: return 'high';      // ✅ 3 = High
      case 2: return 'medium';    // ✅ 2 = Medium
      case 1: return 'low';       // ✅ 1 = Low
      default: return 'medium';
    }
  }

  // ✅ แปลง priority number เป็น label (แก้ไขให้ถูกต้อง)
  getPriorityLabel(priority: any): string {
    const priorityNum = Number(priority);
    switch (priorityNum) {
      case 3: return 'High';      // ✅ 3 = High
      case 2: return 'Medium';    // ✅ 2 = Medium
      case 1: return 'Low';       // ✅ 1 = Low
      default: return 'Medium';
    }
  }

  // ✅ เช็คว่า ticket เป็น High Priority หรือไม่
  isHighPriority(ticket: AllTicketData): boolean {
    const priorityNum = Number(ticket.priority_id);
    return priorityNum === 3;
  }

  getPriorityBadgeClass(priority: any): string {
    const level = this.getPriorityLevel(priority);
    switch (level) {
      case 'high': return 'badge-priority-high';
      case 'medium': return 'badge-priority-medium';
      case 'low': return 'badge-priority-low';
      default: return 'badge-priority-medium';
    }
  }

  formatDate(dateString: string): string {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('th-TH', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'N/A';
    }
  }

  // ===== NAVIGATION METHODS =====

  viewTicket(ticket: AllTicketData): void {
    console.log('Viewing ticket:', ticket.ticket_no);
    this.router.navigate(['/tickets', ticket.ticket_no]);
  }

  editTicket(ticket: AllTicketData): void {
    if (!this.canEditTicket(ticket)) {
      console.warn('User cannot edit this ticket');
      return;
    }

    console.log('Editing ticket:', ticket.ticket_no);
    this.router.navigate(['/tickets/edit', ticket.ticket_no]);
  }

  createNewTicket(): void {
    if (!this.canCreateTickets) {
      console.warn('User cannot create tickets');
      return;
    }

    console.log('Creating new ticket');
    this.router.navigate(['/tickets/new']);
  }

  // ===== TICKET ACTIONS =====

  deleteTicket(ticket: AllTicketData): void {
    if (!this.canDeleteTicket(ticket)) {
      console.warn('User cannot delete this ticket');
      return;
    }

    const confirmDelete = confirm(
      `คุณต้องการลบตั๋ว ${ticket.ticket_no} หรือไม่?\n\nการดำเนินการนี้ไม่สามารถยกเลิกได้`
    );

    if (confirmDelete) {
      console.log('Deleting ticket:', ticket.ticket_no);

      this.apiService.deleteTicketByTicketNo(ticket.ticket_no).subscribe({
        next: (response) => {
          if (response.code === 1) {
            console.log('✅ Ticket deleted successfully');
            this.loadTickets();
          } else {
            console.error('❌ Failed to delete ticket:', response.message);
            alert('ไม่สามารถลบตั๋วได้: ' + response.message);
          }
        },
        error: (error) => {
          console.error('❌ Error deleting ticket:', error);
          alert('เกิดข้อผิดพลาดในการลบตั๋ว');
        }
      });
    }
  }

  changeTicketStatus(ticket: AllTicketData, newStatusId: number): void {
    if (!this.canChangeStatus(ticket)) {
      console.warn('User cannot change ticket status');
      return;
    }

    console.log('Changing ticket status:', ticket.ticket_no, 'to', newStatusId);

    this.apiService.updateTicketByTicketNo(ticket.ticket_no, {
      status_id: newStatusId
    }).subscribe({
      next: (response) => {
        if (response.code === 1) {
          console.log('✅ Ticket status changed successfully');
          ticket.status_id = newStatusId;
        } else {
          console.error('❌ Failed to change ticket status:', response.message);
          alert('ไม่สามารถเปลี่ยนสถานะตั๋วได้: ' + response.message);
        }
      },
      error: (error) => {
        console.error('❌ Error changing ticket status:', error);
        alert('เกิดข้อผิดพลาดในการเปลี่ยนสถานะตั๋ว');
      }
    });
  }

  assignTicket(ticket: AllTicketData): void {
    if (!this.canAssignTicket(ticket)) {
      console.warn('User cannot assign tickets');
      return;
    }

    console.log('Assigning ticket:', ticket.ticket_no);
    alert('ฟีเจอร์การมอบหมายตั๋วยังไม่พร้อมใช้งาน');
  }

  // ===== UTILITY METHODS =====

  reloadTickets(): void {
    console.log('🔄 Reloading tickets');
    this.loadTickets();
  }

  reloadStatusCache(): void {
    console.log('Reloading status cache...');
    this.apiService.clearStatusCache();
    this.statusCacheLoaded = false;
    this.loadStatusCache();
  }

  getDebugInfo(): any {
    return {
      totalTickets: this.tickets.length,
      filteredTickets: this.filteredTickets.length,
      currentUser: this.currentUser?.id,
      viewMode: this.viewMode,
      permissions: {
        canViewAll: this.canViewAllTickets,
        canViewOwn: this.canViewOwnTickets,
        canCreate: this.canCreateTickets,
        canManage: this.canManageTickets
      },
      hasError: !!this.ticketsError,
      isLoading: this.isLoading,
      statusCache: {
        loaded: this.statusCacheLoaded,
        loading: this.isLoadingStatuses,
        error: this.statusError
      },
      filters: {
        search: this.searchText,
        priority: this.selectedPriority,
        status: this.selectedStatus,
        project: this.selectedProject,
        category: this.selectedCategory
      }
    };
  }

  // ===== VIEW MODE METHODS =====

  getViewModeTitle(): string {
    return this.viewMode === 'all' ? 'All Tickets' : 'My Tickets';
  }

  getViewModeDescription(): string {
    if (this.viewMode === 'all') {
      return 'Viewing all tickets in the system';
    } else {
      return 'Viewing only tickets created by you';
    }
  }

  canSwitchViewMode(): boolean {
    return this.canViewAllTickets && this.canViewOwnTickets;
  }

  switchToAllTickets(): void {
    if (this.canViewAllTickets) {
      this.router.navigate(['/tickets']);
    }
  }

  switchToMyTickets(): void {
    if (this.canViewOwnTickets) {
      this.router.navigate(['/tickets/my-tickets']);
    }
  }
}