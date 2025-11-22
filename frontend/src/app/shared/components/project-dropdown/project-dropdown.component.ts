import { Component, OnInit, Input, Output, EventEmitter, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Observable, of } from 'rxjs';  // ← เพิ่ม Observable, of
import { takeUntil, map, catchError, tap } from 'rxjs/operators';  // ← เพิ่ม map, catchError, tap
import { ProjectService } from '../../services/project.service';
import { ProjectDDL, ProjectStatus, isProjectStatus } from '../../models/project.model';

@Component({
  selector: 'app-project-dropdown',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './project-dropdown.component.html',
  styleUrls: ['./project-dropdown.component.css']
})
export class ProjectDropdownComponent implements OnInit, OnDestroy {
  private projectService = inject(ProjectService);

  @Input() label: string = 'เลือกโปรเจค';
  @Input() placeholder: string = '-- เลือกโปรเจค --';
  @Input() selectedProjectId: number | string = '';
  @Input() status: string = 'active';
  @Input() required: boolean = false;
  @Input() disabled: boolean = false;
  @Input() showCode: boolean = false;
  @Input() errorText: string = '';

  @Output() selectionChange = new EventEmitter<{
    project: ProjectDDL | null,
    projectId: number | string
  }>();

  projects: ProjectDDL[] = [];
  loading = false;
  error: string = '';
  hasError = false;

  private destroy$ = new Subject<void>();

  // ✏️ แก้ไขเป็น (ลบการเรียก loadProjects ออก):
  ngOnInit(): void {
    // ไม่ต้องโหลดที่นี่แล้ว - ให้ parent component เรียก
    // this.loadProjects(); ← ลบหรือ comment ออก
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadProjects(): Observable<ProjectDDL[]> {  // ← เปลี่ยน return type จาก void เป็น Observable
    this.loading = true;
    this.error = '';
    this.hasError = false;

    const statusValue: ProjectStatus = isProjectStatus(this.status) ? this.status : 'active';

    return this.projectService.getProjectDDLWithCache({ status: statusValue })
      .pipe(
        map(response => {  // ← ใช้ map แทน subscribe
          console.log('Project DDL Response:', response);
          if (response.code === 1) {
            this.projects = response.data;
            this.error = '';
            this.loading = false;
            return response.data;  // ← return ข้อมูล
          } else {
            this.error = response.message || 'เกิดข้อผิดพลาดในการโหลดข้อมูล';
            this.projects = [];
            this.loading = false;
            throw new Error(this.error);  // ← throw error เพื่อให้ catchError จัดการ
          }
        }),
        catchError(err => {  // ← เปลี่ยนจาก error callback ใน subscribe
          console.error('Error loading projects:', err);

          // ✅ PWA: ลองใช้ cached data ถ้า API ล้มเหลว
          return this.projectService.getCachedProjects(statusValue).pipe(
            tap(cachedData => {
              if (cachedData && cachedData.length > 0) {
                console.log('✅ Using cached projects:', cachedData.length);
                this.projects = cachedData;
                this.error = '';
                this.showOfflineIndicator();
              } else {
                this.error = typeof err === 'string' ? err : 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้';
                this.projects = [];
              }
              this.loading = false;
            }),
            map(cachedData => cachedData || []),  // ← แปลงเป็น array
            catchError(() => {
              this.error = typeof err === 'string' ? err : 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้';
              this.projects = [];
              this.loading = false;
              return of([]);  // ← return empty array
            })
          );
        }),
        takeUntil(this.destroy$)
      );
  }

  private showOfflineIndicator(): void {
    // แสดง indicator ว่าใช้ cached data
    const offlineMsg = 'ใช้ข้อมูลที่เก็บไว้ (ออฟไลน์)';
    console.log('📱 PWA:', offlineMsg);

    // อาจจะแสดง toast notification หรือ indicator ใน UI
    setTimeout(() => {
      const event = new CustomEvent('pwa-offline-data', {
        detail: { component: 'project-dropdown', message: offlineMsg }
      });
      window.dispatchEvent(event);
    }, 100);
  }

  onSelectionChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const projectId = target.value;
    let selectedProject: ProjectDDL | null = null;

    if (projectId) {
      selectedProject = this.projects.find(p => p.id === +projectId) || null;
    }

    // Reset validation error when user selects something
    if (projectId && this.hasError) {
      this.hasError = false;
    }

    this.selectedProjectId = projectId;
    this.selectionChange.emit({
      project: selectedProject,
      projectId: projectId
    });
  }

  // ✏️ แก้ไขเป็น:
  refresh(): void {
    this.loadProjects().subscribe({
      next: () => console.log('✅ Projects refreshed'),
      error: (err) => console.error('❌ Refresh error:', err)
    });
  }

  // Method สำหรับ validation จากภายนอก
  validate(): boolean {
    if (this.required && !this.selectedProjectId) {
      this.hasError = true;
      return false;
    }
    this.hasError = false;
    return true;
  }

  getProjectDisplayName(project: ProjectDDL): string {
    // รองรับทั้ง format จาก API ใหม่ (projectName) และ API เก่า (name)
    return project.projectName || project.name || 'Unknown Project';
  }

  // Method สำหรับ reset
  reset(): void {
    this.selectedProjectId = '';
    this.hasError = false;
    this.selectionChange.emit({
      project: null,
      projectId: ''
    });
  }

  // Method สำหรับตรวจสอบว่ามี validation error จาก parent component หรือไม่
  get isInvalid(): boolean {
    return this.hasError;
  }
}