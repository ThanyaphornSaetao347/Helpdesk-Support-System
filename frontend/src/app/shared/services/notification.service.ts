// src/app/shared/services/notification.service.ts
// ✅ IMPROVED VERSION - Better WebSocket Reconnection & Error Handling

import { Injectable, inject, OnDestroy } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Observable, BehaviorSubject, throwError, Subject, timer } from 'rxjs';
import { catchError, tap, takeUntil, map, switchMap, finalize, retry, retryWhen, delay, take } from 'rxjs/operators';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

// ✅ Import models
import {
  AppNotification,
  NotificationSummary,
  NotificationQueryOptions,
  NotificationSettings,
  NotificationType,
  NotificationStatus,
  NotificationPriority,
  DisplayNotification,
  createDisplayNotification,
  DEFAULT_NOTIFICATION_SETTINGS,
  BackendNotificationListResponse,
  transformBackendToApp,
  transformBackendSummary,
  NotificationPayload,
  NotificationResponse
} from '../models/notification.model';

/**
 * ✅ IMPROVED: Notification Service with Better Reconnection Strategy
 * 
 * Improvements:
 * 1. Exponential Backoff for WebSocket Reconnection
 * 2. Better Error Handling with finalize operator
 * 3. Retry Logic for API calls
 * 4. Connection Attempt Limiting
 */
@Injectable({
  providedIn: 'root'
})
export class NotificationService implements OnDestroy {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private apiUrl = environment.apiUrl;
  
  // ===== WEBSOCKET CONFIGURATION ===== ✅
  
  private socket: Socket | null = null;
  private readonly SOCKET_URL = 'http://localhost:4200';
  private readonly SOCKET_NAMESPACE = '/notifications';
  
  // ✅ IMPROVED: Reconnection Configuration with Exponential Backoff
  private readonly MAX_RECONNECTION_ATTEMPTS = 5;
  private readonly INITIAL_RECONNECTION_DELAY = 2000; // 2 seconds
  private readonly MAX_RECONNECTION_DELAY = 30000; // 30 seconds
  private reconnectionAttempts = 0;
  private reconnectionTimer: any = null;
  
  // Connection state
  private connectionStateSubject = new BehaviorSubject<'connected' | 'disconnected' | 'connecting'>('disconnected');
  public connectionState$ = this.connectionStateSubject.asObservable();

  // ===== STATE MANAGEMENT ===== ✅

  private notificationsSubject = new BehaviorSubject<AppNotification[]>([]);
  public notifications$ = this.notificationsSubject.asObservable();

  private unreadCountSubject = new BehaviorSubject<number>(0);
  public unreadCount$ = this.unreadCountSubject.asObservable();

  private summarySubject = new BehaviorSubject<NotificationSummary | null>(null);
  public summary$ = this.summarySubject.asObservable();

  private settingsSubject = new BehaviorSubject<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  public settings$ = this.settingsSubject.asObservable();

  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$ = this.loadingSubject.asObservable();

  private errorSubject = new BehaviorSubject<string | null>(null);
  public error$ = this.errorSubject.asObservable();

  // ===== CONFIGURATION ===== ✅

  private readonly CACHE_KEY = 'app_notifications_cache';
  private readonly SETTINGS_KEY = 'app_notification_settings';
  private readonly MAX_NOTIFICATIONS = 50;
  private readonly POLLING_INTERVAL = 30000; // 30 seconds
  
  private destroy$ = new Subject<void>();
  private pollingSubscription: any = null;
  
  // ✅ Flag to prevent concurrent API calls
  private isFetchingNotifications = false;

  // ===== INITIALIZATION ===== ✅

  constructor() {
    console.log('✅ NotificationService initialized (IMPROVED)');
    this.initializeService();
  }

