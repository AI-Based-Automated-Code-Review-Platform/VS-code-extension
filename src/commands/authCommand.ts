import * as vscode from 'vscode';
import { AuthService } from '../services/authService';

export class AuthCommand {
    constructor(private authService: AuthService) {}

    async authenticate(): Promise<void> {
        try {
            const isAuthenticated = await this.authService.isAuthenticated();
            
            if (isAuthenticated) {
                const user = await this.authService.getCurrentUser();
                const action = await vscode.window.showInformationMessage(
                    `Already authenticated as ${user?.username}`,
                    'Logout',
                    'Cancel'
                );
                
                if (action === 'Logout') {
                    await this.authService.logout();
                }
                return;
            }

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Authenticating with GitHub...",
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: "Opening browser..." });
                await this.authService.authenticate();
                progress.report({ increment: 100, message: "Authentication complete!" });
            });

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Authentication failed: ${errorMessage}`);
        }
    }
} 