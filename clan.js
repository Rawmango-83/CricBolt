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
      return `<div style="padding:4px 0;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;gap:6px"><span><strong style="color:#7c3aed">[${_clanEsc(clan.tag || clan.name || 'CLAN')}]</strong> ${_clanEsc(m.name || 'Player')} (${role})${muted?' <em style="color:#b91c1c">[muted]</em>':''}</span><span style="display:flex;align-items:center;gap:6px"><span>Aura ${Number(m.aura||0)}</span>${controls}</span></div>`;
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

  if (name.length < 3 || name.length > 8) {
    await uiAlert('Clan name must be 3 to 8 characters.', 'Clan');
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
    const userName = (typeof getPublicUserName==='function'?getPublicUserName():(currentUser.displayName||'Player'));
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
      leaderName: (typeof getPublicUserName==='function'?getPublicUserName():(currentUser.displayName||'Player')),
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
    const userName = (typeof getPublicUserName==='function'?getPublicUserName():(currentUser.displayName||'Player'));
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
      name: (typeof getPublicUserName==='function'?getPublicUserName():(currentUser.displayName||'Player')),
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
      reporterName: (typeof getPublicUserName==='function'?getPublicUserName():(currentUser.displayName||'Player')),
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
  const mount = document.getElementById('clanSettingsMount');
  if (!mount || document.getElementById('clanAdvancedSection')) return;

  const section = document.createElement('div');
  section.id = 'clanAdvancedSection';
  section.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:12px';
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

  mount.appendChild(section);
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
    name: (typeof getPublicUserName==='function'?getPublicUserName():(currentUser.displayName||'Player')),
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
  active.filter(c => c.status==='live' && c.roomId).forEach(c => { _syncClanClashSettlementFromRoom(c); });
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
      .where('status', '==', 'live')
      .limit(40)
      .get();

    for (const d of snap.docs) {
      const c = d.data() || {};
      const autoMs = Number(c.autoResolveAtMs || 0);
      if (!autoMs || autoMs > now) continue;
      if (!Array.isArray(c.participants) || !c.participants.includes(myClanId)) continue;
      const winnerClanId = _clanPower({ avgAura:c.fromAvgAura||0, seasonPoints:c.fromSeasonPoints||0, memberCount:c.fromMemberCount||0 }) >= _clanPower({ avgAura:c.toAvgAura||0, seasonPoints:c.toSeasonPoints||0, memberCount:c.toMemberCount||0 })
        ? c.fromClanId : c.toClanId;
      if (!winnerClanId) continue;
      await _settleClanClash(d.ref, c, winnerClanId, 'auto-timeout');
    }
  } catch(e){
    console.error('auto resolve clan clashes error:', e);
  }
}

