// src/app/shared/components/notification-bell/notification-bell.component.ts
// ✅ IMPROVED VERSION - Fixes Loading Loop & Race Conditions

import { Component, OnInit, OnDestroy, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription, Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators'; // ✅ เพิ่ม operators

// ✅ Import Services
import { NotificationService } from '../../services/notification.service';
import { AuthService } from '../../services/auth.service';

// ✅ Import Models
import {
  DisplayNotification,
  NotificationSummary,
  NotificationType,
  NotificationStatus,
  NotificationPriority,
  getNotificationTypeLabel,
  getNotificationPriorityLabel
} from '../../models/notification.model';

// ✅ Import Permission Models
import { permissionEnum, UserRole, ROLES } from '../../models/permission.model';

/**
 * ✅ IMPROVED: Notification Bell Component with WebSocket Support
 * แก้ไขปัญหา:
 * 1. Loading Loop - ป้องกัน Race Condition ด้วย isLoading flag และ finalize
 * 2. Error Display - แสดง errorMessage จาก Service
 * 3. Proper Cleanup - ใช้ takeUntil pattern
 */
@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule
  ],
  templateUrl: './notification-bell.component.html',
  styleUrls: ['./notification-bell.component.css']
})
export class NotificationBellComponent implements OnInit, OnDestroy {
  // ===== DEPENDENCY INJECTION ===== ✅
  private notificationService = inject(NotificationService);
  private authService = inject(AuthService);
  private router = inject(Router);

  // ===== COMPONENT STATE ===== ✅
  notifications: DisplayNotification[] = [];
  unreadCount = 0;
  summary: NotificationSummary | null = null;
  isDropdownOpen = false;
  isLoading = false;
  error: string | null = null;
  errorMessage: string | null = null; // ✅ เพิ่ม errorMessage สำหรับแสดงใน template

  // ✅ WebSocket connection state
  socketConnectionState: 'connected' | 'disconnected' | 'connecting' = 'disconnected';

  // ===== FILTER STATE ===== ✅
  selectedFilter: 'all' | 'unread' | 'today' = 'all';
  selectedType: NotificationType | 'all' = 'all';

  // ===== SUBSCRIPTIONS ===== ✅
  private destroy$ = new Subject<void>(); // ✅ ใช้สำหรับ cleanup

  // ===== ENUMS FOR TEMPLATE ===== ✅
  readonly NotificationType = NotificationType;
  readonly NotificationStatus = NotificationStatus;
  readonly NotificationPriority = NotificationPriority;
  readonly ROLES = ROLES;

  // ===== CURRENT LANGUAGE ===== ✅
  currentLanguage: 'th' | 'en' = 'th';

  // ===== LIFECYCLE HOOKS ===== ✅

  ngOnInit(): void {
    console.log('🔔 NotificationBellComponent initialized (IMPROVED)');
    this.initializeComponent();
  }

