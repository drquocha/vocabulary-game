/* =============================================================================
   UTILITY FUNCTIONS
   ========================================================================== */

/**
 * Array utilities
 */
export class ArrayUtils {
    /**
     * Shuffle array using Fisher-Yates algorithm
     * @param {Array} array - Array to shuffle
     * @returns {Array} - Shuffled copy of array
     */
    static shuffle(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    /**
     * Get random sample from array
     * @param {Array} array - Source array
     * @param {number} count - Number of items to sample
     * @returns {Array} - Random sample
     */
    static sample(array, count) {
        const shuffled = this.shuffle(array);
        return shuffled.slice(0, Math.min(count, array.length));
    }
}

/**
 * DOM utilities
 */
export class DOMUtils {
    /**
     * Create element with attributes
     * @param {string} tag - Element tag name
     * @param {Object} attributes - Element attributes
     * @param {string} content - Element content
     * @returns {HTMLElement} - Created element
     */
    static createElement(tag, attributes = {}, content = '') {
        const element = document.createElement(tag);

        Object.entries(attributes).forEach(([key, value]) => {
            if (key === 'className') {
                element.className = value;
            } else if (key === 'dataset') {
                Object.entries(value).forEach(([dataKey, dataValue]) => {
                    element.dataset[dataKey] = dataValue;
                });
            } else if (key.startsWith('on')) {
                element.addEventListener(key.slice(2).toLowerCase(), value);
            } else {
                element.setAttribute(key, value);
            }
        });

        if (content) {
            element.textContent = content;
        }

        return element;
    }

    /**
     * Add event listener with options
     * @param {HTMLElement} element - Target element
     * @param {string} event - Event type
     * @param {Function} handler - Event handler
     * @param {Object} options - Event options
     */
    static addEvent(element, event, handler, options = {}) {
        element.addEventListener(event, handler, options);
    }

    /**
     * Remove all child nodes
     * @param {HTMLElement} element - Parent element
     */
    static clearChildren(element) {
        while (element.firstChild) {
            element.removeChild(element.firstChild);
        }
    }

    /**
     * Toggle class on element
     * @param {HTMLElement} element - Target element
     * @param {string} className - Class name
     * @param {boolean} force - Force add/remove
     */
    static toggleClass(element, className, force) {
        if (force !== undefined) {
            element.classList.toggle(className, force);
        } else {
            element.classList.toggle(className);
        }
    }
}

/**
 * Time utilities
 */
export class TimeUtils {
    /**
     * Create delay promise
     * @param {number} ms - Delay in milliseconds
     * @returns {Promise} - Promise that resolves after delay
     */
    static delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Format time duration
     * @param {number} seconds - Duration in seconds
     * @returns {string} - Formatted duration
     */
    static formatDuration(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);

        if (minutes > 0) {
            return `${minutes}m ${remainingSeconds}s`;
        }
        return `${remainingSeconds}s`;
    }

    /**
     * Get current timestamp
     * @returns {number} - Current timestamp in milliseconds
     */
    static now() {
        return Date.now();
    }
}

/**
 * Data validation utilities
 */
export class ValidationUtils {
    /**
     * Validate CSV data structure
     * @param {Array} data - CSV data array
     * @returns {boolean} - True if valid
     */
    static isValidVocabularyData(data) {
        if (!Array.isArray(data) || data.length === 0) {
            return false;
        }

        return data.every(item =>
            item &&
            typeof item === 'object' &&
            typeof item.concept === 'string' &&
            typeof item.definition === 'string' &&
            item.concept.trim().length > 0 &&
            item.definition.trim().length > 0
        );
    }

    /**
     * Validate email format
     * @param {string} email - Email address
     * @returns {boolean} - True if valid email
     */
    static isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Check if file is CSV
     * @param {File} file - File object
     * @returns {boolean} - True if CSV file
     */
    static isCSVFile(file) {
        return file && file.name.toLowerCase().endsWith('.csv');
    }
}

/**
 * Local storage utilities
 */
export class StorageUtils {
    /**
     * Save data to localStorage
     * @param {string} key - Storage key
     * @param {any} data - Data to store
     */
    static save(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (error) {
            console.warn('Failed to save to localStorage:', error);
        }
    }

    /**
     * Load data from localStorage
     * @param {string} key - Storage key
     * @param {any} defaultValue - Default value if not found
     * @returns {any} - Loaded data or default value
     */
    static load(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.warn('Failed to load from localStorage:', error);
            return defaultValue;
        }
    }

    /**
     * Remove item from localStorage
     * @param {string} key - Storage key
     */
    static remove(key) {
        try {
            localStorage.removeItem(key);
        } catch (error) {
            console.warn('Failed to remove from localStorage:', error);
        }
    }

    /**
     * Clear all localStorage
     */
    static clear() {
        try {
            localStorage.clear();
        } catch (error) {
            console.warn('Failed to clear localStorage:', error);
        }
    }
}

/**
 * Math utilities
 */
export class MathUtils {
    /**
     * Calculate percentage
     * @param {number} part - Part value
     * @param {number} total - Total value
     * @returns {number} - Percentage (0-100)
     */
    static percentage(part, total) {
        return total > 0 ? Math.round((part / total) * 100) : 0;
    }

    /**
     * Clamp value between min and max
     * @param {number} value - Value to clamp
     * @param {number} min - Minimum value
     * @param {number} max - Maximum value
     * @returns {number} - Clamped value
     */
    static clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    /**
     * Generate random integer between min and max (inclusive)
     * @param {number} min - Minimum value
     * @param {number} max - Maximum value
     * @returns {number} - Random integer
     */
    static randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
}