async function _attemptClanWarMatchmaking(){
  if (!_clanSignedIn() || !myClanId || !_isClanAdminRole(myClanRole)) return;
  const meRef = _clanWarQueueRef();
  if (!meRef) return;

  const meSnap = await meRef.get();
  if (!meSnap.exists) return;
  const me = meSnap.data() || {};
  if (me.status !== 'searching') return;

  const mode = String(me.mode || 't20i');
  const overs = Number(me.overs || 4);
  const q = await db.collection('hc_clanWarQueue').where('status', '==', 'searching').limit(40).get();

  const pool = q.docs
    .map(d => ({ id: d.id, ...(d.data() || {}) }))
    .filter(x => x.id !== myClanId && x.clanId && x.status === 'searching' && String(x.mode||'')===mode && Number(x.overs||0)===overs);
  if (!pool.length) return;

  const myPower = _clanPower(me);
  pool.sort((a,b)=>Math.abs(_clanPower(a)-myPower)-Math.abs(_clanPower(b)-myPower));
  const opp = pool[0];
  if (!opp || !opp.clanId) return;

  const oppRef = db.collection('hc_clanWarQueue').doc(opp.clanId);
  const clashRef = db.collection('hc_clanClashes').doc();

  let created = false;
  await db.runTransaction(async tx => {
    const [liveMe, liveOpp] = await Promise.all([tx.get(meRef), tx.get(oppRef)]);
    if (!liveMe.exists || !liveOpp.exists) return;

    const m = liveMe.data() || {};
    const o = liveOpp.data() || {};
    const sameConfig = String(m.mode||'') === String(o.mode||'') && Number(m.overs||0) === Number(o.overs||0);
    if (m.status !== 'searching' || o.status !== 'searching' || !sameConfig) return;

    const mSquad = Array.isArray(m.squad) ? m.squad.slice(0, 5) : [];
    const oSquad = Array.isArray(o.squad) ? o.squad.slice(0, 5) : [];
    if (mSquad.length !== 5 || oSquad.length !== 5) return;

    const now = Date.now();
    const roomRef = db.collection('hc_rankedRooms').doc();
    const p1 = { uid: m.leaderUid || currentUser.uid, name: m.leaderName || m.clanName || 'Clan A', rankTier: 'Clan', rankPoints: 0 };
    const p2 = { uid: o.leaderUid || '', name: o.leaderName || o.clanName || 'Clan B', rankTier: 'Clan', rankPoints: 0 };
    if (!p1.uid || !p2.uid) return;

    tx.set(roomRef, {
      type: 'clan_clash',
      sourceClashId: clashRef.id,
      status: 'waiting_start',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAtMs: now,
      overs,
      mode,
      readyMap: {},
      playerUids: [p1.uid, p2.uid],
      players: [p1, p2],
      teamLineups: {
        [p1.uid]: mSquad.map(x => String(x.name || 'Player')),
        [p2.uid]: oSquad.map(x => String(x.name || 'Player'))
      }
    }, { merge: true });

    tx.set(clashRef, {
      fromClanId: m.clanId,
      fromClanName: m.clanName || 'Clan',
      toClanId: o.clanId,
      toClanName: o.clanName || 'Clan',
      participants: [m.clanId, o.clanId],
      initiatorUid: p1.uid,
      initiatorName: p1.name,
      respondedByUid: p2.uid,
      respondedByName: p2.name,
      fromLeaderUid: p1.uid,
      toLeaderUid: p2.uid,
      fromSquad: mSquad,
      toSquad: oSquad,
      fromStriker: mSquad[0] || null,
      fromNonStriker: mSquad[1] || null,
      toStriker: oSquad[0] || null,
      toNonStriker: oSquad[1] || null,
      fromAvgAura: Number(m.avgAura || 0),
      toAvgAura: Number(o.avgAura || 0),
      fromSeasonPoints: Number(m.seasonPoints || 0),
      toSeasonPoints: Number(o.seasonPoints || 0),
      fromMemberCount: Number(m.memberCount || 0),
      toMemberCount: Number(o.memberCount || 0),
      mode,
      overs,
      status: 'live',
      queueMatch: true,
      roomId: roomRef.id,
      liveAtMs: now,
      autoResolveAtMs: now + 600000,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAtMs: now
    }, { merge: true });

    tx.delete(meRef);
    tx.delete(oppRef);
    created = true;
  });

  if (created) {
    _setClanQueueButtons(false);
    _setClanQueueStatus('Match found. Clan war is live.', '#16a34a');
    showToast('Clan war match found. Open Clan Clash panel and tap Play Clash.', '#16a34a');
  }
}
function _startClanWarQueueListener(){
  if (clanWarQueueUnsub) { clanWarQueueUnsub(); clanWarQueueUnsub = null; }
  if (!_clanSignedIn() || !myClanId) {
    _setClanQueueButtons(false);
    _setClanQueueStatus('Join a clan to use clan war queue.', '#64748b');
    return;
  }

  const ref = _clanWarQueueRef();
  if (!ref) return;
  clanWarQueueUnsub = ref.onSnapshot(snap => {
    if (!snap.exists) {
      _setClanQueueButtons(false);
      _setClanQueueStatus('Queue idle.', '#475569');
      return;
    }
    const d = snap.data() || {};
    const searching = d.status === 'searching';
    _setClanQueueButtons(searching);
    if (searching) {
      _setClanQueueStatus(`Searching ${String(d.mode||'').toUpperCase()} ${Number(d.overs||0)}ov...`, '#0284c7');
    } else {
      _setClanQueueStatus('Queue idle.', '#475569');
      _setClanQueueButtons(false);
    }
  }, () => {
    _setClanQueueStatus('Queue listener error.', '#b91c1c');
  });
}

