// Hand Cricket - JavaScript Part 1: Core Setup & Data Management
// Version 3.4.0 - FULLY FIXED EDITION

'use strict';

// ============================================================================
// VERSION & DATA MIGRATION
// ============================================================================
const APP_VERSION = '3.5.0';
const DATA_VERSION_KEY = 'hc_data_version';

const DataMigration = {
  run() {
    const stored = localStorage.getItem(DATA_VERSION_KEY) || '0.0.0';
    if (stored === APP_VERSION) return;
    console.log(`ðŸ”„ Migrating data from v${stored} to v${APP_VERSION}`);
    try {
      this._applyMigrations(stored);
      localStorage.setItem(DATA_VERSION_KEY, APP_VERSION);
      console.log('âœ… Data migration complete');
    } catch(e) {
      console.error('Migration error:', e);
      // Keep previous version marker so migration can retry on next load.
    }
  },

  _applyMigrations(fromVersion) {
    // âœ… FIX #2: Add bowling milestones to migration
    const csKey = 'hc_careerStats';
    let cs = {};
    try { cs = JSON.parse(localStorage.getItem(csKey)) || {}; } catch(e) { cs = {}; }
    const defaults = {
      totalMatches:0, won:0, lost:0, drawn:0,
      totalRuns:0, totalWickets:0, highestScore:0,
      hattricks:0, centuries:0, fifties:0,
      threeWickets:0,   // âœ… ADDED
      fiveWickets:0,    // âœ… ADDED
      tenWickets:0      // âœ… ADDED
    };
    let changed = false;
    Object.keys(defaults).forEach(k => {
      if (cs[k] === undefined) { cs[k] = defaults[k]; changed = true; }
    });
    if (changed) localStorage.setItem(csKey, JSON.stringify(cs));

    const mhKey = 'hc_matchHistory';
    let mh = [];
    try { mh = JSON.parse(localStorage.getItem(mhKey)) || []; } catch(e) { mh = []; }
    let mhChanged = false;
    mh.forEach(m => {
      if (m.userWkTaken === undefined) {
        m.userWkTaken = 0;
        mhChanged = true;
      }
    });
    if (mhChanged) localStorage.setItem(mhKey, JSON.stringify(mh));

    const ppKey = 'hc_playerProfile';
    let pp = {};
    try { pp = JSON.parse(localStorage.getItem(ppKey)) || {}; } catch(e) { pp = {}; }
    const profileDefaults = {
      aura: 0,
      rankPoints: 0,
      rankTier: 'Bronze',
      matchTokens: 5,
      rankedMatches: 0,
      totalRewardsEarned: 0,
      lastUpdated: null
    };
    let ppChanged = false;
    Object.keys(profileDefaults).forEach(k => {
      if (pp[k] === undefined) { pp[k] = profileDefaults[k]; ppChanged = true; }
    });
    if (ppChanged) localStorage.setItem(ppKey, JSON.stringify(pp));
    console.log(`âœ… Migration applied.`);
  }
};

// ============================================================================
// FIREBASE CONFIGURATION
// ============================================================================
const firebaseConfig = {
  apiKey: "AIzaSyD846b0cpScA0dms4ZlgxoZr8NnDudK7WE",
  authDomain: "hc-ai-9e557.firebaseapp.com",
  projectId: "hc-ai-9e557",
  storageBucket: "hc-ai-9e557.firebasestorage.app",
  messagingSenderId: "1048313925900",
  appId: "1:1048313925900:web:3bf3a38c3b12963e4ef929",
  measurementId: "G-187PW5TZB9"
};

let app, auth, db, fns, currentUser = null, firebaseInitialized = false;

const PROGRESS_IDENTITY_KEY = 'hc_active_identity_v1';
const GUEST_PROGRESS_IDENTITY = 'guest';
const PROGRESS_RANKED_SETTLEMENT_KEY = 'hc_ranked_settled_rooms';

function _managedProgressKeys(){
  const keys = [
    'hc_matchHistory',
    'hc_careerStats',
    'hc_tournaments',
    'handCricketHistory',
    'hc_playerProfile',
    'handCricket_tournament',
    DATA_VERSION_KEY,
    PROGRESS_RANKED_SETTLEMENT_KEY
  ];
  return keys;
}

function _identityBucketKey(identity, key){
  return 'hc_id::' + identity + '::' + key;
}

function _getActiveProgressIdentity(){
  try {
    return localStorage.getItem(PROGRESS_IDENTITY_KEY) || GUEST_PROGRESS_IDENTITY;
  } catch(e){
    return GUEST_PROGRESS_IDENTITY;
  }
}

function _setActiveProgressIdentity(identity){
  try { localStorage.setItem(PROGRESS_IDENTITY_KEY, identity); } catch(e) {}
}

