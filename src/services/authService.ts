import * as vscode from 'vscode';
import * as http from 'http';
import * as url from 'url';

export interface AuthTokens {
    access_token: string;
    refresh_token?: string;
    expires_at?: number;
    user_info?: {
        id: number;
        login: string;
        name: string;
        email: string;
        avatar_url: string;
    };
}

export class AuthService {
    private static readonly STORAGE_KEY = 'backend_auth_tokens';
    private static readonly CALLBACK_PORT = 3000;

    private context: vscode.ExtensionContext;
    private authChangeListeners: (() => void)[] = [];

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    onAuthStateChanged(callback: () => void): void {
        this.authChangeListeners.push(callback);
    }

    private notifyAuthStateChanged(): void {
        this.authChangeListeners.forEach(callback => callback());
    }

    async authenticate(): Promise<boolean> {
        try {
            const backendUrl = this.getBaseUrl();
            const callbackUrl = `http://localhost:${AuthService.CALLBACK_PORT}/callback`;
            
            // Initiate authentication with our Django backend
            const authUrl = `${backendUrl}/api/v1/auth/github/vscode-login/?vscode_callback=${encodeURIComponent(callbackUrl)}`;
            
            await vscode.env.openExternal(vscode.Uri.parse(authUrl));
            const authResult = await this.startCallbackServer();
            
            if (authResult.success && authResult.token) {
                const tokens: AuthTokens = {
                    access_token: authResult.token
                };
                
                await this.storeTokens(tokens);
                this.notifyAuthStateChanged();
                vscode.window.showInformationMessage('Successfully authenticated with backend!');
                return true;
            }
            
            if (authResult.error) {
                vscode.window.showErrorMessage(`Authentication failed: ${authResult.error}`);
            } else {
                vscode.window.showErrorMessage('Authentication failed. Please try again.');
            }
            return false;
        } catch (error) {
            console.error('Authentication error:', error);
            vscode.window.showErrorMessage(`Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return false;
        }
    }

    private async startCallbackServer(): Promise<{success: boolean, token?: string, error?: string}> {
        return new Promise((resolve) => {
            const server = http.createServer((req, res) => {
                if (req.url) {
                    const parsedUrl = url.parse(req.url, true);
                    
                    if (parsedUrl.pathname === '/callback') {
                        const token = parsedUrl.query.token as string;
                        const error = parsedUrl.query.error as string;
                        
                        if (error) {
                            res.writeHead(400, { 'Content-Type': 'text/html' });
                            res.end('<h1>Authentication Error</h1><p>You can close this window.</p>');
                            server.close();
                            resolve({success: false, error: decodeURIComponent(error)});
                        } else if (token) {
                            res.writeHead(200, { 'Content-Type': 'text/html' });
                            res.end('<h1>Authentication Successful!</h1><p>You can close this window and return to VS Code.</p>');
                            server.close();
                            resolve({success: true, token});
                        } else {
                            res.writeHead(400, { 'Content-Type': 'text/html' });
                            res.end('<h1>Authentication Error</h1><p>No token received. You can close this window.</p>');
                            server.close();
                            resolve({success: false, error: 'No token received'});
                        }
                    }
                }
            });
            
            server.listen(AuthService.CALLBACK_PORT, () => {
                console.log(`Callback server listening on port ${AuthService.CALLBACK_PORT}`);
            });
            
            // Timeout after 5 minutes
            setTimeout(() => {
                server.close();
                resolve({success: false, error: 'Authentication timeout'});
            }, 300000);
        });
    }

    async getToken(): Promise<string | null> {
        const tokens = await this.getStoredTokens();
        return tokens?.access_token || null;
    }

    async getCurrentUser(): Promise<any> {
        const token = await this.getToken();
        if (!token) {
            return null;
        }

        try {
            const https = require('https');
            const http = require('http');
            const backendUrl = this.getBaseUrl();
            const parsedUrl = url.parse(backendUrl);
            const isHttps = parsedUrl.protocol === 'https:';
            const client = isHttps ? https : http;
            
            return new Promise((resolve, reject) => {
                const options = {
                    hostname: parsedUrl.hostname,
                    port: parsedUrl.port || (isHttps ? 443 : 80),
                    path: '/api/v1/user/',
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'User-Agent': 'VS-Code-Extension'
                    }
                };

                const req = client.request(options, (res: any) => {
                    let data = '';
                    res.on('data', (chunk: any) => data += chunk);
                    res.on('end', () => {
                        try {
                            if (res.statusCode >= 200 && res.statusCode < 300) {
                                const user = JSON.parse(data);
                                resolve(user);
                            } else {
                                reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                            }
                        } catch (error) {
                            reject(error);
                        }
                    });
                });

                req.on('error', reject);
                req.end();
            });
        } catch (error) {
            console.error('Get user error:', error);
            return null;
        }
    }

    async isAuthenticated(): Promise<boolean> {
        const tokens = await this.getStoredTokens();
        if (!tokens?.access_token) {
            return false;
        }

        if (tokens.expires_at && Date.now() > tokens.expires_at) {
            await this.clearTokens();
            return false;
        }

        try {
            const user = await this.getCurrentUser();
            return !!user;
        } catch (error) {
            console.error('Token verification error:', error);
            await this.clearTokens();
            return false;
        }
    }

    async logout(): Promise<void> {
        await this.clearTokens();
        this.notifyAuthStateChanged();
        vscode.window.showInformationMessage('Successfully logged out.');
    }

    private async storeTokens(tokens: AuthTokens): Promise<void> {
        await this.context.secrets.store(AuthService.STORAGE_KEY, JSON.stringify(tokens));
    }

    private async getStoredTokens(): Promise<AuthTokens | null> {
        try {
            const stored = await this.context.secrets.get(AuthService.STORAGE_KEY);
            return stored ? JSON.parse(stored) : null;
        } catch (error) {
            console.error('Error retrieving stored tokens:', error);
            return null;
        }
    }

    private async clearTokens(): Promise<void> {
        await this.context.secrets.delete(AuthService.STORAGE_KEY);
    }

    getBaseUrl(): string {
        return vscode.workspace.getConfiguration('codeReview').get('backendUrl', 'http://localhost:8000');
    }
} 