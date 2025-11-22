// ===== การปรับแก้ ticket-detail.component.ts - เพิ่ม Export PDF Function ===== ✅

import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, forkJoin } from 'rxjs';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { saveAs } from 'file-saver'; // npm install file-saver @types/file-saver
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser'; // 🆕 เพิ่มบรรทัดนี้

// Import API Services (เหลือเฉพาะที่จำเป็น)
import {
  ApiService,
  TicketHistoryResponse,
  TicketStatusHistory,
  GetTicketDataRequest,
  satisfactionResponse
} from '../../../shared/services/api.service';
import { AuthService } from '../../../shared/services/auth.service';
import { NotificationService } from '../../../shared/services/notification.service'; // ✅ NEW

// Import Permission Models
import {
  permissionEnum,
  UserRole,
  ROLES,
  ROLE_IDS  // ✅ เพิ่มบรรทัดนี้
} from '../../../shared/models/permission.model';

// Import utility functions จาก ticket.model.ts
import {
  getStatusName,
  getStatusBadgeClass,
  getStatusIcon,
  TICKET_STATUS_IDS
} from '../../../shared/models/ticket.model';

// ===== เพิ่ม IMPORTS เหล่านี้ =====
import { FileService } from '../../../shared/services/file.service';
import { FilePreviewModalComponent } from '../../../shared/components/file-preview-modal/file-preview-modal.component';
import { FileListComponent } from '../../../shared/components/file-list/file-list.component';

// Import Components
import { SupportInformationFormComponent } from './support-information-form/support-information-form.component';
import { SupportInformationDisplayComponent } from './support-information-display/support-information-display.component';

// Add this import at the top of your component file
import { environment } from '../../../../environments/environment';

// ===== PDF EXPORT INTERFACES ===== ✅
interface HtmlToPdfDto {
  reportNumber: string;
  reportDate: string;
  status: string;
  reporter: string;
  priority: string;  // ✅ แก้ไขตรงนี้ - รองรับทั้ง string และ number
  category: string;
  project: string;
  issueTitle: string;
  issueDescription: string;
  attachmentUrl?: string[]; // ยังคงเป็น array แต่ถ้า backend ต้องการ string ให้แก้เป็น string
  assignee?: string;
  estimatedCloseDate?: string;
  deadline?: string;
  estimateTime?: string;
  leadTime?: string;
  changeRequest?: string;
  solutionDescription?: string;
  satisfactionRating?: string; // เปลี่ยนจาก number เป็น string
}

interface ExportOptions {
  includeAttachments?: boolean;
  includeSolutionDetails?: boolean;
  includeSatisfactionRating?: boolean;
  format?: 'summary' | 'detailed';
}

// ===== LOCAL INTERFACES ===== ✅
interface HistoryDisplayItem {
  status_id: number;
  status_name: string;
  create_date: string;
  is_active: boolean;
  is_completed: boolean;
  is_skipped?: boolean; // ✅ เพิ่ม property ใหม่
}

// ✅ เพิ่ม export เพื่อให้ component อื่นใช้ได้
export interface TicketData {
  ticket: {
    id: number;
    ticket_no: string;
    categories_id: number;
    categories_name: string;
    project_id: number;
    project_name: string;
    issue_description: string;
    fix_issue_description: string;
    status_id: number;
    status_name: string;
    close_estimate: string;
    estimate_time: string;
    due_date: string;
    lead_time: string;
    related_ticket_id: number | null;
    change_request: string;
    create_date: string;
    create_by: string;
    update_date: string;
    update_by: string;
    isenabled: boolean;
    priority_id?: string | number;  // ✅ แก้ไขตรงนี้
  };
  issue_attachment: Array<{
    attachment_id: number;
    path: string;
    filename?: string;
    file_type?: string;
    file_size?: number;
  }>;
  fix_attachment: Array<{
    attachment_id: number;
    path: string;
    filename?: string;
    file_type?: string;
    file_size?: number;
  }>;
  status_history: Array<{
    status_id: number;
    status_name: string;
    create_date: string;
  }>;
  assign: Array<{
    ticket_no: string;
    assignTo: string;
    assignBy: string;
  }>;
}

// ===== COMPONENT DECLARATION ===== ✅

@Component({
  selector: 'app-ticket-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SupportInformationFormComponent,
    SupportInformationDisplayComponent,
    FilePreviewModalComponent,      // ✅ เพิ่ม
    FileListComponent,              // ✅ เพิ่ม
  ],
  templateUrl: './ticket-detail.component.html',
  styleUrls: ['./ticket-detail.component.css']
})
export class TicketDetailComponent implements OnInit {

  // ===== DEPENDENCY INJECTION ===== ✅
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private apiService = inject(ApiService);
  private http = inject(HttpClient);
  public authService = inject(AuthService);
  private notificationService = inject(NotificationService);
  private sanitizer = inject(DomSanitizer);
  private fileService = inject(FileService);  // ✅ เพิ่มบรรทัดนี้

  // ===== CORE PROPERTIES ===== ✅
  ticketData: TicketData | null = null;
  isLoading = false;
  error = '';
  ticket_no: string = '';

  // ===== PDF EXPORT PROPERTIES ===== ✅
  isExportingPdf = false;
  exportError = '';
  exportOptions: ExportOptions = {
    includeAttachments: true,
    includeSolutionDetails: true,
    includeSatisfactionRating: true,
    format: 'detailed'
  };

  // ===== SATISFACTION PROPERTIES ===== ✅
  currentRating = 0;
  hoverRating = 0;
  isSavingRating = false;
  hasExistingSatisfaction = false;
  satisfactionMessage = '';
  canEvaluate = false;

  // ===== 🆕 ATTACHMENT MODAL PROPERTIES ===== 
  showAttachmentModal = false;
  currentAttachment: any = null;

  // ✅ Modal Properties
  showSuccessModal = false;
  modalTitle = '';
  modalMessage = '';
  modalTicketNo = '';

  // ===== ACTION PROPERTIES ===== ✅
  isUpdating = false;
  isDeleting = false;
  isEditing = false;

  // ===== HISTORY PROPERTIES ===== ✅
  ticketHistory: TicketStatusHistory[] = [];
  displayHistory: HistoryDisplayItem[] = [];
  isLoadingHistory = false;

  // ===== STATUS PROPERTIES ===== ✅
  currentStatusInfo: {
    status_id: number;
    status_name: string;
    language_id: string;
  } | null = null;
  isLoadingStatus = false;
  statusError = '';
  statusCacheLoaded = false;
  isLoadingStatuses = false;
  statusCacheError = '';

  // ===== CONSTANTS ===== ✅
  private readonly STATUS_WORKFLOW = [
    { id: 1, name: 'Created', icon: 'bi-plus-circle' },
    { id: 2, name: 'Open Ticket', icon: 'bi-folder2-open' },
    { id: 3, name: 'In Progress', icon: 'bi-play-circle' },
    { id: 4, name: 'Resolved', icon: 'bi-clipboard-check' },
    { id: 5, name: 'Completed', icon: 'bi-check-circle' },
    { id: 6, name: 'Cancel', icon: 'bi-x-circle' }
  ];

  // ===== ✅ เพิ่มตรงนี้ - PRIORITY CONSTANTS ===== 
  private readonly PRIORITY_MAP: { [key: number]: string } = {
    1: 'Low',
    2: 'Medium',
    3: 'High'
  };

  private readonly PRIORITY_CLASS_MAP: { [key: number]: string } = {
    1: 'priority-low',
    2: 'priority-medium',
    3: 'priority-high'
  };

  // ===== PDF EXPORT METHODS ===== ✅