function _snapshotActiveProgressToIdentity(identity){
  const keys = _managedProgressKeys();
  keys.forEach(key => {
    const bucketKey = _identityBucketKey(identity, key);
    const value = localStorage.getItem(key);
    if (value === null || value === undefined) localStorage.removeItem(bucketKey);
    else localStorage.setItem(bucketKey, value);
  });
}

function _loadIdentityProgressToActive(identity){
  const keys = _managedProgressKeys();
  keys.forEach(key => {
    const bucketKey = _identityBucketKey(identity, key);
    const value = localStorage.getItem(bucketKey);
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  });
}

function switchProgressIdentity(uid){
  const nextIdentity = uid ? ('user:' + uid) : GUEST_PROGRESS_IDENTITY;
  const prevIdentity = _getActiveProgressIdentity();
  if (prevIdentity === nextIdentity) return false;

  _snapshotActiveProgressToIdentity(prevIdentity);
  _loadIdentityProgressToActive(nextIdentity);
  _setActiveProgressIdentity(nextIdentity);

  DataMigration.run();
  return true;
}

function persistCurrentProgressIdentity(){
  _snapshotActiveProgressToIdentity(_getActiveProgressIdentity());
}

// ============================================================================
// SECURITY UTILITIES
// ============================================================================
const Security = {
  escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },
  
  sanitizeInput(s) {
    if (typeof s !== 'string') return '';
    return s.trim()
      .replace(/<[^>]*>/g, '')
      .replace(/[<>"'`]/g, '')
      .substring(0, 200);
  },
  
  validateNumber(val, min, max, def) {
    const n = parseInt(val, 10);
    if (isNaN(n) || n < min || n > max) return def;
    return n;
  },
  
  _saveQueue: {},
  debouncedSave(key, fn, delay = 300) {
    clearTimeout(this._saveQueue[key]);
    this._saveQueue[key] = setTimeout(fn, delay);
  }
};

// ============================================================================
// BACKGROUND MUSIC
// ============================================================================
const Music = {
  ctx: null,
  gainNode: null,
  isPlaying: false,
  oscillators: [],

  _initCtx() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.setValueAtTime(0.06, this.ctx.currentTime);
      this.gainNode.connect(this.ctx.destination);
    } catch(e) { console.log('Web Audio API not available'); }
  },

  _createAmbientTone(freq, type, gain) {
    if (!this.ctx) return null;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    g.gain.setValueAtTime(gain, this.ctx.currentTime);
    osc.connect(g);
    g.connect(this.gainNode);
    return { osc, g };
  },

  _createPercussion() {
    if (!this.ctx) return;
    const scheduleHit = (time, freq, dur) => {
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.1, time + dur);
      env.gain.setValueAtTime(0.3, time);
      env.gain.exponentialRampToValueAtTime(0.001, time + dur);
      osc.connect(env);
      env.connect(this.gainNode);
      osc.start(time);
      osc.stop(time + dur);
    };

    const bpm = 90;
    const beat = 60 / bpm;
    const startTime = this.ctx.currentTime + 0.1;
    const bars = 4;
    const beats = bars * 4;

    this._scheduleNext = () => {
      if (!this.isPlaying) return;
      const now = this.ctx.currentTime;
      const loopStart = startTime + Math.floor((now - startTime) / (beats * beat)) * (beats * beat);
      const nextLoop = loopStart + beats * beat;
      for (let b = 0; b < beats; b++) {
        const t = nextLoop + b * beat;
        if (b % 4 === 0 || b % 4 === 2) scheduleHit(t, 80, 0.3);
        if (b % 4 === 1 || b % 4 === 3) scheduleHit(t, 200, 0.15);
        scheduleHit(t, 800, 0.05);
        scheduleHit(t + beat * 0.5, 800, 0.05);
      }
      this._loopTimer = setTimeout(this._scheduleNext, (beats * beat - 0.1) * 1000);
    };
    this._scheduleNext();
  },

  start() {
    if (this.isPlaying) return;
    this._initCtx();
    if (!this.ctx) { showToast('ðŸ”‡ Audio not supported', '#718096'); return; }
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const tones = [
      { freq: 130.81, type: 'sine', gain: 0.4 },
      { freq: 261.63, type: 'triangle', gain: 0.25 },
      { freq: 392.00, type: 'sine', gain: 0.2 },
      { freq: 523.25, type: 'triangle', gain: 0.15 },
    ];

    this.oscillators = tones.map(t => this._createAmbientTone(t.freq, t.type, t.gain)).filter(Boolean);
    this.oscillators.forEach(({ osc }) => {
      osc.start();
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.value = 0.15;
      lfoGain.gain.value = 3;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start();
      osc._lfo = lfo;
    });

    this._createPercussion();
    this.isPlaying = true;
    this._updateBtn();
  },

  stop() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    clearTimeout(this._loopTimer);
    this.oscillators.forEach(({ osc, g }) => {
      try {
        if (osc._lfo) osc._lfo.stop();
        g.gain.setValueAtTime(g.gain.value, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
        osc.stop(this.ctx.currentTime + 0.35);
      } catch(e) {}
    });
    this.oscillators = [];
    this._updateBtn();
  },

  _updateBtn() {
    const btn = document.getElementById('musicToggleBtn');
    const badge = document.getElementById('ambientBgmBadge');
    if (btn) {
      if (this.isPlaying) {
        btn.textContent = 'Music ON';
        btn.style.background = 'linear-gradient(135deg,#48bb78,#38a169)';
      } else {
        btn.textContent = 'Music OFF';
        btn.style.background = 'linear-gradient(135deg,#718096,#4a5568)';
      }
    }
    if (badge) {
      badge.textContent = this.isPlaying ? 'BGM ON' : 'BGM OFF';
      badge.classList.toggle('active', !!this.isPlaying);
    }
  },

  playSFX(type) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const sfx = {
      wicket: [[400, 0, 0.4], [200, 0.05, 0.3], [100, 0.1, 0.4]],
      four:   [[600, 0, 0.15], [800, 0.05, 0.1], [1000, 0.1, 0.1]],
      six:    [[800, 0, 0.1], [1000, 0.04, 0.1], [1200, 0.08, 0.1], [1500, 0.12, 0.12]],
      win:    [[523, 0, 0.3], [659, 0.15, 0.3], [784, 0.3, 0.4], [1047, 0.5, 0.5]],
      click:  [[900, 0, 0.03], [1200, 0.035, 0.025]],
    };
    const seq = sfx[type];
    if (!seq) return;
    seq.forEach(([freq, delay, dur]) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.frequency.value = freq;
      o.type = 'sine';
      g.gain.setValueAtTime(0.3, now + delay);
      g.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);
      o.connect(g); g.connect(this.gainNode || this.ctx.destination);
      o.start(now + delay);
      o.stop(now + delay + dur + 0.01);
    });
  }
};

