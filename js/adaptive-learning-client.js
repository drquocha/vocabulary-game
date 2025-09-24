class AdaptiveLearningClient {
    constructor(apiBaseUrl = 'http://localhost:8000/api') {
        this.apiBaseUrl = apiBaseUrl;
        this.currentSessionId = null;
        this.userId = this.getUserId();
        this.isConnected = false;
        this.fallbackMode = false;

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
            return {
                words: this.getFallbackWords(),
                session_id: this.currentSessionId,
                recommended_difficulty: 5.0
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

        if (this.fallbackMode) {
            return { status: 'success', message: 'Recorded locally' };
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
            return { words: [] };
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}/word-states/${this.userId}`);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Failed to get word states:', error);
            return { words: [] };
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
        return {
            user_state: {
                user_id: this.userId,
                ability_theta: 0.0,
                sessions_count: localStats.sessions || 0,
                avg_session_accuracy: localStats.accuracy || 0.0
            },
            word_statistics: {
                total_words: localStats.totalWords || 0,
                average_accuracy: localStats.accuracy || 0.0
            },
            recent_sessions: localStats.recentSessions || [],
            recommendations: [
                "📡 Reconnect to internet for personalized learning",
                "💾 Your progress is saved locally"
            ]
        };
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

    // Get learning insights for UI
    getLearningInsights() {
        const stats = this.getLocalStats();
        const insights = [];

        if (stats.accuracy) {
            if (stats.accuracy > 0.9) {
                insights.push({
                    type: 'success',
                    message: `🎯 Excellent accuracy: ${(stats.accuracy * 100).toFixed(1)}%`
                });
            } else if (stats.accuracy < 0.6) {
                insights.push({
                    type: 'warning',
                    message: `📈 Focus on improvement: ${(stats.accuracy * 100).toFixed(1)}% accuracy`
                });
            }
        }

        if (stats.totalResponses) {
            const sessionsCount = Math.ceil(stats.totalResponses / 15);
            insights.push({
                type: 'info',
                message: `📚 ${stats.totalResponses} words practiced across ${sessionsCount} sessions`
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