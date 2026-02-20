// Hand Cricket - JavaScript Part 3: UI, Tournament Logic & Event Handlers
// Version 3.4.0 - Fixed Edition

'use strict';

let rankedQueueTimer = null;
let rankedQueueUnsub = null;
let rankedQueueDocId = null;
let rankedRoomId = null;
let rankedRoomUnsub = null;
const RANKED_MAX_BALLS = 24;
let rankedQueueExpiryTimer = null;
const RANKED_QUEUE_WAIT_MS = 45000;
const RANKED_STALE_QUEUE_MS = 120000;
const RANKED_MAX_RP_GAP = 450;
const RANKED_SETTLEMENT_KEY = 'hc_ranked_settled_rooms';
const RANKED_TURN_TIMEOUT_MS = 90000;
let rankedTurnTimeoutTimer = null;
let rankedTossShownForRoom = null;
let rankedCallableDisabled = false;
let rankedCallableDisableReason = '';

// ============================================================================
// TOURNAMENT FUNCTIONS
// ============================================================================
const Tournament = {
  initialize(){
    TournamentState.reset();
    const all=Object.keys(CRICKET_TEAMS);
    const shuffled=all.filter(t=>t!==TournamentState.userTeam).sort(()=>Math.random()-0.5);
    TournamentState.challengeLeague.groupA=[TournamentState.userTeam,...shuffled.slice(0,3)];
    TournamentState.challengeLeague.groupB=shuffled.slice(3,7);
    this.initStandings(TournamentState.challengeLeague.groupA,TournamentState.challengeLeague.standingsA);
    this.initStandings(TournamentState.challengeLeague.groupB,TournamentState.challengeLeague.standingsB);
    TournamentState.challengeLeague.matchesA=this.roundRobin(TournamentState.challengeLeague.groupA);
    TournamentState.challengeLeague.matchesB=this.roundRobin(TournamentState.challengeLeague.groupB);
    TournamentState.remainingTeamsForQualifier=shuffled.slice(7,15);
  },
  
  initStandings(teams,obj){
    teams.forEach(t=>{
      obj[t]={played:0,won:0,lost:0,tied:0,points:0,nrr:0,for:0,against:0};
    });
  },
  
  roundRobin(teams){
    const m=[];
    for(let i=0;i<teams.length;i++){
      for(let j=i+1;j<teams.length;j++){
        m.push({team1:teams[i],team2:teams[j],completed:false,result:null});
      }
    }
    return m;
  },
  
  updateStandings(st,t1,t2,r){
    st[t1].played++;
    st[t2].played++;
    st[t1].for+=r.team1Score;
    st[t1].against+=r.team2Score;
    st[t2].for+=r.team2Score;
    st[t2].against+=r.team1Score;
    
    if(r.winner===t1){
      st[t1].won++;
      st[t1].points+=2;
      st[t2].lost++;
    } else if(r.winner===t2){
      st[t2].won++;
      st[t2].points+=2;
      st[t1].lost++;
    } else {
      st[t1].tied++;
      st[t2].tied++;
      st[t1].points++;
      st[t2].points++;
    }
    
    const nrr=(s)=>s.played?((s.for/s.played)-(s.against/s.played))/100:0;
    st[t1].nrr=nrr(st[t1]);
    st[t2].nrr=nrr(st[t2]);
  },
  
  topTeams(st,n){
    return Object.keys(st).sort((a,b)=>
      st[b].points!==st[a].points ? st[b].points-st[a].points : st[b].nrr-st[a].nrr
    ).slice(0,n);
  },
  
  advanceToSuper6(){
    const t=[
      ...this.topTeams(TournamentState.challengeLeague.standingsA,3),
      ...this.topTeams(TournamentState.challengeLeague.standingsB,3)
    ];
    TournamentState.super6.teams=t;
    this.initStandings(t,TournamentState.super6.standings);
    TournamentState.super6.matches=this.roundRobin(t);
    TournamentState.currentStage='super6';
    TournamentState.currentPhase='main';
  },
  
  advanceToQualifier(){
    const top4=this.topTeams(TournamentState.super6.standings,4);
    const newT=TournamentState.remainingTeamsForQualifier.slice(0,6);
    const all=[...top4,...newT].sort(()=>Math.random()-0.5);
    const ui=all.indexOf(TournamentState.userTeam);
    if(ui>=5) [all[0],all[ui]]=[all[ui],all[0]];
    
    TournamentState.qualifier.groupA=all.slice(0,5);
    TournamentState.qualifier.groupB=all.slice(5,10);
    this.initStandings(TournamentState.qualifier.groupA,TournamentState.qualifier.standingsA);
    this.initStandings(TournamentState.qualifier.groupB,TournamentState.qualifier.standingsB);
    TournamentState.qualifier.matchesA=this.roundRobin(TournamentState.qualifier.groupA);
    TournamentState.qualifier.matchesB=this.roundRobin(TournamentState.qualifier.groupB);
    TournamentState.currentStage='qualifier';
    TournamentState.currentPhase='groupA';
  },
  
  advanceToWorldCup(){
    const t=[
      ...this.topTeams(TournamentState.qualifier.standingsA,3),
      ...this.topTeams(TournamentState.qualifier.standingsB,3)
    ];
    TournamentState.worldCup.teams=t;
    this.initStandings(t,TournamentState.worldCup.standings);
    TournamentState.worldCup.matches=this.roundRobin(t);
    TournamentState.currentStage='worldCup';
  },
  
  generateSemiFinals(){
    const t=this.topTeams(TournamentState.worldCup.standings,4);
    TournamentState.worldCup.semiFinals=[
      {team1:t[0],team2:t[3],completed:false,result:null},
      {team1:t[1],team2:t[2],completed:false,result:null}
    ];
  },
  
  generateFinal(){
    TournamentState.worldCup.final={
      team1:TournamentState.worldCup.semiFinals[0].result.winner,
      team2:TournamentState.worldCup.semiFinals[1].result.winner,
      completed:false,
      result:null
    };
  },
  
  async playMatch(match){
    if(match.team1===TournamentState.userTeam || match.team2===TournamentState.userTeam){
      GameState.isTournament=true;
      GameState.currentMatch=match;
      GameState.matchMode='custom';
      const u=match.team1===TournamentState.userTeam?match.team1:match.team2;
      const o=match.team1===TournamentState.userTeam?match.team2:match.team1;
      GameState.teamNames[0]=CRICKET_TEAMS[u].name;
      GameState.teamNames[1]=CRICKET_TEAMS[o].name;
      GameState.teamPlayers[0]=CRICKET_TEAMS[u].players;
      GameState.teamPlayers[1]=CRICKET_TEAMS[o].players;
      GameState.overs=TournamentState.matchOvers;
      GameState.totalBallsPerInnings=TournamentState.matchOvers*6;
      showSection('game');
      GameState.reset();
      initializeStats();
      const fmt=TournamentState.format==='t20WorldCup'?'T20 World Cup':'ODI World Cup';
      await TossAnim.show('ðŸ†',fmt+' Match!',
        CRICKET_TEAMS[u].name+' vs '+CRICKET_TEAMS[o].name,
        TournamentState.matchOvers+' overs per side'
      );
      await performToss();
      Utils.log(GameState.teamNames[Utils.getBattingTeamIndex(0)]+' batting first!');
      updateBowlerOptions();
      updateUI();
      Utils.getElement('pauseMatchBtn').style.display='block';
    } else {
      const r=Utils.simulateMatch(match.team1,match.team2,TournamentState.matchOvers);
      match.completed=true;
      match.result=r;
      
      if(TournamentState.currentStage==='challengeLeague'){
        const st=TournamentState.currentPhase==='groupA'?
          TournamentState.challengeLeague.standingsA:
          TournamentState.challengeLeague.standingsB;
        this.updateStandings(st,match.team1,match.team2,r);
      } else if(TournamentState.currentStage==='super6'){
        this.updateStandings(TournamentState.super6.standings,match.team1,match.team2,r);
      } else if(TournamentState.currentStage==='qualifier'){
        const st=TournamentState.currentPhase==='groupA'?
          TournamentState.qualifier.standingsA:
          TournamentState.qualifier.standingsB;
        this.updateStandings(st,match.team1,match.team2,r);
      } else if(TournamentState.currentStage==='worldCup'){
        this.updateStandings(TournamentState.worldCup.standings,match.team1,match.team2,r);
      }
      
      showMatchAnimation(CRICKET_TEAMS[match.team1].name,CRICKET_TEAMS[match.team2].name,r);
    }
  }
};

function showMatchAnimation(t1n,t2n,r){
  const ov=Utils.getElement('celebrationOverlay');
  const tx=Utils.getElement('celebrationText');
  const w=r.winner==='tie'?'MATCH TIED!':
    Security.escapeHtml(CRICKET_TEAMS[r.winner]?.name||r.winner)+' WINS!';
  tx.textContent=`${t1n} ${r.team1Score}/${r.team1Wickets} vs ${t2n} ${r.team2Score}/${r.team2Wickets}\n\n${w}`;
  ov.style.display='flex';
  setTimeout(()=>{
    ov.style.display='none';
    if(TournamentState.currentStage==='wtc') showWTCStage();
    else if(TournamentState.currentStage==='ipl') showIPLStage();
    else showTournamentStage(TournamentState.currentStage);
  },3000);
}

// ============================================================================
// UPDATE USER TOURNAMENT STATS - FIXED FOR ALL INNINGS
// ============================================================================
function updateUserStats(){
  if(!GameState.isTournament) return;
  
  const uti=GameState.userTeamIndex;
  const mn=GameState.teamNames[0]+' vs '+GameState.teamNames[1];
  
  if(!TournamentState.userStats.playerInnings) TournamentState.userStats.playerInnings={};
  if(!TournamentState.userStats.players) TournamentState.userStats.players={};
  
  // Process ALL innings (0-3) for both batting and bowling
  for(let inn=0;inn<4;inn++){
    // Skip empty innings
    if(inn>=2 && GameState.scores[inn]===0 && GameState.wickets[inn]===0 && GameState.ballsBowled[inn]===0) continue;
    
    const bti2=Utils.getBattingTeamIndex(inn);
    const bwi2=1-bti2;
    
    // Track batting stats when user team is batting
    if(bti2===uti){
      const bsArr=GameState.batsmenStats[inn];
      if(!bsArr||!bsArr.length) continue;
      
      bsArr.forEach((bat,idx)=>{
        if(!bat||bat.balls===0) return;
        const pn=GameState.teamPlayers[uti][idx];
        if(!pn) return;
        
        if(!TournamentState.userStats.players[pn]){
          TournamentState.userStats.players[pn]={
            runs:0,balls:0,wickets:0,runsConceded:0,matches:0
          };
        }
        
        const ik=mn+'_Inn'+(inn+1)+'_Bat_'+pn;
        if(TournamentState.userStats.playerInnings[ik]) return;
        
        TournamentState.userStats.playerInnings[ik]={runs:bat.runs,balls:bat.balls};
        const p=TournamentState.userStats.players[pn];
        p.runs+=bat.runs;
        p.balls+=bat.balls;
        p.matches++;
        
        if(bat.runs>TournamentState.userStats.highestScore.runs){
          TournamentState.userStats.highestScore={runs:bat.runs,player:pn,match:mn};
        }
      });
    }
    
    // Track bowling stats when user team is bowling
    if(bwi2===uti){
      const bwArr=GameState.bowlerStats[uti];
      if(!bwArr||!bwArr.length) continue;
      
      bwArr.forEach(bow=>{
        if(!bow||!bow.name||bow.balls===0) return;
        
        if(!TournamentState.userStats.players[bow.name]){
          TournamentState.userStats.players[bow.name]={
            runs:0,balls:0,wickets:0,runsConceded:0,matches:0
          };
        }
        
        const ik=mn+'_Inn'+(inn+1)+'_Bowl_'+bow.name;
        if(TournamentState.userStats.playerInnings[ik]) return;
        
        TournamentState.userStats.playerInnings[ik]={
          wickets:bow.wickets,
          runs:bow.runs,
          balls:bow.balls
        };
        
        const p=TournamentState.userStats.players[bow.name];
        p.wickets+=(bow.wickets||0);
        p.runsConceded+=(bow.runs||0);
        
        const best=TournamentState.userStats.bestBowling;
        if(bow.wickets>best.wickets || (bow.wickets===best.wickets && bow.runs<best.runs)){
          TournamentState.userStats.bestBowling={
            wickets:bow.wickets,
            runs:bow.runs,
            player:bow.name,
            match:mn
          };
        }
      });
    }
  }
}

// ============================================================================
// END INNINGS & MATCH COMPLETION
// ============================================================================
function endInnings(){
  const bti=Utils.getBattingTeamIndex();
  Utils.log(GameState.teamNames[bti]+' innings over: '+
    GameState.scores[GameState.currentInnings]+'/'+
    GameState.wickets[GameState.currentInnings]);
  
  if(GameState.matchMode==='test') handleTestEnd(bti);
  else handleLimitedEnd(bti);
}

function handleLimitedEnd(bti){
  if(GameState.currentInnings===0){
    GameState.targets[1]=GameState.scores[0]+1;
    GameState.currentInnings=1;
    GameState.striker=0;
    GameState.nonStriker=1;
    Utils.log(GameState.teamNames[Utils.getBattingTeamIndex(1)]+' need '+GameState.targets[1]+' to win.');
    updateBowlerOptions();
    updateUI();
  } else {
    const s0=GameState.scores[0];
    const s1=GameState.scores[1];
    
    if(s1===s0){
      finishMatch('Match TIED ðŸ¤','tie');
      return;
    }
    
    let winner,res;
    if(s1<s0){
      winner=Utils.getBattingTeamIndex(0);
      res=GameState.teamNames[winner]+' WIN by '+(s0-s1)+' runs';
    } else {
      winner=Utils.getBattingTeamIndex(1);
      res=GameState.teamNames[winner]+' WIN by '+(10-GameState.wickets[1])+' wickets';
    }
    
    if(GameState.isTournament&&GameState.currentMatch){
      const match=GameState.currentMatch;
      const u=TournamentState.userTeam;
      const uIs1=match.team1===u;
      let ts1,ts2,tw1,tw2;
      
      if(uIs1){
        ts1=GameState.userBattingFirst?s0:s1;
        tw1=GameState.userBattingFirst?GameState.wickets[0]:GameState.wickets[1];
        ts2=GameState.userBattingFirst?s1:s0;
        tw2=GameState.userBattingFirst?GameState.wickets[1]:GameState.wickets[0];
      } else {
        ts2=GameState.userBattingFirst?s0:s1;
        tw2=GameState.userBattingFirst?GameState.wickets[0]:GameState.wickets[1];
        ts1=GameState.userBattingFirst?s1:s0;
        tw1=GameState.userBattingFirst?GameState.wickets[1]:GameState.wickets[0];
      }
      
      const mWinner=ts1>ts2?match.team1:ts2>ts1?match.team2:'tie';
      const result={team1Score:ts1,team1Wickets:tw1,team2Score:ts2,team2Wickets:tw2,winner:mWinner};
      match.completed=true;
      match.result=result;
      match.pausedState=null;
      
      Utils.getElement('pauseMatchBtn').style.display='none';
      
      const stg=TournamentState.currentStage;
      const ph=TournamentState.currentPhase;
      
      if(stg==='challengeLeague'){
        const st=ph==='groupA'?TournamentState.challengeLeague.standingsA:TournamentState.challengeLeague.standingsB;
        Tournament.updateStandings(st,match.team1,match.team2,result);
      } else if(stg==='super6'){
        Tournament.updateStandings(TournamentState.super6.standings,match.team1,match.team2,result);
      } else if(stg==='qualifier'){
        const st=ph==='groupA'?TournamentState.qualifier.standingsA:TournamentState.qualifier.standingsB;
        Tournament.updateStandings(st,match.team1,match.team2,result);
      } else if(stg==='worldCup'&&ph==='main'){
        Tournament.updateStandings(TournamentState.worldCup.standings,match.team1,match.team2,result);
      }
      
      const isFinal=(stg==='worldCup'&&ph==='final');
      if(isFinal&&mWinner===u){
        finishMatch(res,'win');
        const tn=CRICKET_TEAMS[u].name;
        DataManager.addWin(TournamentState.format,u,tn);
        saveTournamentNow();
        DataManager.deleteTournamentSlot(TournamentState._slotId);
        const title=TournamentState.format==='t20WorldCup'?
          'T20 WORLD CUP CHAMPIONS!':'ODI WORLD CUP CHAMPIONS!';
        setTimeout(()=>showGrandTrophy(tn,title),2000);
        return;
      }
    }
    
    finishMatch(res,'win');
  }
}