function toggleMusic() {
  if (Music.isPlaying) Music.stop();
  else Music.start();
}

// ============================================================================
// DATA MANAGER
// ============================================================================
const DataManager = {
  KEYS: {
    matchHistory: 'hc_matchHistory',
    careerStats:  'hc_careerStats',
    tournaments:  'hc_tournaments',
    winHistory:   'handCricketHistory',
    playerProfile:'hc_playerProfile'
  },

  // Career stats are updated for all completed matches.
  saveMatch(data) {
    const h = this.getMatchHistory();
    h.push({ id: Date.now(), date: new Date().toLocaleString(), ...data });
    if (h.length > 500) h.splice(0, h.length - 500);
    localStorage.setItem(this.KEYS.matchHistory, JSON.stringify(h));
    
    this._updateCareerStats(data);
    this._applyProgressRewards(data);
  },

  getMatchHistory() {
    try { return JSON.parse(localStorage.getItem(this.KEYS.matchHistory)) || []; } catch(e) { return []; }
  },

  // âœ… FIX #4: Track bowling milestones in career stats
  _updateCareerStats(d) {
    const s = this.getCareerStats();
    s.totalMatches++;
    if (d.result === 'won') s.won++;
    else if (d.result === 'lost') s.lost++;
    else s.drawn++;
    s.totalRuns += (d.userRuns || 0);
    s.totalWickets += (d.userWkTaken !== undefined ? d.userWkTaken : 0);
    if ((d.userRuns || 0) > s.highestScore) s.highestScore = d.userRuns;
    s.hattricks  = (s.hattricks  || 0) + (d.hattricksInMatch  || 0);
    s.centuries  = (s.centuries  || 0) + (d.centuriesInMatch   || 0);
    s.fifties    = (s.fifties    || 0) + (d.fiftiesInMatch     || 0);
    s.threeWickets = (s.threeWickets || 0) + (d.threeWicketsInMatch || 0);  // âœ… ADDED
    s.fiveWickets = (s.fiveWickets || 0) + (d.fiveWicketsInMatch || 0);    // âœ… ADDED
    s.tenWickets = (s.tenWickets || 0) + (d.tenWicketsInMatch || 0);        // âœ… ADDED
    localStorage.setItem(this.KEYS.careerStats, JSON.stringify(s));
  },

  // âœ… FIX #3: Include bowling milestones in defaults
  getCareerStats() {
    try {
      const cs = JSON.parse(localStorage.getItem(this.KEYS.careerStats)) || {};
      const defaults = { 
        totalMatches:0, won:0, lost:0, drawn:0, 
        totalRuns:0, totalWickets:0, highestScore:0, 
        hattricks:0, centuries:0, fifties:0,
        threeWickets:0,   // âœ… ADDED
        fiveWickets:0,    // âœ… ADDED
        tenWickets:0      // âœ… ADDED
      };
      return { ...defaults, ...cs };
    } catch(e) {
      return { 
        totalMatches:0, won:0, lost:0, drawn:0, 
        totalRuns:0, totalWickets:0, highestScore:0, 
        hattricks:0, centuries:0, fifties:0,
        threeWickets:0, fiveWickets:0, tenWickets:0  // âœ… ADDED
      };
    }
  },

  getTournaments() {
    try { return JSON.parse(localStorage.getItem(this.KEYS.tournaments)) || []; } catch(e) { return []; }
  },

  saveTournamentSlot(tournamentState) {
    const slots = this.getTournaments();
    const format = tournamentState.format;
    const teamKey = tournamentState.userTeam;
    let teamName = teamKey;
    try {
      if (format === 'ipl') { 
        if (typeof IPL_TEAMS !== 'undefined' && IPL_TEAMS[teamKey]) teamName = IPL_TEAMS[teamKey].name; 
      } else { 
        if (typeof CRICKET_TEAMS !== 'undefined' && CRICKET_TEAMS[teamKey]) teamName = CRICKET_TEAMS[teamKey].name; 
      }
    } catch(e) {}
    
    const slotId = tournamentState._slotId || Date.now();
    const startDate = tournamentState._startDate || new Date().toLocaleString();
    let idx = slots.findIndex(s => s.id === slotId);
    const ts = JSON.parse(JSON.stringify(tournamentState));
    ts._slotId = slotId;
    ts._startDate = startDate;
    
    const slot = {
      id: slotId, format, teamKey, teamName,
      stage: tournamentState.currentStage,
      startDate, lastSaved: new Date().toLocaleString(),
      dataVersion: APP_VERSION,
      tournamentState: ts
    };
    
    if (idx >= 0) slots[idx] = slot; 
    else slots.push(slot);
    
    localStorage.setItem(this.KEYS.tournaments, JSON.stringify(slots));
    localStorage.setItem('handCricket_tournament', JSON.stringify({ tournamentState: ts }));
    return slotId;
  },

  loadTournamentSlot(id) {
    const slots = this.getTournaments();
    return slots.find(s => s.id === id) || null;
  },

  deleteTournamentSlot(id) {
    let slots = this.getTournaments().filter(s => s.id !== id);
    localStorage.setItem(this.KEYS.tournaments, JSON.stringify(slots));
  },

  getPendingTournaments() { 
    return this.getTournaments(); 
  },

  getWinHistory() {
    try { return JSON.parse(localStorage.getItem(this.KEYS.winHistory)) || []; } catch(e) { return []; }
  },

  getPlayerProfile() {
    const defaults = {
      aura: 0,
      rankPoints: 0,
      rankTier: 'Bronze',
      matchTokens: 5,
      rankedMatches: 0,
      totalRewardsEarned: 0,
      lastUpdated: null
    };
    try {
      const raw = JSON.parse(localStorage.getItem(this.KEYS.playerProfile)) || {};
      return { ...defaults, ...raw };
    } catch(e) {
      return { ...defaults };
    }
  },

  savePlayerProfile(profile) {
    localStorage.setItem(this.KEYS.playerProfile, JSON.stringify(profile));
  },

  spendMatchTokens(cost = 1) {
    const p = this.getPlayerProfile();
    if (p.matchTokens < cost) return false;
    p.matchTokens -= cost;
    p.lastUpdated = new Date().toISOString();
    this.savePlayerProfile(p);
    updatePlayerProfileUI();
    return true;
  },

  _resolveRankTier(rp) {
    const tiers = [
      { name: 'Bronze', min: 0 },
      { name: 'Silver', min: 200 },
      { name: 'Gold', min: 500 },
      { name: 'Platinum', min: 900 },
      { name: 'Diamond', min: 1400 },
      { name: 'Heroic', min: 2000 },
      { name: 'Grandmaster', min: 2800 }
    ];
    let tier = tiers[0].name;
    for (let i = 0; i < tiers.length; i++) {
      if (rp >= tiers[i].min) tier = tiers[i].name;
    }
    return tier;
  },

  _applyProgressRewards(d) {
    const profile = this.getPlayerProfile();
    const prev = {
      aura: profile.aura || 0,
      rankPoints: profile.rankPoints || 0,
      rankTier: profile.rankTier || 'Bronze',
      matchTokens: profile.matchTokens || 0
    };
    const rewardByResult = {
      won:  { rp: 28, aura: 14, tokens: 3 },
      lost: { rp: -10, aura: -4, tokens: 1 },
      draw: { rp: 6, aura: 3, tokens: 1 }
    };
    const bucket = rewardByResult[d.result] || rewardByResult.draw;
    const tourBonus = d.tournament ? 4 : 0;

    const nextRP = Math.max(0, profile.rankPoints + bucket.rp + tourBonus);
    const nextAura = Math.max(0, profile.aura + bucket.aura + (d.tournament ? 2 : 0));
    const tokenGain = Math.max(0, bucket.tokens + (d.tournament ? 1 : 0));

    profile.rankPoints = nextRP;
    profile.aura = nextAura;
    profile.matchTokens = Math.max(0, profile.matchTokens + tokenGain);
    profile.rankTier = this._resolveRankTier(nextRP);
    profile.rankedMatches = (profile.rankedMatches || 0) + 1;
    profile.totalRewardsEarned = (profile.totalRewardsEarned || 0) + tokenGain;
    profile.lastUpdated = new Date().toISOString();

    this.savePlayerProfile(profile);
    updatePlayerProfileUI();
    showAuraBurstAnimation((profile.aura || 0) - prev.aura);
    showCoinBankAnimation((profile.matchTokens || 0) - prev.matchTokens);
    showRankGainAnimation((profile.rankPoints || 0) - prev.rankPoints, profile.rankTier, prev.rankTier);
  },

  addWin(format, teamKey, teamName) {
    const h = this.getWinHistory();
    h.push({ format, teamKey, teamName, date: new Date().toISOString() });
    localStorage.setItem(this.KEYS.winHistory, JSON.stringify(h));
  },

  clearAll() {
    uiConfirm('Clear ALL history and saved tournaments? This cannot be undone!', 'Clear All Data').then(ok => {
      if (!ok) return;
      Object.values(this.KEYS).forEach(k => localStorage.removeItem(k));
      localStorage.removeItem('handCricket_tournament');
      localStorage.removeItem(DATA_VERSION_KEY);
      uiAlert('All data cleared!', 'Done').then(() => location.reload());
    });
  }
};

