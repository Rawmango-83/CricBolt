const admin = require('firebase-admin');
const functions = require('firebase-functions');

admin.initializeApp();
const db = admin.firestore();

const RANKED_MAX_BALLS = 24;
const ALLOWED_ROOM_TYPES = new Set(["ranked","friendly","clan_clash"]);
const RANKED_TURN_TIMEOUT_MS = 90000;

function getPlayers(room) {
  const p1 = (room.players && room.players[0]) || {};
  const p2 = (room.players && room.players[1]) || {};
  return [p1, p2];
}

function ensureMember(uid, room) {
  const [p1, p2] = getPlayers(room);
  return p1.uid === uid || p2.uid === uid;
}

function initialGame(room, battingUidOverride, bowlingUidOverride) {
  const [p1, p2] = getPlayers(room);
  const overs = Math.max(2, Math.min(25, Number(room.overs || 4)));
  const battingUid = battingUidOverride || p1.uid;
  const bowlingUid = battingUid === p1.uid ? p2.uid : p1.uid;
  const teamLineups = room.teamLineups || {};
  const bLine = Array.isArray(teamLineups[battingUid]) ? teamLineups[battingUid] : [];
  const oLine = Array.isArray(teamLineups[bowlingUid]) ? teamLineups[bowlingUid] : [];
  const makeIdx = (line) => ({ striker: 0, nonStriker: line.length > 1 ? 1 : 0, maxWkts: Math.max(1, line.length ? line.length - 1 : 10) });
  return {
    innings: 1,
    maxBalls: overs * 6,
    balls: 0,
    scores: { [battingUid]: 0, [bowlingUid]: 0 },
    wickets: { [battingUid]: 0, [bowlingUid]: 0 },
    target: null,
    battingUid,
    bowlingUid,
    teamLineups,
    batterIndexMap: {
      [battingUid]: makeIdx(bLine),
      [bowlingUid]: makeIdx(oLine)
    },
    submissions: {},
    turn: 1,
    turnStartedAtMs: Date.now(),
    lastEvent: 'Match started (' + overs + ' overs)'
  };
}
function resolveTurn(game, room) {
  const g = JSON.parse(JSON.stringify(game));
  const [p1, p2] = getPlayers(room);
  const batUid = g.battingUid;
  const bowlUid = g.bowlingUid;
  const batNum = Number(g.submissions?.[batUid]);
  const bowlNum = Number(g.submissions?.[bowlUid]);

  g.scores = g.scores || {};
  g.wickets = g.wickets || {};
  g.scores[batUid] = g.scores[batUid] || 0;
  g.wickets[batUid] = g.wickets[batUid] || 0;
  g.scores[bowlUid] = g.scores[bowlUid] || 0;
  g.wickets[bowlUid] = g.wickets[bowlUid] || 0;
  g.teamLineups = g.teamLineups || room.teamLineups || {};
  g.batterIndexMap = g.batterIndexMap || {};

  const lineup = Array.isArray(g.teamLineups[batUid]) ? g.teamLineups[batUid] : [];
  if (!g.batterIndexMap[batUid]) {
    g.batterIndexMap[batUid] = { striker: 0, nonStriker: lineup.length > 1 ? 1 : 0, maxWkts: Math.max(1, lineup.length ? lineup.length - 1 : 10) };
  }
  const idx = g.batterIndexMap[batUid];
  const strikerName = lineup[idx.striker] || (batUid === p1.uid ? (p1.name || 'P1') : (p2.name || 'P2'));

  if (batNum === bowlNum) {
    g.wickets[batUid] += 1;
    g.lastEvent = `Wicket! ${strikerName} is out on ${batNum}.`;
    if (g.wickets[batUid] <= idx.maxWkts) {
      const nextIn = Math.min(idx.maxWkts, Math.max(idx.striker, idx.nonStriker) + 1);
      idx.striker = nextIn;
      if (idx.nonStriker === idx.striker) idx.nonStriker = Math.max(0, idx.striker - 1);
    }
  } else {
    g.scores[batUid] += batNum;
    g.lastEvent = `${strikerName} scores ${batNum}.`;
    if ((batNum % 2) === 1) {
      const t = idx.striker; idx.striker = idx.nonStriker; idx.nonStriker = t;
    }
  }
  g.balls = (g.balls || 0) + 1;
  g.turn = (g.turn || 1) + 1;

  const inningsOver = g.wickets[batUid] >= idx.maxWkts || g.balls >= (g.maxBalls || RANKED_MAX_BALLS);
  if (g.innings === 1 && inningsOver) {
    g.target = g.scores[batUid] + 1;
    g.innings = 2;
    g.balls = 0;
    g.battingUid = bowlUid;
    g.bowlingUid = batUid;
    const lineup2 = Array.isArray(g.teamLineups[g.battingUid]) ? g.teamLineups[g.battingUid] : [];
    g.batterIndexMap[g.battingUid] = { striker: 0, nonStriker: lineup2.length > 1 ? 1 : 0, maxWkts: Math.max(1, lineup2.length ? lineup2.length - 1 : 10) };
    g.submissions = {};
    g.turnStartedAtMs = Date.now();
    g.lastEvent = `Innings break. Target is ${g.target}.`;
    return { game: g, status: 'live', winnerUid: null, finishReason: '' };
  }

  if (g.innings === 2) {
    if ((g.scores[g.battingUid] || 0) >= g.target) {
      return { game: g, status: 'finished', winnerUid: g.battingUid, finishReason: 'Target chased' };
    }
    const idx2 = g.batterIndexMap[g.battingUid] || { maxWkts: 10 };
    const secondOver = g.wickets[g.battingUid] >= idx2.maxWkts || g.balls >= (g.maxBalls || RANKED_MAX_BALLS);
    if (secondOver) {
      const chase = g.scores[g.battingUid] || 0;
      const defend = g.scores[g.bowlingUid] || 0;
      if (chase > defend) return { game: g, status: 'finished', winnerUid: g.battingUid, finishReason: 'Higher score' };
      if (chase < defend) return { game: g, status: 'finished', winnerUid: g.bowlingUid, finishReason: 'Defended target' };
      return { game: g, status: 'finished', winnerUid: null, finishReason: 'Match tied' };
    }
  }

  g.submissions = {};
  g.turnStartedAtMs = Date.now();
  return { game: g, status: 'live', winnerUid: null, finishReason: '' };
}
exports.rankedMarkReady = functions.https.onCall(async (data, context) => {
  const uid = context.auth && context.auth.uid;
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Sign in required');
  const roomId = data && data.roomId;
  if (!roomId) throw new functions.https.HttpsError('invalid-argument', 'roomId required');

  const ref = db.collection('hc_rankedRooms').doc(roomId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new functions.https.HttpsError('not-found', 'Room not found');
    const room = snap.data() || {};
    if (!ALLOWED_ROOM_TYPES.has(String(room.type || 'ranked'))) throw new functions.https.HttpsError('failed-precondition', 'Unsupported room type');
    if (!ensureMember(uid, room)) throw new functions.https.HttpsError('permission-denied', 'Not in room');
    if (room.status !== 'waiting_start') return;

    const readyMap = { ...(room.readyMap || {}) };
    readyMap[uid] = true;
    const [p1, p2] = getPlayers(room);
    const bothReady = !!readyMap[p1.uid] && !!readyMap[p2.uid];
    const payload = { readyMap };
    if (bothReady) {
      const tossWinnerUid = Math.random() < 0.5 ? p1.uid : p2.uid;
      const tossChoice = Math.random() < 0.5 ? 'bat' : 'bowl';
      const otherUid = tossWinnerUid === p1.uid ? p2.uid : p1.uid;
      const battingUid = tossChoice === 'bat' ? tossWinnerUid : otherUid;
      const bowlingUid = battingUid === p1.uid ? p2.uid : p1.uid;
      payload.status = 'live';
      payload.startedAt = admin.firestore.FieldValue.serverTimestamp();
      payload.tossWinnerUid = tossWinnerUid;
      payload.tossChoice = tossChoice;
      payload.game = room.game || initialGame(room, battingUid, bowlingUid);
    }
    tx.update(ref, payload);
  });

  return { ok: true };
});

