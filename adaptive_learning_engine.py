"""
Adaptive Learning Engine for Vocabulary Game
==========================================

This module implements an intelligent word selection system based on:
- FSRS (Free Spaced Repetition Scheduler) algorithm
- Item Response Theory (IRT) for difficulty estimation
- Multi-armed bandit algorithms for exploration vs exploitation
- Cognitive load theory for session optimization

Key Features:
- User ability estimation (theta parameter)
- Word stability and retrievability tracking
- Adaptive difficulty adjustment
- Fatigue monitoring
- Personalized spaced repetition
"""

import json
import math
import time
import random
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional, Any
from dataclasses import dataclass, asdict
from enum import Enum
import sqlite3
import numpy as np


class ResponseQuality(Enum):
    """Response quality levels for FSRS algorithm"""
    FAIL = 0        # Wrong answer
    HARD = 1        # Correct but struggled (slow RT, used hints)
    GOOD = 2        # Correct with normal effort
    EASY = 3        # Correct and fast


@dataclass
class UserState:
    """User-level learning state and preferences"""
    user_id: str
    ability_theta: float = 0.0          # IRT ability parameter (-3 to +3)
    daily_streak: int = 0
    sessions_count: int = 0
    fatigue_index: float = 0.0          # 0-1, increases during session
    target_words_total: int = 1000
    words_mastered: int = 0
    new_word_quota_per_session: int = 5
    preferred_session_length: int = 15   # minutes
    last_session_ts: float = 0.0
    total_study_time: float = 0.0       # minutes
    avg_session_accuracy: float = 0.0

    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class WordState:
    """Individual word learning state with FSRS parameters"""
    word_id: str
    concept: str
    definition: str

    # FSRS Core Parameters
    stability: float = 1.0              # Days until retrievability drops to ~37%
    retrievability: float = 1.0         # Current probability of recall (0-1)
    difficulty: float = 5.0             # Word difficulty (1-10, higher = harder)

    # Scheduling
    last_review_ts: float = 0.0
    next_due_ts: float = 0.0
    interval: float = 1.0               # Current review interval in days

    # Performance History
    reps_total: int = 0
    reps_correct: int = 0
    streak_correct: int = 0
    lapse_count: int = 0                # Times forgotten after being learned

    # Response Time Analysis
    avg_rt_ms: float = 5000.0           # Average response time
    last_rt_ms: float = 5000.0          # Last response time
    rt_variance: float = 1000.0         # Response time variance

    # Learning Aids
    hint_used_count: int = 0
    confusion_pairs: List[str] = None   # Words commonly confused with
    mnemonic_used: bool = False

    # Metadata
    context_tags: List[str] = None      # Subject, difficulty level, etc.
    uncertainty: float = 1.0            # Model uncertainty (for exploration)
    last_response_quality: ResponseQuality = ResponseQuality.GOOD

    # Learning State
    is_new: bool = True
    is_learning: bool = False           # In learning phase
    is_mature: bool = False            # Well learned (stability > 21 days)

    def __post_init__(self):
        if self.confusion_pairs is None:
            self.confusion_pairs = []
        if self.context_tags is None:
            self.context_tags = []

    def to_dict(self) -> Dict:
        data = asdict(self)
        data['last_response_quality'] = self.last_response_quality.value
        return data


@dataclass
class SessionLog:
    """Session-level performance tracking"""
    session_id: str
    user_id: str
    start_ts: float
    end_ts: float = 0.0

    # Content
    words_shown: List[str] = None
    new_words_introduced: int = 0
    reviews_done: int = 0

    # Performance
    accuracy_session: float = 0.0
    avg_rt_session: float = 0.0
    total_responses: int = 0
    correct_responses: int = 0

    # Cognitive Load Profile
    load_profile: List[float] = None    # Difficulty progression during session
    fatigue_progression: List[float] = None

    def __post_init__(self):
        if self.words_shown is None:
            self.words_shown = []
        if self.load_profile is None:
            self.load_profile = []
        if self.fatigue_progression is None:
            self.fatigue_progression = []

    def to_dict(self) -> Dict:
        return asdict(self)


