'use strict';

let friendModalOpen = false;
let friendSelectedUid = null;
let friendSelectedName = '';
let friendChatUnsub = null;
let friendReqUnsub = null;
let friendChallengeUnsub = null;

function _friendSignedIn(){
  return !!(firebaseInitialized && db && currentUser && currentUser.uid);
}

function _friendStatus(msg){
  const el = document.getElementById('friendStatus');
  if (el) el.textContent = msg;
}

function _friendChatId(uidA, uidB){
  return [String(uidA||''), String(uidB||'')].sort().join('_');
}

function _friendEsc(v){
  const s = String(v == null ? '' : v);
  if (typeof Security !== 'undefined' && Security.escapeHtml) return Security.escapeHtml(s);
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#039;');
}

function _cleanupFriendListeners(){
  if (friendChatUnsub) { friendChatUnsub(); friendChatUnsub = null; }
  if (friendReqUnsub) { friendReqUnsub(); friendReqUnsub = null; }
  if (friendChallengeUnsub) { friendChallengeUnsub(); friendChallengeUnsub = null; }
}

function _renderFriendList(items){
  const box = document.getElementById('friendList');
  if (!box) return;
  if (!items.length){
    box.innerHTML = '<p style="color:#64748b">No friends yet.</p>';
    return;
  }
  box.innerHTML = items.map(f => {
    const active = friendSelectedUid === f.uid;
    return `<button onclick="selectFriendChat('${_friendEsc(f.uid)}','${_friendEsc(f.name || 'Friend')}')" style="width:100%;text-transform:none;text-align:left;background:${active?'#dbeafe':'#ffffff'};color:#1f2937;border:1px solid #cbd5e1;padding:8px 10px;margin:4px 0">${_friendEsc(f.name || 'Friend')}<span style="float:right;color:#64748b">Aura ${Number(f.aura||0)}</span></button>`;
  }).join('');
}

function _renderFriendRequests(items){
  const box = document.getElementById('friendIncomingList');
  if (!box) return;
  if (!items.length){
    box.innerHTML = '<p style="color:#64748b">No pending requests.</p>';
    return;
  }
  box.innerHTML = items.map(r => {
    return `<div style="padding:6px 0;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;gap:6px"><span>${_friendEsc(r.fromName || 'Player')}</span><span><button onclick="respondFriendRequest('${_friendEsc(r.id)}',true)" style="width:auto;padding:4px 8px;background:#16a34a;font-size:11px">Accept</button> <button onclick="respondFriendRequest('${_friendEsc(r.id)}',false)" style="width:auto;padding:4px 8px;background:#dc2626;font-size:11px">Reject</button></span></div>`;
  }).join('');
}

function _renderDiscoverPlayers(items, myFriends){
  const box = document.getElementById('friendPlayerList');
  if (!box) return;
  if (!items.length){
    box.innerHTML = '<p style="color:#64748b">No players found.</p>';
    return;
  }
  const friendSet = new Set((myFriends||[]).map(f => f.uid));
  box.innerHTML = items.map(p => {
    if (!p.uid || p.uid === currentUser.uid) return '';
    const isFriend = friendSet.has(p.uid);
    return `<div style="padding:6px 0;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;gap:6px"><span>${_friendEsc(p.name)} <small style="color:#64748b">(${Number(p.rankPoints||0)} RP)</small></span>${isFriend ? '<span style="color:#16a34a;font-size:12px">Friend</span>' : `<button onclick="sendFriendRequest('${_friendEsc(p.uid)}','${_friendEsc(p.name)}')" style="width:auto;padding:4px 8px;background:#2563eb;font-size:11px">Add</button>`}</div>`;
  }).join('');
}

async function _getMyFriends(){
  if (!_friendSignedIn()) return [];
  const snap = await db.collection('hc_userFriends').doc(currentUser.uid).collection('list').orderBy('name').get();
  return snap.docs.map(d => ({ uid: d.id, ...(d.data()||{}) }));
}