function _startClanWarMatchTimer(){
  if (clanWarMatchTimer) clearInterval(clanWarMatchTimer);
  clanWarMatchTimer = setInterval(() => {
    _attemptClanWarMatchmaking().catch(() => {});
    _autoResolveClanClashes().catch(() => {});
  }, 8000);
}

function _stopClanWarMatchTimer(){
  if (clanWarMatchTimer) {
    clearInterval(clanWarMatchTimer);
    clanWarMatchTimer = null;
  }
}

async function joinClanWarQueue(){
  if (!_clanSignedIn() || !myClanId) {
    await uiAlert('Join a clan first.', 'Clan War Queue');
    return;
  }
  if (!_isClanAdminRole(myClanRole)) {
    await uiAlert('Only clan leader/co-leader can queue clan war.', 'Clan War Queue');
    return;
  }

  try {
    const clanSnap = await _clanRef(myClanId).get();
    if (!clanSnap.exists) {
      await uiAlert('Clan not found.', 'Clan War Queue');
      return;
    }
    const clan = clanSnap.data() || {};
    const cfg = _getClanWarModeOvers();
    const squad = _getSelectedClanWarSquad();
    if (squad.length !== 5) {
      await uiAlert('Select exactly 5 clan players before joining war queue.', 'Clan War Queue');
      return;
    }

    await _clanWarQueueRef().set({
      clanId: myClanId,
      clanName: clan.name || myClanName || 'Clan',
      leaderUid: currentUser.uid,
      leaderName: (typeof getPublicUserName==='function'?getPublicUserName():(currentUser.displayName||'Player')),
      mode: cfg.mode,
      overs: cfg.overs,
      avgAura: Number(clan.avgAura || 0),
      seasonPoints: Number(clan.seasonPoints || 0),
      memberCount: Number(clan.memberCount || 0),
      status: 'searching',
      squad,
      striker: squad[0] || null,
      nonStriker: squad[1] || null,
      createdAtMs: Date.now(),
      updatedAtMs: Date.now()
    }, { merge: true });

    _setClanQueueButtons(true);
    _setClanQueueStatus(`Searching ${cfg.mode.toUpperCase()} ${cfg.overs}ov...`, '#0284c7');
    _startClanWarMatchTimer();
    await _attemptClanWarMatchmaking();
  } catch(e){
    console.error('join clan war queue error:', e);
    await uiAlert('Could not join clan war queue.', 'Clan War Queue');
  }
}

async function leaveClanWarQueue(silent){
  if (!_clanSignedIn() || !myClanId) return;
  try {
    const ref = _clanWarQueueRef();
    if (!ref) return;
    await ref.delete().catch(()=>{});
    _setClanQueueButtons(false);
    _setClanQueueStatus('Queue idle.', '#475569');
    _stopClanWarMatchTimer();
    if (!silent) showToast('Left clan war queue.', '#64748b');
  } catch(e){
    console.error('leave clan war queue error:', e);
  }
}

const _baseOpenClanModalWar = openClanModal;
openClanModal = async function(){
  await _baseOpenClanModalWar();
  _startClanWarQueueListener();
};