function updatePlayerProfileUI() {
  const auraEl = document.getElementById('playerAuraValue');
  const rpEl = document.getElementById('playerRPValue');
  const tierEl = document.getElementById('playerTierValue');
  const tokenEl = document.getElementById('playerTokensValue');
  const panel = document.getElementById('playerProfilePanel');
  if (!auraEl || !rpEl || !tierEl || !tokenEl || !panel) return;

  const p = DataManager.getPlayerProfile();
  auraEl.textContent = String(p.aura || 0);
  rpEl.textContent = String(p.rankPoints || 0);
  tierEl.textContent = p.rankTier || 'Bronze';
  tokenEl.textContent = String(p.matchTokens || 0);
  panel.style.display = 'block';
  try { window.dispatchEvent(new CustomEvent('hc_profile_updated', { detail: p })); } catch(e) {}
}

window.updatePlayerProfileUI = updatePlayerProfileUI;
window.switchProgressIdentity = switchProgressIdentity;
window.persistCurrentProgressIdentity = persistCurrentProgressIdentity;

// Run storage migrations before any gameplay/state logic consumes persisted data.
DataMigration.run();

// ============================================================================
// AUTO-SAVE & PAGE LEAVE HANDLERS
// ============================================================================
function saveTournamentNow() {
  if (!TournamentState.format) return;
  Security.debouncedSave('tournament', () => {
    const id = DataManager.saveTournamentSlot(TournamentState);
    TournamentState._slotId = id;
    console.log('ðŸ’¾ Tournament auto-saved, slot:', id);
  }, 500);
}

