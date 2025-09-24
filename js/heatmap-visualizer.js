class HeatmapVisualizer {
    constructor() {
        this.createHeatmapContainer();
        this.isVisible = false;
    }

    createHeatmapContainer() {
        // Create heatmap overlay
        this.heatmapOverlay = document.createElement('div');
        this.heatmapOverlay.id = 'heatmap-overlay';
        this.heatmapOverlay.className = 'heatmap-overlay hidden';

        this.heatmapOverlay.innerHTML = `
            <div class="heatmap-container">
                <div class="heatmap-header">
                    <h2>📊 Learning Progress Heatmap</h2>
                    <button id="close-heatmap" class="close-button">✕</button>
                </div>
                <div class="heatmap-legend">
                    <div class="legend-item">
                        <div class="legend-color legend-new"></div>
                        <span>New (0% accuracy)</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color legend-learning"></div>
                        <span>Learning (1-50%)</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color legend-improving"></div>
                        <span>Improving (51-80%)</span>
                    </div>
                    <div class="legend-item">
                        <div class="legend-color legend-mastered"></div>
                        <span>Mastered (81-100%)</span>
                    </div>
                </div>
                <div id="heatmap-grid" class="heatmap-grid"></div>
                <div class="heatmap-stats">
                    <div class="stat-item">
                        <span class="stat-label">Total Words:</span>
                        <span id="total-words-stat">0</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Mastered:</span>
                        <span id="mastered-words-stat">0</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Learning:</span>
                        <span id="learning-words-stat">0</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Average Accuracy:</span>
                        <span id="avg-accuracy-stat">0%</span>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(this.heatmapOverlay);

        // Bind close event
        document.getElementById('close-heatmap').addEventListener('click', () => {
            this.hide();
        });

        // Close on overlay click
        this.heatmapOverlay.addEventListener('click', (e) => {
            if (e.target === this.heatmapOverlay) {
                this.hide();
            }
        });

        // Close on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible) {
                this.hide();
            }
        });
    }

    async show(learningClient, dataManager) {
        this.isVisible = true;
        this.heatmapOverlay.classList.remove('hidden');

        // Get learning data
        const analytics = await learningClient.getAnalytics();
        const wordStates = await learningClient.getWordStates();
        const currentVocab = dataManager.getData();

        this.renderHeatmap(wordStates.words || [], currentVocab, analytics);
    }

    hide() {
        this.isVisible = false;
        this.heatmapOverlay.classList.add('hidden');
    }

    renderHeatmap(wordStates, vocabulary, analytics) {
        const heatmapGrid = document.getElementById('heatmap-grid');
        heatmapGrid.innerHTML = '';

        // Create word state map for quick lookup
        const wordStateMap = new Map();
        wordStates.forEach(word => {
            wordStateMap.set(word.word_id || word.concept, word);
        });

        // Process each word in vocabulary
        const processedWords = vocabulary.map(vocabWord => {
            const wordState = wordStateMap.get(vocabWord.concept);

            if (!wordState || wordState.total_reviews === 0) {
                return {
                    concept: vocabWord.concept,
                    definition: vocabWord.definition,
                    accuracy: 0,
                    total_reviews: 0,
                    correct_reviews: 0,
                    difficulty: 5,
                    stability: 1,
                    category: 'new'
                };
            }

            const accuracy = wordState.accuracy || (wordState.correct_reviews / Math.max(1, wordState.total_reviews));
            let category = 'new';

            if (accuracy > 0.8) category = 'mastered';
            else if (accuracy > 0.5) category = 'improving';
            else if (accuracy > 0) category = 'learning';

            return {
                concept: vocabWord.concept,
                definition: vocabWord.definition,
                accuracy: accuracy,
                total_reviews: wordState.total_reviews || 0,
                correct_reviews: wordState.correct_reviews || 0,
                difficulty: wordState.difficulty || 5,
                stability: wordState.stability || 1,
                category: category
            };
        });

        // Sort by accuracy (lowest first to prioritize struggling words)
        processedWords.sort((a, b) => a.accuracy - b.accuracy);

        // Calculate grid dimensions
        const totalWords = processedWords.length;
        const cols = Math.ceil(Math.sqrt(totalWords));
        const rows = Math.ceil(totalWords / cols);

        heatmapGrid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

        // Create heatmap cells
        processedWords.forEach((word, index) => {
            const cell = document.createElement('div');
            cell.className = `heatmap-cell heatmap-${word.category}`;

            // Set opacity based on number of reviews (more reviews = more opaque)
            const reviewOpacity = Math.min(1, (word.total_reviews / 10) * 0.7 + 0.3);
            cell.style.opacity = reviewOpacity;

            // Create tooltip content
            const tooltipContent = `
                <strong>${word.concept}</strong><br>
                ${word.definition.substring(0, 100)}${word.definition.length > 100 ? '...' : ''}<br>
                <br>
                <strong>Progress:</strong><br>
                • Accuracy: ${(word.accuracy * 100).toFixed(1)}%<br>
                • Reviews: ${word.correct_reviews}/${word.total_reviews}<br>
                • Difficulty: ${word.difficulty.toFixed(1)}/10<br>
                • Stability: ${word.stability.toFixed(1)} days
            `;

            cell.innerHTML = `
                <div class="cell-content">
                    <div class="cell-concept">${word.concept.substring(0, 8)}${word.concept.length > 8 ? '...' : ''}</div>
                    <div class="cell-accuracy">${(word.accuracy * 100).toFixed(0)}%</div>
                </div>
                <div class="cell-tooltip">${tooltipContent}</div>
            `;

            heatmapGrid.appendChild(cell);
        });

        // Update statistics
        this.updateStatistics(processedWords, analytics);
    }

    updateStatistics(processedWords, analytics) {
        const stats = {
            total: processedWords.length,
            mastered: processedWords.filter(w => w.category === 'mastered').length,
            improving: processedWords.filter(w => w.category === 'improving').length,
            learning: processedWords.filter(w => w.category === 'learning').length,
            new: processedWords.filter(w => w.category === 'new').length
        };

        const avgAccuracy = processedWords.length > 0
            ? processedWords.reduce((sum, w) => sum + w.accuracy, 0) / processedWords.length
            : 0;

        document.getElementById('total-words-stat').textContent = stats.total;
        document.getElementById('mastered-words-stat').textContent = stats.mastered;
        document.getElementById('learning-words-stat').textContent = stats.learning + stats.improving;
        document.getElementById('avg-accuracy-stat').textContent = `${(avgAccuracy * 100).toFixed(1)}%`;
    }
}

// Add CSS styles for heatmap
const heatmapStyles = `
.heatmap-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(5px);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.3s ease;
}

.heatmap-overlay.hidden {
    display: none;
}

.heatmap-container {
    background: rgba(255, 255, 255, 0.95);
    border-radius: 20px;
    padding: 30px;
    max-width: 90vw;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(20px);
}

.heatmap-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    border-bottom: 2px solid #e2e8f0;
    padding-bottom: 15px;
}