async function refreshFriendDiscover(){
  if (!_friendSignedIn()) return;
  try {
    const [friends, players] = await Promise.all([
      _getMyFriends(),
      db.collection('handCricketProgress').orderBy('rankPoints', 'desc').limit(60).get()
    ]);
    const rows = players.docs.map(d => {
      const data = d.data() || {};
      const profile = data.playerProfile || {};
      return {
        uid: d.id,
        name: data.displayName || data.userName || 'Player',
        rankPoints: Number(data.rankPoints != null ? data.rankPoints : (profile.rankPoints || 0))
      };
    });
    _renderFriendList(friends);
    _renderDiscoverPlayers(rows, friends);
  } catch(e){
    console.error('refresh friend discover error:', e);
  }
}

async function sendFriendRequest(toUid, toName){
  if (!_friendSignedIn() || !toUid || toUid === currentUser.uid) return;
  const id = `${currentUser.uid}_${toUid}`;
  try {
    await db.collection('hc_friendRequests').doc(id).set({
      id,
      fromUid: currentUser.uid,
      fromName: currentUser.displayName || 'Player',
      toUid,
      toName: toName || 'Player',
      status: 'pending',
      createdAtMs: Date.now(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    showToast('Friend request sent.', '#2563eb');
  } catch(e){
    console.error('send friend request error:', e);
  }
}

function _listenFriendRequests(){
  if (!_friendSignedIn()) return;
  if (friendReqUnsub) friendReqUnsub();
  friendReqUnsub = db.collection('hc_friendRequests')
    .where('toUid','==',currentUser.uid)
    .where('status','==','pending')
    .onSnapshot(snap => {
      const items = snap.docs.map(d => ({ id: d.id, ...(d.data()||{}) }));
      _renderFriendRequests(items);
    }, err => console.error('friend request listener error:', err));
}

async function respondFriendRequest(requestId, accept){
  if (!_friendSignedIn() || !requestId) return;
  try {
    const ref = db.collection('hc_friendRequests').doc(requestId);
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('request-not-found');
      const r = snap.data() || {};
      if (r.toUid !== currentUser.uid || r.status !== 'pending') throw new Error('invalid-request');

      if (accept) {
        const myAura = Number((DataManager.getPlayerProfile()||{}).aura || 0);
        tx.set(db.collection('hc_userFriends').doc(currentUser.uid).collection('list').doc(r.fromUid), {
          uid: r.fromUid,
          name: r.fromName || 'Friend',
          aura: Number(r.fromAura || 0),
          sinceMs: Date.now()
        }, { merge: true });
        tx.set(db.collection('hc_userFriends').doc(r.fromUid).collection('list').doc(currentUser.uid), {
          uid: currentUser.uid,
          name: currentUser.displayName || 'Player',
          aura: myAura,
          sinceMs: Date.now()
        }, { merge: true });
      }

      tx.set(ref, {
        status: accept ? 'accepted' : 'rejected',
        resolvedAtMs: Date.now(),
        resolvedByUid: currentUser.uid
      }, { merge: true });
    });
    showToast(accept ? 'Friend added.' : 'Friend request rejected.', accept ? '#16a34a' : '#64748b');
    refreshFriendDiscover();
  } catch(e){
    console.error('respond friend request error:', e);
  }
}

function selectFriendChat(uid, name){
  if (!_friendSignedIn() || !uid) return;
  friendSelectedUid = uid;
  friendSelectedName = name || 'Friend';
  const title = document.getElementById('friendChatWith');
  if (title) title.textContent = `Friend Chat • ${friendSelectedName}`;

  refreshFriendDiscover();

  if (friendChatUnsub) friendChatUnsub();
  const chatId = _friendChatId(currentUser.uid, uid);
  friendChatUnsub = db.collection('hc_friendChats').doc(chatId).collection('messages')
    .orderBy('createdAtMs', 'asc').limit(120)
    .onSnapshot(snap => {
      const box = document.getElementById('friendChatMessages');
      if (!box) return;
      const msgs = snap.docs.map(d => d.data() || {});
      if (!msgs.length) {
        box.innerHTML = '<p style="color:#64748b">No messages yet.</p>';
        return;
      }
      box.innerHTML = msgs.map(m => {
        const mine = m.uid === currentUser.uid;
        return `<div style="margin:4px 0;display:flex;justify-content:${mine?'flex-end':'flex-start'}"><div style="max-width:78%;background:${mine?'#dbeafe':'#f1f5f9'};padding:6px 8px;border-radius:8px"><div style="font-size:11px;color:#64748b">${_friendEsc(m.name||'Player')}</div><div style="font-size:12px;color:#0f172a">${_friendEsc(m.message||'')}</div></div></div>`;
      }).join('');
      box.scrollTop = box.scrollHeight;
    }, err => console.error('friend chat listener error:', err));
}

async function sendFriendMessage(){
  if (!_friendSignedIn() || !friendSelectedUid) {
    await uiAlert('Select a friend first.', 'Friend Chat');
    return;
  }
  const input = document.getElementById('friendChatInput');
  const txt = Security.sanitizeInput((input && input.value) || '').trim();
  if (!txt) return;
  const chatId = _friendChatId(currentUser.uid, friendSelectedUid);
  try {
    await db.collection('hc_friendChats').doc(chatId).collection('messages').add({
      uid: currentUser.uid,
      name: currentUser.displayName || 'Player',
      message: txt,
      createdAtMs: Date.now(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    if (input) input.value = '';
  } catch(e){
    console.error('send friend message error:', e);
  }
}

function _friendlyDefaultsByMode(mode){
  const map = { t20i:4, odi:10, test:25, rct:15 };
  return map[mode] || 4;
}

async function sendFriendlyChallenge(){
  if (!_friendSignedIn() || !friendSelectedUid) {
    await uiAlert('Select a friend first.', 'Friendly Game');
    return;
  }
  const mode = String((document.getElementById('friendlyMode') || {}).value || 't20i');
  let overs = Number((document.getElementById('friendlyOvers') || {}).value || _friendlyDefaultsByMode(mode));
  if (!Number.isFinite(overs) || overs < 1) overs = _friendlyDefaultsByMode(mode);
  try {
    await db.collection('hc_friendChallenges').add({
      fromUid: currentUser.uid,
      fromName: currentUser.displayName || 'Player',
      toUid: friendSelectedUid,
      toName: friendSelectedName || 'Friend',
      mode,
      overs,
      status: 'pending',
      createdAtMs: Date.now(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast('Friendly challenge sent.', '#2563eb');
  } catch(e){
    console.error('send friendly challenge error:', e);
  }
}

function _listenFriendlyChallenges(){
  if (!_friendSignedIn()) return;
  if (friendChallengeUnsub) friendChallengeUnsub();
  friendChallengeUnsub = db.collection('hc_friendChallenges')
    .where('toUid','==',currentUser.uid)
    .where('status','in',['pending','accepted'])
    .onSnapshot(snap => {
      const box = document.getElementById('friendlyIncomingList');
      if (!box) return;
      const items = snap.docs.map(d => ({ id:d.id, ...(d.data()||{}) }));
      if (!items.length) {
        box.innerHTML = '<p style="color:#64748b">No friendly challenges.</p>';
        return;
      }
      box.innerHTML = items.sort((a,b)=>Number(b.createdAtMs||0)-Number(a.createdAtMs||0)).map(c => {
        if (c.status === 'pending') {
          return `<div style="padding:6px 0;border-bottom:1px solid #e2e8f0"><div><strong>${_friendEsc(c.fromName||'Friend')}</strong> • ${_friendEsc(c.mode||'custom')} • ${Number(c.overs||0)} ov</div><div style="margin-top:4px"><button onclick="respondFriendlyChallenge('${_friendEsc(c.id)}',true)" style="width:auto;padding:4px 8px;background:#16a34a;font-size:11px">Accept</button> <button onclick="respondFriendlyChallenge('${_friendEsc(c.id)}',false)" style="width:auto;padding:4px 8px;background:#dc2626;font-size:11px">Reject</button></div></div>`;
        }
        return `<div style="padding:6px 0;border-bottom:1px solid #e2e8f0"><div><strong>${_friendEsc(c.fromName||'Friend')}</strong> • ${_friendEsc(c.mode||'custom')} • ${Number(c.overs||0)} ov • <span style="color:#16a34a">Accepted</span></div><div style="margin-top:4px"><button onclick="launchFriendlyGameFromChallenge('${_friendEsc(c.id)}')" style="width:auto;padding:4px 8px;background:#2563eb;font-size:11px">Play Friendly</button></div></div>`;
      }).join('');
    }, err => console.error('friendly challenge listener error:', err));
}

async function respondFriendlyChallenge(challengeId, accept){
  if (!_friendSignedIn() || !challengeId) return;
  try {
    await db.collection('hc_friendChallenges').doc(challengeId).set({
      status: accept ? 'accepted' : 'rejected',
      respondedAtMs: Date.now(),
      respondedByUid: currentUser.uid
    }, { merge: true });
    showToast(accept ? 'Challenge accepted.' : 'Challenge rejected.', accept ? '#16a34a' : '#64748b');
  } catch(e){
    console.error('respond friendly challenge error:', e);
  }
}

async function launchFriendlyGameFromChallenge(challengeId){
  if (!_friendSignedIn() || !challengeId) return;
  try {
    const snap = await db.collection('hc_friendChallenges').doc(challengeId).get();
    if (!snap.exists) return;
    const c = snap.data() || {};
    if (c.toUid !== currentUser.uid && c.fromUid !== currentUser.uid) return;
    if (c.status !== 'accepted') {
      await uiAlert('Challenge is not accepted yet.', 'Friendly Game');
      return;
    }

    const oppName = c.fromUid === currentUser.uid ? (c.toName || 'Friend') : (c.fromName || 'Friend');
    showSection('setup');
    const modeEl = document.getElementById('matchMode');
    const oversEl = document.getElementById('overs');
    const t2El = document.getElementById('team2');
    if (modeEl) modeEl.value = c.mode || 't20i';
    if (typeof handleModeChange === 'function') handleModeChange();
    if (oversEl) {
      oversEl.disabled = false;
      oversEl.value = Number(c.overs || _friendlyDefaultsByMode(c.mode || 't20i'));
    }
    if (t2El) t2El.value = oppName + ' (Friendly)';
    closeFriendModal();
    showToast('Friendly setup loaded. Start your match.', '#2563eb');
  } catch(e){
    console.error('launch friendly game error:', e);
  }
}

async function openFriendModal(){
  const modal = document.getElementById('friendModal');
  if (!modal) return;
  modal.style.display = 'flex';
  friendModalOpen = true;

  if (!_friendSignedIn()) {
    _friendStatus('Sign in to use friends, private chat, and friendly games.');
    const ids = ['friendPlayerList','friendIncomingList','friendList','friendChatMessages','friendlyIncomingList'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<p style="color:#94a3b8">Sign in required.</p>';
    });
    return;
  }

  _friendStatus('Manage friends, private chat, and friendly custom games.');
  await refreshFriendDiscover();
  _listenFriendRequests();
  _listenFriendlyChallenges();
}

function closeFriendModal(){
  const modal = document.getElementById('friendModal');
  if (modal) modal.style.display = 'none';
  friendModalOpen = false;
  _cleanupFriendListeners();
  friendSelectedUid = null;
  friendSelectedName = '';
}

window.openFriendModal = openFriendModal;
window.closeFriendModal = closeFriendModal;
window.refreshFriendDiscover = refreshFriendDiscover;
window.sendFriendRequest = sendFriendRequest;
window.respondFriendRequest = respondFriendRequest;
window.selectFriendChat = selectFriendChat;
window.sendFriendMessage = sendFriendMessage;
window.sendFriendlyChallenge = sendFriendlyChallenge;
window.respondFriendlyChallenge = respondFriendlyChallenge;
window.launchFriendlyGameFromChallenge = launchFriendlyGameFromChallenge;

window.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('friendModal');
  if (modal) {
    modal.addEventListener('click', function(e){
      if (e.target === this) closeFriendModal();
    });
  }

  const modeSel = document.getElementById('friendlyMode');
  const oversEl = document.getElementById('friendlyOvers');
  if (modeSel && oversEl) {
    modeSel.addEventListener('change', () => {
      const mode = modeSel.value;
      if (mode === 'custom') {
        oversEl.disabled = false;
      } else {
        oversEl.disabled = true;
        oversEl.value = _friendlyDefaultsByMode(mode);
      }
    });
    modeSel.dispatchEvent(new Event('change'));
  }
});