exports.rankedSubmitMove = functions.https.onCall(async (data, context) => {
  const uid = context.auth && context.auth.uid;
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Sign in required');
  const roomId = data && data.roomId;
  const move = Number(data && data.move);
  if (!roomId) throw new functions.https.HttpsError('invalid-argument', 'roomId required');
  if (!Number.isInteger(move) || move < 0 || move > 6) {
    throw new functions.https.HttpsError('invalid-argument', 'move must be 0..6');
  }

  const ref = db.collection('hc_rankedRooms').doc(roomId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new functions.https.HttpsError('not-found', 'Room not found');
    const room = snap.data() || {};
    if (!ALLOWED_ROOM_TYPES.has(String(room.type || 'ranked'))) throw new functions.https.HttpsError('failed-precondition', 'Unsupported room type');
    if (!ensureMember(uid, room)) throw new functions.https.HttpsError('permission-denied', 'Not in room');
    if (room.status !== 'live' && room.status !== 'waiting_start') return;

    const game = room.game || {};
    if (!game.battingUid || !game.bowlingUid) return;
    if (uid !== game.battingUid && uid !== game.bowlingUid) return;

    const submissions = { ...(game.submissions || {}) };
    if (submissions[uid] !== undefined) return;
    submissions[uid] = move;
    game.submissions = submissions;

    const haveBat = submissions[game.battingUid] !== undefined;
    const haveBowl = submissions[game.bowlingUid] !== undefined;
    if (!haveBat || !haveBowl) {
      tx.update(ref, { game });
      return;
    }

    const resolved = resolveTurn(game, room);
    const payload = { game: resolved.game, status: resolved.status };
    if (resolved.status === 'finished') {
      payload.winnerUid = resolved.winnerUid || null;
      payload.finishReason = resolved.finishReason || 'Finished';
      payload.finishedAt = admin.firestore.FieldValue.serverTimestamp();
    }
    tx.update(ref, payload);
  });

  return { ok: true };
});