function handleTestEnd(bti){
  // Test match logic remains the same as original
  if(GameState.currentInnings<3){
    GameState.currentInnings++;
    GameState.striker=0;
    GameState.nonStriker=1;
    updateBowlerOptions();
    updateUI();
  } else {
    const t1=GameState.scores[0]+GameState.scores[2];
    const t2=GameState.scores[1]+GameState.scores[3];
    let res;
    if(t2===t1) res='Match TIED ðŸ¤';
    else if(t2>t1) res=GameState.teamNames[GameState.compTeamIndex]+' WIN by '+(t2-t1)+' runs';
    else res=GameState.teamNames[GameState.userTeamIndex]+' WIN by '+(t1-t2)+' runs';
    handleMatchComplete(res,t1,t2);
  }
}

function handleMatchComplete(resultText,t1Score,t2Score){
  if(GameState.isTournament&&GameState.currentMatch){
    const match=GameState.currentMatch;
    const u=TournamentState.userTeam;
    const uIs1=match.team1===u;
    let s1,s2;
    
    if(uIs1){
      s1=GameState.userBattingFirst?t1Score:t2Score;
      s2=GameState.userBattingFirst?t2Score:t1Score;
    } else {
      s2=GameState.userBattingFirst?t1Score:t2Score;
      s1=GameState.userBattingFirst?t2Score:t1Score;
    }
    
    const winner=s1>s2?match.team1:s2>s1?match.team2:'tie';
    const result={
      team1Score:s1,
      team1Wickets:GameState.wickets[0]+GameState.wickets[2],
      team2Score:s2,
      team2Wickets:GameState.wickets[1]+GameState.wickets[3],
      winner
    };
    
    match.completed=true;
    match.result=result;
    match.pausedState=null;
    
    if(TournamentState.currentStage==='wtc'&&TournamentState.currentPhase==='final'&&result.winner===u){
      finishMatch(resultText,'win');
      DataManager.addWin(TournamentState.format,u,CRICKET_TEAMS[u].name);
      saveTournamentNow();
      DataManager.deleteTournamentSlot(TournamentState._slotId);
      setTimeout(()=>showGrandTrophy(CRICKET_TEAMS[u].name,'WTC CHAMPIONS!'),2000);
      return;
    }
  }
  
  finishMatch(resultText,'win');
}

function finishMatch(resultText,resultType){
  Utils.log('ðŸ† '+resultText);
  showScorecard();
  
  if(GameState.isTournament){
    updateUserStats();
    saveTournamentNow();
  }
  
  let result='draw';
  if(resultType==='win'){
    result=resultText.includes(GameState.teamNames[GameState.userTeamIndex])?'won':'lost';
  } else if(resultType==='tie'){
    result='draw';
  }
  
  const _ubi=GameState.userBattingFirst;
  let userWkTaken=0;
  
  if(GameState.matchMode==='test'){
    for(let inn=0;inn<4;inn++){
      const bti=Utils.getBattingTeamIndex(inn);
      if(bti!==GameState.userTeamIndex) userWkTaken+=GameState.wickets[inn];
    }
  } else {
    userWkTaken=_ubi?GameState.wickets[1]:GameState.wickets[0];
  }
  
  DataManager.saveMatch({
    teamNames:[...GameState.teamNames],
    result,
    userRuns:GameState.scores[_ubi?0:1],
    userWickets:GameState.wickets[_ubi?0:1],
    userWkTaken,
    oppRuns:GameState.scores[_ubi?1:0],
    oppWickets:GameState.wickets[_ubi?1:0],
    format:GameState.matchMode,
    tournament:GameState.isTournament?TournamentState.format:null,
    overs:GameState.overs,
    hattricksInMatch:GameState._matchHattricks,
    centuriesInMatch:GameState._matchCenturies,
    fiftiesInMatch:GameState._matchFifties,
    threeWicketsInMatch:GameState._matchThreeWickets,
    fiveWicketsInMatch:GameState._matchFiveWickets,
    tenWicketsInMatch:GameState._matchTenWickets
  });
  
  Utils.toggleButtons('.number-buttons button',false);
  Utils.getElement('bowlerSelect').disabled=true;
  
  const rb=Utils.getElement('resultBox');
  if(rb){
    rb.className=resultType;
    rb.innerHTML='';
    const bd=document.createElement('div');
    const pb=document.createElement('button');
    pb.textContent='ðŸ“„ Download Scorecard (PDF)';
    pb.onclick=downloadPDF;
    pb.style.cssText='margin:5px;width:auto';
    bd.appendChild(pb);
    
    if(GameState.isTournament){
      const bb=document.createElement('button');
      bb.textContent='â† Back to Tournament';
      bb.style.cssText='margin:5px;width:auto';
      bb.onclick=()=>{
        showSection('tournament');
        if(TournamentState.currentStage==='wtc') showWTCStage();
        else if(TournamentState.currentStage==='ipl') showIPLStage();
        else showTournamentStage(TournamentState.currentStage);
      };
      bd.appendChild(bb);
    }
    
    rb.appendChild(bd);
    rb.style.display='block';
  }
}

function showScorecard(){
  const el=Utils.getElement('log');
  if(!el) return;
  let h='<hr><h3>ðŸ“Š Scorecard</h3>';
  
  for(let i=0;i<4;i++){
    const ti=Utils.getBattingTeamIndex(i);
    if(GameState.scores[i]===0&&GameState.wickets[i]===0&&GameState.ballsBowled[i]===0) continue;
    
    const wkts=GameState.wickets[i];
    h+=`<h4>${Security.escapeHtml(GameState.teamNames[ti])} - Inn ${(i%2)+1}: ${GameState.scores[i]}/${wkts}</h4><strong>Batsmen:</strong><br>`;
    
    for(let p=0;p<GameState.teamPlayers[ti].length;p++){
      const s=GameState.batsmenStats[i][p];
      if(!s||s.balls===0) continue;
      const pName=Security.escapeHtml(GameState.teamPlayers[ti][p]||('Batsman '+(p+1)));
      const isOut = p < wkts;
      if(isOut) h+=`${pName}: ${s.runs}(${s.balls})<br>`;
      else h+=`<strong>${pName}*: ${s.runs}(${s.balls}) not out</strong><br>`;
    }
    
    h+='<br><strong>Bowlers:</strong><br>';
    GameState.bowlerStats[1-ti].forEach(b=>{
      if(b.balls>0) h+=`${Security.escapeHtml(b.name)}: ${Math.floor(b.balls/6)}.${b.balls%6} ov, ${b.runs}r, ${b.wickets}w<br>`;
    });
  }
  
  el.innerHTML+=h;
}

function showGrandTrophy(teamName,title){
  const t=Utils.getElement('trophyAnimation');
  Utils.setText('trophyText',`ðŸ† ${title} ðŸ†\n${teamName}`);
  t.classList.add('active');
  
  for(let i=0;i<80;i++){
    const cc=document.createElement('div');
    cc.className='confetti';
    cc.style.left=Math.random()*100+'%';
    cc.style.animationDelay=Math.random()*3+'s';
    cc.style.background=['#ffd700','#ff6b6b','#4ecdc4','#45b7d1'][Math.floor(Math.random()*4)];
    t.appendChild(cc);
  }
  
  Music.playSFX('win');
}

function closeTrophy(){
  const t=Utils.getElement('trophyAnimation');
  t.classList.remove('active');
  t.querySelectorAll('.confetti').forEach(c=>c.remove());
}

// ============================================================================
// SECTION & UI MANAGEMENT
// ============================================================================
function showSection(name){
  ['welcome','setup','tournament','game'].forEach(s=>{
    const el=document.getElementById(s+'-section');
    if(el) el.style.display='none';
  });
  const target=document.getElementById(name+'-section');
  if(target) target.style.display='block';
  if(typeof closeSideMenu==='function') closeSideMenu();
  
  const homeBtn=document.getElementById('globalHomeBtn');
  if(homeBtn) homeBtn.style.display=(name==='welcome')?'none':'block';
  
  const titleEl=document.getElementById('main-title');
  if(titleEl) titleEl.style.display=(name==='welcome')?'none':'block';
}

function isMatchLive(){
  const gs=document.getElementById('game-section');
  if(!gs||gs.style.display==='none') return false;
  const ballsBowled=GameState.ballsBowled.reduce((a,b)=>a+b,0);
  const rb=document.getElementById('resultBox');
  const resultVisible=rb&&rb.style.display!=='none'&&rb.style.display!=='';
  return ballsBowled>0&&!resultVisible;
}

function autoPauseIfLive(){
  if(!GameState.isTournament||!GameState.currentMatch) return false;
  if(!isMatchLive()) return false;
  
  try {
    const gsSnapshot=JSON.parse(JSON.stringify(GameState));
    gsSnapshot.currentMatch=null;
    const pausedState={
      gameState:gsSnapshot,
      logContent:document.getElementById('log')?.innerHTML||'',
      ballLogContent:document.getElementById('ballLog')?.textContent||'',
      bowlerStatsContent:document.getElementById('bowlerStats')?.textContent||''
    };
    
    GameState.currentMatch.pausedState=pausedState;
    _stampPausedState(pausedState,GameState.currentMatch,
                      TournamentState.currentStage,TournamentState.currentPhase);
    DataManager.saveTournamentSlot(TournamentState);
    console.log('âœ… Match auto-paused successfully');
    return true;
  } catch(e){
    console.error('autoPauseIfLive error:',e);
    if(TournamentState.format) DataManager.saveTournamentSlot(TournamentState);
    return false;
  }
}

function _stampPausedState(pausedState,match,stage,phase){
  function mark(list){
    if(!list) return;
    const idx=list.findIndex(m=>m.team1===match.team1&&m.team2===match.team2&&!m.completed);
    if(idx>=0) list[idx].pausedState=pausedState;
  }
  
  if(stage==='challengeLeague'){
    mark(phase==='groupA'?TournamentState.challengeLeague.matchesA:TournamentState.challengeLeague.matchesB);
  } else if(stage==='super6'){
    mark(TournamentState.super6.matches);
  } else if(stage==='qualifier'){
    mark(phase==='groupA'?TournamentState.qualifier.matchesA:TournamentState.qualifier.matchesB);
  } else if(stage==='worldCup'){
    if(phase==='main') mark(TournamentState.worldCup.matches);
    else if(phase==='semis') mark(TournamentState.worldCup.semiFinals);
    else if(phase==='final'&&TournamentState.worldCup.final){
      TournamentState.worldCup.final.pausedState=pausedState;
    }
  }
}

async function returnToHome(){
  cancelRankedQueue();
  const gameVisible=document.getElementById('game-section')?.style.display!=='none';
  
  if(gameVisible&&isMatchLive()){
    if(GameState.isTournament&&GameState.currentMatch){
      autoPauseIfLive();
      if(TournamentState.format) DataManager.saveTournamentSlot(TournamentState);
      showSection('welcome');
      checkResumeBtnVisibility();
      showToast('â¸ï¸ Match paused & saved! Tap "Resume Tournament" to continue.','#f59e0b');
      return;
    } else {
      if(!(await uiConfirm('A match is in progress. Leave and abandon it?', 'Leave Match'))) return;
    }
  }
  
  if(TournamentState.format) saveTournamentNow();
  showSection('welcome');
  checkResumeBtnVisibility();
}

function checkResumeBtnVisibility(){
  const hasPending=DataManager.getPendingTournaments().length>0;
  const btn=document.getElementById('resumeTournamentBtn');
  if(btn) btn.style.display='none';
  const menuBtn=document.getElementById('menuResumeBtn');
  if(menuBtn) menuBtn.style.display=hasPending?'block':'none';
}

function pauseMatch(){
  if(!GameState.isTournament||!GameState.currentMatch) return;
  autoPauseIfLive();
  saveTournamentNow();
  const stage=TournamentState.currentStage;
  showSection('tournament');
  if(stage==='wtc') showWTCStage();
  else if(stage==='ipl') showIPLStage();
  else showTournamentStage(stage);
  showToast('â¸ï¸ Match paused successfully','#f59e0b');
}

async function openRankedModal(){
  const modal=document.getElementById('rankedModal');
  const statusEl=document.getElementById('rankedStatus');
  const cancelBtn=document.getElementById('rankedCancelBtn');
  const findBtn=document.getElementById('rankedFindBtn');
  const readyBtn=document.getElementById('rankedReadyBtn');
  const livePanel=document.getElementById('rankedLivePanel');
  const numberRow=document.getElementById('rankedNumberRow');
  if(!modal||!statusEl||!cancelBtn||!findBtn||!readyBtn||!livePanel||!numberRow) return;
  const p=DataManager.getPlayerProfile();
  const mode=(firebaseInitialized&&db&&currentUser)?'Realtime mode':'Practice queue mode (sign in for realtime)';
  statusEl.textContent=`Rank: ${p.rankTier} | RP: ${p.rankPoints} | Tokens: ${p.matchTokens} | ${mode}`;
  cancelBtn.style.display='none';
  findBtn.disabled=false;
  findBtn.textContent='Find Match';
  readyBtn.style.display='none';
  livePanel.style.display='none';
  numberRow.style.display='none';
  modal.style.display='flex';
  if(await _resumeActiveRankedRoom()){
    statusEl.textContent='Rejoined your active ranked room.';
  }
}


async function openLiveRoomById(roomId, sourceLabel){
  if(!roomId) return;
  const modal=document.getElementById('rankedModal');
  const statusEl=document.getElementById('rankedStatus');
  const cancelBtn=document.getElementById('rankedCancelBtn');
  const findBtn=document.getElementById('rankedFindBtn');
  const readyBtn=document.getElementById('rankedReadyBtn');
  const livePanel=document.getElementById('rankedLivePanel');
  const numberRow=document.getElementById('rankedNumberRow');
  if(!modal||!statusEl||!cancelBtn||!findBtn||!readyBtn||!livePanel||!numberRow) return;
  rankedRoomId=roomId;
  statusEl.textContent=(sourceLabel||'Live Match')+': connecting...';
  cancelBtn.style.display='none';
  findBtn.disabled=true;
  findBtn.textContent='In Match';
  readyBtn.style.display='none';
  livePanel.style.display='block';
  numberRow.style.display='none';
  modal.style.display='flex';
  _listenRankedRoom(roomId);
}
async function closeRankedModal(){
  if(rankedRoomId){
    await leaveRankedRoom(true);
  }
  cancelRankedQueue();
  _clearRankedTurnTimeoutTimer();
  if(rankedRoomUnsub){ rankedRoomUnsub(); rankedRoomUnsub=null; }
  rankedRoomId=null;
  rankedTossShownForRoom=null;

  const statusEl=document.getElementById('rankedStatus');
  const cancelBtn=document.getElementById('rankedCancelBtn');
  const findBtn=document.getElementById('rankedFindBtn');
  const readyBtn=document.getElementById('rankedReadyBtn');
  const livePanel=document.getElementById('rankedLivePanel');
  const numberRow=document.getElementById('rankedNumberRow');
  if(statusEl) statusEl.textContent='Press "Find Match" to start matchmaking.';
  if(cancelBtn) cancelBtn.style.display='none';
  if(findBtn){ findBtn.disabled=false; findBtn.textContent='Find Match'; }
  if(readyBtn) readyBtn.style.display='none';
  if(livePanel) livePanel.style.display='none';
  if(numberRow) numberRow.style.display='none';

  const modal=document.getElementById('rankedModal');
  if(modal) modal.style.display='none';
}

function _refundOneToken(){
  const p=DataManager.getPlayerProfile();
  p.matchTokens=(p.matchTokens||0)+1;
  p.lastUpdated=new Date().toISOString();
  DataManager.savePlayerProfile(p);
  updatePlayerProfileUI();
}

function _clearRankedQueueExpiryTimer(){
  if(rankedQueueExpiryTimer){
    clearTimeout(rankedQueueExpiryTimer);
    rankedQueueExpiryTimer=null;
  }
}

function _clearRankedTurnTimeoutTimer(){
  if(rankedTurnTimeoutTimer){
    clearInterval(rankedTurnTimeoutTimer);
    rankedTurnTimeoutTimer=null;
  }
}

async function _callRankedFn(name,payload){
  if(!(firebaseInitialized&&fns&&currentUser)) return null;
  if(rankedCallableDisabled) return null;
  try{
    const fn=fns.httpsCallable(name);
    const res=await fn(payload||{});
    return res?.data||null;
  } catch(e){
    const msg=String(e?.message||'');
    const code=String(e?.code||'');
    const hardFailure=msg.includes('404')||msg.includes('CORS')||code.includes('not-found')||msg.includes('not-found');
    if(hardFailure){
      rankedCallableDisabled=true;
      rankedCallableDisableReason=code||msg||'unknown';
      console.warn('Ranked callable endpoints unavailable; using client fallback for this session.',e);
      if(typeof showToast==='function') showToast('Realtime cloud endpoint unavailable. Running safe fallback mode.','#f59e0b');
      return null;
    }
    console.warn('Callable '+name+' failed; fallback path may run.',e);
    return null;
  }
}

function _getSettledRoomsMap(){
  try{
    return JSON.parse(localStorage.getItem(RANKED_SETTLEMENT_KEY)||'{}')||{};
  } catch(e){
    return {};
  }
}

