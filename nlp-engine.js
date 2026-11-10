/**
 * Advanced Voice NLU & AI Speech Filter Engine (nlp-engine.js)
 * 
 * Multi-Stage Pipeline:
 * 1. Self-Correction & Negation Pre-Processor ("wait no", "scratch that", "don't")
 * 2. Conversational Chatter & Hypothetical Speech Filter (prevents false positives from casual talk)
 * 3. Universal Spoken Number AST Parser (parses any spoken number 0 - 999,999 + ASR homophones)
 * 4. Phonetic (Soundex) + Levenshtein Fuzzy Team Name & Alias Resolver
 * 5. Sport-Specific Vocabulary & Command Matcher
 * 6. Multi-Alternative Consensus Evaluator + Optional In-Browser / Free AI Verification
 */

class ScoreboardNLPEngine {
  constructor() {
    this.wakeWords = ['scoreboard', 'score board', 'referee', 'hey ref', 'ref', 'computer', 'umpire'];
    
    // Conversational / hypothetical markers that indicate casual chatter rather than a command
    this.chatterDisqualifiers = [
      /\b(what if|if they|if we|if home|if away|i think|do you think|did they|did we|who has|how many|can they|could have|should have|would have|might get|used to have|remember when|last game|yesterday|next game|need to get|needs to score|trying to|hope they|wish they|wonder if)\b/i,
      /\b(is going to|are going to|was a|were a|haven't|hasn't|didn't|doesn't|wouldn't|couldn't|shouldn't)\b/i
    ];

    // Pure negation / cancellation markers
    this.negationPatterns = /\b(don't|do not|never mind|nevermind|cancel that|ignore that|forget that|stop listening|no points|not a point)\b/i;

    // Self-correction splitters (e.g. "add 2 to home wait no 3 to away" -> takes "3 to away")
    this.correctionSplitters = /\b(?:wait no|no wait|actually no|actually|i mean|i meant|scratch that|correction|sorry no|oops)\b/i;

    // Number dictionaries
    this.ones = {
      'zero': 0, 'nothing': 0, 'nil': 0, 'love': 0, 'zip': 0, 'naught': 0,
      'one': 1, 'won': 1, 'single': 1, 'a': 1, 'an': 1,
      'two': 2, 'to': 2, 'too': 2, 'couple': 2, 'pair': 2, 'double': 2, 'deuce': 2,
      'three': 3, 'tree': 3, 'triple': 3, 'trey': 3,
      'four': 4, 'for': 4, 'fore': 4,
      'five': 5, 'fiver': 5,
      'six': 6, 'sicks': 6,
      'seven': 7,
      'eight': 8, 'ate': 8,
      'nine': 9, 'niner': 9,
      'ten': 10, 'tin': 10,
      'eleven': 11,
      'twelve': 12, 'dozen': 12,
      'thirteen': 13,
      'fourteen': 14,
      'fifteen': 15,
      'sixteen': 16,
      'seventeen': 17,
      'eighteen': 18,
      'nineteen': 19
    };

    this.tens = {
      'twenty': 20,
      'thirty': 30,
      'forty': 40, 'fourty': 40,
      'fifty': 50,
      'sixty': 60,
      'seventy': 70,
      'eighty': 80,
      'ninety': 90
    };

    this.scales = {
      'hundred': 100,
      'thousand': 1000
    };

    // Strict number words (excluding ambiguous prepositions like 'to', 'for', 'a' unless in numeric context)
    this.strictNumberWords = new Set([
      'zero', 'nil', 'one', 'won', 'single', 'two', 'too', 'couple', 'pair', 'double',
      'three', 'tree', 'triple', 'four', 'fore', 'five', 'fiver', 'six', 'seven',
      'eight', 'ate', 'nine', 'ten', 'eleven', 'twelve', 'dozen', 'thirteen',
      'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
      'twenty', 'thirty', 'forty', 'fourty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety',
      'hundred', 'thousand'
    ]);
  }

  /**
   * Computes American Soundex code for phonetic matching of team names (e.g. "Celtics" === "Seltics")
   */
  soundex(str) {
    const s = (str || '').toLowerCase().replace(/[^a-z]/g, '');
    if (!s) return '';
    const map = {
      b: 1, f: 1, p: 1, v: 1,
      c: 2, g: 2, j: 2, k: 2, q: 2, s: 2, x: 2, z: 2,
      d: 3, t: 3,
      l: 4,
      m: 5, n: 5,
      r: 6
    };
    let first = s[0].toUpperCase();
    let code = first;
    let prev = map[s[0]] || 0;
    for (let i = 1; i < s.length && code.length < 4; i++) {
      const curr = map[s[i]] || 0;
      if (curr !== 0 && curr !== prev) {
        code += curr;
      }
      if (curr !== 0 || !'hw'.includes(s[i])) {
        prev = curr;
      }
    }
    return code.padEnd(4, '0');
  }

  /**
   * Levenshtein edit distance for fuzzy matching custom team names
   */
  levenshtein(a, b) {
    a = a.toLowerCase();
    b = b.toLowerCase();
    const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
    return matrix[a.length][b.length];
  }

  /**
   * Normalizes spoken numbers inside text into digits.
   * Handles multi-word numbers ("one hundred twenty five" -> 125) and contextual homophones ("add to points" -> "add 2 points").
   */
  normalizeNumbersInText(rawText) {
    let text = rawText.toLowerCase().replace(/[-]/g, ' ');

    // Contextual homophone fixes before general parsing:
    // e.g. "add to points", "give for points", "plus to for home", "minus to"
    text = text.replace(/\b(add|plus|give|award|score|scored|subtract|minus|take away|remove)\s+(to|too)\b/g, '$1 two');
    text = text.replace(/\b(add|plus|give|award|score|scored|subtract|minus|take away|remove)\s+(for|fore)\b/g, '$1 four');
    text = text.replace(/\b(add|plus|give|award|score|scored|subtract|minus|take away|remove)\s+(won)\b/g, '$1 one');
    text = text.replace(/\b(add|plus|give|award|score|scored|subtract|minus|take away|remove)\s+(ate)\b/g, '$1 eight');
    text = text.replace(/\b(to|too)\s+(points?|goals?|runs?|scores?)\b/g, 'two $2');
    text = text.replace(/\b(for|fore)\s+(points?|goals?|runs?|scores?)\b/g, 'four $2');
    text = text.replace(/\b(won)\s+(points?|goals?|runs?|scores?)\b/g, 'one $2');
    text = text.replace(/\b(ate)\s+(points?|goals?|runs?|scores?)\b/g, 'eight $2');
    text = text.replace(/\ba\s+(couple|pair)\s+of\s+/g, 'two ');
    text = text.replace(/\ba\s+(couple|pair)\b/g, 'two');
    text = text.replace(/\ba\s+(single)\b/g, 'one');

    const tokens = text.split(/\s+/);
    const out = [];
    let i = 0;

    while (i < tokens.length) {
      const cleanToken = tokens[i].replace(/[^a-z0-9]/g, '');

      // Check if this token starts a number word sequence
      if (this.strictNumberWords.has(cleanToken)) {
        let total = 0;
        let current = 0;
        let consumed = 0;

        let j = i;
        while (j < tokens.length) {
          const w = tokens[j].replace(/[^a-z0-9]/g, '');
          if (w === 'and' && consumed > 0) {
            // allow "one hundred and twenty"
            const nextW = (tokens[j + 1] || '').replace(/[^a-z0-9]/g, '');
            if (this.strictNumberWords.has(nextW)) {
              j++;
              consumed++;
              continue;
            } else {
              break;
            }
          }

          if (this.strictNumberWords.has(w)) {
            if (this.ones[w] !== undefined) {
              current += this.ones[w];
            } else if (this.tens[w] !== undefined) {
              current += this.tens[w];
            } else if (this.scales[w] !== undefined) {
              const scale = this.scales[w];
              if (current === 0) current = 1;
              if (scale === 1000) {
                total += current * 1000;
                current = 0;
              } else {
                current *= scale;
              }
            }
            j++;
            consumed++;
          } else {
            break;
          }
        }

        if (consumed > 0) {
          out.push(String(total + current));
          i = j;
          continue;
        }
      }

      out.push(tokens[i]);
      i++;
    }

    return out.join(' ');
  }

  /**
   * Resolves which team ('A' or 'B') is referenced in a text segment.
   */
  resolveTeam(text, teamAName, teamBName, teamAColorName = 'red', teamBColorName = 'blue') {
    const clean = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
    const words = clean.split(/\s+/).filter(Boolean);

    const nameA = (teamAName || 'Home').toLowerCase().trim();
    const nameB = (teamBName || 'Away').toLowerCase().trim();

    // Build alias lists for Team A (Left / Home) and Team B (Right / Away)
    const aliasesA = new Set([
      nameA,
      ...nameA.split(/\s+/),
      'home', 'home team', 'team a', 'team 1', 'team one', 'first team', 'left', 'left side', 'us', 'our team',
      teamAColorName.toLowerCase()
    ].filter(w => w && w.length >= 2));

    const aliasesB = new Set([
      nameB,
      ...nameB.split(/\s+/),
      'away', 'away team', 'guest', 'guests', 'visitor', 'visitors', 'visiting team',
      'team b', 'team 2', 'team two', 'second team', 'right', 'right side', 'them', 'other team',
      teamBColorName.toLowerCase()
    ].filter(w => w && w.length >= 2));

    // 1. Exact phrase or multi-word alias match (check longer phrases first)
    let scoreA = 0;
    let scoreB = 0;
    let matchedTextA = '';
    let matchedTextB = '';

    // Direct full-name check
    if (nameA && clean.includes(nameA)) {
      scoreA += 10;
      matchedTextA = nameA;
    }
    if (nameB && clean.includes(nameB)) {
      scoreB += 10;
      matchedTextB = nameB;
    }

    for (const alias of aliasesA) {
      const regex = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(clean)) {
        scoreA += alias === nameA ? 8 : 5;
        if (!matchedTextA) matchedTextA = alias;
      }
    }

    for (const alias of aliasesB) {
      const regex = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(clean)) {
        scoreB += alias === nameB ? 8 : 5;
        if (!matchedTextB) matchedTextB = alias;
      }
    }

    // 2. Phonetic (Soundex) & Fuzzy (Levenshtein) fallback on custom team words
    if (scoreA === 0 && scoreB === 0) {
      const targetWordsA = [nameA, ...nameA.split(/\s+/), 'home', teamAColorName.toLowerCase()].filter(w => w.length >= 3);
      const targetWordsB = [nameB, ...nameB.split(/\s+/), 'away', 'guest', 'visitor', teamBColorName.toLowerCase()].filter(w => w.length >= 3);

      for (const word of words) {
        if (word.length < 3) continue;
        // Skip common command verbs/nouns so they don't fuzzy-match team names
        if (['add', 'point', 'points', 'score', 'goal', 'goals', 'run', 'runs', 'give', 'plus', 'minus', 'subtract', 'for', 'from', 'the', 'and', 'two', 'three', 'four', 'five', 'six'].includes(word)) {
          continue;
        }
        const wordSdx = this.soundex(word);

        for (const tA of targetWordsA) {
          const dist = this.levenshtein(word, tA);
          if (dist <= 1 || (word.length >= 4 && wordSdx === this.soundex(tA) && dist <= 2)) {
            scoreA += 3;
            matchedTextA = word;
          }
        }
        for (const tB of targetWordsB) {
          const dist = this.levenshtein(word, tB);
          if (dist <= 1 || (word.length >= 4 && wordSdx === this.soundex(tB) && dist <= 2)) {
            scoreB += 3;
            matchedTextB = word;
          }
        }
      }
    }

    if (scoreA > scoreB && scoreA > 0) {
      return { team: 'A', confidence: Math.min(1, 0.75 + scoreA * 0.03), matchedAlias: matchedTextA };
    }
    if (scoreB > scoreA && scoreB > 0) {
      return { team: 'B', confidence: Math.min(1, 0.75 + scoreB * 0.03), matchedAlias: matchedTextB };
    }
    return { team: null, confidence: 0, matchedAlias: null };
  }