  private initializeService(): void {
    this.loadSettingsFromStorage();
    this.loadCachedNotifications();

    this.authService.authState$
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => {
        if (state.isAuthenticated) {
          // ✅ Reset reconnection attempts on new login
          this.reconnectionAttempts = 0;
          
          // Fetch notifications
          this.fetchNotifications().subscribe();
          
          // Start polling
          this.startPolling();
          
          // Connect WebSocket
          this.connectSocket();
        } else {
          this.stopPolling();
          this.disconnectSocket();
          this.clearNotifications();
        }
      });
  }

  // ===== IMPROVED API METHODS ===== ✅

  /**
   * ✅ IMPROVED: Fetch notifications with Race Condition Prevention & Retry Logic
   */
  public fetchNotifications(): Observable<AppNotification[]> {
    // ✅ Prevent concurrent calls
    if (this.isFetchingNotifications) {
      console.log('⚠️ Already fetching notifications, skipping...');
      return new Observable(observer => {
        observer.next(this.notificationsSubject.value);
        observer.complete();
      });
    }

    console.log('📡 Fetching notifications from API: GET /api/notifications/list');
    
    this.isFetchingNotifications = true;
    this.loadingSubject.next(true);
    this.errorSubject.next(null);

    return this.http.get<BackendNotificationListResponse>(
      `${this.apiUrl}/notifications/list`,
      { headers: this.getAuthHeaders() }
    ).pipe(
      // ✅ Retry with exponential backoff on failure (max 2 retries)
      retryWhen(errors => 
        errors.pipe(
          delay(1000),
          take(2),
          tap(err => console.log('🔄 Retrying API call...', err))
        )
      ),
      tap(response => {
        console.log('📡 Backend API response:', response);
        
        if (response.success && response.data) {
          const transformedNotifications = response.data.notifications.map(n => 
            transformBackendToApp(n)
          );
          
          console.log('✅ Transformed notifications:', transformedNotifications.length);
          
          this.notificationsSubject.next(transformedNotifications);
          
          const unreadCount = this.getSafeNumber(response.data.summary.unread_count);
          this.unreadCountSubject.next(unreadCount);
          
          const transformedSummary = transformBackendSummary(
            response.data.summary,
            transformedNotifications
          );
          this.summarySubject.next(transformedSummary);
          
          this.cacheNotifications(transformedNotifications);
          
          console.log('📊 Summary:', {
            total: response.data.summary.total,
            unread: unreadCount
          });
        }
      }),
      map(response => {
        const transformed = response.data.notifications.map(n => transformBackendToApp(n));
        return transformed;
      }),
      // ✅ CRITICAL: finalize runs on success OR error
      finalize(() => {
        this.loadingSubject.next(false);
        this.isFetchingNotifications = false;
        console.log('✅ Fetch completed - loading flag reset');
      }),
      catchError(error => {
        return this.handleError(error);
      })
    );
  }

  /**
   * ✅ Mark notification as read
   */
  public markAsRead(notificationId: number): Observable<any> {
    console.log('✅ Marking notification as read:', notificationId);

    return this.http.put(
      `${this.apiUrl}/mark-read/${notificationId}`,
      {},
      { headers: this.getAuthHeaders() }
    ).pipe(
      tap(() => {
        const notifications = this.notificationsSubject.value;
        const updatedNotifications = notifications.map(n =>
          n.id === notificationId
            ? { ...n, status: NotificationStatus.READ, read_at: new Date().toISOString() }
            : n
        );
        
        this.notificationsSubject.next(updatedNotifications);
        
        const newUnreadCount = Math.max(0, this.unreadCountSubject.value - 1);
        this.unreadCountSubject.next(newUnreadCount);
        
        this.updateSummary();
        this.cacheNotifications(updatedNotifications);
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * ✅ Mark all notifications as read
   */
  public markAllAsRead(): Observable<any> {
    console.log('✅ Marking all notifications as read');

    return this.http.put(
      `${this.apiUrl}/mark-all-read`,
      {},
      { headers: this.getAuthHeaders() }
    ).pipe(
      tap(() => {
        const notifications = this.notificationsSubject.value;
        const updatedNotifications = notifications.map(n => ({
          ...n,
          status: NotificationStatus.READ,
          read_at: new Date().toISOString()
        }));
        
        this.notificationsSubject.next(updatedNotifications);
        this.unreadCountSubject.next(0);
        
        this.updateSummary();
        this.cacheNotifications(updatedNotifications);
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * ✅ Delete notification
   */
  public deleteNotification(notificationId: number): Observable<any> {
    console.log('🗑️ Deleting notification:', notificationId);

    return this.http.delete(
      `${this.apiUrl}/delete-notification/${notificationId}`,
      { headers: this.getAuthHeaders() }
    ).pipe(
      tap(() => {
        const notifications = this.notificationsSubject.value;
        const updatedNotifications = notifications.filter(n => n.id !== notificationId);
        
        this.notificationsSubject.next(updatedNotifications);
        this.updateSummary();
        this.cacheNotifications(updatedNotifications);
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * ✅ Delete all notifications
   */
  public deleteAllNotifications(): Observable<any> {
    console.log('🗑️ Deleting all notifications');

    return this.http.delete(
      `${this.apiUrl}/delete-all-notifications`,
      { headers: this.getAuthHeaders() }
    ).pipe(
      tap(() => {
        this.notificationsSubject.next([]);
        this.unreadCountSubject.next(0);
        this.summarySubject.next(null);
        this.clearCache();
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * ✅ Notify ticket changes (สำหรับส่ง notification เมื่อมีการเปลี่ยนแปลง ticket)
   * POST /api/notify-changes
   * 
   * ใช้เมื่อ:
   * - สร้าง ticket ใหม่
   * - เปลี่ยนสถานะ ticket
   * - มอบหมายงาน
   */
  public notifyTicketChanges(payload: NotificationPayload): Observable<NotificationResponse> {
    console.log('📤 Notifying ticket changes:', payload);

    return this.http.post<{
      success: boolean;
      message: string;
      data: any[];
      summary?: any;
    }>(
      `${this.apiUrl}/notify-changes`,
      payload,
      { headers: this.getAuthHeaders() }
    ).pipe(
      tap(response => {
        console.log('✅ Ticket changes notified:', response);
        
        // อัพเดท local state ถ้า Backend ส่ง notifications กลับมา
        if (response.success && response.data && response.data.length > 0) {
          const transformedNotifications = response.data.map(n => 
            transformBackendToApp(n)
          );
          
          // เพิ่ม notifications ใหม่เข้า list
          const currentNotifications = this.notificationsSubject.value;
          const updatedNotifications = [...transformedNotifications, ...currentNotifications];
          this.notificationsSubject.next(updatedNotifications.slice(0, this.MAX_NOTIFICATIONS));
          
          // อัพเดท summary ถ้ามี
          if (response.summary) {
            const transformedSummary = transformBackendSummary(
              response.summary,
              updatedNotifications
            );
            this.summarySubject.next(transformedSummary);
          }
          
          this.cacheNotifications(updatedNotifications);
        }
        
        // Refresh notifications จาก API
        this.fetchNotifications().subscribe();
      }),
      map(response => ({
        success: response.success,
        message: response.message,
        data: response.data?.map(n => transformBackendToApp(n)) || [],
        summary: response.summary
      })),
      catchError(this.handleError.bind(this))
    );
  }

  // ===== POLLING ===== ✅

  private startPolling(): void {
    if (this.pollingSubscription) {
      return;
    }

    console.log('🔄 Starting notifications polling (interval:', this.POLLING_INTERVAL, 'ms)');
    
    this.pollingSubscription = timer(this.POLLING_INTERVAL, this.POLLING_INTERVAL)
      .pipe(
        takeUntil(this.destroy$),
        switchMap(() => this.fetchNotifications())
      )
      .subscribe({
        next: (notifications) => console.log('🔄 Polling update:', notifications.length),
        error: (error) => console.error('❌ Polling error:', error)
      });
  }

  private stopPolling(): void {
    if (this.pollingSubscription) {
      console.log('🛑 Stopping notifications polling...');
      this.pollingSubscription.unsubscribe();
      this.pollingSubscription = null;
    }
  }

  // ===== IMPROVED WEBSOCKET METHODS ===== ✅

  /**
   * ✅ IMPROVED: Connect to WebSocket with Better Error Handling
   */
  public connectSocket(): void {
    const token = this.authService.getToken();
    if (!token) {
      console.warn('⚠️ No token available, cannot connect socket');
      return;
    }

    if (this.socket?.connected) {
      console.log('ℹ️ Socket already connected');
      return;
    }

    // ✅ Check if max reconnection attempts reached
    if (this.reconnectionAttempts >= this.MAX_RECONNECTION_ATTEMPTS) {
      console.error('❌ Max reconnection attempts reached. Stopping reconnection.');
      this.connectionStateSubject.next('disconnected');
      this.errorSubject.next('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณารีเฟรชหน้าเว็บ');
      return;
    }

    console.log(`🔌 Connecting to WebSocket (attempt ${this.reconnectionAttempts + 1}/${this.MAX_RECONNECTION_ATTEMPTS})...`);
    this.connectionStateSubject.next('connecting');

    try {
      // ✅ IMPROVED: Better reconnection configuration with exponential backoff
      const reconnectionDelay = Math.min(
        this.INITIAL_RECONNECTION_DELAY * Math.pow(2, this.reconnectionAttempts),
        this.MAX_RECONNECTION_DELAY
      );

      this.socket = io(`${this.SOCKET_URL}${this.SOCKET_NAMESPACE}`, {
        auth: { token: token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: this.MAX_RECONNECTION_ATTEMPTS,
        reconnectionDelay: reconnectionDelay,
        reconnectionDelayMax: this.MAX_RECONNECTION_DELAY,
        timeout: 10000,
        // ✅ Add randomization factor to prevent thundering herd
        randomizationFactor: 0.5
      });

      this.setupSocketListeners();
      this.reconnectionAttempts++;

    } catch (error) {
      console.error('❌ Error creating socket connection:', error);
      this.connectionStateSubject.next('disconnected');
      this.errorSubject.next('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์แจ้งเตือนได้');
      
      // ✅ Schedule retry with exponential backoff
      this.scheduleReconnection();
    }
  }

  /**
   * ✅ NEW: Schedule reconnection with exponential backoff
   */
  private scheduleReconnection(): void {
    // Clear any existing timer
    if (this.reconnectionTimer) {
      clearTimeout(this.reconnectionTimer);
    }

    // Check if we should retry
    if (this.reconnectionAttempts >= this.MAX_RECONNECTION_ATTEMPTS) {
      console.error('❌ Max reconnection attempts reached');
      return;
    }

    // Calculate delay with exponential backoff
    const delay = Math.min(
      this.INITIAL_RECONNECTION_DELAY * Math.pow(2, this.reconnectionAttempts),
      this.MAX_RECONNECTION_DELAY
    );

    console.log(`⏰ Scheduling reconnection in ${delay}ms...`);

    this.reconnectionTimer = setTimeout(() => {
      if (this.authService.isAuthenticated()) {
        this.connectSocket();
      }
    }, delay);
  }

  /**
   * ✅ IMPROVED: Setup socket listeners with better error handling
   */
  private setupSocketListeners(): void {
    if (!this.socket) return;

    // ===== CONNECTION EVENTS ===== ✅
    
    this.socket.on('connect', () => {
      console.log('✅ Socket connected successfully:', this.socket?.id);
      this.connectionStateSubject.next('connected');
      this.errorSubject.next(null);
      
      // ✅ Reset reconnection attempts on successful connection
      this.reconnectionAttempts = 0;
      
      // Clear any pending reconnection timer
      if (this.reconnectionTimer) {
        clearTimeout(this.reconnectionTimer);
        this.reconnectionTimer = null;
      }
    });

    this.socket.on('connection_success', (data: any) => {
      console.log('✅ Connection success event received:', data);
      this.connectionStateSubject.next('connected');
      this.errorSubject.next(null);
      
      // Fetch notifications on successful connection
      this.fetchNotifications().subscribe();
    });

    this.socket.on('subscribed', (data: any) => {
      console.log('✅ Subscribed to notifications:', data);
    });

    this.socket.on('disconnect', (reason: string) => {
      console.log('⚠️ Socket disconnected:', reason);
      this.connectionStateSubject.next('disconnected');
      
      // ✅ IMPROVED: Better reconnection logic
      if (reason === 'io server disconnect') {
        // Server initiated disconnect - schedule reconnection
        console.log('🔄 Server forced disconnect, scheduling reconnection...');
        this.scheduleReconnection();
      } else if (reason === 'transport close' || reason === 'transport error') {
        // Network issue - schedule reconnection
        console.log('🔄 Network issue, scheduling reconnection...');
        this.scheduleReconnection();
      }
      // For 'io client disconnect', don't reconnect (intentional disconnect)
    });

    this.socket.on('connect_error', (error: Error) => {
      console.error('❌ Socket connection error:', error.message);
      this.connectionStateSubject.next('disconnected');
      
      // ✅ IMPROVED: Better error handling
      if (error.message.includes('Authentication') || error.message.includes('jwt')) {
        this.errorSubject.next('การตรวจสอบสิทธิ์ล้มเหลว กรุณาเข้าสู่ระบบใหม่');
        this.authService.logout();
        // Don't schedule reconnection for auth errors
      } else {
        this.errorSubject.next('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์');
        // Schedule reconnection for network errors
        this.scheduleReconnection();
      }
    });

    this.socket.on('reconnect_attempt', (attemptNumber: number) => {
      console.log(`🔄 Reconnection attempt ${attemptNumber}...`);
      this.connectionStateSubject.next('connecting');
    });

    this.socket.on('reconnect_failed', () => {
      console.error('❌ All reconnection attempts failed');
      this.connectionStateSubject.next('disconnected');
      this.errorSubject.next('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณารีเฟรชหน้าเว็บ');
    });

    // ===== NOTIFICATION EVENTS ===== ✅

    this.socket.on('new_notification', (data: any) => {
      console.log('🔔 New notification event received:', data);
      
      // Refresh from API to ensure data consistency
      this.fetchNotifications().subscribe();
    });

    this.socket.on('unread_count_update', (data: { unread_count: number }) => {
      console.log('📊 Unread count update event received:', data);
      
      if (data && data.unread_count !== undefined) {
        const safeCount = this.getSafeNumber(data.unread_count);
        this.unreadCountSubject.next(safeCount);
        this.updateSummaryWithCount(safeCount);
      }
    });

    this.socket.on('notification_read', (data: { notificationId: number }) => {
      console.log('✅ Notification read event received:', data);
      
      const notifications = this.notificationsSubject.value;
      const updatedNotifications = notifications.map(n =>
        n.id === data.notificationId
          ? { ...n, status: NotificationStatus.READ, read_at: new Date().toISOString() }
          : n
      );
      
      this.notificationsSubject.next(updatedNotifications);
      this.updateSummary();
      this.cacheNotifications(updatedNotifications);
    });

    this.socket.on('notification_deleted', (data: { notificationId: number }) => {
      console.log('🗑️ Notification deleted event received:', data);
      
      const notifications = this.notificationsSubject.value;
      const updatedNotifications = notifications.filter(n => n.id !== data.notificationId);
      
      this.notificationsSubject.next(updatedNotifications);
      this.updateSummary();
      this.cacheNotifications(updatedNotifications);
    });
  }

  /**
   * ✅ IMPROVED: Disconnect socket and cleanup
   */
  public disconnectSocket(): void {
    console.log('🔌 Disconnecting socket...');
    
    // Clear reconnection timer
    if (this.reconnectionTimer) {
      clearTimeout(this.reconnectionTimer);
      this.reconnectionTimer = null;
    }
    
    // Reset reconnection attempts
    this.reconnectionAttempts = 0;
    
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    
    this.connectionStateSubject.next('disconnected');
  }

  // ===== HELPER METHODS ===== ✅

  private updateSummary(): void {
    const notifications = this.notificationsSubject.value;
    const unreadCount = this.getSafeNumber(
      notifications.filter(n => n.status === NotificationStatus.UNREAD).length
    );
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = notifications.filter(n => 
      new Date(n.created_at) >= today
    ).length;

    const currentSummary = this.summarySubject.value;
    
    const updatedSummary: NotificationSummary = {
      total: notifications.length,
      unread: unreadCount,
      today: todayCount,
      high_priority: currentSummary?.high_priority || 0,
      by_type: currentSummary?.by_type || {}
    };
    
    this.summarySubject.next(updatedSummary);
  }

  private updateSummaryWithCount(unreadCount: number): void {
    const currentSummary = this.summarySubject.value;
    
    const updatedSummary: NotificationSummary = {
      total: currentSummary?.total || 0,
      unread: unreadCount,
      today: currentSummary?.today || 0,
      high_priority: currentSummary?.high_priority || 0,
      by_type: currentSummary?.by_type || {}
    };
    
    this.summarySubject.next(updatedSummary);
  }

  /**
   * ✅ Helper method to safely convert any value to a valid number
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

  // ===== CACHE MANAGEMENT ===== ✅

  private cacheNotifications(notifications: AppNotification[]): void {
    try {
      const cacheData = { notifications, timestamp: new Date().toISOString() };
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(cacheData));
    } catch (error) {
      console.warn('Error caching notifications:', error);
    }
  }

  private loadCachedNotifications(): void {
    try {
      const cached = localStorage.getItem(this.CACHE_KEY);
      if (cached) {
        const cacheData = JSON.parse(cached);
        this.notificationsSubject.next(cacheData.notifications || []);
        this.updateSummary();
        console.log('✅ Loaded cached notifications:', cacheData.notifications.length);
      }
    } catch (error) {
      console.warn('Error loading cached notifications:', error);
    }
  }

  private clearCache(): void {
    localStorage.removeItem(this.CACHE_KEY);
  }

  private clearNotifications(): void {
    this.notificationsSubject.next([]);
    this.unreadCountSubject.next(0);
    this.summarySubject.next(null);
    this.clearCache();
  }

  // ===== SETTINGS MANAGEMENT ===== ✅

  private loadSettingsFromStorage(): void {
    try {
      const saved = localStorage.getItem(this.SETTINGS_KEY);
      if (saved) {
        const settings = JSON.parse(saved);
        this.settingsSubject.next(settings);
      }
    } catch (error) {
      console.warn('Error loading notification settings:', error);
    }
  }

  updateSettings(settings: NotificationSettings): void {
    this.settingsSubject.next(settings);
    localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(settings));
    console.log('✅ Notification settings updated');
  }

  resetSettings(): void {
    this.settingsSubject.next(DEFAULT_NOTIFICATION_SETTINGS);
    localStorage.removeItem(this.SETTINGS_KEY);
    console.log('✅ Notification settings reset to default');
  }

  // ===== PUBLIC GETTERS ===== ✅

  getCurrentNotifications(): AppNotification[] {
    return this.notificationsSubject.value;
  }

  getUnreadCount(): number {
    return this.getSafeNumber(this.unreadCountSubject.value);
  }

  getSummary(): NotificationSummary | null {
    return this.summarySubject.value;
  }

  getSettings(): NotificationSettings {
    return this.settingsSubject.value;
  }

  getConnectionState(): 'connected' | 'disconnected' | 'connecting' {
    return this.connectionStateSubject.value;
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  /**
   * ✅ NEW: Manual retry for connection
   */
  public retryConnection(): void {
    console.log('🔄 Manual connection retry requested');
    this.reconnectionAttempts = 0; // Reset attempts
    this.disconnectSocket();
    this.connectSocket();
  }

  // ===== UTILITIES ===== ✅

  private getAuthHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    });
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';

    if (error.error instanceof ErrorEvent) {
      errorMessage = `Client Error: ${error.error.message}`;
    } else {
      switch (error.status) {
        case 0:
          errorMessage = 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต';
          break;
        case 401:
          errorMessage = 'ไม่มีสิทธิ์เข้าถึง';
          break;
        case 403:
          errorMessage = 'ไม่มีสิทธิ์ในการดำเนินการนี้';
          break;
        case 404:
          errorMessage = 'ไม่พบข้อมูลที่ต้องการ';
          break;
        case 500:
          errorMessage = 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์';
          break;
        default:
          errorMessage = error.error?.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ';
      }
    }

    this.errorSubject.next(errorMessage);
    console.error('❌ Error:', errorMessage, error);
    return throwError(() => errorMessage);
  }

  async requestNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.warn('Browser does not support notifications');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    return false;
  }

  ngOnDestroy(): void {
    console.log('🧹 NotificationService cleanup');
    this.stopPolling();
    this.disconnectSocket();
    this.destroy$.next();
    this.destroy$.complete();
  }
}