function _markRankedSettlementApplied(roomId){
  const map=_getSettledRoomsMap();
  map[roomId]=Date.now();
  localStorage.setItem(RANKED_SETTLEMENT_KEY,JSON.stringify(map));
}

function _hasAppliedRankedSettlement(roomId){
  const map=_getSettledRoomsMap();
  return !!map[roomId];
}

function _computeRankedSettlement(room){
  const [p1,p2]=_getRankedPlayers(room);
  const winner=room.winnerUid||null;
  const roomType=String(room.type||'ranked');
  const deltas={};
  [p1,p2].forEach(p=>{
    if(!p.uid) return;
    let rp=0,aura=0,tokens=1;
    if(roomType==='ranked'){
      rp=(p.uid===winner)?26:-10;
      aura=(p.uid===winner)?14:3;
      tokens=(p.uid===winner)?2:1;
      if(!winner){ rp=6; aura=6; tokens=1; }
    } else {
      rp=0; aura=0; tokens=1;
    }
    deltas[p.uid]={ rp,aura,tokens };
  });
  return deltas;
}

async function _ensureRankedSettlement(roomId){
  if(!(firebaseInitialized&&db&&roomId)) return;
  const ref=db.collection('hc_rankedRooms').doc(roomId);
  try{
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(!snap.exists) return;
      const room=snap.data()||{};
      if(room.status!=='finished') return;
      if(room.settled&&room.settlement) return;
      const settlement=_computeRankedSettlement(room);
      tx.update(ref,{
        settled:true,
        settlement,
        settledAt:firebase.firestore.FieldValue.serverTimestamp()
      });
    });
  } catch(e){
    console.error('ensure ranked settlement error:',e);
  }
}

function _applyRankedSettlementForCurrentUser(roomId,room){
  if(!roomId||!room?.settlement||!currentUser?.uid) return;
  if(_hasAppliedRankedSettlement(roomId)) return;
  const delta=room.settlement[currentUser.uid];
  if(!delta) return;
  const p=DataManager.getPlayerProfile();
  p.rankPoints=Math.max(0,(p.rankPoints||0)+(delta.rp||0));
  p.aura=Math.max(0,(p.aura||0)+(delta.aura||0));
  p.matchTokens=Math.max(0,(p.matchTokens||0)+(delta.tokens||0));
  p.rankTier=(typeof DataManager._resolveRankTier==='function') ? DataManager._resolveRankTier(p.rankPoints) : p.rankTier;
  p.lastUpdated=new Date().toISOString();
  DataManager.savePlayerProfile(p);
  updatePlayerProfileUI();
  if (typeof showCoinBankAnimation === 'function') showCoinBankAnimation(delta.tokens || 0);
  if(firebaseInitialized&&db&&currentUser){
    db.collection('handCricketProgress').doc(currentUser.uid)
      .set({ playerProfile:p, lastSync:new Date().toISOString(), dataVersion:APP_VERSION },{ merge:true })
      .catch(err=>console.error('ranked settlement cloud sync error:',err));
  }
  _markRankedSettlementApplied(roomId);
  showToast('Match settled: ' + ((delta.rp>=0?'+':'')+(delta.rp||0)) + ' RP, ' + ((delta.aura>=0?'+':'')+(delta.aura||0)) + ' Aura, +' + (delta.tokens||0) + ' Token(s).','#48bb78');
}
function _getRankedPlayers(room){
  const p1=room?.players?.[0]||{};
  const p2=room?.players?.[1]||{};
  return [p1,p2];
}

function _buildInitialRankedGame(room, battingUidOverride, bowlingUidOverride){
  const [p1,p2]=_getRankedPlayers(room);
  const battingUid=battingUidOverride||p1.uid;
  const bowlingUid=bowlingUidOverride||p2.uid;
  const overs=Security.validateNumber(room?.overs,2,25,4);
  const teamLineups = room?.teamLineups || {};
  const batLineup = Array.isArray(teamLineups[battingUid]) ? teamLineups[battingUid] : [];
  const bowlLineup = Array.isArray(teamLineups[bowlingUid]) ? teamLineups[bowlingUid] : [];
  const makeIdx = (line)=> ({ striker: 0, nonStriker: line.length>1?1:0, maxWkts: Math.max(1, line.length ? line.length-1 : 10) });
  const idxMap = {
    [battingUid]: makeIdx(batLineup),
    [bowlingUid]: makeIdx(bowlLineup)
  };
  return {
    innings:1,
    maxBalls:overs*6,
    balls:0,
    scores:{[battingUid]:0,[bowlingUid]:0},
    wickets:{[battingUid]:0,[bowlingUid]:0},
    target:null,
    battingUid,
    bowlingUid,
    teamLineups,
    batterIndexMap: idxMap,
    submissions:{},
    turn:1,
    turnStartedAtMs:Date.now(),
    lastEvent:'Match started ('+overs+' overs)'
  };
}
function _rankedText(room){
  const [p1,p2]=_getRankedPlayers(room);
  return {
    me:currentUser?.uid===p1.uid?p1:currentUser?.uid===p2.uid?p2:null,
    opp:currentUser?.uid===p1.uid?p2:p1
  };
}


function _getLiveBatterNames(room, game){
  const g = game || {};
  const batUid = g.battingUid;
  const lineups = g.teamLineups || room?.teamLineups || {};
  const lineup = Array.isArray(lineups[batUid]) ? lineups[batUid] : [];
  const idx = (g.batterIndexMap && g.batterIndexMap[batUid]) || { striker:0, nonStriker:1 };
  const striker = lineup[idx.striker] || (batUid===room?.players?.[0]?.uid ? room?.players?.[0]?.name : room?.players?.[1]?.name) || 'Striker';
  const nonStriker = lineup[idx.nonStriker] || striker;
  return { striker, nonStriker };
}
function _setRankedNumberButtonsEnabled(enabled){
  document.querySelectorAll('#rankedNumberRow button').forEach(b=>{ b.disabled=!enabled; });
}

function _updateRankedRoomUI(room){
  const statusEl=document.getElementById('rankedStatus');
  const readyBtn=document.getElementById('rankedReadyBtn');
  const livePanel=document.getElementById('rankedLivePanel');
  const numberRow=document.getElementById('rankedNumberRow');
  const scoreEl=document.getElementById('rankedScoreboard');
  const turnEl=document.getElementById('rankedTurnInfo');
  const cancelBtn=document.getElementById('rankedCancelBtn');
  const findBtn=document.getElementById('rankedFindBtn');
  if(!statusEl||!readyBtn||!livePanel||!numberRow||!scoreEl||!turnEl||!cancelBtn||!findBtn) return;

  const ctx=_rankedText(room);
  const readyMap=room.readyMap||{};
  const readyCount=Object.keys(readyMap).filter(k=>readyMap[k]).length;
  const [p1,p2]=_getRankedPlayers(room);

  if(room.status==='waiting_start'){
    statusEl.textContent=`Room ready: ${readyCount}/2 (${p1.name||'P1'} vs ${p2.name||'P2'}) - ${room.overs||4} overs`;
    readyBtn.style.display='inline-block';
    readyBtn.disabled=!!readyMap[currentUser?.uid];
    livePanel.style.display='none';
    numberRow.style.display='none';
    cancelBtn.style.display='none';
    findBtn.disabled=true;
    findBtn.textContent='Matched';
    return;
  }

  if(room.status==='live'){
    const g=room.game||{};
    const meUid=currentUser?.uid;
    const batUid=g.battingUid;
    const bowlUid=g.bowlingUid;
    const batName=batUid===p1.uid?(p1.name||'P1'):(p2.name||'P2');
    const bowlName=bowlUid===p1.uid?(p1.name||'P1'):(p2.name||'P2');
    const mySubmitted=g.submissions&&g.submissions[meUid]!==undefined;
    const myRole=meUid===batUid?'Batting':'Bowling';

    const roomLabel = room.type==='friendly' ? 'Friendly' : room.type==='clan_clash' ? 'Clan Clash' : 'Ranked';
    statusEl.textContent=`${roomLabel} Room ${rankedRoomId} | ${myRole}`;
    if(room.tossWinnerUid&&room.tossChoice&&rankedTossShownForRoom!==rankedRoomId){
      rankedTossShownForRoom=rankedRoomId;
      const tossWinnerName=room.tossWinnerUid===p1.uid?(p1.name||'P1'):(p2.name||'P2');
      TossAnim.show('TOSS', roomLabel + ' Toss',`${tossWinnerName} won toss and chose to ${room.tossChoice} first.`,`${room.overs||4} overs each`).catch(()=>{});
    }
    readyBtn.style.display='none';
    livePanel.style.display='block';
    numberRow.style.display='grid';
    cancelBtn.style.display='none';
    findBtn.disabled=true;
    findBtn.textContent='In Match';
    const batters = _getLiveBatterNames(room, g);    scoreEl.innerHTML=`<div style="display:grid;grid-template-columns:repeat(3,minmax(110px,1fr));gap:8px"><div style="background:#fff;border:1px solid #c7d2fe;border-radius:10px;padding:8px"><div style="font-size:11px;color:#64748b">BATTING</div><div style="font-weight:700;color:#1e293b">${batName}</div><div style="font-size:20px;font-weight:800">${g.scores?.[batUid]||0}/${g.wickets?.[batUid]||0}</div></div><div style="background:#fff;border:1px solid #c7d2fe;border-radius:10px;padding:8px"><div style="font-size:11px;color:#64748b">BALLS</div><div style="font-size:20px;font-weight:800">${g.balls||0}/${g.maxBalls||RANKED_MAX_BALLS}</div><div style="font-size:11px;color:#64748b">Innings ${g.innings||1}</div></div><div style="background:#fff;border:1px solid #c7d2fe;border-radius:10px;padding:8px"><div style="font-size:11px;color:#64748b">BOWLING</div><div style="font-weight:700;color:#1e293b">${bowlName}</div><div style="font-size:20px;font-weight:800">${g.scores?.[bowlUid]||0}/${g.wickets?.[bowlUid]||0}</div></div></div>`;
    turnEl.textContent=(mySubmitted?'Number submitted. Waiting for opponent...':(g.lastEvent||'Play your number (0-6).'))+` | Striker: ${batters.striker} | Non-striker: ${batters.nonStriker}`;
    _setRankedNumberButtonsEnabled(!mySubmitted);
    return;
  }
if(room.status==='finished'){
    const winnerUid=room.winnerUid||null;
    const winnerName=winnerUid===p1.uid?(p1.name||'P1'):winnerUid===p2.uid?(p2.name||'P2'):'No one';
    statusEl.textContent=`Match finished: ${winnerName}${winnerUid?' won':' (Draw)'}`;
    readyBtn.style.display='none';
    livePanel.style.display='block';
    numberRow.style.display='none';
    cancelBtn.style.display='none';
    findBtn.disabled=false;
    findBtn.textContent='Find Match';
    const g=room.game||{};    scoreEl.innerHTML=`<div style="display:grid;grid-template-columns:repeat(2,minmax(130px,1fr));gap:8px"><div style="background:#fff;border:1px solid #c7d2fe;border-radius:10px;padding:8px"><div style="font-size:11px;color:#64748b">${(p1.name||'P1')}</div><div style="font-size:22px;font-weight:800;color:#1e293b">${g.scores?.[p1.uid]||0}/${g.wickets?.[p1.uid]||0}</div></div><div style="background:#fff;border:1px solid #c7d2fe;border-radius:10px;padding:8px"><div style="font-size:11px;color:#64748b">${(p2.name||'P2')}</div><div style="font-size:22px;font-weight:800;color:#1e293b">${g.scores?.[p2.uid]||0}/${g.wickets?.[p2.uid]||0}</div></div></div>`;
    turnEl.textContent=room.finishReason||'Game over';
    _setRankedNumberButtonsEnabled(false);
  }
}

function _cleanupRankedRoomListener(){
  if(rankedRoomUnsub){
    rankedRoomUnsub();
    rankedRoomUnsub=null;
  }
  rankedTossShownForRoom=null;
  _clearRankedTurnTimeoutTimer();
}

async function _enforceRankedTurnTimeout(roomId){
  if(!(firebaseInitialized&&db&&roomId)) return;
  const callable=await _callRankedFn('rankedEnforceTimeout',{ roomId });
  if(callable&&callable.ok) return;
  const ref=db.collection('hc_rankedRooms').doc(roomId);
  try{
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(!snap.exists) return;
      const room=snap.data()||{};
      if(room.status!=='live') return;
      const g=room.game||{};
      const turnStart=Number(g.turnStartedAtMs||0);
      if(!turnStart){
        tx.update(ref,{ game:{ ...g, turnStartedAtMs:Date.now() } });
        return;
      }
      if(Date.now()-turnStart<RANKED_TURN_TIMEOUT_MS) return;
      const subs=g.submissions||{};
      const batDone=subs[g.battingUid]!==undefined;
      const bowlDone=subs[g.bowlingUid]!==undefined;
      let winnerUid=null;
      let finishReason='Turn timeout';
      if(batDone&&!bowlDone){ winnerUid=g.battingUid; finishReason='Bowling player timed out'; }
      else if(!batDone&&bowlDone){ winnerUid=g.bowlingUid; finishReason='Batting player timed out'; }
      else if(!batDone&&!bowlDone){ winnerUid=null; finishReason='Both players timed out'; }
      else return;
      tx.update(ref,{
        status:'finished',
        winnerUid:winnerUid||null,
        finishReason,
        finishedAt:firebase.firestore.FieldValue.serverTimestamp()
      });
    });
  } catch(e){
    console.error('ranked timeout enforcement error:',e);
  }
}

async function _resumeActiveRankedRoom(){
  if(!(firebaseInitialized&&db&&currentUser)) return false;
  const isActiveStatus=(s)=>s==='waiting_start'||s==='live';
  if(rankedRoomId){
    try{
      const existing=await db.collection('hc_rankedRooms').doc(rankedRoomId).get();
      const room=existing.exists?(existing.data()||{}):null;
      if(room&&isActiveStatus(room.status)){
        _listenRankedRoom(rankedRoomId);
        return true;
      }
    } catch(e){
      console.error('resume existing ranked room error:',e);
    }
    rankedRoomId=null;
    _cleanupRankedRoomListener();
  }
  try{
    const q=db.collection('hc_rankedQueue');
    const mine=await q.where('uid','==',currentUser.uid).limit(5).get();
    for(const doc of mine.docs){
      const d=doc.data()||{};
      if(d.status==='matched'&&d.roomId){
        const roomSnap=await db.collection('hc_rankedRooms').doc(d.roomId).get();
        const room=roomSnap.exists?(roomSnap.data()||{}):null;
        if(room&&isActiveStatus(room.status)){
          rankedRoomId=d.roomId;
          _listenRankedRoom(rankedRoomId);
          return true;
        }
        await q.doc(doc.id).delete().catch(()=>{});
      }
      if(d.status==='searching'){
        await q.doc(doc.id).delete().catch(()=>{});
      }
    }
    const rooms=await db.collection('hc_rankedRooms')
      .where('playerUids','array-contains',currentUser.uid)
      .where('status','in',['waiting_start','live'])
      .limit(5)
      .get();
    if(!rooms.empty){
      rankedRoomId=rooms.docs[0].id;
      _listenRankedRoom(rankedRoomId);
      return true;
    }
  } catch(e){
    console.error('resume active ranked room error:',e);
  }
  return false;
}

function _listenRankedRoom(roomId){
  if(!(firebaseInitialized&&db&&roomId)) return;
  _cleanupRankedRoomListener();
  rankedRoomUnsub=db.collection('hc_rankedRooms').doc(roomId).onSnapshot(snap=>{
    if(!snap.exists){
      const statusEl=document.getElementById('rankedStatus');
      if(statusEl) statusEl.textContent='Room no longer exists.';
      rankedRoomId=null;
      _cleanupRankedRoomListener();
      return;
    }
    const room=snap.data()||{};
    _updateRankedRoomUI(room);
    if(room.status==='finished'){
      _clearRankedTurnTimeoutTimer();
      _ensureRankedSettlement(roomId);
      _applyRankedSettlementForCurrentUser(roomId,room);
    } else if(room.status==='live'){
      const shouldEnforceTimeout=room?.game?.battingUid===currentUser?.uid;
      if(shouldEnforceTimeout){
        if(!rankedTurnTimeoutTimer){
          rankedTurnTimeoutTimer=setInterval(()=>{ _enforceRankedTurnTimeout(roomId); },4000);
        }
      } else {
        _clearRankedTurnTimeoutTimer();
      }
    }
  },err=>{
    console.error('ranked room listener error:',err);
  });
}