  /**
   * ✅ Export ticket เป็น PDF (Main Function)
   */
  async exportToPdf(options: ExportOptions = {}): Promise<void> {
    if (!this.ticketData?.ticket) {
      alert('ไม่สามารถส่งออกได้ เนื่องจากไม่พบข้อมูล ticket');
      return;
    }

    // ตรวจสอบสิทธิ์ - ใครก็ได้ที่ดู ticket ได้ก็สามารถ export ได้
    if (!this.hasPermission(permissionEnum.VIEW_OWN_TICKETS)) {
      alert('คุณไม่มีสิทธิ์ในการส่งออก ticket นี้');
      return;
    }

    try {
      this.isExportingPdf = true;
      this.exportError = '';

      // รวม options
      const finalOptions = { ...this.exportOptions, ...options };

      // เตรียมข้อมูลสำหรับส่งไป backend
      const pdfData = await this.preparePdfData(finalOptions);

      // เรียก API เพื่อสร้าง PDF
      await this.callPdfGenerateApi(pdfData);

      console.log('PDF export completed successfully');

    } catch (error) {
      console.error('PDF export error:', error);
      this.exportError = 'เกิดข้อผิดพลาดในการส่งออก PDF';
      alert(`ไม่สามารถส่งออก PDF ได้: ${error}`);

    } finally {
      this.isExportingPdf = false;
    }
  }

  /**
   * ✅ เตรียมข้อมูลสำหรับส่งไป backend
   */
  private async preparePdfData(options: ExportOptions): Promise<HtmlToPdfDto> {
    const ticket = this.ticketData!.ticket;

    // ดึงข้อมูล assignee
    const assigneeInfo = await this.getAssigneeInfo();

    // ดึง URLs ของ attachments
    const attachmentUrls = options.includeAttachments
      ? this.getAttachmentUrls()
      : [];

    // เตรียมข้อมูลตาม interface ที่ backend ต้องการ - แปลงทุกอย่างเป็น string
    const pdfData: HtmlToPdfDto = {
      reportNumber: ticket.ticket_no || '',
      reportDate: this.formatDateForPdf(new Date().toISOString()),
      status: this.getCurrentStatusName() || '',
      reporter: ticket.create_by || '',
      priority: this.getPriorityText(ticket.priority_id),  // ✅ ใช้ helper method แปลงเป็น text เลย
      category: ticket.categories_name || '',
      project: ticket.project_name || '',
      issueTitle: `Ticket ${ticket.ticket_no}`,
      issueDescription: ticket.issue_description || '',

      // แปลง array เป็น string (JSON หรือ comma-separated)
      attachmentUrl: attachmentUrls.length > 0 ? attachmentUrls : undefined,

      // แปลงข้อมูลเป็น string ทั้งหมด
      assignee: assigneeInfo || '',
      estimatedCloseDate: ticket.close_estimate
        ? this.formatDateForPdf(ticket.close_estimate)
        : '',
      deadline: ticket.due_date
        ? this.formatDateForPdf(ticket.due_date)
        : '',
      estimateTime: ticket.estimate_time || '',
      leadTime: ticket.lead_time || '',
      changeRequest: options.includeSolutionDetails
        ? (ticket.change_request || '')
        : '',
      solutionDescription: options.includeSolutionDetails
        ? (ticket.fix_issue_description || '')
        : '',
      satisfactionRating: options.includeSatisfactionRating && this.currentRating > 0
        ? this.currentRating.toString()
        : ''
    };

    console.log('Prepared PDF data with string types:', pdfData);
    return pdfData;
  }

