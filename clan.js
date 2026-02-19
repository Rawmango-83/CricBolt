'use strict';

let clanModalOpen = false;
let myClanId = null;
let myClanRole = null;
let myClanName = null;
let clanDocUnsub = null;
let clanChatUnsub = null;
let clanClashUnsub = null;
let currentClanMutedMap = {};

function _clanEsc(v){
  const s = String(v == null ? '' : v);
  if (typeof Security !== 'undefined' && Security.escapeHtml) return Security.escapeHtml(s);
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function _clanSignedIn(){
  return !!(firebaseInitialized && db && currentUser && currentUser.uid);
}

function _clanStatus(msg){
  const el = document.getElementById('clanStatus');
  if (el) el.textContent = msg;
}

function _clanUserRef(){
  return db.collection('hc_clanUsers').doc(currentUser.uid);
}

function _clanRef(id){
  return db.collection('hc_clans').doc(id);
}

function _clanMyAura(){
  try {
    const p = DataManager.getPlayerProfile();
    return Number(p.aura || 0);
  } catch(e){
    return 0;
  }
}

function _genInviteCode(){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function _cleanupClanListeners(){
  if (clanDocUnsub) { clanDocUnsub(); clanDocUnsub = null; }
  if (clanChatUnsub) { clanChatUnsub(); clanChatUnsub = null; }
  if (clanClashUnsub) { clanClashUnsub(); clanClashUnsub = null; }
}

function _setClanButtonsState(){
  const signed = _clanSignedIn();
  const inClan = !!myClanId;
  const createBtn = document.getElementById('clanCreateBtn');
  const leaveBtn = document.getElementById('clanLeaveBtn');
  const challengeBtn = document.getElementById('clanChallengeBtn');
  const joinInviteBtn = document.getElementById('clanJoinInviteBtn');
  const regenBtn = document.getElementById('clanRegenInviteBtn');

  if (createBtn) createBtn.disabled = !signed || inClan;
  if (leaveBtn) leaveBtn.disabled = !signed || !inClan;
  if (challengeBtn) challengeBtn.disabled = !signed || !inClan || myClanRole !== 'leader';
  if (joinInviteBtn) joinInviteBtn.disabled = !signed || inClan;
  if (regenBtn) regenBtn.disabled = !signed || !inClan || myClanRole !== 'leader';
}

function _refreshClanInviteUI(clan){
  const codeEl = document.getElementById('clanInviteCodeValue');
  if (!codeEl) return;
  if (!clan || !myClanId) {
    codeEl.textContent = '-';
    return;
  }
  if (myClanRole === 'leader') codeEl.textContent = String(clan.inviteCode || '-');
  else codeEl.textContent = 'Leader-only';
}

async function _recomputeClanAggregate(clanId){
  if (!_clanSignedIn() || !clanId) return;
  const members = await _clanRef(clanId).collection('members').get();
  let total = 0;
  let count = 0;
  members.forEach(d => {
    const m = d.data() || {};
    total += Number(m.aura || 0);
    count += 1;
  });
  const avg = count ? Number((total / count).toFixed(2)) : 0;
  await _clanRef(clanId).set({
    totalAura: total,
    memberCount: count,
    avgAura: avg,
    updatedAtMs: Date.now()
  }, { merge: true });
}

async function _syncMyAuraToClan(){
  if (!_clanSignedIn() || !myClanId) return;
  try {
    const memberRef = _clanRef(myClanId).collection('members').doc(currentUser.uid);
    const snap = await memberRef.get();
    if (!snap.exists) return;
    const currentAura = _clanMyAura();
    const d = snap.data() || {};
    if (Number(d.aura || 0) !== currentAura) {
      await memberRef.set({ aura: currentAura, updatedAtMs: Date.now() }, { merge: true });
      await _recomputeClanAggregate(myClanId);
    }
  } catch(e){
    console.error('sync aura to clan error:', e);
  }
}

function _renderClanMembers(clan, members){
  const box = document.getElementById('clanMembers');
  if (!box) return;
  if (!clan) {
    box.innerHTML = '<p style="color:#64748b">No clan joined.</p>';
    return;
  }

  let html = '';
  html += `<div style="margin-bottom:8px"><strong>${_clanEsc(clan.name || 'Clan')}</strong> [${_clanEsc(clan.tag || '-')}], Avg Aura: <strong>${Number(clan.avgAura || 0)}</strong>, Members: ${Number(clan.memberCount || 0)}</div>`;
  if (!members.length) {
    html += '<p style="color:#64748b">No members.</p>';
  } else {
    members.sort((a,b)=>Number(b.aura||0)-Number(a.aura||0));
    html += members.map(m=>{
      const role = m.role === 'leader' ? 'Leader' : 'Member';
      const uid = m.uid || '';
      const muted = !!currentClanMutedMap[uid];
      let controls = '';
      if (myClanRole === 'leader' && uid && uid !== currentUser.uid) {
        const label = muted ? 'Unmute' : 'Mute';
        const color = muted ? '#0284c7' : '#b91c1c';
        controls = `<button onclick="toggleClanMute('${_clanEsc(uid)}')" style="width:auto;padding:4px 8px;background:${color};font-size:11px">${label}</button>`;
      }
      return `<div style="padding:4px 0;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;gap:6px"><span>${_clanEsc(m.name || 'Player')} (${role})${muted?' <em style="color:#b91c1c">[muted]</em>':''}</span><span style="display:flex;align-items:center;gap:6px"><span>Aura ${Number(m.aura||0)}</span>${controls}</span></div>`;
    }).join('');
  }
  box.innerHTML = html;
}

function _renderClanChat(items){
  const box = document.getElementById('clanChatList');
  if (!box) return;
  if (!items.length) {
    box.innerHTML = '<p style="color:#94a3b8;margin:0">No messages yet.</p>';
    return;
  }
  const ordered = [...items].sort((a,b)=>Number(a.createdAtMs||0)-Number(b.createdAtMs||0));
  box.innerHTML = ordered.map(m=>{
    const canDelete = (m.uid === currentUser.uid) || myClanRole === 'leader';
    const deleteBtn = canDelete ? `<button onclick="deleteClanMessage('${_clanEsc(m.id)}')" style="width:auto;padding:2px 6px;background:#dc2626;font-size:10px">Delete</button>` : '';
    const reportBtn = `<button onclick="reportClanMessage('${_clanEsc(m.id)}')" style="width:auto;padding:2px 6px;background:#64748b;font-size:10px">Report</button>`;
    return `<div style="margin:4px 0;padding:4px;border-bottom:1px solid #f1f5f9"><div><strong>${_clanEsc(m.name||'Player')}:</strong> ${_clanEsc(m.message||'')}</div><div style="margin-top:3px;display:flex;gap:6px">${reportBtn}${deleteBtn}</div></div>`;
  }).join('');
  box.scrollTop = box.scrollHeight;
}

function _listenClanDoc(clanId){
  if (!_clanSignedIn() || !clanId) return;
  if (clanDocUnsub) clanDocUnsub();
  clanDocUnsub = _clanRef(clanId).onSnapshot(async snap => {
    if (!snap.exists) {
      myClanId = null;
      myClanRole = null;
      myClanName = null;
      currentClanMutedMap = {};
      _renderClanMembers(null, []);
      _setClanButtonsState();
      _refreshClanInviteUI(null);
      _clanStatus('Clan not found or deleted.');
      return;
    }
    const clan = snap.data() || {};
    myClanName = clan.name || '';
    currentClanMutedMap = clan.mutedUids || {};
    const membersSnap = await _clanRef(clanId).collection('members').get();
    const members = membersSnap.docs.map(d=>d.data()||{});
    _renderClanMembers(clan, members);
    _refreshClanInviteUI(clan);
    _setClanButtonsState();
    _clanStatus(`In clan: ${clan.name || 'Clan'} (${myClanRole || 'member'})`);
  }, err => {
    console.error('clan doc listener error:', err);
  });
}

function _listenClanChat(clanId){
  if (!_clanSignedIn() || !clanId) return;
  if (clanChatUnsub) clanChatUnsub();
  clanChatUnsub = _clanRef(clanId).collection('chat').orderBy('createdAtMs', 'desc').limit(40).onSnapshot(snap => {
    const items = snap.docs.map(d=>({ id:d.id, ...(d.data()||{}) }));
    _renderClanChat(items);
  }, err => {
    console.error('clan chat listener error:', err);
  });
}

function _renderClanDirectory(clans){
  const box = document.getElementById('clanList');
  if (!box) return;
  if (!clans.length) {
    box.innerHTML = '<p style="color:#64748b">No clans found.</p>';
    return;
  }
  box.innerHTML = clans.map(c=>{
    const disabled = !_clanSignedIn() || !!myClanId ? 'disabled' : '';
    return `<div style="padding:8px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;gap:8px"><div><strong>${_clanEsc(c.name||'Clan')}</strong> [${_clanEsc(c.tag||'-')}]<br><span style="color:#64748b">Avg Aura ${Number(c.avgAura||0)} | Members ${Number(c.memberCount||0)}</span></div><button ${disabled} onclick="joinClanById('${_clanEsc(c.id)}')" style="width:auto;background:#2563eb;padding:6px 12px">Join</button></div>`;
  }).join('');
}

function _renderClanLeaderboard(clans){
  const box = document.getElementById('clanLeaderboard');
  if (!box) return;
  if (!clans.length) {
    box.innerHTML = '<p style="color:#64748b">No leaderboard data yet.</p>';
    return;
  }
  box.innerHTML = clans.map((c, i)=>`<div style="padding:6px 0;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between"><span>#${i+1} ${_clanEsc(c.name||'Clan')}</span><span>Avg ${Number(c.avgAura||0)}</span></div>`).join('');
}

async function _refreshClanLists(){
  if (!firebaseInitialized || !db) return;
  try {
    const snap = await db.collection('hc_clans').orderBy('avgAura', 'desc').limit(30).get();
    const clans = snap.docs.map(d=>({ id:d.id, ...(d.data()||{}) }));
    _renderClanDirectory(clans);
    _renderClanLeaderboard(clans.slice(0, 20));

    const target = document.getElementById('clanTargetSelect');
    if (target) {
      const options = ['<option value="">Select target clan</option>']
        .concat(clans.filter(c=>c.id!==myClanId).map(c=>`<option value="${_clanEsc(c.id)}">${_clanEsc(c.name||'Clan')} [${_clanEsc(c.tag||'-')}]</option>`));
      target.innerHTML = options.join('');
    }
  } catch(e){
    console.error('refresh clan lists error:', e);
  }
}

function _renderClashes(items){
  const box = document.getElementById('clanChallenges');
  if (!box) return;
  if (!items.length) {
    box.innerHTML = '<p style="margin:0;color:#64748b">No clan clashes yet.</p>';
    return;
  }
  const rows = items.sort((a,b)=>Number(b.createdAtMs||0)-Number(a.createdAtMs||0)).slice(0, 20).map(c=>{
    const status = c.status || 'pending';
    const mineAsTarget = c.toClanId === myClanId;
    const mineAsSource = c.fromClanId === myClanId;
    let actions = '';
    if (status === 'pending' && mineAsTarget && myClanRole === 'leader') {
      actions = `<button onclick="respondClanChallenge('${_clanEsc(c.id)}','accepted')" style="width:auto;padding:5px 10px;background:#16a34a">Accept</button> <button onclick="respondClanChallenge('${_clanEsc(c.id)}','rejected')" style="width:auto;padding:5px 10px;background:#dc2626">Reject</button>`;
    } else if (status === 'accepted' && myClanRole === 'leader' && (mineAsTarget || mineAsSource)) {
      const otherId = mineAsTarget ? c.fromClanId : c.toClanId;
      actions = `<button onclick="finishClanChallenge('${_clanEsc(c.id)}','${_clanEsc(myClanId)}')" style="width:auto;padding:5px 10px;background:#0ea5e9">Mark Win</button> <button onclick="finishClanChallenge('${_clanEsc(c.id)}','${_clanEsc(otherId)}')" style="width:auto;padding:5px 10px;background:#64748b">Mark Lose</button>`;
    }
    const winner = c.winnerClanName ? ` | Winner: ${_clanEsc(c.winnerClanName)}` : '';
    return `<div style="padding:6px 0;border-bottom:1px solid #e2e8f0"><div>${_clanEsc(c.fromClanName||'Clan')} vs ${_clanEsc(c.toClanName||'Clan')} | <strong>${_clanEsc(status)}</strong>${winner}</div><div style="margin-top:4px">${actions}</div></div>`;
  });
  box.innerHTML = rows.join('');
}

function _listenClanClashes(){
  if (!_clanSignedIn() || !myClanId) {
    const box = document.getElementById('clanChallenges');
    if (box) box.innerHTML = '<p style="margin:0;color:#64748b">Join a clan to view clashes.</p>';
    return;
  }
  if (clanClashUnsub) clanClashUnsub();
  clanClashUnsub = db.collection('hc_clanClashes').where('participants', 'array-contains', myClanId).onSnapshot(snap => {
    const items = snap.docs.map(d=>({ id:d.id, ...(d.data()||{}) }));
    _renderClashes(items);
  }, err => {
    console.error('clan clash listener error:', err);
  });
}

async function _loadMyClanMembership(){
  if (!_clanSignedIn()) {
    myClanId = null;
    myClanRole = null;
    myClanName = null;
    currentClanMutedMap = {};
    _cleanupClanListeners();
    _renderClanMembers(null, []);
    _renderClanChat([]);
    _refreshClanInviteUI(null);
    _setClanButtonsState();
    _clanStatus('Sign in to create or join clans.');
    return;
  }
  try {
    const u = await _clanUserRef().get();
    const d = u.exists ? (u.data() || {}) : {};
    myClanId = d.clanId || null;
    myClanRole = d.role || null;
    myClanName = d.clanName || null;
    _setClanButtonsState();
    if (myClanId) {
      _listenClanDoc(myClanId);
      _listenClanChat(myClanId);
      _listenClanClashes();
      _syncMyAuraToClan().catch(()=>{});
    } else {
      _cleanupClanListeners();
      _renderClanMembers(null, []);
      _renderClanChat([]);
      _refreshClanInviteUI(null);
      _listenClanClashes();
      _clanStatus('No clan joined yet.');
    }
  } catch(e){
    console.error('load clan membership error:', e);
    _clanStatus('Could not load clan data.');
  }
}

async function openClanModal(){
  const modal = document.getElementById('clanModal');
  if (!modal) return;
  modal.style.display = 'flex';
  clanModalOpen = true;
  await _loadMyClanMembership();
  await _refreshClanLists();
}

function closeClanModal(){
  const modal = document.getElementById('clanModal');
  if (modal) modal.style.display = 'none';
  clanModalOpen = false;
}

async function createClan(){
  if (!_clanSignedIn()) {
    await uiAlert('Please sign in first.', 'Clan');
    return;
  }
  if (myClanId) {
    await uiAlert('Leave your current clan first.', 'Clan');
    return;
  }

  const name = Security.sanitizeInput((document.getElementById('clanCreateName') || {}).value || '');
  const rawTag = Security.sanitizeInput((document.getElementById('clanCreateTag') || {}).value || '');
  const tag = String(rawTag).toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (name.length < 3 || name.length > 24) {
    await uiAlert('Clan name must be 3 to 24 characters.', 'Clan');
    return;
  }
  if (tag.length < 2 || tag.length > 6) {
    await uiAlert('Clan tag must be 2 to 6 letters/numbers.', 'Clan');
    return;
  }

  try {
    const userRef = _clanUserRef();
    const clanRef = db.collection('hc_clans').doc();
    const aura = _clanMyAura();
    const userName = currentUser.displayName || 'Player';
    const inviteCode = _genInviteCode();

    await db.runTransaction(async tx => {
      const userSnap = await tx.get(userRef);
      const ud = userSnap.exists ? (userSnap.data() || {}) : {};
      if (ud.clanId) throw new Error('already-in-clan');

      tx.set(clanRef, {
        name,
        tag,
        inviteCode,
        leaderUid: currentUser.uid,
        leaderName: userName,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdAtMs: Date.now(),
        memberCount: 1,
        totalAura: aura,
        avgAura: aura,
        mutedUids: {},
        wins: 0,
        losses: 0,
        clashes: 0
      });

      tx.set(clanRef.collection('members').doc(currentUser.uid), {
        uid: currentUser.uid,
        name: userName,
        aura,
        role: 'leader',
        joinedAtMs: Date.now()
      });

      tx.set(userRef, {
        uid: currentUser.uid,
        clanId: clanRef.id,
        clanName: name,
        role: 'leader',
        updatedAtMs: Date.now()
      }, { merge: true });
    });

    showToast('Clan created successfully.', '#16a34a');
    await _loadMyClanMembership();
    await _refreshClanLists();
  } catch(e){
    console.error('create clan error:', e);
    await uiAlert('Could not create clan. Try again.', 'Clan');
  }
}

async function joinClanById(clanId){
  if (!_clanSignedIn()) {
    await uiAlert('Please sign in first.', 'Clan');
    return;
  }
  if (!clanId) return;
  if (myClanId) {
    await uiAlert('You are already in a clan.', 'Clan');
    return;
  }

  try {
    const userRef = _clanUserRef();
    const ref = _clanRef(clanId);
    const userName = currentUser.displayName || 'Player';
    const aura = _clanMyAura();

    await db.runTransaction(async tx => {
      const userSnap = await tx.get(userRef);
      const ud = userSnap.exists ? (userSnap.data() || {}) : {};
      if (ud.clanId) throw new Error('already-in-clan');

      const clanSnap = await tx.get(ref);
      if (!clanSnap.exists) throw new Error('clan-not-found');
      const clan = clanSnap.data() || {};

      tx.set(ref.collection('members').doc(currentUser.uid), {
        uid: currentUser.uid,
        name: userName,
        aura,
        role: 'member',
        joinedAtMs: Date.now()
      }, { merge: true });

      tx.set(userRef, {
        uid: currentUser.uid,
        clanId,
        clanName: clan.name || 'Clan',
        role: 'member',
        updatedAtMs: Date.now()
      }, { merge: true });
    });

    await _recomputeClanAggregate(clanId);
    showToast('Joined clan successfully.', '#16a34a');
    await _loadMyClanMembership();
    await _refreshClanLists();
  } catch(e){
    console.error('join clan error:', e);
    await uiAlert('Could not join clan. Try again.', 'Clan');
  }
}

async function joinClanByInvite(){
  if (!_clanSignedIn()) {
    await uiAlert('Please sign in first.', 'Clan');
    return;
  }
  if (myClanId) {
    await uiAlert('Leave your current clan first.', 'Clan');
    return;
  }
  const input = document.getElementById('clanInviteJoinInput');
  const code = String((input && input.value) || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 6) {
    await uiAlert('Enter a valid invite code.', 'Clan');
    return;
  }
  try {
    const q = await db.collection('hc_clans').where('inviteCode', '==', code).limit(1).get();
    if (q.empty) {
      await uiAlert('Invite code not found.', 'Clan');
      return;
    }
    await joinClanById(q.docs[0].id);
  } catch(e){
    console.error('join by invite error:', e);
    await uiAlert('Could not join with invite code.', 'Clan');
  }
}

async function regenerateClanInviteCode(){
  if (!_clanSignedIn() || !myClanId || myClanRole !== 'leader') return;
  try {
    await _clanRef(myClanId).set({ inviteCode: _genInviteCode(), updatedAtMs: Date.now() }, { merge: true });
    showToast('Invite code regenerated.', '#0284c7');
  } catch(e){
    console.error('regen invite error:', e);
  }
}

async function leaveClan(){
  if (!_clanSignedIn() || !myClanId) {
    await uiAlert('You are not in a clan.', 'Clan');
    return;
  }
  const ok = await uiConfirm('Leave your clan now?', 'Leave Clan');
  if (!ok) return;

  const clanId = myClanId;
  try {
    const userRef = _clanUserRef();
    const ref = _clanRef(clanId);
    const membersSnap = await ref.collection('members').get();
    const members = membersSnap.docs.map(d => ({ id:d.id, ...(d.data()||{}) }));
    const me = members.find(m=>m.id===currentUser.uid);
    const role = me && me.role ? me.role : myClanRole;

    const batch = db.batch();
    batch.delete(ref.collection('members').doc(currentUser.uid));
    batch.delete(userRef);

    if (role === 'leader') {
      const others = members.filter(m=>m.id!==currentUser.uid);
      if (!others.length) {
        batch.delete(ref);
      } else {
        others.sort((a,b)=>Number(b.aura||0)-Number(a.aura||0));
        const nextLeader = others[0];
        batch.set(ref, {
          leaderUid: nextLeader.uid,
          leaderName: nextLeader.name || 'Leader',
          updatedAtMs: Date.now()
        }, { merge: true });
        batch.set(ref.collection('members').doc(nextLeader.uid), { role: 'leader' }, { merge: true });
        batch.set(db.collection('hc_clanUsers').doc(nextLeader.uid), {
          role: 'leader',
          clanId,
          clanName: myClanName || null,
          updatedAtMs: Date.now()
        }, { merge: true });
      }
    }

    await batch.commit();
    if (role !== 'leader' || members.length > 1) await _recomputeClanAggregate(clanId);

    myClanId = null;
    myClanRole = null;
    myClanName = null;
    currentClanMutedMap = {};
    _cleanupClanListeners();
    _renderClanMembers(null, []);
    _renderClanChat([]);
    _refreshClanInviteUI(null);
    _setClanButtonsState();
    await _refreshClanLists();
    showToast('Left clan successfully.', '#64748b');
  } catch(e){
    console.error('leave clan error:', e);
    await uiAlert('Could not leave clan. Try again.', 'Clan');
  }
}

async function sendClanMessage(){
  if (!_clanSignedIn() || !myClanId) {
    await uiAlert('Join a clan to chat.', 'Clan Chat');
    return;
  }
  if (currentClanMutedMap && currentClanMutedMap[currentUser.uid]) {
    await uiAlert('You are muted by clan leader.', 'Clan Chat');
    return;
  }
  const input = document.getElementById('clanChatInput');
  const raw = input ? input.value : '';
  const message = Security.sanitizeInput(raw || '').trim();
  if (!message) return;

  try {
    await _clanRef(myClanId).collection('chat').add({
      uid: currentUser.uid,
      name: currentUser.displayName || 'Player',
      message,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAtMs: Date.now()
    });
    if (input) input.value = '';
  } catch(e){
    console.error('send clan message error:', e);
  }
}

async function deleteClanMessage(messageId){
  if (!_clanSignedIn() || !myClanId || !messageId) return;
  const ref = _clanRef(myClanId).collection('chat').doc(messageId);
  try {
    await db.runTransaction(async tx => {
      const msgSnap = await tx.get(ref);
      if (!msgSnap.exists) return;
      const msg = msgSnap.data() || {};
      if (msg.uid !== currentUser.uid && myClanRole !== 'leader') throw new Error('no-permission');
      tx.delete(ref);
    });
  } catch(e){
    console.error('delete clan message error:', e);
  }
}

async function reportClanMessage(messageId){
  if (!_clanSignedIn() || !myClanId || !messageId) return;
  try {
    await db.collection('hc_clanReports').add({
      clanId: myClanId,
      messageId,
      reporterUid: currentUser.uid,
      reporterName: currentUser.displayName || 'Player',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAtMs: Date.now()
    });
    showToast('Message reported.', '#64748b');
  } catch(e){
    console.error('report clan message error:', e);
  }
}

async function toggleClanMute(uid){
  if (!_clanSignedIn() || !myClanId || myClanRole !== 'leader' || !uid || uid === currentUser.uid) return;
  try {
    const currentlyMuted = !!(currentClanMutedMap && currentClanMutedMap[uid]);
    const patch = {};
    patch['mutedUids.' + uid] = currentlyMuted ? firebase.firestore.FieldValue.delete() : true;
    patch.updatedAtMs = Date.now();
    await _clanRef(myClanId).set(patch, { merge: true });
  } catch(e){
    console.error('toggle clan mute error:', e);
  }
}

async function createClanChallenge(){
  if (!_clanSignedIn() || !myClanId) {
    await uiAlert('Join a clan first.', 'Clan Clash');
    return;
  }
  if (myClanRole !== 'leader') {
    await uiAlert('Only clan leader can start clan clashes.', 'Clan Clash');
    return;
  }
  const target = document.getElementById('clanTargetSelect');
  const toClanId = target ? target.value : '';
  if (!toClanId || toClanId === myClanId) {
    await uiAlert('Select a valid target clan.', 'Clan Clash');
    return;
  }

  try {
    const toSnap = await _clanRef(toClanId).get();
    if (!toSnap.exists) {
      await uiAlert('Target clan not found.', 'Clan Clash');
      return;
    }
    const toClan = toSnap.data() || {};

    await db.collection('hc_clanClashes').add({
      fromClanId: myClanId,
      fromClanName: myClanName || 'Clan',
      toClanId,
      toClanName: toClan.name || 'Clan',
      participants: [myClanId, toClanId],
      initiatorUid: currentUser.uid,
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAtMs: Date.now()
    });

    showToast('Clan clash request sent.', '#0ea5e9');
  } catch(e){
    console.error('create clan clash error:', e);
    await uiAlert('Could not create clan clash.', 'Clan Clash');
  }
}

async function respondClanChallenge(clashId, status){
  if (!_clanSignedIn() || !myClanId || myClanRole !== 'leader') return;
  try {
    const ref = db.collection('hc_clanClashes').doc(clashId);
    const snap = await ref.get();
    if (!snap.exists) return;
    const c = snap.data() || {};
    if (c.toClanId !== myClanId || c.status !== 'pending') return;
    await ref.set({
      status: status === 'accepted' ? 'accepted' : 'rejected',
      respondedByUid: currentUser.uid,
      respondedAtMs: Date.now(),
      respondedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    showToast('Clan clash updated.', '#16a34a');
  } catch(e){
    console.error('respond clash error:', e);
  }
}

async function finishClanChallenge(clashId, winnerClanId){
  if (!_clanSignedIn() || !myClanId || myClanRole !== 'leader') return;
  try {
    const ref = db.collection('hc_clanClashes').doc(clashId);
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const c = snap.data() || {};
      if (c.status !== 'accepted') return;
      if (c.fromClanId !== myClanId && c.toClanId !== myClanId) return;

      const loserClanId = winnerClanId === c.fromClanId ? c.toClanId : c.fromClanId;
      const winnerName = winnerClanId === c.fromClanId ? c.fromClanName : c.toClanName;

      tx.set(ref, {
        status: 'finished',
        winnerClanId,
        winnerClanName: winnerName,
        finishedAtMs: Date.now(),
        finishedAt: firebase.firestore.FieldValue.serverTimestamp(),
        settledByUid: currentUser.uid
      }, { merge: true });

      tx.set(_clanRef(winnerClanId), {
        wins: firebase.firestore.FieldValue.increment(1),
        clashes: firebase.firestore.FieldValue.increment(1),
        updatedAtMs: Date.now()
      }, { merge: true });

      tx.set(_clanRef(loserClanId), {
        losses: firebase.firestore.FieldValue.increment(1),
        clashes: firebase.firestore.FieldValue.increment(1),
        updatedAtMs: Date.now()
      }, { merge: true });
    });
    showToast('Clan clash finished.', '#16a34a');
    await _refreshClanLists();
  } catch(e){
    console.error('finish clash error:', e);
  }
}

window.openClanModal = openClanModal;
window.closeClanModal = closeClanModal;
window.createClan = createClan;
window.joinClanById = joinClanById;
window.joinClanByInvite = joinClanByInvite;
window.regenerateClanInviteCode = regenerateClanInviteCode;
window.leaveClan = leaveClan;
window.sendClanMessage = sendClanMessage;
window.deleteClanMessage = deleteClanMessage;
window.reportClanMessage = reportClanMessage;
window.toggleClanMute = toggleClanMute;
window.createClanChallenge = createClanChallenge;
window.respondClanChallenge = respondClanChallenge;
window.finishClanChallenge = finishClanChallenge;

window.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('clanModal');
  if (modal) {
    modal.addEventListener('click', function(e){
      if (e.target === this) closeClanModal();
    });
  }
});

