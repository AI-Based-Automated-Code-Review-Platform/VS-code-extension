# Code Review VS Code Extension

A powerful VS Code extension that provides AI-powered code reviews using advanced language models. This extension integrates with a Django backend and LangGraph service to deliver comprehensive code analysis and recommendations.

## Features

- 🤖 **AI-Powered Reviews**: Advanced code analysis using Cerebras and Hyperbolic language models
- 🔍 **Custom Standards**: Define your own coding standards and best practices
- 📊 **Custom Metrics**: Specify evaluation criteria tailored to your project needs
- 🔄 **Real-time Updates**: WebSocket integration for live review progress
- 📁 **Workspace Integration**: Review entire workspaces or selected files
- 🔐 **Secure Authentication**: GitHub OAuth integration through backend
- 📈 **Review History**: Track and manage your review history

## Supported Language Models

- **CEREBRAS::llama-3.3-70b** - Fast inference, good quality
- **HYPERBOLIC::meta-llama/Llama-3.3-70B-Instruct** - High quality, instruction-tuned

## Installation & Setup

### Prerequisites

1. **Django Backend**: Ensure the Django backend is running
2. **LangGraph Service**: LangGraph service must be available
3. **VS Code**: Version 1.60.0 or higher
4. **Node.js**: Version 14.0.0 or higher
5. **npm**: Latest version
   ```

### Extension Installation

#### Method 1: Install from VSIX

1. **Download the VSIX file** from releases
2. **Install in VS Code**:
   ```bash
   code --install-extension ai-code-review-1.0.0.vsix
   ```

#### Method 2: Build from Source

1. **Install dependencies**:
   ```bash
   cd vscode-extension
   npm install
   ```

2. **Compile TypeScript**:
   ```bash
   npm run compile
   ```

3. **Package the extension**:
   ```bash
   npm install -g vsce
   vsce package
   ```

4. **Install the generated VSIX**:
   ```bash
   code --install-extension code-review-extension-0.0.1.vsix
   ```

#### Method 3: Development Mode

1. **Install dependencies**:
   ```bash
   cd vscode-extension
   npm install
   ```

2. **Open in VS Code**:
   ```bash
   code .
   ```

3. **Press F5** to launch Extension Development Host

## Configuration

### Backend URL Configuration

Configure the backend URL in VS Code settings:

1. Open VS Code Settings (`Ctrl+,`)
2. Search for "Code Review"
3. Set `codeReview.backendUrl` to your Django backend URL (default: `http://localhost:8000`)

### Authentication Setup

1. **GitHub OAuth App**: Ensure your Django backend has proper OAuth credentials
2. **Environment Variables**:
   ```bash
   export GITHUB_CLIENT_ID="your_client_id"
   export GITHUB_CLIENT_SECRET="your_client_secret"
   export GITHUB_CALLBACK_URL="http://localhost:8000/api/v1/auth/github/callback/"
   ```

## Usage

### Authentication

1. **Open Command Palette** (`Ctrl+Shift+P`)
2. **Run**: `Code Review: Authenticate`
3. **Follow OAuth flow** in your browser
4. **Return to VS Code** - you should see authentication success

### Review Workspace

1. **Open a workspace/folder** in VS Code
2. **Command Palette** → `Code Review: Review Workspace`
3. **Configure settings**:
   - Select LLM model
   - Define coding standards
   - Set evaluation metrics
   - Adjust temperature (0.0-1.0)

### Review Selected Files

1. **Select files** in Explorer
2. **Right-click** → `Review Selected Files`
3. **Configure settings** as above

### Custom Standards Examples

When configuring standards, you can specify any text-based requirements:

```
Follow PEP 8 style guidelines
Use meaningful variable names
Add comprehensive docstrings
Implement proper error handling
Follow SOLID principles
Ensure thread safety for concurrent code
Use dependency injection where appropriate
Follow company naming conventions
Avoid code duplication (DRY principle)
Write self-documenting code
```

### Custom Metrics Examples

Define evaluation criteria that matter to your project:

```
Code complexity and maintainability
Performance and optimization opportunities
Security vulnerabilities and best practices
Test coverage and quality
Documentation completeness and clarity
Error handling robustness
Code reusability and modularity
Memory usage efficiency
API design consistency
Scalability considerations
```

## WebSocket Integration

The extension supports real-time updates through WebSocket connections:

### WebSocket Endpoints

- **User notifications**: `ws://localhost:8000/ws/user/{user_github_id}/`
- **Review updates**: `ws://localhost:8000/ws/review/{review_id}/`

### Connection Management

The extension automatically:
- Connects to WebSocket when authenticated
- Receives real-time review progress updates
- Handles connection failures gracefully
- Reconnects automatically

## Commands

| Command | Description |
|---------|-------------|
| `Code Review: Authenticate` | Authenticate with GitHub through backend |
| `Code Review: Logout` | Logout and clear authentication |
| `Code Review: Review Workspace` | Review all files in current workspace |
| `Code Review: Review Selected Files` | Review only selected files |
| `Code Review: Show Settings` | Configure extension settings |
| `Code Review: Show Results` | View latest review results |
| `Code Review: Check Status` | Check authentication and connection status |

## Troubleshooting

### Common Issues

1. **Authentication Failed**
   - Ensure Django backend is running
   - Check GitHub OAuth configuration
   - Verify callback URLs are correct

2. **WebSocket Connection Issues**
   - Ensure Django Channels is properly configured
   - Check if Redis/message broker is running
   - Verify ASGI server is running

3. **Review Processing Errors**
   - Check LangGraph service is running
   - Verify LLM model availability
   - Check backend logs for errors

4. **Extension Not Loading**
   - Reload VS Code window
   - Check extension is enabled
   - View Developer Console for errors

### Debug Mode

Enable debug logging:

1. **VS Code Settings** → `Code Review: Debug Mode`
2. **View Output** → `Code Review Extension`
3. **Check Developer Console** (`Help` → `Toggle Developer Tools`)

### Log Locations

- **Extension logs**: VS Code Output Panel
- **Backend logs**: Django console output
- **LangGraph logs**: LangGraph service logs

## Development

### Building and Testing

```bash
# Install dependencies
cd vscode-extension
npm install

# Compile TypeScript
npm run compile

# Watch mode for development
npm run watch

# Run tests
npm test

# Package extension
vsce package

# Publish extension (if you have marketplace access)
vsce publish
```

### Development Workflow

1. **Make changes** to TypeScript files
2. **Compile**: `npm run compile`
3. **Test** in Extension Development Host (F5)
4. **Package**: `vsce package`
5. **Install**: `code --install-extension *.vsix`

## API Endpoints

### Authentication
- `GET /api/v1/auth/github/vscode-login/` - Initiate OAuth
- `GET /api/v1/auth/github/callback/` - OAuth callback
- `GET /api/v1/auth/user/` - Get current user

### Reviews
- `POST /api/v1/reviews/vscode-review/` - Submit review
- `GET /api/v1/reviews/{id}/` - Get review status
- `GET /api/v1/reviews/` - Get review history

### Health
- `GET /api/v1/health/` - Health check

## Contributing

1. Fork the repository
2. Create feature branch
3. Make changes
4. Test thoroughly
5. Submit pull request

## License

This project is licensed under the MIT License.

## Support

For issues and support:
1. Check troubleshooting section
2. Review backend logs
3. Open GitHub issue with details
4. Include extension and backend logs 