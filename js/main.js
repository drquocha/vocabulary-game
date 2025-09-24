class VocabularyGame {
    constructor() {
        this.audioManager = new AudioManager();
        this.dataManager = new DataManager();
        this.uiManager = new UIManager();
        this.gameEngine = new GameEngine();
        this.learningClient = new AdaptiveLearningClient();
        this.heatmapVisualizer = new HeatmapVisualizer();

        // Session tracking
        this.sessionStartTime = null;
        this.sessionResponses = [];

        this.bindEvents();
        this.initializeGame();
    }

    bindEvents() {
        this.uiManager.newGameBtn.addEventListener('click', () => this.startNewGame());
        this.uiManager.hintBtn.addEventListener('click', () => this.showHint());
        this.uiManager.resetBtn.addEventListener('click', () => this.resetRound());
        this.uiManager.csvUpload.addEventListener('change', (e) => this.handleFileUpload(e));
        this.uiManager.datasetSelect.addEventListener('change', () => this.onDatasetSelect());
        this.uiManager.loadDatasetBtn.addEventListener('click', () => this.loadSelectedDataset());
        this.uiManager.fontSizeIncreaseBtn.addEventListener('click', () => this.uiManager.increaseFontSize());
        this.uiManager.fontSizeDecreaseBtn.addEventListener('click', () => this.uiManager.decreaseFontSize());
        this.uiManager.heatmapBtn.addEventListener('click', () => this.showHeatmap());
        this.uiManager.onGridSizeChange(() => this.onGridSizeChange());
    }

    async initializeGame() {
        const datasets = await this.dataManager.loadAvailableDatasets();
        this.uiManager.populateDatasetSelect(datasets);

        // Initialize adaptive learning with current vocabulary
        await this.learningClient.initializeUser(this.dataManager.getData());

        // Store vocabulary for offline mode
        this.learningClient.storeVocabulary(this.dataManager.getData());

        // Initialize font size buttons
        this.uiManager.initializeFontSizeButtons();

        this.startNewGame();
    }

    async startNewGame() {
        try {
            // Start adaptive learning session
            this.sessionStartTime = Date.now();
            this.sessionResponses = [];

            const sessionData = await this.learningClient.startSession(15);

            // Use adaptive word selection if available
            let selectedWords = [];
            if (sessionData.words && sessionData.words.length > 0) {
                // Filter vocabulary to only include selected words
                const allVocab = this.dataManager.getData();
                selectedWords = allVocab.filter(item =>
                    sessionData.words.includes(item.concept)
                );

                // If we don't have enough, fill with random selections
                if (selectedWords.length < 15) {
                    const remaining = allVocab.filter(item =>
                        !sessionData.words.includes(item.concept)
                    );
                    const needed = 15 - selectedWords.length;
                    selectedWords = selectedWords.concat(
                        this.dataManager.shuffleArray(remaining).slice(0, needed)
                    );
                }
            } else {
                // Fallback to random selection
                selectedWords = this.dataManager.getData();
            }

            // Get the selected grid size from UI Manager
            const maxPairs = this.uiManager.getSelectedGridPairCount();
            const gameItems = this.gameEngine.startNewRound(selectedWords, maxPairs);
            this.uiManager.renderGameItems(gameItems.concepts, gameItems.definitions, (element) => this.selectItem(element));
            this.updateUI();
            this.uiManager.hideFeedback();
            this.uiManager.enableHintButton(true);

            // Show learning insights
            this.showLearningInsights();

        } catch (error) {
            console.error('Error starting new game:', error);
            this.uiManager.showFeedback('Please upload a CSV file first!', 'error');
        }
    }

    selectItem(element) {
        const canProceed = this.gameEngine.selectItem(element);
        if (canProceed) {
            // Record selection time for response time calculation
            this.selectionStartTime = Date.now();
            setTimeout(() => this.checkMatch(), 300);
        }
    }

    async checkMatch() {
        const matchResult = this.gameEngine.checkMatch();
        if (!matchResult) return;

        // Calculate response time
        const responseTime = Date.now() - (this.selectionStartTime || Date.now());

        // Record response for adaptive learning
        const wordId = matchResult.conceptId;
        await this.learningClient.recordResponse(
            wordId,
            matchResult.isMatch,
            responseTime,
            this.lastHintUsed || false
        );

        // Track for session analytics
        this.sessionResponses.push({
            wordId,
            correct: matchResult.isMatch,
            responseTime,
            usedHint: this.lastHintUsed || false,
            timestamp: Date.now()
        });

        // Update heatmap if it's currently visible
        this.updateHeatmapIfVisible();

        // Reset hint flag
        this.lastHintUsed = false;

        if (matchResult.isMatch) {
            this.audioManager.playCorrectSound();
            const isGameComplete = this.gameEngine.handleCorrectMatch();
            this.uiManager.showFeedback('Correct! Well done!', 'success');

            if (isGameComplete) {
                setTimeout(() => this.endGame(), 1500);
            } else {
                setTimeout(() => this.uiManager.hideFeedback(), 1500);
            }
        } else {
            this.audioManager.triggerHapticFeedback();
            this.gameEngine.handleIncorrectMatch();
            this.uiManager.showFeedback('Not quite right. Try again!', 'error');

            // Show correct pairs immediately for learning
            this.uiManager.highlightCorrectPairs(
                matchResult.conceptId,
                matchResult.definitionId,
                this.dataManager.getData()
            );

            setTimeout(() => this.uiManager.hideFeedback(), 1000);
        }

        this.updateUI();
    }

    showHint() {
        const hintResult = this.gameEngine.showHint();
        if (hintResult.success) {
            this.lastHintUsed = true; // Track hint usage
            this.uiManager.highlightDefinition(hintResult.conceptId);
        } else {
            this.uiManager.showFeedback(hintResult.message, 'error');
            setTimeout(() => this.uiManager.hideFeedback(), 2000);
        }
    }

    resetRound() {
        this.gameEngine.resetRound();
        this.uiManager.resetAllItems();
        this.updateUI();
        this.uiManager.hideFeedback();
    }

    async endGame() {
        // End adaptive learning session
        await this.learningClient.endSession();

        const stats = this.gameEngine.getGameStats();

        // Show enhanced feedback with learning insights
        const sessionDuration = (Date.now() - this.sessionStartTime) / 1000 / 60; // minutes
        const avgResponseTime = this.sessionResponses.length > 0 ?
            this.sessionResponses.reduce((sum, r) => sum + r.responseTime, 0) / this.sessionResponses.length / 1000 :
            0;

        let feedbackMessage = `Game Complete! Final Score: ${stats.score}/${stats.totalQuestions * 4} (${stats.percentage}%)`;

        if (avgResponseTime > 0) {
            feedbackMessage += `\n⏱️ Avg Response Time: ${avgResponseTime.toFixed(1)}s`;
        }

        if (sessionDuration > 0) {
            feedbackMessage += `\n📊 Session Duration: ${sessionDuration.toFixed(1)} minutes`;
        }

        this.uiManager.showFeedback(feedbackMessage, 'success');
        this.uiManager.enableHintButton(false);

        // Show learning analytics after a delay
        setTimeout(async () => {
            await this.showLearningAnalytics();
        }, 3000);
    }

    updateUI() {
        const stats = this.gameEngine.getGameStats();
        this.uiManager.updateScore(stats.score);
        this.uiManager.updateProgress(stats.matches, stats.totalQuestions);
    }

    onDatasetSelect() {
        const selectedValue = this.uiManager.datasetSelect.value;
        this.uiManager.enableLoadDatasetButton(!!selectedValue);
    }

    onGridSizeChange() {
        // Update the current game with the new grid size
        if (this.gameEngine.getCurrentRound().length > 0) {
            // If there's an active game, restart with the new grid size
            this.startNewGame();
        }
    }

    async loadSelectedDataset() {
        const selectedDataset = this.uiManager.datasetSelect.value;
        if (!selectedDataset) return;

        try {
            await this.dataManager.loadDatasetFromFile(selectedDataset);
            this.uiManager.showFeedback(`Dataset "${selectedDataset}" loaded successfully!`, 'success');
            setTimeout(() => {
                this.uiManager.hideFeedback();
                this.startNewGame();
            }, 2000);
        } catch (error) {
            this.uiManager.showFeedback(`Error loading dataset: ${error.message}`, 'error');
            setTimeout(() => this.uiManager.hideFeedback(), 3000);
        }
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.name.endsWith('.csv')) {
            this.uiManager.showFeedback('Please upload a CSV file!', 'error');
            setTimeout(() => this.uiManager.hideFeedback(), 3000);
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                this.dataManager.parseCSV(e.target.result);

                // Re-initialize adaptive learning with new vocabulary
                await this.learningClient.initializeUser(this.dataManager.getData());
                this.learningClient.storeVocabulary(this.dataManager.getData());

                this.uiManager.showFeedback('CSV file loaded successfully!', 'success');
                setTimeout(() => {
                    this.uiManager.hideFeedback();
                    this.startNewGame();
                }, 2000);
            } catch (error) {
                this.uiManager.showFeedback('Error parsing CSV file. Please check the format.', 'error');
                setTimeout(() => this.uiManager.hideFeedback(), 3000);
            }
        };
        reader.readAsText(file);
    }

    async showLearningInsights() {
        const insights = this.learningClient.getLearningInsights();
        if (insights.length > 0) {
            const insightText = insights.map(insight => `${insight.message}`).join('\n');
            console.log('Learning Insights:', insightText);

            // Show insights in UI if possible
            setTimeout(() => {
                this.uiManager.showFeedback(insights[0].message, 'info');
                setTimeout(() => this.uiManager.hideFeedback(), 4000);
            }, 1000);
        }
    }

    async showLearningAnalytics() {
        try {
            const analytics = await this.learningClient.getAnalytics();

            if (analytics.recommendations && analytics.recommendations.length > 0) {
                const recommendation = analytics.recommendations[0];
                this.uiManager.showFeedback(recommendation, 'info');
                setTimeout(() => this.uiManager.hideFeedback(), 5000);
            }

            // Log detailed analytics to console
            console.log('Learning Analytics:', analytics);

        } catch (error) {
            console.error('Failed to get analytics:', error);
        }
    }

    async showHeatmap() {
        try {
            await this.heatmapVisualizer.show(this.learningClient, this.dataManager);
        } catch (error) {
            console.error('Failed to show heatmap:', error);
            this.uiManager.showFeedback('Unable to load progress data', 'error');
            setTimeout(() => this.uiManager.hideFeedback(), 3000);
        }
    }

    async updateHeatmapIfVisible() {
        console.log('🔄 Update heatmap called, isVisible:', this.heatmapVisualizer.isVisible);
        // Check if heatmap is currently visible
        if (this.heatmapVisualizer.isVisible) {
            try {
                console.log('🔄 Refreshing heatmap with updated data...');
                // Refresh the heatmap with updated data
                await this.heatmapVisualizer.show(this.learningClient, this.dataManager);
            } catch (error) {
                console.warn('Failed to update heatmap:', error);
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new VocabularyGame();
});