  /**
   * ✅ เรียก API สำหรับสร้าง PDF
   */
  private async callPdfGenerateApi(pdfData: HtmlToPdfDto): Promise<void> {
    const token = this.authService.getToken();

    if (!token) {
      throw new Error('Authentication token not found');
    }

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });

    // ✅ Use full API URL from environment instead of relative path
    const apiUrl = `${environment.apiUrl}/pdf/generate`;

    try {
      // เรียก API และรับ response เป็น blob (PDF)
      const response = await this.http.post(apiUrl, pdfData, {
        headers: headers,
        responseType: 'blob',
        observe: 'response'
      }).toPromise();

      if (!response || !response.body) {
        throw new Error('No PDF data received from server');
      }

      // สร้างชื่อไฟล์
      const fileName = `ticket-${pdfData.reportNumber}-${this.formatDateForFilename(new Date())}.pdf`;

      // ดาวน์โหลดไฟล์ PDF
      saveAs(response.body, fileName);

      // แสดง success message
      this.showSuccessModal = true;
      this.modalTitle = 'Export Successful';
      this.modalMessage = `ส่งออก PDF สำเร็จแล้ว: ${fileName}`;
      this.modalTicketNo = this.ticket_no;

      console.log('PDF exported successfully from:', apiUrl);

    } catch (error: any) {
      console.error('PDF API call failed:', error);
      console.error('API URL used:', apiUrl);

      // จัดการ error messages
      if (error.status === 401) {
        throw new Error('ไม่มีสิทธิ์ในการเข้าถึง กรุณาเข้าสู่ระบบใหม่');
      } else if (error.status === 403) {
        throw new Error('ไม่มีสิทธิ์ในการส่งออก PDF');
      } else if (error.status === 500) {
        throw new Error('เกิดข้อผิดพลาดในเซิร์ฟเวอร์');
      } else {
        throw new Error(error.message || 'ไม่สามารถส่งออก PDF ได้');
      }
    }
  }

  /**
   * ✅ ดึงข้อมูล assignee จาก ticket data
   */
  private async getAssigneeInfo(): Promise<string> {
    try {
      if (this.ticketData?.assign && this.ticketData.assign.length > 0) {
        const latestAssign = this.ticketData.assign[this.ticketData.assign.length - 1];
        return latestAssign.assignTo || 'ไม่ระบุ';
      }

      return 'ยังไม่ได้มอบหมาย';

    } catch (error) {
      console.warn('Error getting assignee info:', error);
      return 'ไม่ระบุ';
    }
  }

  /**
   * ✅ ดึง URLs ของ attachments
   */
  private getAttachmentUrls(): string[] {
    const urls: string[] = [];

    try {
      // Issue attachments
      if (this.ticketData?.issue_attachment) {
        this.ticketData.issue_attachment.forEach(attachment => {
          if (attachment.path && !attachment.path.startsWith('data:')) {
            urls.push(attachment.path);
          }
        });
      }

      // Fix attachments (ถ้าต้องการรวมด้วย)
      if (this.ticketData?.fix_attachment) {
        this.ticketData.fix_attachment.forEach(attachment => {
          if (attachment.path && !attachment.path.startsWith('data:')) {
            urls.push(attachment.path);
          }
        });
      }

    } catch (error) {
      console.warn('Error collecting attachment URLs:', error);
    }

    return urls;
  }

  /**
   * ✅ Format date สำหรับ PDF
   */
  private formatDateForPdf(dateString: string): string {
    try {
      return new Date(dateString).toLocaleDateString('th-TH', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return dateString;
    }
  }

  /**
   * ✅ Format date สำหรับชื่อไฟล์
   */
  private formatDateForFilename(date: Date): string {
    try {
      return date.toISOString().slice(0, 10); // YYYY-MM-DD
    } catch {
      return 'unknown';
    }
  }

  /**
   * ✅ ตรวจสอบว่าสามารถ export ได้หรือไม่
   */
  canExportPdf(): boolean {
    return !this.isLoading &&
      !this.isExportingPdf &&
      !!this.ticketData?.ticket &&
      this.hasPermission(permissionEnum.VIEW_OWN_TICKETS);
  }

  /**
   * ✅ ได้รับ export button text สำหรับ UI
   */
  getExportButtonText(): string {
    if (this.isExportingPdf) {
      return 'กำลังส่งออก...';
    }
    return 'Export PDF';
  }

  /**
   * ✅ ได้รับ export button class สำหรับ UI
   */
  getExportButtonClass(): string {
    if (this.isExportingPdf) {
      return 'btn btn-export-pdf exporting disabled';
    }
    if (!this.canExportPdf()) {
      return 'btn btn-export-pdf disabled';
    }
    return 'btn btn-export-pdf'; // ใช้ class ใหม่ที่เราสร้าง
  }

  // ===== LIFECYCLE ===== ✅

  ngOnInit(): void {
    this.ticket_no = this.route.snapshot.params['ticket_no'];

    if (this.ticket_no) {
      this.loadStatusCache();
      this.loadTicketDetail();
    } else {
      this.router.navigate(['/tickets']);
    }
  }

  /**
   * ส่ง notification เมื่อเปลี่ยนสถานะ ticket
   */
  private sendStatusChangeNotification(ticketNo: string, newStatusId: number): void {
    console.log('📤 Sending status change notification:', { ticketNo, newStatusId });

    this.notificationService.notifyTicketChanges({
      ticket_no: ticketNo,
      statusId: newStatusId
    }).subscribe({
      next: (response) => {
        console.log('✅ Status change notification sent:', response);
      },
      error: (error) => {
        console.warn('⚠️ Failed to send status notification (non-critical):', error);
      }
    });
  }

  /**
   * ส่ง notification เมื่อ assign ticket
   */
  private sendAssignmentNotification(ticketNo: string, assignedUserId: number): void {
    console.log('📤 Sending assignment notification:', { ticketNo, assignedUserId });

    this.notificationService.notifyTicketChanges({
      ticket_no: ticketNo,
      assignedUserId: assignedUserId
    }).subscribe({
      next: (response) => {
        console.log('✅ Assignment notification sent:', response);
      },
      error: (error) => {
        console.warn('⚠️ Failed to send assignment notification (non-critical):', error);
      }
    });
  }

  // ===== ✅ EVENT HANDLERS FOR CHILD COMPONENTS =====

  /**
   * ✅ จัดการเมื่อ Supporter Form บันทึกสำเร็จ
   */
  onSupporterDataSaved(response: any): void {
    console.log('Supporter data saved:', response);

    // อัพเดท ticket data
    if (response.data?.ticket) {
      const oldStatusId = this.ticketData?.ticket?.status_id;
      const newStatusId = response.data.ticket.status_id;

      Object.assign(this.ticketData!.ticket, response.data.ticket);

      // ✅ NEW: ส่ง notification ถ้าสถานะเปลี่ยน
      if (oldStatusId && newStatusId && oldStatusId !== newStatusId) {
        this.sendStatusChangeNotification(this.ticket_no, newStatusId);
      }
    }

    // อัพเดท attachments
    if (response.data?.attachments) {
      this.updateAttachmentsFromResponse(response.data.attachments);
    }

    // รีเฟรชข้อมูลที่เกี่ยวข้อง
    this.refreshTicketData();
    this.buildDisplayHistory();
    this.updateEvaluationStatus();

    // แสดง modal สำเร็จ
    this.showSuccessModal = true;
    this.modalTitle = 'Supporter Data Saved';
    this.modalMessage = 'บันทึกข้อมูล supporter สำเร็จแล้ว';
    this.modalTicketNo = this.ticket_no;
  }

  /**
   * ✅ จัดการเมื่อ Ticket ถูก Assign สำเร็จ
   */
  onTicketAssigned(response: any): void {
    console.log('Ticket assigned:', response);

    // อัพเดท ticket data
    if (this.ticketData?.ticket) {
      this.ticketData.ticket.update_by = `User ${response.assigned_to}`;
      this.ticketData.ticket.update_date = new Date().toISOString();
    }

    // ✅ NEW: ส่ง notification
    if (response.assigned_to) {
      this.sendAssignmentNotification(this.ticket_no, response.assigned_to);
    }

    // รีเฟรชข้อมูล
    this.refreshTicketData();

    // แสดง modal สำเร็จ
    this.showSuccessModal = true;
    this.modalTitle = 'Ticket Assigned';
    this.modalMessage = `มอบหมาย ticket ${response.ticket_no} สำเร็จแล้ว`;
    this.modalTicketNo = this.ticket_no;
  }

  /**
   * ✅ จัดการเมื่อต้องการ refresh ข้อมูล
   */
  onRefreshRequired(): void {
    console.log('Refreshing ticket data...');
    this.refreshTicketData();
  }

  /**
   * ✅ อัพเดท attachments จาก API response
   */
  private updateAttachmentsFromResponse(newAttachments: any[]): void {
    if (!newAttachments || newAttachments.length === 0) return;

    const existingFixIds = new Set(
      this.ticketData!.fix_attachment.map(att => att.attachment_id)
    );

    const trulyNewAttachments = newAttachments.filter(att =>
      !existingFixIds.has(att.id)
    );

    if (trulyNewAttachments.length === 0) return;

    const formattedAttachments = trulyNewAttachments.map(att => ({
      attachment_id: att.id,
      path: att.path || `uploads/${att.filename}`,
      filename: att.filename,
      file_type: att.extension || att.file_type,
      file_size: att.file_size || 0
    }));

    this.ticketData!.fix_attachment.push(...formattedAttachments);
  }

  // ===== ✅ PERMISSION CHECKING METHODS ===== 

  /**
   * ✅ ตรวจสอบ permission เฉพาะๆ (สำหรับใช้ใน template)
   */
  hasPermission(permission: number | permissionEnum): boolean {
    return this.authService.hasPermission(permission);
  }

  /**
   * ✅ ตรวจสอบ role เฉพาะๆ (สำหรับใช้ใน template)
   */
  hasRole(role: UserRole): boolean {
    return this.authService.hasRole(role);
  }

  /**
   * ✅ ตรวจสอบหลาย roles (สำหรับใช้ใน template)
   */
  hasAnyRole(roles: UserRole[]): boolean {
    return this.authService.hasAnyRole(roles);
  }

  /**
   * ✅ Helper method เพื่อตรวจสอบ permission แบบง่าย
   */
  hasSpecificPermission(permissionId: number): boolean {
    const userPermissions = this.authService.getEffectivePermissions();
    return userPermissions.includes(permissionId);
  }

  // ===== ✅ TICKET ACTION METHODS ===== 

  /**
 * ✅ Edit ticket with enhanced role-based validation
 */
  onEditTicket(): void {
    if (!this.ticketData?.ticket?.ticket_no) {
      console.error('No ticket number available for edit');
      return;
    }

    // ✅ Enhanced permission check with role awareness
    if (!this.authService.hasPermission(permissionEnum.EDIT_TICKET) &&
      !this.authService.hasAnyRole([ROLES.SUPPORTER, ROLES.ADMIN])) {
      console.warn('User does not have permission to edit tickets');
      alert('คุณไม่มีสิทธิ์แก้ไข ticket นี้');
      return;
    }

    // ✅ Get current status as number
    const currentStatus: number = this.getCurrentStatusId();

    // ✅ Role-specific status validation with informative messages
    if (this.authService.hasRole(ROLES.USER)) {
      if (currentStatus !== TICKET_STATUS_IDS.CREATED) {
        alert('คุณสามารถแก้ไข ticket ได้เฉพาะในสถานะ "Created" เท่านั้น\n\nTicket นี้อยู่ในสถานะ: ' + this.getCurrentStatusName());
        return;
      }
    } else if (this.authService.hasRole(ROLES.ADMIN)) {
      if (currentStatus !== TICKET_STATUS_IDS.CREATED && currentStatus !== TICKET_STATUS_IDS.OPEN_TICKET) {
        alert('คุณสามารถแก้ไข ticket ได้เฉพาะในสถานะ "Created" และ "Open Ticket" เท่านั้น\n\nTicket นี้อยู่ในสถานะ: ' + this.getCurrentStatusName());
        return;
      }
    } else if (this.authService.hasRole(ROLES.SUPPORTER)) {
      if (currentStatus === TICKET_STATUS_IDS.COMPLETED || currentStatus === TICKET_STATUS_IDS.CANCEL) {
        alert('ไม่สามารถแก้ไข ticket ที่อยู่ในสถานะ "' + this.getCurrentStatusName() + '" ได้');
        return;
      }
    }

    // ✅ Proceed with edit if all validations pass
    this.saveTicketDataForEdit();
    this.router.navigate(['/tickets/edit', this.ticketData.ticket.ticket_no]);
  }

  /**
   * ✅ Delete ticket with enhanced role-based validation
   */
  onDeleteTicket(): void {
    if (!this.ticketData?.ticket?.ticket_no) {
      console.error('No ticket number available for deletion');
      return;
    }

    // ✅ Enhanced permission check
    if (!this.authService.hasPermission(permissionEnum.DELETE_TICKET) &&
      !this.authService.isAdmin()) {
      console.warn('User does not have permission to delete tickets');
      alert('คุณไม่มีสิทธิ์ลบ ticket นี้');
      return;
    }

    // ✅ Get current status as number
    const currentStatus: number = this.getCurrentStatusId();

    // ✅ Role-specific status validation with informative messages
    if (this.authService.hasRole(ROLES.USER)) {
      if (currentStatus !== TICKET_STATUS_IDS.CREATED) {
        alert('คุณสามารถลบ ticket ได้เฉพาะในสถานะ "Created" เท่านั้น\n\nTicket นี้อยู่ในสถานะ: ' + this.getCurrentStatusName());
        return;
      }
    } else if (this.authService.hasRole(ROLES.ADMIN)) {
      if (currentStatus !== TICKET_STATUS_IDS.CREATED && currentStatus !== TICKET_STATUS_IDS.OPEN_TICKET) {
        alert('คุณสามารถลบ ticket ได้เฉพาะในสถานะ "Created" และ "Open Ticket" เท่านั้น\n\nTicket นี้อยู่ในสถานะ: ' + this.getCurrentStatusName());
        return;
      }
    } else if (this.authService.hasRole(ROLES.SUPPORTER)) {
      if (currentStatus === TICKET_STATUS_IDS.COMPLETED || currentStatus === TICKET_STATUS_IDS.CANCEL) {
        alert('ไม่สามารถลบ ticket ที่อยู่ในสถานะ "' + this.getCurrentStatusName() + '" ได้');
        return;
      }
    }

    // ✅ Proceed with deletion if all validations pass
    const ticketNo = this.ticketData.ticket.ticket_no;
    const confirmMessage = `คุณแน่ใจหรือไม่ที่ต้องการลบ ticket ${ticketNo}?\n\nการลบนี้ไม่สามารถยกเลิกได้`;

    if (confirm(confirmMessage)) {
      this.deleteTicket(ticketNo);
    }
  }

  // ===== ✅ SATISFACTION METHODS ===== 

  /**
   * ✅ ตั้งค่าคะแนนความพึงพอใจและบันทึก (with permission check)
   */
  setRating(rating: number): void {
    const userPermissions = this.authService.getEffectivePermissions();
    const hasSatisfactionPermission = userPermissions.includes(14);

    if (!hasSatisfactionPermission) {
      alert('คุณไม่มีสิทธิ์ประเมินความพึงพอใจ\nต้องการ permission: 14 (SATISFACTION)');
      return;
    }

    if (!this.canEvaluate || this.hasExistingSatisfaction) {
      return;
    }

    this.currentRating = rating;
    this.satisfaction(rating);
  }

  /**
   * ✅ ตรวจสอบว่าสามารถคลิกดาวได้หรือไม่ (with permission check)
   */
  canClickStar(): boolean {
    const userPermissions = this.authService.getEffectivePermissions();
    const hasSatisfactionPermission = userPermissions.includes(14);

    return hasSatisfactionPermission &&
      this.canEvaluate &&
      !this.hasExistingSatisfaction &&
      !this.isSavingRating;
  }

  /**
   * บันทึกคะแนนความพึงพอใจ - แสดง Modal แทน Alert + จัดการ body class
   */
  private satisfaction(rating: number): void {
    if (!this.ticket_no || this.isSavingRating) {
      return;
    }

    this.isSavingRating = true;

    this.apiService.satisfaction(this.ticket_no, rating).subscribe({
      next: (response: satisfactionResponse) => {
        if (response.success) {
          this.hasExistingSatisfaction = true;
          this.satisfactionMessage = 'บันทึกคะแนนความพึงพอใจสำเร็จ';
          this.currentRating = rating;

          this.saveSatisfactionToStorage(rating);

          this.showSuccessModal = true;
          this.modalTitle = 'Assessment Success';
          this.modalMessage = 'ขอบคุณสำหรับการประเมินความพึงพอใจ';
          this.modalTicketNo = this.ticket_no;

          document.body.classList.add('modal-open');
        } else {
          this.currentRating = 0;
          this.hasExistingSatisfaction = false;
          alert(response.error || 'ไม่สามารถบันทึกการประเมินได้');
        }
        this.isSavingRating = false;
      },
      error: (error) => {
        console.error('Error saving satisfaction:', error);
        this.currentRating = 0;
        this.hasExistingSatisfaction = false;
        this.isSavingRating = false;
        alert('เกิดข้อผิดพลาดในการบันทึกคะแนนความพึงพอใจ');
      }
    });
  }

  // ===== ✅ PERMISSION-AWARE HELPER METHODS ===== 

  /**
 * ✅ ตรวจสอบว่าสามารถแก้ไขได้หรือไม่ (with role-based status restrictions)
 */
  canEdit(): boolean {
    if (!this.ticketData?.ticket) return false;

    // 🚫 Supporter ไม่มีสิทธิ์แก้ไขเลย
    if (this.authService.hasRole(ROLES.SUPPORTER) || this.authService.hasRoleId(ROLE_IDS.SUPPORTER)) {
      return false;
    }

    const hasEditPermission = this.authService.hasPermission(permissionEnum.EDIT_TICKET) ||
      this.authService.hasAnyRole([ROLES.ADMIN]);

    if (!hasEditPermission) return false;

    const currentStatus = Number(this.getCurrentStatusId());
    const isAdmin = this.authService.hasRole(ROLES.ADMIN) || this.authService.hasRoleId(ROLE_IDS.ADMIN);
    const isUser = this.authService.hasRole(ROLES.USER) || this.authService.hasRoleId(ROLE_IDS.USER);

    if (isAdmin) {
      return currentStatus === TICKET_STATUS_IDS.CREATED || currentStatus === TICKET_STATUS_IDS.OPEN_TICKET;
    }

    if (isUser) {
      return currentStatus === TICKET_STATUS_IDS.CREATED;
    }

    return false;
  }

  /**
   * ✅ ตรวจสอบว่าสามารถลบได้หรือไม่ (with role-based status restrictions)
   */
  canDelete(): boolean {
    if (!this.ticketData?.ticket) return false;

    // 🚫 Supporter ไม่มีสิทธิ์ลบเลย
    if (this.authService.hasRole(ROLES.SUPPORTER) || this.authService.hasRoleId(ROLE_IDS.SUPPORTER)) {
      return false;
    }

    const hasDeletePermission = this.authService.hasPermission(permissionEnum.DELETE_TICKET) ||
      this.authService.isAdmin();

    if (!hasDeletePermission) return false;

    const currentStatus: number = this.getCurrentStatusId();
    const isAdmin = this.authService.hasRole(ROLES.ADMIN) || this.authService.hasRoleId(ROLE_IDS.ADMIN);
    const isUser = this.authService.hasRole(ROLES.USER) || this.authService.hasRoleId(ROLE_IDS.USER);

    if (isUser && !isAdmin) {
      return currentStatus === TICKET_STATUS_IDS.CREATED;
    }

    if (isAdmin) {
      return currentStatus === TICKET_STATUS_IDS.CREATED || currentStatus === TICKET_STATUS_IDS.OPEN_TICKET;
    }

    return false;
  }

  /**
   * ✅ ได้รับข้อความปุ่ม Edit (with role-aware status messages)
   */
  getEditButtonText(): string {
    if (!this.ticketData?.ticket) return 'No Permission';

    const userPermissions = this.authService.getEffectivePermissions();

    const hasEditPermission = userPermissions.includes(8) ||
      userPermissions.includes(19) ||
      this.authService.isAdmin();

    if (!hasEditPermission) return 'Edit';

    const currentStatus = this.getCurrentStatusId();

    // ✅ Role-specific messages
    if (this.authService.hasRole(ROLES.USER)) {
      switch (currentStatus) {
        case TICKET_STATUS_IDS.CREATED:
          return 'Edit';
        case TICKET_STATUS_IDS.OPEN_TICKET:
          return 'Opened';
        case TICKET_STATUS_IDS.COMPLETED:
          return 'Completed';
        case TICKET_STATUS_IDS.CANCEL:
          return 'Cancelled';
        default:
          return 'In Process';
      }
    }

    if (this.authService.hasRole(ROLES.ADMIN)) {
      switch (currentStatus) {
        case TICKET_STATUS_IDS.CREATED:
        case TICKET_STATUS_IDS.OPEN_TICKET:
          return 'Edit';
        case TICKET_STATUS_IDS.IN_PROGRESS:
          return 'In Progress';
        case TICKET_STATUS_IDS.COMPLETED:
          return 'Completed';
        case TICKET_STATUS_IDS.CANCEL:
          return 'Cancelled';
        default:
          return 'Edit';
      }
    }

    // Supporter and default
    switch (currentStatus) {
      case TICKET_STATUS_IDS.COMPLETED:
        return 'Completed';
      case TICKET_STATUS_IDS.CANCEL:
        return 'Cancelled';
      default:
        return 'Edit';
    }
  }

  /**
   * ✅ ได้รับ CSS class สำหรับปุ่ม Edit (with role-aware styling)
   */
  getEditButtonClass(): string {
    const hasPermission = this.authService.hasPermission(permissionEnum.EDIT_TICKET) ||
      this.authService.hasAnyRole([ROLES.SUPPORTER, ROLES.ADMIN]);

    if (!hasPermission) return 'btn-edit disabled no-permission';

    const canEdit = this.canEdit();
    const currentStatus = this.getCurrentStatusId();

    // ✅ Add role-specific class for better UX
    let roleClass = '';
    if (this.authService.hasRole(ROLES.USER)) {
      roleClass = 'user-restricted';
    } else if (this.authService.hasRole(ROLES.ADMIN)) {
      roleClass = 'admin-restricted';
    }

    return canEdit
      ? `btn-edit ${roleClass}`.trim()
      : `btn-edit disabled ${roleClass}`.trim();
  }

  /**
   * ✅ ได้รับ CSS class สำหรับปุ่ม Delete (with role-aware styling)
   */
  getDeleteButtonClass(): string {
    const hasPermission = this.authService.hasPermission(permissionEnum.DELETE_TICKET) ||
      this.authService.isAdmin();

    if (!hasPermission) return 'btn-delete disabled no-permission';

    const canDelete = this.canDelete();

    // ✅ Add role-specific class for better UX
    let roleClass = '';
    if (this.authService.hasRole(ROLES.USER)) {
      roleClass = 'user-restricted';
    } else if (this.authService.hasRole(ROLES.ADMIN)) {
      roleClass = 'admin-restricted';
    }

    return canDelete
      ? `btn-delete ${roleClass}`.trim()
      : `btn-delete disabled ${roleClass}`.trim();
  }

  /**
 * ✅ ได้รับ tooltip สำหรับปุ่ม Edit แบบละเอียด
 */
  getEditButtonTooltip(): string {
    if (!this.ticketData?.ticket) {
      return 'ไม่มีข้อมูล ticket';
    }

    const hasEditPermission = this.authService.hasPermission(permissionEnum.EDIT_TICKET) ||
      this.authService.hasAnyRole([ROLES.SUPPORTER, ROLES.ADMIN]);

    if (!hasEditPermission) {
      return 'คุณไม่มีสิทธิ์แก้ไข ticket';
    }

    // ✅ Explicitly type as number to avoid TypeScript errors
    const currentStatus: number = this.getCurrentStatusId();
    const statusName = this.getCurrentStatusName();

    // ✅ Role-specific tooltips
    if (this.authService.hasRole(ROLES.USER)) {
      if (currentStatus === TICKET_STATUS_IDS.CREATED) {
        return 'แก้ไข ticket (User: สามารถแก้ไขได้เฉพาะในสถานะ Created)';
      } else {
        return `ไม่สามารถแก้ไขได้ (User: แก้ไขได้เฉพาะในสถานะ Created)\nสถานะปัจจุบัน: ${statusName}`;
      }
    }

    if (this.authService.hasRole(ROLES.ADMIN)) {
      // ✅ Use direct comparison instead of includes to avoid type errors
      if (currentStatus === TICKET_STATUS_IDS.CREATED || currentStatus === TICKET_STATUS_IDS.OPEN_TICKET) {
        return `แก้ไข ticket (Admin: สามารถแก้ไขได้จนถึงสถานะ Open Ticket)`;
      } else {
        return `ไม่สามารถแก้ไขได้ (Admin: แก้ไขได้เฉพาะ Created และ Open Ticket)\nสถานะปัจจุบัน: ${statusName}`;
      }
    }

    if (this.authService.hasRole(ROLES.SUPPORTER)) {
      // ✅ Use direct comparison instead of includes to avoid type errors
      if (currentStatus === TICKET_STATUS_IDS.COMPLETED || currentStatus === TICKET_STATUS_IDS.CANCEL) {
        return `ไม่สามารถแก้ไขได้ (Supporter: ไม่สามารถแก้ไข ${statusName} ได้)`;
      } else {
        return `แก้ไข ticket (Supporter: แก้ไขได้ทุกสถานะยกเว้น Completed และ Cancel)`;
      }
    }

    return this.canEdit() ? 'แก้ไข ticket นี้' : `ไม่สามารถแก้ไขในสถานะ ${statusName} ได้`;
  }

  /**
 * ✅ ได้รับ tooltip สำหรับปุ่ม Delete แบบละเอียด
 */
  getDeleteButtonTooltip(): string {
    if (!this.ticketData?.ticket) {
      return 'ไม่มีข้อมูล ticket';
    }

    const hasDeletePermission = this.authService.hasPermission(permissionEnum.DELETE_TICKET) ||
      this.authService.isAdmin();

    if (!hasDeletePermission) {
      return 'คุณไม่มีสิทธิ์ลบ ticket';
    }

    // ✅ Explicitly type as number to avoid TypeScript errors
    const currentStatus: number = this.getCurrentStatusId();
    const statusName = this.getCurrentStatusName();

    // ✅ Role-specific tooltips
    if (this.authService.hasRole(ROLES.USER)) {
      if (currentStatus === TICKET_STATUS_IDS.CREATED) {
        return 'ลบ ticket (User: สามารถลบได้เฉพาะในสถานะ Created)';
      } else {
        return `ไม่สามารถลบได้ (User: ลบได้เฉพาะในสถานะ Created)\nสถานะปัจจุบัน: ${statusName}`;
      }
    }

    if (this.authService.hasRole(ROLES.ADMIN)) {
      // ✅ Use direct comparison instead of includes to avoid type errors
      if (currentStatus === TICKET_STATUS_IDS.CREATED || currentStatus === TICKET_STATUS_IDS.OPEN_TICKET) {
        return `ลบ ticket (Admin: สามารถลบได้จนถึงสถานะ Open Ticket)`;
      } else {
        return `ไม่สามารถลบได้ (Admin: ลบได้เฉพาะ Created และ Open Ticket)\nสถานะปัจจุบัน: ${statusName}`;
      }
    }

    if (this.authService.hasRole(ROLES.SUPPORTER)) {
      // ✅ Use direct comparison instead of includes to avoid type errors
      if (currentStatus === TICKET_STATUS_IDS.COMPLETED || currentStatus === TICKET_STATUS_IDS.CANCEL) {
        return `ไม่สามารถลบได้ (Supporter: ไม่สามารถลบ ${statusName} ได้)`;
      } else {
        return `ลบ ticket (Supporter: ลบได้ทุกสถานะยกเว้น Completed และ Cancel)`;
      }
    }

    return this.canDelete() ? 'ลบ ticket นี้' : `ไม่สามารถลบในสถานะ ${statusName} ได้`;
  }

  // ===== SATISFACTION UI METHODS ===== ✅

  /**
   * ได้รับคลาส CSS สำหรับดาว
   */
  getStarClass(starIndex: number): string {
    const baseClass = 'star';

    if (this.hasExistingSatisfaction && this.currentRating > 0) {
      return baseClass + (starIndex <= this.currentRating ? ' filled permanent-rating' : ' disabled');
    }

    if (!this.canClickStar()) {
      return baseClass + ' disabled';
    }

    if (this.isSavingRating && starIndex === this.currentRating) {
      return baseClass + ' saving';
    }

    if (this.hoverRating > 0) {
      return baseClass + (starIndex <= this.hoverRating ? ' hover' : '');
    }

    return baseClass + (starIndex <= this.currentRating ? ' filled' : '');
  }

  /**
   * ตรวจสอบว่าดาวควรจะเต็ม (สีเหลือง) หรือไม่
   */
  isStarFilled(starIndex: number): boolean {
    if (this.hasExistingSatisfaction && this.currentRating > 0) {
      return starIndex <= this.currentRating;
    }

    if (this.hoverRating > 0 && this.canClickStar()) {
      return starIndex <= this.hoverRating;
    }

    if (this.currentRating > 0 && !this.hasExistingSatisfaction) {
      return starIndex <= this.currentRating;
    }

    return false;
  }

  /**
   * จัดการ mouse events บนดาว
   */
  onStarMouseEnter(rating: number): void {
    if (this.canClickStar() && !this.hasExistingSatisfaction) {
      this.hoverRating = rating;
    }
  }

  onStarMouseLeave(): void {
    if (this.canClickStar() && !this.hasExistingSatisfaction) {
      this.hoverRating = 0;
    }
  }

  /**
   * ได้รับ tooltip สำหรับดาว
   */
  getStarTooltip(starIndex: number): string {
    if (this.hasExistingSatisfaction) {
      if (starIndex <= this.currentRating) {
        return `คุณให้คะแนน ${this.currentRating} ดาวแล้ว`;
      } else {
        return `คุณให้คะแนน ${this.currentRating} ดาวแล้ว`;
      }
    }

    if (!this.canEvaluate) {
      return this.satisfactionMessage;
    }

    if (this.canClickStar()) {
      return `ให้คะแนน ${starIndex} ดาว`;
    }

    return this.getEvaluationMessage();
  }

  /**
   * ได้รับข้อความสำหรับแสดงสถานะการประเมิน
   */
  getEvaluationMessage(): string {
    if (this.hasExistingSatisfaction && this.currentRating > 0) {
      return '';
    }

    if (this.hasExistingSatisfaction) {
      return '';
    }

    if (!this.canEvaluate) {
      return this.satisfactionMessage;
    }

    return 'กรุณาประเมินความพึงพอใจ';
  }

  // ===== ✅ เพิ่มตรงนี้ - PRIORITY HELPER METHODS ===== 

  /**
 * ✅ แปลง priority ID เป็น text ที่อ่านง่าย - แสดง "-" เมื่อเป็น null
 */
  getPriorityText(priority_id?: number | string): string {
    // ✅ ตรวจสอบว่าเป็น null, undefined, หรือค่าว่าง
    if (priority_id === null || priority_id === undefined || priority_id === '') {
      return '-';
    }

    const id = typeof priority_id === 'string' ? parseInt(priority_id, 10) : priority_id;

    // ✅ ตรวจสอบว่า parse ได้หรือไม่
    if (isNaN(id)) {
      return '-';
    }

    return this.PRIORITY_MAP[id] || '-';
  }

  /**
 * ✅ ได้รับ CSS class สำหรับ priority - ไม่มี style เมื่อเป็น null
 */
  getPriorityClass(priority_id?: number | string): string {
    // ✅ ถ้าเป็น null ให้ใช้ class ว่าง (ไม่ใส่สี)
    if (priority_id === null || priority_id === undefined || priority_id === '') {
      return 'priority-none';
    }

    const id = typeof priority_id === 'string' ? parseInt(priority_id, 10) : priority_id;

    if (isNaN(id)) {
      return 'priority-none';
    }

    return this.PRIORITY_CLASS_MAP[id] || 'priority-none';
  }

  /**
   * ปิด Success Modal + จัดการ body class + รีเซ็ตสถานะ
   */
  closeSuccessModal(): void {
    this.showSuccessModal = false;
    this.modalTitle = '';
    this.modalMessage = '';
    this.modalTicketNo = '';

    document.body.classList.remove('modal-open');

    if (this.hasExistingSatisfaction && this.currentRating > 0) {
      console.log('Rating confirmed:', this.currentRating, 'stars');
    }
  }

  // ===== STATUS & HISTORY METHODS ===== ✅

  getCurrentStatusId(): number {
    return this.currentStatusInfo?.status_id ||
      this.ticketData?.ticket?.status_id ||
      1;
  }

  getCurrentStatusName(): string {
    const statusId = this.getCurrentStatusId();

    if (this.statusCacheLoaded) {
      return this.apiService.getCachedStatusName(statusId);
    }

    return this.currentStatusInfo?.status_name ||
      this.ticketData?.ticket?.status_name ||
      this.getDefaultStatusName(statusId);
  }

  private getDefaultStatusName(statusId: number): string {
    return getStatusName(statusId, 'en');
  }

  formatDate(dateString: string): string {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleDateString('th-TH', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '-';
    }
  }

  /**
   * ✅ ใช้ utility functions จาก ticket.model.ts
   */
  getStatusBadgeClass(statusId?: number): string {
    const currentStatusId = statusId || this.getCurrentStatusId();
    return getStatusBadgeClass(currentStatusId);
  }

  getStatusIcon(statusId?: number): string {
    const currentStatusId = statusId || this.getCurrentStatusId();
    return getStatusIcon(currentStatusId);
  }

  // ===== ATTACHMENT MODAL METHODS =====

  /**
 * ✅ เปลี่ยนชื่อและลดโค้ด - เดิมชื่อ onDownloadAttachment
 */
  onAttachmentClick(attachment: any): void {
    this.currentAttachment = attachment;
    this.showAttachmentModal = true;
    document.body.classList.add('modal-open');
  }

  /**
   * ✅ เก็บไว้ - ไม่เปลี่ยนแปลง
   */
  closeAttachmentModal(): void {
    this.showAttachmentModal = false;
    this.currentAttachment = null;
    document.body.classList.remove('modal-open');
  }

  /**
   * ✅ เปลี่ยนชื่อและใช้ FileService - เดิมชื่อ downloadCurrentAttachment
   */
  downloadAttachment(attachment: any): void {
    if (!attachment) return;

    const fileInfo = this.fileService.getFileInfo(attachment);
    this.fileService.downloadFile(attachment.path, fileInfo.filename);

    console.log('Downloading attachment:', attachment);
  }

  /**
   * ✅ ดาวน์โหลดไฟล์ปัจจุบัน
   */
  downloadCurrentAttachment(): void {
    if (!this.currentAttachment) return;

    const path = this.currentAttachment.path;
    const filename = this.currentAttachment.filename;

    if (path.startsWith('data:')) {
      const link = document.createElement('a');
      link.href = path;
      link.download = filename || `attachment_${this.currentAttachment.attachment_id}`;
      link.click();
    } else {
      window.open(path, '_blank');
    }

    console.log(`Downloading attachment:`, this.currentAttachment);
  }

  // ===== จบส่วน ATTACHMENT MODAL METHODS ===== 

  backToList(): void {
    this.router.navigate(['/tickets']);
  }

  // ===== HISTORY METHODS ===== ✅


  // ✅ แก้ไข method isStatusSkipped ให้ตรวจสอบจาก create_date
  isStatusSkipped(historyItem: HistoryDisplayItem): boolean {
    // ถ้าไม่มี create_date หรือ create_date เป็นค่าว่าง = status ถูกข้าม
    return !historyItem.create_date || historyItem.create_date.trim() === '';
  }

  // ✅ แก้ไข method getHistoryBadgeClass
  getHistoryBadgeClass(historyItem: HistoryDisplayItem): string {
    if (historyItem.is_skipped) {
      return 'badge-skipped'; // ✅ ใช้ class ใหม่สำหรับ skipped
    }
    if (historyItem.is_active) {
      return 'badge-current';
    }
    if (historyItem.is_completed) {
      return 'badge-completed';
    }
    return 'badge-pending';
  }

  // ✅ แก้ไข method ให้ใช้ status_id แทน
  getHistoryIcon(statusId: number): string {
    const workflowItem = this.STATUS_WORKFLOW.find(s => s.id === statusId);
    return workflowItem?.icon || 'bi-file-text';
  }

  hasHistoryDate(historyItem: HistoryDisplayItem): boolean {
    return !!historyItem.create_date && historyItem.create_date.trim() !== '';
  }

  formatHistoryDate(dateString: string): string {
    if (!dateString || dateString.trim() === '') {
      return '-';
    }

    try {
      return new Date(dateString).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return '-';
    }
  }

  // ===== INITIALIZATION METHODS ===== ✅

  private loadStatusCache(): void {
    console.log('Loading Status Cache');

    if (this.apiService.isStatusCacheLoaded()) {
      this.statusCacheLoaded = true;
      console.log('Status cache already loaded');
      return;
    }

    this.isLoadingStatuses = true;
    this.statusCacheError = '';

    this.apiService.loadAndCacheStatuses().subscribe({
      next: (success) => {
        if (success) {
          this.statusCacheLoaded = true;
          console.log('Status cache loaded successfully');

          if (this.ticketData?.ticket) {
            this.updateStatusFromCache();
          }
        } else {
          console.warn('Status cache loading failed, using defaults');
          this.statusCacheError = 'ไม่สามารถโหลดข้อมูลสถานะได้';
        }
        this.isLoadingStatuses = false;
      },
      error: (error) => {
        console.error('Error loading status cache:', error);
        this.statusCacheError = 'เกิดข้อผิดพลาดในการโหลดสถานะ';
        this.isLoadingStatuses = false;
      }
    });
  }

  private updateStatusFromCache(): void {
    if (!this.ticketData?.ticket || !this.statusCacheLoaded) return;

    const statusId = this.ticketData.ticket.status_id;
    const statusName = this.apiService.getCachedStatusName(statusId);

    this.currentStatusInfo = {
      status_id: statusId,
      status_name: statusName,
      language_id: 'th'
    };

    this.ticketData.ticket.status_name = statusName;
    this.buildDisplayHistory();
    this.updateEvaluationStatus();

    console.log('Status updated from cache:', {
      statusId,
      statusName,
      canEvaluate: this.canEvaluate,
      currentStatusInfo: this.currentStatusInfo
    });
  }

  public async loadTicketDetail(): Promise<void> {
    console.log('loadTicketDetail START');

    this.isLoading = true;
    this.error = '';

    try {
      await this.getTicketByTicketNo(this.ticket_no);

      if (!this.ticketData?.ticket) {
        this.error = 'ไม่สามารถโหลดข้อมูล ticket ได้';
        return;
      }

      this.useTicketDataStatus();
      await this.loadTicketHistory();
      this.loadExistingSatisfaction();

      console.log('loadTicketDetail completed successfully');

    } catch (error) {
      console.error('Error in loadTicketDetail:', error);
      this.error = 'เกิดข้อผิดพลาดในการโหลดข้อมูล ticket';
    } finally {
      this.isLoading = false;
    }
  }

  private useTicketDataStatus(): void {
    if (!this.ticketData?.ticket) return;

    const statusId = this.ticketData.ticket.status_id || 5;

    const statusName = this.statusCacheLoaded
      ? this.apiService.getCachedStatusName(statusId)
      : (this.ticketData.ticket.status_name || this.getDefaultStatusName(statusId));

    this.currentStatusInfo = {
      status_id: statusId,
      status_name: statusName,
      language_id: 'th'
    };

    this.ticketData.ticket.status_id = statusId;
    this.ticketData.ticket.status_name = statusName;
    this.updateEvaluationStatus();

    console.log('Using status:', {
      statusId,
      statusName,
      canEvaluate: this.canEvaluate,
      fromCache: this.statusCacheLoaded,
      currentStatusInfo: this.currentStatusInfo
    });
  }

  private async loadTicketHistory(): Promise<void> {
    if (!this.ticketData?.ticket?.id) {
      this.buildHistoryFromExistingData();
      return;
    }

    this.isLoadingHistory = true;

    try {
      const historyResponse = await this.getMockTicketHistory(this.ticketData.ticket.id).toPromise();

      if (historyResponse?.success && historyResponse.data) {
        this.ticketHistory = historyResponse.data;
        this.buildDisplayHistory();
        console.log('Ticket history loaded successfully');
      } else {
        this.buildHistoryFromExistingData();
      }
    } catch (error) {
      console.error('Error loading ticket history:', error);
      this.buildHistoryFromExistingData();
    } finally {
      this.isLoadingHistory = false;
    }
  }

  private getMockTicketHistory(ticketId: number): Observable<TicketHistoryResponse> {
    const existingHistory = this.ticketData?.status_history || [];

    const historyFromDatabase: TicketStatusHistory[] = existingHistory
      .filter(h => h.create_date)
      .map((historyItem, index) => ({
        id: index + 1,
        ticket_id: ticketId,
        status_id: historyItem.status_id,
        create_date: historyItem.create_date,
        create_by: 1,
        status: {
          id: historyItem.status_id,
          name: historyItem.status_name
        }
      }));

    const mockResponse: TicketHistoryResponse = {
      success: true,
      message: 'History from database',
      data: historyFromDatabase
    };

    console.log('Using real database history:', historyFromDatabase);
    return new Observable<TicketHistoryResponse>((observer) => {
      setTimeout(() => {
        observer.next(mockResponse);
        observer.complete();
      }, 50);
    });
  }

  // ✅ แก้ไข buildDisplayHistory() ให้ set is_skipped จาก create_date
  private buildDisplayHistory(): void {
    if (!this.ticketData?.ticket) return;

    const currentStatusId = this.getCurrentStatusId();
    console.log('Building display history for current status:', currentStatusId);

    this.updateHistoryWithCurrentStatus(currentStatusId);

    this.displayHistory = this.STATUS_WORKFLOW.map((workflowStatus) => {
      const historyItem = this.ticketHistory.find(h => h.status_id === workflowStatus.id);

      const currentPosition = this.getStatusPosition(currentStatusId);
      const thisPosition = this.getStatusPosition(workflowStatus.id);

      const isActive = workflowStatus.id === currentStatusId;
      const isCompleted = thisPosition < currentPosition && thisPosition !== -1;

      // ✅ กำหนด create_date
      let createDate = '';
      if (historyItem?.create_date) {
        createDate = historyItem.create_date;
      } else if (isActive) {
        createDate = new Date().toISOString();
      }

      // ✅ ตรวจสอบว่า status นี้ถูกข้ามหรือไม่จาก create_date
      const isSkipped = !createDate || createDate.trim() === '';

      const statusName = this.statusCacheLoaded
        ? this.apiService.getCachedStatusName(workflowStatus.id)
        : workflowStatus.name;

      return {
        status_id: workflowStatus.id,
        status_name: statusName,
        create_date: createDate,
        is_active: isActive,
        is_completed: isCompleted,
        is_skipped: isSkipped // ✅ จะเป็น true ถ้าไม่มี create_date
      };
    });

    console.log('Built display history with skipped status detection:', this.displayHistory);
  }

  private updateHistoryWithCurrentStatus(currentStatusId: number): void {
    const hasCurrentStatusInHistory = this.ticketHistory.some(h => h.status_id === currentStatusId);

    if (!hasCurrentStatusInHistory) {
      const newHistoryEntry: TicketStatusHistory = {
        id: this.ticketHistory.length + 1,
        ticket_id: this.ticketData!.ticket.id,
        status_id: currentStatusId,
        create_date: new Date().toISOString(),
        create_by: 1,
        status: {
          id: currentStatusId,
          name: this.apiService.getCachedStatusName(currentStatusId)
        }
      };

      this.ticketHistory.push(newHistoryEntry);
      console.log('Added new history entry for status:', currentStatusId);
    }
  }

  // ✅ แก้ไข buildHistoryFromExistingData() ด้วยเช่นกัน
  private buildHistoryFromExistingData(): void {
    if (!this.ticketData?.ticket) return;

    const currentStatusId = this.getCurrentStatusId();
    const existingHistory = this.ticketData.status_history || [];

    this.displayHistory = this.STATUS_WORKFLOW.map((workflowStatus) => {
      const existingItem = existingHistory.find(h => h.status_id === workflowStatus.id);

      const currentPosition = this.getStatusPosition(currentStatusId);
      const thisPosition = this.getStatusPosition(workflowStatus.id);

      const isActive = workflowStatus.id === currentStatusId;
      const isCompleted = thisPosition < currentPosition && thisPosition !== -1;

      // ✅ กำหนด create_date
      const createDate = existingItem?.create_date || '';

      // ✅ ตรวจสอบว่า status นี้ถูกข้ามหรือไม่จาก create_date
      const isSkipped = !createDate || createDate.trim() === '';

      const statusName = this.statusCacheLoaded
        ? this.apiService.getCachedStatusName(workflowStatus.id)
        : workflowStatus.name;

      return {
        status_id: workflowStatus.id,
        status_name: statusName,
        create_date: createDate,
        is_active: isActive,
        is_completed: isCompleted,
        is_skipped: isSkipped // ✅ จะเป็น true ถ้าไม่มี create_date
      };
    });

    console.log('Built fallback history with skipped status detection:', this.displayHistory);
  }

  private getStatusPosition(statusId: number): number {
    const index = this.STATUS_WORKFLOW.findIndex(s => s.id === statusId);
    return index !== -1 ? index : 0;
  }

  /**
   * ✅ ตรวจสอบว่าสามารถประเมินได้หรือไม่ โดยใช้ constants
   */
  private updateEvaluationStatus(): void {
    const statusId = this.getCurrentStatusId();

    this.canEvaluate = statusId === TICKET_STATUS_IDS.COMPLETED;
    this.satisfactionMessage = this.apiService.getEvaluationStatusMessage(statusId);

    console.log('Evaluation status updated:', {
      statusId,
      canEvaluate: this.canEvaluate,
      message: this.satisfactionMessage
    });
  }

  /**
   * โหลดสถานะการประเมินจากข้อมูล ticket (ถ้ามี)
   */
  private loadExistingSatisfaction(): void {
    const savedRating = localStorage.getItem(`satisfaction_${this.ticket_no}`);
    if (savedRating) {
      const rating = parseInt(savedRating, 10);
      if (rating >= 1 && rating <= 5) {
        this.currentRating = rating;
        this.hasExistingSatisfaction = true;
        this.satisfactionMessage = `คุณได้ให้คะแนน ${rating} ดาวแล้ว`;
        console.log('Loaded existing satisfaction:', rating, 'stars');
      }
    }
  }

  /**
   * บันทึกสถานะการประเมินลง localStorage (เป็น backup)
   */
  private saveSatisfactionToStorage(rating: number): void {
    try {
      localStorage.setItem(`satisfaction_${this.ticket_no}`, rating.toString());
      localStorage.setItem(`satisfaction_${this.ticket_no}_timestamp`, new Date().toISOString());
      console.log('Satisfaction saved to localStorage:', rating);
    } catch (error) {
      console.warn('Could not save satisfaction to localStorage:', error);
    }
  }

  // ===== PRIVATE HELPER METHODS ===== ✅

  private saveTicketDataForEdit(): void {
    if (!this.ticketData?.ticket) return;

    const currentUser = this.authService.getCurrentUser();
    const currentUserId = currentUser?.id;

    if (!currentUserId) {
      console.error('No current user ID found');
      return;
    }

    const editTicketData = {
      userId: currentUserId,
      ticketId: this.ticketData.ticket.id,
      ticket_no: this.ticketData.ticket.ticket_no,
      isEditMode: true,
      isTicketCreated: true,
      formData: {
        projectId: this.ticketData.ticket.project_id,
        categoryId: this.ticketData.ticket.categories_id,
        issueDescription: this.ticketData.ticket.issue_description
      },
      selectedProject: {
        id: this.ticketData.ticket.project_id,
        projectName: this.ticketData.ticket.project_name
      },
      selectedCategory: {
        id: this.ticketData.ticket.categories_id,
        categoryName: this.ticketData.ticket.categories_name
      },
      existingAttachments: this.ticketData.issue_attachment.map(attachment => ({
        attachment_id: attachment.attachment_id,
        path: attachment.path,
        filename: attachment.filename,
        file_type: attachment.file_type,
        file_size: attachment.file_size
      })),
      timestamp: new Date().getTime()
    };

    const storageKey = `editTicket_${currentUserId}_${this.ticketData.ticket.ticket_no}`;
    localStorage.setItem(storageKey, JSON.stringify(editTicketData));
  }

  private deleteTicket(ticket_no: string): void {
    this.isDeleting = true;

    this.apiService.deleteTicketByTicketNo(ticket_no).subscribe({
      next: (response: any) => {
        if (response.code === 1) {
          alert('ลบ ticket สำเร็จแล้ว');
          this.clearLocalStorageData();
          this.backToList();
        } else {
          alert(`ไม่สามารถลบ ticket ได้: ${response.message}`);
        }
        this.isDeleting = false;
      },
      error: (error: any) => {
        console.error('Delete ticket error:', error);
        alert(`เกิดข้อผิดพลาดในการลบ ticket: ${error}`);
        this.isDeleting = false;
      }
    });
  }

  private clearLocalStorageData(): void {
    const currentUser = this.authService.getCurrentUser();
    const currentUserId = currentUser?.id;

    if (currentUserId) {
      const incompleteKey = `incompleteTicket_${currentUserId}`;
      const editKey = `editTicket_${currentUserId}_${this.ticket_no}`;

      localStorage.removeItem(incompleteKey);
      localStorage.removeItem(editKey);
    }
  }

  private refreshTicketData(): void {
    console.log('Refreshing ticket data...');

    const requestData: GetTicketDataRequest = { ticket_no: this.ticket_no };

    this.apiService.getTicketData(requestData).subscribe({
      next: (response: any) => {
        if (response && response.code === 1 && response.data) {
          console.log('Refreshed ticket data:', response.data);

          const oldStatusId = this.ticketData?.ticket?.status_id;
          const newStatusId = response.data.ticket.status_id;

          if (oldStatusId && newStatusId !== oldStatusId) {
            console.log('Status changed from', oldStatusId, 'to', newStatusId);
          }

          this.ticketData = response.data;

          if (newStatusId) {
            this.currentStatusInfo = {
              status_id: newStatusId,
              status_name: this.apiService.getCachedStatusName(newStatusId),
              language_id: 'th'
            };
          }

          this.buildDisplayHistory();
          this.updateEvaluationStatus();
        }
      },
      error: (error) => {
        console.warn('Failed to refresh ticket data:', error);
      }
    });
  }

  private getTicketByTicketNo(ticket_no: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!ticket_no || ticket_no.trim() === '') {
        this.error = 'หมายเลขตั๋วไม่ถูกต้อง';
        reject(new Error('Invalid ticket number'));
        return;
      }

      const requestData: GetTicketDataRequest = { ticket_no: ticket_no };

      this.apiService.getTicketData(requestData).subscribe({
        next: (response: any) => {
          if (response && response.code === 1) {
            if (response.data && this.isValidTicketData(response.data)) {
              this.ticketData = response.data as TicketData;
              resolve();
            } else {
              this.error = 'ข้อมูล ticket ไม่ถูกต้อง';
              reject(new Error('Invalid ticket data'));
            }
          } else {
            this.error = response?.message || 'ไม่พบข้อมูล ticket ที่ต้องการ';
            reject(new Error(this.error));
          }
        },
        error: (error: any) => {
          console.error('API Error:', error);
          this.error = 'เกิดข้อผิดพลาดในการโหลดข้อมูล';
          reject(error);
        }
      });
    });
  }

  private isValidTicketData(data: any): boolean {
    const hasTicket = data.ticket && typeof data.ticket === 'object';
    const hasIssueAttachment = Array.isArray(data.issue_attachment);
    const hasFixAttachment = Array.isArray(data.fix_attachment);
    const hasStatusHistory = Array.isArray(data.status_history);

    return hasTicket && hasIssueAttachment && hasFixAttachment && hasStatusHistory;
  }

  canShowForm(): boolean {
    const userPermissions = this.authService.getEffectivePermissions();
    return userPermissions.includes(5) || // VIEW_ALL_TICKETS
      userPermissions.includes(8) || // CHANGE_STATUS 
      userPermissions.includes(19);  // ASSIGNEE
  }
}