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

  private deletingAttachmentIds: Set<number> = new Set();

  attachmentTypes: {
    [key: number]: {
      type: 'image' | 'pdf' | 'excel' | 'word' | 'text' | 'archive' | 'video' | 'audio' | 'file';
      extension: string;
      filename: string;
      isLoading?: boolean;
      isAnalyzed?: boolean;
    }
  } = {};

  selectedAttachmentIds: Set<number> = new Set();

  private fileUploadTimeoutTimer: any = null;
  private readonly FILE_UPLOAD_TIMEOUT = 30000;

  private isAutoSaving = false;
  private routerSubscription?: Subscription;

  // ✅ Toolbar State (เหมือน Word)
  toolbarState = {
    bold: false,
    italic: false,
    underline: false,
    justifyLeft: true,
    justifyCenter: false,
    justifyRight: false,
    justifyFull: false,
    insertUnorderedList: false,
    insertOrderedList: false
  };

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
    
    this.routerSubscription = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        if (event.url.includes('/tickets/new')) {
          this.onNavigationBack();
        }
      });

    this.checkEditMode();

    this.ticketForm.get('issueDescription')?.valueChanges
      .pipe(debounceTime(1000), distinctUntilChanged())
      .subscribe(value => {
        if (!this.isEditMode) this.onFormCompleted();
      });

    this.ticketForm.get('projectId')?.valueChanges
      .pipe(debounceTime(800), distinctUntilChanged())
      .subscribe(value => {
        if (!this.isEditMode) this.onFormCompleted();
      });

    this.ticketForm.get('categoryId')?.valueChanges
      .pipe(debounceTime(800), distinctUntilChanged())
      .subscribe(value => {
        if (!this.isEditMode) this.onFormCompleted();
      });
  }

  ngOnDestroy(): void {
    Object.values(this.filePreviewUrls).forEach(url => {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    });
    this.clearAllTimers();
    this.clearEditData();
    if (this.routerSubscription) this.routerSubscription.unsubscribe();
  }

  t(key: string, params?: any): string {
    return this.languageService.translate(key, params);
  }

  // ===== ✅ ส่วนปรับปรุง EDITOR (เหมือน Word) =====

  // 1. เช็คสถานะปุ่ม (Active State)
  checkToolbarStatus(): void {
    this.toolbarState.bold = document.queryCommandState('bold');
    this.toolbarState.italic = document.queryCommandState('italic');
    this.toolbarState.underline = document.queryCommandState('underline');
    this.toolbarState.insertUnorderedList = document.queryCommandState('insertUnorderedList');
    this.toolbarState.insertOrderedList = document.queryCommandState('insertOrderedList');
    this.toolbarState.justifyLeft = document.queryCommandState('justifyLeft');
    this.toolbarState.justifyCenter = document.queryCommandState('justifyCenter');
    this.toolbarState.justifyRight = document.queryCommandState('justifyRight');
    this.toolbarState.justifyFull = document.queryCommandState('justifyFull');

    if (!this.toolbarState.justifyCenter && !this.toolbarState.justifyRight && !this.toolbarState.justifyFull) {
      this.toolbarState.justifyLeft = true;
    }
  }

  onEditorEvent(): void {
    this.checkToolbarStatus();
  }

  // 2. จัดรูปแบบข้อความ
  formatText(command: string): void {
    document.execCommand(command, false);
    this.checkToolbarStatus();
    this.updateFormContent();
  }

  insertList(ordered: boolean): void {
    const command = ordered ? 'insertOrderedList' : 'insertUnorderedList';
    document.execCommand(command, false);
    this.checkToolbarStatus();
    this.updateFormContent();
  }

  insertLink(): void {
    const url = prompt(this.t('tickets.enterUrl'));
    if (url) {
      document.execCommand('createLink', false, url);
      this.checkToolbarStatus();
      this.updateFormContent();
    }
  }

  // 3. ✅ อัปโหลดรูปภาพจริง (ไม่ต้องใช้ URL)
  onRichTextConfigImage(event: any): void {
    const file = event.target.files[0];
    if (file) {
      // ตรวจสอบว่าเป็นรูปภาพ
      if (!file.type.startsWith('image/')) {
        alert(this.t('tickets.invalidImageType') || 'Please select an image file.');
        return;
      }

      const reader = new FileReader();
      reader.onload = (e: any) => {
        // แทรกรูปภาพ Base64 ลงใน Editor
        document.execCommand('insertImage', false, e.target.result);
        this.updateFormContent();
      };
      reader.readAsDataURL(file);
    }
    // Reset input เพื่อให้เลือกไฟล์เดิมซ้ำได้
    event.target.value = '';
  }

  // Helper สำหรับอัปเดต FormControl
  private updateFormContent(): void {
    const richEditor = document.querySelector('.rich-editor') as HTMLElement;
    if (richEditor) {
      this.ticketForm.patchValue({ issueDescription: richEditor.innerHTML }, { emitEvent: false });
    }
  }
  
  onDescriptionInput(event: Event): void {
    const target = event.target as HTMLElement;
    const content = target.innerHTML;
    this.ticketForm.patchValue({ issueDescription: content });
    this.checkToolbarStatus(); // เช็คสถานะตอนพิมพ์ด้วย

    if (content && content.trim().length >= 10 && this.validationErrors['issueDescription']) {
      this.validationErrors['issueDescription'] = false;
    }
  }

  // ===== End Editor Logic =====

  private onNavigationBack(): void {
    if (!this.isEditMode) this.restoreIncompleteTicket();
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
    return (this.existingAttachments?.length || 0) + (this.selectedFiles?.length || 0);
  }

  getTotalSelectableCount(): number {
    return this.existingAttachments?.length || 0;
  }

  canShowBulkActions(): boolean {
    return this.getTotalSelectableCount() > 1;
  }

  toggleSelectAll(): void {
    if (this.selectedAttachmentCount === this.getTotalSelectableCount()) {
      this.clearAttachmentSelection();
    } else {
      this.selectAllAttachments();
    }
  }

  removeSelectedItems(): void {
    if (!this.hasSelectedAttachments) return;
    const selectedIds = Array.from(this.selectedAttachmentIds);
    if (selectedIds.length === 0) return;

    if (!confirm(this.t('tickets.deleteConfirm', { ticketNo: `${selectedIds.length} ${this.t('tickets.tickets')}` }))) {
      return;
    }
    this.removeMultipleExistingAttachments(selectedIds);
    this.clearAttachmentSelection();
  }

  getFileTypeFromExtension(filename: string): string {
    const extension = this.getFileExtension(filename).toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff', 'ico'].includes(extension)) return 'image';
    if (extension === 'pdf') return 'pdf';
    if (['xls', 'xlsx', 'csv', 'ods'].includes(extension)) return 'excel';
    if (['doc', 'docx', 'rtf', 'odt'].includes(extension)) return 'word';
    if (['txt', 'log', 'md', 'json', 'xml', 'html', 'css', 'js', 'ts'].includes(extension)) return 'text';
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(extension)) return 'archive';
    if (['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'm4v'].includes(extension)) return 'video';
    if (['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a', 'wma'].includes(extension)) return 'audio';
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
    if (this.isFileUploaded(fileName)) return 'uploaded';
    else if (this.isFileUploading(fileName)) return 'uploading';
    else if (this.isFileError(fileName)) return 'error';
    else return 'pending';
  }

  getUploadStatusMessage(fileName: string): string {
    const status = this.getFileUploadStatus(fileName);
    switch (status) {
      case 'uploaded': return this.t('tickets.fileUploaded');
      case 'uploading': return this.t('tickets.fileUploading');
      case 'error': return this.t('tickets.fileUploadFailed');
      case 'pending': return this.t('tickets.fileUploadPending');
      default: return this.t('tickets.unknown');
    }
  }

  private checkEditMode(): void {
    this.editTicketNo = this.route.snapshot.params['ticket_no'];
    if (this.editTicketNo) {
      this.isEditMode = true;
      this.restoreEditTicketData();
    } else {
      this.isEditMode = false;
      this.restoreIncompleteTicket();
    }
  }

  private restoreEditTicketData(): void {
    try {
      const currentUserId = this.currentUser?.id || this.currentUser?.user_id;
      if (!currentUserId) {
        this.backToTicketDetail();
        return;
      }

      this.isLoading = true;
      this.apiService.getTicketData({ ticket_no: this.editTicketNo }).subscribe({
        next: (response) => {
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
              return { attachment_id: attachmentId, path: att.path, filename: null, file_type: null, file_size: null };
            });

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
              selectedProject: { id: ticketData.project_id, name: ticketData.project_name },
              selectedCategory: { id: ticketData.categories_id, name: ticketData.categories_name },
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
            }, 800);
          } else {
            throw new Error(response.message || 'Failed to load ticket data');
          }
        },
        error: (error) => {
          this.isLoading = false;
          this.alertMessage = this.t('tickets.loadError') + '\n' + this.t('tickets.tryAgain');
          this.alertType = 'error';
          this.showCustomAlert = true;
          setTimeout(() => { this.backToTicketDetail(); }, 2000);
        }
      });
    } catch (error) {
      this.isLoading = false;
      this.backToTicketDetail();
    }
  }

  private analyzeAttachmentsFromUrls(): void {
    if (!this.existingAttachments || this.existingAttachments.length === 0) return;
    this.existingAttachments.forEach((attachment) => {
      this.checkFileTypeFromHeaders(attachment.path, attachment.attachment_id);
    });
  }

  private getFileExtension(filename: string): string {
    if (!filename || filename === 'unknown' || typeof filename !== 'string') return '';
    try {
      const cleanName = filename.split('?')[0];
      const parts = cleanName.split('.');
      return parts.length > 1 && /^[a-z0-9]{1,10}$/i.test(parts[parts.length - 1]) ? parts[parts.length - 1].toLowerCase() : '';
    } catch { return ''; }
  }

  private checkFileTypeFromHeaders(url: string, attachmentId: number): void {
    if (!url) { this.setFallbackFileType(attachmentId); return; }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    fetch(url, { method: 'HEAD', mode: 'cors', signal: controller.signal, cache: 'no-cache' })
      .then(response => {
        clearTimeout(timeoutId);
        const contentType = response.headers.get('Content-Type');
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = 'unknown';
        if (contentDisposition) {
          const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
          if (match && match[1]) filename = match[1].replace(/['"]/g, '');
        }
        if (filename === 'unknown') filename = this.extractFilenameFromPath(url);
        
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
        
        this.attachmentTypes[attachmentId] = { type: fileType, extension: extension, filename: filename, isLoading: false, isAnalyzed: true };
        this.cdr.detectChanges();
      })
      .catch(() => {
        clearTimeout(timeoutId);
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
      this.attachmentTypes[attachmentId] = { type: 'image', extension: this.getFileExtension(filename), filename: filename, isLoading: false, isAnalyzed: true };
      this.cdr.detectChanges();
    };
    img.onerror = () => {
      clearTimeout(timeoutId);
      this.setFallbackFileType(attachmentId, this.extractFilenameFromPath(url));
    };
    img.src = url;
  }

  private setFallbackFileType(attachmentId: number, filename?: string): void {
    this.attachmentTypes[attachmentId] = { type: 'file', extension: '', filename: filename || `file_${attachmentId}`, isLoading: false, isAnalyzed: true };
    this.cdr.detectChanges();
  }

  getPageTitle(): string {
    return this.isEditMode ? this.t('tickets.editTicket') : this.t('tickets.newTicket');
  }

  getSubmitButtonText(): string {
    if (this.isSubmitting) return this.isEditMode ? this.t('tickets.updatingTicket') : this.t('tickets.creatingTicket');
    return this.isEditMode ? this.t('tickets.updateTicket') : this.t('tickets.createTicket');
  }

  private backToTicketDetail(): void {
    this.router.navigate([this.editTicketNo ? `/tickets/${this.editTicketNo}` : '/tickets']);
  }

  isExistingAttachmentImage(attachment: any): boolean {
    return attachment?.attachment_id && this.attachmentTypes[attachment.attachment_id]?.type === 'image';
  }

  getExistingAttachmentIcon(attachment: any): string {
    if (!attachment?.attachment_id) return 'bi-file-earmark-fill';
    const type = this.attachmentTypes[attachment.attachment_id]?.type;
    switch (type) {
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

  getExistingAttachmentDisplayName(attachment: any): string {
    return this.attachmentTypes[attachment?.attachment_id]?.filename || attachment?.filename || this.extractFilenameFromPath(attachment?.path) || this.t('tickets.unknownFile');
  }

  private extractFilenameFromPath(path: string): string {
    if (!path || typeof path !== 'string') return 'unknown';
    try {
      if (path.startsWith('data:')) return 'data_file';
      if (path.startsWith('http')) return decodeURIComponent(new URL(path).pathname.split('/').pop() || 'unknown');
      return decodeURIComponent(path.split('/').pop()?.split('?')[0] || 'unknown');
    } catch { return 'unknown'; }
  }

  getExistingAttachmentFileInfo(attachmentId: number): any {
    const info = this.attachmentTypes[attachmentId];
    return info ? { ...info, icon: this.getExistingAttachmentIcon({ attachment_id: attachmentId }) } : { type: 'unknown', filename: this.t('tickets.unknownFile'), isLoading: false, icon: 'bi-file-earmark-fill' };
  }

  formatExistingAttachmentSize(attachment: any): string {
    return attachment?.file_size ? this.formatFileSize(attachment.file_size) : '';
  }

  onExistingAttachmentImageError(attachmentId: number): void {
    if (this.attachmentTypes[attachmentId]) { this.attachmentTypes[attachmentId].type = 'file'; this.attachmentTypes[attachmentId].isAnalyzed = true; }
  }

  onExistingAttachmentImageLoad(attachmentId: number): void {
    if (this.attachmentTypes[attachmentId]) { this.attachmentTypes[attachmentId].type = 'image'; this.attachmentTypes[attachmentId].isAnalyzed = true; }
  }

  hasExistingAttachments(): boolean {
    return this.isEditMode && this.existingAttachments && this.existingAttachments.length > 0;
  }

  isAttachmentDeleting(attachmentId: number): boolean {
    return this.deletingAttachmentIds.has(attachmentId);
  }

  removeExistingAttachment(index: number, attachment?: any): void {
    const item = attachment || this.existingAttachments[index];
    if (!item?.attachment_id) { this.showFileUploadError(this.t('tickets.deleteFileFailed')); return; }
    if (!confirm(this.t('tickets.deleteFileConfirm', { filename: this.getExistingAttachmentDisplayName(item) }))) return;

    this.deletingAttachmentIds.add(item.attachment_id);
    this.apiService.deleteAttachment(item.attachment_id).subscribe({
      next: (res) => {
        this.deletingAttachmentIds.delete(item.attachment_id);
        if (res.code === 1 || res.code === 200) {
          this.existingAttachments.splice(index, 1);
          delete this.attachmentTypes[item.attachment_id];
          this.showFileUploadSuccess(this.t('tickets.deleteFileSuccess', { filename: this.getExistingAttachmentDisplayName(item) }));
        } else this.showFileUploadError(res.message || this.t('tickets.deleteFileFailed'));
      },
      error: () => { this.deletingAttachmentIds.delete(item.attachment_id); this.showFileUploadError(this.t('tickets.deleteError')); }
    });
  }

  downloadExistingAttachment(attachment: any): void {
    if (!attachment?.path) { this.showFileUploadError(this.t('tickets.downloadFileFailed')); return; }
    try {
      if (attachment.path.startsWith('data:')) {
        const link = document.createElement('a');
        link.href = attachment.path;
        link.download = this.getExistingAttachmentDisplayName(attachment);
        document.body.appendChild(link).click();
        document.body.removeChild(link);
      } else window.open(attachment.path.startsWith('http') ? attachment.path : `${this.apiService['apiUrl']}/${attachment.path}`, '_blank');
    } catch { this.showFileUploadError(this.t('tickets.downloadError')); }
  }

  toggleAttachmentSelection(attachmentId: number): void {
    this.selectedAttachmentIds.has(attachmentId) ? this.selectedAttachmentIds.delete(attachmentId) : this.selectedAttachmentIds.add(attachmentId);
  }

  isAttachmentSelected(attachmentId: number): boolean {
    return this.selectedAttachmentIds.has(attachmentId);
  }

  selectAllAttachments(): void {
    this.existingAttachments.forEach(att => { if (att.attachment_id) this.selectedAttachmentIds.add(att.attachment_id); });
  }

  clearAttachmentSelection(): void {
    this.selectedAttachmentIds.clear();
  }

  get hasSelectedAttachments(): boolean { return this.selectedAttachmentIds.size > 0; }
  get selectedAttachmentCount(): number { return this.selectedAttachmentIds.size; }

  removeMultipleExistingAttachments(attachmentIds: number[]): void {
    if (attachmentIds.length === 0) return;
    if (!confirm(this.t('tickets.deleteMultipleConfirm', { count: attachmentIds.length }))) return;
    attachmentIds.forEach(id => this.deletingAttachmentIds.add(id));
    
    Promise.allSettled(attachmentIds.map(id => this.apiService.deleteAttachment(id).toPromise())).then(results => {
      let success = 0, error = 0;
      results.forEach((res, i) => {
        const id = attachmentIds[i];
        this.deletingAttachmentIds.delete(id);
        if (res.status === 'fulfilled' && res.value?.code === 1) {
          success++;
          const idx = this.existingAttachments.findIndex(att => att.attachment_id === id);
          if (idx > -1) this.existingAttachments.splice(idx, 1);
          delete this.attachmentTypes[id];
        } else error++;
      });
      if (success > 0) this.showFileUploadSuccess(this.t('tickets.deleteMultipleSuccess', { count: success }));
      if (error > 0) this.showFileUploadError(this.t('tickets.deleteMultipleFailed', { count: error }));
    });
  }

  private restoreIncompleteTicket(): void {
    if (this.isEditMode) return;
    try {
      const currentUserId = this.currentUser?.id || this.currentUser?.user_id;
      if (!currentUserId) return;
      const saved = localStorage.getItem(`incompleteTicket_${currentUserId}`);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.userId !== currentUserId || (new Date().getTime() - data.timestamp) / 36e5 > 24) {
          localStorage.removeItem(`incompleteTicket_${currentUserId}`);
          return;
        }
        this.ticketId = data.ticketId;
        this.ticket_no = data.ticket_no;
        this.isTicketCreated = data.isTicketCreated;
        this.ticketForm.patchValue({
          projectId: data.formData.projectId,
          categoryId: data.formData.categoryId,
          issueDescription: data.formData.issueDescription
        });
        this.selectedProject = data.selectedProject;
        this.selectedCategory = data.selectedCategory;
        if (this.isTicketCreated && this.ticketId) this.loadExistingAttachments(this.ticketId);
        setTimeout(() => { this.updateUIFromRestoredData(data); }, 800);
        if (this.isTicketCreated) this.addSuccessState();
      }
    } catch { localStorage.removeItem(`incompleteTicket_${this.currentUser?.id}`); }
  }

  private loadExistingAttachments(ticketId: number): void {
    if (!this.ticket_no) return;
    this.apiService.getTicketData({ ticket_no: this.ticket_no }).subscribe({
      next: (res) => {
        if (res.code === 1 && res.data?.issue_attachment) {
          this.existingAttachments = res.data.issue_attachment.map((att: any) => {
            this.attachmentTypes[att.attachment_id] = { type: 'file', extension: '', filename: `Attachment ${att.attachment_id}`, isLoading: true, isAnalyzed: false };
            return { attachment_id: att.attachment_id, path: att.path, filename: att.filename, file_type: att.file_type, file_size: att.file_size };
          });
          setTimeout(() => { this.analyzeAttachmentsFromUrls(); }, 100);
        } else this.existingAttachments = [];
      },
      error: () => { this.existingAttachments = []; }
    });
  }

  private updateUIFromRestoredData(ticketData: any): void {
    if (ticketData.formData.issueDescription) {
      const editor = document.querySelector('.rich-editor') as HTMLElement;
      if (editor) editor.innerHTML = ticketData.formData.issueDescription;
    }
    this.ticketForm.patchValue({
      projectId: ticketData.formData.projectId,
      categoryId: ticketData.formData.categoryId,
      issueDescription: ticketData.formData.issueDescription
    }, { emitEvent: true });

    setTimeout(() => {
      if (this.projectDropdown) this.projectDropdown.forceSync();
      if (this.categoryDropdown) this.categoryDropdown.forceSync();
      this.cdr.detectChanges();
    }, 500);
  }

  private saveIncompleteTicket(): void {
    if (this.isEditMode || !this.ticketId) return;
    const currentUserId = this.currentUser?.id || this.currentUser?.user_id;
    if (!currentUserId) return;
    localStorage.setItem(`incompleteTicket_${currentUserId}`, JSON.stringify({
      userId: currentUserId,
      ticketId: this.ticketId,
      ticket_no: this.ticket_no,
      isTicketCreated: this.isTicketCreated,
      formData: this.ticketForm.value,
      selectedProject: this.selectedProject,
      selectedCategory: this.selectedCategory,
      timestamp: new Date().getTime()
    }));
  }

  private clearIncompleteTicket(): void {
    if (!this.isEditMode && this.currentUser?.id) localStorage.removeItem(`incompleteTicket_${this.currentUser.id}`);
  }

  private clearEditData(): void {
    if (this.isEditMode && this.editTicketNo && this.currentUser?.id) localStorage.removeItem(`editTicket_${this.currentUser.id}_${this.editTicketNo}`);
  }

  onProjectChange(event: any): void {
    this.selectedProject = event.project;
    this.ticketForm.patchValue({ projectId: event.projectId });
    if (event.projectId) this.validationErrors['projectId'] = false;
  }

  onCategoryChange(event: any): void {
    this.selectedCategory = event.category;
    this.ticketForm.patchValue({ categoryId: event.categoryId });
    if (event.categoryId) this.validationErrors['categoryId'] = false;
  }

  onFormCompleted(): void {
    if (this.isEditMode || this.isAutoSaving) return;
    if (!this.validateFormForAutoSave().isValid) return;
    this.isTicketCreated && this.ticketId ? this.updateTicketDraft() : this.createTicketAutomatically();
  }

  private validateFormForAutoSave(): { isValid: boolean; errors?: string[] } {
    const { projectId, categoryId, issueDescription } = this.ticketForm.value;
    const errors: string[] = [];
    if (!projectId) errors.push(this.t('validation.required'));
    if (!categoryId) errors.push(this.t('validation.required'));
    if (!issueDescription || issueDescription.trim().length < 10) errors.push(this.t('validation.minLength', { min: 10 }));
    return { isValid: errors.length === 0, errors };
  }

  private sendNewTicketNotification(ticketNo: string): void {
    this.notificationService.notifyTicketChanges({ ticket_no: ticketNo, isNewTicket: true }).subscribe({ error: (e) => console.warn(e) });
  }

  private createTicketAutomatically(): void {
    if (this.isEditMode || this.isAutoSaving || this.isSubmitting) return;
    this.isAutoSaving = true;
    this.isSubmitting = true;
    const formData = this.ticketForm.value;
    this.apiService.saveTicket({ project_id: +formData.projectId, categories_id: +formData.categoryId, issue_description: formData.issueDescription }).subscribe({
      next: (res) => {
        if (res.code === 1) {
          this.ticketId = res.ticket_id;
          this.ticket_no = res.ticket_no;
          this.isTicketCreated = true;
          this.showSuccessMessage(this.t('tickets.ticketCreatedSuccess', { ticketNo: this.ticket_no }));
          this.addSuccessState();
          this.saveIncompleteTicket();
        } else this.onAutoCreateError(this.t('tickets.createTicketFailed'));
        this.isSubmitting = false;
        this.isAutoSaving = false;
      },
      error: () => { this.onAutoCreateError(this.t('tickets.createError')); this.isSubmitting = false; this.isAutoSaving = false; }
    });
  }

  private updateTicketDraft(): void {
    if (this.isEditMode || !this.ticketId || this.isAutoSaving || this.isSubmitting) return;
    this.isAutoSaving = true;
    const formData = this.ticketForm.value;
    this.apiService.updateTicketData(this.ticketId, { project_id: +formData.projectId, categories_id: +formData.categoryId, issue_description: formData.issueDescription }).subscribe({
      next: (res) => { if (res.code === 1) this.saveIncompleteTicket(); this.isAutoSaving = false; },
      error: () => { this.isAutoSaving = false; }
    });
  }

  private onAutoCreateError(error: any): void {
    this.alertMessage = typeof error === 'string' ? error : error?.message || this.t('tickets.createError');
    this.alertType = 'error';
    this.showCustomAlert = true;
    this.isTicketCreated = false;
    this.ticketId = null;
    this.ticket_no = '';
  }

  private showSuccessMessage(message: string): void { console.log('Success:', message); }

  private addSuccessState(): void {
    setTimeout(() => {
      document.querySelector('.ticket-form')?.classList.add('success');
      document.querySelector('.rich-text-editor-container')?.classList.add('success');
      if (this.selectedFiles.length > 0) document.querySelector('.file-upload-area')?.classList.add('has-files');
    }, 100);
  }

  private updateExistingTicket(): void {
    if (!this.ticketId) return;
    this.isSubmitting = true;
    const formData = this.ticketForm.value;
    this.apiService.updateTicketData(this.ticketId, { project_id: +formData.projectId, categories_id: +formData.categoryId, issue_description: formData.issueDescription }).subscribe({
      next: (res) => {
        if (res.code === 1) {
          const newFiles = this.selectedFiles.filter(f => !this.uploadedFileNames.includes(f.name) && !this.uploadingFileNames.includes(f.name));
          newFiles.length > 0 ? (this.uploadFilesToExistingTicket(newFiles), this.waitForFileUploadsToComplete()) : this.completeTicketUpdateSuccess(0, 0);
        } else this.onUpdateError(this.t('tickets.updateTicketFailed'));
      },
      error: () => { this.onUpdateError(this.t('tickets.statusChangeError')); }
    });
  }

  private waitForFileUploadsToComplete(): void {
    let checkCount = 0;
    const checkInterval = setInterval(() => {
      checkCount++;
      const stillUploading = this.uploadingFileNames.length > 0;
      const completedFiles = this.uploadedFileNames.length + this.errorFileNames.length;
      if ((!stillUploading && (completedFiles >= this.selectedFiles.length || this.selectedFiles.length === 0)) || checkCount >= 60) {
        clearInterval(checkInterval);
        if (this.selectedFiles.length === 0) this.completeTicketUpdateSuccess(0, 0);
        else this.errorFileNames.length === 0 ? this.completeTicketUpdateSuccess(this.uploadedFileNames.length, 0) : this.completeTicketUpdatePartial(this.uploadedFileNames.length, this.errorFileNames.length);
      }
    }, 500);
  }

  private completeTicketUpdateSuccess(success: number, failed: number): void {
    this.clearEditData();
    let msg = this.t('tickets.updateTicketSuccess', { ticketNo: this.ticket_no });
    if (success > 0) msg += `\n\n${this.t('tickets.filesUploadedSuccess', { count: success })}`;
    if (failed > 0) msg += `\n${this.t('tickets.filesUploadedFailed', { count: failed })}`;
    this.alertMessage = msg;
    this.alertType = success > 0 || failed === 0 ? 'success' : 'error';
    this.showCustomAlert = true;
    this.isSubmitting = false;
    this.autoNavigationTimer = setTimeout(() => { if (!this.isNavigating) this.navigateToTicketDetail(); }, 3000);
  }

  private completeTicketUpdatePartial(success: number, failed: number): void { this.completeTicketUpdateSuccess(success, failed); }
  private completeTicketUpdateWithError(failed: number): void { this.isSubmitting = false; this.alertMessage = this.t('tickets.updateSuccessButFilesFailedPartial', { count: failed }); this.alertType = 'error'; this.showCustomAlert = true; }

  private onUpdateError(error: any): void {
    this.alertMessage = typeof error === 'string' ? error : error?.message || this.t('tickets.statusChangeError');
    this.alertType = 'error';
    this.showCustomAlert = true;
    this.isSubmitting = false;
  }

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!this.isEditMode && !this.validateFormForAutoSave().isValid) {
      input.value = '';
      this.alertMessage = this.t('tickets.fillAllFields');
      this.alertType = 'error';
      this.showCustomAlert = true;
      this.showValidationErrors = true;
      this.markFieldsAsInvalid();
      return;
    }
    if (input.files) {
      const newFiles = Array.from(input.files).filter(f => !this.selectedFiles.some(ef => ef.name === f.name && ef.size === f.size));
      if (newFiles.length === 0) { input.value = ''; this.showFileUploadError(this.t('tickets.fileDuplicate')); return; }
      if (this.getTotalAttachmentCount() + newFiles.length > 5) { this.showFileUploadError(this.t('tickets.maxFilesExceeded', { max: 5, current: this.getTotalAttachmentCount() })); input.value = ''; return; }
      
      const validation = this.ticketService.validateFiles([...this.selectedFiles, ...newFiles]);
      if (!validation.isValid) { this.fileErrors = validation.errors; input.value = ''; return; }

      newFiles.forEach(f => {
        this.uploadedFileNames = this.uploadedFileNames.filter(n => n !== f.name);
        this.errorFileNames = this.errorFileNames.filter(n => n !== f.name);
      });

      Promise.all(newFiles.filter(f => this.isImageFile(f)).map(f => this.ticketService.createImagePreview(f).then(url => this.filePreviewUrls[f.name] = url)))
        .then(() => {
          this.selectedFiles = [...this.selectedFiles, ...newFiles];
          this.ticketForm.patchValue({ attachments: this.selectedFiles });
          if (this.isTicketCreated && this.ticketId && !this.isEditMode) this.uploadFilesToExistingTicket(newFiles);
        });
      input.value = '';
    }
  }

  private uploadFilesToExistingTicket(files: File[]): void {
    if (!this.ticketId || files.length === 0) return;
    const uploadList = files.filter(f => !this.uploadingFileNames.includes(f.name) && !this.uploadedFileNames.includes(f.name));
    if (uploadList.length === 0) return;
    
    uploadList.forEach(f => { this.errorFileNames = this.errorFileNames.filter(n => n !== f.name); if (!this.uploadingFileNames.includes(f.name)) this.uploadingFileNames.push(f.name); });
    this.startFileUploadTimeout(uploadList);

    // 🔴 REMOVE: type: 'reporter' caused the TypeScript error
    this.apiService.updateAttachment({ 
      ticket_id: this.ticketId, 
      files: uploadList, 
      project_id: +this.ticketForm.value.projectId, 
      categories_id: +this.ticketForm.value.categoryId, 
      issue_description: this.ticketForm.value.issueDescription
    }).subscribe({
      next: (res) => {
        this.clearFileUploadTimeout();
        if (res.code === 1 || res.code === 200 || res.code === 201) {
          const successCount = Array.isArray(res.data) ? res.data.length : (res as any).uploaded_files?.length || uploadList.length;
          uploadList.forEach((f, i) => i < successCount ? this.markFileAsUploaded(f.name) : this.markFileAsError(f.name));
          this.showFileUploadSuccess(this.t('tickets.filesUploadedSuccess', { count: successCount }));
        } else this.handleFileUploadError(uploadList, (res as any).message || this.t('tickets.exportError'));
      },
      error: (e) => { this.clearFileUploadTimeout(); this.handleFileUploadError(uploadList, e?.error?.message || e?.message || this.t('tickets.exportError')); }
    });
  }

  private startFileUploadTimeout(files: File[]): void {
    this.clearFileUploadTimeout();
    this.fileUploadTimeoutTimer = setTimeout(() => {
      files.forEach(f => { if (this.uploadingFileNames.includes(f.name)) this.markFileAsError(f.name); });
      this.showFileUploadError(this.t('tickets.uploadTimeout'));
    }, this.FILE_UPLOAD_TIMEOUT);
  }
  
  private clearFileUploadTimeout(): void { if (this.fileUploadTimeoutTimer) clearTimeout(this.fileUploadTimeoutTimer); }

  private handleFileUploadError(files: File[], msg: string): void { files.forEach(f => this.markFileAsError(f.name)); this.showFileUploadError(msg); }
  private markFileAsUploaded(name: string): void { this.uploadingFileNames = this.uploadingFileNames.filter(n => n !== name); this.errorFileNames = this.errorFileNames.filter(n => n !== name); if (!this.uploadedFileNames.includes(name)) this.uploadedFileNames.push(name); }
  private markFileAsError(name: string): void { this.uploadingFileNames = this.uploadingFileNames.filter(n => n !== name); this.uploadedFileNames = this.uploadedFileNames.filter(n => n !== name); if (!this.errorFileNames.includes(name)) this.errorFileNames.push(name); }
  
  private showFileUploadSuccess(msg: string): void { if (!this.fileSuccessMessages.includes(msg)) { this.fileSuccessMessages.push(msg); setTimeout(() => { this.fileSuccessMessages = this.fileSuccessMessages.filter(m => m !== msg); }, 3000); } }
  private resetFileStates(): void { this.uploadedFileNames = []; this.uploadingFileNames = []; this.errorFileNames = []; this.fileSuccessMessages = []; }
  private showFileUploadError(msg: string): void { this.fileErrors.push(msg); setTimeout(() => { this.fileErrors = this.fileErrors.filter(e => e !== msg); }, 5000); }

  removeFile(index: number): void {
    const file = this.selectedFiles[index];
    if (this.filePreviewUrls[file.name]?.startsWith('blob:')) URL.revokeObjectURL(this.filePreviewUrls[file.name]);
    delete this.filePreviewUrls[file.name];
    this.uploadedFileNames = this.uploadedFileNames.filter(n => n !== file.name);
    this.uploadingFileNames = this.uploadingFileNames.filter(n => n !== file.name);
    this.errorFileNames = this.errorFileNames.filter(n => n !== file.name);
    this.selectedFiles.splice(index, 1);
    this.ticketForm.patchValue({ attachments: this.selectedFiles });
    this.fileErrors = this.selectedFiles.length === 0 ? [] : this.ticketService.validateFiles(this.selectedFiles).errors;
  }

  onSubmit(): void {
    if (!this.validateFormForAutoSave().isValid) {
      this.alertMessage = this.t('tickets.fillAllFields');
      this.alertType = 'error';
      this.showCustomAlert = true;
      this.showValidationErrors = true;
      this.markFieldsAsInvalid();
      return;
    }
    if (this.isEditMode) { this.updateExistingTicket(); return; }
    if (!this.isTicketCreated) { this.createTicketAutomatically(); return; }
    if (this.selectedFiles.length > 0 && this.uploadingFileNames.length > 0) { this.waitForUploadsAndFinish(); return; }
    this.completedTicketCreation();
  }

  private waitForUploadsAndFinish(): void {
    this.isSubmitting = true;
    const interval = setInterval(() => {
      if (this.uploadingFileNames.length === 0 || this.uploadedFileNames.length + this.errorFileNames.length >= this.selectedFiles.length) {
        clearInterval(interval);
        this.isSubmitting = false;
        this.isEditMode ? this.completeTicketUpdateSuccess(this.uploadedFileNames.length, this.errorFileNames.length) : this.completedTicketCreation();
      }
    }, 500);
    setTimeout(() => { clearInterval(interval); if (this.isSubmitting) { this.isSubmitting = false; this.completedTicketCreation(); } }, 30000);
  }

  private completedTicketCreation(): void {
    this.clearIncompleteTicket();
    if (this.ticket_no) this.sendNewTicketNotification(this.ticket_no);
    this.alertMessage = this.t('tickets.ticketCreatedSuccess', { ticketNo: this.ticket_no });
    this.alertType = 'success';
    this.showCustomAlert = true;
    this.autoNavigationTimer = setTimeout(() => { if (!this.isNavigating) this.navigateToTicketDetail(); }, 3000);
  }

  private navigateToTicketDetail(): void {
    if (this.ticket_no) { this.isNavigating = true; this.showCustomAlert = false; this.clearAllTimers(); this.router.navigate(['/tickets', this.ticket_no]); }
  }

  resetForm(): void {
    this.clearAllTimers();
    if (this.isEditMode) { this.clearEditData(); this.backToTicketDetail(); return; }
    this.clearIncompleteTicket();
    this.ticketForm.reset();
    this.selectedFiles = []; this.fileErrors = []; this.isTicketCreated = false; this.ticketId = null; this.ticket_no = ''; this.isSubmitting = false; this.showValidationErrors = false; this.validationErrors = {}; this.isNavigating = false;
    this.resetFileStates();
    this.selectedProject = null; this.selectedCategory = null;
    Object.values(this.filePreviewUrls).forEach(u => { if (u.startsWith('blob:')) URL.revokeObjectURL(u); });
    this.filePreviewUrls = {};
    this.removeSuccessState();
  }

  private removeSuccessState(): void {
    document.querySelector('.ticket-form')?.classList.remove('success');
    document.querySelector('.rich-text-editor-container')?.classList.remove('success');
    document.querySelector('.file-upload-area')?.classList.remove('has-files');
  }

  get isFormCompleted(): boolean { return this.validateFormForAutoSave().isValid; }
  get hasUnsavedChanges(): boolean {
    if (this.isEditMode && this.originalTicketData) {
      const form = this.ticketForm.value;
      const orig = this.originalTicketData.formData;
      return form.projectId !== orig.projectId || form.categoryId !== orig.categoryId || form.issueDescription !== orig.issueDescription || this.selectedFiles.length > 0;
    }
    return this.isFormCompleted && !this.isTicketCreated;
  }

  isFileUploaded(name: string): boolean { return this.uploadedFileNames.includes(name); }
  isFileUploading(name: string): boolean { return this.uploadingFileNames.includes(name); }
  isFileError(name: string): boolean { return this.errorFileNames.includes(name); }
  getFileIconClass(file: File): string { return this.ticketService.getFileIcon(file.name); }
  formatFileSize(bytes: number): string { return this.ticketService.formatFileSize(bytes); }
  isImageFile(file: File): boolean { return this.ticketService.isImageFile(file); }
  getFilePreview(file: File): string { return this.filePreviewUrls[file.name] || ''; }
  
  getFileTypeClass(file: File): string {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return 'file-icon-pdf';
    if (['doc', 'docx'].includes(ext!)) return 'file-icon-doc';
    if (ext === 'txt') return 'file-icon-txt';
    if (['xls', 'xlsx'].includes(ext!)) return 'file-icon-excel';
    return 'file-icon-default';
  }

  private markFieldsAsInvalid(): void {
    const { projectId, categoryId, issueDescription } = this.ticketForm.value;
    this.validationErrors = {
      projectId: !projectId,
      categoryId: !categoryId,
      issueDescription: !issueDescription || issueDescription.trim().length < 10
    };
  }
  
  isFieldInvalid(name: string): boolean { return this.showValidationErrors && this.validationErrors[name]; }
  
  getFieldError(name: string): string {
    if (!this.isFieldInvalid(name)) return '';
    if (name === 'projectId') return this.t('tickets.selectProject');
    if (name === 'categoryId') return this.t('tickets.selectCategory');
    if (name === 'issueDescription') return this.t('validation.minLength', { min: 10 });
    return this.t('validation.required');
  }

  onAlertClosed(): void {
    if (this.alertType === 'success' && this.ticket_no && !this.isNavigating) this.navigateToTicketDetail();
    else this.showCustomAlert = false;
  }

  @HostListener('window:beforeunload', ['$event'])
  canDeactivate(event: BeforeUnloadEvent): boolean {
    this.clearAllTimers();
    if (this.hasUnsavedChanges) { event.returnValue = this.t('common.unsavedChanges'); return false; }
    return true;
  }
}