window.addEventListener('hc_profile_updated', () => {
  if (myClanId) _syncMyAuraToClan().catch(()=>{});
});

window.addEventListener('storage', () => {
  if (!clanModalOpen) return;
  _loadMyClanMembership().then(_refreshClanLists).catch(()=>{});
});

// CLAN_ADVANCED_SUITE_V1
function _isClanAdminRole(role){
  return role === 'leader' || role === 'co_leader';
}

function _isClanModRole(role){
  return role === 'leader' || role === 'co_leader' || role === 'officer';
}

function _getSeasonId(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function _seasonClaimKey(clanId, uid){
  return `hc_clan_reward_claim_${_getSeasonId()}_${clanId}_${uid}`;
}

function _ensureClanExtendedUI(){
  const modal = document.getElementById('clanModal');
  if (!modal) return;
  const box = modal.querySelector('.rmodal-box');
  if (!box || document.getElementById('clanAdvancedSection')) return;
  const section = document.createElement('div');
  section.id = 'clanAdvancedSection';
  section.style.cssText = 'margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:12px';
  section.innerHTML = `
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px;text-align:left">
      <h4 style="margin:0 0 8px 0;color:#2d3748">Clan Settings</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <input id="clanLogoInput" maxlength="2" placeholder="Logo (emoji)" />
        <input id="clanBannerInput" maxlength="16" placeholder="Banner color (#hex)" />
      </div>
      <select id="clanVisibilitySelect" style="margin-top:8px">
        <option value="public">Public</option>
        <option value="private">Private</option>
      </select>
      <textarea id="clanDescInput" rows="2" maxlength="140" placeholder="Clan description" style="margin-top:8px"></textarea>
      <button onclick="saveClanSettings()" style="width:auto;background:#0f766e">Save Settings</button>
      <div id="clanSeasonRewardBox" style="margin-top:8px;font-size:12px;color:#475569"></div>
    </div>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px;text-align:left">
      <h4 style="margin:0 0 8px 0;color:#2d3748">Join Requests / Clash History</h4>
      <div id="clanJoinRequests" style="max-height:120px;overflow:auto;font-size:12px;color:#334155;margin-bottom:8px">No pending requests.</div>
      <div id="clanClashHistory" style="max-height:140px;overflow:auto;font-size:12px;color:#334155">No clash history.</div>
    </div>`;
  const closeRow = Array.from(box.querySelectorAll('div')).find(d => (d.style && d.style.justifyContent === 'flex-end'));
  if (closeRow && closeRow.parentNode) closeRow.parentNode.insertBefore(section, closeRow);
  else box.appendChild(section);
}

function _renderSeasonRewardPrompt(clans){
  const el = document.getElementById('clanSeasonRewardBox');
  if (!el || !_clanSignedIn() || !myClanId) return;
  const season = _getSeasonId();
  const rank = clans.findIndex(c => c.id === myClanId);
  if (rank < 0 || rank > 2) {
    el.innerHTML = `Season ${season}: Finish Top 3 for bonus rewards.`;
    return;
  }
  const claimKey = _seasonClaimKey(myClanId, currentUser.uid);
  const claimed = localStorage.getItem(claimKey) === '1';
  const label = rank === 0 ? 'Top 1' : rank === 1 ? 'Top 2' : 'Top 3';
  if (claimed) {
    el.innerHTML = `Season ${season}: ${label} reward already claimed.`;
    return;
  }
  el.innerHTML = `Season ${season}: ${label} reward available <button onclick="claimClanSeasonReward(${rank+1})" style="width:auto;padding:4px 8px;background:#16a34a;font-size:11px">Claim</button>`;
}

async function claimClanSeasonReward(position){
  if (!_clanSignedIn() || !myClanId) return;
  const key = _seasonClaimKey(myClanId, currentUser.uid);
  if (localStorage.getItem(key) === '1') {
    showToast('Season reward already claimed.', '#64748b');
    return;
  }
  const rewards = {
    1: { rp: 80, aura: 40, tokens: 8 },
    2: { rp: 50, aura: 24, tokens: 5 },
    3: { rp: 30, aura: 14, tokens: 3 }
  };
  const r = rewards[position] || rewards[3];
  const p = DataManager.getPlayerProfile();
  p.rankPoints = Math.max(0, Number(p.rankPoints || 0) + r.rp);
  p.aura = Math.max(0, Number(p.aura || 0) + r.aura);
  p.matchTokens = Math.max(0, Number(p.matchTokens || 0) + r.tokens);
  p.rankTier = (typeof DataManager._resolveRankTier === 'function') ? DataManager._resolveRankTier(p.rankPoints) : p.rankTier;
  p.lastUpdated = new Date().toISOString();
  DataManager.savePlayerProfile(p);
  updatePlayerProfileUI();
  localStorage.setItem(key, '1');
  showToast('Season reward claimed.', '#16a34a');
  if (typeof showAuraBurstAnimation === 'function') showAuraBurstAnimation(r.aura);
  if (typeof showCoinBankAnimation === 'function') showCoinBankAnimation(r.tokens);
  if (typeof showRankGainAnimation === 'function') showRankGainAnimation(r.rp, p.rankTier, null);
}

async function saveClanSettings(){
  if (!_clanSignedIn() || !myClanId || !_isClanAdminRole(myClanRole)) {
    await uiAlert('Only leader/co-leader can update settings.', 'Clan Settings');
    return;
  }
  const visibility = String((document.getElementById('clanVisibilitySelect') || {}).value || 'public');
  const description = Security.sanitizeInput((document.getElementById('clanDescInput') || {}).value || '').slice(0, 140);
  const logo = String((document.getElementById('clanLogoInput') || {}).value || '').trim().slice(0, 2) || '🛡️';
  const banner = String((document.getElementById('clanBannerInput') || {}).value || '').trim().slice(0, 16);
  try {
    await _clanRef(myClanId).set({
      visibility: visibility === 'private' ? 'private' : 'public',
      description,
      logo,
      bannerColor: banner,
      seasonId: _getSeasonId(),
      updatedAtMs: Date.now()
    }, { merge: true });
    showToast('Clan settings saved.', '#0f766e');
  } catch(e){
    console.error('save clan settings error:', e);
    await uiAlert('Could not save settings.', 'Clan Settings');
  }
}

async function _submitJoinRequest(clanId, clanName){
  const reqRef = db.collection('hc_clanJoinRequests').doc(`${clanId}_${currentUser.uid}`);
  await reqRef.set({
    clanId,
    clanName: clanName || 'Clan',
    uid: currentUser.uid,
    name: currentUser.displayName || 'Player',
    aura: _clanMyAura(),
    status: 'pending',
    createdAtMs: Date.now(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

async function _joinUserToClanInternal(clanId, clanName, uid, name, aura, role){
  const memberRole = role || 'member';
  const userRef = db.collection('hc_clanUsers').doc(uid);
  await db.runTransaction(async tx => {
    const userSnap = await tx.get(userRef);
    const ud = userSnap.exists ? (userSnap.data() || {}) : {};
    if (ud.clanId && ud.clanId !== clanId) throw new Error('already-in-other-clan');

    tx.set(_clanRef(clanId).collection('members').doc(uid), {
      uid,
      name: name || 'Player',
      aura: Number(aura || 0),
      role: memberRole,
      joinedAtMs: Date.now()
    }, { merge: true });

    tx.set(userRef, {
      uid,
      clanId,
      clanName: clanName || 'Clan',
      role: memberRole,
      updatedAtMs: Date.now()
    }, { merge: true });
  });
  await _recomputeClanAggregate(clanId);
}

const _baseJoinClanById = joinClanById;
joinClanById = async function(clanId){
  if (!_clanSignedIn()) {
    await uiAlert('Please sign in first.', 'Clan');
    return;
  }
  if (!clanId) return;
  if (myClanId) {
    await uiAlert('You are already in a clan.', 'Clan');
    return;
  }
  try {
    const snap = await _clanRef(clanId).get();
    if (!snap.exists) {
      await uiAlert('Clan not found.', 'Clan');
      return;
    }
    const clan = snap.data() || {};
    const visibility = clan.visibility || 'public';
    if (visibility === 'private') {
      await _submitJoinRequest(clanId, clan.name || 'Clan');
      showToast('Join request sent to clan admins.', '#0ea5e9');
      return;
    }
    await _baseJoinClanById(clanId);
  } catch(e){
    console.error('enhanced join clan error:', e);
    await uiAlert('Could not join clan.', 'Clan');
  }
};

async function setClanMemberRole(uid, role){
  if (!_clanSignedIn() || !myClanId || myClanRole !== 'leader') return;
  if (!uid || uid === currentUser.uid) return;
  const allowed = ['member','officer','co_leader'];
  const nextRole = allowed.includes(role) ? role : 'member';
  try {
    await _clanRef(myClanId).collection('members').doc(uid).set({ role: nextRole, updatedAtMs: Date.now() }, { merge: true });
    await db.collection('hc_clanUsers').doc(uid).set({ role: nextRole, updatedAtMs: Date.now() }, { merge: true });
    showToast('Member role updated.', '#0ea5e9');
  } catch(e){
    console.error('set role error:', e);
  }
}

async function transferClanLeadership(uid){
  if (!_clanSignedIn() || !myClanId || myClanRole !== 'leader' || !uid || uid === currentUser.uid) return;
  const ok = await uiConfirm('Transfer leadership to this member?', 'Transfer Leadership');
  if (!ok) return;
  try {
    const ref = _clanRef(myClanId);
    await db.runTransaction(async tx => {
      const clanSnap = await tx.get(ref);
      if (!clanSnap.exists) throw new Error('clan-not-found');
      const memberSnap = await tx.get(ref.collection('members').doc(uid));
      if (!memberSnap.exists) throw new Error('member-not-found');
      const target = memberSnap.data() || {};
      tx.set(ref, {
        leaderUid: uid,
        leaderName: target.name || 'Leader',
        updatedAtMs: Date.now()
      }, { merge: true });
      tx.set(ref.collection('members').doc(currentUser.uid), { role: 'co_leader', updatedAtMs: Date.now() }, { merge: true });
      tx.set(ref.collection('members').doc(uid), { role: 'leader', updatedAtMs: Date.now() }, { merge: true });
      tx.set(db.collection('hc_clanUsers').doc(currentUser.uid), { role: 'co_leader', updatedAtMs: Date.now() }, { merge: true });
      tx.set(db.collection('hc_clanUsers').doc(uid), { role: 'leader', updatedAtMs: Date.now() }, { merge: true });
    });
    showToast('Leadership transferred.', '#16a34a');
    await _loadMyClanMembership();
  } catch(e){
    console.error('transfer leadership error:', e);
  }
}

async function kickClanMember(uid){
  if (!_clanSignedIn() || !myClanId || !_isClanAdminRole(myClanRole) || !uid || uid === currentUser.uid) return;
  const ok = await uiConfirm('Remove this member from clan?', 'Kick Member');
  if (!ok) return;
  try {
    const ref = _clanRef(myClanId);
    await db.runTransaction(async tx => {
      const memberSnap = await tx.get(ref.collection('members').doc(uid));
      if (!memberSnap.exists) return;
      const m = memberSnap.data() || {};
      if (m.role === 'leader') throw new Error('cannot-kick-leader');
      tx.delete(ref.collection('members').doc(uid));
      tx.delete(db.collection('hc_clanUsers').doc(uid));
    });
    await _recomputeClanAggregate(myClanId);
    showToast('Member removed.', '#dc2626');
  } catch(e){
    console.error('kick member error:', e);
  }
}

function _renderClanMembers(clan, members){
  const box = document.getElementById('clanMembers');
  if (!box) return;
  if (!clan) {
    box.innerHTML = '<p style="color:#64748b">No clan joined.</p>';
    return;
  }

  const logo = clan.logo || '🛡️';
  const desc = clan.description ? `<div style="font-size:12px;color:#475569;margin-top:4px">${_clanEsc(clan.description)}</div>` : '';
  const vis = clan.visibility === 'private' ? 'Private' : 'Public';

  let html = '';
  html += `<div style="margin-bottom:8px;padding:10px;border-radius:10px;background:${_clanEsc(clan.bannerColor || '#eef2ff')};"><strong style="font-size:16px">${_clanEsc(logo)} ${_clanEsc(clan.name || 'Clan')}</strong> [${_clanEsc(clan.tag || '-')}] <span style="font-size:11px;color:#334155">(${vis})</span><br><span>Avg Aura <strong>${Number(clan.avgAura || 0)}</strong> | Members ${Number(clan.memberCount || 0)} | Season Pts ${Number(clan.seasonPoints || 0)}</span>${desc}</div>`;

  if (!members.length) {
    html += '<p style="color:#64748b">No members.</p>';
  } else {
    members.sort((a,b)=>Number(b.aura||0)-Number(a.aura||0));
    html += members.map(m=>{
      const uid = m.uid || '';
      const muted = !!currentClanMutedMap[uid];
      const role = m.role || 'member';
      const roleLabel = role === 'leader' ? 'Leader' : role === 'co_leader' ? 'Co-Leader' : role === 'officer' ? 'Officer' : 'Member';
      let controls = '';

      if (_isClanModRole(myClanRole) && uid && uid !== currentUser.uid) {
        const muteLabel = muted ? 'Unmute' : 'Mute';
        const muteColor = muted ? '#0284c7' : '#b91c1c';
        controls += `<button onclick="toggleClanMute('${_clanEsc(uid)}')" style="width:auto;padding:4px 7px;background:${muteColor};font-size:10px">${muteLabel}</button>`;
      }

      if (myClanRole === 'leader' && uid && uid !== currentUser.uid) {
        if (role !== 'co_leader') controls += ` <button onclick="setClanMemberRole('${_clanEsc(uid)}','co_leader')" style="width:auto;padding:4px 7px;background:#1d4ed8;font-size:10px">CoL</button>`;
        if (role !== 'officer') controls += ` <button onclick="setClanMemberRole('${_clanEsc(uid)}','officer')" style="width:auto;padding:4px 7px;background:#0369a1;font-size:10px">Officer</button>`;
        if (role !== 'member') controls += ` <button onclick="setClanMemberRole('${_clanEsc(uid)}','member')" style="width:auto;padding:4px 7px;background:#475569;font-size:10px">Member</button>`;
        controls += ` <button onclick="transferClanLeadership('${_clanEsc(uid)}')" style="width:auto;padding:4px 7px;background:#16a34a;font-size:10px">Leader</button>`;
        if (role !== 'leader') controls += ` <button onclick="kickClanMember('${_clanEsc(uid)}')" style="width:auto;padding:4px 7px;background:#dc2626;font-size:10px">Kick</button>`;
      }

      return `<div style="padding:5px 0;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;gap:6px"><span>${_clanEsc(m.name || 'Player')} (${roleLabel})${muted?' <em style="color:#b91c1c">[muted]</em>':''}</span><span style="display:flex;align-items:center;gap:4px;flex-wrap:wrap"><span>Aura ${Number(m.aura||0)}</span>${controls}</span></div>`;
    }).join('');
  }
  box.innerHTML = html;

  const visibilityEl = document.getElementById('clanVisibilitySelect');
  const descEl = document.getElementById('clanDescInput');
  const logoEl = document.getElementById('clanLogoInput');
  const bannerEl = document.getElementById('clanBannerInput');
  if (visibilityEl) visibilityEl.value = clan.visibility === 'private' ? 'private' : 'public';
  if (descEl) descEl.value = clan.description || '';
  if (logoEl) logoEl.value = clan.logo || '';
  if (bannerEl) bannerEl.value = clan.bannerColor || '';
}

let clanJoinReqUnsub = null;
function _listenClanJoinRequests(){
  const box = document.getElementById('clanJoinRequests');
  if (!_clanSignedIn() || !myClanId || !_isClanAdminRole(myClanRole)) {
    if (clanJoinReqUnsub) { clanJoinReqUnsub(); clanJoinReqUnsub = null; }
    if (box) box.innerHTML = '<p style="margin:0;color:#64748b">Leader/co-leader only.</p>';
    return;
  }
  if (clanJoinReqUnsub) clanJoinReqUnsub();
  clanJoinReqUnsub = db.collection('hc_clanJoinRequests')
    .where('clanId','==',myClanId)
    .where('status','==','pending')
    .onSnapshot(snap => {
      const rows = snap.docs.map(d => ({ id:d.id, ...(d.data()||{}) }));
      if (!box) return;
      if (!rows.length) {
        box.innerHTML = '<p style="margin:0;color:#64748b">No pending requests.</p>';
        return;
      }
      box.innerHTML = rows.map(r => `<div style="padding:5px 0;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;gap:6px"><span>${_clanEsc(r.name||'Player')} (Aura ${Number(r.aura||0)})</span><span><button onclick="approveJoinRequest('${_clanEsc(r.id)}')" style="width:auto;padding:4px 7px;background:#16a34a;font-size:10px">Approve</button> <button onclick="rejectJoinRequest('${_clanEsc(r.id)}')" style="width:auto;padding:4px 7px;background:#dc2626;font-size:10px">Reject</button></span></div>`).join('');
    }, err => console.error('join req listener error:', err));
}

async function approveJoinRequest(requestId){
  if (!_clanSignedIn() || !myClanId || !_isClanAdminRole(myClanRole) || !requestId) return;
  try {
    const reqRef = db.collection('hc_clanJoinRequests').doc(requestId);
    await db.runTransaction(async tx => {
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists) throw new Error('request-not-found');
      const req = reqSnap.data() || {};
      if (req.status !== 'pending' || req.clanId !== myClanId) throw new Error('invalid-request');

      tx.set(_clanRef(myClanId).collection('members').doc(req.uid), {
        uid: req.uid,
        name: req.name || 'Player',
        aura: Number(req.aura || 0),
        role: 'member',
        joinedAtMs: Date.now()
      }, { merge: true });

      tx.set(db.collection('hc_clanUsers').doc(req.uid), {
        uid: req.uid,
        clanId: myClanId,
        clanName: myClanName || 'Clan',
        role: 'member',
        updatedAtMs: Date.now()
      }, { merge: true });

      tx.set(reqRef, {
        status: 'approved',
        resolvedByUid: currentUser.uid,
        resolvedAtMs: Date.now()
      }, { merge: true });
    });
    await _recomputeClanAggregate(myClanId);
    showToast('Join request approved.', '#16a34a');
  } catch(e){
    console.error('approve request error:', e);
  }
}

async function rejectJoinRequest(requestId){
  if (!_clanSignedIn() || !myClanId || !_isClanAdminRole(myClanRole) || !requestId) return;
  try {
    await db.collection('hc_clanJoinRequests').doc(requestId).set({
      status: 'rejected',
      resolvedByUid: currentUser.uid,
      resolvedAtMs: Date.now()
    }, { merge: true });
    showToast('Join request rejected.', '#64748b');
  } catch(e){
    console.error('reject request error:', e);
  }
}

function _renderClashes(items){
  const activeBox = document.getElementById('clanChallenges');
  const historyBox = document.getElementById('clanClashHistory');
  const sorted = [...items].sort((a,b)=>Number(b.createdAtMs||0)-Number(a.createdAtMs||0));
  const active = sorted.filter(c => ['pending','accepted','live'].includes(c.status));
  const finished = sorted.filter(c => c.status === 'finished' || c.status === 'rejected');

  if (activeBox) {
    if (!active.length) {
      activeBox.innerHTML = '<p style="margin:0;color:#64748b">No active clan clashes.</p>';
    } else {
      activeBox.innerHTML = active.map(c => {
        const status = c.status || 'pending';
        const mineAsTarget = c.toClanId === myClanId;
        const mineAsSource = c.fromClanId === myClanId;
        let actions = '';
        if (status === 'pending' && mineAsTarget && _isClanAdminRole(myClanRole)) {
          actions = `<button onclick="respondClanChallenge('${_clanEsc(c.id)}','accepted')" style="width:auto;padding:5px 9px;background:#16a34a">Accept</button> <button onclick="respondClanChallenge('${_clanEsc(c.id)}','rejected')" style="width:auto;padding:5px 9px;background:#dc2626">Reject</button>`;
        } else if ((status === 'accepted' || status === 'live') && _isClanAdminRole(myClanRole) && (mineAsTarget || mineAsSource)) {
          const otherId = mineAsTarget ? c.fromClanId : c.toClanId;
          actions = `<button onclick="finishClanChallenge('${_clanEsc(c.id)}','${_clanEsc(myClanId)}')" style="width:auto;padding:5px 9px;background:#0ea5e9">Mark Win</button> <button onclick="finishClanChallenge('${_clanEsc(c.id)}','${_clanEsc(otherId)}')" style="width:auto;padding:5px 9px;background:#64748b">Mark Lose</button>`;
        }
        return `<div style="padding:6px 0;border-bottom:1px solid #e2e8f0"><div>${_clanEsc(c.fromClanName||'Clan')} vs ${_clanEsc(c.toClanName||'Clan')} | <strong>${_clanEsc(status)}</strong></div><div style="margin-top:4px">${actions}</div></div>`;
      }).join('');
    }
  }

  if (historyBox) {
    if (!finished.length) {
      historyBox.innerHTML = '<p style="margin:0;color:#64748b">No clash history.</p>';
    } else {
      historyBox.innerHTML = finished.slice(0, 30).map(c => {
        const winner = c.winnerClanName ? `Winner: ${_clanEsc(c.winnerClanName)}` : `Result: ${_clanEsc(c.status || '-')}`;
        return `<div style="padding:5px 0;border-bottom:1px solid #e2e8f0">${_clanEsc(c.fromClanName||'Clan')} vs ${_clanEsc(c.toClanName||'Clan')}<br><span style="color:#475569">${winner}</span></div>`;
      }).join('');
    }
  }
}

async function _settleClanClash(ref, c, winnerClanId, mode){
  const loserClanId = winnerClanId === c.fromClanId ? c.toClanId : c.fromClanId;
  const winnerName = winnerClanId === c.fromClanId ? c.fromClanName : c.toClanName;
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const live = snap.data() || {};
    if (live.status === 'finished' || live.status === 'rejected') return;

    tx.set(ref, {
      status: 'finished',
      winnerClanId,
      winnerClanName: winnerName,
      finishedAtMs: Date.now(),
      finishedAt: firebase.firestore.FieldValue.serverTimestamp(),
      settledByUid: currentUser ? currentUser.uid : null,
      settleMode: mode || 'manual'
    }, { merge: true });

    tx.set(_clanRef(winnerClanId), {
      wins: firebase.firestore.FieldValue.increment(1),
      clashes: firebase.firestore.FieldValue.increment(1),
      seasonPoints: firebase.firestore.FieldValue.increment(25),
      seasonWins: firebase.firestore.FieldValue.increment(1),
      seasonId: _getSeasonId(),
      updatedAtMs: Date.now()
    }, { merge: true });

    tx.set(_clanRef(loserClanId), {
      losses: firebase.firestore.FieldValue.increment(1),
      clashes: firebase.firestore.FieldValue.increment(1),
      seasonPoints: firebase.firestore.FieldValue.increment(8),
      seasonLosses: firebase.firestore.FieldValue.increment(1),
      seasonId: _getSeasonId(),
      updatedAtMs: Date.now()
    }, { merge: true });
  });
}

const _baseRespondClanChallenge = respondClanChallenge;
respondClanChallenge = async function(clashId, status){
  if (!_clanSignedIn() || !myClanId || !_isClanAdminRole(myClanRole)) return;
  await _baseRespondClanChallenge(clashId, status);
  if (status !== 'accepted') return;
  try {
    await db.collection('hc_clanClashes').doc(clashId).set({
      status: 'live',
      liveAtMs: Date.now(),
      autoResolveAtMs: Date.now() + 60000
    }, { merge: true });
    showToast('Clash live. Auto settlement in ~60s if not finished manually.', '#0ea5e9');
  } catch(e){
    console.error('set clash live error:', e);
  }
};

finishClanChallenge = async function(clashId, winnerClanId){
  if (!_clanSignedIn() || !myClanId || !_isClanAdminRole(myClanRole)) return;
  try {
    const ref = db.collection('hc_clanClashes').doc(clashId);
    const snap = await ref.get();
    if (!snap.exists) return;
    const c = snap.data() || {};
    if (!winnerClanId || (winnerClanId !== c.fromClanId && winnerClanId !== c.toClanId)) return;
    await _settleClanClash(ref, c, winnerClanId, 'manual');
    showToast('Clan clash finished.', '#16a34a');
    await _refreshClanLists();
  } catch(e){
    console.error('finish clash error:', e);
  }
};

let _clanAutoResolveTimer = null;
async function _autoResolveClanClashes(){
  if (!_clanSignedIn() || !myClanId || !_isClanAdminRole(myClanRole)) return;
  try {
    const now = Date.now();
    const snap = await db.collection('hc_clanClashes')
      .where('participants', 'array-contains', myClanId)
      .where('status', 'in', ['live','accepted'])
      .get();
    for (const d of snap.docs) {
      const c = d.data() || {};
      const deadline = Number(c.autoResolveAtMs || 0);
      if (!deadline || deadline > now) continue;

      const fromSnap = await _clanRef(c.fromClanId).get();
      const toSnap = await _clanRef(c.toClanId).get();
      const from = fromSnap.exists ? (fromSnap.data() || {}) : {};
      const to = toSnap.exists ? (toSnap.data() || {}) : {};
      const fromPower = Number(from.avgAura || 0) + Number(from.seasonPoints || 0) * 0.05 + Math.random() * 12;
      const toPower = Number(to.avgAura || 0) + Number(to.seasonPoints || 0) * 0.05 + Math.random() * 12;
      const winnerClanId = fromPower >= toPower ? c.fromClanId : c.toClanId;
      await _settleClanClash(d.ref, c, winnerClanId, 'auto');
    }
  } catch(e){
    console.error('auto resolve clash error:', e);
  }
}

function _startClanAutoResolveTimer(){
  if (_clanAutoResolveTimer) clearInterval(_clanAutoResolveTimer);
  _clanAutoResolveTimer = setInterval(() => {
    _autoResolveClanClashes().catch(()=>{});
  }, 12000);
}

const _baseRefreshClanLists = _refreshClanLists;
_refreshClanLists = async function(){
  await _baseRefreshClanLists();
  try {
    const snap = await db.collection('hc_clans').orderBy('seasonPoints', 'desc').limit(30).get();
    const clans = snap.docs.map(d=>({ id:d.id, ...(d.data()||{}) }));
    const lb = document.getElementById('clanLeaderboard');
    if (lb) {
      if (!clans.length) lb.innerHTML = '<p style="color:#64748b">No leaderboard data yet.</p>';
      else lb.innerHTML = clans.slice(0,20).map((c,i)=>`<div style="padding:6px 0;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between"><span>#${i+1} ${_clanEsc(c.name||'Clan')}</span><span>Season ${Number(c.seasonPoints||0)} | Avg ${Number(c.avgAura||0)}</span></div>`).join('');
    }
    _renderSeasonRewardPrompt(clans);
  } catch(e){
    console.error('season leaderboard error:', e);
  }
};

const _baseOpenClanModal = openClanModal;
openClanModal = async function(){
  _ensureClanExtendedUI();
  await _baseOpenClanModal();
  _listenClanJoinRequests();
  _startClanAutoResolveTimer();
};

const _baseCloseClanModal = closeClanModal;
closeClanModal = function(){
  _baseCloseClanModal();
  if (clanJoinReqUnsub) { clanJoinReqUnsub(); clanJoinReqUnsub = null; }
  if (_clanAutoResolveTimer) { clearInterval(_clanAutoResolveTimer); _clanAutoResolveTimer = null; }
};

_setClanButtonsState = function(){
  const signed = _clanSignedIn();
  const inClan = !!myClanId;
  const createBtn = document.getElementById('clanCreateBtn');
  const leaveBtn = document.getElementById('clanLeaveBtn');
  const challengeBtn = document.getElementById('clanChallengeBtn');
  const joinInviteBtn = document.getElementById('clanJoinInviteBtn');
  const regenBtn = document.getElementById('clanRegenInviteBtn');

  if (createBtn) createBtn.disabled = !signed || inClan;
  if (leaveBtn) leaveBtn.disabled = !signed || !inClan;
  if (challengeBtn) challengeBtn.disabled = !signed || !inClan || !_isClanAdminRole(myClanRole);
  if (joinInviteBtn) joinInviteBtn.disabled = !signed || inClan;
  if (regenBtn) regenBtn.disabled = !signed || !inClan || !_isClanAdminRole(myClanRole);
};

window.setClanMemberRole = setClanMemberRole;
window.transferClanLeadership = transferClanLeadership;
window.kickClanMember = kickClanMember;
window.approveJoinRequest = approveJoinRequest;
window.rejectJoinRequest = rejectJoinRequest;
window.saveClanSettings = saveClanSettings;
window.claimClanSeasonReward = claimClanSeasonReward;