.heatmap-header h2 {
    margin: 0;
    color: #4a5568;
    font-size: 1.8em;
}

.close-button {
    background: #e53e3e;
    color: white;
    border: none;
    border-radius: 50%;
    width: 35px;
    height: 35px;
    cursor: pointer;
    font-size: 1.2em;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;
}

.close-button:hover {
    background: #c53030;
    transform: scale(1.1);
}

.heatmap-legend {
    display: flex;
    gap: 20px;
    margin-bottom: 25px;
    flex-wrap: wrap;
    justify-content: center;
}

.legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9em;
    color: #4a5568;
}

.legend-color {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    border: 1px solid rgba(0, 0, 0, 0.1);
}

.legend-new { background: #e2e8f0; }
.legend-learning { background: #fed7d7; }
.legend-improving { background: #feebc8; }
.legend-mastered { background: #c6f6d5; }

.heatmap-grid {
    display: grid;
    gap: 3px;
    margin-bottom: 25px;
    min-height: 300px;
}

.heatmap-cell {
    position: relative;
    border-radius: 6px;
    min-height: 60px;
    cursor: pointer;
    transition: all 0.3s ease;
    border: 1px solid rgba(0, 0, 0, 0.1);
    overflow: hidden;
}

.heatmap-new { background: #e2e8f0; }
.heatmap-learning { background: #fc8181; }
.heatmap-improving { background: #f6ad55; }
.heatmap-mastered { background: #68d391; }

.heatmap-cell:hover {
    transform: scale(1.05);
    z-index: 10;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
}

.cell-content {
    padding: 8px;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    text-align: center;
}

.cell-concept {
    font-size: 0.8em;
    font-weight: 600;
    color: #2d3748;
    line-height: 1.2;
}

.cell-accuracy {
    font-size: 0.7em;
    font-weight: 700;
    color: #1a202c;
    margin-top: 4px;
}

.cell-tooltip {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.9);
    color: white;
    padding: 12px;
    border-radius: 8px;
    font-size: 0.8em;
    line-height: 1.4;
    white-space: nowrap;
    opacity: 0;
    visibility: hidden;
    transition: all 0.3s ease;
    z-index: 20;
    max-width: 300px;
    white-space: normal;
    text-align: left;
}

.heatmap-cell:hover .cell-tooltip {
    opacity: 1;
    visibility: visible;
    bottom: calc(100% + 10px);
}

.heatmap-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 15px;
    padding: 20px;
    background: rgba(102, 126, 234, 0.1);
    border-radius: 15px;
    border: 1px solid rgba(102, 126, 234, 0.2);
}

.stat-item {
    text-align: center;
    padding: 10px;
    background: rgba(255, 255, 255, 0.7);
    border-radius: 10px;
}

.stat-label {
    display: block;
    font-size: 0.9em;
    color: #4a5568;
    margin-bottom: 5px;
    font-weight: 600;
}

.stat-item span:last-child {
    font-size: 1.3em;
    font-weight: 700;
    color: #2d3748;
}

@media (max-width: 768px) {
    .heatmap-container {
        margin: 20px;
        padding: 20px;
    }

    .heatmap-legend {
        gap: 10px;
    }

    .legend-item {
        font-size: 0.8em;
    }

    .heatmap-cell {
        min-height: 50px;
    }

    .cell-concept {
        font-size: 0.7em;
    }

    .cell-accuracy {
        font-size: 0.6em;
    }
}
`;

// Inject styles
const styleSheet = document.createElement('style');
styleSheet.textContent = heatmapStyles;
document.head.appendChild(styleSheet);