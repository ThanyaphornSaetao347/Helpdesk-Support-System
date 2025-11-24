import { Component, OnInit, OnDestroy, inject, ViewEncapsulation, HostListener, ChangeDetectorRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute, NavigationEnd } from '@angular/router';
import { ApiService } from '../../../shared/services/api.service';
import { AuthService } from '../../../shared/services/auth.service';
import { TicketService } from '../../../shared/services/ticket.service';
import { NotificationService } from '../../../shared/services/notification.service';
import { LanguageService } from '../../../shared/services/language.service';
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
  private languageService = inject(LanguageService);

  // ✅ เพิ่ม ViewChild references
  @ViewChild(ProjectDropdownComponent) projectDropdown!: ProjectDropdownComponent;
  @ViewChild(CategoryDropdownComponent) categoryDropdown!: CategoryDropdownComponent;

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

  private isAutoSaving = false;
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

    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }
  }

  // ✅ Translation Helper Methods
  t(key: string, params?: any): string {
    return this.languageService.translate(key, params);
  }

  // ===== EXISTING METHODS WITH i18n =====

  private onNavigationBack(): void {
    console.log('🔍 Handling navigation back to component');

    if (!this.isEditMode) {
      this.restoreIncompleteTicket();
    }
  }

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

    const confirmMessage = this.t('tickets.deleteConfirm', { 
      ticketNo: `${selectedIds.length} ${this.t('tickets.tickets')}` 
    });

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
        return this.t('tickets.fileUploaded');
      case 'uploading':
        return this.t('tickets.fileUploading');
      case 'error':
        return this.t('tickets.fileUploadFailed');
      case 'pending':
        return this.t('tickets.fileUploadPending');
      default:
        return this.t('tickets.unknown');
    }
  }

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

  // ✅ แก้ไข restoreEditTicketData
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

            // ✅ Patch form values
            this.ticketForm.patchValue({
              projectId: ticketData.project_id,
              categoryId: ticketData.categories_id,
              issueDescription: ticketData.issue_description
            });

            this.selectedProject = this.originalTicketData.selectedProject;
            this.selectedCategory = this.originalTicketData.selectedCategory;

            // ✅ เพิ่มเวลาให้ child components init เสร็จก่อน
            setTimeout(() => {
              this.updateUIFromRestoredData(this.originalTicketData);
              this.addSuccessState();

              this.analyzeAttachmentsFromUrls();

              this.isLoading = false;
            }, 800); // เพิ่มจาก 300 เป็น 800ms

            console.log('✅ Edit mode initialized successfully');

          } else {
            throw new Error(response.message || 'Failed to load ticket data');
          }
        },
        error: (error) => {
          console.error('❌ Error loading ticket data:', error);
          this.isLoading = false;

          this.alertMessage = this.t('tickets.loadError') + '\n' + this.t('tickets.tryAgain');
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
        
        const contentType = response.headers.get('Content-Type');
        const contentDisposition = response.headers.get('Content-Disposition');
        
        let filename = 'unknown';
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
          if (filenameMatch && filenameMatch[1]) {
            filename = filenameMatch[1].replace(/['"]/g, '');
          }
        }
        
        if (filename === 'unknown') {
          filename = this.extractFilenameFromPath(url);
        }
        
        const extension = this.getFileExtension(filename);
        let fileType: any = 'file';
        
        if (contentType) {
          if (contentType.startsWith('image/')) fileType = 'image';
          else if (contentType === 'application/pdf') fileType = 'pdf';
          else if (contentType.includes('excel') || contentType.includes('spreadsheet')) fileType = 'excel';
          else if (contentType.includes('word') || contentType.includes('document')) fileType = 'word';
          else if (contentType.startsWith('text/')) fileType = 'text';
          else if (contentType.includes('zip') || contentType.includes('compressed')) fileType = 'archive';
          else if (contentType.startsWith('video/')) fileType = 'video';
          else if (contentType.startsWith('audio/')) fileType = 'audio';
        } else if (extension) {
          fileType = this.getFileTypeFromExtension(filename);
        }
        
        this.attachmentTypes[attachmentId] = {
          type: fileType,
          extension: extension,
          filename: filename,
          isLoading: false,
          isAnalyzed: true
        };
        
        console.log(`✅ Analyzed attachment ${attachmentId}:`, this.attachmentTypes[attachmentId]);
        this.cdr.detectChanges();
      })
      .catch(error => {
        clearTimeout(timeoutId);
        console.warn(`⚠️ Could not fetch headers for ${url}:`, error.message);
        this.tryImageLoad(url, attachmentId);
      });
  }

  private tryImageLoad(url: string, attachmentId: number): void {
    const img = new Image();
    const timeoutId = setTimeout(() => {
      img.src = '';
      this.setFallbackFileType(attachmentId, this.extractFilenameFromPath(url));
    }, 3000);

    img.onload = () => {
      clearTimeout(timeoutId);
      const filename = this.extractFilenameFromPath(url);
      this.attachmentTypes[attachmentId] = {
        type: 'image',
        extension: this.getFileExtension(filename),
        filename: filename,
        isLoading: false,
        isAnalyzed: true
      };
      console.log(`✅ Confirmed as image: ${attachmentId}`);
      this.cdr.detectChanges();
    };

    img.onerror = () => {
      clearTimeout(timeoutId);
      this.setFallbackFileType(attachmentId, this.extractFilenameFromPath(url));
    };

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

  getPageTitle(): string {
    return this.isEditMode ? this.t('tickets.editTicket') : this.t('tickets.newTicket');
  }

  getSubmitButtonText(): string {
    if (this.isSubmitting) {
      return this.isEditMode ? this.t('tickets.updatingTicket') : this.t('tickets.creatingTicket');
    }
    return this.isEditMode ? this.t('tickets.updateTicket') : this.t('tickets.createTicket');
  }

  private backToTicketDetail(): void {
    if (this.editTicketNo) {
      this.router.navigate(['/tickets', this.editTicketNo]);
    } else {
      this.router.navigate(['/tickets']);
    }
  }

  isExistingAttachmentImage(attachment: any): boolean {
    if (!attachment) {
      return false;
    }

    const attachmentId = attachment.attachment_id;

    if (attachmentId && this.attachmentTypes[attachmentId]) {
      const isImage = this.attachmentTypes[attachmentId].type === 'image';
      return isImage;
    }

    return false;
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

    return 'bi-file-earmark-fill';
  }

  getExistingAttachmentDisplayName(attachment: any): string {
    if (!attachment) return this.t('tickets.unknownFile');

    const attachmentId = attachment.attachment_id;

    if (attachmentId && this.attachmentTypes[attachmentId]) {
      return this.attachmentTypes[attachmentId].filename;
    }

    return attachment.filename || this.extractFilenameFromPath(attachment.path) || this.t('tickets.unknownFile');
  }

  private extractFilenameFromPath(path: string): string {
    if (!path || typeof path !== 'string') {
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
      filename: this.t('tickets.unknownFile'),
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
    if (this.attachmentTypes[attachmentId]) {
      this.attachmentTypes[attachmentId].type = 'file';
      this.attachmentTypes[attachmentId].isAnalyzed = true;
      this.cdr.detectChanges();
    }
  }

  onExistingAttachmentImageLoad(attachmentId: number): void {
    if (this.attachmentTypes[attachmentId]) {
      this.attachmentTypes[attachmentId].type = 'image';
      this.attachmentTypes[attachmentId].isAnalyzed = true;
      this.cdr.detectChanges();
    }
  }

  hasExistingAttachments(): boolean {
    return this.isEditMode && this.existingAttachments && this.existingAttachments.length > 0;
  }

  isAttachmentDeleting(attachmentId: number): boolean {
    return this.deletingAttachmentIds.has(attachmentId);
  }

  removeExistingAttachment(index: number, attachment?: any): void {
    const attachmentToDelete = attachment || this.existingAttachments[index];

    if (!attachmentToDelete || !attachmentToDelete.attachment_id) {
      this.showFileUploadError(this.t('tickets.deleteFileFailed'));
      return;
    }

    const filename = this.getExistingAttachmentDisplayName(attachmentToDelete);

    if (!confirm(this.t('tickets.deleteFileConfirm', { filename }))) {
      return;
    }

    const attachmentId = attachmentToDelete.attachment_id;
    this.deletingAttachmentIds.add(attachmentId);

    this.apiService.deleteAttachment(attachmentId).subscribe({
      next: (response) => {
        this.deletingAttachmentIds.delete(attachmentId);

        if (response.code === 1 || response.code === 200) {
          this.existingAttachments.splice(index, 1);
          delete this.attachmentTypes[attachmentId];

          this.showFileUploadSuccess(this.t('tickets.deleteFileSuccess', { filename }));
          this.cdr.detectChanges();
        } else {
          this.showFileUploadError(response.message || this.t('tickets.deleteFileFailed'));
        }
      },
      error: (error) => {
        this.deletingAttachmentIds.delete(attachmentId);
        this.showFileUploadError(this.t('tickets.deleteError'));
      }
    });
  }

  downloadExistingAttachment(attachment: any): void {
    if (!attachment || !attachment.path) {
      this.showFileUploadError(this.t('tickets.downloadFileFailed'));
      return;
    }

    const filename = this.getExistingAttachmentDisplayName(attachment);

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
      this.showFileUploadError(this.t('tickets.downloadError'));
    }
  }

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

    if (!confirm(this.t('tickets.deleteMultipleConfirm', { count: attachmentIds.length }))) {
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
        this.showFileUploadSuccess(this.t('tickets.deleteMultipleSuccess', { count: successCount }));
      }

      if (errorCount > 0) {
        this.showFileUploadError(this.t('tickets.deleteMultipleFailed', { count: errorCount }));
      }

      this.cdr.detectChanges();
    });
  }

  // ✅ แก้ไข restoreIncompleteTicket
  private restoreIncompleteTicket(): void {
    if (this.isEditMode) return;

    try {
      const currentUserId = this.currentUser?.id || this.currentUser?.user_id;
      if (!currentUserId) {
        return;
      }

      const savedTicketData = localStorage.getItem(`incompleteTicket_${currentUserId}`);
      if (savedTicketData) {
        const ticketData = JSON.parse(savedTicketData);

        if (ticketData.userId !== currentUserId) {
          localStorage.removeItem(`incompleteTicket_${currentUserId}`);
          return;
        }

        const savedTime = ticketData.timestamp;
        const currentTime = new Date().getTime();
        const hoursDiff = (currentTime - savedTime) / (1000 * 60 * 60);

        if (hoursDiff > 24) {
          localStorage.removeItem(`incompleteTicket_${currentUserId}`);
          return;
        }

        console.log('📦 Restoring incomplete ticket:', ticketData);

        this.ticketId = ticketData.ticketId;
        this.ticket_no = ticketData.ticket_no;
        this.isTicketCreated = ticketData.isTicketCreated;

        // ✅ Patch form values first
        this.ticketForm.patchValue({
          projectId: ticketData.formData.projectId,
          categoryId: ticketData.formData.categoryId,
          issueDescription: ticketData.formData.issueDescription
        });

        this.selectedProject = ticketData.selectedProject;
        this.selectedCategory = ticketData.selectedCategory;

        if (this.isTicketCreated && this.ticketId) {
          this.loadExistingAttachments(this.ticketId);
        }

        // ✅ เพิ่มเวลาให้ child components init เสร็จก่อน
        setTimeout(() => {
          this.updateUIFromRestoredData(ticketData);
        }, 800); // เพิ่มจาก 300 เป็น 800ms

        if (this.isTicketCreated) {
          this.addSuccessState();
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

  private loadExistingAttachments(ticketId: number): void {
    if (!this.ticket_no) {
      return;
    }

    this.apiService.getTicketData({ ticket_no: this.ticket_no }).subscribe({
      next: (response) => {
        if (response.code === 1 && response.data && response.data.issue_attachment) {
          this.existingAttachments = response.data.issue_attachment.map((att: any) => {
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
              filename: att.filename || null,
              file_type: att.file_type || null,
              file_size: att.file_size || null
            };
          });

          setTimeout(() => {
            this.analyzeAttachmentsFromUrls();
            this.cdr.detectChanges();
          }, 100);

        } else {
          this.existingAttachments = [];
        }
      },
      error: (error) => {
        console.error('❌ Error loading attachments:', error);
        this.existingAttachments = [];
      }
    });
  }

  // ✅ แก้ไข updateUIFromRestoredData
  private updateUIFromRestoredData(ticketData: any): void {
    console.log('🔄 Updating UI from restored data:', ticketData);

    // ✅ Update Issue Description
    if (ticketData.formData.issueDescription) {
      const richEditor = document.querySelector('.rich-editor') as HTMLElement;
      if (richEditor) {
        richEditor.innerHTML = ticketData.formData.issueDescription;
      }
    }

    // ✅ Update Form Values
    this.ticketForm.patchValue({
      projectId: ticketData.formData.projectId,
      categoryId: ticketData.formData.categoryId,
      issueDescription: ticketData.formData.issueDescription
    }, { emitEvent: true }); // ให้ emit event เพื่อ trigger change detection

    // ✅ Force sync dropdowns หลังจาก patch ค่าเสร็จ
    setTimeout(() => {
      // ใช้ ViewChild เพื่อเรียก forceSync() ใน child components
      if (this.projectDropdown) {
        this.projectDropdown.forceSync();
        console.log('✅ Force synced project dropdown');
      }

      if (this.categoryDropdown) {
        this.categoryDropdown.forceSync();
        console.log('✅ Force synced category dropdown');
      }

      // Trigger change detection
      this.cdr.detectChanges();
    }, 500); // เพิ่มเวลาให้ child components โหลดข้อมูลเสร็จก่อน
  }

  private saveIncompleteTicket(): void {
    if (this.isEditMode) return;

    if (this.isTicketCreated && this.ticketId) {
      const currentUserId = this.currentUser?.id || this.currentUser?.user_id;
      if (!currentUserId) {
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
    }
  }

  private clearIncompleteTicket(): void {
    if (this.isEditMode) return;

    const currentUserId = this.currentUser?.id || this.currentUser?.user_id;
    if (currentUserId) {
      localStorage.removeItem(`incompleteTicket_${currentUserId}`);
    }
  }

  private clearEditData(): void {
    if (this.isEditMode && this.editTicketNo) {
      const currentUserId = this.currentUser?.id || this.currentUser?.user_id;
      if (currentUserId) {
        const editStorageKey = `editTicket_${currentUserId}_${this.editTicketNo}`;
        localStorage.removeItem(editStorageKey);
      }
    }
  }

  onProjectChange(event: { project: any, projectId: string | number }): void {
    this.selectedProject = event.project;
    this.ticketForm.patchValue({ projectId: event.projectId });

    if (event.projectId && this.validationErrors['projectId']) {
      this.validationErrors['projectId'] = false;
    }
  }

  onCategoryChange(event: { category: any, categoryId: string | number }): void {
    this.selectedCategory = event.category;
    this.ticketForm.patchValue({ categoryId: event.categoryId });

    if (event.categoryId && this.validationErrors['categoryId']) {
      this.validationErrors['categoryId'] = false;
    }
  }

  onFormCompleted(): void {
    if (this.isEditMode) {
      return;
    }

    if (this.isAutoSaving) {
      return;
    }

    const validation = this.validateFormForAutoSave();

    if (!validation.isValid) {
      return;
    }

    if (this.isTicketCreated && this.ticketId) {
      this.updateTicketDraft();
    } else {
      this.createTicketAutomatically();
    }
  }

  private validateFormForAutoSave(): { isValid: boolean; errors?: string[] } {
    const projectId = this.ticketForm.get('projectId')?.value;
    const categoryId = this.ticketForm.get('categoryId')?.value;
    const issueDescription = this.ticketForm.get('issueDescription')?.value;

    const errors: string[] = [];

    if (!projectId || projectId === '') {
      errors.push(this.t('validation.required'));
    }

    if (!categoryId || categoryId === '') {
      errors.push(this.t('validation.required'));
    }

    if (!issueDescription || issueDescription.trim().length < 10) {
      errors.push(this.t('validation.minLength', { min: 10 }));
    }

    const isValid = errors.length === 0;
    return { isValid, errors };
  }

  private sendNewTicketNotification(ticketNo: string): void {
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

    if (this.isAutoSaving || this.isSubmitting) {
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

    this.apiService.saveTicket(ticketData).subscribe({
      next: (response) => {
        if (response.code === 1) {
          this.ticketId = response.ticket_id;
          this.ticket_no = response.ticket_no;
          this.isTicketCreated = true;

          this.showSuccessMessage(this.t('tickets.ticketCreatedSuccess', { ticketNo: this.ticket_no }));
          this.addSuccessState();
          this.saveIncompleteTicket();

        } else {
          this.onAutoCreateError(this.t('tickets.createTicketFailed'));
        }

        this.isSubmitting = false;
        this.isAutoSaving = false;
      },
      error: (error) => {
        this.onAutoCreateError(this.t('tickets.createError'));
        this.isSubmitting = false;
        this.isAutoSaving = false;
      }
    });
  }

  private updateTicketDraft(): void {
    if (this.isEditMode || !this.ticketId) {
      return;
    }

    if (this.isAutoSaving || this.isSubmitting) {
      return;
    }

    this.isAutoSaving = true;

    const formData = this.ticketForm.value;

    const updateData = {
      project_id: parseInt(formData.projectId),
      categories_id: parseInt(formData.categoryId),
      issue_description: formData.issueDescription
    };

    this.apiService.updateTicketData(this.ticketId, updateData).subscribe({
      next: (response) => {
        if (response.code === 1) {
          this.saveIncompleteTicket();
        }
        this.isAutoSaving = false;
      },
      error: (error) => {
        this.isAutoSaving = false;
      }
    });
  }

  private onAutoCreateError(error: any): void {
    let message = this.t('tickets.createError');

    if (typeof error === 'string') {
      message = error;
    } else if (error && error.message) {
      message = error.message;
    }

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

  private updateExistingTicket(): void {
    if (!this.ticketId) {
      return;
    }

    this.isSubmitting = true;

    const formData = this.ticketForm.value;

    const updateData = {
      project_id: parseInt(formData.projectId),
      categories_id: parseInt(formData.categoryId),
      issue_description: formData.issueDescription
    };

    this.apiService.updateTicketData(this.ticketId, updateData).subscribe({
      next: (response) => {
        if (response.code === 1) {
          const newFilesToUpload = this.selectedFiles.filter(file =>
            !this.uploadedFileNames.includes(file.name) &&
            !this.uploadingFileNames.includes(file.name)
          );

          if (newFilesToUpload.length > 0) {
            this.uploadFilesToExistingTicket(newFilesToUpload);
            this.waitForFileUploadsToComplete();
          } else {
            this.completeTicketUpdateSuccess(0, 0);
          }
        } else {
          this.onUpdateError(this.t('tickets.updateTicketFailed'));
        }
      },
      error: (error) => {
        this.onUpdateError(this.t('tickets.statusChangeError'));
      }
    });
  }

  private waitForFileUploadsToComplete(): void {
    let checkCount = 0;
    const maxChecks = 60;

    const checkInterval = setInterval(() => {
      checkCount++;

      const stillUploading = this.uploadingFileNames.length > 0;
      const totalSelectedFiles = this.selectedFiles.length;
      const successfulUploads = this.uploadedFileNames.length;
      const failedUploads = this.errorFileNames.length;
      const completedFiles = successfulUploads + failedUploads;

      const allFilesProcessed = !stillUploading && (completedFiles >= totalSelectedFiles || totalSelectedFiles === 0);
      const timeoutReached = checkCount >= maxChecks;

      if (allFilesProcessed || timeoutReached) {
        clearInterval(checkInterval);

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
    this.clearEditData();

    let message = this.t('tickets.updateTicketSuccess', { ticketNo: this.ticket_no });

    if (successfulUploads > 0 && failedUploads === 0) {
      message += '\n\n' + this.t('tickets.filesUploadedSuccess', { count: successfulUploads });
    } else if (successfulUploads > 0 && failedUploads > 0) {
      message += '\n\n' + this.t('tickets.filesUploadedSuccess', { count: successfulUploads });
      message += '\n' + this.t('tickets.filesUploadedFailed', { count: failedUploads });
    } else if (failedUploads > 0) {
      message += '\n\n' + this.t('tickets.filesUploadedFailed', { count: failedUploads });
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
    this.clearEditData();

    let message = this.t('tickets.updateTicketSuccess', { ticketNo: this.ticket_no });
    message += '\n\n' + this.t('tickets.filesUploadedSuccess', { count: successfulUploads });
    message += '\n' + this.t('tickets.filesUploadedFailed', { count: failedUploads });

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
    this.isSubmitting = false;
    this.alertMessage = this.t('tickets.updateSuccessButFilesFailedPartial', { count: failedUploads });
    this.alertType = 'error';
    this.showCustomAlert = true;
  }

  private onUpdateError(error: any): void {
    let message = this.t('tickets.statusChangeError');

    if (typeof error === 'string') {
      message = error;
    } else if (error && error.message) {
      message = error.message;
    }

    this.alertMessage = message;
    this.alertType = 'error';
    this.showCustomAlert = true;
    this.isSubmitting = false;
  }

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;

    if (!this.isEditMode) {
      const validation = this.validateFormForAutoSave();
      if (!validation.isValid) {
        input.value = '';

        this.alertMessage = this.t('tickets.fillAllFields');
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
        input.value = '';
        this.showFileUploadError(this.t('tickets.fileDuplicate'));
        return;
      }

      const totalFiles = this.getTotalAttachmentCount() + uniqueNewFiles.length;
      const maxFiles = 5;

      if (totalFiles > maxFiles) {
        this.showFileUploadError(this.t('tickets.maxFilesExceeded', { 
          max: maxFiles, 
          current: this.getTotalAttachmentCount() 
        }));
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

        if (this.isTicketCreated && this.ticketId && !this.isEditMode) {
          this.uploadFilesToExistingTicket(uniqueNewFiles);
        }
      }).catch(error => {
        this.showFileUploadError(this.t('tickets.fileSelectError'));
      });

      input.value = '';
    }
  }

  private uploadFilesToExistingTicket(files: File[]): void {
    if (!this.ticketId || files.length === 0) {
      return;
    }

    const filesToUpload = files.filter(file =>
      !this.uploadingFileNames.includes(file.name) &&
      !this.uploadedFileNames.includes(file.name)
    );

    if (filesToUpload.length === 0) {
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

    this.apiService.updateAttachment(attachmentData).subscribe({
      next: (response) => {
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

          filesToUpload.forEach((file, index) => {
            if (index < successCount) {
              this.markFileAsUploaded(file.name);
            } else {
              this.markFileAsError(file.name);
            }
          });

          if (failedCount === 0) {
            this.showFileUploadSuccess(this.t('tickets.filesUploadedSuccess', { count: successCount }));
          } else if (successCount > 0) {
            this.showFileUploadSuccess(this.t('tickets.filesUploadedSuccess', { count: successCount }));
            this.showFileUploadError(this.t('tickets.filesUploadedFailed', { count: failedCount }));
          } else {
            this.handleFileUploadError(filesToUpload, this.t('tickets.allFilesUploadFailed'));
          }

        } else {
          const errorMessage = (response as any).message ||
            response.message ||
            this.t('tickets.exportError');
          this.handleFileUploadError(filesToUpload, errorMessage);
        }
      },
      error: (error) => {
        this.clearFileUploadTimeout();

        let errorMessage = this.t('tickets.exportError');
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
      files.forEach(file => {
        if (this.uploadingFileNames.includes(file.name)) {
          this.markFileAsError(file.name);
        }
      });

      this.showFileUploadError(this.t('tickets.uploadTimeout'));
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
    this.uploadingFileNames = this.uploadingFileNames.filter(name => name !== fileName);
    this.errorFileNames = this.errorFileNames.filter(name => name !== fileName);

    const alreadyUploaded = this.uploadedFileNames.includes(fileName);
    if (!alreadyUploaded) {
      this.uploadedFileNames.push(fileName);
    }
  }

  private markFileAsError(fileName: string): void {
    this.uploadingFileNames = this.uploadingFileNames.filter(name => name !== fileName);
    this.uploadedFileNames = this.uploadedFileNames.filter(name => name !== fileName);

    const alreadyInError = this.errorFileNames.includes(fileName);
    if (!alreadyInError) {
      this.errorFileNames.push(fileName);
    }
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
  }

  onSubmit(): void {
    const validation = this.validateFormForAutoSave();

    if (!validation.isValid) {
      this.alertMessage = this.t('tickets.fillAllFields');
      this.alertType = 'error';
      this.showCustomAlert = true;

      this.showValidationErrors = true;
      this.markFieldsAsInvalid();

      return;
    }

    if (this.isEditMode) {
      this.updateExistingTicket();
      return;
    }

    if (!this.isTicketCreated) {
      this.createTicketAutomatically();
      return;
    }

    if (this.selectedFiles.length > 0 && this.uploadingFileNames.length > 0) {
      this.waitForUploadsAndFinish();
      return;
    }

    this.completedTicketCreation();
  }

  private waitForUploadsAndFinish(): void {
    this.isSubmitting = true;

    const checkInterval = setInterval(() => {
      const stillUploading = this.uploadingFileNames.length > 0;
      const totalFiles = this.selectedFiles.length;
      const completedFiles = this.uploadedFileNames.length + this.errorFileNames.length;

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
    this.clearIncompleteTicket();

    if (this.ticket_no) {
      this.sendNewTicketNotification(this.ticket_no);
    }

    this.alertMessage = this.t('tickets.ticketCreatedSuccess', { ticketNo: this.ticket_no });
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
    const url = prompt(this.t('tickets.enterUrl'));
    if (url) {
      document.execCommand('createLink', false, url);
    }
  }

  insertImage(): void {
    const url = prompt(this.t('tickets.enterImageUrl'));
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
  }

  isFieldInvalid(fieldName: string): boolean {
    return this.showValidationErrors && this.validationErrors[fieldName];
  }

  getFieldError(fieldName: string): string {
    if (this.showValidationErrors && this.validationErrors[fieldName]) {
      switch (fieldName) {
        case 'projectId':
          return this.t('tickets.selectProject');
        case 'categoryId':
          return this.t('tickets.selectCategory');
        case 'issueDescription':
          return this.t('validation.minLength', { min: 10 });
        default:
          return this.t('validation.required');
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
        event.returnValue = this.t('common.unsavedChanges');
        return false;
      }
    } else {
      if (this.isTicketCreated && this.ticket_no) {
        this.saveIncompleteTicket();
      }

      if (this.hasUnsavedChanges) {
        event.returnValue = this.t('common.unsavedChanges');
        return false;
      }
    }

    return true;
  }
}