setInterval(() => { 
  if (TournamentState.format) saveTournamentNow(); 
}, 60000);

function _onPageLeave() {
  console.log('ðŸ“¤ Page leave detected - saving state...');
  if (typeof isMatchLive !== 'undefined' && isMatchLive() && GameState.isTournament && GameState.currentMatch) {
    console.log('ðŸ”„ Auto-pausing live match...');
    if (typeof autoPauseIfLive !== 'undefined') autoPauseIfLive();
  }
  if (TournamentState.format) {
    console.log('ðŸ’¾ Saving tournament state...');
    DataManager.saveTournamentSlot(TournamentState);
  }
  try { if (typeof persistCurrentProgressIdentity === 'function') persistCurrentProgressIdentity(); } catch(e) {}
}

// âœ… FIX #6: Add all three event listeners for maximum reliability
window.addEventListener('beforeunload', _onPageLeave);
window.addEventListener('pagehide', _onPageLeave);
window.addEventListener('unload', _onPageLeave);  // âœ… ADDED
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    _onPageLeave();
  }
});

// Also save when page is visible
setInterval(() => {
  if (document.visibilityState === 'visible' && TournamentState.format) {
    saveTournamentNow();
  }
}, 30000);

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
const Utils = {
  getElement(id) { return document.getElementById(id); },
  getValue(id, def='') { const e=document.getElementById(id); return e?e.value:def; },
  setText(id, t) { const e=document.getElementById(id); if(e) e.textContent=t; },
  setHTML(id, h) { const e=document.getElementById(id); if(e) e.innerHTML=h; },
  sanitizeInput(s) { return Security.sanitizeInput(s); },
  
  parsePlayerList(s) {
    return s.split(',')
      .map(p => Security.sanitizeInput(p))
      .filter(Boolean)
      .slice(0, 22);
  },
  
  log(msg) {
    const el=document.getElementById('log');
    if(el){
      const p=document.createElement('p');
      p.textContent=msg;
      el.appendChild(p);
      el.scrollTop=el.scrollHeight;
    }
  },
  
  getBattingTeamIndex(inn) {
    const i=inn??GameState.currentInnings;
    return (i===0||i===2) ? 
      (GameState.userBattingFirst ? GameState.userTeamIndex : GameState.compTeamIndex) : 
      (GameState.userBattingFirst ? GameState.compTeamIndex : GameState.userTeamIndex);
  },
  
  toggleButtons(sel, en) { 
    document.querySelectorAll(sel).forEach(b=>b.disabled=!en); 
  },
  
  simulateMatch(t1, t2, overs=10) {
    const s=[0,0],w=[0,0];
    for(let i=0;i<overs*6&&w[0]<10;i++){
      const b=[3,4,5,6][Math.floor(Math.random()*4)];
      const bw=[4,5,6][Math.floor(Math.random()*3)];
      if(b===bw) w[0]++;
      else s[0]+=b;
    }
    for(let i=0;i<overs*6&&w[1]<10&&s[1]<s[0];i++){
      const b=[3,4,5,6][Math.floor(Math.random()*4)];
      const bw=[4,5,6][Math.floor(Math.random()*3)];
      if(b===bw) w[1]++;
      else s[1]+=b;
    }
    return {
      team1Score:s[0], team1Wickets:w[0],
      team2Score:s[1], team2Wickets:w[1],
      winner: s[1]>s[0] ? t2 : s[1]<s[0] ? t1 : 'tie'
    };
  }
};