const _baseCloseClanModalWar = closeClanModal;
closeClanModal = function(){
  if (clanWarQueueUnsub) { clanWarQueueUnsub(); clanWarQueueUnsub = null; }
  _stopClanWarMatchTimer();
  _baseCloseClanModalWar();
};

const _baseLeaveClanWarAware = leaveClan;
leaveClan = async function(){
  await leaveClanWarQueue(true);
  await _baseLeaveClanWarAware();
};

const _baseSetClanButtonsStateWar = _setClanButtonsState;
_setClanButtonsState = function(){
  _baseSetClanButtonsStateWar();
  const canQueue = _clanSignedIn() && !!myClanId && _isClanAdminRole(myClanRole);
  const joinBtn = document.getElementById('clanQueueJoinBtn');
  const leaveBtn = document.getElementById('clanQueueLeaveBtn');
  if (joinBtn) joinBtn.disabled = !canQueue;
  if (leaveBtn) leaveBtn.disabled = !canQueue;
};

window.joinClanWarQueue = joinClanWarQueue;
window.leaveClanWarQueue = leaveClanWarQueue;


window.leaveClan = leaveClan;




// CLAN_WAR_ROSTER_V1
let clanWarSquadSelectedUids = [];
let clanWarMemberCache = [];

function _renderClanSquadPicker(clan, members){
  const box = document.getElementById('clanSquadPicker');
  if (!box) return;
  if (!clan || !Array.isArray(members) || !members.length) {
    box.innerHTML = '<div style="font-size:12px;color:#64748b">Choose 5 players for clan clash after joining a clan.</div>';
    return;
  }
  const valid = new Set(members.map(m => String(m.uid||'')));
  clanWarSquadSelectedUids = clanWarSquadSelectedUids.filter(uid => valid.has(uid));
  clanWarMemberCache = members.map(m => ({ uid:String(m.uid||''), name:String(m.name||'Player') }));

  const canEdit = _isClanAdminRole(myClanRole);
  const chips = members.map(m => {
    const uid = String(m.uid||'');
    const checked = clanWarSquadSelectedUids.includes(uid) ? 'checked' : '';
    const disabled = canEdit ? '' : 'disabled';
    return `<label style="display:inline-flex;align-items:center;gap:6px;padding:4px 8px;background:#fff;border:1px solid #e2e8f0;border-radius:999px;font-size:12px"><input type="checkbox" ${checked} ${disabled} onchange="toggleClanSquadMember('${_clanEsc(uid)}', this.checked)" />${_clanEsc(m.name||'Player')}</label>`;
  }).join('');

  box.innerHTML = `<div style="font-size:12px;color:#334155;margin-bottom:6px">Select exactly <strong>5</strong> players for clan clash squad.</div><div style="display:flex;flex-wrap:wrap;gap:6px">${chips}</div><div id="clanSquadCount" style="margin-top:6px;font-size:12px;color:#64748b">Selected: ${clanWarSquadSelectedUids.length}/5</div>`;
}

function toggleClanSquadMember(uid, checked){
  uid = String(uid||'');
  if (!uid) return;
  if (checked) {
    if (clanWarSquadSelectedUids.includes(uid)) return;
    if (clanWarSquadSelectedUids.length >= 5) {
      showToast('Select only 5 clan players.', '#e53e3e');
      _renderClanSquadPicker({ tag: myClanName||'CLAN' }, clanWarMemberCache);
      return;
    }
    clanWarSquadSelectedUids.push(uid);
  } else {
    clanWarSquadSelectedUids = clanWarSquadSelectedUids.filter(x => x !== uid);
  }
  const c = document.getElementById('clanSquadCount');
  if (c) c.textContent = `Selected: ${clanWarSquadSelectedUids.length}/5`;
}

function _getSelectedClanWarSquad(){
  const map = new Map(clanWarMemberCache.map(m => [String(m.uid), m]));
  const out = clanWarSquadSelectedUids.map(uid => map.get(String(uid))).filter(Boolean).slice(0, 5);
  return out;
}