async function rankedMarkReady(){
  if(!(firebaseInitialized&&db&&currentUser&&rankedRoomId)) return;
  const callable=await _callRankedFn('rankedMarkReady',{ roomId:rankedRoomId });
  if(callable&&callable.ok) return;
  const ref=db.collection('hc_rankedRooms').doc(rankedRoomId);
  try{
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(!snap.exists) throw new Error('Room missing');
      const room=snap.data()||{};
      if(room.status!=='waiting_start') return;
      const readyMap={...(room.readyMap||{})};
      readyMap[currentUser.uid]=true;
      const [p1,p2]=_getRankedPlayers(room);
      const bothReady=!!readyMap[p1.uid]&&!!readyMap[p2.uid];
      const payload={readyMap};
      if(bothReady){
        const tossWinnerUid=Math.random()<0.5?p1.uid:p2.uid;
        const tossChoice=Math.random()<0.5?'bat':'bowl';
        const otherUid=tossWinnerUid===p1.uid?p2.uid:p1.uid;
        const battingUid=tossChoice==='bat'?tossWinnerUid:otherUid;
        const bowlingUid=battingUid===p1.uid?p2.uid:p1.uid;
        payload.status='live';
        payload.startedAt=firebase.firestore.FieldValue.serverTimestamp();
        payload.tossWinnerUid=tossWinnerUid;
        payload.tossChoice=tossChoice;
        payload.game=room.game||_buildInitialRankedGame(room, battingUid, bowlingUid);
      }
      tx.update(ref,payload);
    });
  } catch(e){
    console.error('rankedMarkReady error:',e);
    showToast('Could not set ready state.','#e53e3e');
  }
}

function _resolveRankedTurn(game, room){
  const g=JSON.parse(JSON.stringify(game));
  const batUid=g.battingUid;
  const bowlUid=g.bowlingUid;
  const batNum=Number(g.submissions?.[batUid]);
  const bowlNum=Number(g.submissions?.[bowlUid]);
  const [p1,p2]=_getRankedPlayers(room);

  g.scores=g.scores||{};
  g.wickets=g.wickets||{};
  g.scores[batUid]=g.scores[batUid]||0;
  g.wickets[batUid]=g.wickets[batUid]||0;
  g.scores[bowlUid]=g.scores[bowlUid]||0;
  g.wickets[bowlUid]=g.wickets[bowlUid]||0;
  g.teamLineups = g.teamLineups || room?.teamLineups || {};
  g.batterIndexMap = g.batterIndexMap || {};

  const lineup = Array.isArray(g.teamLineups[batUid]) ? g.teamLineups[batUid] : [];
  if (!g.batterIndexMap[batUid]) {
    g.batterIndexMap[batUid] = { striker:0, nonStriker: lineup.length>1?1:0, maxWkts: Math.max(1, lineup.length?lineup.length-1:10) };
  }
  const idx = g.batterIndexMap[batUid];
  const strikerName = lineup[idx.striker] || (batUid===p1.uid?(p1.name||'P1'):(p2.name||'P2'));

  if(batNum===bowlNum){
    g.wickets[batUid]+=1;
    g.lastEvent=`Wicket! ${strikerName} is out on ${batNum}.`;
    if (g.wickets[batUid] <= idx.maxWkts) {
      const nextIn = Math.min(idx.maxWkts, Math.max(idx.striker, idx.nonStriker) + 1);
      idx.striker = nextIn;
      if (idx.nonStriker === idx.striker) idx.nonStriker = Math.max(0, idx.striker - 1);
    }
  } else {
    g.scores[batUid]+=batNum;
    g.lastEvent=`${strikerName} scores ${batNum}.`;
    if ((batNum % 2) === 1) {
      const t = idx.striker; idx.striker = idx.nonStriker; idx.nonStriker = t;
    }
  }
  g.balls=(g.balls||0)+1;
  g.turn=(g.turn||1)+1;

  const inningsOver=g.wickets[batUid]>=idx.maxWkts||g.balls>=(g.maxBalls||RANKED_MAX_BALLS);
  if(g.innings===1 && inningsOver){
    g.target=g.scores[batUid]+1;
    g.innings=2;
    g.balls=0;
    g.battingUid=bowlUid;
    g.bowlingUid=batUid;
    const lineup2 = Array.isArray(g.teamLineups[g.battingUid]) ? g.teamLineups[g.battingUid] : [];
    g.batterIndexMap[g.battingUid] = { striker:0, nonStriker: lineup2.length>1?1:0, maxWkts: Math.max(1, lineup2.length?lineup2.length-1:10) };
    g.submissions={};
    g.turnStartedAtMs=Date.now();
    g.lastEvent=`Innings break. Target is ${g.target}.`;
    return { game:g, status:'live', winnerUid:null, finishReason:'' };
  }

  if(g.innings===2){
    if((g.scores[g.battingUid]||0)>=g.target){
      return { game:g, status:'finished', winnerUid:g.battingUid, finishReason:'Target chased' };
    }
    const idx2 = g.batterIndexMap[g.battingUid] || { maxWkts:10 };
    const secondOver=g.wickets[g.battingUid]>=idx2.maxWkts||g.balls>=(g.maxBalls||RANKED_MAX_BALLS);
    if(secondOver){
      const ch=g.scores[g.battingUid]||0;
      const def=g.scores[g.bowlingUid]||0;
      if(ch>def) return { game:g, status:'finished', winnerUid:g.battingUid, finishReason:'Higher score' };
      if(ch<def) return { game:g, status:'finished', winnerUid:g.bowlingUid, finishReason:'Defended target' };
      return { game:g, status:'finished', winnerUid:null, finishReason:'Match tied' };
    }
  }

  g.submissions={};
  g.turnStartedAtMs=Date.now();
  return { game:g, status:'live', winnerUid:null, finishReason:'' };
}
async function rankedPlayNumber(n){
  if(!(firebaseInitialized&&db&&currentUser&&rankedRoomId)) return;
  const val=Number(n);
  if(!Number.isInteger(val)||val<0||val>6) return;
  const callable=await _callRankedFn('rankedSubmitMove',{ roomId:rankedRoomId, move:val });
  if(callable&&callable.ok) return;
  const ref=db.collection('hc_rankedRooms').doc(rankedRoomId);
  try{
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(!snap.exists) throw new Error('Room missing');
      const room=snap.data()||{};
      if(room.status!=='live') return;
      const [p1,p2]=_getRankedPlayers(room);
      if(currentUser.uid!==p1.uid&&currentUser.uid!==p2.uid) return;
      const game=room.game||{};
      if(!game.battingUid||!game.bowlingUid) return;
      if(currentUser.uid!==game.battingUid&&currentUser.uid!==game.bowlingUid) return;
      const submissions={...(game.submissions||{})};
      if(submissions[currentUser.uid]!==undefined) return;
      submissions[currentUser.uid]=val;
      game.submissions=submissions;

      const haveBat=submissions[game.battingUid]!==undefined;
      const haveBowl=submissions[game.bowlingUid]!==undefined;
      if(haveBat&&haveBowl){
        const resolved=_resolveRankedTurn(game,room);
        const payload={ game:resolved.game, status:resolved.status };
        if(resolved.status==='finished'){
          payload.winnerUid=resolved.winnerUid||null;
          payload.finishReason=resolved.finishReason||'Finished';
          payload.finishedAt=firebase.firestore.FieldValue.serverTimestamp();
        }
        tx.update(ref,payload);
      } else {
        tx.update(ref,{ game });
      }
    });
  } catch(e){
    console.error('rankedPlayNumber error:',e);
    showToast('Move failed. Try again.','#e53e3e');
  }
}

async function leaveRankedRoom(forfeitIfLive){
  if(!(firebaseInitialized&&db&&currentUser&&rankedRoomId)){
    rankedRoomId=null;
    _cleanupRankedRoomListener();
    return;
  }
  const ref=db.collection('hc_rankedRooms').doc(rankedRoomId);
  try{
    if(forfeitIfLive){
      await db.runTransaction(async tx=>{
        const snap=await tx.get(ref);
        if(!snap.exists) return;
        const room=snap.data()||{};
        if(room.status!=='live'&&room.status!=='waiting_start') return;
        const [p1,p2]=_getRankedPlayers(room);
        const oppUid=currentUser.uid===p1.uid?p2.uid:p1.uid;
        tx.update(ref,{
          status:'finished',
          winnerUid:oppUid||null,
          finishReason:'Opponent forfeited',
          finishedAt:firebase.firestore.FieldValue.serverTimestamp()
        });
      });
    }
  } catch(e){
    console.error('leaveRankedRoom error:',e);
  } finally {
    rankedRoomId=null;
    _cleanupRankedRoomListener();
  }
}

async function startRankedQueue(){
  const statusEl=document.getElementById('rankedStatus');
  const cancelBtn=document.getElementById('rankedCancelBtn');
  const findBtn=document.getElementById('rankedFindBtn');
  if(!statusEl||!cancelBtn||!findBtn) return;
  if(rankedQueueTimer||rankedQueueDocId){
    statusEl.textContent='You are already in queue. Cancel first to restart.';
    return;
  }
  if(rankedRoomId){
    const resumed=await _resumeActiveRankedRoom();
    if(resumed){
      statusEl.textContent='You already have an active ranked room.';
      return;
    }
    rankedRoomId=null;
  }
  const rankedOvers=Security.validateNumber(Utils.getValue('rankedOversSelect'),2,10,4);
  if(!DataManager.spendMatchTokens(1)){
    showToast('Need at least 1 match token for ranked queue','#e53e3e');
    statusEl.textContent='Insufficient tokens. Play matches to earn more.';
    return;
  }
  statusEl.textContent='Searching for opponent... ('+rankedOvers+' overs)';
  cancelBtn.style.display='inline-block';
  findBtn.disabled=true;
  findBtn.textContent='Queueing...';
  showToast('Ranked queue started. 1 token spent.','#f59e0b');

  if(!(firebaseInitialized&&db&&currentUser)){
    rankedQueueTimer=setTimeout(()=>{
      rankedQueueTimer=null;
      cancelBtn.style.display='none';
      findBtn.disabled=false;
      findBtn.textContent='Find Match';
      statusEl.textContent='Practice queue complete. Sign in for realtime opponents.';
      showToast('Practice queue complete. Sign in for realtime opponents.','#667eea');
    },3000);
    return;
  }

  try {
    const profile=DataManager.getPlayerProfile();
    const queueCol=db.collection('hc_rankedQueue');
    const now=Date.now();

    // Prevent duplicate queue entries for this uid and reuse active matched room.
    const myExisting=await queueCol.where('uid','==',currentUser.uid).get();
    for(const doc of myExisting.docs){
      const d=doc.data()||{};
      if(d.status==='matched'&&d.roomId){
        _refundOneToken();
        rankedRoomId=d.roomId;
        cancelBtn.style.display='none';
        findBtn.disabled=true;
        findBtn.textContent='Matched';
        statusEl.textContent=`Resuming matched room ${d.roomId}.`;
        _listenRankedRoom(d.roomId);
        return;
      }
      if(d.status==='searching'){
        await queueCol.doc(doc.id).delete().catch(()=>{});
      }
    }

    // Opportunistic stale queue cleanup for robustness.
    const searchingSnapshot=await queueCol.where('status','==','searching').limit(100).get();
    for(const doc of searchingSnapshot.docs){
      const d=doc.data()||{};
      if((now-(d.createdAtMs||0))>RANKED_STALE_QUEUE_MS){
        await queueCol.doc(doc.id).delete().catch(()=>{});
      }
    }

    const myRef=await queueCol.add({
      uid:currentUser.uid,
      name:(typeof getPublicUserName==='function'?getPublicUserName():(currentUser.displayName||'Player')),
      rankTier:profile.rankTier,
      rankPoints:profile.rankPoints||0,
      rankedOvers,
      status:'searching',
      roomId:null,
      createdAt:firebase.firestore.FieldValue.serverTimestamp(),
      createdAtMs:Date.now()
    });
    rankedQueueDocId=myRef.id;
    _clearRankedQueueExpiryTimer();
    rankedQueueExpiryTimer=setTimeout(()=>{
      if(rankedQueueDocId){
        statusEl.textContent='Queue timed out. Token refunded.';
        cancelRankedQueue();
      }
    },RANKED_QUEUE_WAIT_MS);

    rankedQueueUnsub=myRef.onSnapshot(snap=>{
      if(!snap.exists) return;
      const data=snap.data()||{};
      if(data.status==='matched'&&data.roomId){
        rankedRoomId=data.roomId;
        if(rankedQueueUnsub){ rankedQueueUnsub(); rankedQueueUnsub=null; }
        rankedQueueDocId=null;
        _clearRankedQueueExpiryTimer();
        cancelBtn.style.display='none';
        findBtn.disabled=true;
        findBtn.textContent='Matched';
        statusEl.textContent=`Matched in room ${data.roomId}. Waiting for players to ready up.`;
        _listenRankedRoom(data.roomId);
        showToast('Opponent matched. Ready up to start.','#48bb78');
      }
    });

    const candidatesSnap=await queueCol.where('status','==','searching').limit(12).get();
    const meRp=profile.rankPoints||0;
    const pool=candidatesSnap.docs
      .filter(d=>d.id!==myRef.id && d.data().uid!==currentUser.uid)
      .filter(d=>(Date.now()-(d.data().createdAtMs||0))<=RANKED_STALE_QUEUE_MS)
      .filter(d=>Number(d.data().rankedOvers||4)===rankedOvers)
      .map(d=>({ doc:d, rp:Number(d.data().rankPoints||0), createdAtMs:Number(d.data().createdAtMs||0) }));
    if(!pool.length){
      statusEl.textContent='In queue... waiting for opponent.';
      return;
    }
    pool.sort((a,b)=>Math.abs(a.rp-meRp)-Math.abs(b.rp-meRp)||a.createdAtMs-b.createdAtMs);
    const matchedBySkill=pool.find(x=>Math.abs(x.rp-meRp)<=RANKED_MAX_RP_GAP);
    const pick=matchedBySkill||pool[0];

    const oppRef=queueCol.doc(pick.doc.id);
    const roomRef=db.collection('hc_rankedRooms').doc();
    await db.runTransaction(async tx=>{
      const meSnap=await tx.get(myRef);
      const opSnap=await tx.get(oppRef);
      if(!meSnap.exists||!opSnap.exists) throw new Error('Queue entry missing');
      const me=meSnap.data()||{};
      const op=opSnap.data()||{};
      if(me.status!=='searching'||op.status!=='searching') throw new Error('Opponent already matched');
      tx.set(roomRef,{
        type:'ranked',
        status:'waiting_start',
        createdAt:firebase.firestore.FieldValue.serverTimestamp(),
        createdAtMs:Date.now(),
        overs:rankedOvers,
        readyMap:{},
        playerUids:[me.uid,op.uid],
        players:[
          {uid:me.uid,name:me.name,rankTier:me.rankTier,rankPoints:me.rankPoints},
          {uid:op.uid,name:op.name,rankTier:op.rankTier,rankPoints:op.rankPoints}
        ]
      });
      tx.update(myRef,{status:'matched',roomId:roomRef.id,matchedAt:firebase.firestore.FieldValue.serverTimestamp()});
      tx.update(oppRef,{status:'matched',roomId:roomRef.id,matchedAt:firebase.firestore.FieldValue.serverTimestamp()});
    });
  } catch(e){
    console.error('Ranked queue error:',e);
    statusEl.textContent='Queue failed. Token refunded. Try again.';
    _clearRankedQueueExpiryTimer();
    if(rankedQueueUnsub){ rankedQueueUnsub(); rankedQueueUnsub=null; }
    if(rankedQueueDocId&&firebaseInitialized&&db){
      db.collection('hc_rankedQueue').doc(rankedQueueDocId).delete().catch(()=>{});
      rankedQueueDocId=null;
    }
    _refundOneToken();
    cancelBtn.style.display='none';
    findBtn.disabled=false;
    findBtn.textContent='Find Match';
    showToast('Queue failed. Token refunded.','#e53e3e');
  }
}

function cancelRankedQueue(){
  const hadTimer=!!rankedQueueTimer;
  const hadQueue=hadTimer||!!rankedQueueDocId;
  if(rankedQueueTimer){
    clearTimeout(rankedQueueTimer);
    rankedQueueTimer=null;
    _refundOneToken();
  }
  _clearRankedQueueExpiryTimer();
  if(rankedQueueUnsub){
    rankedQueueUnsub();
    rankedQueueUnsub=null;
  }
  if(rankedQueueDocId&&firebaseInitialized&&db){
    const toDelete=rankedQueueDocId;
    rankedQueueDocId=null;
    db.collection('hc_rankedQueue').doc(toDelete).delete().catch(()=>{});
    _refundOneToken();
  }
  const statusEl=document.getElementById('rankedStatus');
  const cancelBtn=document.getElementById('rankedCancelBtn');
  const findBtn=document.getElementById('rankedFindBtn');
  if(statusEl&&hadQueue) statusEl.textContent='Queue cancelled. Token refunded.';
  if(cancelBtn) cancelBtn.style.display='none';
  if(findBtn&&!rankedRoomId){
    findBtn.disabled=false;
    findBtn.textContent='Find Match';
  }
  if(hadQueue) showToast('Ranked queue cancelled.','#718096');
}
// ============================================================================
// SETUP & START FUNCTIONS
// ============================================================================
function startHandCricket(){
  showSection('setup');
}