  /**
   * Main NLU evaluation for a single transcript string.
   * Returns a structured intent object or { valid: false, reason: '...' }
   */
  parseSingleTranscript(rawTranscript, context) {
    const {
      sportId = 'basketball',
      teamAName = 'Home',
      teamBName = 'Away',
      teamAColor = 'red',
      teamBColor = 'blue',
      requireWakeWord = false,
      strictMode = true,
      asrConfidence = 0.9
    } = context;

    const sport = window.SPORTS_CONFIG[sportId] || window.SPORTS_CONFIG.basketball;

    if (!rawTranscript || typeof rawTranscript !== 'string') {
      return { valid: false, reason: 'Empty transcript' };
    }

    let text = rawTranscript.trim().toLowerCase();

    // Step 1: Check Self-Correction ("add 2 to home wait no 3 to away" -> keeps "3 to away")
    let wasCorrected = false;
    if (this.correctionSplitters.test(text)) {
      const parts = text.split(this.correctionSplitters).map(s => s.trim()).filter(Boolean);
      if (parts.length > 0) {
        text = parts[parts.length - 1];
        wasCorrected = true;
      }
    }

    // Step 2: Check pure negation / cancellation ("don't add points", "nevermind")
    if (this.negationPatterns.test(text)) {
      return {
        valid: false,
        isNegated: true,
        reason: 'Filtered out: Negation or cancellation phrase detected'
      };
    }

    // Step 3: Check Wake Word if required (or boost confidence if present)
    let hasWakeWord = false;
    for (const ww of this.wakeWords) {
      const wwRegex = new RegExp(`^\\s*(?:hey\\s+|ok\\s+|okay\\s+)?${ww}\\b[,:\\s]*`, 'i');
      if (wwRegex.test(text)) {
        hasWakeWord = true;
        text = text.replace(wwRegex, '').trim();
        break;
      }
    }

    if (requireWakeWord && !hasWakeWord) {
      return {
        valid: false,
        reason: 'Ignored: Missing required wake word ("Scoreboard" or "Ref")'
      };
    }

    // Step 4: Conversational Chatter & Hypothetical Speech Filter
    for (const pattern of this.chatterDisqualifiers) {
      if (pattern.test(text)) {
        return {
          valid: false,
          isChatter: true,
          reason: 'AI Speech Filter: Ignored conversational/hypothetical speech'
        };
      }
    }

    // Reject transcripts that are excessively long rambling sentences (> 14 words) unless corrected
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    if (wordCount > 14 && !wasCorrected) {
      return {
        valid: false,
        isChatter: true,
        reason: 'AI Speech Filter: Transcript too long for a scoreboard command (likely background conversation)'
      };
    }

    // Step 5: Normalize spoken numbers into digits ("twenty four" -> "24", "add to points" -> "add 2 points")
    const normalized = this.normalizeNumbersInText(text);

    // Step 6: Check Global System Commands (Undo, Redo, Clock Start/Stop, Next Period, Reset)
    const globalCmd = this.matchGlobalCommand(normalized);
    if (globalCmd) {
      return {
        valid: true,
        category: 'global',
        intent: globalCmd.intent,
        value: globalCmd.value,
        description: globalCmd.description,
        confidence: this.computeFinalConfidence(asrConfidence, 0.95, hasWakeWord),
        normalizedText: normalized
      };
    }

    // Step 7: Resolve Team reference ('A' or 'B')
    const teamMatch = this.resolveTeam(normalized, teamAName, teamBName, teamAColor, teamBColor);

    // Step 8: Check Multi-Clause / Both-Team Score Setting (e.g. "Home 24 Away 18" or "Add 3 to Home and 2 to Away")
    // First check if it's a sport-specific non-point command (e.g., "strike", "ball", "reset shot clock", "yellow card on Away")
    const sportCmdMatch = this.matchSportCommand(normalized, sport, teamMatch, teamAName, teamBName);
    if (sportCmdMatch) {
      return {
        valid: true,
        category: 'sport_command',
        intent: sportCmdMatch.action,
        team: sportCmdMatch.team,
        value: sportCmdMatch.value,
        description: sportCmdMatch.description,
        confidence: this.computeFinalConfidence(asrConfidence, 0.92, hasWakeWord),
        normalizedText: normalized
      };
    }

    // Step 9: Check Explicit Point Addition / Subtraction / Set Score Intent
    const scoringIntent = this.matchScoringIntent(normalized, sport, teamMatch, teamAName, teamBName, strictMode);
    if (scoringIntent) {
      return {
        valid: true,
        category: 'score',
        intent: scoringIntent.operation, // 'add', 'subtract', 'set'
        team: scoringIntent.team,
        points: scoringIntent.points,
        metaAction: scoringIntent.metaAction || null,
        label: scoringIntent.label,
        description: scoringIntent.description,
        confidence: this.computeFinalConfidence(asrConfidence, scoringIntent.grammarScore, hasWakeWord),
        normalizedText: normalized
      };
    }

    return {
      valid: false,
      reason: 'AI Speech Filter: No valid scoreboard command structure detected'
    };
  }

