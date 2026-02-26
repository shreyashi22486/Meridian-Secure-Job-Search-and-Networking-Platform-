import js from "@eslint/js";
import globals from "globals";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";

export default [
    // Ignore build output
    { ignores: ["dist/", "node_modules/"] },

    // Base JS recommended rules
    js.configs.recommended,

    // React + JSX config
    {
        files: ["src/**/*.{js,jsx}"],
        plugins: {
            react: reactPlugin,
            "react-hooks": reactHooksPlugin,
        },
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: {
                ...globals.browser,
                ...globals.es2021,
            },
            parserOptions: {
                ecmaFeatures: { jsx: true },
            },
        },
        settings: {
            react: { version: "detect" },
        },
        rules: {
            // React
            "react/react-in-jsx-scope": "off", // Not needed with React 18 JSX transform
            "react/prop-types": "off",         // No TypeScript = no practical prop-types
            "react/jsx-no-target-blank": "error",
            "react/jsx-uses-react": "error",
            "react/jsx-uses-vars": "error",

            // Hooks
            "react-hooks/rules-of-hooks": "error",
            "react-hooks/exhaustive-deps": "warn",

            // General
            "no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
            "no-console": "warn",
            "no-empty": ["error", { allowEmptyCatch: true }],
        },
    },
];