function handleModeChange(){
  const m=Utils.getValue('matchMode');
  GameState.matchMode=m;
  
  if(m==='tournament'){
    Utils.getElement('customMatchSetup').style.display='none';
    Utils.getElement('tournamentSetup').style.display='block';
  } else {
    Utils.getElement('customMatchSetup').style.display='block';
    Utils.getElement('tournamentSetup').style.display='none';
    const o=Utils.getElement('overs');
    const ov={t20i:4,odi:10,test:25,rct:15,ipl:5};
    if(ov[m]){
      o.value=ov[m];
      o.disabled=true;
    } else {
      o.disabled=false;
    }
    updatePredefinedTeams(PREDEFINED_TEAMS);
  }
}

async function handleTournamentFormatChange(){
  const f=Utils.getValue('tournamentFormat');
  const d=Utils.getElement('tournamentFormatDetails');
  
  if(!f){
    d.style.display='none';
    return;
  }
  
  const pending=DataManager.getTournaments().filter(s=>s.format===f);
  if(pending.length>0){
    const newest=pending[pending.length-1];
    const fmtNames={odiWorldCup:'ODI World Cup',t20WorldCup:'T20 World Cup',wtc:'World Test Championship',ipl:'IPL'};
    const stageNames={challengeLeague:'Challenge League',super6:'Super 6',qualifier:'Qualifier',worldCup:'World Cup',wtc:'WTC League',ipl:'IPL'};
    const msg=`You have a saved ${fmtNames[f]||f} tournament in progress!\n\nTeam: ${newest.teamName}\nStage: ${stageNames[newest.stage]||newest.stage}\nLast saved: ${newest.lastSaved}\n\nResume this tournament?`;
    
    if(await uiConfirm(msg, 'Resume Tournament?')){
      resumeTournamentSlot(newest.id);
      Utils.getElement('tournamentFormat').value='';
      d.style.display='none';
      return;
    }
  }
  
  d.style.display='block';
  const info={
    odiWorldCup:{desc:'Challenge League â†’ Super 6 â†’ Qualifier â†’ World Cup. 10 overs.',teams:CRICKET_TEAMS,overs:10},
    t20WorldCup:{desc:'Same structure, 4 overs for fast action!',teams:CRICKET_TEAMS,overs:4},
    wtc:{desc:'3 TEST matches vs each of 9 teams. Win=4pts, Draw=2pts. Top 2 play Final.',teams:CRICKET_TEAMS,overs:25},
    ipl:{desc:'Round-robin with 8 IPL teams, then Eliminators + Final. 5 overs.',teams:IPL_TEAMS,overs:5}
  };
  
  const inf=info[f];
  Utils.getElement('formatDescription').textContent=inf.desc;
  TournamentState.format=f;
  TournamentState.matchOvers=inf.overs;
  
  const ts=Utils.getElement('userTournamentTeam');
  ts.innerHTML='<option value="">--Select Your Team--</option>';
  Object.keys(inf.teams).forEach(k=>{
    const o=document.createElement('option');
    o.value=k;
    o.textContent=inf.teams[k].name;
    ts.appendChild(o);
  });
}

function updatePredefinedTeams(obj){
  const s=Utils.getElement('predefinedTeams');
  if(!s) return;
  s.innerHTML='<option value="">--Select Team--</option>';
  Object.keys(obj).forEach(k=>{
    const o=document.createElement('option');
    o.value=k;
    o.textContent=k.toUpperCase();
    s.appendChild(o);
  });
}

function handleTeamSelection(){
  const k=Utils.getValue('predefinedTeams');
  if(!k) return;
  const p=PREDEFINED_TEAMS[k];
  if(p) Utils.getElement('team2Players').value=p.join(', ');
}

async function startTournament(){
  if(!TournamentState.format){
    await uiAlert('Select tournament format!', 'Tournament Setup');
    return;
  }
  
  const u=Utils.getValue('userTournamentTeam');
  if(!u){
    await uiAlert('Select your team!', 'Tournament Setup');
    return;
  }
  
  TournamentState.userTeam=u;
  TournamentState._startDate=new Date().toLocaleString();
  TournamentState._slotId=null;
  
  const fmtNames={
    odiWorldCup:'ODI World Cup ðŸ†',
    t20WorldCup:'T20 World Cup ðŸ†',
    wtc:'World Test Championship ðŸ†',
    ipl:'Indian Premier League ðŸ†'
  };
  
  const tTeams={ipl:IPL_TEAMS,odiWorldCup:CRICKET_TEAMS,t20WorldCup:CRICKET_TEAMS,wtc:CRICKET_TEAMS};
  const teamObj=tTeams[TournamentState.format]||CRICKET_TEAMS;
  const tName=(teamObj[u]||{}).name||u;
  
  await TossAnim.show('ðŸ†',fmtNames[TournamentState.format]||'Tournament Begins!',
    'Your team: '+tName,
    'Good luck! Let the tournament begin!'
  );
  
  showSection('tournament');
  const titles={
    odiWorldCup:'ðŸ† ODI World Cup',
    t20WorldCup:'ðŸ† T20 World Cup',
    wtc:'ðŸ† World Test Championship',
    ipl:'ðŸ† Indian Premier League'
  };
  Utils.setText('tournamentTitle',titles[TournamentState.format]||'ðŸ† Tournament');
  
  const nav=Utils.getElement('tournamentNav');
  const sb=Utils.getElement('statsCornerBtn');
  
  if(TournamentState.format==='wtc'||TournamentState.format==='ipl'){
    nav.style.display='none';
    sb.style.display='block';
  } else {
    nav.style.display='flex';
    sb.style.display='none';
  }
  
  if(TournamentState.format==='odiWorldCup'||TournamentState.format==='t20WorldCup'){
    Tournament.initialize();
    showTournamentStage('challengeLeague');
  } else if(TournamentState.format==='wtc'){
    initializeWTC();
    showWTCStage();
  } else if(TournamentState.format==='ipl'){
    initializeIPL();
    showIPLStage();
  }
  
  saveTournamentNow();
}

async function startGame(){
  GameState.isTournament=false;
  GameState.currentMatch=null;
  GameState.matchMode='custom';
  GameState.teamNames[0]=Security.sanitizeInput(Utils.getValue('team1'))||'User Team';
  GameState.teamNames[1]=Security.sanitizeInput(Utils.getValue('team2'))||'Computer';
  const ov=Security.validateNumber(Utils.getValue('overs'),1,50,2);
  GameState.overs=ov;
  GameState.totalBallsPerInnings=ov*GameState.ballsPerOver;
  GameState.teamPlayers[0]=Utils.parsePlayerList(Utils.getValue('team1Players'));
  GameState.teamPlayers[1]=Utils.parsePlayerList(Utils.getValue('team2Players'));
  
  if(GameState.teamPlayers[0].length<2||GameState.teamPlayers[1].length<2){
    await uiAlert('At least 2 players per team.', 'Invalid Team Setup');
    return;
  }
  
  GameState.reset();
  initializeStats();
  showSection('game');
  
  await TossAnim.show('ðŸ','Match About to Begin!',
    GameState.teamNames[0]+' vs '+GameState.teamNames[1],
    GameState.overs+' overs per side'
  );
  
  await performToss();
  Utils.getElement('resultBox').style.display='none';
  Utils.log(GameState.teamNames[Utils.getBattingTeamIndex(0)]+' batting first!');
  updateBowlerOptions();
  updateUI();
}

// ============================================================================
// WTC FUNCTIONS
// ============================================================================
function initializeWTC(){
  TournamentState.reset();
  const teams=['india','australia','england','newzealand','southafrica','pakistan','srilanka','westindies','bangladesh','afghanistan'];
  TournamentState.wtc.teams=teams;
  TournamentState.currentStage='wtc';
  
  teams.forEach(t=>{
    TournamentState.wtc.standings[t]={played:0,won:0,lost:0,drawn:0,points:0,winPercentage:0};
  });
  
  const allM=[];
  const sp={};
  
  for(let i=0;i<teams.length;i++){
    for(let j=i+1;j<teams.length;j++){
      const k=teams[i]+'_vs_'+teams[j];
      sp[k]={
        team1:teams[i],
        team2:teams[j],
        matches:[],
        team1Wins:0,
        team2Wins:0,
        draws:0,
        completed:false
      };
      
      for(let n=1;n<=3;n++){
        const m={
          team1:teams[i],
          team2:teams[j],
          seriesKey:k,
          matchNumber:n,
          completed:false,
          result:null,
          pausedState:null
        };
        allM.push(m);
        sp[k].matches.push(m);
      }
    }
  }
  
  TournamentState.wtc.allMatches=allM;
  TournamentState.wtc.seriesProgress=sp;
}

function showWTCStage(){
  const c=Utils.getElement('tournamentContent');
  const st=TournamentState.wtc.standings;
  const sp=TournamentState.wtc.seriesProgress;
  const sorted=Object.keys(st).sort((a,b)=>
    st[b].points!==st[a].points?st[b].points-st[a].points:st[b].winPercentage-st[a].winPercentage
  );
  
  let h=`<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:15px">
    <h3>ðŸ† World Test Championship</h3>
    <button onclick="returnToHome()" style="width:auto;padding:8px 16px;background:#718096;font-size:13px">ðŸ  Home</button>
  </div>
  <p>Win=4pts, Draw=2pts, Loss=1pt. Top 2 play Final.</p>
  <table class="points-table"><tr><th>Rank</th><th>Team</th><th>P</th><th>W</th><th>L</th><th>D</th><th>Pts</th><th>Win%</th></tr>`;
  
  sorted.forEach((t,i)=>h+=`<tr class="${i<2?'qualified':''}">`+
    `<td>${i+1}</td><td>${Security.escapeHtml(CRICKET_TEAMS[t].name)}${t===TournamentState.userTeam?' ðŸŽ®':''}</td>`+
    `<td>${st[t].played}</td><td>${st[t].won}</td><td>${st[t].lost}</td><td>${st[t].drawn}</td>`+
    `<td><strong>${st[t].points}</strong></td><td>${st[t].winPercentage.toFixed(1)}%</td></tr>`);
  
  h+='</table><h4 style="margin-top:20px">ðŸ“… Series</h4>';
  
  Object.entries(sp).forEach(([k,s])=>{
    const isU=s.team1===TournamentState.userTeam||s.team2===TournamentState.userTeam;
    h+=`<div style="border:2px solid ${isU?'#48bb78':'#e2e8f0'};border-radius:8px;padding:14px;margin:8px 0;background:${isU?'#f0fff4':'white'}">
      <strong>${Security.escapeHtml(CRICKET_TEAMS[s.team1].name)} vs ${Security.escapeHtml(CRICKET_TEAMS[s.team2].name)}</strong>
      <span style="color:#666;font-size:13px"> (${s.team1Wins}-${s.team2Wins}${s.draws>0?'-'+s.draws:''})</span>`;
    
    s.matches.forEach((m,i)=>{
      if(m.completed){
        h+=`<div style="font-size:13px;color:#666;padding:3px 0">Match ${m.matchNumber}: ${Security.escapeHtml(CRICKET_TEAMS[m.team1].name)} ${m.result.team1Score}/${m.result.team1Wickets} vs ${Security.escapeHtml(CRICKET_TEAMS[m.team2].name)} ${m.result.team2Score}/${m.result.team2Wickets} - <strong>${m.result.winner==='tie'?'DRAW':Security.escapeHtml(CRICKET_TEAMS[m.result.winner].name)}</strong></div>`;
      } else {
        h+=`<div style="padding:4px 0"><button onclick="playWTCMatch('${Security.escapeHtml(k)}',${i})" style="font-size:13px;padding:7px 14px;background:${m.pausedState?'#f59e0b':'#667eea'};color:white;border:none;border-radius:4px;cursor:pointer;width:auto">${m.pausedState?'â¸ï¸ Continue':'â–¶ï¸ Match '+m.matchNumber}</button></div>`;
      }
    });
    
    if(!isU){
      const inc=s.matches.filter(m=>!m.completed).length;
      if(inc>0) h+=`<button onclick="simulateWTCSeries('${Security.escapeHtml(k)}')" style="margin-top:5px;font-size:12px;padding:5px 10px;background:#9ca3af;color:white;border:none;border-radius:4px;cursor:pointer;width:auto">Simulate (${inc})</button>`;
    }
    
    h+='</div>';
  });
  
  const allDone=TournamentState.wtc.allMatches.every(m=>m.completed);
  if(allDone&&!TournamentState.wtc.final){
    h+=`<button onclick="generateWTCFinal()" style="margin-top:20px">Generate WTC Final â†’</button>`;
  }
  
  if(TournamentState.wtc.final){
    const f=TournamentState.wtc.final;
    h+=`<h4 style="margin-top:20px">ðŸ† WTC FINAL</h4>`;
    if(f.completed){
      h+=`<div class="match-card completed"><strong>${Security.escapeHtml(CRICKET_TEAMS[f.team1].name)}</strong> ${f.result.team1Score}/${f.result.team1Wickets} vs <strong>${Security.escapeHtml(CRICKET_TEAMS[f.team2].name)}</strong> ${f.result.team2Score}/${f.result.team2Wickets}<br><span style="color:#38a169">ðŸ† Champion: ${f.result.winner==='tie'?'DRAW':Security.escapeHtml(CRICKET_TEAMS[f.result.winner].name)}</span></div>`;
    } else {
      h+=`<div class="match-card" onclick="playWTCFinal()"><strong>${Security.escapeHtml(CRICKET_TEAMS[f.team1].name)}</strong> vs <strong>${Security.escapeHtml(CRICKET_TEAMS[f.team2].name)}</strong><br><span style="color:${f.pausedState?'#f59e0b':'#667eea'}">${f.pausedState?'â¸ï¸ Continue':'â–¶ï¸ Play Final'}</span></div>`;
    }
  }
  
  c.innerHTML=h;
}

function playWTCMatch(sKey,mIdx){
  const s=TournamentState.wtc.seriesProgress[sKey];
  if(!s) return;
  const match=s.matches[mIdx];
  if(!match) return;
  
  TournamentState.currentStage='wtc';
  TournamentState.currentPhase='series';
  GameState.currentMatch=match;
  
  if(match.pausedState){
    resumeMatch(match);
  } else {
    playWTCMatchNew(match);
  }
}

async function playWTCMatchNew(match){
  const isU=match.team1===TournamentState.userTeam||match.team2===TournamentState.userTeam;
  
  if(isU){
    GameState.isTournament=true;
    GameState.currentMatch=match;
    GameState.matchMode='test';
    const u=match.team1===TournamentState.userTeam?match.team1:match.team2;
    const o=match.team1===TournamentState.userTeam?match.team2:match.team1;
    GameState.teamNames[0]=CRICKET_TEAMS[u].name;
    GameState.teamNames[1]=CRICKET_TEAMS[o].name;
    GameState.teamPlayers[0]=CRICKET_TEAMS[u].players;
    GameState.teamPlayers[1]=CRICKET_TEAMS[o].players;
    GameState.overs=25;
    GameState.dayOvers=25;
    GameState.maxDays=5;
    GameState.ballsPerOver=6;
    GameState.totalBallsPerInnings=150;
    
    showSection('game');
    Utils.setText('matchTitle',`${CRICKET_TEAMS[match.team1].name} vs ${CRICKET_TEAMS[match.team2].name} - WTC Test Match ${match.matchNumber}`);
    GameState.reset();
    initializeStats();
    
    await TossAnim.show('ðŸ','WTC Test Match!',
      CRICKET_TEAMS[match.team1].name+' vs '+CRICKET_TEAMS[match.team2].name,
      'Test Match '+match.matchNumber+' â€¢ 25 overs/day â€¢ 5 days'
    );
    
    await performToss();
    Utils.log('ðŸ TEST MATCH: '+GameState.teamNames[Utils.getBattingTeamIndex(0)]+' batting first!');
    updateBowlerOptions();
    updateUI();
    Utils.getElement('pauseMatchBtn').style.display='block';
    Utils.getElement('dayOversDisplay').style.display='block';
  } else {
    const r=simulateTestMatch(match.team1,match.team2);
    updateWTCMatchResult(match,r);
    showWTCStage();
  }
}

function simulateTestMatch(t1,t2){
  const inn=[
    Math.floor(Math.random()*300)+150,
    Math.floor(Math.random()*300)+150,
    Math.floor(Math.random()*250)+100,
    0
  ];
  const wk=[
    Math.floor(Math.random()*10)+1,
    Math.floor(Math.random()*10)+1,
    Math.floor(Math.random()*10)+1,
    0
  ];
  const tgt=inn[0]+inn[2]-inn[1];
  inn[3]=tgt>0?Math.floor(Math.random()*(tgt+100)):0;
  wk[3]=inn[3]>=tgt?Math.floor(Math.random()*5):10;
  const t1t=inn[0]+inn[2];
  const t2t=inn[1]+inn[3];
  
  return{
    team1Score:t1t,
    team1Wickets:wk[0]+wk[2],
    team2Score:t2t,
    team2Wickets:wk[1]+wk[3],
    winner:t1t>t2t?t1:t2t>t1t?t2:'tie'
  };
}