  /**
   * Matches global scoreboard controls (Undo, Redo, Clock, Period, Swap, Reset)
   */
  matchGlobalCommand(normalized) {
    // Undo / Take back
    if (/^(?:please\s+)?(?:undo|undo last|take back|take that back|revert|step back|undo score|undo last point)$/i.test(normalized)) {
      return { intent: 'undo', description: 'Undo last scoreboard action' };
    }
    // Redo
    if (/^(?:please\s+)?(?:redo|redo last)$/i.test(normalized)) {
      return { intent: 'redo', description: 'Redo scoreboard action' };
    }
    // Clock Start / Resume
    if (/^(?:start|resume|run|begin|play|unpause)\s+(?:the\s+)?(?:clock|timer|time|game clock|match clock)$/i.test(normalized) ||
        /^(?:clock|timer)\s+(?:start|go|run)$/i.test(normalized) ||
        /^time in$/i.test(normalized)) {
      return { intent: 'startClock', description: 'Start game clock' };
    }
    // Clock Stop / Pause
    if (/^(?:stop|pause|freeze|hold|halt)\s+(?:the\s+)?(?:clock|timer|time|game clock|match clock)$/i.test(normalized) ||
        /^(?:clock|timer)\s+(?:stop|pause)$/i.test(normalized) ||
        /^time out clock$/i.test(normalized)) {
      return { intent: 'stopClock', description: 'Pause game clock' };
    }
    // Clock Reset
    if (/^reset\s+(?:the\s+)?(?:clock|timer|game clock)$/i.test(normalized)) {
      return { intent: 'resetClock', description: 'Reset game clock' };
    }
    // Next Period / Quarter / Half / Inning / Set / Round
    if (/^(?:next|advance|new|end)\s+(?:period|quarter|half|inning|set|game|round|frame)$/i.test(normalized) ||
        /^halftime$/i.test(normalized)) {
      return { intent: 'nextPeriod', description: 'Advance to next period/inning' };
    }
    // Previous Period
    if (/^(?:previous|last|back a)\s+(?:period|quarter|half|inning|set|round)$/i.test(normalized)) {
      return { intent: 'prevPeriod', description: 'Go to previous period' };
    }
    // Swap Sides
    if (/^(?:swap|switch|flip)\s+(?:teams|sides|ends|court)$/i.test(normalized)) {
      return { intent: 'swapTeams', description: 'Swap team sides' };
    }
    // Full Reset (requires explicit confirmation word "reset all scores" or "new game reset")
    if (/^(?:reset all scores|reset scoreboard|new game reset|clear scoreboard)$/i.test(normalized)) {
      return { intent: 'resetMatch', description: 'Reset match scores' };
    }

    return null;
  }