function _openDialog(title, message, buttons) {
  return new Promise(resolve => {
    const modal = document.getElementById('appDialogModal');
    const t = document.getElementById('appDialogTitle');
    const m = document.getElementById('appDialogMessage');
    const row = document.getElementById('appDialogButtons');
    if (!modal || !t || !m || !row) {
      resolve(buttons && buttons[0] ? buttons[0].value : true);
      return;
    }
    t.textContent = title || 'Notice';
    m.textContent = message || '';
    row.innerHTML = '';
    buttons.forEach(b => {
      const btn = document.createElement('button');
      btn.textContent = b.label;
      btn.style.width = 'auto';
      btn.style.background = b.bg;
      btn.onclick = () => {
        modal.style.display = 'none';
        resolve(b.value);
      };
      row.appendChild(btn);
    });
    modal.style.display = 'flex';
  });
}

function uiAlert(message, title='Notice') {
  return _openDialog(title, message, [{ label: 'OK', value: true, bg: '#667eea' }]);
}

function uiConfirm(message, title='Confirm') {
  return _openDialog(title, message, [
    { label: 'Yes', value: true, bg: '#48bb78' },
    { label: 'Cancel', value: false, bg: '#718096' }
  ]);
}

window.uiAlert = uiAlert;
window.uiConfirm = uiConfirm;
function showToast(msg, bg) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = `position:fixed;top:70px;right:20px;background:${bg||'#667eea'};color:white;padding:14px 24px;border-radius:8px;z-index:9998;box-shadow:0 4px 12px rgba(0,0,0,0.2);font-weight:600;max-width:300px`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ============================================================================
// CRICKET TEAMS DATA
// ============================================================================
const CRICKET_TEAMS = {
  india:{name:"India",players:["Rohit Sharma","Virat Kohli","KL Rahul","Shreyas Iyer","Rishabh Pant","Hardik Pandya","Jasprit Bumrah","Bhuvneshwar Kumar","Yuzvendra Chahal","Mohammed Shami","Shardul Thakur"],tier:1},
  australia:{name:"Australia",players:["David Warner","Aaron Finch","Steve Smith","Glenn Maxwell","Pat Cummins","Mitchell Starc","Josh Hazlewood","Alex Carey","Marcus Stoinis","Nathan Lyon","Travis Head"],tier:1},
  england:{name:"England",players:["Joe Root","Ben Stokes","Jos Buttler","Jonny Bairstow","Eoin Morgan","Jofra Archer","Chris Woakes","Moeen Ali","Sam Curran","Mark Wood","Liam Livingstone"],tier:1},
  pakistan:{name:"Pakistan",players:["Babar Azam","Shaheen Afridi","Mohammad Rizwan","Fakhar Zaman","Shadab Khan","Haris Rauf","Mohammad Nawaz","Imad Wasim","Asif Ali","Hassan Ali","Wahab Riaz"],tier:1},
  southafrica:{name:"South Africa",players:["Quinton de Kock","Faf du Plessis","Temba Bavuma","Rassie van der Dussen","Kagiso Rabada","Anrich Nortje","Lungi Ngidi","David Miller","Aiden Markram","Dwaine Pretorius","Heinrich Klaasen"],tier:1},
  newzealand:{name:"New Zealand",players:["Kane Williamson","Trent Boult","Tim Southee","Devon Conway","Glenn Phillips","Mitchell Santner","Lockie Ferguson","Daryl Mitchell","Tom Latham","Matt Henry","Rachin Ravindra"],tier:1},
  westindies:{name:"West Indies",players:["Shai Hope","Nicholas Pooran","Shimron Hetmyer","Jason Holder","Alzarri Joseph","Akeal Hosein","Romario Shepherd","Kyle Mayers","Brandon King","Gudakesh Motie","Shamarh Brooks"],tier:2},
  srilanka:{name:"Sri Lanka",players:["Kusal Mendis","Pathum Nissanka","Charith Asalanka","Wanindu Hasaranga","Maheesh Theekshana","Kasun Rajitha","Dushmantha Chameera","Dasun Shanaka","Dunith Wellalage","Dilshan Madushanka","Sadeera Samarawickrama"],tier:2},
  bangladesh:{name:"Bangladesh",players:["Shakib Al Hasan","Mushfiqur Rahim","Litton Das","Mustafizur Rahman","Taskin Ahmed","Mehidy Hasan","Najmul Hossain","Towhid Hridoy","Shoriful Islam","Tanzid Hasan","Mahmudullah"],tier:2},
  afghanistan:{name:"Afghanistan",players:["Rashid Khan","Mohammad Nabi","Rahmanullah Gurbaz","Ibrahim Zadran","Mujeeb Ur Rahman","Fazalhaq Farooqi","Azmatullah Omarzai","Hashmatullah Shahidi","Najibullah Zadran","Naveen-ul-Haq","Gulbadin Naib"],tier:2},
  ireland:{name:"Ireland",players:["Paul Stirling","Andy Balbirnie","Harry Tector","Curtis Campher","George Dockrell","Mark Adair","Josh Little","Lorcan Tucker","Gareth Delany","Barry McCarthy","Craig Young"],tier:3},
  zimbabwe:{name:"Zimbabwe",players:["Sikandar Raza","Sean Williams","Blessing Muzarabani","Richard Ngarava","Ryan Burl","Regis Chakabva","Craig Ervine","Tendai Chatara","Wesley Madhevere","Luke Jongwe","Innocent Kaia"],tier:3},
  netherlands:{name:"Netherlands",players:["Scott Edwards","Bas de Leede","Paul van Meekeren","Logan van Beek","Roelof van der Merwe","Max O'Dowd","Colin Ackermann","Aryan Dutt","Vikramjit Singh","Teja Nidamanuru","Wesley Barresi"],tier:3},
  scotland:{name:"Scotland",players:["Richie Berrington","Kyle Coetzer","Calum MacLeod","Matthew Cross","Mark Watt","Brad Wheal","Chris Greaves","Michael Leask","Safyaan Sharif","Brandon McMullen","Chris Sole"],tier:3},
  uae:{name:"UAE",players:["Vriitya Aravind","Chirag Suri","Muhammad Waseem","Basil Hameed","Rohan Mustafa","Zahoor Khan","Junaid Siddique","Karthik Meiyappan","Aayan Khan","Ali Naseer","Alishan Sharafu"],tier:3},
  oman:{name:"Oman",players:["Zeeshan Maqsood","Aqib Ilyas","Jatinder Singh","Ayaan Khan","Bilal Khan","Kaleemullah","Mohammad Nadeem","Kashyap Prajapati","Shoaib Khan","Jay Odedra","Naseem Khushi"],tier:3}
};