function simulateWTCSeries(sKey){
  const s=TournamentState.wtc.seriesProgress[sKey];
  s.matches.forEach(m=>{
    if(!m.completed&&m.team1!==TournamentState.userTeam&&m.team2!==TournamentState.userTeam){
      const r=Utils.simulateMatch(m.team1,m.team2,TournamentState.matchOvers);
      updateWTCMatchResult(m,r);
    }
  });
  showWTCStage();
}

function updateWTCMatchResult(match,result){
  match.completed=true;
  match.result=result;
  match.pausedState=null;
  
  const s=TournamentState.wtc.seriesProgress[match.seriesKey];
  const st=TournamentState.wtc.standings;
  
  if(result.winner===match.team1) s.team1Wins++;
  else if(result.winner===match.team2) s.team2Wins++;
  else s.draws++;
  
  if(s.matches.every(m=>m.completed)) s.completed=true;
  
  st[match.team1].played++;
  st[match.team2].played++;
  
  if(result.winner===match.team1){
    st[match.team1].won++;
    st[match.team1].points+=4;
    st[match.team2].lost++;
    st[match.team2].points+=1;
  } else if(result.winner===match.team2){
    st[match.team2].won++;
    st[match.team2].points+=4;
    st[match.team1].lost++;
    st[match.team1].points+=1;
  } else {
    st[match.team1].drawn++;
    st[match.team2].drawn++;
    st[match.team1].points+=2;
    st[match.team2].points+=2;
  }
  
  [match.team1,match.team2].forEach(t=>{
    st[t].winPercentage=st[t].played?(st[t].won/st[t].played)*100:0;
  });
}

function generateWTCFinal(){
  const st=TournamentState.wtc.standings;
  const top=Object.keys(st).sort((a,b)=>
    st[b].points!==st[a].points?st[b].points-st[a].points:st[b].winPercentage-st[a].winPercentage
  );
  TournamentState.wtc.final={
    team1:top[0],
    team2:top[1],
    completed:false,
    result:null,
    pausedState:null
  };
  showWTCStage();
}

function playWTCFinal(){
  const f=TournamentState.wtc.final;
  TournamentState.currentStage='wtc';
  TournamentState.currentPhase='final';
  GameState.currentMatch=f;
  
  if(f.pausedState){
    resumeMatch(f);
  } else {
    playWTCMatchNew(f);
  }
}

// ============================================================================
// IPL FUNCTIONS
// ============================================================================
function initializeIPL(){
  TournamentState.reset();
  const teams=['csk','mi','rcb','kkr','dc','srh','pbks','rr'];
  TournamentState.ipl.teams=teams;
  TournamentState.currentStage='ipl';
  TournamentState.currentPhase='roundRobin';
  
  teams.forEach(t=>{
    TournamentState.ipl.standings[t]={played:0,won:0,lost:0,points:0,nrr:0,for:0,against:0};
  });
  
  const m=[];
  for(let i=0;i<teams.length;i++){
    for(let j=0;j<teams.length;j++){
      if(i!==j){
        m.push({team1:teams[i],team2:teams[j],completed:false,result:null,pausedState:null});
      }
    }
  }
  TournamentState.ipl.roundRobinMatches=m;
}

function showIPLStage(){
  if(TournamentState.currentPhase==='roundRobin'){
    showIPLRR();
  } else {
    showIPLPlayoffs();
  }
}

function showIPLRR(){
  const c=Utils.getElement('tournamentContent');
  const st=TournamentState.ipl.standings;
  const m=TournamentState.ipl.roundRobinMatches;
  const sorted=Object.keys(st).sort((a,b)=>
    st[b].points!==st[a].points?st[b].points-st[a].points:st[b].nrr-st[a].nrr
  );
  
  let h=`<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:15px">
    <h3>ðŸ IPL Round Robin</h3>
    <button onclick="returnToHome()" style="width:auto;padding:8px 16px;background:#718096;font-size:13px">ðŸ  Home</button>
  </div>
  <table class="points-table"><tr><th>Pos</th><th>Team</th><th>P</th><th>W</th><th>L</th><th>Pts</th><th>NRR</th></tr>`;
  
  sorted.forEach((t,i)=>h+=`<tr class="${i<4?'qualified':''}">`+
    `<td>${i+1}</td><td>${Security.escapeHtml(IPL_TEAMS[t].name)}${t===TournamentState.userTeam?' ðŸŽ®':''}</td>`+
    `<td>${st[t].played}</td><td>${st[t].won}</td><td>${st[t].lost}</td>`+
    `<td><strong>${st[t].points}</strong></td><td>${st[t].nrr.toFixed(2)}</td></tr>`);
  
  h+='</table><h4 style="margin-top:20px">ðŸ“… Fixtures</h4>';
  
  const uM=m.filter(x=>x.team1===TournamentState.userTeam||x.team2===TournamentState.userTeam);
  const oM=m.filter(x=>x.team1!==TournamentState.userTeam&&x.team2!==TournamentState.userTeam);
  
  if(uM.some(x=>!x.completed)){
    h+='<h5 style="color:#48bb78;margin:12px 0">âš¡ Your Matches</h5>';
    uM.forEach((match)=>{
      const gi=m.indexOf(match);
      h+=renderIPLMatchCard(match,gi);
    });
  }
  
  const incO=oM.filter(x=>!x.completed);
  if(incO.length>0){
    h+=`<button onclick="simAllIPL()" style="margin:10px 0;padding:10px 20px;background:#9ca3af;color:white;border:none;border-radius:5px;cursor:pointer;width:auto">Simulate All Others (${incO.length})</button>`;
  }
  
  if(m.every(x=>x.completed)){
    h+=`<button onclick="generateIPLPlayoffs()" style="margin-top:20px">Generate Playoffs â†’</button>`;
  }
  
  c.innerHTML=h;
}

function renderIPLMatchCard(match,idx){
  if(match.completed){
    const w=match.result.winner==='tie'?'TIE':Security.escapeHtml(IPL_TEAMS[match.result.winner].name);
    return`<div style="padding:10px;background:#f7fafc;border-radius:5px;margin:5px 0;font-size:14px"><strong>${Security.escapeHtml(IPL_TEAMS[match.team1].name)}</strong> ${match.result.team1Score}/${match.result.team1Wickets} vs <strong>${Security.escapeHtml(IPL_TEAMS[match.team2].name)}</strong> ${match.result.team2Score}/${match.result.team2Wickets} - <strong style="color:#48bb78">${w}</strong></div>`;
  }
  
  return`<div style="padding:5px 0"><button onclick="playIPLMatch(${Number(idx)})" style="width:100%;padding:10px;background:${match.pausedState?'#f59e0b':'#667eea'};color:white;border:none;border-radius:5px;cursor:pointer">${match.pausedState?'â¸ï¸ Continue: ':'â–¶ï¸ '}${Security.escapeHtml(IPL_TEAMS[match.team1].name)} vs ${Security.escapeHtml(IPL_TEAMS[match.team2].name)}</button></div>`;
}

function playIPLMatch(idx){
  const match=TournamentState.ipl.roundRobinMatches[idx];
  TournamentState.currentStage='ipl';
  TournamentState.currentPhase='roundRobin';
  GameState.currentMatch=match;
  
  if(match.pausedState){
    resumeMatch(match);
  } else {
    playIPLMatchNew(match);
  }
}

async function playIPLMatchNew(match){
  const isU=match.team1===TournamentState.userTeam||match.team2===TournamentState.userTeam;
  
  if(isU){
    GameState.isTournament=true;
    GameState.currentMatch=match;
    GameState.matchMode='custom';
    const u=match.team1===TournamentState.userTeam?match.team1:match.team2;
    const o=match.team1===TournamentState.userTeam?match.team2:match.team1;
    GameState.teamNames[0]=IPL_TEAMS[u].name;
    GameState.teamNames[1]=IPL_TEAMS[o].name;
    GameState.teamPlayers[0]=IPL_TEAMS[u].players;
    GameState.teamPlayers[1]=IPL_TEAMS[o].players;
    GameState.overs=TournamentState.matchOvers;
    GameState.totalBallsPerInnings=TournamentState.matchOvers*6;
    
    showSection('game');
    Utils.setText('matchTitle',`${IPL_TEAMS[match.team1].name} vs ${IPL_TEAMS[match.team2].name}`);
    GameState.reset();
    initializeStats();
    
    await TossAnim.show('ðŸ','IPL Match!',
      IPL_TEAMS[match.team1].name+' vs '+IPL_TEAMS[match.team2].name,
      TournamentState.matchOvers+' overs per side'
    );
    
    await performToss();
    Utils.log(GameState.teamNames[Utils.getBattingTeamIndex(0)]+' batting first!');
    updateBowlerOptions();
    updateUI();
    Utils.getElement('pauseMatchBtn').style.display='block';
  } else {
    const r=Utils.simulateMatch(match.team1,match.team2,TournamentState.matchOvers);
    updateIPLMatchResult(match,r);
    showIPLStage();
  }
}

function simAllIPL(){
  TournamentState.ipl.roundRobinMatches.forEach(m=>{
    if(!m.completed&&m.team1!==TournamentState.userTeam&&m.team2!==TournamentState.userTeam){
      const r=Utils.simulateMatch(m.team1,m.team2,TournamentState.matchOvers);
      updateIPLMatchResult(m,r);
    }
  });
  showIPLStage();
}

function updateIPLMatchResult(match,r){
  match.completed=true;
  match.result=r;
  match.pausedState=null;
  
  const st=TournamentState.ipl.standings;
  st[match.team1].played++;
  st[match.team2].played++;
  st[match.team1].for+=r.team1Score;
  st[match.team1].against+=r.team2Score;
  st[match.team2].for+=r.team2Score;
  st[match.team2].against+=r.team1Score;
  
  if(r.winner===match.team1){
    st[match.team1].won++;
    st[match.team1].points+=2;
    st[match.team2].lost++;
  } else if(r.winner===match.team2){
    st[match.team2].won++;
    st[match.team2].points+=2;
    st[match.team1].lost++;
  } else {
    st[match.team1].points++;
    st[match.team2].points++;
  }
  
  [match.team1,match.team2].forEach(t=>{
    st[t].nrr=st[t].played?(st[t].for/st[t].played)-(st[t].against/st[t].played):0;
  });
}

function generateIPLPlayoffs(){
  const st=TournamentState.ipl.standings;
  const top4=Object.keys(st).sort((a,b)=>
    st[b].points!==st[a].points?st[b].points-st[a].points:st[b].nrr-st[a].nrr
  ).slice(0,4);
  
  TournamentState.ipl.eliminator1={
    team1:top4[0],
    team2:top4[1],
    completed:false,
    result:null,
    pausedState:null,
    name:'Eliminator 1 (1st vs 2nd)'
  };
  
  TournamentState.ipl.eliminator2={
    team1:top4[2],
    team2:top4[3],
    completed:false,
    result:null,
    pausedState:null,
    name:'Eliminator 2 (3rd vs 4th)'
  };
  
  TournamentState.currentPhase='playoffs';
  showIPLStage();
}

function showIPLPlayoffs(){
  const c=Utils.getElement('tournamentContent');
  
  let h=`<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:15px">
    <h3>ðŸ IPL Playoffs</h3>
    <button onclick="returnToHome()" style="width:auto;padding:8px 16px;background:#718096;font-size:13px">ðŸ  Home</button>
  </div>`;
  
  const pm=(match,fn)=>{
    if(!match) return'';
    
    if(match.completed){
      const w=Security.escapeHtml(IPL_TEAMS[match.result.winner]?.name||'Unknown');
      return`<div style="background:#f7fafc;padding:18px;border-radius:10px;margin:12px 0;border-left:4px solid #48bb78"><h5>${Security.escapeHtml(match.name||'')}</h5><p>${Security.escapeHtml(IPL_TEAMS[match.team1].name)} ${match.result.team1Score}/${match.result.team1Wickets}</p><p>${Security.escapeHtml(IPL_TEAMS[match.team2].name)} ${match.result.team2Score}/${match.result.team2Wickets}</p><strong style="color:#48bb78">Winner: ${w}</strong></div>`;
    }
    
    return`<div style="background:white;padding:18px;border-radius:10px;margin:12px 0;border:2px solid #667eea"><h5>${Security.escapeHtml(match.name||'')}</h5><button onclick="${fn}()" style="width:100%;padding:14px;background:${match.pausedState?'#f59e0b':'#667eea'};color:white;border:none;border-radius:5px;cursor:pointer">${match.pausedState?'â¸ï¸ Continue: ':'â–¶ï¸ '}${Security.escapeHtml(IPL_TEAMS[match.team1].name)} vs ${Security.escapeHtml(IPL_TEAMS[match.team2].name)}</button></div>`;
  };
  
  h+=pm(TournamentState.ipl.eliminator1,'playE1');
  h+=pm(TournamentState.ipl.eliminator2,'playE2');
  
  if(TournamentState.ipl.eliminator1?.completed&&TournamentState.ipl.eliminator2?.completed&&!TournamentState.ipl.eliminator3){
    h+=`<button onclick="genE3()" style="margin:15px 0">Generate Eliminator 3 â†’</button>`;
  }
  
  if(TournamentState.ipl.eliminator3){
    h+=pm(TournamentState.ipl.eliminator3,'playE3');
    if(TournamentState.ipl.eliminator3.completed&&!TournamentState.ipl.final){
      h+=`<button onclick="genFinal()" style="margin:15px 0">Generate Final â†’</button>`;
    }
  }
  
  if(TournamentState.ipl.final){
    h+='<h4 style="margin-top:30px;color:#667eea">ðŸ† IPL FINAL</h4>';
    h+=pm(TournamentState.ipl.final,'playIPLFinalMatch');
  }
  
  c.innerHTML=h;
}

function playE1(){playIPLPlayoff(TournamentState.ipl.eliminator1);}
function playE2(){playIPLPlayoff(TournamentState.ipl.eliminator2);}
function playE3(){playIPLPlayoff(TournamentState.ipl.eliminator3);}

function playIPLFinalMatch(){
  TournamentState.currentPhase='final';
  playIPLPlayoff(TournamentState.ipl.final);
}

function playIPLPlayoff(match){
  TournamentState.currentStage='ipl';
  GameState.currentMatch=match;
  
  if(match.pausedState){
    resumeMatch(match);
  } else {
    playIPLMatchNew(match);
  }
}

function genE3(){
  const e1L=TournamentState.ipl.eliminator1.result.winner===TournamentState.ipl.eliminator1.team1?
    TournamentState.ipl.eliminator1.team2:TournamentState.ipl.eliminator1.team1;
  
  TournamentState.ipl.eliminator3={
    team1:TournamentState.ipl.eliminator2.result.winner,
    team2:e1L,
    completed:false,
    result:null,
    pausedState:null,
    name:'Eliminator 3'
  };
  
  showIPLStage();
}

function genFinal(){
  TournamentState.ipl.final={
    team1:TournamentState.ipl.eliminator1.result.winner,
    team2:TournamentState.ipl.eliminator3.result.winner,
    completed:false,
    result:null,
    pausedState:null,
    name:'IPL FINAL'
  };
  
  showIPLStage();
}