  /**
   * Matches sport-specific commands (e.g. "reset shot clock", "strike", "yellow card Away")
   */
  matchSportCommand(normalized, sport, teamMatch, teamAName, teamBName) {
    if (!sport.sportCommands) return null;

    for (const cmd of sport.sportCommands) {
      for (const phrase of cmd.phrases) {
        const regex = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (regex.test(normalized)) {
          if (cmd.teamRequired) {
            if (!teamMatch.team) continue; // Needs a team to execute safely
            const teamLabel = teamMatch.team === 'A' ? teamAName : teamBName;
            return {
              action: cmd.action,
              team: teamMatch.team,
              description: `${cmd.desc.replace('[Team]', teamLabel)}`
            };
          }

          if (cmd.numeric) {
            const numMatch = normalized.match(/\b(\d+)\b/);
            if (!numMatch) continue;
            const val = parseInt(numMatch[1], 10);
            return {
              action: cmd.action,
              value: val,
              description: `${cmd.desc.replace('X', val)}`
            };
          }

          return {
            action: cmd.action,
            team: teamMatch.team || null,
            description: cmd.desc.replace('[Team]', teamMatch.team ? (teamMatch.team === 'A' ? teamAName : teamBName) : '')
          };
        }
      }
    }

    return null;
  }

