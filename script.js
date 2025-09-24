class VocabularyGame {
    constructor() {
        this.gameData = [];
        this.currentRound = [];
        this.selectedConcept = null;
        this.selectedDefinition = null;
        this.matches = new Set();
        this.score = 0;
        this.totalQuestions = 0;
        this.currentQuestion = 0;
        this.attempts = 0;
        this.maxAttempts = 3;
        this.frozenItems = new Set();

        this.initializeSounds();
        this.initializeElements();
        this.bindEvents();
        this.loadDefaultData();
    }

    initializeSounds() {
        // Create sound effects using Web Audio API
        this.audioContext = null;
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.log('Web Audio API not supported');
        }
    }

    playCorrectSound() {
        if (!this.audioContext) return;

        // Resume audio context if needed (browser policy requirement)
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.frequency.setValueAtTime(523.25, this.audioContext.currentTime); // C5
        oscillator.frequency.setValueAtTime(659.25, this.audioContext.currentTime + 0.1); // E5
        oscillator.frequency.setValueAtTime(783.99, this.audioContext.currentTime + 0.2); // G5

        gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.4);

        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + 0.4);
    }

    triggerHapticFeedback() {
        // Haptic vibration for incorrect matches
        if ('vibrate' in navigator) {
            navigator.vibrate([100, 50, 100]); // Short double vibration
        }
    }

    initializeElements() {
        this.conceptsList = document.getElementById('concepts-list');
        this.definitionsList = document.getElementById('definitions-list');
        this.scoreElement = document.getElementById('score');
        this.progressElement = document.getElementById('progress');
        this.feedbackElement = document.getElementById('feedback');
        this.feedbackText = document.getElementById('feedback-text');
        this.newGameBtn = document.getElementById('new-game-btn');
        this.hintBtn = document.getElementById('hint-btn');
        this.resetBtn = document.getElementById('reset-btn');
        this.csvUpload = document.getElementById('csv-upload');
        this.datasetSelect = document.getElementById('dataset-select');
        this.loadDatasetBtn = document.getElementById('load-dataset-btn');
    }

    bindEvents() {
        this.newGameBtn.addEventListener('click', () => this.startNewGame());
        this.hintBtn.addEventListener('click', () => this.showHint());
        this.resetBtn.addEventListener('click', () => this.resetRound());
        this.csvUpload.addEventListener('change', (e) => this.handleFileUpload(e));
        this.datasetSelect.addEventListener('change', () => this.onDatasetSelect());
        this.loadDatasetBtn.addEventListener('click', () => this.loadSelectedDataset());
    }

    loadDefaultData() {
        this.gameData = [
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
        this.loadAvailableDatasets();
        this.startNewGame();
    }

    async loadAvailableDatasets() {
        try {
            const datasets = ['sample_vocabulary.csv', 'words.csv', 'pali.csv'];

            datasets.forEach(dataset => {
                const option = document.createElement('option');
                option.value = dataset;
                option.textContent = dataset.replace('.csv', '').replace(/_/g, ' ');
                this.datasetSelect.appendChild(option);
            });
        } catch (error) {
            console.log('Could not load dataset list');
        }
    }

    onDatasetSelect() {
        const selectedValue = this.datasetSelect.value;
        this.loadDatasetBtn.disabled = !selectedValue;
    }

    async loadSelectedDataset() {
        const selectedDataset = this.datasetSelect.value;
        if (!selectedDataset) return;

        try {
            const response = await fetch(`data/${selectedDataset}`);
            if (!response.ok) {
                throw new Error(`Failed to load dataset: ${response.statusText}`);
            }

            const csvText = await response.text();
            this.parseCSV(csvText);
            this.showFeedback(`Dataset "${selectedDataset}" loaded successfully!`, 'success');
            setTimeout(() => {
                this.hideFeedback();
                this.startNewGame();
            }, 2000);
        } catch (error) {
            this.showFeedback(`Error loading dataset: ${error.message}`, 'error');
            setTimeout(() => this.hideFeedback(), 3000);
        }
    }

    startNewGame() {
        if (this.gameData.length === 0) {
            this.showFeedback('Please upload a CSV file first!', 'error');
            return;
        }

        this.currentRound = this.shuffleArray([...this.gameData]).slice(0, Math.min(15, this.gameData.length));
        this.matches.clear();
        this.score = 0;
        this.totalQuestions = this.currentRound.length;
        this.currentQuestion = 0;
        this.attempts = 0;
        this.selectedConcept = null;
        this.selectedDefinition = null;

        this.renderGame();
        this.updateUI();
        this.hideFeedback();
        this.hintBtn.disabled = false;
    }

    renderGame() {
        const concepts = this.shuffleArray(this.currentRound.map(item => ({
            text: item.concept,
            id: item.concept,
            type: 'concept'
        })));

        const definitions = this.shuffleArray(this.currentRound.map(item => ({
            text: item.definition,
            id: item.concept,
            type: 'definition'
        })));

        this.conceptsList.innerHTML = '';
        this.definitionsList.innerHTML = '';

        concepts.forEach(concept => {
            const element = this.createItemElement(concept);
            this.conceptsList.appendChild(element);
        });

        definitions.forEach(definition => {
            const element = this.createItemElement(definition);
            this.definitionsList.appendChild(element);
        });
    }

    createItemElement(item) {
        const element = document.createElement('div');
        element.className = 'item';
        element.textContent = item.text;
        element.dataset.id = item.id;
        element.dataset.type = item.type;
        element.tabIndex = 0;

        element.addEventListener('click', () => this.selectItem(element));
        element.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.selectItem(element);
            }
        });

        return element;
    }

    selectItem(element) {
        if (element.classList.contains('matched') || element.classList.contains('frozen')) return;

        const type = element.dataset.type;
        const id = element.dataset.id;

        if (type === 'concept') {
            this.clearSelection('concept');
            this.selectedConcept = { element, id };
            element.classList.add('selected');
        } else {
            this.clearSelection('definition');
            this.selectedDefinition = { element, id };
            element.classList.add('selected');
        }

        if (this.selectedConcept && this.selectedDefinition) {
            setTimeout(() => this.checkMatch(), 300);
        }
    }

    clearSelection(type) {
        if (type === 'concept' && this.selectedConcept) {
            this.selectedConcept.element.classList.remove('selected');
            this.selectedConcept = null;
        } else if (type === 'definition' && this.selectedDefinition) {
            this.selectedDefinition.element.classList.remove('selected');
            this.selectedDefinition = null;
        }
    }

    checkMatch() {
        if (!this.selectedConcept || !this.selectedDefinition) return;

        const isMatch = this.selectedConcept.id === this.selectedDefinition.id;

        if (isMatch) {
            this.handleCorrectMatch();
        } else {
            this.handleIncorrectMatch();
        }

        this.attempts++;
        this.updateUI();
    }

    handleCorrectMatch() {
        // Play success sound
        this.playCorrectSound();

        // Add disappearing animation
        this.selectedConcept.element.classList.add('disappearing');
        this.selectedDefinition.element.classList.add('disappearing');

        this.matches.add(this.selectedConcept.id);
        this.score += Math.max(1, 4 - this.attempts);
        this.currentQuestion++;

        this.showFeedback('Correct! Well done!', 'success');

        // Hide elements after animation
        setTimeout(() => {
            this.selectedConcept.element.style.visibility = 'hidden';
            this.selectedDefinition.element.style.visibility = 'hidden';
        }, 800);

        this.selectedConcept = null;
        this.selectedDefinition = null;

        if (this.matches.size === this.currentRound.length) {
            setTimeout(() => this.endGame(), 1500);
        } else {
            setTimeout(() => this.hideFeedback(), 1500);
        }
    }

    handleIncorrectMatch() {
        // Trigger haptic vibration
        this.triggerHapticFeedback();

        // Add incorrect styling
        this.selectedConcept.element.classList.add('incorrect');
        this.selectedDefinition.element.classList.add('incorrect');

        this.showFeedback('Not quite right. Try again!', 'error');

        // Store elements for freezing
        const conceptElement = this.selectedConcept.element;
        const definitionElement = this.selectedDefinition.element;

        setTimeout(() => {
            // Remove incorrect styling and selections
            conceptElement.classList.remove('incorrect', 'selected');
            definitionElement.classList.remove('incorrect', 'selected');

            // Freeze elements for 3 seconds
            conceptElement.classList.add('frozen');
            definitionElement.classList.add('frozen');

            this.selectedConcept = null;
            this.selectedDefinition = null;
            this.hideFeedback();

            // Unfreeze after 3 seconds
            setTimeout(() => {
                conceptElement.classList.remove('frozen');
                definitionElement.classList.remove('frozen');
            }, 3000);
        }, 1000);
    }

    showHint() {
        if (this.selectedConcept) {
            const matchingDefinition = this.currentRound.find(item =>
                item.concept === this.selectedConcept.id
            );
            if (matchingDefinition) {
                const definitionElement = document.querySelector(
                    `[data-type="definition"][data-id="${matchingDefinition.concept}"]`
                );
                if (definitionElement && !definitionElement.classList.contains('matched')) {
                    definitionElement.style.background = '#ffd700';
                    setTimeout(() => {
                        definitionElement.style.background = '';
                    }, 2000);
                }
            }
        } else {
            this.showFeedback('Select a concept first to get a hint!', 'error');
            setTimeout(() => this.hideFeedback(), 2000);
        }
    }

    resetRound() {
        this.clearSelection('concept');
        this.clearSelection('definition');
        this.matches.clear();
        this.score = 0;
        this.currentQuestion = 0;
        this.attempts = 0;

        document.querySelectorAll('.item').forEach(item => {
            item.classList.remove('matched', 'selected', 'incorrect', 'frozen', 'disappearing');
            item.style.visibility = 'visible';
        });

        this.updateUI();
        this.hideFeedback();
    }

    endGame() {
        const percentage = Math.round((this.score / (this.totalQuestions * 4)) * 100);
        this.showFeedback(
            `Game Complete! Final Score: ${this.score}/${this.totalQuestions * 4} (${percentage}%)`,
            'success'
        );
        this.hintBtn.disabled = true;
    }

    showFeedback(message, type) {
        this.feedbackText.textContent = message;
        this.feedbackElement.className = `feedback ${type}`;
        this.feedbackElement.classList.remove('hidden');
    }

    hideFeedback() {
        this.feedbackElement.classList.add('hidden');
    }

    updateUI() {
        this.scoreElement.textContent = `Score: ${this.score}`;
        this.progressElement.textContent = `Progress: ${this.matches.size}/${this.totalQuestions}`;
    }

    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.name.endsWith('.csv')) {
            this.showFeedback('Please upload a CSV file!', 'error');
            setTimeout(() => this.hideFeedback(), 3000);
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                this.parseCSV(e.target.result);
                this.showFeedback('CSV file loaded successfully!', 'success');
                setTimeout(() => {
                    this.hideFeedback();
                    this.startNewGame();
                }, 2000);
            } catch (error) {
                this.showFeedback('Error parsing CSV file. Please check the format.', 'error');
                setTimeout(() => this.hideFeedback(), 3000);
            }
        };
        reader.readAsText(file);
    }

    parseCSV(csvText) {
        const lines = csvText.trim().split('\n');
        const data = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const columns = this.parseCSVLine(line);
            if (columns.length >= 2) {
                const concept = columns[0].trim();
                const definition = columns[1].trim();

                if (i === 0 && (concept.toLowerCase() === 'concept' || concept.toLowerCase() === 'term')) {
                    continue;
                }

                data.push({
                    concept: concept,
                    definition: definition
                });
            }
        }

        if (data.length === 0) {
            throw new Error('No valid data found in CSV');
        }

        this.gameData = data;
    }

    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }

        result.push(current);
        return result;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new VocabularyGame();
});