const IPL_TEAMS = {
  csk:{name:"Chennai Super Kings",players:["MS Dhoni","Ruturaj Gaikwad","Ravindra Jadeja","Moeen Ali","Deepak Chahar","Dwayne Bravo","Ambati Rayudu","Faf du Plessis","Shardul Thakur","Mitchell Santner","Devon Conway"]},
  mi:{name:"Mumbai Indians",players:["Rohit Sharma","Ishan Kishan","Suryakumar Yadav","Kieron Pollard","Jasprit Bumrah","Trent Boult","Hardik Pandya","Krunal Pandya","Rahul Chahar","Quinton de Kock","Tim David"]},
  rcb:{name:"Royal Challengers Bangalore",players:["Virat Kohli","Faf du Plessis","Glenn Maxwell","Mohammed Siraj","Wanindu Hasaranga","Dinesh Karthik","Harshal Patel","Josh Hazlewood","Shahbaz Ahmed","Rajat Patidar","David Willey"]},
  kkr:{name:"Kolkata Knight Riders",players:["Shreyas Iyer","Andre Russell","Sunil Narine","Varun Chakravarthy","Nitish Rana","Venkatesh Iyer","Pat Cummins","Rahmanullah Gurbaz","Rinku Singh","Harshit Rana","Vaibhav Arora"]},
  dc:{name:"Delhi Capitals",players:["David Warner","Rishabh Pant","Axar Patel","Kuldeep Yadav","Anrich Nortje","Mitchell Marsh","Prithvi Shaw","Khaleel Ahmed","Ishant Sharma","Phil Salt","Mukesh Kumar"]},
  srh:{name:"Sunrisers Hyderabad",players:["Aiden Markram","Abhishek Sharma","Travis Head","Heinrich Klaasen","Abdul Samad","Bhuvneshwar Kumar","T Natarajan","Umran Malik","Washington Sundar","Marco Jansen","Mayank Agarwal"]},
  pbks:{name:"Punjab Kings",players:["Shikhar Dhawan","Jonny Bairstow","Liam Livingstone","Kagiso Rabada","Arshdeep Singh","Jitesh Sharma","Sam Curran","Rahul Chahar","Shahrukh Khan","Harpreet Brar","Shashank Singh"]},
  rr:{name:"Rajasthan Royals",players:["Sanju Samson","Jos Buttler","Yashasvi Jaiswal","Yuzvendra Chahal","Trent Boult","Ravichandran Ashwin","Shimron Hetmyer","Riyan Parag","Prasidh Krishna","Dhruv Jurel","Sandeep Sharma"]}
};