exports.rankedForfeit = functions.https.onCall(async (data, context) => {
  const uid = context.auth && context.auth.uid;
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Sign in required');
  const roomId = data && data.roomId;
  if (!roomId) throw new functions.https.HttpsError('invalid-argument', 'roomId required');

  const ref = db.collection('hc_rankedRooms').doc(roomId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const room = snap.data() || {};
    if (!ALLOWED_ROOM_TYPES.has(String(room.type || 'ranked'))) throw new functions.https.HttpsError('failed-precondition', 'Unsupported room type');
    if (!ensureMember(uid, room)) throw new functions.https.HttpsError('permission-denied', 'Not in room');
    if (room.status !== 'live' && room.status !== 'waiting_start') return;

    const [p1, p2] = getPlayers(room);
    const oppUid = uid === p1.uid ? p2.uid : p1.uid;
    tx.update(ref, {
      status: 'finished',
      winnerUid: oppUid || null,
      finishReason: 'Opponent forfeited',
      finishedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  return { ok: true };
});

exports.rankedEnforceTimeout = functions.https.onCall(async (data, context) => {
  const uid = context.auth && context.auth.uid;
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'Sign in required');
  const roomId = data && data.roomId;
  if (!roomId) throw new functions.https.HttpsError('invalid-argument', 'roomId required');

  const ref = db.collection('hc_rankedRooms').doc(roomId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const room = snap.data() || {};
    if (!ALLOWED_ROOM_TYPES.has(String(room.type || 'ranked'))) throw new functions.https.HttpsError('failed-precondition', 'Unsupported room type');
    if (!ensureMember(uid, room)) throw new functions.https.HttpsError('permission-denied', 'Not in room');
    if (room.status !== 'live' && room.status !== 'waiting_start') return;

    const g = room.game || {};
    const turnStart = Number(g.turnStartedAtMs || 0);
    if (!turnStart) {
      tx.update(ref, { game: { ...g, turnStartedAtMs: Date.now() } });
      return;
    }
    if (Date.now() - turnStart < RANKED_TURN_TIMEOUT_MS) return;

    const subs = g.submissions || {};
    const batDone = subs[g.battingUid] !== undefined;
    const bowlDone = subs[g.bowlingUid] !== undefined;
    let winnerUid = null;
    let finishReason = 'Turn timeout';
    if (batDone && !bowlDone) {
      winnerUid = g.battingUid;
      finishReason = 'Bowling player timed out';
    } else if (!batDone && bowlDone) {
      winnerUid = g.bowlingUid;
      finishReason = 'Batting player timed out';
    } else if (!batDone && !bowlDone) {
      winnerUid = null;
      finishReason = 'Both players timed out';
    } else {
      return;
    }

    tx.update(ref, {
      status: 'finished',
      winnerUid: winnerUid || null,
      finishReason,
      finishedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  return { ok: true };
});






