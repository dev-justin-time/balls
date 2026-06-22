import js from '@eslint/js';
import globals from 'globals';

export default [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                // Project-specific globals
                WebsimSocket: 'readonly',
                nipplejs: 'readonly',
            },
        },
        rules: {
            // Essential rules
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            'no-console': 'off',
            'no-constant-condition': 'warn',
            'no-empty': ['warn', { allowEmptyCatch: true }],
            'no-extra-semi': 'warn',
            'no-unreachable': 'warn',
            'no-duplicate-imports': 'error',

            // Style consistency (lightweight, no formatter needed)
            'semi': ['warn', 'always'],
            'prefer-const': 'warn',
            'eqeqeq': ['warn', 'smart'],
            'no-throw-literal': 'error',
            'no-self-compare': 'error',
            'no-template-curly-in-string': 'warn',

            // Best practices
            'no-eval': 'error',
            'no-implied-eval': 'error',
            'no-new-func': 'error',
            'no-return-assign': 'error',
            'no-self-assign': 'error',
            'no-unmodified-loop-condition': 'warn',
            'no-useless-call': 'warn',
            'no-useless-concat': 'warn',
            'no-useless-return': 'warn',
            'yoda': 'warn',

            // ES6+ best practices
            'no-var': 'warn',
            'no-useless-computed-key': 'warn',
            'no-useless-rename': 'warn',
            'prefer-arrow-callback': 'off',
            'prefer-template': 'off',
            'rest-spread-spacing': ['warn', 'never'],
            'template-curly-spacing': ['warn', 'never'],
        },
    },
    {
        // Test files: relax some rules
        files: ['tests/**/*.test.js'],
        languageOptions: {
            globals: {
                ...globals.browser,
                describe: 'readonly',
                it: 'readonly',
                expect: 'readonly',
                vi: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
                beforeAll: 'readonly',
                afterAll: 'readonly',
            },
        },
        rules: {
            'no-unused-vars': 'off',
        },
    },
    {
        ignores: [
            'node_modules/**',
            'backups/**',
            '*.bak*',
            'eslint.config.js',
        ],
    },
];