const PREDEFINED_TEAMS = {};
Object.keys(CRICKET_TEAMS).forEach(k => { 
  PREDEFINED_TEAMS[k] = CRICKET_TEAMS[k].players; 
});

console.log('âœ… Part 1 FIXED loaded: Core systems initialized with all bowling milestones');








function _animateFlashElement(id, text, ttlMs, extraClass) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text || '';
  el.classList.remove('show', 'gain', 'loss');
  if (extraClass) el.classList.add(extraClass);
  void el.offsetWidth;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), ttlMs || 1600);
}

function showAuraBurstAnimation(deltaAura) {
  if (!deltaAura) return;
  _animateFlashElement('auraBurstAnim', `${deltaAura > 0 ? '+' : ''}${deltaAura} Aura`, 1700);
}

function showCoinBankAnimation(deltaCoins) {
  if (!deltaCoins) return;
  _animateFlashElement('coinBankAnim', `${deltaCoins > 0 ? '+' : ''}${deltaCoins} Token${Math.abs(deltaCoins) === 1 ? '' : 's'}`, 1500);
}

function showRankGainAnimation(deltaRp, nextTier, prevTier) {
  if (!deltaRp && nextTier === prevTier) return;
  const text = `${deltaRp > 0 ? '+' : ''}${deltaRp || 0} RP${nextTier !== prevTier ? ` • ${nextTier}` : ''}`;
  _animateFlashElement('rankGainAnim', text, 1800);
}

function showMatchOutcomeAnimation(isWin, label) {
  const text = isWin ? `VICTORY • ${label || ''}` : `DEFEAT • ${label || ''}`;
  _animateFlashElement('matchOutcomeAnim', text.trim(), 1700, isWin ? 'gain' : 'loss');
}

function showWinFlagBackdrop(flagGlyph) {
  const el = document.getElementById('flagWinBackdrop');
  if (!el) return;
  const glyph = (flagGlyph && String(flagGlyph).trim()) || '??';
  el.innerHTML = `<span>${Security.escapeHtml(glyph)}</span><span>${Security.escapeHtml(glyph)}</span><span>${Security.escapeHtml(glyph)}</span><span>${Security.escapeHtml(glyph)}</span>`;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1900);
}

window.showAuraBurstAnimation = showAuraBurstAnimation;
window.showCoinBankAnimation = showCoinBankAnimation;
window.showRankGainAnimation = showRankGainAnimation;
window.showMatchOutcomeAnimation = showMatchOutcomeAnimation;
window.showWinFlagBackdrop = showWinFlagBackdrop;





function _wireAudioUX() {
  const unlock = () => {
    if (!Music.isPlaying) Music.start();
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
    window.removeEventListener('touchstart', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  window.addEventListener('touchstart', unlock, true);
  document.addEventListener('click', e => {
    const target = e.target;
    if (!target || !target.closest) return;
    if (target.closest('button')) Music.playSFX('click');
  }, true);
  Music._updateBtn();
}

if (typeof window !== 'undefined') _wireAudioUX();
