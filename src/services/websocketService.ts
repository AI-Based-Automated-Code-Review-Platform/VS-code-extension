import * as vscode from 'vscode';
import { AuthService } from './authService';

export interface ReviewUpdate {
    type: 'review_update' | 'review_completed' | 'review_error' | 'review_status_update' | 'notification';
    review_id?: string;
    status?: string;
    progress?: number;
    message?: string;
    review_data?: any;
    token_usage?: any;
    thread_id?: string;
    error?: string;
    title?: string;
    data?: any;
}

interface WSConnection {
    send(data: string): void;
    close(code?: number, reason?: string): void;
    readyState: number;
    addEventListener?(event: string, callback: Function): void;
    removeEventListener?(event: string, callback: Function): void;
}

export class WebSocketService {
    private ws: WSConnection | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 1000; // Start with 1 second
    private isConnecting = false;
    private listeners: Map<string, ((update: ReviewUpdate) => void)[]> = new Map();
    private pingInterval: NodeJS.Timeout | null = null;

    // Event handlers stored separately to avoid circular references
    private onOpenHandler?: () => void;
    private onMessageHandler?: (data: string) => void;
    private onCloseHandler?: (code: number, reason: string) => void;
    private onErrorHandler?: (error?: any) => void;

    constructor(private baseUrl: string, private userId: string, private authService: AuthService) {}

    public async connect(): Promise<void> {
        return new Promise(async (resolve, reject) => {
            if (this.ws && this.ws.readyState === 1) { // OPEN state
                resolve();
                return;
            }

            if (this.isConnecting) {
                reject(new Error('Connection already in progress'));
                return;
            }

            this.isConnecting = true;
            
            try {
                const token = await this.authService.getToken();
                if (!token) {
                    this.isConnecting = false;
                    reject(new Error('No authentication token available'));
                    return;
                }
                
                console.log(`🔍 Token obtained (length: ${token.length})`);
                
                // Convert HTTP URL to WebSocket URL
                const wsBaseUrl = this.baseUrl.replace(/^https?:\/\//, 'ws://');
                const wsUrl = `${wsBaseUrl}/ws/user/${this.userId}/?token=${encodeURIComponent(token)}`;
                
                console.log(`🔗 Connecting to WebSocket: ${wsBaseUrl}/ws/user/${this.userId}/?token=...`);
                
                // Use ws library with proper event handling to avoid circular references
                const WebSocket = require('ws');
                this.ws = new WebSocket(wsUrl);

                // Set up event handlers separately to avoid circular references
                this.onOpenHandler = () => {
                    console.log('✅ WebSocket connected successfully');
                    this.isConnecting = false;
                    this.reconnectAttempts = 0;
                    this.reconnectDelay = 1000;
                    this.startPing();
                    resolve();
                };

                this.onMessageHandler = (data: string) => {
                    try {
                        const update: ReviewUpdate = JSON.parse(data.toString());
                        this.handleMessage(update);
                    } catch (error) {
                        console.error('❌ Error parsing WebSocket message:', error);
                    }
                };

                this.onCloseHandler = (code: number, reason: string) => {
                    console.log(`🔌 WebSocket closed: ${code} - ${reason}`);
                    this.isConnecting = false;
                    this.stopPing();
                    
                    if (code !== 1000) { // Not a normal closure
                        this.scheduleReconnect();
                    }
                };

                this.onErrorHandler = (error?: any) => {
                    // Avoid circular reference by only logging essential error info
                    const errorInfo = error ? {
                        message: error.message || 'Unknown error',
                        code: error.code,
                        type: error.type
                    } : 'Unknown WebSocket error';
                    
                    console.error('❌ WebSocket error occurred:', errorInfo);
                    this.isConnecting = false;
                    
                    if (this.reconnectAttempts === 0) {
                        reject(new Error(`WebSocket connection failed: ${typeof errorInfo === 'object' ? errorInfo.message : errorInfo}`));
                    }
                };

                // Attach event handlers using .on() method for ws library
                (this.ws as any).on('open', this.onOpenHandler);
                (this.ws as any).on('message', this.onMessageHandler);
                (this.ws as any).on('close', this.onCloseHandler);
                (this.ws as any).on('error', this.onErrorHandler);

            } catch (error) {
                this.isConnecting = false;
                console.error('❌ WebSocket setup error:', error);
                reject(error);
            }
        });
    }

    public disconnect(): void {
        if (this.ws) {
            this.stopPing();
            
            // Remove event listeners to avoid memory leaks
            if (this.onOpenHandler) {
                (this.ws as any).removeListener('open', this.onOpenHandler);
            }
            if (this.onMessageHandler) {
                (this.ws as any).removeListener('message', this.onMessageHandler);
            }
            if (this.onCloseHandler) {
                (this.ws as any).removeListener('close', this.onCloseHandler);
            }
            if (this.onErrorHandler) {
                (this.ws as any).removeListener('error', this.onErrorHandler);
            }
            
            this.ws.close(1000, 'Client disconnect');
            this.ws = null;
        }
        this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnection
    }

    public onReviewUpdate(reviewId: string, callback: (update: ReviewUpdate) => void): void {
        const key = `review_${reviewId}`;
        if (!this.listeners.has(key)) {
            this.listeners.set(key, []);
        }
        this.listeners.get(key)!.push(callback);
    }

    public onUserNotification(callback: (update: ReviewUpdate) => void): void {
        const key = 'user_notifications';
        if (!this.listeners.has(key)) {
            this.listeners.set(key, []);
        }
        this.listeners.get(key)!.push(callback);
    }

    public removeListener(reviewId: string, callback: (update: ReviewUpdate) => void): void {
        const key = `review_${reviewId}`;
        const listeners = this.listeners.get(key);
        if (listeners) {
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    private handleMessage(update: ReviewUpdate): void {
        console.log('📥 WebSocket message received:', JSON.stringify(update));

        // Handle review-specific updates
        if (update.review_id) {
            const reviewListeners = this.listeners.get(`review_${update.review_id}`);
            if (reviewListeners) {
                reviewListeners.forEach(callback => callback(update));
            }
        }

        // Handle user notifications
        if (update.type === 'notification' || update.type === 'review_status_update') {
            const userListeners = this.listeners.get('user_notifications');
            if (userListeners) {
                userListeners.forEach(callback => callback(update));
            }
        }

        // Show VS Code notifications for important updates
        this.showVSCodeNotification(update);
    }

    private showVSCodeNotification(update: ReviewUpdate): void {
        switch (update.type) {
            case 'review_completed':
                vscode.window.showInformationMessage(
                    `Code review completed for review ${update.review_id}`,
                    'View Results'
                ).then(selection => {
                    if (selection === 'View Results') {
                        vscode.commands.executeCommand('codeReview.showResults', update.review_id);
                    }
                });
                break;

            case 'review_error':
                vscode.window.showErrorMessage(
                    `Code review failed: ${update.error || 'Unknown error'}`
                );
                break;

            case 'notification':
                if (update.title) {
                    vscode.window.showInformationMessage(`${update.title}: ${update.message}`);
                }
                break;

            case 'review_status_update':
                if (update.status === 'completed') {
                    vscode.window.showInformationMessage(
                        `Review ${update.review_id} completed`,
                        'View Results'
                    ).then(selection => {
                        if (selection === 'View Results') {
                            vscode.commands.executeCommand('codeReview.showResults', update.review_id);
                        }
                    });
                }
                break;
        }
    }

    private scheduleReconnect(): void {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('❌ Max reconnection attempts reached');
            vscode.window.showErrorMessage('Lost connection to code review service. Please restart the extension.');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
        
        console.log(`🔄 Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);
        
        setTimeout(() => {
            if (this.reconnectAttempts <= this.maxReconnectAttempts) {
                this.connect().catch(error => {
                    console.error('❌ Reconnection failed:', error);
                });
            }
        }, delay);
    }

    private startPing(): void {
        this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === 1) { // OPEN state
                const pingMessage = JSON.stringify({
                    type: 'ping',
                    timestamp: Date.now()
                });
                this.ws.send(pingMessage);
                console.log('📤 Sent ping message');
            }
        }, 30000); // Ping every 30 seconds
    }

    private stopPing(): void {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    public isConnected(): boolean {
        return this.ws !== null && this.ws.readyState === 1; // OPEN state
    }

    public getConnectionState(): string {
        if (!this.ws) return 'disconnected';
        
        switch (this.ws.readyState) {
            case 0: return 'connecting'; // CONNECTING
            case 1: return 'connected';  // OPEN
            case 2: return 'closing';    // CLOSING
            case 3: return 'closed';     // CLOSED
            default: return 'unknown';
        }
    }
} 