const _baseRenderClanMembersRoster = _renderClanMembers;
_renderClanMembers = function(clan, members){
  _baseRenderClanMembersRoster(clan, members);
  _renderClanSquadPicker(clan, members || []);
};

createClanChallenge = async function(){
  if (!_clanSignedIn() || !myClanId) {
    await uiAlert('Join a clan first.', 'Clan Clash');
    return;
  }
  if (!_isClanAdminRole(myClanRole)) {
    await uiAlert('Only clan leader/co-leader can start clan clashes.', 'Clan Clash');
    return;
  }

  const squad = _getSelectedClanWarSquad();
  if (squad.length !== 5) {
    await uiAlert('Select exactly 5 clan players before creating clash.', 'Clan Clash');
    return;
  }

  const target = document.getElementById('clanTargetSelect');
  const toClanId = target ? target.value : '';
  const modeEl = document.getElementById('clanClashMode');
  const oversEl = document.getElementById('clanClashOvers');
  const clashMode = String((modeEl && modeEl.value) || 't20i');
  let clashOvers = Number((oversEl && oversEl.value) || _clashModeDefaults(clashMode));
  if (!Number.isFinite(clashOvers) || clashOvers < 1) clashOvers = _clashModeDefaults(clashMode);

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
      initiatorName: (typeof getPublicUserName==='function'?getPublicUserName():(currentUser.displayName||'Player')),
      mode: clashMode,
      overs: clashOvers,
      fromSquad: squad,
      fromStriker: squad[0] || null,
      fromNonStriker: squad[1] || null,
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAtMs: Date.now()
    });

    showToast(`Clan clash request sent (${clashMode.toUpperCase()} ${clashOvers}ov).`, '#0ea5e9');
  } catch(e){
    console.error('create clan clash error:', e);
    await uiAlert('Could not create clan clash.', 'Clan Clash');
  }
};

async function _ensureClanClashLiveRoom(clashId){
  const ref = db.collection('hc_clanClashes').doc(clashId);
  let roomId = null;
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const c = snap.data() || {};
    if (c.roomId) { roomId = c.roomId; return; }
    if (c.status !== 'accepted' && c.status !== 'live') return;

    const fromSquad = Array.isArray(c.fromSquad) ? c.fromSquad : [];
    const toSquad = Array.isArray(c.toSquad) ? c.toSquad : [];
    if (fromSquad.length !== 5 || toSquad.length !== 5) return;

    const roomRef = db.collection('hc_rankedRooms').doc();
    const p1 = { uid: c.initiatorUid, name: c.initiatorName || c.fromClanName || 'Clan A', rankTier: 'Clan', rankPoints: 0 };
    const p2 = { uid: c.respondedByUid, name: c.respondedByName || c.toClanName || 'Clan B', rankTier: 'Clan', rankPoints: 0 };

    tx.set(roomRef, {
      type: 'clan_clash',
      sourceClashId: clashId,
      status: 'waiting_start',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAtMs: Date.now(),
      overs: Number(c.overs || 4),
      mode: c.mode || 't20i',
      readyMap: {},
      playerUids: [p1.uid, p2.uid],
      players: [p1, p2]
    }, { merge: true });

    roomId = roomRef.id;
    tx.set(ref, {
      status: 'live',
      roomId,
      autoResolveAtMs: Date.now() + 600000,
      updatedAtMs: Date.now()
    }, { merge: true });
  });
  return roomId;
}

const _baseRespondClanChallengeRoster = respondClanChallenge;
respondClanChallenge = async function(clashId, status){
  if (status === 'accepted') {
    const squad = _getSelectedClanWarSquad();
    if (squad.length !== 5) {
      await uiAlert('Select exactly 5 clan players before accepting clash.', 'Clan Clash');
      return;
    }
    await _baseRespondClanChallengeRoster(clashId, status);
    await db.collection('hc_clanClashes').doc(clashId).set({
      toSquad: squad,
      toStriker: squad[0] || null,
      toNonStriker: squad[1] || null,
      respondedByName: (typeof getPublicUserName==='function'?getPublicUserName():(currentUser.displayName||'Player'))
    }, { merge: true });
    await _ensureClanClashLiveRoom(clashId);
    return;
  }
  await _baseRespondClanChallengeRoster(clashId, status);
};


