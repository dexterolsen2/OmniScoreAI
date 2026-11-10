/**
 * Sports Configuration & Rules Engine
 * Defines layouts, scoring vocabularies, default state, and sport-specific handlers for 12 sports.
 */

window.SPORTS_CONFIG = {
  basketball: {
    id: 'basketball',
    name: 'Basketball',
    icon: '🏀',
    unitSingular: 'point',
    unitPlural: 'points',
    themeColor: '#f97316',
    accentGlow: 'rgba(249, 115, 22, 0.35)',
    periodLabel: 'QUARTER',
    maxPeriods: 4,
    defaultClockSeconds: 12 * 60,
    clockDirection: 'down',
    hasShotClock: true,
    defaultShotClock: 24,
    quickPoints: [1, 2, 3],
    defaultMeta: () => ({
      shotClock: 24,
      shotClockRunning: false,
      possession: 'A',
      foulsA: 0,
      foulsB: 0,
      timeoutsA: 3,
      timeoutsB: 3,
      quartersA: [0, 0, 0, 0],
      quartersB: [0, 0, 0, 0]
    }),
    voiceKeywords: [
      { phrases: ['three pointer', '3 pointer', 'three point shot', 'from downtown', 'trey', 'triple'], points: 3, label: '3-Pointer (+3)' },
      { phrases: ['two pointer', '2 pointer', 'field goal', 'layup', 'dunk', 'slam dunk', 'jumper', 'bank shot', 'tip in', 'bucket', 'basket'], points: 2, label: 'Field Goal (+2)' },
      { phrases: ['free throw', 'foul shot', 'one point shot', 'and one'], points: 1, label: 'Free Throw (+1)' }
    ],
    sportCommands: [
      { phrases: ['reset shot clock', 'shot clock 24', 'full shot clock', 'twenty four on the shot clock'], action: 'shotClock24', desc: 'Reset shot clock to 24s' },
      { phrases: ['shot clock 14', 'offensive rebound clock', 'fourteen on the shot clock'], action: 'shotClock14', desc: 'Set shot clock to 14s' },
      { phrases: ['foul on', 'team foul', 'personal foul'], action: 'addFoul', teamRequired: true, desc: 'Add team foul to [Team]' },
      { phrases: ['timeout', 'time out'], action: 'useTimeout', teamRequired: true, desc: 'Call timeout for [Team]' },
      { phrases: ['possession', 'ball to', 'arrow to'], action: 'setPossession', teamRequired: true, desc: 'Set possession arrow to [Team]' }
    ],
    sampleCommands: [
      '"Add 3 points to Home"',
      '"Give Away 14 points"',
      '"Three pointer for Lakers"',
      '"Free throw Home"',
      '"Foul on Away"',
      '"Reset shot clock"'
    ]
  },

  soccer: {
    id: 'soccer',
    name: 'Soccer / Football',
    icon: '⚽',
    unitSingular: 'goal',
    unitPlural: 'goals',
    themeColor: '#10b981',
    accentGlow: 'rgba(16, 185, 129, 0.35)',
    periodLabel: 'HALF',
    maxPeriods: 2,
    defaultClockSeconds: 0,
    clockDirection: 'up',
    quickPoints: [1],
    defaultMeta: () => ({
      stoppageMinutes: 0,
      yellowA: 0,
      yellowB: 0,
      redA: 0,
      redB: 0,
      shotsA: 0,
      shotsB: 0,
      cornersA: 0,
      cornersB: 0
    }),
    voiceKeywords: [
      { phrases: ['hat trick', 'hat-trick'], points: 3, label: 'Hat Trick (+3)' },
      { phrases: ['brace'], points: 2, label: 'Brace (+2)' },
      { phrases: ['goal', 'penalty goal', 'free kick goal', 'header goal', 'own goal', 'scores', 'scored'], points: 1, label: 'Goal (+1)' }
    ],
    sportCommands: [
      { phrases: ['yellow card', 'booking for', 'caution for'], action: 'addYellow', teamRequired: true, desc: 'Give yellow card to [Team]' },
      { phrases: ['red card', 'sent off', 'ejection for'], action: 'addRed', teamRequired: true, desc: 'Give red card to [Team]' },
      { phrases: ['corner kick', 'corner for'], action: 'addCorner', teamRequired: true, desc: 'Add corner kick for [Team]' },
      { phrases: ['shot on target', 'shot on goal', 'shot for'], action: 'addShot', teamRequired: true, desc: 'Add shot on target for [Team]' },
      { phrases: ['stoppage time', 'added time', 'injury time'], action: 'setStoppage', numeric: true, desc: 'Set stoppage time (+X min)' }
    ],
    sampleCommands: [
      '"Goal for Home"',
      '"Add 2 goals to Away"',
      '"Yellow card on Away"',
      '"Corner kick for Home"',
      '"4 minutes stoppage time"'
    ]
  },

  football: {
    id: 'football',
    name: 'American Football',
    icon: '🏈',
    unitSingular: 'point',
    unitPlural: 'points',
    themeColor: '#eab308',
    accentGlow: 'rgba(234, 179, 8, 0.35)',
    periodLabel: 'QUARTER',
    maxPeriods: 4,
    defaultClockSeconds: 15 * 60,
    clockDirection: 'down',
    hasShotClock: true,
    defaultShotClock: 40,
    quickPoints: [1, 2, 3, 6, 7],
    defaultMeta: () => ({
      down: 1,
      distance: 10,
      ballOn: 25,
      possession: 'A',
      playClock: 40,
      timeoutsA: 3,
      timeoutsB: 3,
      quartersA: [0, 0, 0, 0],
      quartersB: [0, 0, 0, 0]
    }),
    voiceKeywords: [
      { phrases: ['touchdown with extra point', 'touchdown and pat', 'seven points'], points: 7, label: 'TD + PAT (+7)' },
      { phrases: ['touchdown', 'td', 'pick six', 'six points'], points: 6, label: 'Touchdown (+6)' },
      { phrases: ['field goal', 'three points'], points: 3, label: 'Field Goal (+3)' },
      { phrases: ['two point conversion', '2 point conversion', 'safety'], points: 2, label: 'Safety / 2PT (+2)' },
      { phrases: ['extra point', 'pat', 'point after', 'point after touchdown'], points: 1, label: 'Extra Point (+1)' }
    ],
    sportCommands: [
      { phrases: ['first down', '1st down', 'first and ten'], action: 'firstDown', desc: 'Reset to 1st & 10' },
      { phrases: ['next down', 'advance down'], action: 'nextDown', desc: 'Advance to next down' },
      { phrases: ['turnover', 'change possession', 'interception', 'fumble recovery'], action: 'togglePossession', desc: 'Switch ball possession' },
      { phrases: ['reset play clock', 'play clock 40'], action: 'playClock40', desc: 'Reset play clock to 40s' },
      { phrases: ['play clock 25'], action: 'playClock25', desc: 'Set play clock to 25s' },
      { phrases: ['timeout', 'time out'], action: 'useTimeout', teamRequired: true, desc: 'Use timeout for [Team]' }
    ],
    sampleCommands: [
      '"Touchdown Home"',
      '"Field goal for Away"',
      '"Extra point Home"',
      '"Add 14 points to Away"',
      '"First down"',
      '"Turnover"'
    ]
  },

  baseball: {
    id: 'baseball',
    name: 'Baseball / Softball',
    icon: '⚾',
    unitSingular: 'run',
    unitPlural: 'runs',
    themeColor: '#ef4444',
    accentGlow: 'rgba(239, 68, 68, 0.35)',
    periodLabel: 'INNING',
    maxPeriods: 9,
    defaultClockSeconds: 0,
    clockDirection: 'none',
    quickPoints: [1, 2, 3, 4],
    defaultMeta: () => ({
      half: 'top', // 'top' or 'bottom'
      balls: 0,
      strikes: 0,
      outs: 0,
      hitsA: 0,
      hitsB: 0,
      errorsA: 0,
      errorsB: 0,
      bases: [false, false, false], // 1st, 2nd, 3rd
      inningsA: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      inningsB: [0, 0, 0, 0, 0, 0, 0, 0, 0]
    }),
    voiceKeywords: [
      { phrases: ['grand slam', 'four run homer', '4 run home run'], points: 4, label: 'Grand Slam (+4)' },
      { phrases: ['three run homer', '3 run home run', 'three run home run'], points: 3, label: '3-Run HR (+3)' },
      { phrases: ['two run homer', '2 run home run', 'two run home run'], points: 2, label: '2-Run HR (+2)' },
      { phrases: ['home run', 'solo homer', 'solo home run', 'run', 'rbi', 'scores a run'], points: 1, label: 'Run (+1)' }
    ],
    sportCommands: [
      { phrases: ['strike', 'called strike', 'swinging strike'], action: 'addStrike', desc: 'Add strike (3 = Out)' },
      { phrases: ['ball', 'ball outside', 'ball inside'], action: 'addBall', desc: 'Add ball (4 = Walk)' },
      { phrases: ['foul ball', 'foul'], action: 'foulBall', desc: 'Foul ball (adds strike up to 2)' },
      { phrases: ['out', 'batter out', 'fly out', 'ground out', 'strikeout'], action: 'addOut', desc: 'Record an out (3 switches side)' },
      { phrases: ['reset count', 'new batter', 'clear count'], action: 'resetCount', desc: 'Reset Balls & Strikes to 0-0' },
      { phrases: ['hit for', 'base hit'], action: 'addHit', teamRequired: true, desc: 'Add Hit (H) for [Team]' },
      { phrases: ['error on'], action: 'addError', teamRequired: true, desc: 'Add Error (E) on [Team]' },
      { phrases: ['runner on first', 'man on first', 'first base'], action: 'toggleBase1', desc: 'Toggle runner on 1st base' },
      { phrases: ['runner on second', 'man on second', 'second base'], action: 'toggleBase2', desc: 'Toggle runner on 2nd base' },
      { phrases: ['runner on third', 'man on third', 'third base'], action: 'toggleBase3', desc: 'Toggle runner on 3rd base' },
      { phrases: ['bases loaded', 'load the bases'], action: 'basesLoaded', desc: 'Put runners on 1st, 2nd, and 3rd' },
      { phrases: ['clear bases', 'bases empty'], action: 'clearBases', desc: 'Clear all base runners' }
    ],
    sampleCommands: [
      '"Add 3 runs to Home"',
      '"Grand slam for Away"',
      '"Strike"',
      '"Ball"',
      '"Out"',
      '"Bases loaded"',
      '"Hit for Home"'
    ]
  },

  hockey: {
    id: 'hockey',
    name: 'Ice Hockey',
    icon: '🏒',
    unitSingular: 'goal',
    unitPlural: 'goals',
    themeColor: '#38bdf8',
    accentGlow: 'rgba(56, 189, 248, 0.35)',
    periodLabel: 'PERIOD',
    maxPeriods: 3,
    defaultClockSeconds: 20 * 60,
    clockDirection: 'down',
    quickPoints: [1],
    defaultMeta: () => ({
      shotsA: 0,
      shotsB: 0,
      penaltyA: 0, // seconds remaining on minor penalty
      penaltyB: 0,
      emptyNetA: false,
      emptyNetB: false,
      periodsA: [0, 0, 0],
      periodsB: [0, 0, 0]
    }),
    voiceKeywords: [
      { phrases: ['hat trick', 'hat-trick'], points: 3, label: 'Hat Trick (+3)' },
      { phrases: ['goal', 'power play goal', 'shorthanded goal', 'empty net goal', 'scores'], points: 1, label: 'Goal (+1)' }
    ],
    sportCommands: [
      { phrases: ['shot on goal', 'shot for'], action: 'addShot', teamRequired: true, desc: 'Add Shot on Goal for [Team]' },
      { phrases: ['two minute penalty', 'minor penalty', 'power play against', 'penalty on'], action: 'addPenalty2', teamRequired: true, desc: 'Start 2:00 penalty on [Team]' },
      { phrases: ['five minute major', 'major penalty on'], action: 'addPenalty5', teamRequired: true, desc: 'Start 5:00 major penalty on [Team]' },
      { phrases: ['clear penalty', 'end power play', 'full strength'], action: 'clearPenalties', desc: 'Clear active penalties' },
      { phrases: ['empty net'], action: 'toggleEmptyNet', teamRequired: true, desc: 'Toggle Empty Net for [Team]' }
    ],
    sampleCommands: [
      '"Goal for Home"',
      '"Add 2 goals to Away"',
      '"Shot on goal Home"',
      '"Minor penalty on Away"',
      '"Clear penalty"'
    ]
  },

  tennis: {
    id: 'tennis',
    name: 'Tennis / Padel',
    icon: '🎾',
    unitSingular: 'point',
    unitPlural: 'points',
    themeColor: '#84cc16',
    accentGlow: 'rgba(132, 204, 22, 0.35)',
    periodLabel: 'SET',
    maxPeriods: 3,
    defaultClockSeconds: 0,
    clockDirection: 'up',
    quickPoints: [1],
    defaultMeta: () => ({
      setsWonA: 0,
      setsWonB: 0,
      gamesA: [0, 0, 0],
      gamesB: [0, 0, 0],
      server: 'A',
      tiebreak: false,
      acesA: 0,
      acesB: 0,
      doubleFaultsA: 0,
      doubleFaultsB: 0,
      tennisScoring: true // Uses 0, 15, 30, 40, AD when adding 1 point
    }),
    voiceKeywords: [
      { phrases: ['ace', 'service winner'], points: 1, metaAction: 'ace', label: 'Ace (+1 pt)' },
      { phrases: ['winner', 'forehand winner', 'backhand winner', 'volley winner', 'point', 'rally'], points: 1, label: 'Point (+1 pt)' }
    ],
    sportCommands: [
      { phrases: ['game to', 'win game', 'award game to'], action: 'winGame', teamRequired: true, desc: 'Award current game to [Team]' },
      { phrases: ['set to', 'win set', 'award set to'], action: 'winSet', teamRequired: true, desc: 'Award current set to [Team]' },
      { phrases: ['double fault'], action: 'doubleFault', teamRequired: true, desc: 'Double fault on [Team] (point to opponent)' },
      { phrases: ['change server', 'switch server', 'service change'], action: 'toggleServer', desc: 'Switch active server' },
      { phrases: ['tiebreak mode', 'toggle tiebreak'], action: 'toggleTiebreak', desc: 'Toggle Tiebreak numeric scoring' }
    ],
    sampleCommands: [
      '"Point for Home"',
      '"Ace for Away"',
      '"Game to Home"',
      '"Double fault on Away"',
      '"Add 3 points to Home"'
    ]
  },

  volleyball: {
    id: 'volleyball',
    name: 'Volleyball',
    icon: '🏐',
    unitSingular: 'point',
    unitPlural: 'points',
    themeColor: '#f43f5e',
    accentGlow: 'rgba(244, 63, 94, 0.35)',
    periodLabel: 'SET',
    maxPeriods: 5,
    defaultClockSeconds: 0,
    clockDirection: 'none',
    quickPoints: [1],
    defaultMeta: () => ({
      setsWonA: 0,
      setsWonB: 0,
      setScoresA: [0, 0, 0, 0, 0],
      setScoresB: [0, 0, 0, 0, 0],
      server: 'A',
      timeoutsA: 2,
      timeoutsB: 2,
      acesA: 0,
      acesB: 0,
      blocksA: 0,
      blocksB: 0
    }),
    voiceKeywords: [
      { phrases: ['service ace', 'ace'], points: 1, metaAction: 'ace', label: 'Service Ace (+1)' },
      { phrases: ['block point', 'monster block', 'stuff block'], points: 1, metaAction: 'block', label: 'Block (+1)' },
      { phrases: ['kill', 'spike', 'point', 'sideout', 'side out', 'rally'], points: 1, label: 'Rally Point (+1)' }
    ],
    sportCommands: [
      { phrases: ['win set', 'set to', 'award set to'], action: 'winSet', teamRequired: true, desc: 'Award current set to [Team]' },
      { phrases: ['change server', 'switch server'], action: 'toggleServer', desc: 'Switch serving team' },
      { phrases: ['timeout', 'time out'], action: 'useTimeout', teamRequired: true, desc: 'Call timeout for [Team]' }
    ],
    sampleCommands: [
      '"Point for Home"',
      '"Ace for Away"',
      '"Block point Home"',
      '"Add 5 points to Away"',
      '"Set to Home"'
    ]
  },

  tabletennis: {
    id: 'tabletennis',
    name: 'Table Tennis / Ping Pong',
    icon: '🏓',
    unitSingular: 'point',
    unitPlural: 'points',
    themeColor: '#06b6d4',
    accentGlow: 'rgba(6, 182, 212, 0.35)',
    periodLabel: 'GAME',
    maxPeriods: 7,
    defaultClockSeconds: 0,
    clockDirection: 'none',
    quickPoints: [1],
    defaultMeta: () => ({
      setsWonA: 0,
      setsWonB: 0,
      setScoresA: [0, 0, 0, 0, 0, 0, 0],
      setScoresB: [0, 0, 0, 0, 0, 0, 0],
      server: 'A',
      initialServer: 'A',
      targetPoints: 11,
      timeoutsA: 1,
      timeoutsB: 1
    }),
    voiceKeywords: [
      { phrases: ['point', 'smash', 'ace', 'edge ball', 'net cord point', 'winner'], points: 1, label: 'Point (+1)' }
    ],
    sportCommands: [
      { phrases: ['game to', 'win game', 'award game to'], action: 'winSet', teamRequired: true, desc: 'Award game to [Team]' },
      { phrases: ['change server', 'switch server'], action: 'toggleServer', desc: 'Switch active server' },
      { phrases: ['play to 21', 'twenty one point game'], action: 'target21', desc: 'Set game target to 21 pts' },
      { phrases: ['play to 11', 'eleven point game'], action: 'target11', desc: 'Set game target to 11 pts' }
    ],
    sampleCommands: [
      '"Point Home"',
      '"Add 4 points to Away"',
      '"Game to Home"',
      '"Switch server"',
      '"Play to 21"'
    ]
  },

  rugby: {
    id: 'rugby',
    name: 'Rugby Union / League',
    icon: '🏉',
    unitSingular: 'point',
    unitPlural: 'points',
    themeColor: '#14b8a6',
    accentGlow: 'rgba(20, 184, 166, 0.35)',
    periodLabel: 'HALF',
    maxPeriods: 2,
    defaultClockSeconds: 40 * 60,
    clockDirection: 'up',
    quickPoints: [2, 3, 5, 7],
    defaultMeta: () => ({
      triesA: 0,
      triesB: 0,
      conversionsA: 0,
      conversionsB: 0,
      penaltiesA: 0,
      penaltiesB: 0,
      dropGoalsA: 0,
      dropGoalsB: 0,
      sinBinA: 0,
      sinBinB: 0
    }),
    voiceKeywords: [
      { phrases: ['converted try', 'penalty try', 'seven points'], points: 7, metaAction: 'convertedTry', label: 'Converted Try (+7)' },
      { phrases: ['try', 'five points'], points: 5, metaAction: 'try', label: 'Try (+5)' },
      { phrases: ['penalty goal', 'penalty kick'], points: 3, metaAction: 'penalty', label: 'Penalty Goal (+3)' },
      { phrases: ['drop goal', 'drop kick'], points: 3, metaAction: 'dropGoal', label: 'Drop Goal (+3)' },
      { phrases: ['conversion'], points: 2, metaAction: 'conversion', label: 'Conversion (+2)' }
    ],
    sportCommands: [
      { phrases: ['sin bin', 'yellow card'], action: 'sinBin', teamRequired: true, desc: 'Start 10:00 Sin Bin for [Team]' },
      { phrases: ['clear sin bin'], action: 'clearSinBin', desc: 'Clear Sin Bin timers' }
    ],
    sampleCommands: [
      '"Try for Home"',
      '"Conversion Home"',
      '"Penalty goal Away"',
      '"Drop goal Home"',
      '"Add 5 points to Away"'
    ]
  },

  cricket: {
    id: 'cricket',
    name: 'Cricket (T20 / ODI)',
    icon: '🏏',
    unitSingular: 'run',
    unitPlural: 'runs',
    themeColor: '#6366f1',
    accentGlow: 'rgba(99, 102, 241, 0.35)',
    periodLabel: 'INNINGS',
    maxPeriods: 2,
    defaultClockSeconds: 0,
    clockDirection: 'none',
    quickPoints: [1, 2, 3, 4, 6],
    defaultMeta: () => ({
      batting: 'A',
      wicketsA: 0,
      wicketsB: 0,
      ballsA: 0,
      ballsB: 0,
      foursA: 0,
      foursB: 0,
      sixesA: 0,
      sixesB: 0,
      extrasA: 0,
      extrasB: 0,
      thisOver: []
    }),
    voiceKeywords: [
      { phrases: ['six', 'sixer', 'maximum', 'six runs'], points: 6, metaAction: 'six', label: 'Six (+6 runs)' },
      { phrases: ['four', 'boundary', 'four runs'], points: 4, metaAction: 'four', label: 'Four (+4 runs)' },
      { phrases: ['three runs', 'triple'], points: 3, metaAction: 'ballRun', label: 'Three Runs (+3)' },
      { phrases: ['two runs', 'double', 'couple of runs'], points: 2, metaAction: 'ballRun', label: 'Two Runs (+2)' },
      { phrases: ['single', 'one run', 'run'], points: 1, metaAction: 'ballRun', label: 'Single (+1)' }
    ],
    sportCommands: [
      { phrases: ['wicket', 'out', 'bowled', 'caught out', 'lbw', 'run out'], action: 'addWicket', desc: 'Record a Wicket (+1 ball)' },
      { phrases: ['dot ball', 'no run'], action: 'dotBall', desc: 'Record a dot ball (0 runs, +1 ball)' },
      { phrases: ['wide ball', 'wide', 'no ball'], action: 'addExtra', desc: 'Add 1 Extra run (no legal ball)' },
      { phrases: ['switch innings', 'change batting'], action: 'switchBatting', desc: 'Switch batting team' }
    ],
    sampleCommands: [
      '"Six for Home"',
      '"Four for Home"',
      '"Add 12 runs to Away"',
      '"Wicket"',
      '"Dot ball"',
      '"Wide ball"'
    ]
  },

  combat: {
    id: 'combat',
    name: 'Wrestling / BJJ / Combat',
    icon: '🥋',
    unitSingular: 'point',
    unitPlural: 'points',
    themeColor: '#ec4899',
    accentGlow: 'rgba(236, 72, 153, 0.35)',
    periodLabel: 'ROUND',
    maxPeriods: 3,
    defaultClockSeconds: 3 * 60,
    clockDirection: 'down',
    quickPoints: [1, 2, 3, 4],
    defaultMeta: () => ({
      takedownsA: 0,
      takedownsB: 0,
      escapesA: 0,
      escapesB: 0,
      reversalsA: 0,
      reversalsB: 0,
      warningsA: 0,
      warningsB: 0,
      controlA: 0,
      controlB: 0,
      activeControl: null // 'A', 'B', or null
    }),
    voiceKeywords: [
      { phrases: ['near fall four', '4 point near fall', 'back mount', 'mount'], points: 4, label: 'Near Fall / Mount (+4)' },
      { phrases: ['takedown', 'take down', 'near fall three', 'guard pass', 'sweep'], points: 3, metaAction: 'takedown', label: 'Takedown / Pass (+3)' },
      { phrases: ['reversal', 'two point takedown', 'near fall two', 'knee on belly'], points: 2, metaAction: 'reversal', label: 'Reversal / 2PT (+2)' },
      { phrases: ['escape', 'penalty point', 'technical point'], points: 1, metaAction: 'escape', label: 'Escape (+1)' }
    ],
    sportCommands: [
      { phrases: ['stalling on', 'warning on', 'caution on'], action: 'addWarning', teamRequired: true, desc: 'Add warning/stalling on [Team]' },
      { phrases: ['riding time', 'control time'], action: 'setControl', teamRequired: true, desc: 'Start riding/control clock for [Team]' },
      { phrases: ['neutral', 'stop riding time'], action: 'clearControl', desc: 'Stop riding/control clock (neutral)' }
    ],
    sampleCommands: [
      '"Takedown Home"',
      '"Escape Away"',
      '"Reversal Home"',
      '"Add 4 points to Home"',
      '"Warning on Away"'
    ]
  },

  arcade: {
    id: 'arcade',
    name: 'Universal / Backyard / Cornhole / Darts',
    icon: '🎯',
    unitSingular: 'point',
    unitPlural: 'points',
    themeColor: '#a855f7',
    accentGlow: 'rgba(168, 85, 247, 0.35)',
    periodLabel: 'ROUND',
    maxPeriods: 99,
    defaultClockSeconds: 0,
    clockDirection: 'up',
    quickPoints: [1, 2, 3, 5, 10, 25, 50],
    defaultMeta: () => ({
      targetScore: 21,
      roundDeltaA: 0,
      roundDeltaB: 0,
      streakA: 0,
      streakB: 0
    }),
    voiceKeywords: [
      { phrases: ['double bullseye', 'bullseye'], points: 50, label: 'Bullseye (+50)' },
      { phrases: ['outer bull', 'single bull'], points: 25, label: 'Outer Bull (+25)' },
      { phrases: ['cornhole', 'in the hole', 'bag in the hole', 'drainer'], points: 3, label: 'Cornhole (+3)' },
      { phrases: ['woody', 'on the board', 'bag on board'], points: 1, label: 'Woody (+1)' }
    ],
    sportCommands: [
      { phrases: ['target score', 'play to'], action: 'setTargetScore', numeric: true, desc: 'Set winning target score to X' },
      { phrases: ['next round', 'end round'], action: 'nextPeriod', desc: 'Advance to next round' }
    ],
    sampleCommands: [
      '"Add 17 points to Home"',
      '"Give Away 125 points"',
      '"Subtract 5 points from Home"',
      '"Cornhole for Home"',
      '"Bullseye Away"',
      '"Play to 50"'
    ]
  }
};
