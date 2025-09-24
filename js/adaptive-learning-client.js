import { FSRSEngine } from './fsrs-engine.js';

class AdaptiveLearningClient {
    constructor(apiBaseUrl = 'http://localhost:8000/api') {
        this.apiBaseUrl = apiBaseUrl;
        this.currentSessionId = null;
        this.userId = this.getUserId();
        this.isConnected = false;
        this.fallbackMode = false;

        // Initialize FSRS engine for offline intelligent learning
        this.fsrsEngine = new FSRSEngine();

        // Check API connection
        this.checkConnection();
    }

    async checkConnection() {
        try {
            const response = await fetch(`${this.apiBaseUrl.replace('/api', '')}/health`);
            if (response.ok) {
                this.isConnected = true;
                console.log('🔗 Connected to Adaptive Learning API');
            }
        } catch (error) {
            console.warn('⚠️ Adaptive Learning API not available, using fallback mode');
            this.fallbackMode = true;
        }
    }

    getUserId() {
        // Get or create user ID from localStorage
        let userId = localStorage.getItem('vocabularyGameUserId');
        if (!userId) {
            userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            localStorage.setItem('vocabularyGameUserId', userId);
        }
        return userId;
    }

    async initializeUser(vocabularyData) {
        if (this.fallbackMode) {
            return { status: 'success', message: 'Using fallback mode' };
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}/initialize`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    user_id: this.userId,
                    vocabulary: vocabularyData
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Failed to initialize user:', error);
            this.fallbackMode = true;
            return { status: 'fallback', message: 'Using local mode' };
        }
    }

    async startSession(sessionLength = 15) {
        if (this.fallbackMode) {
            this.currentSessionId = `fallback_${Date.now()}`;
            const storedVocab = this.getStoredVocabulary();
            const selectedWords = this.fsrsEngine.selectWordsForSession(storedVocab, sessionLength);

            return {
                words: selectedWords.map(w => w.concept),
                session_id: this.currentSessionId,
                recommended_difficulty: selectedWords.reduce((sum, w) => sum + w.difficulty, 0) / selectedWords.length,
                fsrs_selection: true
            };
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}/start-session`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    user_id: this.userId,
                    session_length: sessionLength
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();
            this.currentSessionId = result.session_id;
            return result;
        } catch (error) {
            console.error('Failed to start session:', error);
            return this.startSession(sessionLength); // Fallback
        }
    }

    async recordResponse(wordId, isCorrect, responseTimeMs, usedHint = false) {
        // Always record locally for immediate feedback
        this.recordLocalResponse(wordId, isCorrect, responseTimeMs, usedHint);

        // Update FSRS engine (works both online and offline)
        const updatedWordState = this.fsrsEngine.updateWordState(wordId, isCorrect, responseTimeMs, usedHint);
        console.log('🧠 FSRS Updated:', wordId, 'New Priority:', updatedWordState.priority.toFixed(2));

        if (this.fallbackMode) {
            return {
                status: 'success',
                message: 'Recorded with FSRS',
                fsrs_data: {
                    stability: updatedWordState.stability,
                    difficulty: updatedWordState.difficulty,
                    retrievability: updatedWordState.retrievability,
                    priority: updatedWordState.priority,
                    state: updatedWordState.state
                }
            };
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}/record-response`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    user_id: this.userId,
                    word_id: wordId,
                    is_correct: isCorrect,
                    response_time_ms: responseTimeMs,
                    used_hint: usedHint
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Failed to record response:', error);
            return { status: 'cached', message: 'Recorded locally only' };
        }
    }

    async endSession() {
        if (this.fallbackMode) {
            this.currentSessionId = null;
            return { status: 'success', message: 'Session ended locally' };
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}/end-session?user_id=${this.userId}`, {
                method: 'POST'
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            this.currentSessionId = null;
            return await response.json();
        } catch (error) {
            console.error('Failed to end session:', error);
            this.currentSessionId = null;
            return { status: 'error', message: 'Session ended locally' };
        }
    }

    async getAnalytics() {
        if (this.fallbackMode) {
            return this.getFallbackAnalytics();
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}/analytics/${this.userId}`);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Failed to get analytics:', error);
            return this.getFallbackAnalytics();
        }
    }

    async getWordStates() {
        if (this.fallbackMode) {
            return this.getFallbackWordStates();
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}/word-states/${this.userId}`);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Failed to get word states:', error);
            return this.getFallbackWordStates();
        }
    }

    async getNextWords(count = 10) {
        if (this.fallbackMode) {
            return { next_words: [] };
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}/next-words/${this.userId}?count=${count}`);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Failed to get next words:', error);
            return { next_words: [] };
        }
    }

    // Fallback methods for offline/local operation
    getFallbackWords() {
        // Return random selection from stored vocabulary
        const storedVocab = this.getStoredVocabulary();
        const shuffled = this.shuffleArray([...storedVocab]);
        return shuffled.slice(0, 15).map(item => item.concept);
    }

    getFallbackAnalytics() {
        const localStats = this.getLocalStats();
        const fsrsAnalytics = this.fsrsEngine.getAnalytics();

        return {
            user_state: {
                user_id: this.userId,
                ability_theta: 0.0,
                sessions_count: localStats.sessions || 0,
                avg_session_accuracy: fsrsAnalytics.averageAccuracy || 0.0
            },
            word_statistics: {
                total_words: fsrsAnalytics.totalWords,
                new_words: fsrsAnalytics.newWords,
                learning_words: fsrsAnalytics.learningWords,
                review_words: fsrsAnalytics.reviewWords,
                mastered_words: fsrsAnalytics.masteredWords,
                average_accuracy: fsrsAnalytics.averageAccuracy,
                total_reviews: fsrsAnalytics.totalReviews
            },
            recent_sessions: localStats.recentSessions || [],
            recommendations: [
                `📚 ${fsrsAnalytics.newWords} new words ready to learn`,
                `🔄 ${fsrsAnalytics.reviewWords} words due for review`,
                `⭐ ${fsrsAnalytics.masteredWords} words mastered`,
                "🧠 Using FSRS algorithm for optimal learning",
                "💾 Your progress is saved locally"
            ]
        };
    }

    getFallbackWordStates() {
        const storedVocab = this.getStoredVocabulary();

        console.log('🔍 FSRS Heatmap Debug - Using FSRS Engine Data');

        return {
            words: storedVocab.map(item => {
                const wordState = this.fsrsEngine.getWordState(item.concept);
                const accuracy = wordState.repsTotal > 0 ? (wordState.repsCorrect / wordState.repsTotal) : 0;

                return {
                    word_id: item.concept,
                    concept: item.concept,
                    definition: item.definition,
                    attempts: wordState.repsTotal,
                    correct_attempts: wordState.repsCorrect,
                    accuracy: accuracy,
                    average_response_time: wordState.avgResponseTime,
                    hints_used: wordState.hintUsedCount,
                    difficulty: wordState.difficulty,
                    stability: wordState.stability,
                    retrievability: wordState.retrievability,
                    state: wordState.state,
                    priority: wordState.priority,
                    streak_correct: wordState.streakCorrect,
                    lapse_count: wordState.lapseCount,
                    next_due: wordState.nextDueTime,
                    last_seen: wordState.lastReviewTime
                };
            })
        };
    }

    estimateDifficulty(accuracy, attempts) {
        if (attempts === 0) return 0.5; // Neutral difficulty for new words

        if (accuracy > 0.9) return 0.2; // Easy - high accuracy
        if (accuracy > 0.7) return 0.4; // Medium-easy
        if (accuracy > 0.5) return 0.6; // Medium
        if (accuracy > 0.3) return 0.8; // Hard
        return 1.0; // Very hard - low accuracy
    }

    recordLocalResponse(wordId, isCorrect, responseTimeMs, usedHint) {
        const stats = this.getLocalStats();

        // Update statistics
        stats.totalResponses = (stats.totalResponses || 0) + 1;
        stats.correctResponses = (stats.correctResponses || 0) + (isCorrect ? 1 : 0);
        stats.accuracy = stats.correctResponses / stats.totalResponses;

        // Store word-specific data
        if (!stats.wordData) stats.wordData = {};
        if (!stats.wordData[wordId]) {
            stats.wordData[wordId] = {
                total: 0,
                correct: 0,
                avgRt: responseTimeMs,
                hintsUsed: 0
            };
        }

        const wordData = stats.wordData[wordId];
        wordData.total += 1;
        wordData.correct += isCorrect ? 1 : 0;
        wordData.avgRt = (wordData.avgRt * (wordData.total - 1) + responseTimeMs) / wordData.total;
        wordData.hintsUsed += usedHint ? 1 : 0;
        wordData.lastSeen = Date.now();

        this.saveLocalStats(stats);
    }

    getLocalStats() {
        const stats = localStorage.getItem('vocabularyGameStats');
        return stats ? JSON.parse(stats) : {};
    }

    saveLocalStats(stats) {
        localStorage.setItem('vocabularyGameStats', JSON.stringify(stats));
    }

    getStoredVocabulary() {
        const vocab = localStorage.getItem('vocabularyGameVocab');
        return vocab ? JSON.parse(vocab) : [];
    }

    storeVocabulary(vocabularyData) {
        localStorage.setItem('vocabularyGameVocab', JSON.stringify(vocabularyData));
    }

    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    // Smart word selection for fallback mode
    selectWordsIntelligently(vocabularyData, count = 15) {
        const stats = this.getLocalStats();
        const wordData = stats.wordData || {};

        // Score words based on local performance
        const scoredWords = vocabularyData.map(item => {
            const data = wordData[item.concept] || { total: 0, correct: 0 };

            let score = 1.0; // Base score

            if (data.total === 0) {
                score = 2.0; // Prioritize new words
            } else {
                const accuracy = data.correct / data.total;
                if (accuracy < 0.5) {
                    score = 1.8; // High priority for struggling words
                } else if (accuracy > 0.9) {
                    score = 0.5; // Low priority for mastered words
                } else {
                    score = 1.2; // Medium priority for learning words
                }
            }

            // Add randomness for exploration
            score += Math.random() * 0.3;

            return { ...item, score };
        });

        // Sort by score and select top words
        scoredWords.sort((a, b) => b.score - a.score);
        return scoredWords.slice(0, count);
    }

    // Export/import functions for data portability
    exportUserData() {
        return {
            userId: this.userId,
            localStats: this.getLocalStats(),
            vocabulary: this.getStoredVocabulary(),
            exportDate: new Date().toISOString()
        };
    }

    importUserData(data) {
        if (data.userId) {
            localStorage.setItem('vocabularyGameUserId', data.userId);
            this.userId = data.userId;
        }
        if (data.localStats) {
            this.saveLocalStats(data.localStats);
        }
        if (data.vocabulary) {
            this.storeVocabulary(data.vocabulary);
        }
    }

    // Connection management
    async reconnect() {
        this.fallbackMode = false;
        await this.checkConnection();
        return !this.fallbackMode;
    }

    isOnline() {
        return !this.fallbackMode && this.isConnected;
    }

    // Export FSRS data for analysis
    exportFSRSData() {
        return this.fsrsEngine.exportData();
    }

    // Download CSV data
    downloadCSV() {
        this.fsrsEngine.dataLogger.downloadCSV();
    }

    // Download JSON data
    downloadJSON() {
        this.fsrsEngine.dataLogger.downloadJSON();
    }

    // Reset all FSRS data (for testing)
    resetFSRSData() {
        this.fsrsEngine.resetData();
    }

    // Get learning insights for UI
    getLearningInsights() {
        const stats = this.getLocalStats();
        const fsrsAnalytics = this.fsrsEngine.getAnalytics();
        const insights = [];

        // FSRS-based insights
        if (fsrsAnalytics.averageAccuracy > 0) {
            if (fsrsAnalytics.averageAccuracy > 0.9) {
                insights.push({
                    type: 'success',
                    message: `🎯 Excellent accuracy: ${(fsrsAnalytics.averageAccuracy * 100).toFixed(1)}%`
                });
            } else if (fsrsAnalytics.averageAccuracy < 0.6) {
                insights.push({
                    type: 'warning',
                    message: `📈 Focus on improvement: ${(fsrsAnalytics.averageAccuracy * 100).toFixed(1)}% accuracy`
                });
            } else {
                insights.push({
                    type: 'info',
                    message: `📊 Current accuracy: ${(fsrsAnalytics.averageAccuracy * 100).toFixed(1)}%`
                });
            }
        }

        if (fsrsAnalytics.totalReviews > 0) {
            insights.push({
                type: 'info',
                message: `📚 ${fsrsAnalytics.totalReviews} reviews completed`
            });
        }

        // Learning progress insights
        if (fsrsAnalytics.masteredWords > 0) {
            insights.push({
                type: 'success',
                message: `⭐ ${fsrsAnalytics.masteredWords} words mastered`
            });
        }

        if (fsrsAnalytics.newWords > 0) {
            insights.push({
                type: 'info',
                message: `🆕 ${fsrsAnalytics.newWords} new words to learn`
            });
        }

        if (fsrsAnalytics.reviewWords > 0) {
            insights.push({
                type: 'warning',
                message: `🔄 ${fsrsAnalytics.reviewWords} words due for review`
            });
        }

        if (this.fallbackMode) {
            insights.push({
                type: 'offline',
                message: '📡 Offline mode - progress saved locally'
            });
        }

        return insights;
    }
}