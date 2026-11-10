/**
 * Main Application Controller (app.js)
 * Manages Multi-Sport Scoreboard State, Web Speech API Recognition,
 * AI Speech Filter Pipeline, Web Audio Stadium SFX, and Sport-Specific Layouts.
 */

class VoiceScoreboardApp {
  constructor() {
    this.nlp = new window.ScoreboardNLPEngine();
    this.currentSportId = 'basketball';

    // Core Scoreboard State
    this.state = {
      teamA: {
        name: 'HOME',
        color: '#ef4444',
        colorName: 'red',
        score: 0
      },
      teamB: {
        name: 'AWAY',
        color: '#3b82f6',
        colorName: 'blue',
        score: 0
      },
      period: 1,
      clockSeconds: 12 * 60,
      clockRunning: false,
      meta: window.SPORTS_CONFIG.basketball.defaultMeta()
    };

    // Undo / Redo History Stack
    this.history = [];
    this.redoStack = [];

    // Voice & AI Filter Settings
    this.voiceSettings = {
      isListening: false,
      requireWakeWord: false,
      confidenceThreshold: 0.78,
      ttsFeedback: true,
      soundEffects: true,
      aiMode: 'hybrid', // 'hybrid' (Local AST + Chatter AI Filter) or 'cloud_llm'
      aiProvider: 'gemini',
      apiKey: localStorage.getItem('vsb_ai_api_key') || '',
      language: 'en-US'
    };

    // Speech Recognition internals
    this.recognition = null;
    this.lastExecutedHash = '';
    this.lastExecutedTime = 0;
    this.voiceLogs = [];

    // Timers
    this.clockInterval = null;
    this.audioCtx = null;

    this.init();
  }

  init() {
    this.loadSavedSettings();
    this.renderSportTabs();
    this.selectSport(this.currentSportId, false);
    this.setupEventListeners();
    this.initSpeechRecognition();
    this.startMasterTimerLoop();
    this.addVoiceLog({
      type: 'system',
      transcript: 'AI Voice Filter Ready — Say "Add [X] points to Home/Away" or use sport commands.',
      reason: 'Multi-Stage NLU + Chatter Rejection Active'
    });
  }

  loadSavedSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem('vsb_settings') || '{}');
      if (saved.requireWakeWord !== undefined) this.voiceSettings.requireWakeWord = saved.requireWakeWord;
      if (saved.confidenceThreshold !== undefined) this.voiceSettings.confidenceThreshold = saved.confidenceThreshold;
      if (saved.ttsFeedback !== undefined) this.voiceSettings.ttsFeedback = saved.ttsFeedback;
      if (saved.soundEffects !== undefined) this.voiceSettings.soundEffects = saved.soundEffects;
      if (saved.aiProvider) this.voiceSettings.aiProvider = saved.aiProvider;
    } catch (e) {
      // ignore storage errors
    }
  }

  saveSettings() {
    try {
      localStorage.setItem('vsb_settings', JSON.stringify({
        requireWakeWord: this.voiceSettings.requireWakeWord,
        confidenceThreshold: this.voiceSettings.confidenceThreshold,
        ttsFeedback: this.voiceSettings.ttsFeedback,
        soundEffects: this.voiceSettings.soundEffects,
        aiProvider: this.voiceSettings.aiProvider
      }));
      if (this.voiceSettings.apiKey) {
        localStorage.setItem('vsb_ai_api_key', this.voiceSettings.apiKey);
      } else {
        localStorage.removeItem('vsb_ai_api_key');
      }
    } catch (e) {
      // ignore
    }
  }

  /**
   * Web Audio API Synthesizer for Stadium Horn, Score Chime, and Whistle
   */
  playSound(type) {
    if (!this.voiceSettings.soundEffects) return;
    try {
      if (!this.audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new AudioContext();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;

      if (type === 'score') {
        // Crisp broadcast score chime (2-note ascending triad)
        [523.25, 659.25, 783.99].forEach((freq, idx) => {
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + idx * 0.07);
          gain.gain.setValueAtTime(0.18, now + idx * 0.07);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.28);
          osc.connect(gain);
          gain.connect(this.audioCtx.destination);
          osc.start(now + idx * 0.07);
          osc.stop(now + idx * 0.07 + 0.3);
        });
      } else if (type === 'buzzer') {
        // Arena buzzer / horn
        [146.83, 220, 293.66].forEach((freq) => {
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, now);
          gain.gain.setValueAtTime(0.15, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
          osc.connect(gain);
          gain.connect(this.audioCtx.destination);
          osc.start(now);
          osc.stop(now + 0.95);
        });
      } else if (type === 'whistle') {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(2800, now);
        osc.frequency.linearRampToValueAtTime(2950, now + 0.15);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.26);
      } else if (type === 'undo') {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.linearRampToValueAtTime(300, now + 0.18);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.22);
      }
    } catch (e) {
      // Ignore audio errors
    }
  }

  speakFeedback(text) {
    if (!this.voiceSettings.ttsFeedback || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.15;
      utter.pitch = 1.0;
      utter.volume = 0.85;
      window.speechSynthesis.speak(utter);
    } catch (e) {
      // ignore
    }
  }

  /**
   * Snapshot state for Undo/Redo
   */
  pushHistory(actionDescription) {
    const snapshot = JSON.parse(JSON.stringify({
      sportId: this.currentSportId,
      state: this.state,
      actionDescription
    }));
    this.history.push(snapshot);
    if (this.history.length > 50) this.history.shift();
    this.redoStack = [];
    this.updateUndoRedoButtons();
  }

  undo() {
    if (this.history.length === 0) {
      this.showToast('Nothing to undo', 'neutral');
      return;
    }
    const currentSnapshot = JSON.parse(JSON.stringify({
      sportId: this.currentSportId,
      state: this.state,
      actionDescription: 'Current'
    }));
    this.redoStack.push(currentSnapshot);

    const prev = this.history.pop();
    if (prev.sportId !== this.currentSportId) {
      this.currentSportId = prev.sportId;
    }
    this.state = prev.state;
    this.playSound('undo');
    this.renderAll();
    this.updateUndoRedoButtons();
    this.showToast(`Undid: ${prev.actionDescription}`, 'warning');
  }

  redo() {
    if (this.redoStack.length === 0) return;
    const next = this.redoStack.pop();
    this.history.push(JSON.parse(JSON.stringify({
      sportId: this.currentSportId,
      state: this.state,
      actionDescription: 'Redo'
    })));
    this.state = next.state;
    this.renderAll();
    this.updateUndoRedoButtons();
    this.showToast('Redid action', 'info');
  }

  updateUndoRedoButtons() {
    const undoBtn = document.getElementById('btn-undo');
    const redoBtn = document.getElementById('btn-redo');
    if (undoBtn) undoBtn.disabled = this.history.length === 0;
    if (redoBtn) redoBtn.disabled = this.redoStack.length === 0;
  }

  /**
   * Sport Selection & Theme Switching
   */
  renderSportTabs() {
    const container = document.getElementById('sport-selector-bar');
    if (!container) return;
    container.innerHTML = '';

    Object.values(window.SPORTS_CONFIG).forEach((sport) => {
      const btn = document.createElement('button');
      btn.className = `sport-tab ${sport.id === this.currentSportId ? 'active' : ''}`;
      btn.dataset.sport = sport.id;
      btn.innerHTML = `<span class="sport-icon">${sport.icon}</span><span class="sport-name">${sport.name}</span>`;
      btn.addEventListener('click', () => this.selectSport(sport.id, true));
      container.appendChild(btn);
    });
  }

  selectSport(sportId, resetScores = true) {
    const sport = window.SPORTS_CONFIG[sportId];
    if (!sport) return;

    this.currentSportId = sportId;
    document.documentElement.style.setProperty('--sport-accent', sport.themeColor);
    document.documentElement.style.setProperty('--sport-glow', sport.accentGlow);

    if (resetScores) {
      this.state.teamA.score = 0;
      this.state.teamB.score = 0;
      this.state.period = 1;
      this.state.clockSeconds = sport.defaultClockSeconds;
      this.state.clockRunning = false;
      this.state.meta = sport.defaultMeta();
      this.history = [];
      this.redoStack = [];
      this.updateUndoRedoButtons();
    } else {
      this.state.clockSeconds = sport.defaultClockSeconds;
      this.state.meta = sport.defaultMeta();
    }

    // Highlight active tab
    document.querySelectorAll('.sport-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.sport === sportId);
    });

    this.renderAll();
  }

  /**
   * Master 1-Second Clock Loop for Game Clock, Shot/Play Clock, Hockey Penalties, Rugby Sin Bin, Wrestling Riding Time
   */
  startMasterTimerLoop() {
    if (this.clockInterval) clearInterval(this.clockInterval);
    this.clockInterval = setInterval(() => {
      const sport = window.SPORTS_CONFIG[this.currentSportId];
      if (!this.state.clockRunning) return;

      // Main Clock
      if (sport.clockDirection === 'down') {
        if (this.state.clockSeconds > 0) {
          this.state.clockSeconds--;
          if (this.state.clockSeconds === 0) {
            this.state.clockRunning = false;
            this.playSound('buzzer');
            this.showToast(`${sport.periodLabel} ${this.state.period} Ended!`, 'warning');
          }
        }
      } else if (sport.clockDirection === 'up') {
        this.state.clockSeconds++;
      }

      // Basketball Shot Clock
      if (this.currentSportId === 'basketball' && this.state.meta.shotClock > 0) {
        this.state.meta.shotClock--;
        if (this.state.meta.shotClock === 0) {
          this.playSound('buzzer');
          this.showToast('Shot Clock Violation!', 'warning');
        }
      }

      // American Football Play Clock
      if (this.currentSportId === 'football' && this.state.meta.playClock > 0) {
        this.state.meta.playClock--;
        if (this.state.meta.playClock === 0) {
          this.playSound('whistle');
          this.showToast('Delay of Game — Play Clock Expired!', 'warning');
        }
      }

      // Ice Hockey Penalty Clocks
      if (this.currentSportId === 'hockey') {
        if (this.state.meta.penaltyA > 0) this.state.meta.penaltyA--;
        if (this.state.meta.penaltyB > 0) this.state.meta.penaltyB--;
      }

      // Rugby Sin Bin Clocks
      if (this.currentSportId === 'rugby') {
        if (this.state.meta.sinBinA > 0) this.state.meta.sinBinA--;
        if (this.state.meta.sinBinB > 0) this.state.meta.sinBinB--;
      }

      // Combat Riding / Control Time
      if (this.currentSportId === 'combat') {
        if (this.state.meta.activeControl === 'A') this.state.meta.controlA++;
        if (this.state.meta.activeControl === 'B') this.state.meta.controlB++;
      }

      this.updateClockDOM();
      this.renderSportSpecificWidget();
    }, 1000);
  }

  formatTime(totalSeconds) {
    const mins = Math.floor(Math.abs(totalSeconds) / 60);
    const secs = Math.abs(totalSeconds) % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  /**
   * Core Score Mutation Engine (Handles any point amount + sport-specific rules like Tennis 15/30/40/AD, Baseball innings, etc.)
   */
  modifyScore(teamKey, deltaPoints, operation = 'add', metaAction = null, sourceLabel = '') {
    const sport = window.SPORTS_CONFIG[this.currentSportId];
    const teamObj = teamKey === 'A' ? this.state.teamA : this.state.teamB;
    const oppObj = teamKey === 'A' ? this.state.teamB : this.state.teamA;

    const actionDesc = sourceLabel || `${operation === 'subtract' ? '-' : '+'}${deltaPoints} ${teamObj.name}`;
    this.pushHistory(actionDesc);

    if (operation === 'set') {
      teamObj.score = Math.max(0, deltaPoints);
      this.playSound('score');
      this.triggerScorePulse(teamKey, `=${deltaPoints}`);
      this.renderAll();
      return;
    }

    if (operation === 'subtract') {
      teamObj.score = Math.max(0, teamObj.score - deltaPoints);
      this.playSound('undo');
      this.triggerScorePulse(teamKey, `-${deltaPoints}`);
      this.renderAll();
      return;
    }

    // Special Case: Tennis 15-30-40-AD when adding a single point (+1) in standard game mode
    if (this.currentSportId === 'tennis' && deltaPoints === 1 && !this.state.meta.tiebreak && this.state.meta.tennisScoring) {
      if (metaAction === 'ace') {
        if (teamKey === 'A') this.state.meta.acesA++;
        else this.state.meta.acesB++;
      }
      this.advanceTennisPoint(teamKey);
      this.playSound('score');
      this.triggerScorePulse(teamKey, '+1 PT');
      this.renderAll();
      return;
    }

    // Standard / Arbitrary Point Addition (+X points)
    teamObj.score += deltaPoints;

    // Sport-Specific Period / Inning / Meta Tracking
    const pIdx = Math.max(0, this.state.period - 1);

    if (this.currentSportId === 'basketball') {
      const arr = teamKey === 'A' ? this.state.meta.quartersA : this.state.meta.quartersB;
      while (arr.length <= pIdx) arr.push(0);
      arr[pIdx] += deltaPoints;
      this.state.meta.shotClock = 24;
      this.state.meta.possession = teamKey === 'A' ? 'B' : 'A';
    } else if (this.currentSportId === 'football') {
      const arr = teamKey === 'A' ? this.state.meta.quartersA : this.state.meta.quartersB;
      while (arr.length <= pIdx) arr.push(0);
      arr[pIdx] += deltaPoints;
    } else if (this.currentSportId === 'baseball') {
      const arr = teamKey === 'A' ? this.state.meta.inningsA : this.state.meta.inningsB;
      while (arr.length <= pIdx) arr.push(0);
      arr[pIdx] += deltaPoints;
    } else if (this.currentSportId === 'hockey') {
      const arr = teamKey === 'A' ? this.state.meta.periodsA : this.state.meta.periodsB;
      while (arr.length <= pIdx) arr.push(0);
      arr[pIdx] += deltaPoints;
      if (teamKey === 'A') this.state.meta.shotsA += 1;
      else this.state.meta.shotsB += 1;
    } else if (this.currentSportId === 'volleyball') {
      const arr = teamKey === 'A' ? this.state.meta.setScoresA : this.state.meta.setScoresB;
      while (arr.length <= pIdx) arr.push(0);
      arr[pIdx] = teamObj.score;
      this.state.meta.server = teamKey;
      if (metaAction === 'ace') {
        if (teamKey === 'A') this.state.meta.acesA++;
        else this.state.meta.acesB++;
      } else if (metaAction === 'block') {
        if (teamKey === 'A') this.state.meta.blocksA++;
        else this.state.meta.blocksB++;
      }
      // Check automatic set win (25 pts or 15 in 5th set, win by 2)
      const target = this.state.period === 5 ? 15 : 25;
      if (teamObj.score >= target && (teamObj.score - oppObj.score) >= 2) {
        if (teamKey === 'A') this.state.meta.setsWonA++;
        else this.state.meta.setsWonB++;
        this.showToast(`${teamObj.name} wins Set ${this.state.period}!`, 'success');
      }
    } else if (this.currentSportId === 'tabletennis') {
      const arr = teamKey === 'A' ? this.state.meta.setScoresA : this.state.meta.setScoresB;
      while (arr.length <= pIdx) arr.push(0);
      arr[pIdx] = teamObj.score;
      // Auto-rotate serve every 2 points (or every 1 point at 10-10 deuce)
      const totalPts = this.state.teamA.score + this.state.teamB.score;
      const target = this.state.meta.targetPoints || 11;
      if (this.state.teamA.score >= target - 1 && this.state.teamB.score >= target - 1) {
        this.state.meta.server = totalPts % 2 === 0 ? this.state.meta.initialServer : (this.state.meta.initialServer === 'A' ? 'B' : 'A');
      } else {
        const block = Math.floor(totalPts / 2);
        this.state.meta.server = block % 2 === 0 ? this.state.meta.initialServer : (this.state.meta.initialServer === 'A' ? 'B' : 'A');
      }
    } else if (this.currentSportId === 'rugby') {
      if (metaAction === 'try') {
        if (teamKey === 'A') this.state.meta.triesA++;
        else this.state.meta.triesB++;
      } else if (metaAction === 'convertedTry') {
        if (teamKey === 'A') { this.state.meta.triesA++; this.state.meta.conversionsA++; }
        else { this.state.meta.triesB++; this.state.meta.conversionsB++; }
      } else if (metaAction === 'conversion') {
        if (teamKey === 'A') this.state.meta.conversionsA++;
        else this.state.meta.conversionsB++;
      } else if (metaAction === 'penalty') {
        if (teamKey === 'A') this.state.meta.penaltiesA++;
        else this.state.meta.penaltiesB++;
      } else if (metaAction === 'dropGoal') {
        if (teamKey === 'A') this.state.meta.dropGoalsA++;
        else this.state.meta.dropGoalsB++;
      }
    } else if (this.currentSportId === 'cricket') {
      this.state.meta.batting = teamKey;
      if (metaAction === 'six') {
        if (teamKey === 'A') { this.state.meta.sixesA++; this.state.meta.ballsA++; }
        else { this.state.meta.sixesB++; this.state.meta.ballsB++; }
        this.pushCricketOverBall('6');
      } else if (metaAction === 'four') {
        if (teamKey === 'A') { this.state.meta.foursA++; this.state.meta.ballsA++; }
        else { this.state.meta.foursB++; this.state.meta.ballsB++; }
        this.pushCricketOverBall('4');
      } else {
        if (teamKey === 'A') this.state.meta.ballsA++;
        else this.state.meta.ballsB++;
        this.pushCricketOverBall(String(deltaPoints));
      }
    } else if (this.currentSportId === 'combat') {
      if (metaAction === 'takedown') {
        if (teamKey === 'A') this.state.meta.takedownsA++;
        else this.state.meta.takedownsB++;
      } else if (metaAction === 'escape') {
        if (teamKey === 'A') this.state.meta.escapesA++;
        else this.state.meta.escapesB++;
      } else if (metaAction === 'reversal') {
        if (teamKey === 'A') this.state.meta.reversalsA++;
        else this.state.meta.reversalsB++;
      }
    } else if (this.currentSportId === 'arcade') {
      if (teamKey === 'A') {
        this.state.meta.roundDeltaA += deltaPoints;
        this.state.meta.streakA++;
        this.state.meta.streakB = 0;
      } else {
        this.state.meta.roundDeltaB += deltaPoints;
        this.state.meta.streakB++;
        this.state.meta.streakA = 0;
      }
    }

    this.playSound('score');
    this.triggerScorePulse(teamKey, `+${deltaPoints}`);
    this.renderAll();
  }

  pushCricketOverBall(symbol) {
    if (!this.state.meta.thisOver) this.state.meta.thisOver = [];
    if (this.state.meta.thisOver.length >= 6) {
      this.state.meta.thisOver = [];
    }
    this.state.meta.thisOver.push(symbol);
  }

  /**
   * Tennis 0 -> 15 -> 30 -> 40 -> AD -> Game state machine
   */
  advanceTennisPoint(teamKey) {
    const team = teamKey === 'A' ? this.state.teamA : this.state.teamB;
    const opp = teamKey === 'A' ? this.state.teamB : this.state.teamA;

    const seq = [0, 15, 30, 40];
    if (team.score === 40 && opp.score === 40) {
      team.score = 'AD';
    } else if (team.score === 'AD') {
      this.awardTennisGame(teamKey);
    } else if (opp.score === 'AD') {
      opp.score = 40; // Back to deuce
    } else if (team.score === 40) {
      this.awardTennisGame(teamKey);
    } else {
      const idx = seq.indexOf(Number(team.score));
      team.score = idx >= 0 && idx < 3 ? seq[idx + 1] : 15;
    }
  }

  awardTennisGame(teamKey) {
    const sIdx = Math.max(0, this.state.period - 1);
    const gamesArr = teamKey === 'A' ? this.state.meta.gamesA : this.state.meta.gamesB;
    const oppArr = teamKey === 'A' ? this.state.meta.gamesB : this.state.meta.gamesA;
    while (gamesArr.length <= sIdx) gamesArr.push(0);
    while (oppArr.length <= sIdx) oppArr.push(0);

    gamesArr[sIdx]++;
    this.state.teamA.score = 0;
    this.state.teamB.score = 0;
    this.state.meta.server = this.state.meta.server === 'A' ? 'B' : 'A';

    // Check set win (6 games, win by 2, or 7-6)
    if ((gamesArr[sIdx] >= 6 && gamesArr[sIdx] - oppArr[sIdx] >= 2) || gamesArr[sIdx] === 7) {
      if (teamKey === 'A') this.state.meta.setsWonA++;
      else this.state.meta.setsWonB++;
      if (this.state.period < 3) this.state.period++;
    }
  }

  /**
   * Executes sport-specific non-point commands (e.g. "reset shot clock", "strike", "yellow card Away")
   */
  executeSportCommand(action, teamKey, value, description) {
    this.pushHistory(description || action);
    const m = this.state.meta;

    switch (action) {
      // Basketball
      case 'shotClock24':
        m.shotClock = 24;
        break;
      case 'shotClock14':
        m.shotClock = 14;
        break;
      case 'addFoul':
        if (teamKey === 'A') m.foulsA++;
        else if (teamKey === 'B') m.foulsB++;
        this.playSound('whistle');
        break;
      case 'useTimeout':
        if (teamKey === 'A' && m.timeoutsA > 0) m.timeoutsA--;
        else if (teamKey === 'B' && m.timeoutsB > 0) m.timeoutsB--;
        this.state.clockRunning = false;
        this.playSound('whistle');
        break;
      case 'setPossession':
        if (teamKey) m.possession = teamKey;
        break;

      // Soccer
      case 'addYellow':
        if (teamKey === 'A') m.yellowA++;
        else if (teamKey === 'B') m.yellowB++;
        this.playSound('whistle');
        break;
      case 'addRed':
        if (teamKey === 'A') m.redA++;
        else if (teamKey === 'B') m.redB++;
        this.playSound('whistle');
        break;
      case 'addCorner':
        if (teamKey === 'A') m.cornersA++;
        else if (teamKey === 'B') m.cornersB++;
        break;
      case 'addShot':
        if (teamKey === 'A') m.shotsA++;
        else if (teamKey === 'B') m.shotsB++;
        break;
      case 'setStoppage':
        m.stoppageMinutes = value || 3;
        break;

      // American Football
      case 'firstDown':
        m.down = 1;
        m.distance = 10;
        m.playClock = 40;
        break;
      case 'nextDown':
        m.down = m.down < 4 ? m.down + 1 : 1;
        break;
      case 'togglePossession':
        m.possession = m.possession === 'A' ? 'B' : 'A';
        m.down = 1;
        m.distance = 10;
        break;
      case 'playClock40':
        m.playClock = 40;
        break;
      case 'playClock25':
        m.playClock = 25;
        break;

      // Baseball
      case 'addStrike':
        m.strikes++;
        if (m.strikes >= 3) {
          m.strikes = 0;
          m.balls = 0;
          this.recordBaseballOut();
        }
        break;
      case 'addBall':
        m.balls++;
        if (m.balls >= 4) {
          m.balls = 0;
          m.strikes = 0;
          m.bases[0] = true;
        }
        break;
      case 'foulBall':
        if (m.strikes < 2) m.strikes++;
        break;
      case 'addOut':
        this.recordBaseballOut();
        break;
      case 'resetCount':
        m.balls = 0;
        m.strikes = 0;
        break;
      case 'addHit':
        if (teamKey === 'A') m.hitsA++;
        else if (teamKey === 'B') m.hitsB++;
        break;
      case 'addError':
        if (teamKey === 'A') m.errorsA++;
        else if (teamKey === 'B') m.errorsB++;
        break;
      case 'toggleBase1':
        m.bases[0] = !m.bases[0];
        break;
      case 'toggleBase2':
        m.bases[1] = !m.bases[1];
        break;
      case 'toggleBase3':
        m.bases[2] = !m.bases[2];
        break;
      case 'basesLoaded':
        m.bases = [true, true, true];
        break;
      case 'clearBases':
        m.bases = [false, false, false];
        break;

      // Hockey
      case 'addPenalty2':
        if (teamKey === 'A') m.penaltyA = 120;
        else if (teamKey === 'B') m.penaltyB = 120;
        this.playSound('whistle');
        break;
      case 'addPenalty5':
        if (teamKey === 'A') m.penaltyA = 300;
        else if (teamKey === 'B') m.penaltyB = 300;
        this.playSound('whistle');
        break;
      case 'clearPenalties':
        m.penaltyA = 0;
        m.penaltyB = 0;
        break;
      case 'toggleEmptyNet':
        if (teamKey === 'A') m.emptyNetA = !m.emptyNetA;
        else if (teamKey === 'B') m.emptyNetB = !m.emptyNetB;
        break;

      // Tennis / Volleyball / Table Tennis
      case 'winGame':
        if (teamKey) this.awardTennisGame(teamKey);
        break;
      case 'winSet':
        if (teamKey === 'A') m.setsWonA++;
        else if (teamKey === 'B') m.setsWonB++;
        this.state.teamA.score = 0;
        this.state.teamB.score = 0;
        this.state.period++;
        break;
      case 'doubleFault':
        if (teamKey) {
          if (teamKey === 'A') m.doubleFaultsA++;
          else m.doubleFaultsB++;
          this.advanceTennisPoint(teamKey === 'A' ? 'B' : 'A');
        }
        break;
      case 'toggleServer':
        m.server = m.server === 'A' ? 'B' : 'A';
        break;
      case 'toggleTiebreak':
        m.tiebreak = !m.tiebreak;
        this.state.teamA.score = 0;
        this.state.teamB.score = 0;
        break;
      case 'target21':
        m.targetPoints = 21;
        break;
      case 'target11':
        m.targetPoints = 11;
        break;

      // Rugby
      case 'sinBin':
        if (teamKey === 'A') m.sinBinA = 600;
        else if (teamKey === 'B') m.sinBinB = 600;
        this.playSound('whistle');
        break;
      case 'clearSinBin':
        m.sinBinA = 0;
        m.sinBinB = 0;
        break;

      // Cricket
      case 'addWicket': {
        const bTeam = m.batting || 'A';
        if (bTeam === 'A') { m.wicketsA = Math.min(10, m.wicketsA + 1); m.ballsA++; }
        else { m.wicketsB = Math.min(10, m.wicketsB + 1); m.ballsB++; }
        this.pushCricketOverBall('W');
        this.playSound('whistle');
        break;
      }
      case 'dotBall': {
        const bTeam = m.batting || 'A';
        if (bTeam === 'A') m.ballsA++;
        else m.ballsB++;
        this.pushCricketOverBall('•');
        break;
      }
      case 'addExtra': {
        const bTeam = m.batting || 'A';
        if (bTeam === 'A') { m.extrasA++; this.state.teamA.score++; }
        else { m.extrasB++; this.state.teamB.score++; }
        this.pushCricketOverBall('WD');
        break;
      }
      case 'switchBatting':
        m.batting = m.batting === 'A' ? 'B' : 'A';
        m.thisOver = [];
        break;

      // Combat
      case 'addWarning':
        if (teamKey === 'A') m.warningsA++;
        else if (teamKey === 'B') m.warningsB++;
        this.playSound('whistle');
        break;
      case 'setControl':
        m.activeControl = teamKey;
        break;
      case 'clearControl':
        m.activeControl = null;
        break;

      // Arcade / Universal
      case 'setTargetScore':
        if (value > 0) m.targetScore = value;
        break;
      case 'nextPeriod':
        this.state.period++;
        m.roundDeltaA = 0;
        m.roundDeltaB = 0;
        break;
    }

    this.renderAll();
  }

  recordBaseballOut() {
    const m = this.state.meta;
    m.outs++;
    m.balls = 0;
    m.strikes = 0;
    if (m.outs >= 3) {
      m.outs = 0;
      m.bases = [false, false, false];
      if (m.half === 'top') {
        m.half = 'bottom';
      } else {
        m.half = 'top';
        this.state.period++;
      }
    }
  }

  /**
   * Executes global commands (Undo, Redo, Clock, Period, Swap, Reset)
   */
  executeGlobalCommand(intent) {
    const sport = window.SPORTS_CONFIG[this.currentSportId];
    switch (intent) {
      case 'undo':
        this.undo();
        break;
      case 'redo':
        this.redo();
        break;
      case 'startClock':
        this.state.clockRunning = true;
        this.playSound('whistle');
        this.renderAll();
        break;
      case 'stopClock':
        this.state.clockRunning = false;
        this.playSound('whistle');
        this.renderAll();
        break;
      case 'resetClock':
        this.pushHistory('Reset Clock');
        this.state.clockRunning = false;
        this.state.clockSeconds = sport.defaultClockSeconds;
        this.renderAll();
        break;
      case 'nextPeriod':
        this.pushHistory(`Next ${sport.periodLabel}`);
        this.state.period++;
        if (sport.clockDirection === 'down') {
          this.state.clockSeconds = sport.defaultClockSeconds;
          this.state.clockRunning = false;
        }
        if (this.currentSportId === 'volleyball' || this.currentSportId === 'tabletennis') {
          this.state.teamA.score = 0;
          this.state.teamB.score = 0;
        }
        this.renderAll();
        break;
      case 'prevPeriod':
        if (this.state.period > 1) {
          this.pushHistory(`Previous ${sport.periodLabel}`);
          this.state.period--;
          this.renderAll();
        }
        break;
      case 'swapTeams': {
        this.pushHistory('Swap Teams');
        const temp = JSON.parse(JSON.stringify(this.state.teamA));
        this.state.teamA = JSON.parse(JSON.stringify(this.state.teamB));
        this.state.teamB = temp;
        this.renderAll();
        break;
      }
      case 'resetMatch':
        this.pushHistory('Reset Match');
        this.selectSport(this.currentSportId, true);
        break;
    }
  }

  /**
   * Web Speech API Setup & Multi-Alternative AI Filter Pipeline
   */
  initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const statusBadge = document.getElementById('mic-status-badge');

    if (!SpeechRecognition) {
      if (statusBadge) {
        statusBadge.textContent = 'Browser Speech API Unavailable (Use Command Bar Below)';
        statusBadge.classList.add('status-offline');
      }
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 5;
    this.recognition.lang = this.voiceSettings.language;

    this.recognition.onstart = () => {
      this.updateMicUI(true);
    };

    this.recognition.onresult = (event) => {
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const alternatives = [];
          for (let j = 0; j < result.length; j++) {
            alternatives.push({
              transcript: result[j].transcript.trim(),
              confidence: result[j].confidence
            });
          }
          this.processFinalSpeechAlternatives(alternatives);
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      const liveTranscriptEl = document.getElementById('live-interim-transcript');
      if (liveTranscriptEl && interimTranscript) {
        liveTranscriptEl.textContent = `"${interimTranscript}..."`;
        liveTranscriptEl.classList.add('interim-active');
      }
    };

    this.recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        this.voiceSettings.isListening = false;
        this.updateMicUI(false);
        this.showToast('Microphone permission denied. Please allow microphone access or use the Simulator Bar.', 'error');
      }
    };

    this.recognition.onend = () => {
      // Auto-restart if listening mode is active
      if (this.voiceSettings.isListening) {
        try {
          this.recognition.start();
        } catch (e) {
          // ignore if already started
        }
      } else {
        this.updateMicUI(false);
      }
    };
  }

  toggleListening() {
    if (!this.recognition) {
      this.showToast('Web Speech API requires Chrome, Edge, or Safari. Use the Voice Command Simulator below!', 'warning');
      return;
    }

    this.voiceSettings.isListening = !this.voiceSettings.isListening;
    if (this.voiceSettings.isListening) {
      try {
        this.recognition.start();
        this.showToast('Voice Control Active — Listening for Scoreboard Commands', 'success');
      } catch (e) {
        // already running
      }
    } else {
      this.recognition.stop();
      this.updateMicUI(false);
      this.showToast('Voice Control Paused', 'neutral');
    }
  }

  updateMicUI(active) {
    const micBtn = document.getElementById('btn-mic-toggle');
    const badge = document.getElementById('mic-status-badge');
    const wave = document.getElementById('voice-waveform');

    if (micBtn) {
      micBtn.classList.toggle('listening', active);
      micBtn.innerHTML = active
        ? `<span class="mic-dot pulse"></span> Stop Voice Control`
        : `<span class="mic-icon">🎙️</span> Start Voice Control`;
    }
    if (badge) {
      badge.textContent = active
        ? (this.voiceSettings.requireWakeWord ? 'Listening (Wake Word: "Scoreboard")' : 'AI Voice Filter Active (Listening)')
        : 'Mic Paused';
      badge.className = `mic-badge ${active ? 'badge-live' : 'badge-paused'}`;
    }
    if (wave) {
      wave.classList.toggle('active', active);
    }
  }

  /**
   * Processes Final Speech Alternatives through the Multi-Stage NLU + AI Filter Engine
   */
  async processFinalSpeechAlternatives(alternatives) {
    if (!alternatives || alternatives.length === 0) return;
    const primaryTranscript = alternatives[0].transcript;
    if (!primaryTranscript) return;

    // Duplicate / Echo Debouncer (1.3s window for identical transcripts)
    const now = Date.now();
    const normHash = primaryTranscript.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normHash === this.lastExecutedHash && (now - this.lastExecutedTime) < 1300) {
      return;
    }

    const liveTranscriptEl = document.getElementById('live-interim-transcript');
    if (liveTranscriptEl) {
      liveTranscriptEl.textContent = `"${primaryTranscript}"`;
      liveTranscriptEl.classList.remove('interim-active');
    }

    const context = {
      sportId: this.currentSportId,
      teamAName: this.state.teamA.name,
      teamBName: this.state.teamB.name,
      teamAColor: this.state.teamA.colorName,
      teamBColor: this.state.teamB.colorName,
      requireWakeWord: this.voiceSettings.requireWakeWord,
      strictMode: true,
      aiMode: this.voiceSettings.aiMode,
      aiProvider: this.voiceSettings.aiProvider,
      apiKey: this.voiceSettings.apiKey
    };

    // Stage 1: Evaluate all N-best alternatives with our deterministic AST + Phonetic + Chatter Filter
    let evaluation = this.nlp.evaluateAlternatives(alternatives, context);

    // Stage 2: Optional AI Verification (if configured)
    if (this.voiceSettings.apiKey) {
      evaluation = await this.nlp.verifyWithAI(primaryTranscript, context, evaluation);
    }

    // Stage 3: Check Confidence Threshold Gate
    if (evaluation.valid && evaluation.confidence < this.voiceSettings.confidenceThreshold) {
      this.addVoiceLog({
        type: 'filtered',
        transcript: evaluation.rawTranscript || primaryTranscript,
        reason: `Blocked: Confidence (${Math.round(evaluation.confidence * 100)}%) below safety threshold (${Math.round(this.voiceSettings.confidenceThreshold * 100)}%)`
      });
      return;
    }

    // Stage 4: Execute or Reject
    if (!evaluation.valid) {
      this.addVoiceLog({
        type: 'filtered',
        transcript: evaluation.rawTranscript || primaryTranscript,
        reason: evaluation.reason
      });
      return;
    }

    // Validated Intentional Scoreboard Command!
    this.lastExecutedHash = normHash;
    this.lastExecutedTime = now;

    if (evaluation.category === 'score') {
      this.modifyScore(
        evaluation.team,
        evaluation.points,
        evaluation.intent,
        evaluation.metaAction,
        evaluation.description
      );
      this.speakFeedback(evaluation.description);
    } else if (evaluation.category === 'sport_command') {
      this.executeSportCommand(
        evaluation.intent,
        evaluation.team,
        evaluation.value,
        evaluation.description
      );
      this.speakFeedback(evaluation.description);
    } else if (evaluation.category === 'global') {
      this.executeGlobalCommand(evaluation.intent);
      this.speakFeedback(evaluation.description);
    }

    this.addVoiceLog({
      type: 'executed',
      transcript: evaluation.rawTranscript || primaryTranscript,
      normalized: evaluation.normalizedText,
      description: evaluation.description,
      confidence: evaluation.confidence,
      aiVerified: evaluation.aiVerified
    });

    this.showToast(`✓ ${evaluation.description}`, 'success', true);
  }

  /**
   * Appends an entry to the Live AI Voice Filter Audit Log
   */
  addVoiceLog(entry) {
    this.voiceLogs.unshift({
      ...entry,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    });
    if (this.voiceLogs.length > 25) this.voiceLogs.pop();
    this.renderVoiceLogs();
  }

  renderVoiceLogs() {
    const logList = document.getElementById('voice-audit-log');
    if (!logList) return;

    logList.innerHTML = this.voiceLogs.map((log) => {
      if (log.type === 'executed') {
        const confPct = Math.round((log.confidence || 0.95) * 100);
        return `
          <div class="log-item log-executed">
            <div class="log-header">
              <span class="log-badge badge-accepted">✓ EXECUTED (${confPct}%)</span>
              <span class="log-time">${log.time}</span>
            </div>
            <div class="log-transcript">"${this.escapeHtml(log.transcript)}"</div>
            <div class="log-action">→ <strong>${this.escapeHtml(log.description)}</strong></div>
          </div>
        `;
      } else if (log.type === 'filtered') {
        return `
          <div class="log-item log-filtered">
            <div class="log-header">
              <span class="log-badge badge-rejected">🛡️ FILTERED OUT</span>
              <span class="log-time">${log.time}</span>
            </div>
            <div class="log-transcript">"${this.escapeHtml(log.transcript)}"</div>
            <div class="log-reason">${this.escapeHtml(log.reason)}</div>
          </div>
        `;
      } else {
        return `
          <div class="log-item log-system">
            <div class="log-header">
              <span class="log-badge badge-system">⚡ SYSTEM</span>
              <span class="log-time">${log.time}</span>
            </div>
            <div class="log-transcript">${this.escapeHtml(log.transcript)}</div>
            <div class="log-reason">${this.escapeHtml(log.reason || '')}</div>
          </div>
        `;
      }
    }).join('');
  }

  /**
   * Renders the entire Scoreboard UI for the active sport
   */
  renderAll() {
    const sport = window.SPORTS_CONFIG[this.currentSportId];

    // Team Headers & Colors
    const nameInputA = document.getElementById('team-a-name');
    const nameInputB = document.getElementById('team-b-name');
    if (nameInputA && document.activeElement !== nameInputA) nameInputA.value = this.state.teamA.name;
    if (nameInputB && document.activeElement !== nameInputB) nameInputB.value = this.state.teamB.name;

    const cardA = document.getElementById('team-card-a');
    const cardB = document.getElementById('team-card-b');
    if (cardA) cardA.style.setProperty('--team-color', this.state.teamA.color);
    if (cardB) cardB.style.setProperty('--team-color', this.state.teamB.color);

    // Scores
    const scoreAEl = document.getElementById('team-a-score');
    const scoreBEl = document.getElementById('team-b-score');
    if (scoreAEl) {
      scoreAEl.textContent = this.currentSportId === 'cricket'
        ? `${this.state.teamA.score}/${this.state.meta.wicketsA || 0}`
        : this.state.teamA.score;
    }
    if (scoreBEl) {
      scoreBEl.textContent = this.currentSportId === 'cricket'
        ? `${this.state.teamB.score}/${this.state.meta.wicketsB || 0}`
        : this.state.teamB.score;
    }

    // Quick Point Buttons per team
    this.renderQuickButtons('A', sport);
    this.renderQuickButtons('B', sport);

    // Center Clock & Period Panel
    this.updateClockDOM();

    // Sport-Specific Center/Bottom Broadcast Layout
    this.renderSportSpecificWidget();

    // Sport Voice Cheat-Sheet Chips
    this.renderCheatSheet(sport);
  }

  renderQuickButtons(teamKey, sport) {
    const container = document.getElementById(`quick-btns-${teamKey.toLowerCase()}`);
    if (!container) return;

    const ptsList = sport.quickPoints || [1, 2, 3];
    const buttonsHtml = ptsList.map((pts) => `
      <button class="btn-quick-score" data-team="${teamKey}" data-pts="${pts}" data-op="add">
        +${pts}
      </button>
    `).join('') + `
      <button class="btn-quick-score btn-quick-minus" data-team="${teamKey}" data-pts="1" data-op="subtract" title="Subtract 1">
        -1
      </button>
    `;

    container.innerHTML = buttonsHtml;
    container.querySelectorAll('.btn-quick-score').forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.team;
        const p = parseInt(btn.dataset.pts, 10);
        const op = btn.dataset.op;
        this.modifyScore(t, p, op, null, `${op === 'subtract' ? '-' : '+'}${p} ${t === 'A' ? this.state.teamA.name : this.state.teamB.name}`);
      });
    });
  }

  updateClockDOM() {
    const sport = window.SPORTS_CONFIG[this.currentSportId];
    const clockDisplay = document.getElementById('main-clock-display');
    const clockPanel = document.getElementById('clock-panel-wrapper');
    const periodLabel = document.getElementById('period-label-text');
    const periodValue = document.getElementById('period-value-text');
    const clockToggleBtn = document.getElementById('btn-clock-toggle');

    if (periodLabel) periodLabel.textContent = sport.periodLabel;
    if (periodValue) {
      if (this.currentSportId === 'baseball') {
        const arrow = this.state.meta.half === 'top' ? '▲' : '▼';
        periodValue.textContent = `${arrow} ${this.state.period}`;
      } else {
        periodValue.textContent = this.state.period;
      }
    }

    if (clockPanel) {
      clockPanel.style.display = sport.clockDirection === 'none' ? 'none' : 'flex';
    }

    if (clockDisplay) {
      let timeStr = this.formatTime(this.state.clockSeconds);
      if (this.currentSportId === 'soccer' && this.state.meta.stoppageMinutes > 0) {
        timeStr += ` +${this.state.meta.stoppageMinutes}'`;
      }
      clockDisplay.textContent = timeStr;
      clockDisplay.classList.toggle('clock-active', this.state.clockRunning);
    }

    if (clockToggleBtn) {
      clockToggleBtn.textContent = this.state.clockRunning ? '⏸ Pause' : '▶ Start';
      clockToggleBtn.classList.toggle('running', this.state.clockRunning);
    }
  }

  /**
   * Renders Authentic Sport-Specific Broadcast Widgets
   */
  renderSportSpecificWidget() {
    const container = document.getElementById('sport-specific-layout');
    if (!container) return;

    const m = this.state.meta;
    const tA = this.escapeHtml(this.state.teamA.name);
    const tB = this.escapeHtml(this.state.teamB.name);

    switch (this.currentSportId) {
      case 'basketball': {
        const bonusA = m.foulsB >= 5 ? 'BONUS' : '';
        const bonusB = m.foulsA >= 5 ? 'BONUS' : '';
        container.innerHTML = `
          <div class="sport-widget basketball-widget">
            <div class="stat-pill">
              <span class="stat-title">${tA} FOULS</span>
              <span class="stat-num">${m.foulsA}</span>
              ${bonusA ? `<span class="bonus-tag">${bonusA}</span>` : ''}
              <span class="stat-sub">TOL: ${'●'.repeat(m.timeoutsA)}${'○'.repeat(Math.max(0, 3 - m.timeoutsA))}</span>
            </div>
            <div class="shot-clock-box ${m.shotClock <= 5 ? 'shot-clock-danger' : ''}">
              <div class="shot-clock-label">SHOT CLOCK</div>
              <div class="shot-clock-digits">${m.shotClock}</div>
              <div class="shot-clock-btns">
                <button class="mini-btn" onclick="app.executeSportCommand('shotClock24', null, null, '24s Shot Clock')">24s</button>
                <button class="mini-btn" onclick="app.executeSportCommand('shotClock14', null, null, '14s Shot Clock')">14s</button>
              </div>
            </div>
            <div class="possession-box" onclick="app.executeSportCommand('setPossession', '${m.possession === 'A' ? 'B' : 'A'}', null, 'Toggle Possession')">
              <span class="poss-label">POSSESSION</span>
              <span class="poss-arrow">${m.possession === 'A' ? '◀ ' + tA : tB + ' ▶'}</span>
            </div>
            <div class="stat-pill">
              <span class="stat-title">${tB} FOULS</span>
              <span class="stat-num">${m.foulsB}</span>
              ${bonusB ? `<span class="bonus-tag">${bonusB}</span>` : ''}
              <span class="stat-sub">TOL: ${'●'.repeat(m.timeoutsB)}${'○'.repeat(Math.max(0, 3 - m.timeoutsB))}</span>
            </div>
          </div>
        `;
        break;
      }

      case 'soccer': {
        container.innerHTML = `
          <div class="sport-widget soccer-widget">
            <div class="soccer-team-stats">
              <span class="card-badge yellow-card" onclick="app.executeSportCommand('addYellow', 'A', null, 'Yellow Card ${tA}')">🟨 ${m.yellowA}</span>
              <span class="card-badge red-card" onclick="app.executeSportCommand('addRed', 'A', null, 'Red Card ${tA}')">🟥 ${m.redA}</span>
              <span class="soccer-stat" onclick="app.executeSportCommand('addShot', 'A', null, 'Shot ${tA}')">🎯 Shots: <strong>${m.shotsA}</strong></span>
              <span class="soccer-stat" onclick="app.executeSportCommand('addCorner', 'A', null, 'Corner ${tA}')">🚩 Corners: <strong>${m.cornersA}</strong></span>
            </div>
            <div class="soccer-center-pill">
              <span>STOPPAGE TIME: <strong>+${m.stoppageMinutes}'</strong></span>
              <div class="mini-btn-row">
                <button class="mini-btn" onclick="app.executeSportCommand('setStoppage', null, ${(m.stoppageMinutes || 0) + 1}, '+1m Stoppage')">+1'</button>
                <button class="mini-btn" onclick="app.executeSportCommand('setStoppage', null, 0, 'Clear Stoppage')">Clear</button>
              </div>
            </div>
            <div class="soccer-team-stats">
              <span class="card-badge yellow-card" onclick="app.executeSportCommand('addYellow', 'B', null, 'Yellow Card ${tB}')">🟨 ${m.yellowB}</span>
              <span class="card-badge red-card" onclick="app.executeSportCommand('addRed', 'B', null, 'Red Card ${tB}')">🟥 ${m.redB}</span>
              <span class="soccer-stat" onclick="app.executeSportCommand('addShot', 'B', null, 'Shot ${tB}')">🎯 Shots: <strong>${m.shotsB}</strong></span>
              <span class="soccer-stat" onclick="app.executeSportCommand('addCorner', 'B', null, 'Corner ${tB}')">🚩 Corners: <strong>${m.cornersB}</strong></span>
            </div>
          </div>
        `;
        break;
      }

      case 'football': {
        const ord = ['1ST', '2ND', '3RD', '4TH'][Math.min(3, (m.down || 1) - 1)];
        container.innerHTML = `
          <div class="sport-widget football-widget">
            <div class="stat-pill">
              <span class="stat-title">POSSESSION</span>
              <span class="stat-num" style="cursor:pointer" onclick="app.executeSportCommand('togglePossession', null, null, 'Switch Possession')">🏈 ${m.possession === 'A' ? tA : tB}</span>
              <span class="stat-sub">Timeouts: ${m.timeoutsA} | ${m.timeoutsB}</span>
            </div>
            <div class="down-distance-banner">
              <div class="down-main">${ord} &amp; ${m.distance}</div>
              <div class="ball-on-sub">BALL ON ${m.ballOn} YD LINE</div>
              <div class="mini-btn-row">
                <button class="mini-btn" onclick="app.executeSportCommand('firstDown', null, null, '1st & 10')">1st &amp; 10</button>
                <button class="mini-btn" onclick="app.executeSportCommand('nextDown', null, null, 'Next Down')">+Down</button>
                <button class="mini-btn" onclick="app.executeSportCommand('togglePossession', null, null, 'Turnover')">Turnover</button>
              </div>
            </div>
            <div class="shot-clock-box">
              <div class="shot-clock-label">PLAY CLOCK</div>
              <div class="shot-clock-digits">${m.playClock}</div>
              <div class="shot-clock-btns">
                <button class="mini-btn" onclick="app.executeSportCommand('playClock40', null, null, '40s Play Clock')">40s</button>
                <button class="mini-btn" onclick="app.executeSportCommand('playClock25', null, null, '25s Play Clock')">25s</button>
              </div>
            </div>
          </div>
        `;
        break;
      }

      case 'baseball': {
        const b1 = m.bases?.[0] ? 'active' : '';
        const b2 = m.bases?.[1] ? 'active' : '';
        const b3 = m.bases?.[2] ? 'active' : '';
        const inningsCount = Math.max(9, m.inningsA.length);
        let headers = '';
        let rowA = '';
        let rowB = '';
        for (let i = 0; i < inningsCount; i++) {
          const isCurr = (i + 1) === this.state.period ? 'curr-inning' : '';
          headers += `<th class="${isCurr}">${i + 1}</th>`;
          rowA += `<td class="${isCurr}">${m.inningsA[i] ?? 0}</td>`;
          rowB += `<td class="${isCurr}">${m.inningsB[i] ?? 0}</td>`;
        }
        container.innerHTML = `
          <div class="sport-widget baseball-widget">
            <div class="baseball-top-row">
              <div class="bso-panel">
                <div class="bso-row" onclick="app.executeSportCommand('addBall', null, null, 'Ball')">
                  <span class="bso-label">BALL</span>
                  <span class="bso-dots">${'🟢'.repeat(m.balls)}${'⚪'.repeat(Math.max(0, 3 - m.balls))}</span>
                </div>
                <div class="bso-row" onclick="app.executeSportCommand('addStrike', null, null, 'Strike')">
                  <span class="bso-label">STRIKE</span>
                  <span class="bso-dots">${'🟡'.repeat(m.strikes)}${'⚪'.repeat(Math.max(0, 2 - m.strikes))}</span>
                </div>
                <div class="bso-row" onclick="app.executeSportCommand('addOut', null, null, 'Out')">
                  <span class="bso-label">OUT</span>
                  <span class="bso-dots">${'🔴'.repeat(m.outs)}${'⚪'.repeat(Math.max(0, 2 - m.outs))}</span>
                </div>
              </div>

              <div class="baseball-diamond-wrap" title="Click bases to toggle runners">
                <div class="diamond">
                  <div class="base base-2 ${b2}" onclick="app.executeSportCommand('toggleBase2', null, null, 'Toggle 2nd Base')">2B</div>
                  <div class="base base-3 ${b3}" onclick="app.executeSportCommand('toggleBase3', null, null, 'Toggle 3rd Base')">3B</div>
                  <div class="base base-1 ${b1}" onclick="app.executeSportCommand('toggleBase1', null, null, 'Toggle 1st Base')">1B</div>
                  <div class="base-home">HP</div>
                </div>
              </div>

              <div class="baseball-quick-actions">
                <button class="mini-btn" onclick="app.executeSportCommand('addBall', null, null, 'Ball')">+Ball</button>
                <button class="mini-btn" onclick="app.executeSportCommand('addStrike', null, null, 'Strike')">+Strike</button>
                <button class="mini-btn" onclick="app.executeSportCommand('foulBall', null, null, 'Foul Ball')">Foul</button>
                <button class="mini-btn" onclick="app.executeSportCommand('addOut', null, null, 'Out')">+Out</button>
                <button class="mini-btn" onclick="app.executeSportCommand('clearBases', null, null, 'Clear Bases')">Clear Bases</button>
              </div>
            </div>

            <div class="linescore-scroll">
              <table class="linescore-table">
                <thead>
                  <tr><th>TEAM</th>${headers}<th>R</th><th>H</th><th>E</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td class="team-col">${tA}</td>${rowA}
                    <td class="rhe-col">${this.state.teamA.score}</td>
                    <td class="rhe-col" onclick="app.executeSportCommand('addHit', 'A', null, 'Hit ${tA}')">${m.hitsA}</td>
                    <td class="rhe-col" onclick="app.executeSportCommand('addError', 'A', null, 'Error ${tA}')">${m.errorsA}</td>
                  </tr>
                  <tr>
                    <td class="team-col">${tB}</td>${rowB}
                    <td class="rhe-col">${this.state.teamB.score}</td>
                    <td class="rhe-col" onclick="app.executeSportCommand('addHit', 'B', null, 'Hit ${tB}')">${m.hitsB}</td>
                    <td class="rhe-col" onclick="app.executeSportCommand('addError', 'B', null, 'Error ${tB}')">${m.errorsB}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        `;
        break;
      }

      case 'hockey': {
        const ppA = m.penaltyB > 0 ? `<span class="pp-badge">POWER PLAY (${this.formatTime(m.penaltyB)})</span>` : '';
        const ppB = m.penaltyA > 0 ? `<span class="pp-badge">POWER PLAY (${this.formatTime(m.penaltyA)})</span>` : '';
        container.innerHTML = `
          <div class="sport-widget hockey-widget">
            <div class="stat-pill">
              <span class="stat-title">${tA} SHOTS ON GOAL</span>
              <span class="stat-num" onclick="app.executeSportCommand('addShot', 'A', null, 'SOG ${tA}')">${m.shotsA}</span>
              ${ppA}
              ${m.penaltyA > 0 ? `<span class="pen-timer">PENALTY: ${this.formatTime(m.penaltyA)}</span>` : ''}
            </div>
            <div class="hockey-center-controls">
              <button class="mini-btn" onclick="app.executeSportCommand('addPenalty2', 'A', null, '2m Penalty ${tA}')">2m Pen ${tA}</button>
              <button class="mini-btn" onclick="app.executeSportCommand('clearPenalties', null, null, 'Full Strength')">Full Strength</button>
              <button class="mini-btn" onclick="app.executeSportCommand('addPenalty2', 'B', null, '2m Penalty ${tB}')">2m Pen ${tB}</button>
            </div>
            <div class="stat-pill">
              <span class="stat-title">${tB} SHOTS ON GOAL</span>
              <span class="stat-num" onclick="app.executeSportCommand('addShot', 'B', null, 'SOG ${tB}')">${m.shotsB}</span>
              ${ppB}
              ${m.penaltyB > 0 ? `<span class="pen-timer">PENALTY: ${this.formatTime(m.penaltyB)}</span>` : ''}
            </div>
          </div>
        `;
        break;
      }

      case 'tennis': {
        container.innerHTML = `
          <div class="sport-widget tennis-widget">
            <div class="tennis-matrix">
              <table class="linescore-table">
                <thead>
                  <tr>
                    <th>PLAYER / TEAM</th>
                    <th>SETS</th>
                    <th>S1</th>
                    <th>S2</th>
                    <th>S3</th>
                    <th>POINTS ${m.tiebreak ? '(TIEBREAK)' : ''}</th>
                    <th>ACES</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td class="team-col">${m.server === 'A' ? '🎾 ' : ''}${tA}</td>
                    <td class="rhe-col">${m.setsWonA}</td>
                    <td>${m.gamesA[0] || 0}</td>
                    <td>${m.gamesA[1] || 0}</td>
                    <td>${m.gamesA[2] || 0}</td>
                    <td class="rhe-col">${this.state.teamA.score}</td>
                    <td>${m.acesA}</td>
                  </tr>
                  <tr>
                    <td class="team-col">${m.server === 'B' ? '🎾 ' : ''}${tB}</td>
                    <td class="rhe-col">${m.setsWonB}</td>
                    <td>${m.gamesB[0] || 0}</td>
                    <td>${m.gamesB[1] || 0}</td>
                    <td>${m.gamesB[2] || 0}</td>
                    <td class="rhe-col">${this.state.teamB.score}</td>
                    <td>${m.acesB}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="mini-btn-row" style="margin-top:8px;">
              <button class="mini-btn" onclick="app.executeSportCommand('winGame', 'A', null, 'Game ${tA}')">+Game ${tA}</button>
              <button class="mini-btn" onclick="app.executeSportCommand('winGame', 'B', null, 'Game ${tB}')">+Game ${tB}</button>
              <button class="mini-btn" onclick="app.executeSportCommand('toggleServer', null, null, 'Switch Server')">Switch Server</button>
              <button class="mini-btn" onclick="app.executeSportCommand('toggleTiebreak', null, null, 'Toggle Tiebreak')">${m.tiebreak ? 'Standard 15/30/40' : 'Tiebreak Mode'}</button>
            </div>
          </div>
        `;
        break;
      }

      case 'volleyball':
      case 'tabletennis': {
        const maxSets = this.currentSportId === 'volleyball' ? 5 : 7;
        const icon = this.currentSportId === 'volleyball' ? '🏐' : '🏓';
        let cols = '';
        let sA = '';
        let sB = '';
        for (let i = 0; i < maxSets; i++) {
          cols += `<th>S${i + 1}</th>`;
          sA += `<td>${m.setScoresA[i] ?? 0}</td>`;
          sB += `<td>${m.setScoresB[i] ?? 0}</td>`;
        }
        container.innerHTML = `
          <div class="sport-widget volley-widget">
            <table class="linescore-table">
              <thead>
                <tr><th>TEAM</th><th>SETS WON</th>${cols}</tr>
              </thead>
              <tbody>
                <tr><td class="team-col">${m.server === 'A' ? icon + ' ' : ''}${tA}</td><td class="rhe-col">${m.setsWonA}</td>${sA}</tr>
                <tr><td class="team-col">${m.server === 'B' ? icon + ' ' : ''}${tB}</td><td class="rhe-col">${m.setsWonB}</td>${sB}</tr>
              </tbody>
            </table>
            <div class="mini-btn-row" style="margin-top:8px;">
              <button class="mini-btn" onclick="app.executeSportCommand('winSet', 'A', null, 'Set to ${tA}')">Award Set ${tA}</button>
              <button class="mini-btn" onclick="app.executeSportCommand('winSet', 'B', null, 'Set to ${tB}')">Award Set ${tB}</button>
              <button class="mini-btn" onclick="app.executeSportCommand('toggleServer', null, null, 'Switch Server')">Switch Serve</button>
            </div>
          </div>
        `;
        break;
      }

      case 'rugby': {
        container.innerHTML = `
          <div class="sport-widget rugby-widget">
            <div class="stat-pill">
              <span class="stat-title">${tA} BREAKDOWN</span>
              <span class="stat-sub">Tries: <strong>${m.triesA}</strong> | Conv: <strong>${m.conversionsA}</strong> | Pen: <strong>${m.penaltiesA}</strong> | Drop: <strong>${m.dropGoalsA}</strong></span>
              ${m.sinBinA > 0 ? `<span class="pen-timer">🟨 SIN BIN: ${this.formatTime(m.sinBinA)}</span>` : ''}
            </div>
            <div class="mini-btn-row">
              <button class="mini-btn" onclick="app.modifyScore('A', 5, 'add', 'try', 'Try ${tA}')">+5 Try ${tA}</button>
              <button class="mini-btn" onclick="app.modifyScore('A', 2, 'add', 'conversion', 'Conv ${tA}')">+2 Conv ${tA}</button>
              <button class="mini-btn" onclick="app.modifyScore('B', 5, 'add', 'try', 'Try ${tB}')">+5 Try ${tB}</button>
              <button class="mini-btn" onclick="app.modifyScore('B', 2, 'add', 'conversion', 'Conv ${tB}')">+2 Conv ${tB}</button>
            </div>
            <div class="stat-pill">
              <span class="stat-title">${tB} BREAKDOWN</span>
              <span class="stat-sub">Tries: <strong>${m.triesB}</strong> | Conv: <strong>${m.conversionsB}</strong> | Pen: <strong>${m.penaltiesB}</strong> | Drop: <strong>${m.dropGoalsB}</strong></span>
              ${m.sinBinB > 0 ? `<span class="pen-timer">🟨 SIN BIN: ${this.formatTime(m.sinBinB)}</span>` : ''}
            </div>
          </div>
        `;
        break;
      }

      case 'cricket': {
        const oversA = `${Math.floor(m.ballsA / 6)}.${m.ballsA % 6}`;
        const oversB = `${Math.floor(m.ballsB / 6)}.${m.ballsB % 6}`;
        const crrA = m.ballsA > 0 ? ((this.state.teamA.score / m.ballsA) * 6).toFixed(2) : '0.00';
        const crrB = m.ballsB > 0 ? ((this.state.teamB.score / m.ballsB) * 6).toFixed(2) : '0.00';
        const overBalls = (m.thisOver || []).map(b => `<span class="over-ball">${b}</span>`).join('') || '<span class="stat-sub">New Over</span>';
        container.innerHTML = `
          <div class="sport-widget cricket-widget">
            <div class="stat-pill">
              <span class="stat-title">${m.batting === 'A' ? '🏏 ' : ''}${tA}</span>
              <span class="stat-num">Overs: ${oversA} (CRR: ${crrA})</span>
              <span class="stat-sub">4s: ${m.foursA} | 6s: ${m.sixesA} | Extras: ${m.extrasA}</span>
            </div>
            <div class="cricket-center">
              <div class="stat-title">THIS OVER</div>
              <div class="over-balls-row">${overBalls}</div>
              <div class="mini-btn-row" style="margin-top:8px;">
                <button class="mini-btn" onclick="app.executeSportCommand('dotBall', null, null, 'Dot Ball')">• Dot</button>
                <button class="mini-btn" onclick="app.executeSportCommand('addWicket', null, null, 'Wicket')">Wicket</button>
                <button class="mini-btn" onclick="app.executeSportCommand('addExtra', null, null, 'Wide/Extra')">Wide/NB</button>
                <button class="mini-btn" onclick="app.executeSportCommand('switchBatting', null, null, 'Switch Batting')">Switch Bat</button>
              </div>
            </div>
            <div class="stat-pill">
              <span class="stat-title">${m.batting === 'B' ? '🏏 ' : ''}${tB}</span>
              <span class="stat-num">Overs: ${oversB} (CRR: ${crrB})</span>
              <span class="stat-sub">4s: ${m.foursB} | 6s: ${m.sixesB} | Extras: ${m.extrasB}</span>
            </div>
          </div>
        `;
        break;
      }

      case 'combat': {
        container.innerHTML = `
          <div class="sport-widget combat-widget">
            <div class="stat-pill">
              <span class="stat-title">${tA} STATS</span>
              <span class="stat-sub">TD: <strong>${m.takedownsA}</strong> | Esc: <strong>${m.escapesA}</strong> | Rev: <strong>${m.reversalsA}</strong> | Warn: <strong>${m.warningsA}</strong></span>
              <span class="stat-sub">Riding/Control: <strong>${this.formatTime(m.controlA)}</strong></span>
            </div>
            <div class="mini-btn-row">
              <button class="mini-btn ${m.activeControl === 'A' ? 'active' : ''}" onclick="app.executeSportCommand('setControl', 'A', null, 'Control ${tA}')">Control ${tA}</button>
              <button class="mini-btn" onclick="app.executeSportCommand('clearControl', null, null, 'Neutral')">Neutral</button>
              <button class="mini-btn ${m.activeControl === 'B' ? 'active' : ''}" onclick="app.executeSportCommand('setControl', 'B', null, 'Control ${tB}')">Control ${tB}</button>
            </div>
            <div class="stat-pill">
              <span class="stat-title">${tB} STATS</span>
              <span class="stat-sub">TD: <strong>${m.takedownsB}</strong> | Esc: <strong>${m.escapesB}</strong> | Rev: <strong>${m.reversalsB}</strong> | Warn: <strong>${m.warningsB}</strong></span>
              <span class="stat-sub">Riding/Control: <strong>${this.formatTime(m.controlB)}</strong></span>
            </div>
          </div>
        `;
        break;
      }

      case 'arcade': {
        const pctA = Math.min(100, Math.round((this.state.teamA.score / (m.targetScore || 21)) * 100));
        const pctB = Math.min(100, Math.round((this.state.teamB.score / (m.targetScore || 21)) * 100));
        container.innerHTML = `
          <div class="sport-widget arcade-widget">
            <div class="stat-pill">
              <span class="stat-title">${tA} PROGRESS TO ${m.targetScore}</span>
              <div class="progress-bar"><div class="progress-fill" style="width:${pctA}%;background:${this.state.teamA.color}"></div></div>
              <span class="stat-sub">This Round: +${m.roundDeltaA} | Streak: 🔥 ${m.streakA}</span>
            </div>
            <div class="mini-btn-row">
              <button class="mini-btn" onclick="app.executeSportCommand('setTargetScore', null, 21, 'Play to 21')">Target 21</button>
              <button class="mini-btn" onclick="app.executeSportCommand('setTargetScore', null, 50, 'Play to 50')">Target 50</button>
              <button class="mini-btn" onclick="app.executeSportCommand('setTargetScore', null, 100, 'Play to 100')">Target 100</button>
              <button class="mini-btn" onclick="app.executeSportCommand('setTargetScore', null, 501, 'Play to 501')">Target 501</button>
            </div>
            <div class="stat-pill">
              <span class="stat-title">${tB} PROGRESS TO ${m.targetScore}</span>
              <div class="progress-bar"><div class="progress-fill" style="width:${pctB}%;background:${this.state.teamB.color}"></div></div>
              <span class="stat-sub">This Round: +${m.roundDeltaB} | Streak: 🔥 ${m.streakB}</span>
            </div>
          </div>
        `;
        break;
      }
    }
  }

  /**
   * Renders clickable Voice Command Cheat-Sheet chips for the current sport
   */
  renderCheatSheet(sport) {
    const container = document.getElementById('voice-sample-chips');
    if (!container) return;

    const samples = [
      ...(sport.sampleCommands || []),
      `"Add 17 ${sport.unitPlural} to ${this.state.teamA.name}"`,
      `"Subtract 2 ${sport.unitPlural} from ${this.state.teamB.name}"`,
      '"Undo"'
    ];

    container.innerHTML = samples.map((cmd) => {
      const raw = cmd.replace(/^"|"$/g, '');
      return `<button class="sample-chip" data-cmd="${this.escapeHtml(raw)}" title="Click to test this voice command">${this.escapeHtml(cmd)}</button>`;
    }).join('');

    container.querySelectorAll('.sample-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const text = chip.dataset.cmd;
        this.processFinalSpeechAlternatives([{ transcript: text, confidence: 0.98 }]);
      });
    });
  }

  triggerScorePulse(teamKey, deltaText) {
    const scoreEl = document.getElementById(`team-${teamKey.toLowerCase()}-score`);
    const badgeEl = document.getElementById(`team-${teamKey.toLowerCase()}-delta`);
    if (scoreEl) {
      scoreEl.classList.remove('score-bump');
      void scoreEl.offsetWidth;
      scoreEl.classList.add('score-bump');
    }
    if (badgeEl) {
      badgeEl.textContent = deltaText;
      badgeEl.classList.remove('show-delta');
      void badgeEl.offsetWidth;
      badgeEl.classList.add('show-delta');
    }
  }

  showToast(message, type = 'info', showUndo = false) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-msg">${this.escapeHtml(message)}</span>
      ${showUndo ? `<button class="toast-undo-btn">UNDO</button>` : ''}
    `;

    if (showUndo) {
      toast.querySelector('.toast-undo-btn').addEventListener('click', () => {
        this.undo();
        toast.remove();
      });
    }

    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('toast-hide');
      setTimeout(() => toast.remove(), 300);
    }, 3800);
  }

  escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Wire up DOM Event Listeners
   */
  setupEventListeners() {
    // Mic Toggle
    const micBtn = document.getElementById('btn-mic-toggle');
    if (micBtn) micBtn.addEventListener('click', () => this.toggleListening());

    // Team Names
    const nameA = document.getElementById('team-a-name');
    const nameB = document.getElementById('team-b-name');
    if (nameA) {
      nameA.addEventListener('input', (e) => {
        this.state.teamA.name = e.target.value.trim() || 'HOME';
        this.renderSportSpecificWidget();
        this.renderCheatSheet(window.SPORTS_CONFIG[this.currentSportId]);
      });
    }
    if (nameB) {
      nameB.addEventListener('input', (e) => {
        this.state.teamB.name = e.target.value.trim() || 'AWAY';
        this.renderSportSpecificWidget();
        this.renderCheatSheet(window.SPORTS_CONFIG[this.currentSportId]);
      });
    }

    // Team Colors
    const colorMap = {
      '#ef4444': 'red',
      '#3b82f6': 'blue',
      '#10b981': 'green',
      '#eab308': 'yellow',
      '#a855f7': 'purple',
      '#f97316': 'orange'
    };

    document.querySelectorAll('.color-swatch-a').forEach((sw) => {
      sw.addEventListener('click', () => {
        this.state.teamA.color = sw.dataset.color;
        this.state.teamA.colorName = colorMap[sw.dataset.color] || 'red';
        this.renderAll();
      });
    });

    document.querySelectorAll('.color-swatch-b').forEach((sw) => {
      sw.addEventListener('click', () => {
        this.state.teamB.color = sw.dataset.color;
        this.state.teamB.colorName = colorMap[sw.dataset.color] || 'blue';
        this.renderAll();
      });
    });

    // Clock Controls
    document.getElementById('btn-clock-toggle')?.addEventListener('click', () => {
      this.state.clockRunning = !this.state.clockRunning;
      this.updateClockDOM();
    });
    document.getElementById('btn-clock-reset')?.addEventListener('click', () => {
      this.executeGlobalCommand('resetClock');
    });
    document.getElementById('btn-period-prev')?.addEventListener('click', () => {
      this.executeGlobalCommand('prevPeriod');
    });
    document.getElementById('btn-period-next')?.addEventListener('click', () => {
      this.executeGlobalCommand('nextPeriod');
    });

    // Global Action Bar
    document.getElementById('btn-undo')?.addEventListener('click', () => this.undo());
    document.getElementById('btn-redo')?.addEventListener('click', () => this.redo());
    document.getElementById('btn-swap')?.addEventListener('click', () => this.executeGlobalCommand('swapTeams'));
    document.getElementById('btn-reset-match')?.addEventListener('click', () => this.executeGlobalCommand('resetMatch'));
    document.getElementById('btn-fullscreen')?.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    // Custom Arbitrary Point Input per Team
    document.getElementById('btn-custom-add-a')?.addEventListener('click', () => {
      const inp = document.getElementById('custom-pts-a');
      const val = parseInt(inp?.value || '0', 10);
      if (val > 0) {
        this.modifyScore('A', val, 'add');
        inp.value = '';
      }
    });
    document.getElementById('btn-custom-add-b')?.addEventListener('click', () => {
      const inp = document.getElementById('custom-pts-b');
      const val = parseInt(inp?.value || '0', 10);
      if (val > 0) {
        this.modifyScore('B', val, 'add');
        inp.value = '';
      }
    });

    // Voice Command Simulator Form
    const simForm = document.getElementById('voice-sim-form');
    if (simForm) {
      simForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('voice-sim-input');
        if (input && input.value.trim()) {
          this.processFinalSpeechAlternatives([{ transcript: input.value.trim(), confidence: 0.96 }]);
          input.value = '';
        }
      });
    }

    // Chatter Filter Test Button (Demonstrates how casual speech is blocked)
    document.getElementById('btn-test-chatter')?.addEventListener('click', () => {
      const chatterSamples = [
        'I think Home needs 3 points to win this game',
        'What if Away gets 10 points right now?',
        'Did Home just score 2 points earlier?',
        'Add 5 points to Home wait no add 3 points to Away'
      ];
      const pick = chatterSamples[Math.floor(Math.random() * chatterSamples.length)];
      this.processFinalSpeechAlternatives([{ transcript: pick, confidence: 0.95 }]);
    });

    // AI Filter Settings Controls
    const wakeToggle = document.getElementById('toggle-wake-word');
    if (wakeToggle) {
      wakeToggle.checked = this.voiceSettings.requireWakeWord;
      wakeToggle.addEventListener('change', (e) => {
        this.voiceSettings.requireWakeWord = e.target.checked;
        this.saveSettings();
        this.updateMicUI(this.voiceSettings.isListening);
      });
    }

    const ttsToggle = document.getElementById('toggle-tts');
    if (ttsToggle) {
      ttsToggle.checked = this.voiceSettings.ttsFeedback;
      ttsToggle.addEventListener('change', (e) => {
        this.voiceSettings.ttsFeedback = e.target.checked;
        this.saveSettings();
      });
    }

    const sfxToggle = document.getElementById('toggle-sfx');
    if (sfxToggle) {
      sfxToggle.checked = this.voiceSettings.soundEffects;
      sfxToggle.addEventListener('change', (e) => {
        this.voiceSettings.soundEffects = e.target.checked;
        this.saveSettings();
      });
    }

    const confSlider = document.getElementById('slider-confidence');
    const confLabel = document.getElementById('label-confidence-val');
    if (confSlider) {
      confSlider.value = Math.round(this.voiceSettings.confidenceThreshold * 100);
      if (confLabel) confLabel.textContent = `${confSlider.value}%`;
      confSlider.addEventListener('input', (e) => {
        const pct = parseInt(e.target.value, 10);
        this.voiceSettings.confidenceThreshold = pct / 100;
        if (confLabel) confLabel.textContent = `${pct}%`;
        this.saveSettings();
      });
    }

    const apiKeyInput = document.getElementById('input-ai-key');
    const aiProviderSelect = document.getElementById('select-ai-provider');
    if (apiKeyInput) {
      apiKeyInput.value = this.voiceSettings.apiKey;
      apiKeyInput.addEventListener('change', (e) => {
        this.voiceSettings.apiKey = e.target.value.trim();
        this.saveSettings();
        this.showToast(this.voiceSettings.apiKey ? 'Cloud AI Verification Key Saved' : 'Using Local Zero-Cost AI Filter', 'info');
      });
    }
    if (aiProviderSelect) {
      aiProviderSelect.value = this.voiceSettings.aiProvider;
      aiProviderSelect.addEventListener('change', (e) => {
        this.voiceSettings.aiProvider = e.target.value;
        this.saveSettings();
      });
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new VoiceScoreboardApp();
});