  ngOnDestroy(): void {
    console.log('🔔 NotificationBellComponent destroyed');
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ===== INITIALIZATION ===== ✅

  private initializeComponent(): void {
    // โหลด language preference
    this.loadLanguagePreference();

    // Subscribe to notifications (จะได้รับ updates แบบ real-time ผ่าน WebSocket)
    this.subscribeToNotifications();

    // Subscribe to unread count
    this.subscribeToUnreadCount();

    // Subscribe to summary
    this.subscribeToSummary();

    // Subscribe to loading state
    this.subscribeToLoading();

    // ✅ Subscribe to error state from Service
    this.subscribeToError();

    // ✅ Subscribe to WebSocket connection state
    this.subscribeToConnectionState();
  }

  /**
   * โหลด language preference
   */
  private loadLanguagePreference(): void {
    const saved = localStorage.getItem('language');
    if (saved === 'en' || saved === 'th') {
      this.currentLanguage = saved;
    }

    // Listen for language changes
    window.addEventListener('language-changed', (event: any) => {
      this.currentLanguage = event.detail.language;
    });
  }

  /**
   * Subscribe to notifications
   * จะได้รับ updates แบบ real-time จาก WebSocket
   */
  private subscribeToNotifications(): void {
    this.notificationService.notifications$
      .pipe(takeUntil(this.destroy$))
      .subscribe(notifications => {
        this.notifications = notifications.map(n => ({
          ...n,
          timeAgo: this.formatTimeAgo(n.created_at),
          icon: this.getNotificationIcon(n.notification_type),
          color: this.getNotificationColor(n.notification_type),
          route: `/tickets/${n.ticket_no}`
        }));

        console.log('🔔 Notifications updated (real-time):', this.notifications.length);
      });
  }

  /**
   * ✅ FIXED: Subscribe to unread count with NaN protection
   */
  private subscribeToUnreadCount(): void {
    this.notificationService.unreadCount$
      .pipe(takeUntil(this.destroy$))
      .subscribe(count => {
        const safeCount = this.getSafeNumber(count);
        this.unreadCount = safeCount;
        
        console.log('🔔 Unread count:', safeCount, '(original:', count, ')');
        
        if (count !== safeCount) {
          console.warn('⚠️ Invalid unread count received:', count, '- converted to:', safeCount);
        }
      });
  }

  /**
   * ✅ Helper method to safely convert value to number
   */
  private getSafeNumber(value: any): number {
    if (value === null || value === undefined) {
      return 0;
    }

    const num = Number(value);

    if (Number.isNaN(num)) {
      return 0;
    }

    if (!Number.isFinite(num) || num < 0) {
      return 0;
    }

    return Math.floor(num);
  }

  /**
   * Subscribe to summary
   */
  private subscribeToSummary(): void {
    this.notificationService.summary$
      .pipe(takeUntil(this.destroy$))
      .subscribe(summary => {
        this.summary = summary;
        
        if (summary && summary.unread !== undefined) {
          const safeSummaryUnread = this.getSafeNumber(summary.unread);
          if (safeSummaryUnread !== this.unreadCount) {
            console.log('📊 Summary unread:', safeSummaryUnread, 'vs unreadCount:', this.unreadCount);
          }
        }
      });
  }

  /**
   * Subscribe to loading state
   */
  private subscribeToLoading(): void {
    this.notificationService.loading$
      .pipe(takeUntil(this.destroy$))
      .subscribe(loading => {
        this.isLoading = loading;
      });
  }

  /**
   * ✅ IMPROVED: Subscribe to error state และแสดง errorMessage
   */
  private subscribeToError(): void {
    this.notificationService.error$
      .pipe(takeUntil(this.destroy$))
      .subscribe(error => {
        this.error = error;
        this.errorMessage = error; // ✅ เก็บไว้แสดงใน template
        
        // ✅ Auto-clear error after 5 seconds
        if (error) {
          console.error('❌ Error from NotificationService:', error);
          setTimeout(() => {
            if (this.errorMessage === error) {
              this.errorMessage = null;
            }
          }, 5000);
        }
      });
  }

  /**
   * ✅ Subscribe to WebSocket connection state
   */
  private subscribeToConnectionState(): void {
    this.notificationService.connectionState$
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => {
        this.socketConnectionState = state;
        console.log('🔔 Socket connection state:', state);
      });
  }

  // ===== NOTIFICATION ACTIONS ===== ✅

  /**
   * ✅ IMPROVED: Refresh notifications with Race Condition Prevention
   * ป้องกันการโหลดซ้ำซ้อนด้วย isLoading flag และ finalize operator
   */
  refreshNotifications(): void {
    // ✅ ป้องกัน Race Condition - ถ้ากำลังโหลดอยู่แล้วให้ return
    if (this.isLoading) {
      console.log('⚠️ Already loading, skipping refresh request');
      return;
    }

    console.log('🔄 Manually refreshing notifications from API');
    
    this.notificationService.fetchNotifications()
      .pipe(
        // ✅ finalize จะทำงานไม่ว่า success หรือ error
        finalize(() => {
          // isLoading จะถูกจัดการโดย Service แล้ว
          console.log('✅ Refresh completed');
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: () => {
          console.log('✅ Notifications refreshed from API');
          this.errorMessage = null; // ✅ Clear error on success
        },
        error: (error) => {
          console.error('❌ Error refreshing notifications:', error);
          // errorMessage จะถูกตั้งค่าผ่าน errorSubject จาก Service
        }
      });
  }

  /**
   * เปิด/ปิด dropdown
   */
  toggleDropdown(): void {
    this.isDropdownOpen = !this.isDropdownOpen;

    if (this.isDropdownOpen) {
      console.log('🔔 Notification dropdown opened');
    }
  }

  /**
   * ปิด dropdown
   */
  closeDropdown(): void {
    this.isDropdownOpen = false;
  }

  /**
   * ✅ Mark notification as read
   */
  markAsRead(notification: DisplayNotification, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    console.log('✅ Marking notification as read:', notification.id);

    this.notificationService.markAsRead(notification.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => console.log('✅ Notification marked as read'),
        error: (error) => console.error('❌ Error marking as read:', error)
      });
  }

