/* =============================================================================
   GAME CONSTANTS & CONFIGURATION
   ========================================================================== */

/**
 * Game configuration constants
 */
export const GAME_CONFIG = {
    // Font size configuration
    FONT_SIZES: [10, 14, 18, 22, 26, 30, 34, 38, 40],
    DEFAULT_FONT_SIZE: 14,

    // Grid size configuration
    GRID_SIZES: {
        '2x2': 4,
        '3x3': 9,
        '3x4': 12,
        '4x3': 12,
        '4x4': 16,
        '5x3': 15,
        'custom': 9 // Default for auto-fit
    },

    // Game mechanics
    MAX_ATTEMPTS: 3,
    DEFAULT_MAX_PAIRS: 15,
    SELECTION_DELAY: 300,
    FEEDBACK_DURATION: 1500,
    ERROR_FEEDBACK_DURATION: 1000,
    HINT_HIGHLIGHT_DURATION: 2000,
    CORRECT_PAIRS_HIGHLIGHT_DURATION: 3000,

    // Scoring system
    POINTS_PER_MATCH: 4,

    // API endpoints
    API_BASE_URL: 'http://localhost:8000',
    ENDPOINTS: {
        START_SESSION: '/start_session',
        RECORD_RESPONSE: '/record_response',
        END_SESSION: '/end_session',
        GET_ANALYTICS: '/analytics',
        GET_WORD_STATES: '/word_states'
    }
};

/**
 * UI element selectors
 */
export const SELECTORS = {
    CONCEPTS_LIST: '#concepts-list',
    DEFINITIONS_LIST: '#definitions-list',
    SCORE: '#score',
    PROGRESS: '#progress',
    FEEDBACK: '#feedback',
    FEEDBACK_TEXT: '#feedback-text',
    NEW_GAME_BTN: '#new-game-btn',
    HINT_BTN: '#hint-btn',
    RESET_BTN: '#reset-btn',
    CSV_UPLOAD: '#csv-upload',
    DATASET_SELECT: '#dataset-select',
    LOAD_DATASET_BTN: '#load-dataset-btn',
    FONT_SIZE_INCREASE_BTN: '#font-size-increase-btn',
    FONT_SIZE_DECREASE_BTN: '#font-size-decrease-btn',
    FONT_SIZE_DISPLAY: '#font-size-display',
    HEATMAP_BTN: '#heatmap-btn',
    GRID_SIZE_SELECT: '#grid-size-select'
};

/**
 * CSS classes
 */
export const CSS_CLASSES = {
    ITEM: 'item',
    SELECTED: 'selected',
    MATCHED: 'matched',
    INCORRECT: 'incorrect',
    FROZEN: 'frozen',
    DISAPPEARING: 'disappearing',
    HIDDEN: 'hidden',
    SUCCESS: 'success',
    ERROR: 'error',
    INFO: 'info'
};

/**
 * Default sample data
 */
export const DEFAULT_VOCABULARY = [
    { concept: 'Photosynthesis', definition: 'The process by which plants convert sunlight into energy' },
    { concept: 'Democracy', definition: 'A system of government where citizens vote for their representatives' },
    { concept: 'Ecosystem', definition: 'A community of living organisms and their physical environment' },
    { concept: 'Renaissance', definition: 'A period of cultural rebirth in Europe from 14th to 17th century' },
    { concept: 'Algorithm', definition: 'A step-by-step procedure for solving a problem or completing a task' },
    { concept: 'Mitosis', definition: 'The process of cell division that produces two identical daughter cells' },
    { concept: 'Capitalism', definition: 'An economic system based on private ownership and free market competition' },
    { concept: 'Gravity', definition: 'The force that attracts objects toward the center of the Earth' },
    { concept: 'Metaphor', definition: 'A figure of speech that compares two unlike things without using like or as' },
    { concept: 'Inflation', definition: 'A general increase in prices and fall in purchasing value of money' },
    { concept: 'Biodiversity', definition: 'The variety of life forms within ecosystems including species diversity' },
    { concept: 'Quantum', definition: 'The smallest discrete unit of any physical property involved in an interaction' },
    { concept: 'Empathy', definition: 'The ability to understand and share the feelings of others' },
    { concept: 'Entropy', definition: 'A measure of randomness or disorder within a thermodynamic system' },
    { concept: 'Catalyst', definition: 'A substance that speeds up a chemical reaction without being consumed' }
];

/**
 * Audio frequencies for sound generation
 */
export const AUDIO_CONFIG = {
    CORRECT_FREQUENCIES: [523.25, 659.25, 783.99], // C5, E5, G5 major chord
    SAMPLE_RATE: 44100,
    DURATION: 0.3,
    VOLUME: 0.1
};