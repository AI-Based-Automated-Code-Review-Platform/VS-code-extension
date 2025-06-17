export const DEFAULT_IGNORE_PATTERNS = [
    // Version control
    '.git/**',
    '.svn/**',
    '.hg/**',
    
    // Dependencies
    'node_modules/**',
    'vendor/**',
    'bower_components/**',
    
    // Build outputs
    'dist/**',
    'build/**',
    'out/**',
    'target/**',
    'bin/**',
    'obj/**',
    
    // Cache directories
    '.cache/**',
    '.tmp/**',
    'tmp/**',
    'temp/**',
    
    // IDE files
    '.vscode/**',
    '.idea/**',
    '*.swp',
    '*.swo',
    '*~',
    
    // OS files
    '.DS_Store',
    'Thumbs.db',
    'desktop.ini',
    
    // Logs
    '*.log',
    'logs/**',
    
    // Package files
    '*.zip',
    '*.tar.gz',
    '*.rar',
    '*.7z',
    
    // Binary files
    '*.exe',
    '*.dll',
    '*.so',
    '*.dylib',
    
    // Media files
    '*.jpg',
    '*.jpeg',
    '*.png',
    '*.gif',
    '*.svg',
    '*.ico',
    '*.mp3',
    '*.mp4',
    '*.avi',
    '*.mov',
    
    // Documentation (optional - might want to review these)
    // '*.md',
    // '*.txt',
    
    // Configuration files that are usually auto-generated
    'package-lock.json',
    'yarn.lock',
    'composer.lock',
    'Pipfile.lock',
    
    // Test coverage
    'coverage/**',
    '.nyc_output/**',
    
    // Python
    '__pycache__/**',
    '*.pyc',
    '*.pyo',
    '*.pyd',
    '.Python',
    'env/**',
    'venv/**',
    '.env',
    '.venv',
    
    // Java
    '*.class',
    '*.jar',
    '*.war',
    '*.ear',
    
    // .NET
    '*.dll',
    '*.exe',
    '*.pdb',
    
    // Ruby
    '.bundle/**',
    
    // Go
    '*.exe',
    '*.test',
    
    // Rust
    'target/**',
    'Cargo.lock',
    
    // Database
    '*.db',
    '*.sqlite',
    '*.sqlite3',
];

export const DEFAULT_STANDARDS = [
    "Use snake_case for variable names",
    "Use camelCase for function names", 
    "Use PascalCase for class names",
    "Use uppercase for constants"
];

export const DEFAULT_METRICS = [
    "Code complexity",
    "Code duplication", 
    "Code coverage"
];

export const DEFAULT_LLM_MODELS = [
    "CEREBRAS::llama-3.3-70b",
    "CEREBRAS::llama-4-scout-17b-16e-instruct",
    "HYPERBOLIC::meta-llama/Llama-3.3-70B-Instruct"
];

export const API_ENDPOINTS = {
    AUTH_GITHUB_LOGIN: '/api/v1/auth/github/login',
    AUTH_GITHUB_CALLBACK: '/api/v1/auth/github/callback',
    USER_CURRENT: '/api/v1/users/me',
    REVIEW_VSCODE: '/api/v1/reviews/vscode-review',
    REVIEW_STATUS: '/api/v1/reviews',
    REVIEW_HISTORY: '/api/v1/reviews/history',
    REVIEW_FEEDBACK: '/api/v1/reviews/{id}/feedback',
} as const;

export const WS_ENDPOINTS = {
    USER_NOTIFICATIONS: '/ws/user/{user_id}/',
    REVIEW_UPDATES: '/ws/reviews/{review_id}/',
} as const;

export const CONFIG_DEFAULTS = {
    BACKEND_URL: 'http://localhost:8000',
    WEBSOCKET_URL: 'ws://localhost:8000',
    MAX_FILE_SIZE: 1024 * 1024, // 1MB
    MAX_TOTAL_SIZE: 10 * 1024 * 1024, // 10MB
    MAX_FILES: 100,
    DEFAULT_LLM_MODEL: 'gpt-4',
    DEFAULT_TEMPERATURE: 0.3,
    DEFAULT_MAX_TOKENS: 32768,
    DEFAULT_MAX_TOOL_CALLS: 7,
} as const;

export const SUPPORTED_EXTENSIONS = [
    '.js', '.jsx', '.ts', '.tsx',
    '.py', '.pyx', '.pyi',
    '.java', '.kt', '.scala',
    '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp',
    '.cs', '.vb',
    '.php', '.rb', '.go', '.rs',
    '.swift', '.m', '.mm',
    '.html', '.htm', '.xml', '.xhtml',
    '.css', '.scss', '.sass', '.less',
    '.json', '.yaml', '.yml', '.toml',
    '.sql', '.sh', '.bash', '.zsh',
    '.dockerfile', '.makefile',
    '.md', '.txt', '.rst',
] as const;

export const BINARY_EXTENSIONS = [
    '.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico',
    '.mp3', '.mp4', '.avi', '.mov', '.wmv',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.zip', '.tar', '.gz', '.rar', '.7z',
    '.exe', '.dll', '.so', '.dylib',
    '.class', '.jar', '.war', '.ear',
    '.db', '.sqlite', '.sqlite3',
] as const;

export const LLM_MODELS = [
    { id: 'HYPERBOLIC::meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B Instruct (Hyperbolic)', provider: 'Hyperbolic' },
    { id: 'CEREBRAS::llama-3.3-70b', name: 'Llama 3.3 70B', provider: 'Cerebras' },
    { id: 'CEREBRAS::llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout 17B', provider: 'Cerebras' },
] as const;

export const CODING_STANDARDS = [
    'Use snake_case for variable names',
    'Use camelCase for function names',
    'Use PascalCase for class names',
    'Use uppercase for constants',
    'Use descriptive variable names',
    'Add docstrings to functions',
    'Follow PEP 8 guidelines (Python)',
    'Follow ESLint rules (JavaScript/TypeScript)',
    'Use consistent indentation',
    'Limit line length to 80-120 characters',
    'Remove unused imports and variables',
    'Use meaningful commit messages',
    'Add error handling',
    'Write unit tests',
    'Use type annotations',
] as const;

export const CODE_METRICS = [
    'Code complexity',
    'Code duplication',
    'Code coverage',
    'Technical debt',
    'Maintainability index',
    'Cyclomatic complexity',
    'Lines of code',
    'Function length',
    'Class size',
    'Coupling',
    'Cohesion',
    'Documentation coverage',
] as const; 