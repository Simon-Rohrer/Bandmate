/**
 * Logger Utility
 * Standardizes logging for performance, user actions, and errors.
 * Improves console readability and allows for potential future log aggregation.
 */

const Logger = {
    // Config
    debugMode: true, // Set to false in production to suppress debug logs

    /**
     * Log a user interaction or clear action.
     * @param {string} action - The action name (e.g., 'Click', 'Submit', 'Navigate')
     * @param {string} target - The UI element or context (e.g., '#saveBtn', 'SettingsView')
     * @param {any} [details] - Optional extra data
     */
    action: function (action, target, details = null) {
        if (!this.debugMode) return;
        const style = 'color: #3b82f6; font-weight: bold;'; // Blue
        const msg = `%c[ACTION] ${action} -> ${target}`;
        if (details) {
            console.log(msg, style, details);
        } else {
            console.log(msg, style);
        }
    },

    /**
     * Log user interactions with UI elements (buttons, forms, etc.)
     * @param {string} elementType - Type of element (e.g., 'Button', 'Form', 'Link')
     * @param {string} elementId - ID or identifier of the element
     * @param {string} actionType - Type of action (e.g., 'Click', 'Submit', 'Change')
     * @param {any} [data] - Optional additional data
     */
    userAction: function (elementType, elementId, actionType, data = null) {
        if (!this.debugMode) return;
        const style = 'color: #ec4899; font-weight: bold; background: #fce7f3; padding: 2px 6px; border-radius: 3px;'; // Pink
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        const msg = `%c[USER] ${timestamp} | ${actionType} ${elementType}: ${elementId}`;
        if (data) {
            console.log(msg, style, data);
        } else {
            console.log(msg, style);
        }
    },

    /**
     * Start a performance timer.
     * @param {string} label - Unique label for the timer
     */
    timers: {},

    /**
     * Start a performance timer.
     * @param {string} label - Unique label for the timer
     */
    time: function (label) {
        if (!this.debugMode) return;
        this.timers[label] = performance.now();
    },

    /**
     * End a performance timer and log the duration in seconds.
     * @param {string} label - The label used in time()
     */
    timeEnd: function (label) {
        if (!this.debugMode) return;
        const startTime = this.timers[label];
        if (startTime) {
            const durationMs = performance.now() - startTime;
            const durationSec = (durationMs / 1000).toFixed(3);
            const style = 'color: #8b5cf6; font-weight: bold;';
            console.log(`%c[PERF] ${label}: ${durationSec}s`, style);
            delete this.timers[label];
        } else {
            console.warn(`[PERF] Timer '${label}' does not exist or was ended already.`);
        }
    },

    /**
     * Log structured informational messages (state changes, system events).
     * @param {string} message - The info message
     * @param {any} [data] - Optional data
     */
    info: function (message, data = null) {
        if (!this.debugMode) return;
        const style = 'color: #10b981; font-weight: bold;'; // Green
        if (data) {
            console.log(`%c[INFO] ${message}`, style, data);
        } else {
            console.log(`%c[INFO] ${message}`, style);
        }
    },

    /**
     * Log warnings.
     * @param {string} message 
     * @param {any} [data] 
     */
    warn: function (message, data = null) {
        if (!this.debugMode) return;
        const style = 'color: #f59e0b; font-weight: bold;'; // Orange
        if (data) {
            console.warn(`%c[WARN] ${message}`, style, data);
        } else {
            console.warn(`%c[WARN] ${message}`, style);
        }
    },

    /**
     * Log errors with standardized formatting.
     * @param {string} message - Context for the error
     * @param {Error|any} error - The error object
     */
    error: function (message, error) {
        const style = 'color: #ef4444; font-weight: bold;'; // Red
        console.error(`%c[ERROR] ${message}`, style, error);
    }
};

// Expose globally
window.Logger = Logger;
