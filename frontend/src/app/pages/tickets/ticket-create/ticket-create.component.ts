import { Component, OnInit, OnDestroy, inject, ViewEncapsulation, HostListener, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute, NavigationEnd } from '@angular/router';
import { ApiService } from '../../../shared/services/api.service';
import { AuthService } from '../../../shared/services/auth.service';
import { TicketService } from '../../../shared/services/ticket.service';
import { NotificationService } from '../../../shared/services/notification.service';
import { NotificationResponse } from '../../../shared/models/notification.model';
import { ProjectDropdownComponent } from '../../../shared/components/project-dropdown/project-dropdown.component';
import { CategoryDropdownComponent } from '../../../shared/components/category-dropdown/category-dropdown.component';
import { debounceTime, distinctUntilChanged, filter } from 'rxjs';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-ticket-create',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ProjectDropdownComponent,
    CategoryDropdownComponent
  ],
  templateUrl: './ticket-create.component.html',
  styleUrls: ['./ticket-create.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class TicketCreateComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private apiService = inject(ApiService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private ticketService = inject(TicketService);
  private notificationService = inject(NotificationService);
  private cdr = inject(ChangeDetectorRef);

  get environment() {
    return { production: false };
  }

  ticketForm: FormGroup;

  isLoading = false;
  isSubmitting = false;
  selectedFiles: File[] = [];
  filePreviewUrls: { [key: string]: string } = {};
  fileErrors: string[] = [];

  currentUser: any;

  selectedProject: any = null;
  selectedCategory: any = null;

  showValidationErrors = false;
  validationErrors: { [key: string]: boolean } = {};

  showCustomAlert = false;
  alertMessage = '';
  alertType: 'error' | 'success' = 'error';

  autoNavigationTimer: any = null;

  // Edit Mode Properties
  isEditMode = false;
  editTicketNo: string = '';
  originalTicketData: any = null;
  existingAttachments: any[] = [];

  ticketId: number | null = null;
  ticket_no: string = '';
  isTicketCreated = false;

  uploadedFileNames: string[] = [];
  uploadingFileNames: string[] = [];
  errorFileNames: string[] = [];
  fileSuccessMessages: string[] = [];

  isNavigating = false;

  // Delete attachment tracking
  private deletingAttachmentIds: Set<number> = new Set();

  // File Analysis Properties
  attachmentTypes: {
    [key: number]: {
      type: 'image' | 'pdf' | 'excel' | 'word' | 'text' | 'archive' | 'video' | 'audio' | 'file';
      extension: string;
      filename: string;
      isLoading?: boolean;
      isAnalyzed?: boolean;
    }
  } = {};

  // Bulk Selection Properties
  selectedAttachmentIds: Set<number> = new Set();

  // File Upload Timeout Timer
  private fileUploadTimeoutTimer: any = null;
  private readonly FILE_UPLOAD_TIMEOUT = 30000; // 30 seconds

  // ✅ NEW: Flag to prevent duplicate auto-save calls
  private isAutoSaving = false;

  // ✅ เพิ่มบรรทัดนี้หลังจาก isAutoSaving
  private routerSubscription?: Subscription;

  constructor() {
    this.ticketForm = this.fb.group({
      projectId: ['', Validators.required],
      categoryId: ['', Validators.required],
      issueDescription: ['', [Validators.required, Validators.minLength(10)]],
      attachments: [[]]
    });
  }

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    console.log('Current user:', this.currentUser);

    // ✅ เพิ่มส่วนนี้หลังจาก console.log และก่อน checkEditMode()
    this.routerSubscription = this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd)
      )
      .subscribe((event: any) => {
        if (event.url.includes('/tickets/new')) {
          console.log('🔄 Navigated back to ticket create page');
          this.onNavigationBack();
        }
      });

    this.checkEditMode();

    // ✅ ENHANCED: Auto-save สำหรับ Issue Description
    this.ticketForm.get('issueDescription')?.valueChanges
      .pipe(
        debounceTime(1000),
        distinctUntilChanged()
      )
      .subscribe(value => {
        console.log('Issue Description changed:', value);
        if (!this.isEditMode) {
          this.onFormCompleted();
        }
      });

    // ✅ NEW: Auto-save สำหรับ Project ID
    this.ticketForm.get('projectId')?.valueChanges
      .pipe(
        debounceTime(800),
        distinctUntilChanged()
      )
      .subscribe(value => {
        console.log('Project ID changed:', value);
        if (!this.isEditMode) {
          this.onFormCompleted();
        }
      });

    // ✅ NEW: Auto-save สำหรับ Category ID
    this.ticketForm.get('categoryId')?.valueChanges
      .pipe(
        debounceTime(800),
        distinctUntilChanged()
      )
      .subscribe(value => {
        console.log('Category ID changed:', value);
        if (!this.isEditMode) {
          this.onFormCompleted();
        }
      });
  }

  ngOnDestroy(): void {
    Object.values(this.filePreviewUrls).forEach(url => {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });

    this.clearAllTimers();
    this.clearEditData();

    // ✅ เพิ่มส่วนนี้ก่อน closing brace
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }
  }

  // ✅ เพิ่ม method ใหม่ตรงนี้ - หลัง ngOnDestroy() และก่อน clearAllTimers()
  private onNavigationBack(): void {
    console.log('📍 Handling navigation back to component');

    // ถ้าไม่ใช่ Edit mode ให้ตรวจสอบ incomplete ticket
    if (!this.isEditMode) {
      this.restoreIncompleteTicket();
    }
  }

  // ===== Timer Management ===== ✅
  private clearAllTimers(): void {
    if (this.autoNavigationTimer) {
      clearTimeout(this.autoNavigationTimer);
      this.autoNavigationTimer = null;
    }

    if (this.fileUploadTimeoutTimer) {
      clearTimeout(this.fileUploadTimeoutTimer);
      this.fileUploadTimeoutTimer = null;
    }
  }

  // ===== UNIFIED ATTACHMENT MANAGEMENT METHODS ===== ✅

  getTotalAttachmentCount(): number {
    const existingCount = this.existingAttachments?.length || 0;
    const newCount = this.selectedFiles?.length || 0;
    return existingCount + newCount;
  }

  getTotalSelectableCount(): number {
    const existingCount = this.existingAttachments?.length || 0;
    return existingCount;
  }

  canShowBulkActions(): boolean {
    const totalSelectable = this.getTotalSelectableCount();
    return totalSelectable > 1;
  }

  toggleSelectAll(): void {
    if (this.selectedAttachmentCount === this.getTotalSelectableCount()) {
      this.clearAttachmentSelection();
    } else {
      this.selectAllAttachments();
    }
  }

  removeSelectedItems(): void {
    if (!this.hasSelectedAttachments) {
      return;
    }

    const selectedIds = Array.from(this.selectedAttachmentIds);

    if (selectedIds.length === 0) {
      return;
    }

    const confirmMessage = `คุณต้องการลบไฟล์ ${selectedIds.length} ไฟล์หรือไม่?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    this.removeMultipleExistingAttachments(selectedIds);
    this.clearAttachmentSelection();
  }

  getFileTypeFromExtension(filename: string): string {
    const extension = this.getFileExtension(filename).toLowerCase();

    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff', 'ico'].includes(extension)) {
      return 'image';
    }

    if (extension === 'pdf') {
      return 'pdf';
    }

    if (['xls', 'xlsx', 'csv', 'ods'].includes(extension)) {
      return 'excel';
    }

    if (['doc', 'docx', 'rtf', 'odt'].includes(extension)) {
      return 'word';
    }

    if (['txt', 'log', 'md', 'json', 'xml', 'html', 'css', 'js', 'ts'].includes(extension)) {
      return 'text';
    }

    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(extension)) {
      return 'archive';
    }

    if (['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'm4v'].includes(extension)) {
      return 'video';
    }

    if (['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a', 'wma'].includes(extension)) {
      return 'audio';
    }

    return 'file';
  }

  getFileTypeColor(fileType: string): string {
    switch (fileType) {
      case 'image': return '#6f42c1';
      case 'pdf': return '#dc3545';
      case 'excel': return '#198754';
      case 'word': return '#0d6efd';
      case 'text': return '#6c757d';
      case 'archive': return '#ffc107';
      case 'video': return '#e83e8c';
      case 'audio': return '#fd7e14';
      default: return '#6c757d';
    }
  }

  getFileUploadStatus(fileName: string): 'uploaded' | 'uploading' | 'error' | 'pending' {
    if (this.isFileUploaded(fileName)) {
      return 'uploaded';
    } else if (this.isFileUploading(fileName)) {
      return 'uploading';
    } else if (this.isFileError(fileName)) {
      return 'error';
    } else {
      return 'pending';
    }
  }

  getUploadStatusMessage(fileName: string): string {
    const status = this.getFileUploadStatus(fileName);

    switch (status) {
      case 'uploaded':
        return 'อัปโหลดสำเร็จ';
      case 'uploading':
        return 'กำลังอัปโหลด...';
      case 'error':
        return 'อัปโหลดล้มเหลว';
      case 'pending':
        return 'รอการอัปโหลด';
      default:
        return 'ไม่ทราบสถานะ';
    }
  }

  isNewFileImage(file: File): boolean {
    return this.isImageFile(file);
  }

  getNewFileIcon(file: File): string {
    const fileType = this.getFileTypeFromExtension(file.name);

    switch (fileType) {
      case 'image': return 'bi-image-fill';
      case 'pdf': return 'bi-file-earmark-pdf-fill';
      case 'excel': return 'bi-file-earmark-excel-fill';
      case 'word': return 'bi-file-earmark-word-fill';
      case 'text': return 'bi-file-earmark-text-fill';
      case 'archive': return 'bi-file-earmark-zip-fill';
      case 'video': return 'bi-file-earmark-play-fill';
      case 'audio': return 'bi-file-earmark-music-fill';
      default: return 'bi-file-earmark-fill';
    }
  }

  getAllAttachmentsSorted(): Array<{
    type: 'existing' | 'new';
    item: any;
    index: number;
    status: string;
    displayName: string;
    fileType: string;
    fileSize: string;
  }> {
    const allFiles: Array<any> = [];

    if (this.existingAttachments) {
      this.existingAttachments.forEach((attachment, index) => {
        allFiles.push({
          type: 'existing',
          item: attachment,
          index: index,
          status: 'saved',
          displayName: this.getExistingAttachmentDisplayName(attachment),
          fileType: this.getExistingAttachmentFileInfo(attachment.attachment_id).type,
          fileSize: this.formatExistingAttachmentSize(attachment)
        });
      });
    }

    if (this.selectedFiles) {
      this.selectedFiles.forEach((file, index) => {
        allFiles.push({
          type: 'new',
          item: file,
          index: index,
          status: this.getFileUploadStatus(file.name),
          displayName: file.name,
          fileType: this.getFileTypeFromExtension(file.name),
          fileSize: this.formatFileSize(file.size)
        });
      });
    }

    const statusPriority = {
      'saved': 1,
      'uploaded': 2,
      'uploading': 3,
      'pending': 4,
      'error': 5
    };

    return allFiles.sort((a, b) => {
      const aPriority = statusPriority[a.status as keyof typeof statusPriority] || 6;
      const bPriority = statusPriority[b.status as keyof typeof statusPriority] || 6;

      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      return a.displayName.localeCompare(b.displayName);
    });
  }

  hasUploadingFiles(): boolean {
    return this.uploadingFileNames.length > 0;
  }

  hasUploadedFiles(): boolean {
    return this.uploadedFileNames.length > 0;
  }

  hasErrorFiles(): boolean {
    return this.errorFileNames.length > 0;
  }

  getUploadStats(): {
    total: number;
    uploaded: number;
    uploading: number;
    error: number;
    pending: number;
  } {
    const total = this.selectedFiles.length;
    const uploaded = this.uploadedFileNames.length;
    const uploading = this.uploadingFileNames.length;
    const error = this.errorFileNames.length;
    const pending = total - uploaded - uploading - error;

    return {
      total,
      uploaded,
      uploading,
      error,
      pending
    };
  }

  getUploadProgress(): number {
    const stats = this.getUploadStats();
    if (stats.total === 0) return 0;

    return Math.round((stats.uploaded / stats.total) * 100);
  }

  clearAllSelections(): void {
    this.clearAttachmentSelection();
  }

  hasAnySelectedItems(): boolean {
    return this.hasSelectedAttachments;
  }

  getAttachmentSystemStatus(): string {
    const totalFiles = this.getTotalAttachmentCount();
    const existingCount = this.existingAttachments?.length || 0;
    const newCount = this.selectedFiles?.length || 0;

    if (totalFiles === 0) {
      return 'No files attached';
    }

    let statusParts: string[] = [];

    if (existingCount > 0) {
      statusParts.push(`${existingCount} saved`);
    }

    if (newCount > 0) {
      const uploadStats = this.getUploadStats();
      if (uploadStats.uploaded > 0) {
        statusParts.push(`${uploadStats.uploaded} uploaded`);
      }
      if (uploadStats.uploading > 0) {
        statusParts.push(`${uploadStats.uploading} uploading`);
      }
      if (uploadStats.pending > 0) {
        statusParts.push(`${uploadStats.pending} pending`);
      }
      if (uploadStats.error > 0) {
        statusParts.push(`${uploadStats.error} failed`);
      }
    }

    return statusParts.join(', ') || `${totalFiles} files`;
  }

  // ===== Edit Mode Methods ===== ✅

  private checkEditMode(): void {
    this.editTicketNo = this.route.snapshot.params['ticket_no'];

    if (this.editTicketNo) {
      console.log('Edit mode detected for ticket:', this.editTicketNo);
      this.isEditMode = true;
      this.restoreEditTicketData();
    } else {
      console.log('Create mode detected');
      this.isEditMode = false;
      this.restoreIncompleteTicket();
    }
  }

  private restoreEditTicketData(): void {
    try {
      const currentUserId = this.currentUser?.id || this.currentUser?.user_id;
      if (!currentUserId) {
        console.log('No current user ID found');
        this.backToTicketDetail();
        return;
      }

      this.isLoading = true;
      console.log('🔄 Loading ticket data for edit mode:', this.editTicketNo);

      this.apiService.getTicketData({ ticket_no: this.editTicketNo }).subscribe({
        next: (response) => {
          console.log('getTicketData response:', response);

          if (response.code === 1 && response.data) {
            const ticketData = response.data.ticket;

            this.isEditMode = true;
            this.ticketId = ticketData.id;
            this.ticket_no = ticketData.ticket_no;
            this.isTicketCreated = true;

            this.existingAttachments = (response.data.issue_attachment || []).map((att: any) => {
              const attachmentId = att.attachment_id;

              this.attachmentTypes[attachmentId] = {
                type: 'file',
                extension: '',
                filename: `Attachment ${attachmentId}`,
                isLoading: true,
                isAnalyzed: false
              };

              return {
                attachment_id: attachmentId,
                path: att.path,
                filename: null,
                file_type: null,
                file_size: null
              };
            });

            console.log('✅ Loaded attachments:', this.existingAttachments.length);

            this.originalTicketData = {
              userId: currentUserId,
              ticketId: this.ticketId,
              ticket_no: this.ticket_no,
              isEditMode: true,
              formData: {
                projectId: ticketData.project_id,
                categoryId: ticketData.categories_id,
                issueDescription: ticketData.issue_description
              },
              selectedProject: {
                id: ticketData.project_id,
                name: ticketData.project_name
              },
              selectedCategory: {
                id: ticketData.categories_id,
                name: ticketData.categories_name
              },
              existingAttachments: this.existingAttachments
            };

            this.ticketForm.patchValue({
              projectId: ticketData.project_id,
              categoryId: ticketData.categories_id,
              issueDescription: ticketData.issue_description
            });

            this.selectedProject = this.originalTicketData.selectedProject;
            this.selectedCategory = this.originalTicketData.selectedCategory;

            setTimeout(() => {
              this.updateUIFromRestoredData(this.originalTicketData);
              this.addSuccessState();

              this.analyzeAttachmentsFromUrls();

              this.isLoading = false;
            }, 300);

            console.log('✅ Edit mode initialized successfully');

          } else {
            throw new Error(response.message || 'Failed to load ticket data');
          }
        },
        error: (error) => {
          console.error('❌ Error loading ticket data:', error);
          this.isLoading = false;

          this.alertMessage = 'ไม่สามารถโหลดข้อมูล ticket ได้\nกรุณาลองใหม่อีกครั้ง';
          this.alertType = 'error';
          this.showCustomAlert = true;

          setTimeout(() => {
            this.backToTicketDetail();
          }, 2000);
        }
      });

    } catch (error) {
      console.error('Error in restoreEditTicketData:', error);
      this.isLoading = false;
      this.backToTicketDetail();
    }
  }

  private analyzeAttachmentsFromUrls(): void {
    if (!this.existingAttachments || this.existingAttachments.length === 0) {
      return;
    }

    console.log('🔍 Analyzing attachments from URLs...');

    this.existingAttachments.forEach((attachment, index) => {
      const attachmentId = attachment.attachment_id;
      const url = attachment.path;

      console.log(`🔍 Analyzing attachment ${attachmentId}:`, url);

      this.checkFileTypeFromHeaders(url, attachmentId);
    });
  }

  private getFileTypeFromPath(path: string): string {
    if (!path) return 'unknown';

    const extension = this.getFileExtension(this.extractFilenameFromPath(path));

    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(extension)) {
      return 'image';
    } else if (extension === 'pdf') {
      return 'pdf';
    } else if (['xls', 'xlsx', 'csv'].includes(extension)) {
      return 'excel';
    } else if (['doc', 'docx', 'rtf'].includes(extension)) {
      return 'word';
    } else if (['txt', 'log', 'md'].includes(extension)) {
      return 'text';
    }

    return 'file';
  }

  private backToTicketDetail(): void {
    if (this.editTicketNo) {
      this.router.navigate(['/tickets', this.editTicketNo]);
    } else {
      this.router.navigate(['/tickets']);
    }
  }

  private clearEditData(): void {
    if (this.isEditMode && this.editTicketNo) {
      const currentUserId = this.currentUser?.id || this.currentUser?.user_id;
      if (currentUserId) {
        const editStorageKey = `editTicket_${currentUserId}_${this.editTicketNo}`;
        localStorage.removeItem(editStorageKey);
        console.log('Cleared edit data from localStorage');
      }
    }
  }

  // ===== FIXED: File Analysis Methods ===== ✅

  private analyzeAllExistingAttachments(): void {
    if (!this.existingAttachments || this.existingAttachments.length === 0) {
      console.log('No existing attachments to analyze');
      return;
    }

    console.log('🔍 Starting analysis of existing attachments:', this.existingAttachments.length);

    this.existingAttachments.forEach((attachment, index) => {
      console.log(`🔍 Analyzing attachment ${index + 1}:`, {
        id: attachment.attachment_id,
        path: attachment.path,
        filename: attachment.filename
      });

      this.analyzeExistingAttachment(attachment);
    });
  }

  private analyzeExistingAttachment(attachment: any): void {
    if (!attachment || !attachment.attachment_id) {
      console.warn('Invalid attachment data:', attachment);
      return;
    }

    const attachmentId = attachment.attachment_id;

    if (this.attachmentTypes[attachmentId]?.isAnalyzed) {
      console.log('✅ Attachment already analyzed:', attachmentId);
      return;
    }

    this.attachmentTypes[attachmentId] = {
      type: 'file',
      extension: '',
      filename: 'Loading...',
      isLoading: true,
      isAnalyzed: false
    };

    console.log(`🔍 Starting analysis for attachment ID: ${attachmentId}`);

    if (attachment.filename || attachment.file_type) {
      const filename = attachment.filename || this.extractFilenameFromPath(attachment.path);
      const fileType = attachment.file_type || this.getFileTypeFromFilename(filename);

      this.attachmentTypes[attachmentId] = {
        type: this.determineFileCategory(fileType, filename),
        extension: this.getFileExtension(filename),
        filename: filename,
        isLoading: false,
        isAnalyzed: true
      };

      console.log(`✅ File analyzed from API data:`, {
        id: attachmentId,
        filename,
        fileType,
        category: this.attachmentTypes[attachmentId].type,
        extension: this.attachmentTypes[attachmentId].extension
      });

      this.cdr.detectChanges();
      return;
    }

    const filename = this.extractFilenameFromPath(attachment.path);
    const extension = this.getFileExtension(filename);

    if (extension) {
      this.attachmentTypes[attachmentId] = {
        type: this.determineFileCategoryByExtension(extension),
        extension: extension,
        filename: filename,
        isLoading: false,
        isAnalyzed: true
      };

      console.log(`✅ File analyzed from path:`, {
        id: attachmentId,
        filename,
        extension,
        category: this.attachmentTypes[attachmentId].type
      });

      this.cdr.detectChanges();
      return;
    }

    if (attachment.path && attachment.path.startsWith('data:')) {
      const mimeType = this.extractMimeTypeFromDataUrl(attachment.path);
      this.attachmentTypes[attachmentId] = {
        type: this.determineFileCategoryByMimeType(mimeType),
        extension: this.getExtensionFromMimeType(mimeType),
        filename: `attachment_${attachmentId}.${this.getExtensionFromMimeType(mimeType)}`,
        isLoading: false,
        isAnalyzed: true
      };

      console.log(`✅ File analyzed from data URL:`, {
        id: attachmentId,
        mimeType,
        category: this.attachmentTypes[attachmentId].type
      });

      this.cdr.detectChanges();
      return;
    }

    if (attachment.path && (attachment.path.startsWith('http') || attachment.path.startsWith('/'))) {
      this.checkFileTypeFromHeaders(attachment.path, attachmentId);
    } else {
      this.attachmentTypes[attachmentId] = {
        type: 'file',
        extension: '',
        filename: filename || `attachment_${attachmentId}`,
        isLoading: false,
        isAnalyzed: true
      };

      console.log(`⚠️ Using fallback for attachment:`, attachmentId);
      this.cdr.detectChanges();
    }
  }

  private extractFilenameFromPath(path: string): string {
    if (!path || typeof path !== 'string') {
      console.warn('Invalid path provided:', path);
      return 'unknown';
    }

    try {
      if (path.startsWith('data:')) {
        return 'data_file';
      }

      if (path.startsWith('http')) {
        const url = new URL(path);
        const pathname = url.pathname;
        const parts = pathname.split('/');
        const filename = parts[parts.length - 1];
        return decodeURIComponent(filename) || 'unknown';
      }

      const parts = path.split('/');
      const lastPart = parts[parts.length - 1];
      const cleanFilename = lastPart.split('?')[0];

      try {
        return decodeURIComponent(cleanFilename) || 'unknown';
      } catch {
        return cleanFilename || 'unknown';
      }
    } catch (error) {
      console.warn('Error extracting filename from path:', path, error);
      return 'unknown';
    }
  }

  private getFileExtension(filename: string): string {
    if (!filename || filename === 'unknown' || typeof filename !== 'string') {
      return '';
    }

    try {
      const cleanName = filename.split('?')[0];
      const parts = cleanName.split('.');

      if (parts.length > 1) {
        const extension = parts[parts.length - 1].toLowerCase();
        if (/^[a-z0-9]{1,10}$/i.test(extension)) {
          return extension;
        }
      }
      return '';
    } catch (error) {
      console.warn('Error getting file extension:', filename, error);
      return '';
    }
  }

  private getFileTypeFromFilename(filename: string): string {
    const extension = this.getFileExtension(filename);
    return extension || 'unknown';
  }

  private determineFileCategory(fileType: string, filename: string): 'image' | 'pdf' | 'excel' | 'word' | 'text' | 'archive' | 'video' | 'audio' | 'file' {
    const type = (fileType || '').toLowerCase();
    const ext = this.getFileExtension(filename).toLowerCase();

    if (type.includes('image') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff', 'ico'].includes(ext)) {
      return 'image';
    }

    if (type.includes('pdf') || ext === 'pdf') {
      return 'pdf';
    }

    if (type.includes('excel') || type.includes('spreadsheet') || ['xls', 'xlsx', 'csv', 'ods'].includes(ext)) {
      return 'excel';
    }

    if (type.includes('word') || type.includes('document') || ['doc', 'docx', 'rtf', 'odt'].includes(ext)) {
      return 'word';
    }

    if (type.includes('text') || ['txt', 'log', 'md', 'json', 'xml', 'html', 'css', 'js', 'ts', 'csv'].includes(ext)) {
      return 'text';
    }

    if (type.includes('archive') || type.includes('zip') || ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) {
      return 'archive';
    }

    if (type.includes('video') || ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'm4v'].includes(ext)) {
      return 'video';
    }

    if (type.includes('audio') || ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a', 'wma'].includes(ext)) {
      return 'audio';
    }

    return 'file';
  }

  private determineFileCategoryByExtension(extension: string): 'image' | 'pdf' | 'excel' | 'word' | 'text' | 'archive' | 'video' | 'audio' | 'file' {
    const ext = extension.toLowerCase();

    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff', 'ico'].includes(ext)) {
      return 'image';
    }

    if (ext === 'pdf') {
      return 'pdf';
    }

    if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) {
      return 'excel';
    }

    if (['doc', 'docx', 'rtf', 'odt'].includes(ext)) {
      return 'word';
    }

    if (['txt', 'log', 'md', 'json', 'xml', 'html', 'css', 'js', 'ts'].includes(ext)) {
      return 'text';
    }

    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) {
      return 'archive';
    }

    if (['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'm4v'].includes(ext)) {
      return 'video';
    }

    if (['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a', 'wma'].includes(ext)) {
      return 'audio';
    }

    return 'file';
  }

  private extractMimeTypeFromDataUrl(dataUrl: string): string {
    const match = dataUrl.match(/^data:([^;]+)/);
    return match ? match[1] : '';
  }

  private determineFileCategoryByMimeType(mimeType: string): 'image' | 'pdf' | 'excel' | 'word' | 'text' | 'archive' | 'video' | 'audio' | 'file' {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'excel';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'word';
    if (mimeType.startsWith('text/')) return 'text';
    if (mimeType.includes('zip') || mimeType.includes('archive')) return 'archive';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';

    return 'file';
  }

  private getExtensionFromMimeType(mimeType: string): string {
    const mimeToExt: { [key: string]: string } = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
      'application/pdf': 'pdf',
      'application/vnd.ms-excel': 'xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'text/plain': 'txt',
      'application/json': 'json',
      'text/html': 'html',
      'application/zip': 'zip',
      'video/mp4': 'mp4',
      'audio/mpeg': 'mp3'
    };

    return mimeToExt[mimeType] || 'bin';
  }

  private checkFileTypeFromHeaders(url: string, attachmentId: number): void {
    if (!url) {
      this.setFallbackFileType(attachmentId);
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    fetch(url, {
      method: 'HEAD',
      mode: 'cors',
      signal: controller.signal,
      cache: 'no-cache'
    })
      .then(response => {
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const contentType = response.headers.get('content-type');
        const contentDisposition = response.headers.get('content-disposition');

        let filename = `attachment_${attachmentId}`;
        let extension = '';

        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
          if (filenameMatch && filenameMatch[1]) {
            filename = filenameMatch[1].replace(/['"]/g, '');
            try {
              filename = decodeURIComponent(filename);
            } catch {
              // ใช้ filename เดิม
            }
            extension = this.getFileExtension(filename);
          }
        }

        if (!extension && contentType) {
          extension = this.getExtensionFromMimeType(contentType);
          filename = `${filename}.${extension}`;
        }

        const fileCategory = contentType
          ? this.determineFileCategoryByMimeType(contentType)
          : this.determineFileCategoryByExtension(extension);

        this.attachmentTypes[attachmentId] = {
          type: fileCategory,
          extension: extension,
          filename: filename,
          isLoading: false,
          isAnalyzed: true
        };

        console.log(`✅ Analyzed attachment ${attachmentId}:`, {
          contentType,
          filename,
          extension,
          category: fileCategory
        });

        this.cdr.detectChanges();
      })
      .catch(error => {
        clearTimeout(timeoutId);
        console.warn(`⚠️ Could not fetch headers for ${url}:`, error.message);

        this.tryImageLoad(url, attachmentId);
      });
  }

  private looksLikeImageUrl(url: string): boolean {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
    const lowercaseUrl = url.toLowerCase();
    return imageExtensions.some(ext => lowercaseUrl.includes(ext));
  }

  private tryImageLoad(url: string, attachmentId: number): void {
    const img = new Image();
    let timeoutId: any;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      img.onload = null;
      img.onerror = null;
    };

    img.onload = () => {
      cleanup();
      this.attachmentTypes[attachmentId] = {
        type: 'image',
        extension: 'jpg',
        filename: `image_${attachmentId}.jpg`,
        isLoading: false,
        isAnalyzed: true
      };
      console.log(`✅ Attachment ${attachmentId} is image`);
      this.cdr.detectChanges();
    };

    img.onerror = () => {
      cleanup();
      this.setFallbackFileType(attachmentId);
    };

    timeoutId = setTimeout(() => {
      cleanup();
      this.setFallbackFileType(attachmentId);
    }, 3000);

    img.crossOrigin = 'anonymous';
    img.src = url;
  }

  private setFallbackFileType(attachmentId: number, filename?: string): void {
    const fallbackFilename = filename || `file_${attachmentId}`;

    this.attachmentTypes[attachmentId] = {
      type: 'file',
      extension: '',
      filename: fallbackFilename,
      isLoading: false,
      isAnalyzed: true
    };

    console.log(`📄 Using fallback for attachment ${attachmentId}`);
    this.cdr.detectChanges();
  }

  // ===== FIXED: Existing Attachment Preview Methods ===== ✅

  isExistingAttachmentImage(attachment: any): boolean {
    if (!attachment) {
      return false;
    }

    const attachmentId = attachment.attachment_id;

    if (attachmentId && this.attachmentTypes[attachmentId]) {
      const isImage = this.attachmentTypes[attachmentId].type === 'image';
      console.log(`🖼️ Checking if attachment ${attachmentId} is image:`, {
        isImage,
        type: this.attachmentTypes[attachmentId].type,
        filename: this.attachmentTypes[attachmentId].filename
      });
      return isImage;
    }

    if (attachment.path && attachment.path.startsWith('data:image/')) {
      return true;
    }

    const filename = attachment.filename || '';
    const fileType = attachment.file_type || '';

    const isImageByType = fileType.toLowerCase().includes('image');
    const isImageByExtension = /\.(jpg|jpeg|png|gif|webp|bmp|svg|tiff|ico)$/i.test(filename);

    console.log(`🖼️ Fallback image check for attachment ${attachmentId}:`, {
      filename,
      fileType,
      isImageByType,
      isImageByExtension,
      path: attachment.path
    });

    return isImageByType || isImageByExtension;
  }

  getExistingAttachmentIcon(attachment: any): string {
    if (!attachment) return 'bi-file-earmark-fill';

    const attachmentId = attachment.attachment_id;

    if (attachmentId && this.attachmentTypes[attachmentId]) {
      const fileInfo = this.attachmentTypes[attachmentId];

      switch (fileInfo.type) {
        case 'image': return 'bi-image-fill';
        case 'pdf': return 'bi-file-earmark-pdf-fill';
        case 'excel': return 'bi-file-earmark-excel-fill';
        case 'word': return 'bi-file-earmark-word-fill';
        case 'text': return 'bi-file-earmark-text-fill';
        case 'archive': return 'bi-file-earmark-zip-fill';
        case 'video': return 'bi-file-earmark-play-fill';
        case 'audio': return 'bi-file-earmark-music-fill';
        default: return 'bi-file-earmark-fill';
      }
    }

    const filename = attachment.filename || '';
    const fileType = attachment.file_type || '';

    if (fileType.includes('image') || filename.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i)) {
      return 'bi-image-fill';
    }

    if (fileType.includes('pdf') || filename.match(/\.pdf$/i)) {
      return 'bi-file-earmark-pdf-fill';
    }

    if (fileType.includes('excel') || fileType.includes('spreadsheet') || filename.match(/\.(xls|xlsx|csv)$/i)) {
      return 'bi-file-earmark-excel-fill';
    }

    if (fileType.includes('word') || fileType.includes('document') || filename.match(/\.(doc|docx|rtf)$/i)) {
      return 'bi-file-earmark-word-fill';
    }

    if (fileType.includes('text') || filename.match(/\.(txt|log|md|json|xml)$/i)) {
      return 'bi-file-earmark-text-fill';
    }

    return 'bi-file-earmark-fill';
  }

  getExistingAttachmentDisplayName(attachment: any): string {
    if (!attachment) return 'Unknown file';

    const attachmentId = attachment.attachment_id;

    if (attachmentId && this.attachmentTypes[attachmentId]) {
      return this.attachmentTypes[attachmentId].filename;
    }

    return attachment.filename || this.extractFilenameFromPath(attachment.path) || 'Unknown file';
  }

  getExistingAttachmentFileInfo(attachmentId: number): {
    type: string;
    extension: string;
    filename: string;
    isLoading: boolean;
    icon: string;
  } {
    const fileInfo = this.attachmentTypes[attachmentId];

    if (fileInfo) {
      return {
        type: fileInfo.type,
        extension: fileInfo.extension,
        filename: fileInfo.filename,
        isLoading: fileInfo.isLoading || false,
        icon: this.getExistingAttachmentIcon({ attachment_id: attachmentId })
      };
    }

    return {
      type: 'unknown',
      extension: '',
      filename: 'Unknown file',
      isLoading: false,
      icon: 'bi-file-earmark-fill'
    };
  }

  formatExistingAttachmentSize(attachment: any): string {
    if (attachment && attachment.file_size) {
      return this.formatFileSize(attachment.file_size);
    }
    return '';
  }

  onExistingAttachmentImageError(attachmentId: number): void {
    console.log(`❌ Image failed to load for existing attachment ${attachmentId}`);

    if (this.attachmentTypes[attachmentId]) {
      this.attachmentTypes[attachmentId].type = 'file';
      this.attachmentTypes[attachmentId].isAnalyzed = true;

      console.log(`📄 Changed attachment ${attachmentId} from image to file type`);
      this.cdr.detectChanges();
    }
  }

  onExistingAttachmentImageLoad(attachmentId: number): void {
    console.log(`✅ Image loaded successfully for existing attachment ${attachmentId}`);

    if (this.attachmentTypes[attachmentId]) {
      this.attachmentTypes[attachmentId].type = 'image';
      this.attachmentTypes[attachmentId].isAnalyzed = true;

      console.log(`✅ Confirmed attachment ${attachmentId} as image type`);
      this.cdr.detectChanges();
    }
  }

  hasExistingAttachments(): boolean {
    const hasAttachments = this.isEditMode && this.existingAttachments && this.existingAttachments.length > 0;
    console.log('📎 Checking existing attachments:', {
      isEditMode: this.isEditMode,
      attachmentsCount: this.existingAttachments?.length || 0,
      hasAttachments
    });
    return hasAttachments;
  }

  isAttachmentDeleting(attachmentId: number): boolean {
    return this.deletingAttachmentIds.has(attachmentId);
  }

  // ===== FIXED: Attachment Management Methods ===== ✅

  removeExistingAttachment(index: number, attachment?: any): void {
    const attachmentToDelete = attachment || this.existingAttachments[index];

    if (!attachmentToDelete || !attachmentToDelete.attachment_id) {
      console.error('Invalid attachment data:', attachmentToDelete);
      this.showFileUploadError('ไม่สามารถลบไฟล์ได้: ข้อมูลไฟล์ไม่ถูกต้อง');
      return;
    }

    const filename = this.getExistingAttachmentDisplayName(attachmentToDelete);

    if (!confirm(`คุณต้องการลบไฟล์ "${filename}" หรือไม่?`)) {
      return;
    }

    const attachmentId = attachmentToDelete.attachment_id;

    this.deletingAttachmentIds.add(attachmentId);

    console.log('Removing existing attachment:', attachmentToDelete);

    this.apiService.deleteAttachment(attachmentId).subscribe({
      next: (response) => {
        console.log('Delete attachment response:', response);

        this.deletingAttachmentIds.delete(attachmentId);

        if (response.code === 1 || response.code === 200) {
          this.existingAttachments.splice(index, 1);
          delete this.attachmentTypes[attachmentId];

          this.showFileUploadSuccess(`ลบไฟล์ "${filename}" สำเร็จ`);
          this.cdr.detectChanges();

          console.log('Attachment deleted successfully');
        } else {
          this.showFileUploadError(response.message || 'ไม่สามารถลบไฟล์ได้');
        }
      },
      error: (error) => {
        console.error('Error deleting attachment:', error);

        this.deletingAttachmentIds.delete(attachmentId);

        let errorMessage = 'เกิดข้อผิดพลาดในการลบไฟล์';
        if (typeof error === 'string') {
          errorMessage = error;
        } else if (error?.message) {
          errorMessage = error.message;
        }

        this.showFileUploadError(errorMessage);
      }
    });
  }

  downloadExistingAttachment(attachment: any): void {
    if (!attachment || !attachment.path) {
      this.showFileUploadError('ไม่สามารถดาวน์โหลดไฟล์ได้: ไม่พบที่อยู่ไฟล์');
      return;
    }

    const filename = this.getExistingAttachmentDisplayName(attachment);

    console.log('Downloading existing attachment:', attachment);

    try {
      if (attachment.path.startsWith('data:')) {
        const link = document.createElement('a');
        link.href = attachment.path;
        link.download = filename || `attachment_${attachment.attachment_id}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else if (attachment.path.startsWith('http')) {
        window.open(attachment.path, '_blank');
      } else {
        const apiUrl = this.apiService['apiUrl'] || '/api';
        const fullUrl = `${apiUrl}/${attachment.path}`;
        window.open(fullUrl, '_blank');
      }
    } catch (error) {
      console.error('Error downloading attachment:', error);
      this.showFileUploadError('เกิดข้อผิดพลาดในการดาวน์โหลดไฟล์');
    }
  }

  // ===== Bulk Selection Methods ===== ✅

  toggleAttachmentSelection(attachmentId: number): void {
    if (this.selectedAttachmentIds.has(attachmentId)) {
      this.selectedAttachmentIds.delete(attachmentId);
    } else {
      this.selectedAttachmentIds.add(attachmentId);
    }
  }

  isAttachmentSelected(attachmentId: number): boolean {
    return this.selectedAttachmentIds.has(attachmentId);
  }

  removeSelectedAttachments(): void {
    const selectedIds = Array.from(this.selectedAttachmentIds);
    if (selectedIds.length > 0) {
      this.removeMultipleExistingAttachments(selectedIds);
      this.selectedAttachmentIds.clear();
    }
  }

  selectAllAttachments(): void {
    this.existingAttachments.forEach(att => {
      if (att.attachment_id) {
        this.selectedAttachmentIds.add(att.attachment_id);
      }
    });
  }

  clearAttachmentSelection(): void {
    this.selectedAttachmentIds.clear();
  }

  get hasSelectedAttachments(): boolean {
    return this.selectedAttachmentIds.size > 0;
  }

  get selectedAttachmentCount(): number {
    return this.selectedAttachmentIds.size;
  }

  removeMultipleExistingAttachments(attachmentIds: number[]): void {
    if (attachmentIds.length === 0) return;

    if (!confirm(`คุณต้องการลบไฟล์ ${attachmentIds.length} ไฟล์หรือไม่?`)) {
      return;
    }

    attachmentIds.forEach(id => this.deletingAttachmentIds.add(id));

    const deletePromises = attachmentIds.map(attachmentId =>
      this.apiService.deleteAttachment(attachmentId).toPromise()
    );

    Promise.allSettled(deletePromises).then(results => {
      let successCount = 0;
      let errorCount = 0;

      results.forEach((result, index) => {
        const attachmentId = attachmentIds[index];

        this.deletingAttachmentIds.delete(attachmentId);

        if (result.status === 'fulfilled' && result.value?.code === 1) {
          successCount++;
          const attachmentIndex = this.existingAttachments.findIndex(
            att => att.attachment_id === attachmentId
          );
          if (attachmentIndex > -1) {
            this.existingAttachments.splice(attachmentIndex, 1);
          }
          delete this.attachmentTypes[attachmentId];
        } else {
          errorCount++;
        }
      });

      if (successCount > 0) {
        this.showFileUploadSuccess(`ลบไฟล์สำเร็จ ${successCount} ไฟล์`);
      }

      if (errorCount > 0) {
        this.showFileUploadError(`ไม่สามารถลบไฟล์ได้ ${errorCount} ไฟล์`);
      }

      this.cdr.detectChanges();
    });
  }

  // ===== EXISTING METHODS (ส่วนที่เหลือ) ===== ✅

  // ✅ แทนที่ทั้ง method
  private restoreIncompleteTicket(): void {
    if (this.isEditMode) return;

    try {
      const currentUserId = this.currentUser?.id || this.currentUser?.user_id;
      if (!currentUserId) {
        console.log('No current user ID found');
        return;
      }

      const savedTicketData = localStorage.getItem(`incompleteTicket_${currentUserId}`);
      if (savedTicketData) {
        const ticketData = JSON.parse(savedTicketData);
        console.log('🔄 Found incomplete ticket for user:', currentUserId, ticketData);

        if (ticketData.userId !== currentUserId) {
          console.log('User ID mismatch, clearing data');
          localStorage.removeItem(`incompleteTicket_${currentUserId}`);
          return;
        }

        const savedTime = ticketData.timestamp;
        const currentTime = new Date().getTime();
        const hoursDiff = (currentTime - savedTime) / (1000 * 60 * 60);

        if (hoursDiff > 24) {
          console.log('Ticket data too old, clearing');
          localStorage.removeItem(`incompleteTicket_${currentUserId}`);
          return;
        }

        // ✅ อัปเดตข้อมูลพื้นฐาน
        this.ticketId = ticketData.ticketId;
        this.ticket_no = ticketData.ticket_no;
        this.isTicketCreated = ticketData.isTicketCreated;

        // ✅ อัปเดต form values
        this.ticketForm.patchValue({
          projectId: ticketData.formData.projectId,
          categoryId: ticketData.formData.categoryId,
          issueDescription: ticketData.formData.issueDescription
        });

        // ✅ CRITICAL: อัปเดต selectedProject และ selectedCategory สำหรับ Dropdown Components
        this.selectedProject = ticketData.selectedProject;
        this.selectedCategory = ticketData.selectedCategory;

        console.log('✅ Restored form data:', {
          projectId: ticketData.formData.projectId,
          categoryId: ticketData.formData.categoryId,
          selectedProject: this.selectedProject,
          selectedCategory: this.selectedCategory
        });

        // ✅ CRITICAL: ดึงข้อมูล Attachments จาก API ถ้ามี ticketId
        if (this.isTicketCreated && this.ticketId) {
          console.log('🔄 Loading attachments for ticket:', this.ticket_no);
          this.loadExistingAttachments(this.ticketId);
        }

        // ✅ อัปเดต UI หลัง delay สั้นๆ เพื่อให้ Angular render เสร็จก่อน
        setTimeout(() => {
          this.updateUIFromRestoredData(ticketData);

          // ✅ CRITICAL: Force Change Detection สำหรับ Child Components
          this.cdr.detectChanges();
        }, 300);

        if (this.isTicketCreated) {
          this.addSuccessState();
          console.log('✅ Restored incomplete ticket:', this.ticket_no);
        }
      }
    } catch (error) {
      console.error('Error restoring incomplete ticket:', error);
      const currentUserId = this.currentUser?.id || this.currentUser?.user_id;
      if (currentUserId) {
        localStorage.removeItem(`incompleteTicket_${currentUserId}`);
      }
    }
  }

  // ✅ เพิ่ม method ใหม่ทั้งหมดตรงนี้
  private loadExistingAttachments(ticketId: number): void {
    console.log('📎 Loading existing attachments for ticket ID:', ticketId);

    // ✅ ใช้ ticket_no ในการเรียก API
    if (!this.ticket_no) {
      console.warn('No ticket_no available, skipping attachment load');
      return;
    }

    this.apiService.getTicketData({ ticket_no: this.ticket_no }).subscribe({
      next: (response) => {
        console.log('✅ Loaded ticket data for attachments:', response);

        if (response.code === 1 && response.data && response.data.issue_attachment) {
          // ✅ อัปเดต existing attachments
          this.existingAttachments = response.data.issue_attachment.map((att: any) => {
            const attachmentId = att.attachment_id;

            // ✅ เริ่มต้นด้วย loading state
            this.attachmentTypes[attachmentId] = {
              type: 'file',
              extension: '',
              filename: `Attachment ${attachmentId}`,
              isLoading: true,
              isAnalyzed: false
            };

            return {
              attachment_id: attachmentId,
              path: att.path,
              filename: att.filename || null,
              file_type: att.file_type || null,
              file_size: att.file_size || null
            };
          });

          console.log('✅ Loaded attachments:', this.existingAttachments.length);

          // ✅ วิเคราะห์ไฟล์ทั้งหมด
          setTimeout(() => {
            this.analyzeAttachmentsFromUrls();
            this.cdr.detectChanges();
          }, 100);

        } else {
          console.log('No attachments found for this ticket');
          this.existingAttachments = [];
        }
      },
      error: (error) => {
        console.error('❌ Error loading attachments:', error);
        this.existingAttachments = [];
      }
    });
  }

  // ✅ แทนที่ method เดิมด้วยโค้ดนี้
  private updateUIFromRestoredData(ticketData: any): void {
    if (ticketData.formData.issueDescription) {
      const richEditor = document.querySelector('.rich-editor') as HTMLElement;
      if (richEditor) {
        richEditor.innerHTML = ticketData.formData.issueDescription;
      }
    }

    // ✅ CRITICAL: อัปเดต validity ของ form controls
    this.ticketForm.get('projectId')?.updateValueAndValidity();
    this.ticketForm.get('categoryId')?.updateValueAndValidity();
    this.ticketForm.get('issueDescription')?.updateValueAndValidity();

    console.log('✅ UI updated from restored data');
  }

  private saveIncompleteTicket(): void {
    if (this.isEditMode) return;

    if (this.isTicketCreated && this.ticketId) {
      const currentUserId = this.currentUser?.id || this.currentUser?.user_id;
      if (!currentUserId) {
        console.log('No current user ID, cannot save ticket');
        return;
      }

      const ticketData = {
        userId: currentUserId,
        ticketId: this.ticketId,
        ticket_no: this.ticket_no,
        isTicketCreated: this.isTicketCreated,
        formData: {
          projectId: this.ticketForm.get('projectId')?.value,
          categoryId: this.ticketForm.get('categoryId')?.value,
          issueDescription: this.ticketForm.get('issueDescription')?.value
        },
        selectedProject: this.selectedProject,
        selectedCategory: this.selectedCategory,
        timestamp: new Date().getTime()
      };

      localStorage.setItem(`incompleteTicket_${currentUserId}`, JSON.stringify(ticketData));
      console.log('Saved incomplete ticket to localStorage for user:', currentUserId);
    }
  }

  private clearIncompleteTicket(): void {
    if (this.isEditMode) return;

    const currentUserId = this.currentUser?.id || this.currentUser?.user_id;
    if (currentUserId) {
      localStorage.removeItem(`incompleteTicket_${currentUserId}`);
      console.log('Cleared incomplete ticket from localStorage for user:', currentUserId);
    }
  }

  // ===== REST OF THE METHODS (เหมือนเดิม) ===== ✅

  onProjectChange(event: { project: any, projectId: string | number }): void {
    this.selectedProject = event.project;
    this.ticketForm.patchValue({ projectId: event.projectId });

    if (event.projectId && this.validationErrors['projectId']) {
      this.validationErrors['projectId'] = false;
    }

    console.log('Project selected:', event);

    // ✅ REMOVED: ไม่ต้องเรียก onFormCompleted() ที่นี่ เพราะ valueChanges จะเรียกให้อัตโนมัติ
    // if (!this.isEditMode) {
    //   this.onFormCompleted();
    // }
  }

  onCategoryChange(event: { category: any, categoryId: string | number }): void {
    this.selectedCategory = event.category;
    this.ticketForm.patchValue({ categoryId: event.categoryId });

    if (event.categoryId && this.validationErrors['categoryId']) {
      this.validationErrors['categoryId'] = false;
    }

    console.log('Category selected:', event);

    // ✅ REMOVED: ไม่ต้องเรียก onFormCompleted() ที่นี่ เพราะ valueChanges จะเรียกให้อัตโนมัติ
    // if (!this.isEditMode) {
    //   this.onFormCompleted();
    // }
  }

  // ✅ ENHANCED: ปรับปรุง onFormCompleted() ให้รองรับทั้ง create และ update draft
  onFormCompleted(): void {
    // ✅ ไม่ทำอะไรในโหมด Edit
    if (this.isEditMode) {
      console.log('⏭️ Skipping auto-save in edit mode');
      return;
    }

    // ✅ ป้องกันการเรียกซ้ำ
    if (this.isAutoSaving) {
      console.log('⏭️ Already auto-saving, skipping...');
      return;
    }

    // ✅ Validate form
    const validation = this.validateFormForAutoSave();

    if (!validation.isValid) {
      console.log('⏭️ Form incomplete, skipping auto-save:', validation.errors);
      return;
    }

    console.log('✅ Form validation passed');

    // ✅ ตรวจสอบว่ามี Draft Ticket อยู่แล้วหรือไม่
    if (this.isTicketCreated && this.ticketId) {
      // ✅ มี Draft แล้ว → อัปเดต Draft
      console.log('📝 Updating existing draft ticket:', this.ticket_no);
      this.updateTicketDraft();
    } else {
      // ✅ ยังไม่มี Draft → สร้าง Draft ใหม่
      console.log('🆕 Creating new draft ticket...');
      this.createTicketAutomatically();
    }
  }

  private validateFormForAutoSave(): { isValid: boolean; errors?: string[] } {
    const projectId = this.ticketForm.get('projectId')?.value;
    const categoryId = this.ticketForm.get('categoryId')?.value;
    const issueDescription = this.ticketForm.get('issueDescription')?.value;

    const errors: string[] = [];

    if (!projectId || projectId === '') {
      errors.push('กรุณาเลือก Project');
    }

    if (!categoryId || categoryId === '') {
      errors.push('กรุณาเลือก Category');
    }

    if (!issueDescription || issueDescription.trim().length < 10) {
      errors.push('กรุณากรอกรายละเอียด Issue อย่างน้อย 10 ตัวอักษร');
    }

    const isValid = errors.length === 0;
    return { isValid, errors };
  }

  private sendNewTicketNotification(ticketNo: string): void {
    console.log('📤 Sending new ticket notification for:', ticketNo);

    this.notificationService.notifyTicketChanges({
      ticket_no: ticketNo,
      isNewTicket: true
    }).subscribe({
      next: (response) => {
        console.log('✅ New ticket notification sent successfully:', response);
      },
      error: (error) => {
        console.warn('⚠️ Failed to send notification (non-critical):', error);
      }
    });
  }

  private createTicketAutomatically(): void {
    if (this.isEditMode) return;

    // ✅ ป้องกันการเรียกซ้ำ
    if (this.isAutoSaving || this.isSubmitting) {
      console.log('⏭️ Already creating ticket, skipping...');
      return;
    }

    this.isAutoSaving = true;
    this.isSubmitting = true;

    const formData = this.ticketForm.value;

    const ticketData = {
      project_id: parseInt(formData.projectId),
      categories_id: parseInt(formData.categoryId),
      issue_description: formData.issueDescription
    };

    console.log('🆕 Auto-creating ticket with data:', ticketData);

    this.apiService.saveTicket(ticketData).subscribe({
      next: (response) => {
        console.log('saveTicket response:', response);

        if (response.code === 1) {
          this.ticketId = response.ticket_id;
          this.ticket_no = response.ticket_no;
          this.isTicketCreated = true;

          console.log('✅ Ticket created successfully:', {
            ticketId: this.ticketId,
            ticket_no: this.ticket_no
          });

          this.showSuccessMessage(`Ticket ${this.ticket_no} created successfully!`);
          this.addSuccessState();

          this.saveIncompleteTicket();

        } else {
          this.onAutoCreateError('Failed to create ticket: ' + response.message);
        }

        this.isSubmitting = false;
        this.isAutoSaving = false;
      },
      error: (error) => {
        console.error('❌ Error auto-creating ticket:', error);
        this.onAutoCreateError('เกิดข้อผิดพลาดในการสร้างตั๋ว');
        this.isSubmitting = false;
        this.isAutoSaving = false;
      }
    });
  }

  // ✅ NEW: อัปเดต Draft Ticket เมื่อมีการเปลี่ยนแปลงข้อมูล
  private updateTicketDraft(): void {
    if (this.isEditMode || !this.ticketId) {
      console.log('⏭️ Skipping draft update (edit mode or no ticket ID)');
      return;
    }

    // ✅ ป้องกันการเรียกซ้ำ
    if (this.isAutoSaving || this.isSubmitting) {
      console.log('⏭️ Already updating draft, skipping...');
      return;
    }

    this.isAutoSaving = true;

    const formData = this.ticketForm.value;

    const updateData = {
      project_id: parseInt(formData.projectId),
      categories_id: parseInt(formData.categoryId),
      issue_description: formData.issueDescription
    };

    console.log('📝 Auto-updating draft ticket:', this.ticket_no, updateData);

    this.apiService.updateTicketData(this.ticketId, updateData).subscribe({
      next: (response) => {
        console.log('✅ Draft ticket updated successfully:', response);

        if (response.code === 1) {
          // ✅ อัปเดต localStorage
          this.saveIncompleteTicket();

          console.log('✅ Draft updated:', this.ticket_no);
        } else {
          console.warn('⚠️ Draft update returned non-success code:', response);
        }

        this.isAutoSaving = false;
      },
      error: (error) => {
        console.error('❌ Error updating draft ticket:', error);
        // ✅ ไม่แสดง error ให้ user เพราะเป็น auto-save
        this.isAutoSaving = false;
      }
    });
  }

  private onAutoCreateError(error: any): void {
    let message = 'เกิดข้อผิดพลาดในการสร้างตั๋ว';

    if (typeof error === 'string') {
      message = error;
    } else if (error && error.message) {
      message = error.message;
    }

    console.error('Auto-create error:', error);

    this.alertMessage = message;
    this.alertType = 'error';
    this.showCustomAlert = true;

    this.isTicketCreated = false;
    this.ticketId = null;
    this.ticket_no = '';
  }

  private showSuccessMessage(message: string): void {
    console.log('Success:', message);
  }

  private addSuccessState(): void {
    setTimeout(() => {
      const form = document.querySelector('.ticket-form');
      const richEditor = document.querySelector('.rich-text-editor-container');

      if (form) form.classList.add('success');
      if (richEditor) richEditor.classList.add('success');

      if (this.selectedFiles.length > 0) {
        const fileUploadArea = document.querySelector('.file-upload-area');
        if (fileUploadArea) fileUploadArea.classList.add('has-files');
      }
    }, 100);
  }

  // ===== UPDATE & FILE UPLOAD METHODS (เหมือนเดิม) ===== ✅

  private updateExistingTicket(): void {
    if (!this.ticketId) {
      console.error('No ticket ID for update');
      return;
    }

    this.isSubmitting = true;

    const formData = this.ticketForm.value;

    const updateData = {
      project_id: parseInt(formData.projectId),
      categories_id: parseInt(formData.categoryId),
      issue_description: formData.issueDescription
    };

    console.log('Updating existing ticket with data:', updateData);

    this.apiService.updateTicketData(this.ticketId, updateData).subscribe({
      next: (response) => {
        console.log('updateTicketData response:', response);

        if (response.code === 1) {
          console.log('Ticket updated successfully');

          const newFilesToUpload = this.selectedFiles.filter(file =>
            !this.uploadedFileNames.includes(file.name) &&
            !this.uploadingFileNames.includes(file.name)
          );

          console.log('Files to upload after ticket update:', {
            totalSelectedFiles: this.selectedFiles.length,
            newFilesToUpload: newFilesToUpload.length,
            alreadyUploaded: this.uploadedFileNames.length,
            currentlyUploading: this.uploadingFileNames.length
          });

          if (newFilesToUpload.length > 0) {
            console.log('Uploading new files:', newFilesToUpload.map(f => f.name));
            this.uploadFilesToExistingTicket(newFilesToUpload);
            this.waitForFileUploadsToComplete();
          } else {
            console.log('No new files to upload, completing immediately');
            this.completeTicketUpdateSuccess(0, 0);
          }
        } else {
          this.onUpdateError('Failed to update ticket: ' + response.message);
        }
      },
      error: (error) => {
        console.error('Error updating ticket:', error);
        this.onUpdateError('เกิดข้อผิดพลาดในการอัปเดตตั๋ว');
      }
    });
  }

  private waitForFileUploadsToComplete(): void {
    console.log('Starting file upload monitoring...');

    let checkCount = 0;
    const maxChecks = 60;

    const checkInterval = setInterval(() => {
      checkCount++;

      const stillUploading = this.uploadingFileNames.length > 0;
      const totalSelectedFiles = this.selectedFiles.length;
      const successfulUploads = this.uploadedFileNames.length;
      const failedUploads = this.errorFileNames.length;
      const completedFiles = successfulUploads + failedUploads;

      console.log(`Upload monitoring (${checkCount}/${maxChecks}):`, {
        stillUploading,
        totalSelectedFiles,
        successfulUploads,
        failedUploads,
        completedFiles,
        uploadingFiles: this.uploadingFileNames,
        uploadedFiles: this.uploadedFileNames,
        errorFiles: this.errorFileNames
      });

      const allFilesProcessed = !stillUploading && (completedFiles >= totalSelectedFiles || totalSelectedFiles === 0);
      const timeoutReached = checkCount >= maxChecks;

      if (allFilesProcessed || timeoutReached) {
        clearInterval(checkInterval);

        if (timeoutReached) {
          console.warn('File upload monitoring timeout reached, proceeding anyway');
        }

        console.log('Final upload status:', {
          successfulUploads,
          failedUploads,
          totalFiles: totalSelectedFiles
        });

        if (totalSelectedFiles === 0) {
          this.completeTicketUpdateSuccess(0, 0);
        } else if (failedUploads === 0 && successfulUploads > 0) {
          this.completeTicketUpdateSuccess(successfulUploads, failedUploads);
        } else if (successfulUploads > 0 && failedUploads > 0) {
          this.completeTicketUpdatePartial(successfulUploads, failedUploads);
        } else if (failedUploads > 0) {
          this.completeTicketUpdateWithError(failedUploads);
        } else {
          this.completeTicketUpdateSuccess(successfulUploads, failedUploads);
        }
      }
    }, 500);
  }

  private completeTicketUpdateSuccess(successfulUploads: number, failedUploads: number): void {
    console.log('✅ Ticket update completed successfully');
    this.clearEditData();

    let message = `อัปเดตตั๋วสำเร็จ\nหมายเลขตั๋ว: ${this.ticket_no}`;

    if (successfulUploads > 0 && failedUploads === 0) {
      message += `\n\nอัปโหลดไฟล์สำเร็จ: ${successfulUploads} ไฟล์`;
    } else if (successfulUploads > 0 && failedUploads > 0) {
      message += `\n\nอัปโหลดไฟล์สำเร็จ: ${successfulUploads} ไฟล์`;
      message += `\nอัปโหลดไฟล์ล้มเหลว: ${failedUploads} ไฟล์`;
    } else if (failedUploads > 0) {
      message += `\n\n⚠️ อัปโหลดไฟล์ล้มเหลว: ${failedUploads} ไฟล์`;
    }

    this.alertMessage = message;
    this.alertType = successfulUploads > 0 ? 'success' : 'error';
    this.showCustomAlert = true;
    this.isSubmitting = false;

    this.autoNavigationTimer = setTimeout(() => {
      if (this.ticket_no && !this.isNavigating) {
        this.navigateToTicketDetail();
      }
    }, 3000);
  }

  private completeTicketUpdatePartial(successfulUploads: number, failedUploads: number): void {
    console.log('Completing ticket update - partial success');
    this.clearEditData();

    let message = `อัปเดตตั๋วสำเร็จ\nหมายเลขตั๋ว: ${this.ticket_no}`;
    message += `\n\nอัปโหลดไฟล์สำเร็จ: ${successfulUploads} ไฟล์`;
    message += `\nอัปโหลดไฟล์ล้มเหลว: ${failedUploads} ไฟล์`;

    this.alertMessage = message;
    this.alertType = 'success';
    this.showCustomAlert = true;
    this.isSubmitting = false;

    this.autoNavigationTimer = setTimeout(() => {
      if (this.ticket_no && !this.isNavigating) {
        this.navigateToTicketDetail();
      }
    }, 3000);
  }

  private completeTicketUpdateWithError(failedUploads: number): void {
    console.log('Completing ticket update - upload errors');

    this.isSubmitting = false;
    this.alertMessage = `อัปเดตตั๋วสำเร็จ แต่ไฟล์ ${failedUploads} ไฟล์อัปโหลดไม่สำเร็จ`;
    this.alertType = 'error';
    this.showCustomAlert = true;
  }

  private onUpdateError(error: any): void {
    let message = 'เกิดข้อผิดพลาดในการอัปเดตตั๋ว';

    if (typeof error === 'string') {
      message = error;
    } else if (error && error.message) {
      message = error.message;
    }

    console.error('Update error:', error);

    this.alertMessage = message;
    this.alertType = 'error';
    this.showCustomAlert = true;
    this.isSubmitting = false;
  }

  getPageTitle(): string {
    return this.isEditMode ? 'Edit Ticket' : 'New Ticket';
  }

  getSubmitButtonText(): string {
    if (this.isSubmitting) {
      return this.isEditMode ? 'Updating Ticket...' : 'Creating Ticket...';
    }
    return this.isEditMode ? 'Update Ticket' : 'New Ticket';
  }

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;

    if (!this.isEditMode) {
      const validation = this.validateFormForAutoSave();
      if (!validation.isValid) {
        input.value = '';

        this.alertMessage = 'กรุณากรอกข้อมูลให้ครบก่อน';
        this.alertType = 'error';
        this.showCustomAlert = true;

        this.showValidationErrors = true;
        this.markFieldsAsInvalid();

        return;
      }
    }

    if (input.files) {
      const newFiles = Array.from(input.files);

      this.fileErrors = [];

      const uniqueNewFiles = newFiles.filter(newFile =>
        !this.selectedFiles.some(existingFile =>
          existingFile.name === newFile.name && existingFile.size === newFile.size
        )
      );

      if (uniqueNewFiles.length === 0) {
        console.log('All selected files are duplicates');
        input.value = '';
        this.showFileUploadError('ไฟล์ที่เลือกมีอยู่แล้ว');
        return;
      }

      const totalFiles = this.getTotalAttachmentCount() + uniqueNewFiles.length;
      const maxFiles = 5;

      if (totalFiles > maxFiles) {
        this.showFileUploadError(`สามารถแนบไฟล์ได้สูงสุด ${maxFiles} ไฟล์เท่านั้น (ปัจจุบันมี ${this.getTotalAttachmentCount()} ไฟล์)`);
        input.value = '';
        return;
      }

      const allFiles = [...this.selectedFiles, ...uniqueNewFiles];
      const fileValidation = this.ticketService.validateFiles(allFiles);

      if (!fileValidation.isValid) {
        this.fileErrors = fileValidation.errors;
        input.value = '';
        return;
      }

      uniqueNewFiles.forEach(file => {
        this.uploadedFileNames = this.uploadedFileNames.filter(name => name !== file.name);
        this.uploadingFileNames = this.uploadingFileNames.filter(name => name !== file.name);
        this.errorFileNames = this.errorFileNames.filter(name => name !== file.name);
      });

      const imagePromises = uniqueNewFiles
        .filter(file => this.isImageFile(file))
        .map(file =>
          this.ticketService.createImagePreview(file)
            .then(url => this.filePreviewUrls[file.name] = url)
            .catch(err => console.warn('Failed to create preview for', file.name, err))
        );

      Promise.all(imagePromises).then(() => {
        this.selectedFiles = [...this.selectedFiles, ...uniqueNewFiles];
        this.ticketForm.patchValue({ attachments: this.selectedFiles });
        console.log('Files selected. Total files:', this.getTotalAttachmentCount());

        if (this.isTicketCreated && this.ticketId && !this.isEditMode) {
          this.uploadFilesToExistingTicket(uniqueNewFiles);
        }
      }).catch(error => {
        console.error('Error processing file selection:', error);
        this.showFileUploadError('เกิดข้อผิดพลาดในการเลือกไฟล์');
      });

      input.value = '';
    }
  }

  private uploadFilesToExistingTicket(files: File[]): void {
    if (!this.ticketId || files.length === 0) {
      return;
    }

    console.log('Uploading files to existing ticket:', this.ticketId);

    const filesToUpload = files.filter(file =>
      !this.uploadingFileNames.includes(file.name) &&
      !this.uploadedFileNames.includes(file.name)
    );

    if (filesToUpload.length === 0) {
      console.log('No new files to upload');
      return;
    }

    filesToUpload.forEach(file => {
      this.errorFileNames = this.errorFileNames.filter(name => name !== file.name);
      if (!this.uploadingFileNames.includes(file.name)) {
        this.uploadingFileNames.push(file.name);
      }
    });

    this.startFileUploadTimeout(filesToUpload);

    const attachmentData = {
      ticket_id: this.ticketId,
      files: filesToUpload,
      project_id: parseInt(this.ticketForm.get('projectId')?.value),
      categories_id: parseInt(this.ticketForm.get('categoryId')?.value),
      issue_description: this.ticketForm.get('issueDescription')?.value,
      type: 'reporter'
    };

    console.log('Uploading files:', filesToUpload.map(f => f.name));

    this.apiService.updateAttachment(attachmentData).subscribe({
      next: (response) => {
        console.log('updateAttachment response:', response);
        this.clearFileUploadTimeout();

        const isSuccess = (
          response.code === 1 ||
          response.code === 200 ||
          response.code === 201
        );

        if (isSuccess) {
          let successCount = 0;
          let failedCount = 0;

          if (response.data && Array.isArray(response.data)) {
            successCount = response.data.length;
          } else if ((response as any).uploaded_files) {
            successCount = (response as any).uploaded_files.length;
          } else if ((response as any).success_count !== undefined) {
            successCount = (response as any).success_count;
          } else {
            successCount = filesToUpload.length;
          }

          if ((response as any).failed_files) {
            failedCount = (response as any).failed_files.length;
          } else if ((response as any).error_count !== undefined) {
            failedCount = (response as any).error_count;
          } else {
            failedCount = filesToUpload.length - successCount;
          }

          console.log('Upload result:', {
            total: filesToUpload.length,
            success: successCount,
            failed: failedCount
          });

          filesToUpload.forEach((file, index) => {
            if (index < successCount) {
              this.markFileAsUploaded(file.name);
            } else {
              this.markFileAsError(file.name);
            }
          });

          if (failedCount === 0) {
            this.showFileUploadSuccess(`อัปโหลดไฟล์ ${successCount} ไฟล์สำเร็จ`);
          } else if (successCount > 0) {
            this.showFileUploadSuccess(`อัปโหลดไฟล์สำเร็จ ${successCount} ไฟล์`);
            this.showFileUploadError(`อัปโหลดไฟล์ล้มเหลว ${failedCount} ไฟล์`);
          } else {
            this.handleFileUploadError(filesToUpload, 'อัปโหลดไฟล์ล้มเหลวทั้งหมด');
          }

        } else {
          const errorMessage = (response as any).message ||
            response.message ||
            'เกิดข้อผิดพลาดในการอัปโหลดไฟล์';
          this.handleFileUploadError(filesToUpload, errorMessage);
        }
      },
      error: (error) => {
        console.error('File upload error:', error);
        this.clearFileUploadTimeout();

        let errorMessage = 'เกิดข้อผิดพลาดในการอัปโหลดไฟล์';
        if (error?.error?.message) {
          errorMessage = error.error.message;
        } else if (error?.message) {
          errorMessage = error.message;
        }

        this.handleFileUploadError(filesToUpload, errorMessage);
      }
    });
  }

  private startFileUploadTimeout(files: File[]): void {
    this.clearFileUploadTimeout();

    this.fileUploadTimeoutTimer = setTimeout(() => {
      console.warn('File upload timeout reached for files:', files.map(f => f.name));

      files.forEach(file => {
        if (this.uploadingFileNames.includes(file.name)) {
          this.markFileAsError(file.name);
        }
      });

      this.showFileUploadError('การอัปโหลดไฟล์ใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง');
    }, this.FILE_UPLOAD_TIMEOUT);
  }

  private clearFileUploadTimeout(): void {
    if (this.fileUploadTimeoutTimer) {
      clearTimeout(this.fileUploadTimeoutTimer);
      this.fileUploadTimeoutTimer = null;
    }
  }

  private handleFileUploadError(files: File[], errorMessage: string): void {
    files.forEach(file => {
      this.markFileAsError(file.name);
    });

    this.showFileUploadError(errorMessage);
  }

  private markFileAsUploaded(fileName: string): void {
    console.log('📄 Marking file as uploaded:', fileName);

    const wasUploading = this.uploadingFileNames.includes(fileName);
    this.uploadingFileNames = this.uploadingFileNames.filter(name => name !== fileName);

    const wasError = this.errorFileNames.includes(fileName);
    this.errorFileNames = this.errorFileNames.filter(name => name !== fileName);

    const alreadyUploaded = this.uploadedFileNames.includes(fileName);
    if (!alreadyUploaded) {
      this.uploadedFileNames.push(fileName);
      console.log('File successfully marked as uploaded:', fileName);
    } else {
      console.log('File already marked as uploaded:', fileName);
    }

    console.log('Upload states after marking:', {
      fileName,
      wasUploading,
      wasError,
      alreadyUploaded,
      currentStates: {
        uploading: this.uploadingFileNames.length,
        uploaded: this.uploadedFileNames.length,
        errors: this.errorFileNames.length
      }
    });
  }

  private markFileAsError(fileName: string): void {
    console.log('📄 Marking file as error:', fileName);

    const wasUploading = this.uploadingFileNames.includes(fileName);
    this.uploadingFileNames = this.uploadingFileNames.filter(name => name !== fileName);

    const wasUploaded = this.uploadedFileNames.includes(fileName);
    this.uploadedFileNames = this.uploadedFileNames.filter(name => name !== fileName);

    const alreadyInError = this.errorFileNames.includes(fileName);
    if (!alreadyInError) {
      this.errorFileNames.push(fileName);
      console.log('File successfully marked as error:', fileName);
    } else {
      console.log('File already marked as error:', fileName);
    }

    console.log('Upload states after marking as error:', {
      fileName,
      wasUploading,
      wasUploaded,
      alreadyInError,
      currentStates: {
        uploading: this.uploadingFileNames.length,
        uploaded: this.uploadedFileNames.length,
        errors: this.errorFileNames.length
      }
    });
  }

  private showFileUploadSuccess(message: string): void {
    if (!this.fileSuccessMessages.includes(message)) {
      this.fileSuccessMessages.push(message);

      setTimeout(() => {
        this.fileSuccessMessages = this.fileSuccessMessages.filter(msg => msg !== message);
      }, 3000);
    }
  }

  private resetFileStates(): void {
    this.uploadedFileNames = [];
    this.uploadingFileNames = [];
    this.errorFileNames = [];
    this.fileSuccessMessages = [];
    console.log('File states reset');
  }

  private showFileUploadError(message: string): void {
    this.fileErrors.push(message);

    setTimeout(() => {
      this.fileErrors = this.fileErrors.filter(err => err !== message);
    }, 5000);
  }

  removeFile(index: number): void {
    const file = this.selectedFiles[index];

    if (this.filePreviewUrls[file.name]) {
      if (this.filePreviewUrls[file.name].startsWith('blob:')) {
        URL.revokeObjectURL(this.filePreviewUrls[file.name]);
      }
      delete this.filePreviewUrls[file.name];
    }

    this.uploadedFileNames = this.uploadedFileNames.filter(name => name !== file.name);
    this.uploadingFileNames = this.uploadingFileNames.filter(name => name !== file.name);
    this.errorFileNames = this.errorFileNames.filter(name => name !== file.name);

    this.selectedFiles.splice(index, 1);
    this.ticketForm.patchValue({ attachments: this.selectedFiles });

    if (this.selectedFiles.length === 0) {
      this.fileErrors = [];
    } else {
      const validation = this.ticketService.validateFiles(this.selectedFiles);
      this.fileErrors = validation.errors;
    }

    console.log('File removed. Remaining files:', this.selectedFiles.length);
  }

  onSubmit(): void {
    console.log('Submit button clicked, Edit mode:', this.isEditMode);

    const validation = this.validateFormForAutoSave();

    if (!validation.isValid) {
      this.alertMessage = 'กรุณากรอกข้อมูลให้ครบก่อน';
      this.alertType = 'error';
      this.showCustomAlert = true;

      this.showValidationErrors = true;
      this.markFieldsAsInvalid();

      return;
    }

    if (this.isEditMode) {
      console.log('📝 Updating existing ticket:', this.ticket_no);
      this.updateExistingTicket();
      return;
    }

    if (!this.isTicketCreated) {
      console.log('📝 Reserving ticket number first...');
      this.createTicketAutomatically();
      return;
    }

    if (this.selectedFiles.length > 0 && this.uploadingFileNames.length > 0) {
      console.log('⏳ Waiting for file uploads to complete...');
      this.waitForUploadsAndFinish();
      return;
    }

    console.log('✅ All steps completed - finalizing ticket creation');
    this.completedTicketCreation();
  }

  private waitForUploadsAndFinish(): void {
    this.isSubmitting = true;

    console.log('⏳ Waiting for uploads to complete...');

    const checkInterval = setInterval(() => {
      const stillUploading = this.uploadingFileNames.length > 0;
      const hasErrors = this.errorFileNames.length > 0;
      const totalFiles = this.selectedFiles.length;
      const completedFiles = this.uploadedFileNames.length + this.errorFileNames.length;

      console.log('Upload progress:', {
        stillUploading,
        totalFiles,
        completed: completedFiles,
        uploaded: this.uploadedFileNames.length,
        errors: this.errorFileNames.length
      });

      if (!stillUploading || completedFiles >= totalFiles) {
        clearInterval(checkInterval);
        this.isSubmitting = false;

        if (this.isEditMode) {
          this.completeTicketUpdateSuccess(
            this.uploadedFileNames.length,
            this.errorFileNames.length
          );
        } else {
          this.completedTicketCreation();
        }
      }
    }, 500);

    setTimeout(() => {
      clearInterval(checkInterval);
      if (this.isSubmitting) {
        console.warn('⚠️ Upload timeout - proceeding anyway');
        this.isSubmitting = false;

        if (this.isEditMode) {
          this.completeTicketUpdateSuccess(
            this.uploadedFileNames.length,
            this.errorFileNames.length
          );
        } else {
          this.completedTicketCreation();
        }
      }
    }, 30000);
  }

  private completedTicketCreation(): void {
    console.log('✅ Ticket creation completed successfully');

    this.clearIncompleteTicket();

    if (this.ticket_no) {
      this.sendNewTicketNotification(this.ticket_no);
    }

    this.alertMessage = `Ticket created successfully\nTicket ID: ${this.ticket_no}`;
    this.alertType = 'success';
    this.showCustomAlert = true;

    this.autoNavigationTimer = setTimeout(() => {
      if (this.ticket_no && !this.isNavigating) {
        this.navigateToTicketDetail();
      }
    }, 3000);
  }

  private navigateToTicketDetail(): void {
    if (this.ticket_no) {
      console.log('Navigating to ticket detail with ticket_no:', this.ticket_no);
      this.isNavigating = true;
      this.showCustomAlert = false;

      this.clearAllTimers();

      this.router.navigate(['/tickets', this.ticket_no]);
    }
  }

  resetForm(): void {
    this.clearAllTimers();

    if (this.isEditMode) {
      this.clearEditData();
      this.backToTicketDetail();
      return;
    }

    this.clearIncompleteTicket();

    this.ticketForm.reset();
    this.selectedFiles = [];
    this.fileErrors = [];
    this.isTicketCreated = false;
    this.ticketId = null;
    this.ticket_no = '';
    this.isSubmitting = false;
    this.showValidationErrors = false;
    this.validationErrors = {};
    this.isNavigating = false;

    this.resetFileStates();

    this.selectedProject = null;
    this.selectedCategory = null;

    Object.values(this.filePreviewUrls).forEach(url => {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
    this.filePreviewUrls = {};

    this.removeSuccessState();

    console.log('Form reset completed');
  }

  private removeSuccessState(): void {
    const form = document.querySelector('.ticket-form');
    const richEditor = document.querySelector('.rich-text-editor-container');
    const fileUploadArea = document.querySelector('.file-upload-area');

    if (form) form.classList.remove('success');
    if (richEditor) richEditor.classList.remove('success');
    if (fileUploadArea) fileUploadArea.classList.remove('has-files');
  }

  get isFormCompleted(): boolean {
    const validation = this.validateFormForAutoSave();
    return validation.isValid;
  }

  get hasUnsavedChanges(): boolean {
    if (this.isEditMode) {
      if (!this.originalTicketData) return false;

      const currentFormData = {
        projectId: this.ticketForm.get('projectId')?.value,
        categoryId: this.ticketForm.get('categoryId')?.value,
        issueDescription: this.ticketForm.get('issueDescription')?.value
      };

      const originalFormData = this.originalTicketData.formData;

      return (
        currentFormData.projectId !== originalFormData.projectId ||
        currentFormData.categoryId !== originalFormData.categoryId ||
        currentFormData.issueDescription !== originalFormData.issueDescription ||
        this.selectedFiles.length > 0
      );
    }

    return this.isFormCompleted && !this.isTicketCreated;
  }

  isFileUploaded(fileName: string): boolean {
    return this.uploadedFileNames.includes(fileName);
  }

  isFileUploading(fileName: string): boolean {
    return this.uploadingFileNames.includes(fileName);
  }

  isFileError(fileName: string): boolean {
    return this.errorFileNames.includes(fileName);
  }

  getFileIconClass(file: File): string {
    return this.ticketService.getFileIcon(file.name);
  }

  formatFileSize(bytes: number): string {
    return this.ticketService.formatFileSize(bytes);
  }

  isImageFile(file: File): boolean {
    return this.ticketService.isImageFile(file);
  }

  getFilePreview(file: File): string {
    return this.filePreviewUrls[file.name] || '';
  }

  getFileTypeClass(file: File): string {
    const extension = file.name.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'pdf':
        return 'file-icon-pdf';
      case 'doc':
      case 'docx':
        return 'file-icon-doc';
      case 'txt':
        return 'file-icon-txt';
      case 'xls':
      case 'xlsx':
        return 'file-icon-excel';
      default:
        return 'file-icon-default';
    }
  }

  formatText(command: string): void {
    document.execCommand(command, false);
  }

  insertList(ordered: boolean): void {
    const command = ordered ? 'insertOrderedList' : 'insertUnorderedList';
    document.execCommand(command, false);
  }

  insertLink(): void {
    const url = prompt('Enter URL:');
    if (url) {
      document.execCommand('createLink', false, url);
    }
  }

  insertImage(): void {
    const url = prompt('Enter image URL:');
    if (url) {
      document.execCommand('insertImage', false, url);
    }
  }

  onDescriptionInput(event: Event): void {
    const target = event.target as HTMLElement;
    const content = target.innerHTML;
    this.ticketForm.patchValue({ issueDescription: content });

    if (content && content.trim().length >= 10 && this.validationErrors['issueDescription']) {
      this.validationErrors['issueDescription'] = false;
    }

    // ✅ REMOVED: ไม่ต้องเรียก manual auto-save เพราะ valueChanges จะจัดการให้
    // if (this.isEditMode) {
    //   console.log('Edit mode: Description updated');
    // } else if (this.isTicketCreated) {
    //   this.saveIncompleteTicket();
    // }
  }

  isFieldInvalid(fieldName: string): boolean {
    return this.showValidationErrors && this.validationErrors[fieldName];
  }

  getFieldError(fieldName: string): string {
    if (this.showValidationErrors && this.validationErrors[fieldName]) {
      switch (fieldName) {
        case 'projectId':
          return 'กรุณาเลือกโปรเจค';
        case 'categoryId':
          return 'กรุณาเลือกหมวดหมู่';
        case 'issueDescription':
          return 'กรุณากรอกรายละเอียดอย่างน้อย 10 ตัวอักษร';
        default:
          return 'กรุณากรอกข้อมูลนี้';
      }
    }
    return '';
  }

  onAlertClosed(): void {
    if (this.alertType === 'success' && this.ticket_no && !this.isNavigating) {
      this.navigateToTicketDetail();
    } else {
      this.showCustomAlert = false;
    }
  }

  private markFieldsAsInvalid(): void {
    const validation = this.validateFormForAutoSave();

    if (!validation.isValid) {
      const projectId = this.ticketForm.get('projectId')?.value;
      const categoryId = this.ticketForm.get('categoryId')?.value;
      const issueDescription = this.ticketForm.get('issueDescription')?.value;

      this.validationErrors = {
        projectId: !projectId || projectId === '',
        categoryId: !categoryId || categoryId === '',
        issueDescription: !issueDescription || issueDescription.trim().length < 10
      };
    }
  }

  @HostListener('window:beforeunload', ['$event'])
  canDeactivate(event: BeforeUnloadEvent): boolean {
    this.clearAllTimers();

    if (this.isEditMode) {
      if (this.hasUnsavedChanges) {
        event.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return false;
      }
    } else {
      if (this.isTicketCreated && this.ticket_no) {
        this.saveIncompleteTicket();
      }

      if (this.hasUnsavedChanges) {
        event.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return false;
      }
    }

    return true;
  }
}