class AdaptiveLearningEngine:
    """Main engine for adaptive vocabulary learning"""

    def __init__(self, db_path: str = "learning_data.db"):
        self.db_path = db_path
        self.init_database()

        # FSRS Parameters (can be tuned per user)
        self.fsrs_params = {
            'w': [0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61],
            'retention_rate': 0.85,     # Target retention rate
            'max_interval': 36500,      # Max interval in days
            'learning_steps': [1, 10],  # Learning steps in minutes
            'graduating_interval': 1,   # Days to graduate from learning
            'easy_interval': 4          # Days for easy response
        }

        # Exploration parameters
        self.exploration_rate = 0.1     # ε for ε-greedy exploration
        self.uncertainty_weight = 0.2   # Weight for uncertainty in selection

        # Session management
        self.current_session: Optional[SessionLog] = None
        self.session_start_ability: float = 0.0

    def init_database(self):
        """Initialize SQLite database for persistent storage"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # User states table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_states (
                user_id TEXT PRIMARY KEY,
                ability_theta REAL,
                daily_streak INTEGER,
                sessions_count INTEGER,
                fatigue_index REAL,
                target_words_total INTEGER,
                words_mastered INTEGER,
                new_word_quota_per_session INTEGER,
                preferred_session_length INTEGER,
                last_session_ts REAL,
                total_study_time REAL,
                avg_session_accuracy REAL
            )
        ''')

        # Word states table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS word_states (
                user_id TEXT,
                word_id TEXT,
                concept TEXT,
                definition TEXT,
                stability REAL,
                retrievability REAL,
                difficulty REAL,
                last_review_ts REAL,
                next_due_ts REAL,
                interval_days REAL,
                reps_total INTEGER,
                reps_correct INTEGER,
                streak_correct INTEGER,
                lapse_count INTEGER,
                avg_rt_ms REAL,
                last_rt_ms REAL,
                rt_variance REAL,
                hint_used_count INTEGER,
                confusion_pairs TEXT,
                mnemonic_used BOOLEAN,
                context_tags TEXT,
                uncertainty REAL,
                last_response_quality INTEGER,
                is_new BOOLEAN,
                is_learning BOOLEAN,
                is_mature BOOLEAN,
                PRIMARY KEY (user_id, word_id)
            )
        ''')

        # Session logs table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS session_logs (
                session_id TEXT PRIMARY KEY,
                user_id TEXT,
                start_ts REAL,
                end_ts REAL,
                words_shown TEXT,
                new_words_introduced INTEGER,
                reviews_done INTEGER,
                accuracy_session REAL,
                avg_rt_session REAL,
                total_responses INTEGER,
                correct_responses INTEGER,
                load_profile TEXT,
                fatigue_progression TEXT
            )
        ''')

        conn.commit()
        conn.close()

    def get_user_state(self, user_id: str) -> UserState:
        """Retrieve or create user state"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('SELECT * FROM user_states WHERE user_id = ?', (user_id,))
        row = cursor.fetchone()

        if row:
            user_state = UserState(
                user_id=row[0], ability_theta=row[1], daily_streak=row[2],
                sessions_count=row[3], fatigue_index=row[4], target_words_total=row[5],
                words_mastered=row[6], new_word_quota_per_session=row[7],
                preferred_session_length=row[8], last_session_ts=row[9],
                total_study_time=row[10], avg_session_accuracy=row[11]
            )
        else:
            user_state = UserState(user_id=user_id)
            self.save_user_state(user_state)

        conn.close()
        return user_state

    def save_user_state(self, user_state: UserState):
        """Save user state to database"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            INSERT OR REPLACE INTO user_states VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            user_state.user_id, user_state.ability_theta, user_state.daily_streak,
            user_state.sessions_count, user_state.fatigue_index, user_state.target_words_total,
            user_state.words_mastered, user_state.new_word_quota_per_session,
            user_state.preferred_session_length, user_state.last_session_ts,
            user_state.total_study_time, user_state.avg_session_accuracy
        ))

        conn.commit()
        conn.close()

    def get_word_state(self, user_id: str, word_id: str) -> Optional[WordState]:
        """Retrieve word state for user"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('SELECT * FROM word_states WHERE user_id = ? AND word_id = ?',
                      (user_id, word_id))
        row = cursor.fetchone()

        if row:
            word_state = WordState(
                word_id=row[1], concept=row[2], definition=row[3],
                stability=row[4], retrievability=row[5], difficulty=row[6],
                last_review_ts=row[7], next_due_ts=row[8], interval=row[9],
                reps_total=row[10], reps_correct=row[11], streak_correct=row[12],
                lapse_count=row[13], avg_rt_ms=row[14], last_rt_ms=row[15],
                rt_variance=row[16], hint_used_count=row[17],
                confusion_pairs=json.loads(row[18]) if row[18] else [],
                mnemonic_used=bool(row[19]),
                context_tags=json.loads(row[20]) if row[20] else [],
                uncertainty=row[21],
                last_response_quality=ResponseQuality(row[22]),
                is_new=bool(row[23]), is_learning=bool(row[24]), is_mature=bool(row[25])
            )
            conn.close()
            return word_state

        conn.close()
        return None

    def save_word_state(self, user_id: str, word_state: WordState):
        """Save word state to database"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            INSERT OR REPLACE INTO word_states VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            user_id, word_state.word_id, word_state.concept, word_state.definition,
            word_state.stability, word_state.retrievability, word_state.difficulty,
            word_state.last_review_ts, word_state.next_due_ts, word_state.interval,
            word_state.reps_total, word_state.reps_correct, word_state.streak_correct,
            word_state.lapse_count, word_state.avg_rt_ms, word_state.last_rt_ms,
            word_state.rt_variance, word_state.hint_used_count,
            json.dumps(word_state.confusion_pairs), word_state.mnemonic_used,
            json.dumps(word_state.context_tags), word_state.uncertainty,
            word_state.last_response_quality.value,
            word_state.is_new, word_state.is_learning, word_state.is_mature
        ))

        conn.commit()
        conn.close()

    def initialize_word_states(self, user_id: str, vocabulary_data: List[Dict[str, str]]):
        """Initialize word states for new vocabulary"""
        for item in vocabulary_data:
            existing_state = self.get_word_state(user_id, item['concept'])
            if not existing_state:
                # Estimate initial difficulty based on word characteristics
                initial_difficulty = self.estimate_word_difficulty(item['concept'], item['definition'])

                word_state = WordState(
                    word_id=item['concept'],
                    concept=item['concept'],
                    definition=item['definition'],
                    difficulty=initial_difficulty,
                    next_due_ts=time.time()  # Available immediately
                )
                self.save_word_state(user_id, word_state)

    def estimate_word_difficulty(self, concept: str, definition: str) -> float:
        """Estimate initial word difficulty (1-10 scale)"""
        # Simple heuristic based on length and complexity
        concept_len = len(concept)
        definition_len = len(definition)

        # Longer words and definitions tend to be harder
        length_factor = min(8.0, (concept_len + definition_len / 5) / 10)

        # Add some randomness to avoid identical difficulties
        random_factor = random.uniform(0.5, 1.5)

        difficulty = max(1.0, min(10.0, length_factor * random_factor + 3.0))
        return difficulty

    def calculate_retrievability(self, word_state: WordState, current_time: float) -> float:
        """Calculate current retrievability using FSRS formula"""
        if word_state.last_review_ts == 0:
            return 1.0  # New word

        days_since_review = (current_time - word_state.last_review_ts) / (24 * 3600)
        retrievability = math.exp(-days_since_review / word_state.stability)
        return max(0.0, min(1.0, retrievability))

    def update_fsrs_parameters(self, word_state: WordState, response_quality: ResponseQuality,
                              response_time_ms: float, used_hint: bool = False):
        """Update FSRS parameters after a review"""
        current_time = time.time()

        # Update response time statistics
        if word_state.reps_total == 0:
            word_state.avg_rt_ms = response_time_ms
        else:
            alpha = 0.1  # Learning rate for RT moving average
            word_state.avg_rt_ms = (1 - alpha) * word_state.avg_rt_ms + alpha * response_time_ms

        word_state.last_rt_ms = response_time_ms
        word_state.reps_total += 1

        # Adjust response quality based on response time and hints
        adjusted_quality = response_quality
        if used_hint:
            word_state.hint_used_count += 1
            # Downgrade quality if hint was used
            adjusted_quality = ResponseQuality(max(0, response_quality.value - 1))

        # Response time penalty/bonus
        if response_time_ms > word_state.avg_rt_ms * 2:  # Very slow
            adjusted_quality = ResponseQuality(max(0, adjusted_quality.value - 1))
        elif response_time_ms < word_state.avg_rt_ms * 0.5:  # Very fast
            adjusted_quality = ResponseQuality(min(3, adjusted_quality.value + 1))

        word_state.last_response_quality = adjusted_quality

        # Update performance statistics
        if response_quality != ResponseQuality.FAIL:
            word_state.reps_correct += 1
            word_state.streak_correct += 1
        else:
            word_state.streak_correct = 0
            word_state.lapse_count += 1

        # FSRS stability update
        if word_state.is_new:
            # New word - use learning steps
            if adjusted_quality == ResponseQuality.FAIL:
                word_state.stability = 0.1  # Very short stability for failed new words
            else:
                word_state.stability = self.fsrs_params['learning_steps'][0] / (24 * 60)  # Convert minutes to days
                word_state.is_new = False
                word_state.is_learning = True
        else:
            # Calculate new stability based on previous stability and response
            stability_multiplier = self.calculate_stability_multiplier(adjusted_quality, word_state.difficulty)
            word_state.stability *= stability_multiplier

            # Update difficulty based on performance
            difficulty_change = self.calculate_difficulty_change(adjusted_quality)
            word_state.difficulty = max(1.0, min(10.0, word_state.difficulty + difficulty_change))

        # Update learning state
        if word_state.stability > 21:  # 3 weeks
            word_state.is_mature = True
            word_state.is_learning = False

        # Schedule next review
        word_state.interval = word_state.stability
        word_state.next_due_ts = current_time + word_state.interval * 24 * 3600
        word_state.last_review_ts = current_time

        # Update retrievability
        word_state.retrievability = 1.0  # Reset to 1.0 after review

        # Decrease uncertainty as we get more data
        word_state.uncertainty *= 0.95
        word_state.uncertainty = max(0.1, word_state.uncertainty)

    def calculate_stability_multiplier(self, quality: ResponseQuality, difficulty: float) -> float:
        """Calculate stability multiplier based on response quality and difficulty"""
        base_multipliers = {
            ResponseQuality.FAIL: 0.2,
            ResponseQuality.HARD: 1.0,
            ResponseQuality.GOOD: 2.5,
            ResponseQuality.EASY: 4.0
        }

        multiplier = base_multipliers[quality]

        # Adjust based on difficulty - harder words get less boost for good responses
        difficulty_factor = 1.0 - (difficulty - 5.0) * 0.05
        multiplier *= max(0.5, min(2.0, difficulty_factor))

        return multiplier

    def calculate_difficulty_change(self, quality: ResponseQuality) -> float:
        """Calculate how much to change word difficulty"""
        changes = {
            ResponseQuality.FAIL: 0.3,   # Increase difficulty
            ResponseQuality.HARD: 0.1,   # Slight increase
            ResponseQuality.GOOD: -0.05, # Slight decrease
            ResponseQuality.EASY: -0.15  # Decrease difficulty
        }
        return changes[quality]

    def select_words_for_session(self, user_id: str, session_length: int = 15) -> List[str]:
        """Select words for next session using intelligent algorithm"""
        user_state = self.get_user_state(user_id)
        current_time = time.time()

        # Get all word states for user
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute('SELECT word_id FROM word_states WHERE user_id = ?', (user_id,))
        word_ids = [row[0] for row in cursor.fetchall()]
        conn.close()

        if not word_ids:
            return []

        # Calculate priority for each word
        word_priorities = []
        for word_id in word_ids:
            word_state = self.get_word_state(user_id, word_id)
            if word_state:
                priority = self.calculate_word_priority(word_state, user_state, current_time)
                word_priorities.append((word_id, priority, word_state))

        # Sort by priority (higher = more urgent)
        word_priorities.sort(key=lambda x: x[1], reverse=True)

        # Select words with exploration vs exploitation
        selected_words = []
        target_count = min(session_length, len(word_priorities))

        for i in range(target_count):
            if random.random() < self.exploration_rate:
                # Exploration: select based on uncertainty
                uncertainty_weights = [wp[2].uncertainty for wp in word_priorities[i:]]
                if uncertainty_weights:
                    selected_idx = np.random.choice(
                        len(uncertainty_weights),
                        p=np.array(uncertainty_weights) / sum(uncertainty_weights)
                    )
                    selected_word = word_priorities[i + selected_idx][0]
                else:
                    selected_word = word_priorities[i][0]
            else:
                # Exploitation: select highest priority
                selected_word = word_priorities[i][0]

            selected_words.append(selected_word)
            # Remove selected word to avoid duplicates
            word_priorities = [wp for wp in word_priorities if wp[0] != selected_word]

        return selected_words

    def calculate_word_priority(self, word_state: WordState, user_state: UserState,
                               current_time: float) -> float:
        """Calculate priority score for word selection"""
        # Base priority factors

        # 1. Due for review (most important)
        due_factor = 0.0
        if current_time >= word_state.next_due_ts:
            days_overdue = (current_time - word_state.next_due_ts) / (24 * 3600)
            due_factor = min(10.0, 1.0 + days_overdue * 0.5)

        # 2. Retrievability (forgetting curve)
        retrievability = self.calculate_retrievability(word_state, current_time)
        forgetting_factor = max(0.0, 1.0 - retrievability) * 3.0

        # 3. Difficulty matching (Flow theory)
        difficulty_diff = abs(word_state.difficulty - (user_state.ability_theta + 5.0))
        flow_factor = max(0.1, 2.0 - difficulty_diff * 0.2)

        # 4. Learning state priority
        state_factor = 1.0
        if word_state.is_new:
            state_factor = 1.5  # Prioritize new words moderately
        elif word_state.is_learning:
            state_factor = 2.0  # High priority for learning words
        elif word_state.lapse_count > 0:
            state_factor = 1.8  # High priority for lapsed words

        # 5. Uncertainty bonus (exploration)
        uncertainty_factor = word_state.uncertainty * self.uncertainty_weight

        # 6. Performance-based adjustment
        performance_factor = 1.0
        if word_state.reps_total > 0:
            accuracy = word_state.reps_correct / word_state.reps_total
            if accuracy < 0.5:  # Struggling words
                performance_factor = 1.5
            elif accuracy > 0.9:  # Well-known words
                performance_factor = 0.7

        # Combine all factors
        priority = (due_factor * 2.0 +
                   forgetting_factor * 1.5 +
                   flow_factor * 1.0 +
                   state_factor * 1.2 +
                   uncertainty_factor * 0.5 +
                   performance_factor * 1.0)

        return priority

    def start_session(self, user_id: str) -> str:
        """Start a new learning session"""
        session_id = f"{user_id}_{int(time.time())}"
        self.current_session = SessionLog(
            session_id=session_id,
            user_id=user_id,
            start_ts=time.time()
        )

        user_state = self.get_user_state(user_id)
        self.session_start_ability = user_state.ability_theta

        return session_id

    def end_session(self, user_id: str):
        """End current session and update user state"""
        if not self.current_session:
            return

        self.current_session.end_ts = time.time()
        session_duration = (self.current_session.end_ts - self.current_session.start_ts) / 60.0  # minutes

        # Calculate session statistics
        if self.current_session.total_responses > 0:
            self.current_session.accuracy_session = (
                self.current_session.correct_responses / self.current_session.total_responses
            )

        # Update user state
        user_state = self.get_user_state(user_id)
        user_state.sessions_count += 1
        user_state.total_study_time += session_duration
        user_state.last_session_ts = self.current_session.end_ts

        # Update rolling average accuracy
        alpha = 0.1
        user_state.avg_session_accuracy = (
            (1 - alpha) * user_state.avg_session_accuracy +
            alpha * self.current_session.accuracy_session
        )

        # Reset fatigue
        user_state.fatigue_index = 0.0

        self.save_user_state(user_state)

        # Save session log
        self.save_session_log(self.current_session)
        self.current_session = None

    def save_session_log(self, session_log: SessionLog):
        """Save session log to database"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            INSERT INTO session_logs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            session_log.session_id, session_log.user_id, session_log.start_ts,
            session_log.end_ts, json.dumps(session_log.words_shown),
            session_log.new_words_introduced, session_log.reviews_done,
            session_log.accuracy_session, session_log.avg_rt_session,
            session_log.total_responses, session_log.correct_responses,
            json.dumps(session_log.load_profile), json.dumps(session_log.fatigue_progression)
        ))

        conn.commit()
        conn.close()

    def record_response(self, user_id: str, word_id: str, is_correct: bool,
                       response_time_ms: float, used_hint: bool = False):
        """Record a user response and update learning state"""
        word_state = self.get_word_state(user_id, word_id)
        if not word_state:
            return

        # Determine response quality
        if not is_correct:
            quality = ResponseQuality.FAIL
        else:
            # Use response time to determine quality
            rt_ratio = response_time_ms / word_state.avg_rt_ms if word_state.avg_rt_ms > 0 else 1.0

            if rt_ratio < 0.7:  # Very fast
                quality = ResponseQuality.EASY
            elif rt_ratio < 1.3:  # Normal speed
                quality = ResponseQuality.GOOD
            else:  # Slow
                quality = ResponseQuality.HARD

        # Update FSRS parameters
        self.update_fsrs_parameters(word_state, quality, response_time_ms, used_hint)

        # Save updated state
        self.save_word_state(user_id, word_state)

        # Update session statistics
        if self.current_session:
            self.current_session.total_responses += 1
            if is_correct:
                self.current_session.correct_responses += 1

            if word_id not in self.current_session.words_shown:
                self.current_session.words_shown.append(word_id)

            # Update cognitive load profile
            current_difficulty = word_state.difficulty
            self.current_session.load_profile.append(current_difficulty)

            # Update fatigue (increases with session length and errors)
            user_state = self.get_user_state(user_id)
            session_progress = len(self.current_session.words_shown) / 15.0  # Assume 15 word sessions
            fatigue_increase = 0.1 * session_progress
            if not is_correct:
                fatigue_increase += 0.05  # Extra fatigue from errors

            user_state.fatigue_index = min(1.0, user_state.fatigue_index + fatigue_increase)
            self.current_session.fatigue_progression.append(user_state.fatigue_index)

    def get_learning_analytics(self, user_id: str) -> Dict[str, Any]:
        """Get comprehensive learning analytics for user"""
        user_state = self.get_user_state(user_id)

        # Get word statistics
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute('''
            SELECT
                COUNT(*) as total_words,
                SUM(CASE WHEN is_new = 1 THEN 1 ELSE 0 END) as new_words,
                SUM(CASE WHEN is_learning = 1 THEN 1 ELSE 0 END) as learning_words,
                SUM(CASE WHEN is_mature = 1 THEN 1 ELSE 0 END) as mature_words,
                AVG(difficulty) as avg_difficulty,
                AVG(stability) as avg_stability,
                AVG(reps_correct * 1.0 / NULLIF(reps_total, 0)) as avg_accuracy
            FROM word_states WHERE user_id = ?
        ''', (user_id,))

        word_stats = cursor.fetchone()

        # Get recent session performance
        cursor.execute('''
            SELECT accuracy_session, avg_rt_session, start_ts
            FROM session_logs
            WHERE user_id = ?
            ORDER BY start_ts DESC
            LIMIT 10
        ''', (user_id,))

        recent_sessions = cursor.fetchall()
        conn.close()

        analytics = {
            'user_state': user_state.to_dict(),
            'word_statistics': {
                'total_words': word_stats[0] or 0,
                'new_words': word_stats[1] or 0,
                'learning_words': word_stats[2] or 0,
                'mature_words': word_stats[3] or 0,
                'average_difficulty': word_stats[4] or 0,
                'average_stability': word_stats[5] or 0,
                'average_accuracy': word_stats[6] or 0
            },
            'recent_sessions': [
                {
                    'accuracy': session[0],
                    'avg_response_time': session[1],
                    'date': datetime.fromtimestamp(session[2]).isoformat()
                }
                for session in recent_sessions
            ]
        }

        return analytics

    def export_data(self, user_id: str, format: str = 'json') -> str:
        """Export user data for backup or analysis"""
        analytics = self.get_learning_analytics(user_id)

        if format == 'json':
            return json.dumps(analytics, indent=2)
        else:
            raise ValueError(f"Unsupported format: {format}")


