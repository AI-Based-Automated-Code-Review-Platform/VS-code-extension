import * as vscode from 'vscode';
import { AuthService } from './authService';
import { ApiService, ReviewRequest, ReviewResponse } from './apiService';
import { API_ENDPOINTS } from '../utils/constants';

// Export ReviewRequest for use in other files
export { ReviewRequest } from './apiService';

export interface ReviewResult {
    id: string;
    status: string;
    result?: any;
    error?: string;
    created_at: string;
    updated_at: string;
}

export interface ReviewSettings {
    llmModel: string;
    standards: string[];
    metrics: string[];
    temperature: number;
    maxTokens: number;
    maxToolCalls: number;
}

export interface ReviewProgress {
    stage: string;
    progress: number;
    message: string;
}

export class ReviewService {
    private authService: AuthService;
    private apiService: ApiService;
    private baseUrl: string;

    constructor(authService: AuthService) {
        this.authService = authService;
        this.apiService = new ApiService(authService);
        this.baseUrl = authService.getBaseUrl();
    }

    async submitReview(request: ReviewRequest): Promise<ReviewResponse> {
        const token = await this.authService.getToken();
        if (!token) {
            throw new Error('Not authenticated. Please login first.');
        }

        try {
            return await this.apiService.submitVSCodeReview(request);
        } catch (error) {
            console.error('Submit review error:', error);
            const message = error instanceof Error ? error.message : 'Unknown error occurred';
            throw new Error(`Failed to submit review: ${message}`);
        }
    }

    async getReviewStatus(reviewId: string): Promise<ReviewResponse> {
        const token = await this.authService.getToken();
        if (!token) {
            throw new Error('Not authenticated. Please login first.');
        }

        try {
            return await this.apiService.getReviewStatus(reviewId);
        } catch (error) {
            console.error('Get review status error:', error);
            const message = error instanceof Error ? error.message : 'Unknown error occurred';
            throw new Error(`Failed to get review status: ${message}`);
        }
    }

    async pollReviewStatus(reviewId: string, onProgress?: (status: ReviewResponse) => void): Promise<ReviewResponse> {
        const maxAttempts = 60; // 5 minutes with 5-second intervals
        let attempts = 0;

        while (attempts < maxAttempts) {
            try {
                const status = await this.getReviewStatus(reviewId);
                
                if (onProgress) {
                    onProgress(status);
                }

                if (status.status === 'completed') {
                    return status;
                } else if (status.status === 'failed') {
                    throw new Error(status.error || 'Review failed');
                }

                // Wait 5 seconds before next check
                await new Promise(resolve => setTimeout(resolve, 5000));
                attempts++;
            } catch (error) {
                console.error('Error checking review status:', error);
                attempts++;
                
                if (attempts >= maxAttempts) {
                    throw error;
                }
                
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        throw new Error('Review polling timeout');
    }

    async getReviewHistory(limit: number = 10): Promise<ReviewResponse[]> {
        const token = await this.authService.getToken();
        if (!token) {
            throw new Error('Not authenticated. Please login first.');
        }

        try {
            return await this.apiService.getReviewHistory(limit);
        } catch (error) {
            console.error('Get review history error:', error);
            const message = error instanceof Error ? error.message : 'Unknown error occurred';
            throw new Error(`Failed to get review history: ${message}`);
        }
    }

    async submitFeedback(reviewId: string, rating: number, feedback?: string): Promise<void> {
        const token = await this.authService.getToken();
        if (!token) {
            throw new Error('Not authenticated. Please login first.');
        }

        try {
            await this.apiService.submitFeedback(reviewId, rating, feedback);
        } catch (error) {
            console.error('Submit feedback error:', error);
            const message = error instanceof Error ? error.message : 'Unknown error occurred';
            throw new Error(`Failed to submit feedback: ${message}`);
        }
    }

    async checkHealth(): Promise<boolean> {
        try {
            await this.apiService.checkHealth();
            return true;
        } catch (error) {
            console.error('Health check error:', error);
            return false;
        }
    }

    getDefaultSettings(): ReviewSettings {
        const config = vscode.workspace.getConfiguration('codeReview');
        
        return {
            llmModel: config.get('defaultLLMModel', 'CEREBRAS::llama-3.3-70b'),
            standards: config.get('defaultStandards', [
                'Follow PEP 8 style guidelines',
                'Use meaningful variable names',
                'Add proper error handling',
                'Write comprehensive docstrings'
            ]),
            metrics: config.get('defaultMetrics', [
                'Code complexity and maintainability',
                'Performance and optimization',
                'Security vulnerabilities'
            ]),
            temperature: 0.3,
            maxTokens: 32768,
            maxToolCalls: 7
        };
    }

    validateSettings(settings: ReviewSettings): string[] {
        const errors: string[] = [];

        if (!settings.llmModel || settings.llmModel.trim() === '') {
            errors.push('LLM model is required');
        }

        if (!settings.standards || settings.standards.length === 0) {
            errors.push('At least one coding standard must be selected');
        }

        if (!settings.metrics || settings.metrics.length === 0) {
            errors.push('At least one metric must be selected');
        }

        if (settings.temperature < 0 || settings.temperature > 2) {
            errors.push('Temperature must be between 0 and 2');
        }

        if (settings.maxTokens < 1 || settings.maxTokens > 100000) {
            errors.push('Max tokens must be between 1 and 100,000');
        }

        if (settings.maxToolCalls < 1 || settings.maxToolCalls > 20) {
            errors.push('Max tool calls must be between 1 and 20');
        }

        return errors;
    }

    async waitForCompletion(reviewId: string, onProgress?: (progress: ReviewProgress) => void): Promise<ReviewResponse> {
        const maxAttempts = 60; // 5 minutes with 5-second intervals
        let attempts = 0;

        while (attempts < maxAttempts) {
            try {
                const status = await this.getReviewStatus(reviewId);
                
                if (onProgress) {
                    onProgress({
                        stage: status.status,
                        progress: this.getProgressFromStatus(status.status),
                        message: this.getMessageFromStatus(status.status)
                    });
                }

                if (status.status === 'completed') {
                    return status;
                } else if (status.status === 'failed') {
                    throw new Error(status.error || 'Review failed');
                }

                // Wait 5 seconds before next check
                await new Promise(resolve => setTimeout(resolve, 5000));
                attempts++;
            } catch (error) {
                console.error('Error checking review status:', error);
                attempts++;
                
                if (attempts >= maxAttempts) {
                    throw error;
                }
                
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        throw new Error('Review completion timeout');
    }

    private getProgressFromStatus(status: string): number {
        switch (status) {
            case 'pending': return 10;
            case 'processing': return 50;
            case 'completed': return 100;
            case 'failed': return 0;
            default: return 25;
        }
    }

    private getMessageFromStatus(status: string): string {
        switch (status) {
            case 'pending': return 'Review queued for processing...';
            case 'processing': return 'AI is analyzing your code...';
            case 'completed': return 'Review completed successfully!';
            case 'failed': return 'Review failed';
            default: return 'Processing...';
        }
    }
} 