const _clanClashRoomSettleInFlight = new Set();
async function _syncClanClashSettlementFromRoom(clash){
  if (!clash || clash.status !== 'live' || !clash.roomId) return;
  const key = String(clash.id || clash.roomId || '');
  if (!key || _clanClashRoomSettleInFlight.has(key)) return;
  _clanClashRoomSettleInFlight.add(key);
  try {
    const roomSnap = await db.collection('hc_rankedRooms').doc(clash.roomId).get();
    if (!roomSnap.exists) return;
    const room = roomSnap.data() || {};
    if (room.status !== 'finished') return;

    const winnerUid = String(room.winnerUid || '');
    let winnerClanId = null;
    const fromUid = String(clash.fromLeaderUid || clash.initiatorUid || '');
    const toUid = String(clash.toLeaderUid || clash.respondedByUid || '');
    if (winnerUid && winnerUid === fromUid) winnerClanId = clash.fromClanId;
    else if (winnerUid && winnerUid === toUid) winnerClanId = clash.toClanId;

    if (!winnerClanId) {
      const g = room.game || {};
      const fs = Number((g.scores||{})[fromUid] || 0);
      const ts = Number((g.scores||{})[toUid] || 0);
      if (fs > ts) winnerClanId = clash.fromClanId;
      else if (ts > fs) winnerClanId = clash.toClanId;
    }
    if (!winnerClanId) return;
    await _settleClanClash(db.collection('hc_clanClashes').doc(clash.id), clash, winnerClanId, 'room-result');
  } catch(e){
    console.error('clan clash room settlement sync error:', e);
  } finally {
    _clanClashRoomSettleInFlight.delete(key);
  }
}

const _baseSettleClanClashRoster = _settleClanClash;
_settleClanClash = async function(ref, c, winnerClanId, mode){
  await _baseSettleClanClashRoster(ref, c, winnerClanId, mode);
  try {
    if (!currentUser || !currentUser.uid) return;
    const myUid = currentUser.uid;
    const inFrom = Array.isArray(c.fromSquad) && c.fromSquad.some(x => String(x.uid||'') === myUid);
    const inTo = Array.isArray(c.toSquad) && c.toSquad.some(x => String(x.uid||'') === myUid);
    if (!inFrom && !inTo) return;

    const won = (winnerClanId === c.fromClanId && inFrom) || (winnerClanId === c.toClanId && inTo);
    const p = DataManager.getPlayerProfile();
    const deltaRp = won ? 26 : -12;
    const deltaAura = won ? 14 : -4;
    p.rankPoints = Math.max(0, Number(p.rankPoints||0) + deltaRp);
    p.aura = Math.max(0, Number(p.aura||0) + deltaAura);
    p.rankTier = (typeof DataManager._resolveRankTier==='function') ? DataManager._resolveRankTier(p.rankPoints) : p.rankTier;
    p.lastUpdated = new Date().toISOString();
    DataManager.savePlayerProfile(p);
    if (typeof updatePlayerProfileUI === 'function') updatePlayerProfileUI();
    if (firebaseInitialized && db && currentUser) {
      db.collection('handCricketProgress').doc(currentUser.uid).set({
        playerProfile: p,
        rankPoints: p.rankPoints,
        aura: p.aura,
        rankTier: p.rankTier,
        userName: (typeof getPublicUserName==='function'?getPublicUserName():(currentUser.displayName||'Player')),
        displayName: (typeof getPublicUserName==='function'?getPublicUserName():(currentUser.displayName||'Player')),
        googleEmail: (currentUser.email||'').toLowerCase(),
        lastSync: new Date().toISOString(),
        dataVersion: (typeof APP_VERSION!=='undefined'?APP_VERSION:'3.5')
      }, { merge: true }).catch(()=>{});
    }
    showToast(`Clan clash result: ${deltaRp>=0?'+':''}${deltaRp} RP, ${deltaAura>=0?'+':''}${deltaAura} Aura`, won ? '#16a34a' : '#dc2626');
  } catch(e){
    console.error('clan roster settlement profile update error:', e);
  }
};