  /**
   * Matches point additions, subtractions, sport-keyword scores, or score setting for any number of points.
   */
  matchScoringIntent(normalized, sport, teamMatch, teamAName, teamBName, strictMode) {
    const team = teamMatch.team;
    if (!team) {
      // Without a clear target team, we NEVER guess or add points to a random team
      return null;
    }

    const teamLabel = team === 'A' ? teamAName : teamBName;

    // 1. Check "Set [Team] score to X"
    const setScoreMatch = normalized.match(/\b(?:set|make|change)\b.*?\b(?:score|points|goals|runs)?\b.*?\bto\s+(\d+)\b/i) ||
                          normalized.match(/\b(?:set|make)\s+(?:the\s+)?score\s+(\d+)\b/i);
    if (setScoreMatch) {
      const pts = parseInt(setScoreMatch[1], 10);
      if (!isNaN(pts) && pts >= 0 && pts <= 999999) {
        return {
          operation: 'set',
          team,
          points: pts,
          grammarScore: 0.96,
          label: `Set Score (${pts})`,
          description: `Set ${teamLabel} score to ${pts}`
        };
      }
    }

    // 2. Check Subtraction ("subtract 3 points from Home", "minus 2 for Away", "take 5 points from Home", "Home minus 1")
    const isSubtract = /\b(?:subtract|minus|take away|remove|deduct|negative|lose|lost)\b/i.test(normalized);
    if (isSubtract) {
      const numMatch = normalized.match(/\b(\d+)\b/);
      const pts = numMatch ? parseInt(numMatch[1], 10) : 1;
      if (pts > 0 && pts <= 999999) {
        return {
          operation: 'subtract',
          team,
          points: pts,
          grammarScore: 0.95,
          label: `-${pts} ${pts === 1 ? sport.unitSingular : sport.unitPlural}`,
          description: `Subtract ${pts} ${pts === 1 ? sport.unitSingular : sport.unitPlural} from ${teamLabel}`
        };
      }
    }

    // 3. Check Sport-Specific Scoring Vocabulary (e.g., "touchdown Home" (+6), "three pointer Away" (+3), "grand slam Home" (+4))
    // Make sure we check this BEFORE generic numbers if the keyword itself contains a number (like "3 pointer")
    // UNLESS the user explicitly said an arbitrary number with "add/give/plus" (e.g., "add 15 points to Home").
    const hasExplicitArbitraryAdd = /\b(?:add|give|plus|award|put)\s+(\d+)\s+(?:points?|goals?|runs?)\b/i.test(normalized);

    if (!hasExplicitArbitraryAdd && sport.voiceKeywords) {
      for (const kw of sport.voiceKeywords) {
        for (const phrase of kw.phrases) {
          // Also match normalized version of the phrase (e.g., "three pointer" -> "3 pointer")
          const normPhrase = this.normalizeNumbersInText(phrase);
          const regexRaw = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
          const regexNorm = new RegExp(`\\b${normPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');

          if (regexRaw.test(normalized) || regexNorm.test(normalized)) {
            return {
              operation: 'add',
              team,
              points: kw.points,
              metaAction: kw.metaAction || null,
              grammarScore: 0.95,
              label: kw.label,
              description: `${kw.label} for ${teamLabel}`
            };
          }
        }
      }
    }

    // 4. Universal Arbitrary Number Point Detection!
    // Detects ANY number of points spoken by the player:
    // Patterns supported:
    //   a) "[Action Verb] [X] [points/goals/runs] (to/for) [Team]" -> "add 17 points to Home", "give 42 to Away"
    //   b) "[Action Verb] [Team] [X] (points/goals/runs)" -> "give Home 12 points", "add Away 5"
    //   c) "[Team] [Action Verb / plus / scores / gets] [X] (points/goals/runs)" -> "Home plus 8", "Lakers score 3", "Home gets 10 points"
    //   d) "[X] [points/goals/runs] (for/to) [Team]" -> "9 points for Home", "14 points to Red"
    //   e) "[Plus] [X] [Team]" -> "plus 6 Home"

    const hasActionVerb = /\b(?:add|plus|give|award|score|scores|scored|put|credit|tally|gets|got|earns|earned|with)\b/i.test(normalized);
    const hasUnitWord = /\b(?:points?|goals?|runs?|buckets?|baskets?|tallies|marks?)\b/i.test(normalized);
    const hasPreposition = /\b(?:to|for|on)\b/i.test(normalized);

    // Extract numbers that aren't part of "team 1" or "team 2"
    const scrubbedForNumbers = normalized
      .replace(/\bteam\s+[12]\b/gi, 'team_alias')
      .replace(/\b[123]pt\b/gi, '');

    const numberMatches = [...scrubbedForNumbers.matchAll(/\b(\d+)\b/g)];

    if (numberMatches.length > 0) {
      // Take the primary point number
      const points = parseInt(numberMatches[0][1], 10);

      if (points > 0 && points <= 999999) {
        // Strict validation: To ensure we NEVER trigger falsely on random numbers + team names in casual speech,
        // require at least ONE of:
        // - An explicit action verb ("add", "give", "plus", "score", "award")
        // - A scoring unit word ("points", "point", "goals", "runs")
        // - A directional preposition ("3 for Home", "5 to Away")
        if (hasActionVerb || hasUnitWord || hasPreposition) {
          let grammarScore = 0.85;
          if (hasActionVerb && hasUnitWord) grammarScore = 0.98;
          else if (hasActionVerb || (hasUnitWord && hasPreposition)) grammarScore = 0.94;
          else if (hasUnitWord) grammarScore = 0.90;

          const unitText = points === 1 ? sport.unitSingular : sport.unitPlural;
          return {
            operation: 'add',
            team,
            points,
            grammarScore,
            label: `+${points} ${unitText}`,
            description: `Add ${points} ${unitText} to ${teamLabel}`
          };
        }
      }
    }

    // 5. Implicit +1 Point Command: e.g. "Point for Home", "Point Home", "Goal Away", "Run for Home", "Score Home"
    if (/\b(?:point|goal|run|score|basket|bucket)\b/i.test(normalized)) {
      const unitText = sport.unitSingular;
      return {
        operation: 'add',
        team,
        points: 1,
        grammarScore: 0.91,
        label: `+1 ${unitText}`,
        description: `Add 1 ${unitText} to ${teamLabel}`
      };
    }

    return null;
  }

  computeFinalConfidence(asrConfidence, grammarScore, hasWakeWord) {
    const effectiveAsr = asrConfidence && asrConfidence > 0 ? asrConfidence : 0.88;
    let combined = effectiveAsr * 0.45 + grammarScore * 0.55;
    if (hasWakeWord) combined = Math.min(1.0, combined + 0.08);
    return Math.round(combined * 100) / 100;
  }

  /**
   * Multi-Alternative Consensus Evaluator:
   * Inspects all N-best alternatives from SpeechRecognitionResult.
   * If Alternative #1 is slightly garbled by homophones (e.g. "add to points to read")
   * while Alternative #2 is "add 2 points to red", it finds the highest-confidence valid scoreboard command!
   */
  evaluateAlternatives(alternatives, context) {
    // alternatives is an array of { transcript: string, confidence: number }
    if (!alternatives || alternatives.length === 0) {
      return { valid: false, reason: 'No speech alternatives received' };
    }

    let bestResult = null;
    let firstInvalidReason = null;

    for (let i = 0; i < alternatives.length; i++) {
      const alt = alternatives[i];
      // Slightly discount lower-ranked ASR alternatives unless their grammar is crystal clear
      const rankPenalty = i * 0.03;
      const altConfidence = Math.max(0.5, (alt.confidence || 0.88) - rankPenalty);

      const parsed = this.parseSingleTranscript(alt.transcript, {
        ...context,
        asrConfidence: altConfidence
      });

      if (i === 0 && !parsed.valid) {
        firstInvalidReason = parsed.reason;
        // If alternative 0 was explicitly negated or flagged as conversational chatter, stop immediately!
        if (parsed.isNegated || parsed.isChatter) {
          return {
            ...parsed,
            rawTranscript: alt.transcript,
            alternativeUsed: 0
          };
        }
      }

      if (parsed.valid) {
        if (!bestResult || parsed.confidence > bestResult.confidence) {
          bestResult = {
            ...parsed,
            rawTranscript: alt.transcript,
            alternativeUsed: i
          };
        }
      }
    }

    if (bestResult) {
      return bestResult;
    }

    return {
      valid: false,
      rawTranscript: alternatives[0].transcript,
      reason: firstInvalidReason || 'Filtered out: Not a recognized scoreboard command'
    };
  }

  /**
   * Optional Free AI Classifier (Supports Chrome Built-in Gemini Nano `window.ai` OR Optional Free Gemini / Groq Key)
   * Used as an extra verification layer or fallback when enabled by the user.
   */
  async verifyWithAI(transcript, context, deterministicResult) {
    const {
      aiMode = 'hybrid', // 'deterministic', 'hybrid', 'cloud_llm'
      apiKey = '',
      aiProvider = 'gemini', // 'gemini' or 'groq'
      sportId = 'basketball',
      teamAName = 'Home',
      teamBName = 'Away'
    } = context;

    // 1. If deterministic engine already rejected it as chatter/negation or we're in pure deterministic mode:
    if (aiMode === 'deterministic') {
      return deterministicResult;
    }

    // 2. Try Chrome Built-in On-Device AI (`window.ai` / `LanguageModel`) if available (100% Free, Offline)
    const hasChromeAI = typeof window !== 'undefined' && (window.ai?.languageModel || window.LanguageModel);
    if (aiMode === 'hybrid' && !apiKey && !hasChromeAI) {
      // Our built-in AST + Phonetic + Chatter-Guard engine IS the local AI filter
      return deterministicResult;
    }

    const systemPrompt = `You are a strict sports scoreboard voice command filter for ${sportId}.
Team A is "${teamAName}" (Home/Left). Team B is "${teamBName}" (Away/Right).
Determine if the user's spoken phrase is an intentional scoreboard command or background chatter.
NEVER guess if the phrase is casual conversation, a question, or ambiguous.
Respond ONLY with valid JSON:
{"valid": boolean, "category": "score"|"sport_command"|"global"|"none", "intent": "add"|"subtract"|"set"|"undo"|"startClock"|"stopClock"|"nextPeriod"|string, "team": "A"|"B"|null, "points": number|null, "reason": string}`;

    try {
      if (apiKey) {
        if (aiProvider === 'gemini') {
          const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: `${systemPrompt}\n\nTranscript: "${transcript}"` }] }],
                generationConfig: { responseMimeType: 'application/json', temperature: 0.0 }
              })
            }
          );
          if (resp.ok) {
            const data = await resp.json();
            const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (rawJson) {
              const aiParsed = JSON.parse(rawJson);
              if (!aiParsed.valid) {
                return { valid: false, reason: `AI LLM Filter: ${aiParsed.reason || 'Rejected as non-command'}`, rawTranscript: transcript };
              }
              if (deterministicResult.valid) {
                return { ...deterministicResult, aiVerified: true };
              }
              if (aiParsed.category === 'score' && aiParsed.team && aiParsed.points > 0) {
                const tLabel = aiParsed.team === 'A' ? teamAName : teamBName;
                return {
                  valid: true,
                  aiVerified: true,
                  category: 'score',
                  intent: aiParsed.intent || 'add',
                  team: aiParsed.team,
                  points: Number(aiParsed.points),
                  label: `${aiParsed.intent === 'subtract' ? '-' : '+'}${aiParsed.points}`,
                  description: `AI: ${aiParsed.intent || 'Add'} ${aiParsed.points} pts (${tLabel})`,
                  confidence: 0.96,
                  rawTranscript: transcript,
                  normalizedText: transcript.toLowerCase()
                };
              }
            }
          }
        } else if (aiProvider === 'groq') {
          const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: 'llama-3.1-8b-instant',
              temperature: 0.0,
              response_format: { type: 'json_object' },
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: transcript }
              ]
            })
          });
          if (resp.ok) {
            const data = await resp.json();
            const content = data?.choices?.[0]?.message?.content;
            if (content) {
              const aiParsed = JSON.parse(content);
              if (!aiParsed.valid) {
                return { valid: false, reason: `AI LLM Filter: ${aiParsed.reason || 'Rejected as non-command'}`, rawTranscript: transcript };
              }
              if (deterministicResult.valid) {
                return { ...deterministicResult, aiVerified: true };
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('Optional AI API fallback warning (using local NLU engine):', err);
    }

    return deterministicResult;
  }
}

window.ScoreboardNLPEngine = ScoreboardNLPEngine;
