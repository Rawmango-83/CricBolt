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
    <div style="text-align:center;padding:60px 20px;color:#a0aec0">
      <div style="font-size:4em;margin-bottom:20px">🥇</div>
      <h3 style="color:#718096;margin-bottom:10px">Global Leaderboard</h3>
      <p style="max-width:400px;margin:0 auto;line-height:1.6">
        Sign in with Google to save your progress to the cloud and compete on the global leaderboard!
      </p>
      ${!currentUser ? `
        <button onclick="signInWithGoogle()" style="margin-top:25px;padding:12px 30px;background:#667eea;color:white;border:none;border-radius:8px;cursor:pointer;font-size:16px">
          Sign In to Compete
        </button>
      ` : '<p style="margin-top:20px;color:#48bb78">✓ You\'re signed in! Coming soon...</p>'}
    </div>
  `;
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
    alert('Tournament not found!');
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
    alert('Firebase not initialized. Using local storage only.');
    return;
  }
  
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider)
    .then(result => {
      currentUser = result.user;
      updateAuthUI();
      loadProgressFromCloud();
      showToast('✅ Signed in successfully!', '#48bb78');
    })
    .catch(error => {
      console.error('Sign in error:', error);
      alert('Sign in failed: ' + error.message);
    });
}

function signOutUser() {
  if (!auth) return;
  
  auth.signOut()
    .then(() => {
      currentUser = null;
      updateAuthUI();
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
  } else {
    signedOut.style.display = 'block';
    signedIn.style.display = 'none';
  }
}

function saveProgressToCloud() {
  if (!firebaseInitialized || !db || !currentUser) {
    alert('Please sign in first!');
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
    })
    .catch(error => {
      console.error('Cloud save error:', error);
      alert('Failed to save: ' + error.message);
    });
}

function loadProgressFromCloud() {
  if (!firebaseInitialized || !db || !currentUser) return;
  
  db.collection('handCricketProgress').doc(currentUser.uid).get()
    .then(doc => {
      if (!doc.exists) {
        console.log('No cloud data found');
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
    alert('PDF library not loaded!');
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

// Fix the HTML onclick handler issue
window.getMatchHistory = openHistoryModal;

console.log('✅ Part 4 loaded: UI functions & Firebase integration complete');