  /**
   * ✅ Mark all as read
   */
  markAllAsRead(event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    console.log('✅ Marking all notifications as read');

    this.notificationService.markAllAsRead()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => console.log('✅ All notifications marked as read'),
        error: (error) => console.error('❌ Error marking all as read:', error)
      });
  }

  /**
   * ✅ Delete notification
   */
  deleteNotification(notification: DisplayNotification, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    if (confirm(this.getText('Delete this notification?', 'ลบการแจ้งเตือนนี้?'))) {
      console.log('🗑️ Deleting notification:', notification.id);

      this.notificationService.deleteNotification(notification.id)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => console.log('✅ Notification deleted'),
          error: (error) => console.error('❌ Error deleting notification:', error)
        });
    }
  }

  /**
   * ✅ Delete all notifications
   */
  deleteAllNotifications(event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    if (confirm(this.getText('Delete all notifications?', 'ลบการแจ้งเตือนทั้งหมด?'))) {
      console.log('🗑️ Deleting all notifications');

      this.notificationService.deleteAllNotifications()
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => console.log('✅ All notifications deleted'),
          error: (error) => console.error('❌ Error deleting all:', error)
        });
    }
  }

  /**
   * Navigate เมื่อคลิก notification
   */
  onNotificationClick(notification: DisplayNotification, event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    console.log('🔔 Notification clicked:', notification.ticket_no);

    // Mark as read
    if (notification.status === NotificationStatus.UNREAD) {
      this.notificationService.markAsRead(notification.id)
        .pipe(takeUntil(this.destroy$))
        .subscribe();
    }

    // Navigate to ticket
    this.closeDropdown();
    this.router.navigate([notification.route]);
  }

  // ===== FILTERS ===== ✅

  changeFilter(filter: 'all' | 'unread' | 'today'): void {
    this.selectedFilter = filter;
    console.log('🔍 Filter changed to:', filter);
  }

  changeTypeFilter(type: NotificationType | 'all'): void {
    this.selectedType = type;
    console.log('🔍 Type filter changed to:', type);
  }

  getFilteredNotifications(): DisplayNotification[] {
    let filtered = [...this.notifications];

    // Filter by status/date
    switch (this.selectedFilter) {
      case 'unread':
        filtered = filtered.filter(n => n.status === NotificationStatus.UNREAD);
        break;
      case 'today':
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        filtered = filtered.filter(n => new Date(n.created_at) >= today);
        break;
    }

    // Filter by type
    if (this.selectedType !== 'all') {
      filtered = filtered.filter(n => n.notification_type === this.selectedType);
    }

    return filtered;
  }

  // ===== HELPER METHODS ===== ✅

  hasNotifications(): boolean {
    return this.notifications.length > 0;
  }

  hasUnreadNotifications(): boolean {
    const safeCount = this.getSafeNumber(this.unreadCount);
    return safeCount > 0;
  }

  getFilteredCount(): number {
    return this.getFilteredNotifications().length;
  }

  isSocketConnected(): boolean {
    return this.socketConnectionState === 'connected';
  }

  isSocketConnecting(): boolean {
    return this.socketConnectionState === 'connecting';
  }

  getConnectionStatusText(): string {
    switch (this.socketConnectionState) {
      case 'connected':
        return this.getText('Live', 'สด');
      case 'connecting':
        return this.getText('Connecting...', 'กำลังเชื่อมต่อ...');
      case 'disconnected':
        return this.getText('Offline', 'ออฟไลน์');
      default:
        return '';
    }
  }

  formatTimeAgo(dateString: string): string {
    const now = new Date();
    const date = new Date(dateString);
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) {
      return this.currentLanguage === 'th' ? 'เมื่อสักครู่' : 'Just now';
    }

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return this.currentLanguage === 'th' 
        ? `${minutes} นาทีที่แล้ว` 
        : `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return this.currentLanguage === 'th' 
        ? `${hours} ชั่วโมงที่แล้ว` 
        : `${hours} hour${hours > 1 ? 's' : ''} ago`;
    }

    const days = Math.floor(hours / 24);
    return this.currentLanguage === 'th' 
      ? `${days} วันที่แล้ว` 
      : `${days} day${days > 1 ? 's' : ''} ago`;
  }

  getNotificationIcon(type: NotificationType | string): string {
    const icons: { [key: string]: string } = {
      'NEW_TICKET': 'bi-plus-circle-fill',
      'new_ticket': 'bi-plus-circle-fill',
      'STATUS_CHANGE': 'bi-arrow-repeat',
      'status_change': 'bi-arrow-repeat',
      'ASSIGNMENT': 'bi-person-check-fill',
      'assignment': 'bi-person-check-fill',
      'COMMENT': 'bi-chat-dots-fill',
      'comment': 'bi-chat-dots-fill',
      'MENTION': 'bi-at',
      'mention': 'bi-at',
      'RESOLVED': 'bi-check-circle-fill',
      'resolved': 'bi-check-circle-fill',
      'CLOSED': 'bi-x-circle-fill',
      'closed': 'bi-x-circle-fill'
    };

    return icons[type] || 'bi-bell-fill';
  }

  getNotificationColor(type: NotificationType | string): string {
    const colors: { [key: string]: string } = {
      'NEW_TICKET': '#6c5ce7',
      'new_ticket': '#6c5ce7',
      'STATUS_CHANGE': '#74b9ff',
      'status_change': '#74b9ff',
      'ASSIGNMENT': '#fdcb6e',
      'assignment': '#fdcb6e',
      'COMMENT': '#00b894',
      'comment': '#00b894',
      'MENTION': '#e17055',
      'mention': '#e17055',
      'RESOLVED': '#00b894',
      'resolved': '#00b894',
      'CLOSED': '#636e72',
      'closed': '#636e72'
    };

    return colors[type] || '#6c5ce7';
  }

  getPriorityBadgeClass(priority: NotificationPriority): string {
    const classes: { [key in NotificationPriority]: string } = {
      [NotificationPriority.LOW]: 'badge-success',
      [NotificationPriority.MEDIUM]: 'badge-info',
      [NotificationPriority.HIGH]: 'badge-warning',
      [NotificationPriority.URGENT]: 'badge-danger'
    };

    return classes[priority];
  }

  getNotificationTypeLabel(type: NotificationType | string): string {
    return getNotificationTypeLabel(type, this.currentLanguage);
  }

  getNotificationPriorityLabel(priority: NotificationPriority): string {
    return getNotificationPriorityLabel(priority, this.currentLanguage);
  }

  getText(en: string, th: string): string {
    return this.currentLanguage === 'th' ? th : en;
  }

  trackByNotificationId(index: number, notification: DisplayNotification): number {
    return notification.id;
  }

  truncateText(text: string, maxLength: number = 50): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  // ===== PERMISSION CHECKS ===== ✅

  canViewNotifications(): boolean {
    return this.authService.isAuthenticated();
  }

  isSupporterOrAdmin(): boolean {
    return this.authService.hasAnyRole([ROLES.ADMIN, ROLES.SUPPORTER]);
  }

  // ===== HOST LISTENER ===== ✅

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const clickedInside = target.closest('.notification-bell-container');

    if (!clickedInside && this.isDropdownOpen) {
      this.closeDropdown();
    }
  }

  onDropdownClick(event: Event): void {
    event.stopPropagation();
  }

  // ===== NAVIGATION ===== ✅

  viewAllNotifications(event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    this.closeDropdown();
    this.router.navigate(['/notifications']);
  }

  openNotificationSettings(event: Event): void {
    event.preventDefault();
    event.stopPropagation();

    this.closeDropdown();
    this.router.navigate(['/settings/notifications']);
  }

  // ===== DEBUG METHODS ===== ✅

  debugState(): void {
    console.group('🔔 Notification Bell Debug');
    console.log('Notifications:', this.notifications);
    console.log('Unread Count:', this.unreadCount);
    console.log('Summary:', this.summary);
    console.log('Filter:', this.selectedFilter);
    console.log('Type Filter:', this.selectedType);
    console.log('Socket State:', this.socketConnectionState);
    console.log('Is Loading:', this.isLoading);
    console.log('Error Message:', this.errorMessage);
    console.groupEnd();
  }
}