// ============================================================================
// TOURNAMENT STAGE DISPLAY
// ============================================================================
function showTournamentStage(stage){
  const c=Utils.getElement('tournamentContent');
  
  const renderTable=(st,teams,qCount=3)=>{
    const sorted=[...teams].sort((a,b)=>
      st[b].points!==st[a].points?st[b].points-st[a].points:st[b].nrr-st[a].nrr
    );
    return`<table class="points-table"><thead><tr><th>Team</th><th>P</th><th>W</th><th>L</th><th>Pts</th><th>NRR</th></tr></thead><tbody>`+
      sorted.map((t,i)=>`<tr class="${i<qCount?'qualified':''}">`+
        `<td>${Security.escapeHtml(CRICKET_TEAMS[t].name)}</td><td>${st[t].played}</td><td>${st[t].won}</td><td>${st[t].lost}</td><td>${st[t].points}</td><td>${st[t].nrr.toFixed(2)}</td></tr>`
      ).join('')+'</tbody></table>';
  };
  
  const renderM=(matches,stg,ph)=>{
    return '<div style="margin-top:12px">'+matches.map((m,i)=>{
      if(m.completed){
        const w=m.result.winner==='tie'?'TIE':Security.escapeHtml(CRICKET_TEAMS[m.result.winner].name);
        return`<div class="match-card completed"><strong>${Security.escapeHtml(CRICKET_TEAMS[m.team1].name)}</strong> ${m.result.team1Score}/${m.result.team1Wickets} vs <strong>${Security.escapeHtml(CRICKET_TEAMS[m.team2].name)}</strong> ${m.result.team2Score}/${m.result.team2Wickets}<br><span style="color:#38a169">Winner: ${w}</span></div>`;
      }
      
      const ip=m.pausedState;
      return`<div class="match-card${ip?' match-card-paused':''}" onclick="playTMatch('${stg}','${ph}',${i})" style="${ip?'border-color:#f59e0b;background:#fffbeb':''}"><strong>${Security.escapeHtml(CRICKET_TEAMS[m.team1].name)}</strong> vs <strong>${Security.escapeHtml(CRICKET_TEAMS[m.team2].name)}</strong>${ip?'<br><span style="color:#f59e0b;font-weight:bold">â¸ï¸ PAUSED</span>':''}<br><span style="color:${ip?'#f59e0b':'#667eea'};font-size:14px">${ip?'â–¶ï¸ Continue Match':'Click to play â†’'}</span></div>`;
    }).join('')+'</div>';
  };
  
  const done=arr=>arr.every(m=>m.completed);
  
  let h=`<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:15px">
    <span></span><button onclick="returnToHome()" style="width:auto;padding:8px 16px;background:#718096;font-size:13px">ðŸ  Home</button>
  </div>`;
  
  if(stage==='challengeLeague'){
    h+=`<h3>ðŸ† Challenge League</h3><p>Top 3 from each group â†’ Super 6</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div><h4>Group A</h4>${renderTable(TournamentState.challengeLeague.standingsA,TournamentState.challengeLeague.groupA)}${renderM(TournamentState.challengeLeague.matchesA,'challengeLeague','groupA')}</div>
      <div><h4>Group B</h4>${renderTable(TournamentState.challengeLeague.standingsB,TournamentState.challengeLeague.groupB)}${renderM(TournamentState.challengeLeague.matchesB,'challengeLeague','groupB')}</div>
    </div>
    ${done(TournamentState.challengeLeague.matchesA)&&done(TournamentState.challengeLeague.matchesB)?`<button onclick="Tournament.advanceToSuper6();showTournamentStage('super6')" style="margin-top:15px">Advance to Super 6 â†’</button>`:''}`;
  } else if(stage==='super6'){
    if(!TournamentState.super6.teams.length){
      c.innerHTML='<p>Complete Challenge League first!</p>';
      return;
    }
    h+=`<h3>ðŸ† Super 6</h3><p>Top 4 advance to Qualifier</p>${renderTable(TournamentState.super6.standings,TournamentState.super6.teams,4)}${renderM(TournamentState.super6.matches,'super6','main')}
    ${done(TournamentState.super6.matches)?`<button onclick="Tournament.advanceToQualifier();showTournamentStage('qualifier')" style="margin-top:15px">Advance to Qualifier â†’</button>`:''}`;
  } else if(stage==='qualifier'){
    if(!TournamentState.qualifier.groupA.length){
      c.innerHTML='<p>Complete Super 6 first!</p>';
      return;
    }
    h+=`<h3>ðŸ† Qualifier</h3><p>Top 3 from each group â†’ World Cup</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div><h4>Group A</h4>${renderTable(TournamentState.qualifier.standingsA,TournamentState.qualifier.groupA)}${renderM(TournamentState.qualifier.matchesA,'qualifier','groupA')}</div>
      <div><h4>Group B</h4>${renderTable(TournamentState.qualifier.standingsB,TournamentState.qualifier.groupB)}${renderM(TournamentState.qualifier.matchesB,'qualifier','groupB')}</div>
    </div>
    ${done(TournamentState.qualifier.matchesA)&&done(TournamentState.qualifier.matchesB)?`<button onclick="Tournament.advanceToWorldCup();showTournamentStage('worldCup')" style="margin-top:15px">Advance to World Cup â†’</button>`:''}`;
  } else if(stage==='worldCup'){
    if(!TournamentState.worldCup.teams.length){
      c.innerHTML='<p>Complete Qualifier first!</p>';
      return;
    }
    h+=`<h3>ðŸ† World Cup</h3><p>Top 4 â†’ Semi-Finals</p>${renderTable(TournamentState.worldCup.standings,TournamentState.worldCup.teams,4)}${renderM(TournamentState.worldCup.matches,'worldCup','main')}`;
    
    if(done(TournamentState.worldCup.matches)&&!TournamentState.worldCup.semiFinals.length){
      h+=`<button onclick="Tournament.generateSemiFinals();showTournamentStage('worldCup')">Generate Semi-Finals â†’</button>`;
    }
    
    if(TournamentState.worldCup.semiFinals.length){
      h+=`<h3 style="margin-top:20px">ðŸŽ¯ Semi-Finals</h3>${renderM(TournamentState.worldCup.semiFinals,'worldCup','semis')}`;
      if(done(TournamentState.worldCup.semiFinals)&&!TournamentState.worldCup.final){
        h+=`<button onclick="Tournament.generateFinal();showTournamentStage('worldCup')">Generate Final â†’</button>`;
      }
    }
    
    if(TournamentState.worldCup.final){
      h+=`<h3 style="margin-top:20px">ðŸ† FINAL</h3>${renderM([TournamentState.worldCup.final],'worldCup','final')}`;
    }
  }
  
  c.innerHTML=h;
}

function playTMatch(stage,phase,idx){
  TournamentState.currentStage=stage;
  TournamentState.currentPhase=phase;
  let m;
  
  if(stage==='challengeLeague'){
    m=phase==='groupA'?TournamentState.challengeLeague.matchesA[idx]:TournamentState.challengeLeague.matchesB[idx];
  } else if(stage==='super6'){
    m=TournamentState.super6.matches[idx];
  } else if(stage==='qualifier'){
    m=phase==='groupA'?TournamentState.qualifier.matchesA[idx]:TournamentState.qualifier.matchesB[idx];
  } else if(stage==='worldCup'){
    if(phase==='main') m=TournamentState.worldCup.matches[idx];
    else if(phase==='semis') m=TournamentState.worldCup.semiFinals[idx];
    else m=TournamentState.worldCup.final;
  }
  
  if(m.pausedState){
    resumeMatch(m);
  } else {
    Tournament.playMatch(m);
  }
}

// ============================================================================
// STATS CORNER
// ============================================================================
function showStatsCorner(){
  const c=Utils.getElement('tournamentContent');
  const s=TournamentState.userStats;
  const tName=(TournamentState.format==='ipl'?IPL_TEAMS[TournamentState.userTeam]?.name:CRICKET_TEAMS[TournamentState.userTeam]?.name)||'Your Team';
  
  const pl=Object.keys(s.players||{}).map(n=>({name:n,...s.players[n]}));
  const totR=pl.reduce((a,p)=>a+(p.runs||0),0);
  const totW=pl.reduce((a,p)=>a+(p.wickets||0),0);
  
  const topBat=[...pl].sort((a,b)=>(b.runs||0)-(a.runs||0)).slice(0,11);
  const topBow=[...pl].filter(p=>(p.wickets||0)>0).sort((a,b)=>{
    if(b.wickets!==a.wickets) return b.wickets-a.wickets;
    return(a.runsConceded||0)-(b.runsConceded||0);
  }).slice(0,11);
  
  const tbl=(rows,type)=>{
    if(!rows.length) return`<p style="color:#a0aec0;font-style:italic;padding:10px 0">No data yet</p>`;
    
    if(type==='bat'){
      return`<table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#edf2f7"><th style="padding:8px 10px;text-align:left">#</th><th style="padding:8px 10px;text-align:left">Player</th><th style="padding:8px 10px;text-align:center">Runs</th><th style="padding:8px 10px;text-align:center">Balls</th><th style="padding:8px 10px;text-align:center">Avg</th></tr></thead>
      <tbody>${rows.map((p,i)=>`<tr style="background:${i%2?'#f7fafc':'white'}">
        <td style="padding:8px 10px;font-weight:600;color:#667eea">${i===0?'ðŸ¥‡':i===1?'ðŸ¥ˆ':i===2?'ðŸ¥‰':i+1}</td>
        <td style="padding:8px 10px">${Security.escapeHtml(p.name)}</td>
        <td style="padding:8px 10px;text-align:center;font-weight:700;color:#2d3748">${p.runs||0}</td>
        <td style="padding:8px 10px;text-align:center;color:#718096">${p.balls||0}</td>
        <td style="padding:8px 10px;text-align:center;color:#718096">${(p.matches||0)>0?((p.runs||0)/(p.matches)).toFixed(1):'-'}</td>
      </tr>`).join('')}</tbody></table>`;
    }
    
    return`<table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#edf2f7"><th style="padding:8px 10px;text-align:left">#</th><th style="padding:8px 10px;text-align:left">Player</th><th style="padding:8px 10px;text-align:center">Wkts</th><th style="padding:8px 10px;text-align:center">Runs</th><th style="padding:8px 10px;text-align:center">Avg</th></tr></thead>
      <tbody>${rows.map((p,i)=>`<tr style="background:${i%2?'#f7fafc':'white'}">
        <td style="padding:8px 10px;font-weight:600;color:#f5576c">${i===0?'ðŸ¥‡':i===1?'ðŸ¥ˆ':i===2?'ðŸ¥‰':i+1}</td>
        <td style="padding:8px 10px">${Security.escapeHtml(p.name)}</td>
        <td style="padding:8px 10px;text-align:center;font-weight:700;color:#2d3748">${p.wickets||0}</td>
        <td style="padding:8px 10px;text-align:center;color:#718096">${p.runsConceded||0}</td>
        <td style="padding:8px 10px;text-align:center;color:#718096">${(p.wickets||0)>0?((p.runsConceded||0)/(p.wickets)).toFixed(1):'-'}</td>
      </tr>`).join('')}</tbody></table>`;
  };
  
  const hatCnt=(s.hatTricks||[]).length;
  const cenCnt=(s.centuries||[]).length;
  const fifCnt=(s.fifties||[]).length;
  const threeWkt=(s.threeWickets||[]).length;
  const fiveWkt=(s.fiveWickets||[]).length;
  const tenWkt=(s.tenWickets||[]).length;
  
  const badgeRow=`
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:10px;margin-bottom:20px">
      ${[
        ['ðŸ’¯','Centuries',cenCnt,'#667eea'],
        ['5ï¸âƒ£0ï¸âƒ£','Half-Tons',fifCnt,'#f59e0b'],
        ['ðŸŽ©','Hat-Tricks',hatCnt,'#ef4444'],
        ['ðŸ”¥','3-Wkt Hauls',threeWkt,'#48bb78'],
        ['ðŸ”¥ðŸ”¥','5-Wkt Hauls',fiveWkt,'#764ba2'],
        ['ðŸ’¥','10-Wkt Hauls',tenWkt,'#e53e3e']
      ].map(([icon,label,count,color])=>`
        <div style="background:${color};color:white;border-radius:12px;padding:14px 10px;text-align:center">
          <div style="font-size:1.6em">${icon}</div>
          <div style="font-size:1.8em;font-weight:800;line-height:1.2">${count}</div>
          <div style="font-size:11px;opacity:0.9;margin-top:2px">${label}</div>
        </div>`).join('')}
    </div>`;
  
  const mlRow=(items,icon,label,color,rowFn)=>items&&items.length
    ?`<div style="background:white;border-radius:10px;padding:18px;margin-bottom:12px;box-shadow:0 2px 8px rgba(0,0,0,0.07);border-left:4px solid ${color}">
        <h5 style="color:${color};margin-bottom:10px;font-size:14px">${icon} ${label} (${items.length})</h5>
        <div style="max-height:180px;overflow-y:auto">${items.slice().reverse().map(rowFn).join('')}</div>
      </div>`:'';
  
  const milestonesHtml=
    mlRow(s.centuries,'ðŸ’¯','Centuries','#667eea',c=>`<div style="font-size:13px;padding:5px 0;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between"><span>${Security.escapeHtml(c.player)}</span><span><strong>${c.runs}</strong> (${c.balls}b) â€” ${Security.escapeHtml((c.match||'').substring(0,30))}</span></div>`)+
    mlRow(s.fifties,'5ï¸âƒ£0ï¸âƒ£','Half-Centuries','#f59e0b',f=>`<div style="font-size:13px;padding:5px 0;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between"><span>${Security.escapeHtml(f.player)}</span><span><strong>${f.runs}</strong> (${f.balls}b) â€” ${Security.escapeHtml((f.match||'').substring(0,30))}</span></div>`)+
    mlRow(s.hatTricks,'ðŸŽ©','Hat-Tricks','#ef4444',h=>`<div style="font-size:13px;padding:5px 0;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between"><span>${Security.escapeHtml(h.player)}</span><span style="color:#718096">${Security.escapeHtml((h.match||'').substring(0,35))}</span></div>`)+
    mlRow(s.threeWickets,'ðŸ”¥','3-Wicket Hauls','#48bb78',w=>`<div style="font-size:13px;padding:5px 0;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between"><span>${Security.escapeHtml(w.player)}</span><span><strong>${w.wickets}/${w.runs}</strong> â€” ${Security.escapeHtml((w.match||'').substring(0,25))}</span></div>`)+
    mlRow(s.fiveWickets,'ðŸ”¥ðŸ”¥','5-Wicket Hauls','#764ba2',w=>`<div style="font-size:13px;padding:5px 0;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between"><span>${Security.escapeHtml(w.player)}</span><span><strong>${w.wickets}/${w.runs}</strong> â€” ${Security.escapeHtml((w.match||'').substring(0,25))}</span></div>`)+
    mlRow(s.tenWickets,'ðŸ’¥','10-Wicket Hauls','#e53e3e',w=>`<div style="font-size:13px;padding:5px 0;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between"><span>${Security.escapeHtml(w.player)}</span><span><strong>${w.wickets}/${w.runs}</strong> â€” ${Security.escapeHtml((w.match||'').substring(0,25))}</span></div>`);
  
  const backFn=TournamentState.currentStage==='wtc'?'showWTCStage':TournamentState.currentStage==='ipl'?'showIPLStage':`showTournamentStage('${TournamentState.currentStage}')`;
  
  c.innerHTML=`
    <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap">
      <button onclick="${backFn}()" style="width:auto;padding:10px 20px;background:#718096;color:white;border:none;border-radius:5px;cursor:pointer">â† Back</button>
      <button onclick="returnToHome()" style="width:auto;padding:10px 20px;background:#718096;color:white;border:none;border-radius:5px;cursor:pointer">ðŸ  Home</button>
    </div>
    <h3 style="text-align:center;margin-bottom:4px">ðŸ“Š Stats Corner</h3>
    <p style="text-align:center;color:#718096;margin-bottom:20px;font-size:14px">${Security.escapeHtml(tName)}</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-bottom:20px">
      <div style="background:linear-gradient(135deg,#667eea,#764ba2);padding:18px;border-radius:12px;color:white;text-align:center">
        <div style="font-size:2.6em;font-weight:800">${totR}</div><div style="opacity:0.9;font-size:13px">Total Runs Scored</div>
      </div>
      <div style="background:linear-gradient(135deg,#f093fb,#f5576c);padding:18px;border-radius:12px;color:white;text-align:center">
        <div style="font-size:2.6em;font-weight:800">${totW}</div><div style="opacity:0.9;font-size:13px">Wickets Taken</div>
      </div>
    </div>
    ${badgeRow}
    <div style="background:white;border-radius:10px;padding:20px;margin-bottom:12px;box-shadow:0 2px 8px rgba(0,0,0,0.07)">
      <h4 style="color:#667eea;margin-bottom:12px">ðŸ Most Runs</h4>
      ${tbl(topBat,'bat')}
    </div>
    <div style="background:white;border-radius:10px;padding:20px;margin-bottom:20px;box-shadow:0 2px 8px rgba(0,0,0,0.07)">
      <h4 style="color:#f5576c;margin-bottom:12px">âš¡ Most Wickets Taken</h4>
      ${tbl(topBow,'bow')}
    </div>
    ${milestonesHtml||'<p style="text-align:center;color:#a0aec0;padding:20px">Play tournament matches to unlock milestones!</p>'}`;
}

// ============================================================================
// RESUME MATCH
// ============================================================================
function resumeMatch(match){
  if(!match||!match.pausedState){
    uiAlert('No saved match data. Starting fresh.', 'Resume Match');
    if(match.team1===TournamentState.userTeam||match.team2===TournamentState.userTeam){
      if(TournamentState.currentStage==='wtc') playWTCMatchNew(match);
      else if(TournamentState.currentStage==='ipl') playIPLMatchNew(match);
      else Tournament.playMatch(match);
    }
    return;
  }
  
  const sv=match.pausedState;
  const gs=JSON.parse(JSON.stringify(sv.gameState));
  const fields=['teamNames','teamPlayers','overs','ballsPerOver','totalBallsPerInnings','matchMode','currentInnings','striker','nonStriker','currentBowler','lastBowler','scores','wickets','ballsBowled','targets','batsmenStats','ballByBall','bowlerStats','userTeamIndex','compTeamIndex','userBattingFirst','tossWinner','dayOvers','maxDays','totalMatchBalls','recentUserRuns','lastBattingRuns','bannedRuns','bannedCounter','lastBowlingRuns','lastUserInputs','overKillMode','killOverNumber','isTournament','_matchHattricks','_matchCenturies','_matchFifties','_matchThreeWickets','_matchFiveWickets','_matchTenWickets'];
  
  fields.forEach(f=>{
    if(gs[f]!==undefined) GameState[f]=gs[f];
  });
  
  GameState.recentUserRuns=gs.recentUserRuns||[];
  GameState.lastBattingRuns=gs.lastBattingRuns||[];
  GameState.bannedRuns=gs.bannedRuns||[];
  GameState.bannedCounter=gs.bannedCounter||{};
  GameState.celebrationQueue=[];
  GameState.celebrationInProgress=false;
  GameState.currentMatch=match;
  
  showSection('game');
  
  const getTeamObj=(k)=>CRICKET_TEAMS[k]||IPL_TEAMS[k]||{name:k};
  const t1n=getTeamObj(match.team1).name;
  const t2n=getTeamObj(match.team2).name;
  Utils.setText('matchTitle',t1n+' vs '+t2n);
  
  const logEl=Utils.getElement('log');
  const blEl=Utils.getElement('ballLog');
  const bsEl=Utils.getElement('bowlerStats');
  
  if(logEl) logEl.innerHTML=sv.logContent||'';
  if(blEl) blEl.textContent=sv.ballLogContent||'';
  if(bsEl) bsEl.textContent=sv.bowlerStatsContent||'';
  
  updateBowlerOptions();
  updateUI();
  
  const hasBowler=GameState.currentBowler!==null;
  Utils.toggleButtons('.number-buttons button',hasBowler);
  Utils.getElement('bowlerSelect').disabled=hasBowler;
  Utils.getElement('pauseMatchBtn').style.display='block';
  Utils.getElement('continueDayBtn').style.display='none';
  
  Utils.log('Match resumed!');
}

// ============================================================================
// INITIALIZATION
// ============================================================================
window.addEventListener('DOMContentLoaded',()=>{
  try {
    if(typeof firebase!=='undefined'){
      app=firebase.initializeApp(firebaseConfig);
      auth=firebase.auth();
      db=firebase.firestore();
      fns=(typeof firebase.functions==='function')?firebase.functions():null;
      firebaseInitialized=true;
      auth.onAuthStateChanged(async u=>{
        if(u && typeof enforceSingleActiveSession==='function'){
          const allowed = await enforceSingleActiveSession(u);
          if(!allowed) return;
        }
        if(!u && typeof clearActiveSessionState==='function'){
          clearActiveSessionState();
        }
        const nextUid=u&&u.uid?u.uid:null;
        if(typeof switchProgressIdentity==='function'){
          try { switchProgressIdentity(nextUid); } catch(e){ console.error('Identity switch error:',e); }
        }
        currentUser=u;
        updateAuthUI();
        TournamentHistory.displayHistory();
        checkResumeBtnVisibility();
        updatePlayerProfileUI();
        if(u){
          loadProgressFromCloud();
          _resumeActiveRankedRoom();
        }
      });
      console.log('âœ… Firebase initialized');
    } else {
      console.log('â„¹ï¸ Firebase not loaded - local mode active');
    }
  } catch(e){
    console.error('Firebase init error:',e);
  }
  
  updatePredefinedTeams(PREDEFINED_TEAMS);
  TournamentHistory.displayHistory();
  checkResumeBtnVisibility();
  updatePlayerProfileUI();
  
  const hb=document.getElementById('globalHomeBtn');
  if(hb) hb.style.display='none';
  
  const hm=document.getElementById('historyModal');
  if(hm){
    hm.addEventListener('click',function(e){
      if(e.target===this) closeHistoryModal();
    });
  }
  
  const rm=document.getElementById('resumeModal');
  if(rm){
    rm.addEventListener('click',function(e){
      if(e.target===this) closeResumeModal();
    });
  }
  
  const ranked=document.getElementById('rankedModal');
  if(ranked){
    ranked.addEventListener('click',function(e){
      if(e.target===this) closeRankedModal();
    });
  }
  const adm=document.getElementById('appDialogModal');
  if(adm){
    adm.addEventListener('click',function(e){
      if(e.target===this){
        const cancel=document.querySelector('#appDialogButtons button:last-child');
        if(cancel) cancel.click();
      }
    });
  }  
  console.log('ðŸ Hand Cricket v'+APP_VERSION+' loaded!');
  console.log('ðŸ’¾ Saved tournaments:',DataManager.getPendingTournaments().length,'| Match history:',DataManager.getMatchHistory().length);
});

// Make functions global
window.startHandCricket=startHandCricket;
window.handleModeChange=handleModeChange;
window.handleTournamentFormatChange=handleTournamentFormatChange;
window.handleTeamSelection=handleTeamSelection;
window.startTournament=startTournament;
window.startGame=startGame;
window.returnToHome=returnToHome;
window.showTournamentStage=showTournamentStage;
window.playTMatch=playTMatch;
window.showStatsCorner=showStatsCorner;
window.pauseMatch=pauseMatch;
window.openRankedModal=openRankedModal;
window.closeRankedModal=closeRankedModal;
window.openLiveRoomById=openLiveRoomById;
window.startRankedQueue=startRankedQueue;
window.cancelRankedQueue=cancelRankedQueue;
window.rankedMarkReady=rankedMarkReady;
window.rankedPlayNumber=rankedPlayNumber;
window.showWTCStage=showWTCStage;
window.playWTCMatch=playWTCMatch;
window.simulateWTCSeries=simulateWTCSeries;
window.generateWTCFinal=generateWTCFinal;
window.playWTCFinal=playWTCFinal;
window.showIPLStage=showIPLStage;
window.playIPLMatch=playIPLMatch;
window.simAllIPL=simAllIPL;
window.generateIPLPlayoffs=generateIPLPlayoffs;
window.playE1=playE1;
window.playE2=playE2;
window.playE3=playE3;
window.playIPLFinalMatch=playIPLFinalMatch;
window.genE3=genE3;
window.genFinal=genFinal;

console.log('âœ… Hand Cricket v3.5.0 - Ranked queue placeholder enabled.');

































// ENHANCED_SETUP_UX_V2
const TEAM_BADGES = {
  india:'ðŸ‡®ðŸ‡³', australia:'ðŸ‡¦ðŸ‡º', england:'ðŸ´', pakistan:'ðŸ‡µðŸ‡°', southafrica:'ðŸ‡¿ðŸ‡¦', newzealand:'ðŸ‡³ðŸ‡¿',
  westindies:'ðŸï¸', srilanka:'ðŸ‡±ðŸ‡°', bangladesh:'ðŸ‡§ðŸ‡©', afghanistan:'ðŸ‡¦ðŸ‡«', ireland:'ðŸ‡®ðŸ‡ª', netherlands:'ðŸ‡³ðŸ‡±',
  csk:'ðŸ¦', mi:'ðŸ”µ', rcb:'ðŸ”¥', kkr:'ðŸŸ£', srh:'ðŸ§¡', rr:'ðŸ’—', dc:'ðŸ¦…', pbks:'ðŸ›¡ï¸'
};

let draftPoolPlayers = [];
let draftSelectedPlayers = new Set();

function _csvPlayers(text, maxCount = 22) {
  return String(text || '')
    .split(',')
    .map(p => Security.sanitizeInput(p))
    .filter(Boolean)
    .slice(0, maxCount);
}

function _teamBadgeFor(keyOrName) {
  const key = String(keyOrName || '').trim().toLowerCase();
  if (!key) return 'ðŸ';
  if (TEAM_BADGES[key]) return TEAM_BADGES[key];
  const byName = Object.keys(CRICKET_TEAMS).find(k => (CRICKET_TEAMS[k].name || '').toLowerCase() === key)
    || Object.keys(IPL_TEAMS).find(k => (IPL_TEAMS[k].name || '').toLowerCase() === key);
  if (byName && TEAM_BADGES[byName]) return TEAM_BADGES[byName];
  return 'ðŸ';
}

function renderTeamFlagPreview() {
  const userEl = document.getElementById('userTeamFlagPreview');
  const oppEl = document.getElementById('oppTeamFlagPreview');
  if (!userEl || !oppEl) return;

  const userName = Utils.getValue('team1') || 'Your Team';
  const oppKey = Utils.getValue('predefinedTeams');
  const oppName = oppKey && CRICKET_TEAMS[oppKey] ? CRICKET_TEAMS[oppKey].name : (Utils.getValue('team2') || 'Computer');

  userEl.textContent = `${_teamBadgeFor(userName)} ${userName}`;
  oppEl.textContent = `${_teamBadgeFor(oppKey || oppName)} ${oppName}`;
}

function _buildDraftPool() {
  const direct = _csvPlayers(Utils.getValue('team1Players'), 80);
  const pool = [];
  direct.forEach(p => { if (!pool.includes(p)) pool.push(p); });
  while (pool.length < 22) pool.push(`Reserve Player ${pool.length + 1}`);
  draftPoolPlayers = pool.slice(0, 22);
  if (!draftSelectedPlayers || !(draftSelectedPlayers instanceof Set)) draftSelectedPlayers = new Set();
  draftSelectedPlayers = new Set(Array.from(draftSelectedPlayers).filter(n => draftPoolPlayers.includes(n)).slice(0, 11));
}

function _renderDraftPanel() {
  const list = document.getElementById('playerDraftList');
  const count = document.getElementById('playerDraftCount');
  if (!list || !count) return;
  list.innerHTML = '';
  draftPoolPlayers.forEach(name => {
    const id = `draft_${name.replace(/[^a-z0-9]/gi, '_')}`;
    const wrap = document.createElement('label');
    wrap.style.cssText = 'display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:8px;font-size:13px;cursor:pointer';
    const checked = draftSelectedPlayers.has(name) ? 'checked' : '';
    wrap.innerHTML = `<input id="${id}" type="checkbox" ${checked} style="width:auto;margin:0" /> <span>${Security.escapeHtml(name)}</span>`;
    const cb = wrap.querySelector('input');
    cb.addEventListener('change', () => {
      if (cb.checked) {
        if (draftSelectedPlayers.size >= 11) {
          cb.checked = false;
          uiAlert('You can select only 11 players.', 'Playing XI');
          return;
        }
        draftSelectedPlayers.add(name);
      } else {
        draftSelectedPlayers.delete(name);
      }
      count.textContent = `Selected: ${draftSelectedPlayers.size}/11`;
    });
    list.appendChild(wrap);
  });
  count.textContent = `Selected: ${draftSelectedPlayers.size}/11`;
}

function togglePlayerDraftPanel() {
  const panel = document.getElementById('playerDraftPanel');
  if (!panel) return;
  const open = panel.style.display !== 'none';
  if (open) {
    panel.style.display = 'none';
    return;
  }
  _buildDraftPool();
  _renderDraftPanel();
  panel.style.display = 'block';
}

function autoPickPlayingXI() {
  if (!draftPoolPlayers.length) _buildDraftPool();
  draftSelectedPlayers = new Set();
  const shuffled = [...draftPoolPlayers].sort(() => Math.random() - 0.5).slice(0, 11);
  shuffled.forEach(p => draftSelectedPlayers.add(p));
  _renderDraftPanel();
}

async function applySelectedXI() {
  if (draftSelectedPlayers.size !== 11) {
    await uiAlert('Please select exactly 11 players.', 'Playing XI');
    return;
  }
  const selected = Array.from(draftSelectedPlayers);
  const t1 = document.getElementById('team1Players');
  if (t1) t1.value = selected.join(', ');
  const panel = document.getElementById('playerDraftPanel');
  if (panel) panel.style.display = 'none';
  showToast('Playing XI applied.', '#48bb78');
}

function updatePredefinedTeams(obj) {
  const s = Utils.getElement('predefinedTeams');
  if (!s) return;
  s.innerHTML = '<option value="">--Select Team--</option>';
  Object.keys(obj).forEach(k => {
    const o = document.createElement('option');
    const teamName = (CRICKET_TEAMS[k] && CRICKET_TEAMS[k].name) ? CRICKET_TEAMS[k].name : k.toUpperCase();
    o.value = k;
    o.textContent = `${_teamBadgeFor(k)} ${teamName}`;
    s.appendChild(o);
  });
}

function handleTeamSelection() {
  const k = Utils.getValue('predefinedTeams');
  if (!k) { renderTeamFlagPreview(); return; }
  const p = PREDEFINED_TEAMS[k];
  if (p) Utils.getElement('team2Players').value = p.join(', ');
  if (CRICKET_TEAMS[k] && Utils.getElement('team2')) Utils.getElement('team2').value = CRICKET_TEAMS[k].name;
  renderTeamFlagPreview();
}

function handleModeChange() {
  const m = Utils.getValue('matchMode');
  GameState.matchMode = m;

  if (m === 'tournament') {
    Utils.getElement('customMatchSetup').style.display = 'none';
    Utils.getElement('tournamentSetup').style.display = 'block';
  } else {
    Utils.getElement('customMatchSetup').style.display = 'block';
    Utils.getElement('tournamentSetup').style.display = 'none';
    const o = Utils.getElement('overs');
    const ov = { t20i: 4, odi: 10, test: 25, rct: 15 };
    if (ov[m]) {
      o.value = ov[m];
      o.disabled = true;
    } else {
      o.disabled = false;
    }
    updatePredefinedTeams(PREDEFINED_TEAMS);
    renderTeamFlagPreview();
  }
}

async function startGame() {
  GameState.isTournament = false;
  GameState.currentMatch = null;
  GameState.matchMode = 'custom';
  GameState.teamNames[0] = Security.sanitizeInput(Utils.getValue('team1')) || 'User Team';
  GameState.teamNames[1] = Security.sanitizeInput(Utils.getValue('team2')) || 'Computer';
  const ov = Security.validateNumber(Utils.getValue('overs'), 1, 50, 2);
  GameState.overs = ov;
  GameState.totalBallsPerInnings = ov * GameState.ballsPerOver;

  const userPlayers = _csvPlayers(Utils.getValue('team1Players'), 22);
  const oppPlayers = _csvPlayers(Utils.getValue('team2Players'), 22);

  if (userPlayers.length !== 11) {
    await uiAlert('User team must have exactly 11 players. Use "Select XI from 22".', 'Invalid Playing XI');
    return;
  }
  if (oppPlayers.length < 2) {
    await uiAlert('At least 2 players required for opponent team.', 'Invalid Team Setup');
    return;
  }

  GameState.teamPlayers[0] = userPlayers.slice(0, 11);
  GameState.teamPlayers[1] = oppPlayers.slice(0, 11);

  GameState.reset();
  initializeStats();
  showSection('game');

  await TossAnim.show('ðŸ', 'Match About to Begin!',
    `${GameState.teamNames[0]} vs ${GameState.teamNames[1]}`,
    `${GameState.overs} overs per side`
  );

  await performToss();
  Utils.getElement('resultBox').style.display = 'none';
  Utils.log(GameState.teamNames[Utils.getBattingTeamIndex(0)] + ' batting first!');
  updateBowlerOptions();
  updateUI();
}

function _resolveUserFlagGlyph() {
  if (GameState.isTournament && TournamentState.userTeam) return _teamBadgeFor(TournamentState.userTeam);
  const userName = GameState.teamNames[GameState.userTeamIndex] || Utils.getValue('team1');
  return _teamBadgeFor(userName);
}

const _finishMatchOriginal = finishMatch;
finishMatch = function(resultText, resultType) {
  let outcome = 'draw';
  if (resultType === 'win') {
    outcome = String(resultText || '').includes(GameState.teamNames[GameState.userTeamIndex]) ? 'won' : 'lost';
  }
  _finishMatchOriginal(resultText, resultType);
  const isWin = outcome === 'won';
  if (typeof showMatchOutcomeAnimation === 'function') showMatchOutcomeAnimation(isWin, resultText || '');
  if (isWin && typeof showWinFlagBackdrop === 'function') showWinFlagBackdrop(_resolveUserFlagGlyph());
};

document.addEventListener('DOMContentLoaded', () => {
  ['team1', 'team2', 'predefinedTeams'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', renderTeamFlagPreview);
    if (el && id === 'predefinedTeams') el.addEventListener('change', renderTeamFlagPreview);
  });
  const t1p = document.getElementById('team1Players');
  if (t1p) t1p.addEventListener('change', () => {
    draftPoolPlayers = [];
    draftSelectedPlayers = new Set();
  });
  renderTeamFlagPreview();
});

window.togglePlayerDraftPanel = togglePlayerDraftPanel;
window.autoPickPlayingXI = autoPickPlayingXI;
window.applySelectedXI = applySelectedXI;
window.handleModeChange = handleModeChange;
window.handleTeamSelection = handleTeamSelection;
window.startGame = startGame;




