window.toggleClanSquadMember = toggleClanSquadMember;
window.joinClanClashRoom = joinClanClashRoom;

const _baseRenderClashesRosterUi = _renderClashes;
_renderClashes = function(items){
  const activeBox = document.getElementById('clanChallenges');
  if (!activeBox) { _baseRenderClashesRosterUi(items); return; }
  const sorted = [...(items||[])].sort((a,b)=>Number(b.createdAtMs||0)-Number(a.createdAtMs||0));
  const active = sorted.filter(c => ['pending','accepted','live'].includes(c.status));
  active.filter(c => c.status==='live' && c.roomId).forEach(c => { _syncClanClashSettlementFromRoom(c); });
  if (!active.length) {
    activeBox.innerHTML = '<p style="margin:0;color:#64748b">No active clan clashes.</p>';
    return;
  }
  activeBox.innerHTML = active.map(c => {
    const status = c.status || 'pending';
    const mineAsTarget = c.toClanId === myClanId;
    const mineAsSource = c.fromClanId === myClanId;
    const modeText = `${String(c.mode || 't20i').toUpperCase()} ${Number(c.overs||0)}ov`;
    const fromXI = Array.isArray(c.fromSquad) ? c.fromSquad.map(x=>_clanEsc(x.name||'P')).join(', ') : '-';
    const toXI = Array.isArray(c.toSquad) ? c.toSquad.map(x=>_clanEsc(x.name||'P')).join(', ') : '-';
    let actions = '';
    if (status === 'pending' && mineAsTarget && _isClanAdminRole(myClanRole)) {
      actions = `<button onclick="respondClanChallenge('${_clanEsc(c.id)}','accepted')" style="width:auto;padding:5px 9px;background:#16a34a">Accept</button> <button onclick="respondClanChallenge('${_clanEsc(c.id)}','rejected')" style="width:auto;padding:5px 9px;background:#dc2626">Reject</button>`;
    } else if ((status === 'accepted' || status === 'live') && _isClanAdminRole(myClanRole) && (mineAsTarget || mineAsSource)) {
      const otherId = mineAsTarget ? c.fromClanId : c.toClanId;
      actions = `<button onclick="finishClanChallenge('${_clanEsc(c.id)}','${_clanEsc(myClanId)}')" style="width:auto;padding:5px 9px;background:#0ea5e9">Mark Win</button> <button onclick="finishClanChallenge('${_clanEsc(c.id)}','${_clanEsc(otherId)}')" style="width:auto;padding:5px 9px;background:#64748b">Mark Lose</button>`;
      if (c.roomId) actions += ` <button onclick="joinClanClashRoom('${_clanEsc(c.id)}')" style="width:auto;padding:5px 9px;background:#16a34a">Play Clash</button>`;
    }
    return `<div style="padding:8px 0;border-bottom:1px solid #e2e8f0"><div><strong>${_clanEsc(c.fromClanName||'Clan')}</strong> vs <strong>${_clanEsc(c.toClanName||'Clan')}</strong> | <strong>${_clanEsc(status)}</strong> | ${_clanEsc(modeText)}</div><div style="font-size:11px;color:#475569;margin-top:4px">${_clanEsc(c.fromClanName||'A')} XI: ${fromXI}<br>${_clanEsc(c.toClanName||'B')} XI: ${toXI}</div><div style="margin-top:6px">${actions}</div></div>`;
  }).join('');
};