# Example usage and testing
if __name__ == "__main__":
    # Initialize the engine
    engine = AdaptiveLearningEngine()

    # Sample vocabulary
    sample_vocab = [
        {"concept": "Photosynthesis", "definition": "Process by which plants convert sunlight into energy"},
        {"concept": "Democracy", "definition": "System of government where citizens vote for representatives"},
        {"concept": "Algorithm", "definition": "Step-by-step procedure for solving a problem"},
        {"concept": "Renaissance", "definition": "Period of cultural rebirth in Europe"},
        {"concept": "Ecosystem", "definition": "Community of living organisms and their environment"}
    ]

    # Initialize user and vocabulary
    user_id = "test_user"
    engine.initialize_word_states(user_id, sample_vocab)

    # Start a session
    session_id = engine.start_session(user_id)
    print(f"Started session: {session_id}")

    # Select words for the session
    selected_words = engine.select_words_for_session(user_id, 5)
    print(f"Selected words: {selected_words}")

    # Simulate some responses
    for word_id in selected_words:
        # Simulate response (80% correct, random response times)
        is_correct = random.random() < 0.8
        response_time = random.uniform(2000, 8000)  # 2-8 seconds
        used_hint = random.random() < 0.2  # 20% chance of using hint

        engine.record_response(user_id, word_id, is_correct, response_time, used_hint)
        print(f"Recorded response for {word_id}: correct={is_correct}, rt={response_time:.0f}ms")

    # End session
    engine.end_session(user_id)
    print("Session ended")

    # Get analytics
    analytics = engine.get_learning_analytics(user_id)
    print(f"User ability: {analytics['user_state']['ability_theta']:.2f}")
    print(f"Total words: {analytics['word_statistics']['total_words']}")
    print(f"Average accuracy: {analytics['word_statistics']['average_accuracy']:.2f}")