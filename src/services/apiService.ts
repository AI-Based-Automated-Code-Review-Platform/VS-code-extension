import * as vscode from 'vscode';
import { AuthService } from './authService';

export interface ReviewRequest {
    files: { [path: string]: string };
    diff_str?: string;
    llm_model: string;
    standards: string[];
    metrics: string[];
    temperature: number;
    max_tokens: number;
    max_tool_calls: number;
    workspace_path?: string;
    repository_name?: string;
    git_remote_url?: string;
    git_branch?: string;
    is_git_repo?: boolean;
}

export interface ReviewResponse {
    id: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    result?: any;
    review_data?: any;
    error?: string;
    created_at: string;
    updated_at: string;
    review_id?: string;
    task_id?: string;
    websocket_url?: string;
}

export interface UserProfile {
    id: number;
    login: string;
    name: string;
    email: string;
    avatar_url: string;
}

export class ApiService {
    private baseUrl: string;
    private authService: AuthService;

    constructor(authService: AuthService) {
        this.baseUrl = vscode.workspace.getConfiguration('codeReview').get('backendUrl', 'http://localhost:8000');
        this.authService = authService;
    }

    private async getHeaders(): Promise<{ [key: string]: string }> {
        const token = await this.authService.getToken();
        const headers: { [key: string]: string } = {
            'Content-Type': 'application/json',
            'User-Agent': 'VS-Code-Extension'
        };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        return headers;
    }

    private async makeRequest(path: string, method: string = 'GET', body?: any): Promise<any> {
        return new Promise((resolve, reject) => {
            const https = require('https');
            const http = require('http');
            const url = require('url');
            
            const fullUrl = `${this.baseUrl}${path}`;
            const parsedUrl = url.parse(fullUrl);
            const isHttps = parsedUrl.protocol === 'https:';
            const client = isHttps ? https : http;
            
            const postData = body ? JSON.stringify(body) : null;
            
            this.getHeaders().then(headers => {
                if (postData) {
                    headers['Content-Length'] = Buffer.byteLength(postData).toString();
                }
                
                const options = {
                    hostname: parsedUrl.hostname,
                    port: parsedUrl.port || (isHttps ? 443 : 80),
                    path: parsedUrl.path,
                    method: method,
                    headers: headers
                };

                const req = client.request(options, (res: any) => {
                    let data = '';
                    res.on('data', (chunk: any) => data += chunk);
                    res.on('end', () => {
                        try {
                            const response = data ? JSON.parse(data) : {};
                            if (res.statusCode >= 200 && res.statusCode < 300) {
                                resolve(response);
                            } else {
                                reject(new Error(`HTTP ${res.statusCode}: ${response.message || response.detail || data}`));
                            }
                        } catch (error) {
                            if (res.statusCode >= 200 && res.statusCode < 300) {
                                resolve(data);
                            } else {
                                reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                            }
                        }
                    });
                });

                req.on('error', reject);
                
                if (postData) {
                    req.write(postData);
                }
                req.end();
            }).catch(reject);
        });
    }

    async submitVSCodeReview(request: ReviewRequest): Promise<ReviewResponse> {
        try {
            return await this.makeRequest('/api/v1/reviews/vscode-review/', 'POST', request);
        } catch (error) {
            console.error('Submit VS Code review error:', error);
            throw new Error(`Failed to submit review: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async submitReview(request: ReviewRequest): Promise<ReviewResponse> {
        // Alias for backward compatibility
        return this.submitVSCodeReview(request);
    }

    async getReviewStatus(reviewId: string): Promise<ReviewResponse> {
        try {
            return await this.makeRequest(`/api/v1/reviews/${reviewId}/`);
        } catch (error) {
            console.error('Get review status error:', error);
            throw new Error(`Failed to get review status: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async getReviewResult(reviewId: string): Promise<ReviewResponse> {
        try {
            return await this.makeRequest(`/api/v1/reviews/${reviewId}/`);
        } catch (error) {
            console.error('Get review result error:', error);
            throw new Error(`Failed to get review result: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async getCurrentUser(): Promise<any> {
        return await this.makeRequest('/api/v1/user/');
    }

    async getReviewHistory(limit: number = 10): Promise<ReviewResponse[]> {
        try {
            // Use the new VS Code specific endpoint instead of the old generic one
            return await this.getVSCodeReviewHistory(limit);
        } catch (error) {
            console.error('Get review history error:', error);
            throw new Error(`Failed to get review history: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async getVSCodeReviewHistory(limit: number = 20, workspacePath?: string, repositoryName?: string): Promise<ReviewResponse[]> {
        try {
            let url = `/api/v1/reviews/vscode-history/?limit=${limit}`;
            
            if (workspacePath) {
                url += `&workspace_path=${encodeURIComponent(workspacePath)}`;
            }
            
            if (repositoryName) {
                url += `&repository_name=${encodeURIComponent(repositoryName)}`;
            }
            
            const response = await this.makeRequest(url);
            return response;
        } catch (error) {
            console.error('Get VS Code review history error:', error);
            throw new Error(`Failed to get VS Code review history: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async submitFeedback(reviewId: string, rating: number, feedback?: string): Promise<void> {
        try {
            await this.makeRequest(`/api/v1/reviews/${reviewId}/submit_ai_rating/`, 'POST', {
                ai_rating: rating,
                feedback: feedback
            });
        } catch (error) {
            console.error('Submit feedback error:', error);
            throw new Error(`Failed to submit feedback: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    async checkHealth(): Promise<{ status: string; timestamp: string }> {
        try {
            return await this.makeRequest('/api/v1/health/');
        } catch (error) {
            console.error('Health check error:', error);
            throw new Error(`Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
} 