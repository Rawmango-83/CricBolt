// Hand Cricket - Part 4: Missing UI Functions & Firebase Integration
// Version 3.4.0 - Fixed Edition
// This file contains all the missing functions referenced in your HTML

'use strict';

// ============================================================================
// TOURNAMENT HISTORY DISPLAY
// ============================================================================
const TournamentHistory = {
  displayHistory() {
    const wins = DataManager.getWinHistory();
    const container = document.getElementById('historyContent');
    if (!container) return;
    
    if (!wins || wins.length === 0) {
      container.innerHTML = '<p style="font-style:italic;color:#718096">No tournaments won yet. Start playing!</p>';
      return;
    }
    
    const formatNames = {
      odiWorldCup: 'ODI World Cup',
      t20WorldCup: 'T20 World Cup',
      wtc: 'WTC Championship',
      ipl: 'IPL Trophy'
    };
    
    let html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:15px">';
    
    wins.slice(-8).reverse().forEach(w => {
      html += `<div style="background:linear-gradient(135deg,#667eea,#764ba2);color:white;padding:18px;border-radius:12px;text-align:center;box-shadow:0 4px 12px rgba(102,126,234,0.3)">
        <div style="font-size:2em;margin-bottom:8px">&#127942;</div>
        <div style="font-weight:700;margin-bottom:5px">${formatNames[w.format] || w.format}</div>
        <div style="font-size:13px;opacity:0.9">${Security.escapeHtml(w.teamName)}</div>
        <div style="font-size:11px;opacity:0.7;margin-top:5px">${new Date(w.date).toLocaleDateString()}</div>
      </div>`;
    });
    
    html += '</div>';
    container.innerHTML = html;
  }
};

// ============================================================================
// HISTORY MODAL FUNCTIONS
// ============================================================================
function openHistoryModal() {
  const modal = document.getElementById('historyModal');
  if (modal) {
    modal.style.display = 'flex';
    showHistoryTab('all');
  }
}

function closeHistoryModal() {
  const modal = document.getElementById('historyModal');
  if (modal) modal.style.display = 'none';
}

function _setHistoryModalMode(mode) {
  const allBtn = document.getElementById('htab-all');
  const tourBtn = document.getElementById('htab-tournaments');
  const statsBtn = document.getElementById('htab-stats');
  const leadBtn = document.getElementById('htab-leaderboard');
  const hofBtn = document.getElementById('htab-hof');
  const map = {
    history: ['all', 'tournaments'],
    career: ['stats'],
    leaderboard: ['leaderboard'],
    hof: ['hof'],
    all: ['all', 'tournaments', 'stats', 'leaderboard', 'hof']
  };
  const visible = map[mode] || map.all;
  const setVisible = (btn, key) => { if (btn) btn.style.display = visible.includes(key) ? 'inline-block' : 'none'; };
  setVisible(allBtn, 'all');
  setVisible(tourBtn, 'tournaments');
  setVisible(statsBtn, 'stats');
  setVisible(leadBtn, 'leaderboard');
  setVisible(hofBtn, 'hof');
}

function openMenuHistory() {
  _setHistoryModalMode('history');
  openHistoryModal();
  showHistoryTab('all');
  closeSideMenu();
}

function openMenuCareer() {
  _setHistoryModalMode('career');
  openHistoryModal();
  showHistoryTab('stats');
  closeSideMenu();
}

function openMenuLeaderboard() {
  _setHistoryModalMode('leaderboard');
  openHistoryModal();
  showHistoryTab('leaderboard');
  closeSideMenu();
}

function openMenuRanked() {
  closeSideMenu();
  if (typeof openRankedModal === 'function') openRankedModal();
}

function openMenuClan() {
  closeSideMenu();
  if (typeof openClanModal === 'function') openClanModal();
}

function openMenuResume() {
  closeSideMenu();
  if (typeof openResumeModal === 'function') openResumeModal();
}

function openMenuFriends() {
  closeSideMenu();
  if (typeof openFriendModal === 'function') openFriendModal();
}

function toggleSideMenu() {
  const drawer = document.getElementById('sideMenuDrawer');
  const backdrop = document.getElementById('sideMenuBackdrop');
  if (!drawer || !backdrop) return;
  const open = drawer.classList.contains('open');
  if (open) {
    drawer.classList.remove('open');
    backdrop.classList.remove('show');
  } else {
    drawer.classList.add('open');
    backdrop.classList.add('show');
  }
}

function closeSideMenu() {
  const drawer = document.getElementById('sideMenuDrawer');
  const backdrop = document.getElementById('sideMenuBackdrop');
  if (drawer) drawer.classList.remove('open');
  if (backdrop) backdrop.classList.remove('show');
}

function showHistoryTab(tab) {
  // Update active tab button
  document.querySelectorAll('.htab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  const activeBtn = document.getElementById('htab-' + tab);
  if (activeBtn) activeBtn.classList.add('active');
  
  const content = document.getElementById('historyTabContent');
  if (!content) return;
  
  if (tab === 'all') {
    renderAllMatches(content);
  } else if (tab === 'tournaments') {
    renderTournamentWins(content);
  } else if (tab === 'stats') {
    renderCareerStats(content);
  } else if (tab === 'leaderboard') {
    renderLeaderboard(content);
  } else if (tab === 'hof') {
    renderHallOfFame(content);
  }
}

function renderAllMatches(container) {
  const matches = DataManager.getMatchHistory();

  if (!matches || matches.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:#a0aec0;padding:40px">No matches played yet</p>';
    return;
  }

  let html = '<div style="max-height:500px;overflow-y:auto">';

  matches.slice().reverse().forEach(m => {
    const resultColor = m.result === 'won' ? '#48bb78' : m.result === 'lost' ? '#ef4444' : '#f59e0b';
    const resultText = m.result === 'won' ? 'WON' : m.result === 'lost' ? 'LOST' : 'DRAW';

    html += `<div style="background:#f7fafc;padding:16px;border-radius:8px;margin-bottom:10px;border-left:4px solid ${resultColor}">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
        <div>
          <strong style="color:#2d3748">${Security.escapeHtml(m.teamNames[0])} vs ${Security.escapeHtml(m.teamNames[1])}</strong>
          ${m.tournament ? '<span style="background:#667eea;color:white;padding:2px 8px;border-radius:4px;font-size:11px;margin-left:8px">Tournament</span>' : ''}
        </div>
        <span style="color:${resultColor};font-weight:700;font-size:14px">${resultText}</span>
      </div>
      <div style="font-size:13px;color:#718096">
        <span>${m.date}</span>
        <span style="margin-left:15px">${m.format || 'Custom'}</span>
        <span style="margin-left:15px">${m.userRuns}/${m.userWickets} vs ${m.oppRuns}/${m.oppWickets}</span>
      </div>
    </div>`;
  });

  html += '</div>';
  container.innerHTML = html;
}

function renderTournamentWins(container) {
  const wins = DataManager.getWinHistory();
  
  if (!wins || wins.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:#a0aec0;padding:40px">No tournament victories yet</p>';
    return;
  }
  
  const formatNames = {
    odiWorldCup: 'ODI World Cup',
    t20WorldCup: 'T20 World Cup',
    wtc: 'World Test Championship',
    ipl: 'Indian Premier League'
  };
  
  let html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:20px">';
  
  wins.slice().reverse().forEach(w => {
    html += `<div style="background:linear-gradient(135deg,#667eea,#764ba2);color:white;padding:25px;border-radius:15px;text-align:center;box-shadow:0 6px 20px rgba(102,126,234,0.4)">
      <div style="font-size:3em;margin-bottom:10px"></div>
      <h3 style="color:white;margin-bottom:8px">${formatNames[w.format] || w.format}</h3>
      <div style="font-size:16px;font-weight:600;margin-bottom:5px">${Security.escapeHtml(w.teamName)}</div>
      <div style="font-size:13px;opacity:0.8">${new Date(w.date).toLocaleDateString('en-US', {year: 'numeric', month: 'long', day: 'numeric'})}</div>
    </div>`;
  });
  
  html += '</div>';
  container.innerHTML = html;
}

function renderCareerStats(container) {
  const stats = DataManager.getCareerStats();
  const winRate = stats.totalMatches > 0 ? ((stats.won / stats.totalMatches) * 100).toFixed(1) : 0;

  let html = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:15px;margin-bottom:25px">
      ${[
        ['Total Matches', stats.totalMatches, '#667eea'],
        ['Won', stats.won, '#48bb78'],
        ['Lost', stats.lost, '#ef4444'],
        ['Drawn', stats.drawn, '#f59e0b']
      ].map(([label, value, color]) => `
        <div style="background:${color};color:white;padding:20px;border-radius:12px;text-align:center">
          <div style="font-size:2.5em;font-weight:800;line-height:1">${value}</div>
          <div style="opacity:0.9;margin-top:8px;font-size:14px">${label}</div>
        </div>
      `).join('')}
    </div>

    <div style="background:#f7fafc;padding:25px;border-radius:12px;margin-bottom:20px;border-left:4px solid #667eea">
      <h4 style="color:#2d3748;margin-bottom:15px">Batting Performance</h4>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:15px">
        ${[
          ['Total Runs', stats.totalRuns],
          ['Highest Score', stats.highestScore],
          ['Centuries', stats.centuries || 0],
          ['Half-Centuries', stats.fifties || 0],
          ['Win Rate', winRate + '%']
        ].map(([l, v]) => `<div><div style="color:#718096;font-size:13px">${l}</div><div style="font-size:28px;font-weight:700;color:#2d3748">${v}</div></div>`).join('')}
      </div>
    </div>

    <div style="background:#f7fafc;padding:25px;border-radius:12px;border-left:4px solid #f59e0b">
      <h4 style="color:#2d3748;margin-bottom:15px">Bowling Performance</h4>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:15px">
        ${[
          ['Wickets Taken', stats.totalWickets],
          ['Hat-Tricks', stats.hattricks || 0],
          ['3-Wkt Hauls', stats.threeWickets || 0],
          ['5-Wkt Hauls', stats.fiveWickets || 0],
          ['10-Wkt Hauls', stats.tenWickets || 0]
        ].map(([l, v]) => `<div><div style="color:#718096;font-size:13px">${l}</div><div style="font-size:28px;font-weight:700;color:#2d3748">${v}</div></div>`).join('')}
      </div>
    </div>
  `;

  container.innerHTML = html;
}

function renderLeaderboard(container) {
  container.innerHTML = `
    <div style="text-align:center;padding:30px 20px;color:#64748b">
      <div style="font-size:2.8em;margin-bottom:10px"></div>
      <h3 style="color:#334155;margin-bottom:6px">Global Leaderboard</h3>
      <p style="max-width:520px;margin:0 auto;line-height:1.6">
        Top players by Rank Points, then Aura. Loading latest standings...
      </p>
    </div>
    <div id="globalLeaderboardBody" style="padding:0 6px 12px 6px"></div>
  `;

  const body = document.getElementById('globalLeaderboardBody');
  if (!body) return;

  if (!(firebaseInitialized && db)) {
    body.innerHTML = '<p style="text-align:center;color:#a0aec0;padding:20px">Cloud leaderboard unavailable in local mode.</p>';
    return;
  }

  if (currentUser) publishLeaderboardProfileToCloud();

  db.collection('handCricketProgress').limit(300).get()
    .then(snap => {
      const byIdentity = new Map();
      snap.docs.forEach(d => {
        const data = d.data() || {};
        const profile = data.playerProfile || {};
        const row = {
          uid: d.id,
          email: _normalizedEmail(data.googleEmail || data.email || data.userEmail),
          name: data.userName || data.displayName || 'Player',
          rankPoints: Number(data.rankPoints != null ? data.rankPoints : (profile.rankPoints || 0)),
          aura: Number(data.aura != null ? data.aura : (profile.aura || 0)),
          rankTier: data.rankTier || profile.rankTier || 'Bronze',
          matches: Number(data.totalMatches != null ? data.totalMatches : (profile.rankedMatches || 0)),
          lastSyncMs: Date.parse(data.lastSync || '') || Number(data.updatedAtMs || 0) || 0
        };
        const key = row.email || row.uid;
        const prev = byIdentity.get(key);
        if (!prev) {
          byIdentity.set(key, row);
          return;
        }
        const better = (row.rankPoints > prev.rankPoints)
          || (row.rankPoints === prev.rankPoints && row.aura > prev.aura)
          || (row.rankPoints === prev.rankPoints && row.aura === prev.aura && row.matches > prev.matches)
          || (row.rankPoints === prev.rankPoints && row.aura === prev.aura && row.matches === prev.matches && row.lastSyncMs > prev.lastSyncMs);
        if (better) byIdentity.set(key, row);
      });

      const rows = Array.from(byIdentity.values()).sort((a, b) => {
        if (b.rankPoints !== a.rankPoints) return b.rankPoints - a.rankPoints;
        if (b.aura !== a.aura) return b.aura - a.aura;
        if (b.matches !== a.matches) return b.matches - a.matches;
        return b.lastSyncMs - a.lastSyncMs;
      }).slice(0, 100);

      if (!rows.length) {
        body.innerHTML = `
          <div style="text-align:center;color:#94a3b8;padding:20px">
            No players on leaderboard yet. ${currentUser ? 'Play a match or click Save to publish your profile.' : 'Sign in and save progress to join.'}
          </div>
        `;
        return;
      }

      let html = '<div style="display:grid;gap:8px">';
      rows.forEach((r, idx) => {
        const medal = idx === 0 ? '&#129351;' : idx === 1 ? '&#129352;' : idx === 2 ? '&#129353;' : ('#' + (idx + 1));
        const mine = !!(currentUser && (currentUser.uid === r.uid || _normalizedEmail(currentUser.email || '') === _normalizedEmail(r.email || '')));
        html += `
          <div style="display:grid;grid-template-columns:70px 1fr auto;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;border:1px solid ${mine ? '#60a5fa' : '#e2e8f0'};background:${mine ? '#eff6ff' : '#f8fafc'}">
            <div style="font-weight:800;color:${idx < 3 ? '#b45309' : '#475569'}">${medal}</div>
            <div>
              <div style="font-weight:700;color:#1f2937">${Security.escapeHtml(r.name)} ${mine ? '<span style="font-size:11px;color:#2563eb">(You)</span>' : ''}</div>
              <div style="font-size:12px;color:#64748b">${Security.escapeHtml(r.rankTier)} • Aura ${r.aura} • Matches ${r.matches}</div>
            </div>
            <div style="font-size:18px;font-weight:800;color:#0f172a">${r.rankPoints} RP</div>
          </div>
        `;
      });
      html += '</div>';
      body.innerHTML = html;
    })
    .catch(err => {
      console.error('leaderboard load error:', err);
      body.innerHTML = '<p style="text-align:center;color:#ef4444;padding:18px">Could not load leaderboard right now.</p>';
    });
}
function clearAllHistoryData() {
  DataManager.clearAll();
}

// ============================================================================
// RESUME TOURNAMENT MODAL
// ============================================================================
function openResumeModal() {
  const modal = document.getElementById('resumeModal');
  const list = document.getElementById('resumeList');
  if (!modal || !list) return;

  const tournaments = DataManager.getPendingTournaments();
  if (!tournaments.length) {
    list.innerHTML = '<p style="text-align:center;color:#a0aec0">No saved tournaments found</p>';
    modal.style.display = 'flex';
    return;
  }

  const formatNames = { odiWorldCup:'ODI World Cup', t20WorldCup:'T20 World Cup', wtc:'World Test Championship', ipl:'Indian Premier League' };
  const stageNames = { challengeLeague:'Challenge League', super6:'Super 6', qualifier:'Qualifier', worldCup:'World Cup', wtc:'WTC League', ipl:'IPL' };

  list.innerHTML = tournaments.map(t => `<div style="background:#f7fafc;padding:18px;border-radius:10px;margin-bottom:12px;border-left:4px solid #667eea;cursor:pointer;transition:all 0.2s" onclick="resumeTournamentSlot('${Security.escapeHtml(String(t.id))}')" onmouseover="this.style.background='#edf2f7'" onmouseout="this.style.background='#f7fafc'">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
        <div>
          <strong style="color:#2d3748;font-size:16px">${formatNames[t.format] || t.format}</strong>
          <div style="color:#667eea;font-size:14px;margin-top:4px">${Security.escapeHtml(t.teamName)}</div>
        </div>
        <span style="background:#667eea;color:white;padding:4px 10px;border-radius:6px;font-size:12px">${stageNames[t.stage] || t.stage}</span>
      </div>
      <div style="font-size:12px;color:#718096">
        <span>Started: ${t.startDate}</span><br>
        <span>Last saved: ${t.lastSaved}</span>
      </div>
    </div>`).join('');

  modal.style.display = 'flex';
}

function closeResumeModal() {
  const modal = document.getElementById('resumeModal');
  if (modal) modal.style.display = 'none';
}

function resumeTournamentSlot(slotId) {
  const key = String(slotId || '').trim();
  let slot = DataManager.loadTournamentSlot(key);
  if (!slot && /^\d+$/.test(key)) slot = DataManager.loadTournamentSlot(Number(key));
  if (!slot) {
    uiAlert('Tournament not found!', 'Resume Tournament');
    return;
  }

  const ts = slot.tournamentState;
  Object.keys(ts).forEach(k => { TournamentState[k] = ts[k]; });

  closeResumeModal();
  showSection('tournament');

  const titles = {
    odiWorldCup: 'ODI World Cup',
    t20WorldCup: 'T20 World Cup',
    wtc: 'World Test Championship',
    ipl: 'Indian Premier League'
  };

  Utils.setText('tournamentTitle', titles[TournamentState.format] || 'Tournament');

  const nav = Utils.getElement('tournamentNav');
  const sb = Utils.getElement('statsCornerBtn');
  if (TournamentState.format === 'wtc' || TournamentState.format === 'ipl') {
    if (nav) nav.style.display = 'none';
    if (sb) sb.style.display = 'block';
  } else {
    if (nav) nav.style.display = 'flex';
    if (sb) sb.style.display = 'none';
  }

  if (TournamentState.format === 'wtc') showWTCStage();
  else if (TournamentState.format === 'ipl') showIPLStage();
  else showTournamentStage(TournamentState.currentStage);

  showToast('Tournament resumed!', '#48bb78');
}

// ============================================================================
// FIREBASE AUTHENTICATION
// ============================================================================
const ACTIVE_SESSION_COLLECTION = 'hc_activeSessions';
const ACTIVE_SESSION_TTL_MS = 120000;
let _activeSessionId = null;
let _activeSessionHeartbeat = null;
let _activeSessionWatchUnsub = null;

function _getActiveSessionId(){
  try {
    let sid = sessionStorage.getItem('hc_active_session_id');
    if (!sid) {
      sid = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem('hc_active_session_id', sid);
    }
    return sid;
  } catch(e){
    return 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  }
}

function _clearActiveSessionTimers(){
  if (_activeSessionHeartbeat) { clearInterval(_activeSessionHeartbeat); _activeSessionHeartbeat = null; }
  if (_activeSessionWatchUnsub) { _activeSessionWatchUnsub(); _activeSessionWatchUnsub = null; }
}

async function clearActiveSessionState(forceUid){
  try {
    _clearActiveSessionTimers();
    if (!(firebaseInitialized && db)) return;
    const uid = forceUid || (currentUser && currentUser.uid);
    if (!uid || !_activeSessionId) return;
    const ref = db.collection(ACTIVE_SESSION_COLLECTION).doc(uid);
    const snap = await ref.get();
    if (!snap.exists) return;
    const d = snap.data() || {};
    if (d.sessionId === _activeSessionId) {
      await ref.delete().catch(()=>{});
    }
  } catch(e){
    console.error('clear active session error:', e);
  }
}

async function enforceSingleActiveSession(user){
  if (!(firebaseInitialized && db && user && user.uid)) return true;
  const uid = user.uid;
  const sid = _getActiveSessionId();
  _activeSessionId = sid;
  const ref = db.collection(ACTIVE_SESSION_COLLECTION).doc(uid);
  const now = Date.now();

  try {
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const d = snap.exists ? (snap.data() || {}) : {};
      const existingSid = String(d.sessionId || '');
      const existingTs = Number(d.lastSeenMs || 0);
      const activeElsewhere = existingSid && existingSid !== sid && (now - existingTs) < ACTIVE_SESSION_TTL_MS;
      if (activeElsewhere) throw new Error('session-active-elsewhere');
      tx.set(ref, {
        uid,
        sessionId: sid,
        userName: getPublicUserName(),
        lastSeenMs: now,
        userAgent: String(navigator.userAgent || '').slice(0, 160),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    });
  } catch(e){
    if (String(e && e.message) === 'session-active-elsewhere') {
      await uiAlert('This Google account is already active on another device/browser. Sign out there first.', 'Active Session Detected');
      auth.signOut().catch(()=>{});
      return false;
    }
    console.error('enforce single session error:', e);
    return true;
  }

  _clearActiveSessionTimers();
  _activeSessionHeartbeat = setInterval(() => {
    if (!(firebaseInitialized && db && currentUser && currentUser.uid === uid && _activeSessionId === sid)) return;
    ref.set({ lastSeenMs: Date.now(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }).catch(()=>{});
  }, 15000);

  _activeSessionWatchUnsub = ref.onSnapshot(snap => {
    if (!snap.exists) return;
    const d = snap.data() || {};
    const liveSid = String(d.sessionId || '');
    if (liveSid && liveSid !== sid) {
      uiAlert('Your account was opened elsewhere. This session will sign out now.', 'Session Switched');
      auth.signOut().catch(()=>{});
    }
  }, ()=>{});

  return true;
}

window.enforceSingleActiveSession = enforceSingleActiveSession;
window.clearActiveSessionState = clearActiveSessionState;
window.addEventListener('beforeunload', () => {
  if (currentUser && currentUser.uid) clearActiveSessionState(currentUser.uid);
});

function signInWithGoogle() {
  if (!firebaseInitialized || !auth) {
    uiAlert('Firebase not initialized. Using local storage only.', 'Cloud Sync');
    return;
  }
  
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider)
    .then(() => {
      showToast('? Signed in successfully!', '#48bb78');
    })
    .catch(error => {
      console.error('Sign in error:', error);
      uiAlert('Sign in failed: ' + error.message, 'Sign In Error');
    });
}

function signOutUser() {
  if (!auth) return;
  const uid = currentUser && currentUser.uid ? currentUser.uid : null;
  clearActiveSessionState(uid).finally(() => {
    auth.signOut()
      .then(() => {
        showToast('Signed out successfully', '#718096');
      })
      .catch(error => {
        console.error('Sign out error:', error);
      });
  });
}

function _normalizedEmail(v){
  return String(v || '').trim().toLowerCase();
}

function _usernameKey(name){
  return String(name || '').trim().toLowerCase();
}

function getPublicUserName(){
  const local = String(localStorage.getItem('hc_username') || '').trim();
  if (local) return local;
  const cloud = String(localStorage.getItem('hc_cloud_username') || '').trim();
  if (cloud) return cloud;
  if (currentUser && currentUser.displayName) return String(currentUser.displayName).trim();
  return 'Player';
}

async function saveUsername(){
  if (!(firebaseInitialized && db && currentUser)) {
    await uiAlert('Sign in first to set username.', 'Username');
    return;
  }

  const input = document.getElementById('usernameInput');
  const saveBtn = document.getElementById('usernameSaveBtn');
  const raw = Security.sanitizeInput((input && input.value) || '').trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(raw)) {
    await uiAlert('Username must be 3-16 chars: letters, numbers, underscore only.', 'Username');
    return;
  }

  const meRef = db.collection('handCricketProgress').doc(currentUser.uid);
  let existingName = '';
  let isLocked = false;
  try {
    const meSnap = await meRef.get();
    const mine = meSnap.exists ? (meSnap.data() || {}) : {};
    existingName = Security.sanitizeInput(String(mine.userName || '')).trim();
    isLocked = !!(mine.usernameLocked || existingName);
  } catch (e) {
    console.warn('Could not read current username lock state:', e);
  }

  if (isLocked && existingName && existingName.toLowerCase() !== raw.toLowerCase()) {
    await uiAlert('Username is already set and cannot be changed.', 'Username Locked');
    if (input) {
      input.value = existingName;
      input.disabled = true;
    }
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Username Locked';
    }
    localStorage.setItem('hc_username', existingName);
    localStorage.setItem('hc_cloud_username', existingName);
    localStorage.setItem('hc_username_locked', '1');
    return;
  }

  const nameKey = _usernameKey(raw);
  const mapRef = db.collection('hc_usernames').doc(nameKey);

  try {
    await db.runTransaction(async tx => {
      const [mapSnap, meSnap] = await Promise.all([tx.get(mapRef), tx.get(meRef)]);
      const owner = mapSnap.exists ? (mapSnap.data() || {}) : null;
      if (owner && owner.uid && owner.uid !== currentUser.uid) throw new Error('username-taken');

      const mine = meSnap.exists ? (meSnap.data() || {}) : {};
      const mineName = Security.sanitizeInput(String(mine.userName || '')).trim();
      const mineLocked = !!(mine.usernameLocked || mineName);
      if (mineLocked && mineName && mineName.toLowerCase() !== raw.toLowerCase()) {
        throw new Error('username-locked');
      }

      tx.set(mapRef, {
        uid: currentUser.uid,
        userName: raw,
        updatedAtMs: Date.now()
      }, { merge: true });

      tx.set(meRef, {
        userName: raw,
        displayName: raw,
        googleEmail: _normalizedEmail(currentUser.email || ''),
        userId: currentUser.uid,
        usernameLocked: true,
        updatedAtMs: Date.now()
      }, { merge: true });
    });
  } catch (e) {
    const msg = String(e && e.message);
    if (msg === 'username-taken') {
      await uiAlert('That username is already taken. Try another one.', 'Username');
      return;
    }
    if (msg === 'username-locked') {
      await uiAlert('Username is already set and cannot be changed.', 'Username Locked');
      return;
    }
    console.error('save username transaction error:', e);
    await uiAlert('Could not save username right now.', 'Username');
    return;
  }

  localStorage.setItem('hc_username', raw);
  localStorage.setItem('hc_cloud_username', raw);
  localStorage.setItem('hc_username_locked', '1');
  const nameEl = document.getElementById('userName');
  if (nameEl) nameEl.textContent = raw;
  if (input) {
    input.value = raw;
    input.disabled = true;
  }
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Username Locked';
  }
  showToast('Username set successfully.', '#16a34a');
  publishLeaderboardProfileToCloud();
}

function updateAuthUI() {
  const signedIn = document.getElementById('signedInView');
  const signedOut = document.getElementById('signedOutView');

  if (!signedIn || !signedOut) return;

  if (currentUser) {
    signedOut.style.display = 'none';
    signedIn.style.display = 'block';

    const photoEl = document.getElementById('userPhoto');
    const nameEl = document.getElementById('userName');
    const emailEl = document.getElementById('userEmail');

    if (photoEl) photoEl.src = currentUser.photoURL || 'https://via.placeholder.com/50';
    const chosenName = getPublicUserName();
    if (nameEl) nameEl.textContent = chosenName || 'User';

    const usernameInput = document.getElementById('usernameInput');
    const saveBtn = document.getElementById('usernameSaveBtn');
    const locked = localStorage.getItem('hc_username_locked') === '1';
    if (usernameInput) {
      usernameInput.value = chosenName || '';
      usernameInput.disabled = locked;
    }
    if (saveBtn) {
      saveBtn.disabled = locked;
      saveBtn.textContent = locked ? 'Username Locked' : 'Set Username';
    }

    if (emailEl) emailEl.textContent = currentUser.email || '';

    publishLeaderboardProfileToCloud();
  } else {
    signedOut.style.display = 'block';
    signedIn.style.display = 'none';
  }
}

function _normalizeArray(v){
  return Array.isArray(v) ? v : [];
}

function _dedupeByKey(items, keyFn){
  const out = [];
  const seen = new Set();
  _normalizeArray(items).forEach(x => {
    const k = keyFn(x);
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(x);
  });
  return out;
}

function _buildLocalProgressSnapshot(){
  return {
    tournaments: DataManager.getTournaments(),
    matchHistory: DataManager.getMatchHistory(),
    careerStats: DataManager.getCareerStats(),
    winHistory: DataManager.getWinHistory(),
    playerProfile: DataManager.getPlayerProfile()
  };
}

function _mergeProgressSnapshots(localSnap, cloudSnap){
  const local = localSnap || {};
  const cloud = cloudSnap || {};

  const matchHistory = _dedupeByKey([
    ..._normalizeArray(cloud.matchHistory),
    ..._normalizeArray(local.matchHistory)
  ], m => String((m && m.id) || '') + '|' + String((m && m.date) || '') + '|' + String((m && (m.teamNames||[]).join('-')) || ''));

  const tournaments = _dedupeByKey([
    ..._normalizeArray(cloud.tournaments),
    ..._normalizeArray(local.tournaments)
  ], t => String((t && t.id) || '') || String((t && t.startDate) || '') + '|' + String((t && t.teamKey) || ''));

  const winHistory = _dedupeByKey([
    ..._normalizeArray(cloud.winHistory),
    ..._normalizeArray(local.winHistory)
  ], w => String((w && w.date) || '') + '|' + String((w && w.format) || '') + '|' + String((w && w.teamKey) || ''));

  const localCareer = local.careerStats || {};
  const cloudCareer = cloud.careerStats || {};
  const localMatches = Number(localCareer.totalMatches || 0);
  const cloudMatches = Number(cloudCareer.totalMatches || 0);
  const careerStats = cloudMatches > localMatches ? cloudCareer : (localMatches > cloudMatches ? localCareer : {
    ...cloudCareer,
    ...localCareer,
    totalMatches: Math.max(localMatches, cloudMatches),
    won: Math.max(Number(localCareer.won||0), Number(cloudCareer.won||0)),
    lost: Math.max(Number(localCareer.lost||0), Number(cloudCareer.lost||0)),
    drawn: Math.max(Number(localCareer.drawn||0), Number(cloudCareer.drawn||0)),
    totalRuns: Math.max(Number(localCareer.totalRuns||0), Number(cloudCareer.totalRuns||0)),
    totalWickets: Math.max(Number(localCareer.totalWickets||0), Number(cloudCareer.totalWickets||0)),
    highestScore: Math.max(Number(localCareer.highestScore||0), Number(cloudCareer.highestScore||0))
  });

  const lp = local.playerProfile || {};
  const cp = cloud.playerProfile || {};
  const rankPoints = Math.max(Number(lp.rankPoints || 0), Number(cp.rankPoints || 0));
  const aura = Math.max(Number(lp.aura || 0), Number(cp.aura || 0));
  const matchTokens = Math.max(Number(lp.matchTokens || 0), Number(cp.matchTokens || 0));
  const rankedMatches = Math.max(Number(lp.rankedMatches || 0), Number(cp.rankedMatches || 0));
  const totalRewardsEarned = Math.max(Number(lp.totalRewardsEarned || 0), Number(cp.totalRewardsEarned || 0));
  const rankTier = (typeof DataManager._resolveRankTier === 'function') ? DataManager._resolveRankTier(rankPoints) : (lp.rankTier || cp.rankTier || 'Bronze');

  const playerProfile = {
    ...cp,
    ...lp,
    rankPoints,
    aura,
    matchTokens,
    rankedMatches,
    totalRewardsEarned,
    rankTier,
    lastUpdated: new Date().toISOString()
  };

  return { tournaments, matchHistory, careerStats, winHistory, playerProfile };
}

function _applyProgressSnapshotToLocal(snap){
  const s = snap || {};
  localStorage.setItem('hc_tournaments', JSON.stringify(_normalizeArray(s.tournaments)));
  localStorage.setItem('hc_matchHistory', JSON.stringify(_normalizeArray(s.matchHistory)));
  localStorage.setItem('hc_careerStats', JSON.stringify(s.careerStats || DataManager.getCareerStats()));
  localStorage.setItem('handCricketHistory', JSON.stringify(_normalizeArray(s.winHistory)));
  localStorage.setItem('hc_playerProfile', JSON.stringify(s.playerProfile || DataManager.getPlayerProfile()));
  try { if (typeof persistCurrentProgressIdentity === 'function') persistCurrentProgressIdentity(); } catch(e) {}
}

let _cloudSyncTimer = null;
function queueCloudProgressSync(reason){
  if (_cloudSyncTimer) clearTimeout(_cloudSyncTimer);
  _cloudSyncTimer = setTimeout(() => {
    syncProgressToCloud(reason || 'auto', true).catch(() => {});
  }, 700);
}
window.queueCloudProgressSync = queueCloudProgressSync;

async function syncProgressToCloud(reason, silent){
  if (!firebaseInitialized || !db || !currentUser) return null;
  const ref = db.collection('handCricketProgress').doc(currentUser.uid);
  const localSnap = _buildLocalProgressSnapshot();
  const cloudDoc = await ref.get().catch(() => null);
  const cloudSnap = cloudDoc && cloudDoc.exists ? (cloudDoc.data() || {}) : {};
  const merged = _mergeProgressSnapshots(localSnap, cloudSnap);
  _applyProgressSnapshotToLocal(merged);

  const explicitUserName = String(localStorage.getItem('hc_username') || localStorage.getItem('hc_cloud_username') || '').trim();
  const uname = explicitUserName || String((currentUser && currentUser.displayName) || 'Player').trim();
  const localUsernameLocked = localStorage.getItem('hc_username_locked') === '1';
  const payload = {
    userId: currentUser.uid,
    userName: uname,
    displayName: uname,
    usernameLocked: !!localUsernameLocked,
    googleEmail: _normalizedEmail(currentUser.email || ''),
    photoURL: currentUser.photoURL || '',
    tournaments: (merged.tournaments||[]).map(t=>({ id:t.id, format:t.format, teamKey:t.teamKey, teamName:t.teamName, stage:t.stage, startDate:t.startDate, lastSaved:t.lastSaved, dataVersion:t.dataVersion })),
    matchHistory: merged.matchHistory,
    careerStats: merged.careerStats,
    winHistory: merged.winHistory,
    playerProfile: merged.playerProfile,
    rankPoints: Number((merged.playerProfile||{}).rankPoints || 0),
    aura: Number((merged.playerProfile||{}).aura || 0),
    rankTier: (merged.playerProfile||{}).rankTier || 'Bronze',
    totalMatches: Number((merged.careerStats||{}).totalMatches || 0),
    lastSync: new Date().toISOString(),
    dataVersion: APP_VERSION,
    syncReason: String(reason || 'manual')
  };

  await ref.set(payload, { merge: true });
  if (!silent) showToast('Progress synced to cloud.', '#48bb78');
  return payload;
}

function saveProgressToCloud() {
  if (!firebaseInitialized || !db || !currentUser) {
    uiAlert('Please sign in first!', 'Sign In Required');
    return;
  }
  syncProgressToCloud('manual-save', false)
    .then(() => {
      const lastSyncEl = document.getElementById('lastSyncTime');
      if (lastSyncEl) lastSyncEl.textContent = ' Last synced: ' + new Date().toLocaleString();
      publishLeaderboardProfileToCloud();
    })
    .catch(error => {
      console.error('Cloud save error:', error);
      uiAlert('Failed to save: ' + error.message, 'Save Error');
    });
}

function loadProgressFromCloud() {
  if (!firebaseInitialized || !db || !currentUser) return;
  syncProgressToCloud('load-merge', true)
    .then(data => {
      if (data && data.userName) {
        localStorage.setItem('hc_username', String(data.userName));
        localStorage.setItem('hc_cloud_username', String(data.userName));
      }
      if (data && data.userName) {
        if (data.usernameLocked) localStorage.setItem('hc_username_locked', '1');
        else localStorage.removeItem('hc_username_locked');
      } else {
        localStorage.removeItem('hc_username_locked');
      }
      const lastSyncEl = document.getElementById('lastSyncTime');
      if (lastSyncEl) lastSyncEl.textContent = ' Last synced: ' + new Date().toLocaleString();
      TournamentHistory.displayHistory();
      checkResumeBtnVisibility();
      updatePlayerProfileUI();
      updateAuthUI();
      showToast('Progress loaded from cloud!', '#48bb78');
    })
    .catch(error => {
      console.error('Cloud load error:', error);
    });
}

// ============================================================================
// PDF DOWNLOAD
// ============================================================================
function downloadPDF() {
  if (typeof jspdf === 'undefined' || !jspdf.jsPDF) {
    uiAlert('PDF library not loaded!', 'PDF Error');
    return;
  }
  
  const { jsPDF } = jspdf;
  const doc = new jsPDF();
  
  // Title
  doc.setFontSize(20);
  doc.setTextColor(102, 126, 234);
  doc.text('Hand Cricket - Match Scorecard', 20, 20);
  
  // Match Details
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  let y = 35;
  
  doc.text(`${GameState.teamNames[0]} vs ${GameState.teamNames[1]}`, 20, y);
  y += 10;
  doc.text(`Format: ${GameState.matchMode.toUpperCase()} | Overs: ${GameState.overs}`, 20, y);
  y += 15;
  
  // Innings scores
  for (let i = 0; i < 4; i++) {
    const ti = Utils.getBattingTeamIndex(i);
    if (GameState.scores[i] === 0 && GameState.wickets[i] === 0 && GameState.ballsBowled[i] === 0) continue;
    
    doc.setFontSize(14);
    doc.setTextColor(102, 126, 234);
    doc.text(`${GameState.teamNames[ti]} - Innings ${(i % 2) + 1}: ${GameState.scores[i]}/${GameState.wickets[i]}`, 20, y);
    y += 8;
    
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    
    // Batsmen
    for (let p = 0; p < GameState.teamPlayers[ti].length; p++) {
      const s = GameState.batsmenStats[i][p];
      if (!s || s.balls === 0) continue;
      
      const pName = GameState.teamPlayers[ti][p] || ('Batsman ' + (p + 1));
      const isOut = p < GameState.wickets[i];
      const txt = isOut ? `${pName}: ${s.runs}(${s.balls})` : `${pName}*: ${s.runs}(${s.balls}) not out`;
      
      doc.text(txt, 25, y);
      y += 5;
    }
    
    y += 3;
    doc.text('Bowlers:', 25, y);
    y += 5;
    
    // Bowlers
    GameState.bowlerStats[1 - ti].forEach(b => {
      if (b.balls > 0) {
        doc.text(`${b.name}: ${Math.floor(b.balls / 6)}.${b.balls % 6} ov, ${b.runs}r, ${b.wickets}w`, 25, y);
        y += 5;
      }
    });
    
    y += 10;
    
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
  }
  
  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text('Generated by Hand Cricket Tournament Edition', 20, 285);
  
  // Download
  const filename = `HandCricket_${GameState.teamNames[0]}_vs_${GameState.teamNames[1]}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
  
  showToast(' Scorecard downloaded!', '#48bb78');
}

// ============================================================================
// MAKE FUNCTIONS GLOBAL
// ============================================================================
window.TournamentHistory = TournamentHistory;
window.openHistoryModal = openHistoryModal;
window.closeHistoryModal = closeHistoryModal;
window.showHistoryTab = showHistoryTab;
window.clearAllHistoryData = clearAllHistoryData;
window.openResumeModal = openResumeModal;
window.closeResumeModal = closeResumeModal;
window.resumeTournamentSlot = resumeTournamentSlot;
window.signInWithGoogle = signInWithGoogle;
window.signOutUser = signOutUser;
window.updateAuthUI = updateAuthUI;
window.getPublicUserName = getPublicUserName;
window.saveUsername = saveUsername;
window.saveProgressToCloud = saveProgressToCloud;
window.loadProgressFromCloud = loadProgressFromCloud;
window.downloadPDF = downloadPDF;
window.toggleSideMenu = toggleSideMenu;
window.closeSideMenu = closeSideMenu;
window.openMenuHistory = openMenuHistory;
window.openMenuCareer = openMenuCareer;
window.openMenuLeaderboard = openMenuLeaderboard;
window.openMenuRanked = openMenuRanked;
window.openMenuClan = openMenuClan;
window.openMenuResume = openMenuResume;
window.openMenuFriends = openMenuFriends;

// Fix the HTML onclick handler issue
window.getMatchHistory = openMenuHistory;

console.log('? Part 4 loaded: UI functions & Firebase integration complete');












function publishLeaderboardProfileToCloud() {
  if (!(firebaseInitialized && db && currentUser)) return;
  const localSnap = _buildLocalProgressSnapshot();
  const explicitUserName = String(localStorage.getItem('hc_username') || localStorage.getItem('hc_cloud_username') || '').trim();
  const uname = explicitUserName || String((currentUser && currentUser.displayName) || 'Player').trim();
  const localUsernameLocked = localStorage.getItem('hc_username_locked') === '1';
  const payload = {
    userId: currentUser.uid,
    userName: uname,
    displayName: uname,
    usernameLocked: !!localUsernameLocked,
    googleEmail: _normalizedEmail(currentUser.email || ''),
    photoURL: currentUser.photoURL || '',
    rankPoints: Number((localSnap.playerProfile||{}).rankPoints || 0),
    aura: Number((localSnap.playerProfile||{}).aura || 0),
    rankTier: (localSnap.playerProfile||{}).rankTier || 'Bronze',
    totalMatches: Number((localSnap.careerStats||{}).totalMatches || 0),
    tournaments: (localSnap.tournaments||[]).map(t=>({ id:t.id, format:t.format, teamKey:t.teamKey, teamName:t.teamName, stage:t.stage, startDate:t.startDate, lastSaved:t.lastSaved, dataVersion:t.dataVersion })),
    matchHistory: localSnap.matchHistory,
    careerStats: localSnap.careerStats,
    winHistory: localSnap.winHistory,
    playerProfile: localSnap.playerProfile,
    lastSync: new Date().toISOString(),
    dataVersion: APP_VERSION
  };
  db.collection('handCricketProgress').doc(currentUser.uid).set(payload, { merge: true }).catch(err => {
    console.error('publish leaderboard profile error:', err);
  });
}
window.addEventListener('hc_profile_updated', () => {
  if (currentUser) {
    publishLeaderboardProfileToCloud();
  }
});



function _getHallOfFameBadges(){
  const profile = DataManager.getPlayerProfile();
  const stats = DataManager.getCareerStats();
  const wins = DataManager.getWinHistory();
  const winFormats = new Set((wins||[]).map(w=>String(w.format||'')));
  const badges = [
    { id:'gladiator', name:'Gladiator', icon:'\uD83C\uDFC6', cond: winFormats.has('t20WorldCup'), desc:'Win T20 World Cup' },
    { id:'king', name:'King', icon:'\uD83D\uDC51', cond: winFormats.has('odiWorldCup'), desc:'Win ODI World Cup' }
  ];

  const addScaled = (prefix, label, icon, metric, steps) => {
    steps.forEach((s, i) => badges.push({
      id: prefix + '_' + (i+1),
      name: label + ' ' + (i+1),
      icon,
      cond: Number(metric || 0) >= Number(s || 0),
      desc: label + ' milestone ' + s
    }));
  };

  addScaled('wins','Victor','\uD83E\uDD47',stats.won,[5,10,20,30,40,50,60,70,80,90,100,120]);
  addScaled('matches','Veteran','\uD83C\uDF96\uFE0F',stats.totalMatches,[10,20,30,40,50,75,100,125,150,175]);
  addScaled('runs','Run Machine','\uD83D\uDCAF',stats.totalRuns,[500,1000,2000,3000,4000,5000,7000,9000]);
  addScaled('wkts','Strike Bowler','\uD83D\uDD25',stats.totalWickets,[20,40,60,80,100,150,200]);
  addScaled('rp','Rank Star','\u2B50',profile.rankPoints,[200,400,600,800,1000]);
  addScaled('aura','Aura Lord','\u2728',profile.aura,[500,1000,1500,2000,3000]);

  badges.push({ id:'hat', name:'Hat-Trick Hero', icon:'\uD83C\uDFA9', cond:Number(stats.hattricks||0)>=1, desc:'Take a hat-trick' });
  badges.push({ id:'dhat', name:'Double Hat', icon:'\uD83D\uDD25\uD83D\uDD25', cond:Number(stats.doubleHattricks||0)>=1, desc:'Take 4 in a row' });
  badges.push({ id:'that', name:'Triple Hat', icon:'\uD83D\uDD25\uD83D\uDD25\uD83D\uDD25', cond:Number(stats.tripleHattricks||0)>=1, desc:'Take 5 in a row' });
  badges.push({ id:'qhat', name:'Quadro Hat', icon:'\uD83D\uDCA5', cond:Number(stats.quadroHattricks||0)>=1, desc:'Take 6 in a row' });
  badges.push({ id:'fivew', name:'Five-Wicket Beast', icon:'\uD83C\uDFAF', cond:Number(stats.fiveWickets||0)>=1, desc:'Take a 5-wicket haul' });
  badges.push({ id:'tenw', name:'Ten-Wicket Titan', icon:'\uD83D\uDEE1\uFE0F', cond:Number(stats.tenWickets||0)>=1, desc:'Take a 10-wicket haul' });

  return badges.slice(0,50);
}

function _getMissions(){
  if (DataManager && typeof DataManager.getMissionProgressList === 'function') {
    return DataManager.getMissionProgressList();
  }
  return [];
}

function renderHallOfFame(container){
  const badges = _getHallOfFameBadges();
  const missions = _getMissions();
  const unlocked = badges.filter(b => b.cond);
  const lock = badges.filter(b => !b.cond);

  let html = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:18px">
      <div style="background:#16a34a;color:white;padding:14px;border-radius:12px"><div style="font-size:28px;font-weight:800">${unlocked.length}</div><div>Unlocked Badges</div></div>
      <div style="background:#2563eb;color:white;padding:14px;border-radius:12px"><div style="font-size:28px;font-weight:800">${badges.length}</div><div>Total Badges</div></div>
      <div style="background:#7c3aed;color:white;padding:14px;border-radius:12px"><div style="font-size:28px;font-weight:800">${Math.round((unlocked.length / badges.length) * 100)}%</div><div>Completion</div></div>
    </div>
    <h4 style="color:#334155;margin:8px 0">\uD83C\uDF1F Hall of Fame</h4>
    <div style="margin:10px 0 16px 0;padding:12px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0">
      <div style="font-weight:700;color:#1f2937;margin-bottom:8px">\uD83C\uDFAF Missions</div>
      ${missions.map(m=>{ const pct=Math.max(0,Math.min(100,Math.round((Number(m.progress||0)/Number(m.target||1))*100))); return `<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;font-size:12px;color:#475569"><span>${m.title}</span><span>${Number(m.progress||0)}/${Number(m.target||0)} • ${m.reward}</span></div><div style="height:8px;background:#e2e8f0;border-radius:999px;overflow:hidden"><div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#22c55e,#0ea5e9)"></div></div></div>`;}).join('')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px">
      ${badges.map(b=>`
        <div style="padding:12px;border-radius:10px;border:1px solid ${b.cond ? '#86efac' : '#e2e8f0'};background:${b.cond ? '#f0fdf4' : '#f8fafc'}">
          <div style="font-size:24px">${b.icon}</div>
          <div style="font-weight:700;color:#1f2937">${b.name}</div>
          <div style="font-size:12px;color:#64748b">${b.desc}</div>
          <div style="margin-top:6px;font-size:11px;color:${b.cond ? '#16a34a' : '#94a3b8'}">${b.cond ? 'Unlocked' : 'Locked'}</div>
        </div>
      `).join('')}
    </div>
  `;
  container.innerHTML = html;
}
