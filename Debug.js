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
      odiWorldCup: 'ODI World Cup 🏆',
      t20WorldCup: 'T20 World Cup 🏆',
      wtc: 'WTC Championship 🏆',
      ipl: 'IPL Trophy 🏆'
    };
    
    let html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:15px">';
    
    wins.slice(-8).reverse().forEach(w => {
      html += `<div style="background:linear-gradient(135deg,#667eea,#764ba2);color:white;padding:18px;border-radius:12px;text-align:center;box-shadow:0 4px 12px rgba(102,126,234,0.3)">
        <div style="font-size:2em;margin-bottom:8px">🏆</div>
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
    const resultText = m.result === 'won' ? '✓ WON' : m.result === 'lost' ? '✗ LOST' : '◐ DRAW';
    
    html += `<div style="background:#f7fafc;padding:16px;border-radius:8px;margin-bottom:10px;border-left:4px solid ${resultColor}">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
        <div>
          <strong style="color:#2d3748">${Security.escapeHtml(m.teamNames[0])} vs ${Security.escapeHtml(m.teamNames[1])}</strong>
          ${m.tournament ? '<span style="background:#667eea;color:white;padding:2px 8px;border-radius:4px;font-size:11px;margin-left:8px">🏆 Tournament</span>' : ''}
        </div>
        <span style="color:${resultColor};font-weight:700;font-size:14px">${resultText}</span>
      </div>
      <div style="font-size:13px;color:#718096">
        <span>📅 ${m.date}</span>
        <span style="margin-left:15px">🏏 ${m.format || 'Custom'}</span>
        <span style="margin-left:15px">📊 ${m.userRuns}/${m.userWickets} vs ${m.oppRuns}/${m.oppWickets}</span>
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
      <div style="font-size:3em;margin-bottom:10px">🏆</div>
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
        ['🎮 Total Matches', stats.totalMatches, '#667eea'],
        ['✅ Won', stats.won, '#48bb78'],
        ['❌ Lost', stats.lost, '#ef4444'],
        ['◐ Drawn', stats.drawn, '#f59e0b']
      ].map(([label, value, color]) => `
        <div style="background:${color};color:white;padding:20px;border-radius:12px;text-align:center">
          <div style="font-size:2.5em;font-weight:800;line-height:1">${value}</div>
          <div style="opacity:0.9;margin-top:8px;font-size:14px">${label}</div>
        </div>
      `).join('')}
    </div>
    
    <div style="background:#f7fafc;padding:25px;border-radius:12px;margin-bottom:20px;border-left:4px solid #667eea">
      <h4 style="color:#2d3748;margin-bottom:15px">🏏 Batting Performance</h4>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:15px">
        ${[
          ['Total Runs', stats.totalRuns],
          ['Highest Score', stats.highestScore],
          ['Centuries 💯', stats.centuries || 0],
          ['Half-Centuries 5️⃣0️⃣', stats.fifties || 0],
          ['Win Rate 📈', winRate + '%']
        ].map(([l, v]) => `<div><div style="color:#718096;font-size:13px">${l}</div><div style="font-size:28px;font-weight:700;color:#2d3748">${v}</div></div>`).join('')}
      </div>
    </div>
    
    <div style="background:#f7fafc;padding:25px;border-radius:12px;border-left:4px solid #f59e0b">
      <h4 style="color:#2d3748;margin-bottom:15px">⚡ Bowling Performance</h4>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:15px">
        ${[
          ['Wickets Taken', stats.totalWickets],
          ['Hat-Tricks 🎩', stats.hattricks || 0],
          ['3-Wkt Hauls 🔥', stats.threeWickets || 0],
          ['5-Wkt Hauls 🔥🔥', stats.fiveWickets || 0],
          ['10-Wkt Hauls 💥', stats.tenWickets || 0]
        ].map(([l, v]) => `<div><div style="color:#718096;font-size:13px">${l}</div><div style="font-size:28px;font-weight:700;color:#2d3748">${v}</div></div>`).join('')}
      </div>
    </div>
  `;
  
  container.innerHTML = html;
}

function renderLeaderboard(container) {
  container.innerHTML = `
    <div style="text-align:center;padding:30px 20px;color:#64748b">
      <div style="font-size:2.8em;margin-bottom:10px">🥇</div>
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

  db.collection('handCricketProgress').limit(200).get()
    .then(snap => {
      const rows = snap.docs.map(d => {
        const data = d.data() || {};
        const profile = data.playerProfile || {};
        return {
          uid: d.id,
          name: data.displayName || data.userName || 'Player',
          rankPoints: Number(data.rankPoints != null ? data.rankPoints : (profile.rankPoints || 0)),
          aura: Number(data.aura != null ? data.aura : (profile.aura || 0)),
          rankTier: data.rankTier || profile.rankTier || 'Bronze',
          matches: Number(data.totalMatches != null ? data.totalMatches : (profile.rankedMatches || 0))
        };
      }).sort((a, b) => {
        if (b.rankPoints !== a.rankPoints) return b.rankPoints - a.rankPoints;
        if (b.aura !== a.aura) return b.aura - a.aura;
        return b.matches - a.matches;
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
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
        const mine = !!(currentUser && currentUser.uid === r.uid);
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
  
  if (tournaments.length === 0) {
    list.innerHTML = '<p style="text-align:center;color:#a0aec0">No saved tournaments found</p>';
    modal.style.display = 'flex';
    return;
  }
  
  const formatNames = {
    odiWorldCup: 'ODI World Cup',
    t20WorldCup: 'T20 World Cup',
    wtc: 'World Test Championship',
    ipl: 'Indian Premier League'
  };
  
  const stageNames = {
    challengeLeague: 'Challenge League',
    super6: 'Super 6',
    qualifier: 'Qualifier',
    worldCup: 'World Cup',
    wtc: 'WTC League',
    ipl: 'IPL'
  };
  
  let html = '';
  tournaments.forEach(t => {
    html += `<div style="background:#f7fafc;padding:18px;border-radius:10px;margin-bottom:12px;border-left:4px solid #667eea;cursor:pointer;transition:all 0.2s" onclick="resumeTournamentSlot(${t.id})" onmouseover="this.style.background='#edf2f7'" onmouseout="this.style.background='#f7fafc'">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
        <div>
          <strong style="color:#2d3748;font-size:16px">${formatNames[t.format] || t.format}</strong>
          <div style="color:#667eea;font-size:14px;margin-top:4px">${Security.escapeHtml(t.teamName)}</div>
        </div>
        <span style="background:#667eea;color:white;padding:4px 10px;border-radius:6px;font-size:12px">${stageNames[t.stage] || t.stage}</span>
      </div>
      <div style="font-size:12px;color:#718096">
        <span>📅 Started: ${t.startDate}</span><br>
        <span>💾 Last saved: ${t.lastSaved}</span>
      </div>
    </div>`;
  });
  
  list.innerHTML = html;
  modal.style.display = 'flex';
}

function closeResumeModal() {
  const modal = document.getElementById('resumeModal');
  if (modal) modal.style.display = 'none';
}

function resumeTournamentSlot(slotId) {
  const slot = DataManager.loadTournamentSlot(slotId);
  if (!slot) {
    uiAlert('Tournament not found!', 'Resume Tournament');
    return;
  }
  
  const ts = slot.tournamentState;
  Object.keys(ts).forEach(k => {
    TournamentState[k] = ts[k];
  });
  
  closeResumeModal();
  showSection('tournament');
  
  const titles = {
    odiWorldCup: '🏆 ODI World Cup',
    t20WorldCup: '🏆 T20 World Cup',
    wtc: '🏆 World Test Championship',
    ipl: '🏆 Indian Premier League'
  };
  
  Utils.setText('tournamentTitle', titles[TournamentState.format] || '🏆 Tournament');
  
  const nav = Utils.getElement('tournamentNav');
  const sb = Utils.getElement('statsCornerBtn');
  
  if (TournamentState.format === 'wtc' || TournamentState.format === 'ipl') {
    if (nav) nav.style.display = 'none';
    if (sb) sb.style.display = 'block';
  } else {
    if (nav) nav.style.display = 'flex';
    if (sb) sb.style.display = 'none';
  }
  
  if (TournamentState.format === 'wtc') {
    showWTCStage();
  } else if (TournamentState.format === 'ipl') {
    showIPLStage();
  } else {
    showTournamentStage(TournamentState.currentStage);
  }
  
  showToast('✅ Tournament resumed!', '#48bb78');
}

// ============================================================================
// FIREBASE AUTHENTICATION
// ============================================================================
function signInWithGoogle() {
  if (!firebaseInitialized || !auth) {
    uiAlert('Firebase not initialized. Using local storage only.', 'Cloud Sync');
    return;
  }
  
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider)
    .then(() => {
      showToast('✅ Signed in successfully!', '#48bb78');
    })
    .catch(error => {
      console.error('Sign in error:', error);
      uiAlert('Sign in failed: ' + error.message, 'Sign In Error');
    });
}

function signOutUser() {
  if (!auth) return;
  
  auth.signOut()
    .then(() => {
      showToast('Signed out successfully', '#718096');
    })
    .catch(error => {
      console.error('Sign out error:', error);
    });
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
    if (nameEl) nameEl.textContent = currentUser.displayName || 'User';
    if (emailEl) emailEl.textContent = currentUser.email || '';

    publishLeaderboardProfileToCloud();
  } else {
    signedOut.style.display = 'block';
    signedIn.style.display = 'none';
  }
}
function saveProgressToCloud() {
  if (!firebaseInitialized || !db || !currentUser) {
    uiAlert('Please sign in first!', 'Sign In Required');
    return;
  }
  
  const data = {
    userId: currentUser.uid,
    tournaments: DataManager.getTournaments(),
    matchHistory: DataManager.getMatchHistory(),
    careerStats: DataManager.getCareerStats(),
    winHistory: DataManager.getWinHistory(),
    playerProfile: DataManager.getPlayerProfile(),
    lastSync: new Date().toISOString(),
    dataVersion: APP_VERSION
  };
  
  db.collection('handCricketProgress').doc(currentUser.uid).set(data)
    .then(() => {
      const lastSyncEl = document.getElementById('lastSyncTime');
      if (lastSyncEl) {
        lastSyncEl.textContent = '✓ Last synced: ' + new Date().toLocaleString();
      }
      showToast('✅ Progress saved to cloud!', '#48bb78');
      publishLeaderboardProfileToCloud();
    })
    .catch(error => {
      console.error('Cloud save error:', error);
      uiAlert('Failed to save: ' + error.message, 'Save Error');
    });
}

function loadProgressFromCloud() {
  if (!firebaseInitialized || !db || !currentUser) return;
  
  db.collection('handCricketProgress').doc(currentUser.uid).get()
    .then(doc => {
      if (!doc.exists) {
        console.log('No cloud data found');
        if (typeof persistCurrentProgressIdentity === 'function') persistCurrentProgressIdentity();
        TournamentHistory.displayHistory();
        checkResumeBtnVisibility();
        updatePlayerProfileUI();
        return;
      }
      
      const data = doc.data();
      
      if (data.tournaments) {
        localStorage.setItem('hc_tournaments', JSON.stringify(data.tournaments));
      }
      if (data.matchHistory) {
        localStorage.setItem('hc_matchHistory', JSON.stringify(data.matchHistory));
      }
      if (data.careerStats) {
        localStorage.setItem('hc_careerStats', JSON.stringify(data.careerStats));
      }
      if (data.winHistory) {
        localStorage.setItem('handCricketHistory', JSON.stringify(data.winHistory));
      }
      if (data.playerProfile) {
        localStorage.setItem('hc_playerProfile', JSON.stringify(data.playerProfile));
      }
      
      const lastSyncEl = document.getElementById('lastSyncTime');
      if (lastSyncEl && data.lastSync) {
        lastSyncEl.textContent = '✓ Last synced: ' + new Date(data.lastSync).toLocaleString();
      }
      
      TournamentHistory.displayHistory();
      checkResumeBtnVisibility();
      updatePlayerProfileUI();
      
      if (typeof persistCurrentProgressIdentity === 'function') persistCurrentProgressIdentity();
      showToast('✅ Progress loaded from cloud!', '#48bb78');
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
  
  showToast('📄 Scorecard downloaded!', '#48bb78');
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

console.log('✅ Part 4 loaded: UI functions & Firebase integration complete');












function publishLeaderboardProfileToCloud() {
  if (!(firebaseInitialized && db && currentUser)) return;
  const profile = DataManager.getPlayerProfile();
  const career = DataManager.getCareerStats();
  db.collection('handCricketProgress').doc(currentUser.uid).set({
    userId: currentUser.uid,
    displayName: currentUser.displayName || 'Player',
    photoURL: currentUser.photoURL || '',
    rankPoints: Number(profile.rankPoints || 0),
    aura: Number(profile.aura || 0),
    rankTier: profile.rankTier || 'Bronze',
    totalMatches: Number(career.totalMatches || 0),
    playerProfile: profile,
    careerStats: career,
    lastSync: new Date().toISOString(),
    dataVersion: APP_VERSION
  }, { merge: true }).catch(err => {
    console.error('publish leaderboard profile error:', err);
  });
}
window.addEventListener('hc_profile_updated', () => { if (currentUser) publishLeaderboardProfileToCloud(); });



function _getHallOfFameBadges(){
  const profile = DataManager.getPlayerProfile();
  const stats = DataManager.getCareerStats();
  const wins = DataManager.getWinHistory();
  const badges = [
    { id:'first_match', name:'Debutant', icon:'🎬', cond: (stats.totalMatches||0) >= 1, desc:'Play your first match' },
    { id:'first_win', name:'Winner', icon:'🏅', cond: (stats.won||0) >= 1, desc:'Win your first match' },
    { id:'fifty_club', name:'Fifty Club', icon:'5️⃣0️⃣', cond: (stats.fifties||0) >= 1, desc:'Score a half-century' },
    { id:'century_club', name:'Century King', icon:'💯', cond: (stats.centuries||0) >= 1, desc:'Score a century' },
    { id:'hattrick', name:'Hat-trick Hero', icon:'🎩', cond: (stats.hattricks||0) >= 1, desc:'Take a hat-trick' },
    { id:'five_wkt', name:'Bowling Beast', icon:'🔥🔥', cond: (stats.fiveWickets||0) >= 1, desc:'Take a 5-wicket haul' },
    { id:'rank_silver', name:'Ranked Silver', icon:'🥈', cond: Number(profile.rankPoints||0) >= 200, desc:'Reach 200 RP' },
    { id:'rank_gold', name:'Ranked Gold', icon:'🥇', cond: Number(profile.rankPoints||0) >= 500, desc:'Reach 500 RP' },
    { id:'aura_divine', name:'Aura Divine', icon:'✨', cond: Number(profile.aura||0) >= 1000, desc:'Reach 1000 Aura' },
    { id:'tour_champ', name:'Tournament Champ', icon:'🏆', cond: (wins||[]).length >= 1, desc:'Win any tournament' }
  ];
  return badges;
}

function renderHallOfFame(container){
  const badges = _getHallOfFameBadges();
  const unlocked = badges.filter(b => b.cond);
  const lock = badges.filter(b => !b.cond);

  let html = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:18px">
      <div style="background:#16a34a;color:white;padding:14px;border-radius:12px"><div style="font-size:28px;font-weight:800">${unlocked.length}</div><div>Unlocked Badges</div></div>
      <div style="background:#2563eb;color:white;padding:14px;border-radius:12px"><div style="font-size:28px;font-weight:800">${badges.length}</div><div>Total Badges</div></div>
      <div style="background:#7c3aed;color:white;padding:14px;border-radius:12px"><div style="font-size:28px;font-weight:800">${Math.round((unlocked.length / badges.length) * 100)}%</div><div>Completion</div></div>
    </div>
    <h4 style="color:#334155;margin:8px 0">🌟 Hall of Fame</h4>
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






