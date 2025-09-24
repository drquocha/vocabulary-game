"""
Learning API Bridge
==================

FastAPI bridge to connect the adaptive learning engine with the JavaScript game.
Provides RESTful endpoints for the vocabulary game to interact with the learning system.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import uvicorn
import json
from adaptive_learning_engine import AdaptiveLearningEngine, ResponseQuality

app = FastAPI(title="Adaptive Vocabulary Learning API", version="1.0.0")

# Enable CORS for web game
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files (the game)
app.mount("/game", StaticFiles(directory=".", html=True), name="game")

# Initialize learning engine
learning_engine = AdaptiveLearningEngine()

# Pydantic models for API
class VocabularyItem(BaseModel):
    concept: str
    definition: str

class InitializeRequest(BaseModel):
    user_id: str
    vocabulary: List[VocabularyItem]

class SessionRequest(BaseModel):
    user_id: str
    session_length: Optional[int] = 15

class ResponseRequest(BaseModel):
    user_id: str
    word_id: str
    is_correct: bool
    response_time_ms: float
    used_hint: bool = False

class WordSelectionResponse(BaseModel):
    words: List[str]
    session_id: str
    recommended_difficulty: float

class AnalyticsResponse(BaseModel):
    user_state: Dict[str, Any]
    word_statistics: Dict[str, Any]
    recent_sessions: List[Dict[str, Any]]
    recommendations: List[str]

@app.get("/")
async def root():
    """Root endpoint - redirects to game"""
    return {"message": "Adaptive Vocabulary Learning API", "game_url": "/game/index.html"}

@app.post("/api/initialize")
async def initialize_user(request: InitializeRequest):
    """Initialize user with vocabulary data"""
    try:
        # Convert Pydantic models to dict
        vocab_data = [{"concept": item.concept, "definition": item.definition}
                      for item in request.vocabulary]

        # Initialize word states
        learning_engine.initialize_word_states(request.user_id, vocab_data)

        return {"status": "success", "message": f"Initialized {len(vocab_data)} words for user {request.user_id}"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/start-session")
async def start_session(request: SessionRequest) -> WordSelectionResponse:
    """Start a new learning session and get word selection"""
    try:
        # Start session
        session_id = learning_engine.start_session(request.user_id)

        # Get selected words
        selected_words = learning_engine.select_words_for_session(
            request.user_id,
            request.session_length
        )

        # Get user state for difficulty recommendation
        user_state = learning_engine.get_user_state(request.user_id)
        recommended_difficulty = user_state.ability_theta + 5.0  # Convert to 1-10 scale

        return WordSelectionResponse(
            words=selected_words,
            session_id=session_id,
            recommended_difficulty=recommended_difficulty
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/record-response")
async def record_response(request: ResponseRequest):
    """Record a user response"""
    try:
        learning_engine.record_response(
            request.user_id,
            request.word_id,
            request.is_correct,
            request.response_time_ms,
            request.used_hint
        )

        return {"status": "success", "message": "Response recorded"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/end-session")
async def end_session(user_id: str):
    """End current session"""
    try:
        learning_engine.end_session(user_id)
        return {"status": "success", "message": "Session ended"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/analytics/{user_id}")
async def get_analytics(user_id: str) -> AnalyticsResponse:
    """Get learning analytics for user"""
    try:
        analytics = learning_engine.get_learning_analytics(user_id)

        # Add recommendations based on current state
        recommendations = generate_recommendations(analytics)

        return AnalyticsResponse(
            user_state=analytics['user_state'],
            word_statistics=analytics['word_statistics'],
            recent_sessions=analytics['recent_sessions'],
            recommendations=recommendations
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/word-states/{user_id}")
async def get_word_states(user_id: str):
    """Get detailed word states for debugging/analysis"""
    try:
        import sqlite3
        conn = sqlite3.connect(learning_engine.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            SELECT word_id, concept, difficulty, stability, retrievability,
                   reps_total, reps_correct, streak_correct, is_new, is_learning, is_mature
            FROM word_states WHERE user_id = ?
            ORDER BY difficulty DESC
        ''', (user_id,))

        words = []
        for row in cursor.fetchall():
            words.append({
                'word_id': row[0],
                'concept': row[1],
                'difficulty': row[2],
                'stability': row[3],
                'retrievability': row[4],
                'total_reviews': row[5],
                'correct_reviews': row[6],
                'streak': row[7],
                'is_new': bool(row[8]),
                'is_learning': bool(row[9]),
                'is_mature': bool(row[10]),
                'accuracy': row[6] / max(1, row[5])  # Avoid division by zero
            })

        conn.close()
        return {"words": words}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/next-words/{user_id}")
async def get_next_words(user_id: str, count: int = 10):
    """Get next words to review (for preview/planning)"""
    try:
        import time
        current_time = time.time()

        import sqlite3
        conn = sqlite3.connect(learning_engine.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            SELECT word_id, concept, next_due_ts, difficulty,
                   (next_due_ts - ?) / 86400.0 as days_until_due
            FROM word_states
            WHERE user_id = ?
            ORDER BY next_due_ts ASC
            LIMIT ?
        ''', (current_time, user_id, count))

        next_words = []
        for row in cursor.fetchall():
            next_words.append({
                'word_id': row[0],
                'concept': row[1],
                'due_timestamp': row[2],
                'difficulty': row[3],
                'days_until_due': row[4],
                'is_overdue': row[4] < 0
            })

        conn.close()
        return {"next_words": next_words}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/reset-user/{user_id}")
async def reset_user(user_id: str):
    """Reset user progress (for testing)"""
    try:
        import sqlite3
        conn = sqlite3.connect(learning_engine.db_path)
        cursor = conn.cursor()

        # Delete user data
        cursor.execute('DELETE FROM user_states WHERE user_id = ?', (user_id,))
        cursor.execute('DELETE FROM word_states WHERE user_id = ?', (user_id,))
        cursor.execute('DELETE FROM session_logs WHERE user_id = ?', (user_id,))

        conn.commit()
        conn.close()

        return {"status": "success", "message": f"Reset all data for user {user_id}"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def generate_recommendations(analytics: Dict[str, Any]) -> List[str]:
    """Generate personalized recommendations based on analytics"""
    recommendations = []

    user_state = analytics['user_state']
    word_stats = analytics['word_statistics']

    # Session frequency recommendations
    if user_state['sessions_count'] < 5:
        recommendations.append("🎯 Try to study consistently for better retention")

    # Accuracy-based recommendations
    avg_accuracy = word_stats.get('average_accuracy', 0)
    if avg_accuracy < 0.6:
        recommendations.append("📚 Focus on reviewing difficult words more frequently")
    elif avg_accuracy > 0.9:
        recommendations.append("🚀 Great accuracy! Consider adding more challenging vocabulary")

    # Learning state recommendations
    learning_words = word_stats.get('learning_words', 0)
    mature_words = word_stats.get('mature_words', 0)

    if learning_words > mature_words * 2:
        recommendations.append("⏳ Focus on mastering current words before adding new ones")

    if mature_words > 20:
        recommendations.append("🎓 Excellent progress! You're building a strong vocabulary foundation")

    # Ability-based recommendations
    ability = user_state.get('ability_theta', 0)
    if ability < -1:
        recommendations.append("🌱 Start with easier vocabulary to build confidence")
    elif ability > 1:
        recommendations.append("💪 You're ready for more advanced vocabulary!")

    # Session length recommendations
    avg_session_accuracy = user_state.get('avg_session_accuracy', 0)
    if avg_session_accuracy < 0.7:
        recommendations.append("⏱️ Try shorter study sessions to maintain focus")

    return recommendations

# Add health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "engine": "adaptive_learning"}

if __name__ == "__main__":
    print("🚀 Starting Adaptive Vocabulary Learning API...")
    print("📖 Game available at: http://localhost:8000/game/index.html")
    print("📊 API docs at: http://localhost:8000/docs")

    uvicorn.run(
        "learning_api:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )