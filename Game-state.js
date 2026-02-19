// Hand Cricket - JavaScript Part 2: Game Logic & State Management
// Version 3.4.0 - FULLY FIXED EDITION

'use strict';

// ============================================================================
// GAME STATE
// ============================================================================
const GameState = {
  teamNames:["",""],
  teamPlayers:[[],[]],
  overs:2,
  ballsPerOver:6,
  totalBallsPerInnings:0,
  matchMode:'custom',
  currentInnings:0,
  striker:0,
  nonStriker:1,
  currentBowler:null,
  lastBowler:null,
  scores:[0,0,0,0],
  wickets:[0,0,0,0],
  ballsBowled:[0,0,0,0],
  targets:[null,null,null,null],
  batsmenStats:[[],[],[],[]],
  ballByBall:[[],[],[],[]],
  bowlerStats:[[],[]],
  userTeamIndex:0,
  compTeamIndex:1,
  userBattingFirst:true,
  tossWinner:null,
  dayOvers:25,
  maxDays:5,
  totalMatchBalls:0,
  recentUserRuns:[],
  lastBattingRuns:[],
  bannedRuns:[],
  bannedCounter:{},
  lastBowlingRuns:[],
  lastUserInputs:[],
  overKillMode:false,
  killOverNumber:null,
  celebrationQueue:[],
  celebrationInProgress:false,
  isTournament:false,
  currentMatch:null,
  _matchHattricks:0,
  _matchCenturies:0,
  _matchFifties:0,
  _matchThreeWickets:0,   // ✅ FIX #1: ADDED
  _matchFiveWickets:0,    // ✅ FIX #1: ADDED
  _matchTenWickets:0,     // ✅ FIX #1: ADDED
  
  get totalMatchBallsLimit(){
    return this.dayOvers*this.maxDays*this.ballsPerOver;
  },
  
  reset(){
    this.currentInnings=0;
    this.striker=0;
    this.nonStriker=1;
    this.currentBowler=null;
    this.lastBowler=null;
    this.totalMatchBalls=0;
    this.scores=[0,0,0,0];
    this.wickets=[0,0,0,0];
    this.ballsBowled=[0,0,0,0];
    this.targets=[null,null,null,null];
    this.batsmenStats=[[],[],[],[]];
    this.ballByBall=[[],[],[],[]];
    this.bowlerStats=[[],[]];
    this.recentUserRuns=[];
    this.lastBattingRuns=[];
    this.bannedRuns=[];
    this.bannedCounter={};
    this.lastBowlingRuns=[];
    this.lastUserInputs=[];
    this.overKillMode=false;
    this.killOverNumber=null;
    this.celebrationQueue=[];
    this.celebrationInProgress=false;
    this._matchHattricks=0;
    this._matchCenturies=0;
    this._matchFifties=0;
    this._matchThreeWickets=0;  // ✅ FIX #1: ADDED
    this._matchFiveWickets=0;   // ✅ FIX #1: ADDED
    this._matchTenWickets=0;    // ✅ FIX #1: ADDED
  }
};

// ============================================================================
// TOURNAMENT STATE
// ============================================================================
const TournamentState = {
  userTeam:null,
  format:null,
  matchOvers:10,
  remainingTeamsForQualifier:[],
  _slotId:null,
  _startDate:null,
  challengeLeague:{groupA:[],groupB:[],matchesA:[],matchesB:[],standingsA:{},standingsB:{}},
  super6:{teams:[],matches:[],standings:{}},
  qualifier:{groupA:[],groupB:[],matchesA:[],matchesB:[],standingsA:{},standingsB:{}},
  worldCup:{teams:[],matches:[],standings:{},semiFinals:[],final:null},
  wtc:{teams:[],standings:{},allMatches:[],seriesProgress:{},final:null},
  ipl:{teams:[],standings:{},roundRobinMatches:[],eliminator1:null,eliminator2:null,eliminator3:null,final:null},
  userStats:{
    playerInnings:{},
    players:{},
    highestScore:{runs:0,player:'',match:''},
    bestBowling:{wickets:0,runs:999,player:'',match:''},
    centuries:[],
    fifties:[],
    hatTricks:[],
    threeWickets:[],
    fiveWickets:[],
    tenWickets:[]
  },
  currentStage:'challengeLeague',
  currentPhase:'groupA',
  
  reset(){
    this.remainingTeamsForQualifier=[];
    this._slotId=null;
    this._startDate=null;
    this.challengeLeague={groupA:[],groupB:[],matchesA:[],matchesB:[],standingsA:{},standingsB:{}};
    this.super6={teams:[],matches:[],standings:{}};
    this.qualifier={groupA:[],groupB:[],matchesA:[],matchesB:[],standingsA:{},standingsB:{}};
    this.worldCup={teams:[],matches:[],standings:{},semiFinals:[],final:null};
    this.wtc={teams:[],standings:{},allMatches:[],seriesProgress:{},final:null};
    this.ipl={teams:[],standings:{},roundRobinMatches:[],eliminator1:null,eliminator2:null,eliminator3:null,final:null};
    this.userStats={
      playerInnings:{},
      players:{},
      highestScore:{runs:0,player:'',match:''},
      bestBowling:{wickets:0,runs:999,player:'',match:''},
      centuries:[],
      fifties:[],
      hatTricks:[],
      threeWickets:[],
      fiveWickets:[],
      tenWickets:[]
    };
    this.currentStage='challengeLeague';
    this.currentPhase='groupA';
  }
};

// ============================================================================
// AI
// ============================================================================
const AI = {
  getSmartBattingRun(){
    let opts=[3,4,5,6].filter(r=>!GameState.bannedRuns.includes(r));
    if(GameState.lastBattingRuns.length>=2){
      const l=GameState.lastBattingRuns[GameState.lastBattingRuns.length-1];
      const s=GameState.lastBattingRuns[GameState.lastBattingRuns.length-2];
      if(l===s) opts=opts.filter(r=>r!==l);
    }
    if(!opts.length) opts=[3,4,5,6];
    const run=opts[Math.floor(Math.random()*opts.length)];
    GameState.lastBattingRuns.push(run);
    if(GameState.lastBattingRuns.length>3) GameState.lastBattingRuns.shift();
    Object.keys(GameState.bannedCounter).forEach(r=>{
      GameState.bannedCounter[r]--;
      if(GameState.bannedCounter[r]<=0){
        GameState.bannedRuns=GameState.bannedRuns.filter(x=>x!=r);
        delete GameState.bannedCounter[r];
      }
    });
    return run;
  },
  
  banRunAfterWicket(run){
    if(!GameState.bannedRuns.includes(run)){
      GameState.bannedRuns.push(run);
      GameState.bannedCounter[run]=4;
    }
  },
  
  getSmartBowlingRun(){
    return Math.floor(Math.random()*7);
  }
};

// ============================================================================
// CELEBRATION SYSTEM
// ============================================================================
const Celebration = {
  add(msg){
    GameState.celebrationQueue.push(msg);
    if(!GameState.celebrationInProgress) this.displayNext();
  },
  
  displayNext(){
    if(!GameState.celebrationQueue.length){
      GameState.celebrationInProgress=false;
      return;
    }
    GameState.celebrationInProgress=true;
    const ov=Utils.getElement('celebrationOverlay');
    const tx=Utils.getElement('celebrationText');
    const msg=GameState.celebrationQueue.shift();
    if(ov&&tx){
      tx.textContent=msg;
      ov.style.display='flex';
      setTimeout(()=>{
        ov.style.display='none';
        setTimeout(()=>this.displayNext(),300);
      },2500);
    }
  },
  
  enqueueAndPlay(q,cb){
    if(q&&q.length){
      q.forEach(m=>GameState.celebrationQueue.push(m));
      if(!GameState.celebrationInProgress) this.displayNext();
      if(cb){
        const t=setInterval(()=>{
          if(!GameState.celebrationInProgress&&!GameState.celebrationQueue.length){
            clearInterval(t);
            cb();
          }
        },200);
      }
    } else if(cb) cb();
  }
};

// ============================================================================
// TOSS ANIMATION
// ============================================================================
const TossAnim = {
  _resolve: null,
  
  show(icon, title, msg, sub) {
    return new Promise(resolve => {
      this._resolve = resolve;
      document.getElementById('tossIcon').textContent = icon;
      document.getElementById('tossTitle').textContent = title;
      document.getElementById('tossMsg').textContent = msg;
      document.getElementById('tossSubMsg').textContent = sub || '';
      const row = document.getElementById('tossChoiceRow');
      row.innerHTML = '<button class="toss-choice-btn ok" onclick="TossAnim.dismiss()">OK ✓</button>';
      document.getElementById('tossOverlay').classList.add('show');
    });
  },
  
  choose(icon, title, msg, sub, choices) {
    return new Promise(resolve => {
      this._resolve = resolve;
      document.getElementById('tossIcon').textContent = icon;
      document.getElementById('tossTitle').textContent = title;
      document.getElementById('tossMsg').textContent = msg;
      document.getElementById('tossSubMsg').textContent = sub || '';
      const row = document.getElementById('tossChoiceRow');
      row.innerHTML = choices.map(c =>
        `<button class="toss-choice-btn ${Security.escapeHtml(c.cls)}" onclick="TossAnim.pick('${Security.escapeHtml(c.value)}')">${Security.escapeHtml(c.label)}</button>`
      ).join('');
      document.getElementById('tossOverlay').classList.add('show');
    });
  },
  
  dismiss() {
    document.getElementById('tossOverlay').classList.remove('show');
    if (this._resolve) { 
      const r = this._resolve; 
      this._resolve = null; 
      r(true); 
    }
  },
  
  pick(value) {
    document.getElementById('tossOverlay').classList.remove('show');
    if (this._resolve) { 
      const r = this._resolve; 
      this._resolve = null; 
      r(value); 
    }
  }
};

// ============================================================================
// CORE GAME FUNCTIONS
// ============================================================================
async function performToss(){
  GameState.tossWinner = Math.random() < 0.5 ? GameState.userTeamIndex : GameState.compTeamIndex;
  const winner = GameState.teamNames[GameState.tossWinner];
  let decision;
  
  if (GameState.tossWinner === GameState.userTeamIndex) {
    decision = await TossAnim.choose('🪙','You Won the Toss!', winner+' won the toss!', 'What would you like to do?', [
      {label:'🏏 Bat First',value:'bat',cls:'bat'},
      {label:'🎳 Bowl First',value:'bowl',cls:'bowl'}
    ]);
    GameState.userBattingFirst = (decision === 'bat');
  } else {
    decision = Math.random() < 0.5 ? 'bat' : 'bowl';
    GameState.userBattingFirst = (decision === 'bowl');
    await TossAnim.show('🪙','Toss Lost!', `${winner} won the toss and chose to ${decision} first.`, 'Get ready!');
  }
  
  Utils.log(winner + ' won the toss and chose to ' + decision + ' first.');
}

function initializeStats(){
  for(let i=0;i<4;i++){
    GameState.batsmenStats[i]=[];
    for(let p=0;p<11;p++){
      GameState.batsmenStats[i].push({
        runs:0,
        balls:0,
        fiftyShown:false,
        hundredShown:false
      });
    }
  }
  
  for(let t=0;t<2;t++){
    GameState.bowlerStats[t]=[];
    for(let j=0;j<11;j++){
      GameState.bowlerStats[t].push({
        name:GameState.teamPlayers[t][j]||`Bowler ${j+1}`,
        runs:0,
        balls:0,
        wickets:0,
        hatTrickShown:false,
        threeWktShown:false,     // ✅ Already correct
        fiveWktShown:false,      // ✅ Already correct
        tenWktShown:false,       // ✅ Already correct
        consecutiveWickets:0
      });
    }
  }
}

function updateBowlerOptions(){
  const sel=Utils.getElement('bowlerSelect');
  if(!sel)return;
  const bt=1-Utils.getBattingTeamIndex();
  sel.innerHTML='';
  GameState.bowlerStats[bt].forEach((b,i)=>{
    const o=document.createElement('option');
    o.value=i;
    o.textContent=b.name;
    sel.appendChild(o);
  });
  sel.disabled=GameState.currentBowler!==null;
  if(GameState.currentBowler!==null) sel.value=GameState.currentBowler;
  Utils.toggleButtons('.number-buttons button',GameState.currentBowler!==null);
}

function handleBowlerSelection(){
  const v=Utils.getValue('bowlerSelect');
  const idx=Security.validateNumber(v,0,10,null);
  if(idx===null)return;
  if(idx===GameState.lastBowler){
    alert('Same bowler cannot bowl consecutive overs.');
    Utils.getElement('bowlerSelect').value='';
    return;
  }
  GameState.currentBowler=idx;
  Utils.getElement('bowlerSelect').disabled=true;
  Utils.toggleButtons('.number-buttons button',true);
  updateUI();
}

function updateUI(){
  const b=GameState.ballsBowled[GameState.currentInnings];
  const oc=Math.floor(b/GameState.ballsPerOver);
  const bi=b%GameState.ballsPerOver;
  const bti=Utils.getBattingTeamIndex();
  const pn=GameState.teamPlayers[bti];
  const ss=GameState.batsmenStats[GameState.currentInnings][GameState.striker]||{runs:0,balls:0};
  const ns=GameState.batsmenStats[GameState.currentInnings][GameState.nonStriker]||{runs:0,balls:0};
  
  Utils.setText('batsmenStatus','🏏 On Strike: '+(pn[GameState.striker]||'Batsman '+(GameState.striker+1))+' ('+ss.runs+' - '+ss.balls+') | Non-striker: '+(pn[GameState.nonStriker]||'Batsman '+(GameState.nonStriker+1))+' ('+ns.runs+' - '+ns.balls+')');
  Utils.setText('scoreDisplay',GameState.scores[GameState.currentInnings]+'/'+GameState.wickets[GameState.currentInnings]);
  Utils.setText('oversDisplay',oc+'.'+bi);
  
  if(GameState.targets[GameState.currentInnings]){
    Utils.setText('targetDisplay',(GameState.targets[GameState.currentInnings]-GameState.scores[GameState.currentInnings])+' runs');
  } else {
    Utils.setText('targetDisplay','-');
  }
  
  let bl='Balls: '+GameState.ballByBall[GameState.currentInnings].join(', ');
  if(GameState.targets[GameState.currentInnings]){
    bl+=' | Target: '+GameState.targets[GameState.currentInnings]+' | Need: '+(GameState.targets[GameState.currentInnings]-GameState.scores[GameState.currentInnings]);
  }
  Utils.setText('ballLog',bl);
  
  let bs='Bowler Stats: ';
  if(GameState.currentBowler!==null){
    const bt2=1-Utils.getBattingTeamIndex();
    const bow=GameState.bowlerStats[bt2][GameState.currentBowler];
    bs+=bow.name+': '+Math.floor(bow.balls/6)+'.'+bow.balls%6+' ov, '+bow.runs+'r, '+bow.wickets+'w';
  } else {
    bs+='No bowler selected.';
  }
  Utils.setText('bowlerStats',bs);
  
  const cb=GameState.totalMatchBalls;
  const cd=Math.floor(cb/(GameState.dayOvers*GameState.ballsPerOver))+1;
  Utils.setText('dayOversDisplay','Day '+cd+' | Over '+Math.floor(cb/GameState.ballsPerOver)+'.'+cb%GameState.ballsPerOver);
  
  const declBtn=Utils.getElement('declareBtn');
  if(declBtn){
    const canDeclare = GameState.matchMode==='test' && 
                       Utils.getBattingTeamIndex()===GameState.userTeamIndex && 
                       GameState.currentInnings<=2 && 
                       GameState.currentBowler!==null && 
                       Utils.getElement('continueDayBtn').style.display==='none';
    declBtn.style.display = canDeclare ? 'inline-block' : 'none';
  }
}

// ============================================================================
// PLAY BALL - ALREADY CORRECT IN PART 2!
// ============================================================================
function playBall(userRun){
  if(GameState.currentBowler===null){
    alert('Select a bowler first.');
    return;
  }
  if(Utils.getElement('continueDayBtn').style.display!=='none'){
    alert('Day ended. Click Continue Next Day.');
    return;
  }
  
  const bti=Utils.getBattingTeamIndex();
  const bwi=1-bti;
  const si=GameState.striker;
  const ss=GameState.batsmenStats[GameState.currentInnings][si];
  const bow=GameState.bowlerStats[bwi][GameState.currentBowler];
  const isComp=(bti===GameState.compTeamIndex);
  
  let batsRun=0, out=false;
  
  if(isComp){
    batsRun=AI.getSmartBattingRun();
    out=(userRun===batsRun);
  } else {
    batsRun=userRun;
    const cd=AI.getSmartBowlingRun();
    out=(batsRun===cd);
    GameState.recentUserRuns.push(batsRun);
    if(GameState.recentUserRuns.length>5) GameState.recentUserRuns.shift();
  }
  
  GameState.ballsBowled[GameState.currentInnings]++;
  GameState.totalMatchBalls++;
  bow.balls++;
  
  const q=[];
  
  if(out){
    ss.balls++;
    GameState.wickets[GameState.currentInnings]++;
    bow.wickets++;
    bow.consecutiveWickets=(bow.consecutiveWickets||0)+1;
    
    const pn=GameState.teamPlayers[bti][GameState.striker]||'Batsman '+(GameState.striker+1);
    Utils.log(pn+' is OUT!');
    GameState.striker=GameState.wickets[GameState.currentInnings]+1;
    q.push('🎯 WICKET!');
    Music.playSFX('wicket');
    
    if(bow.consecutiveWickets===3&&!bow.hatTrickShown){
      bow.hatTrickShown=true;
      q.push('🎩 HAT-TRICK by '+bow.name+'!');
      if(bwi===GameState.userTeamIndex){
        GameState._matchHattricks++;
        if(GameState.isTournament){
          TournamentState.userStats.hatTricks.push({
            player:bow.name,
            match:GameState.teamNames[0]+' vs '+GameState.teamNames[1]
          });
        }
      }
    }
    
    // ✅ Bowling milestones - already correct!
    if(!bow.threeWktShown&&bow.wickets>=3){
      bow.threeWktShown=true;
      q.push('🔥 3-WICKET HAUL by '+bow.name+'!');
      if(bwi===GameState.userTeamIndex){
        GameState._matchThreeWickets++;  // ✅ Now works because GameState has this field
        if(GameState.isTournament){
          TournamentState.userStats.threeWickets.push({
            player:bow.name,
            wickets:bow.wickets,
            runs:bow.runs,
            match:GameState.teamNames[0]+' vs '+GameState.teamNames[1]
          });
        }
      }
    }
    
    if(!bow.fiveWktShown&&bow.wickets>=5){
      bow.fiveWktShown=true;
      q.push('🔥🔥 5-WICKET HAUL by '+bow.name+'!');
      if(bwi===GameState.userTeamIndex){
        GameState._matchFiveWickets++;  // ✅ Now works because GameState has this field
        if(GameState.isTournament){
          TournamentState.userStats.fiveWickets.push({
            player:bow.name,
            wickets:bow.wickets,
            runs:bow.runs,
            match:GameState.teamNames[0]+' vs '+GameState.teamNames[1]
          });
        }
      }
    }
    
    if(!bow.tenWktShown&&bow.wickets>=10){
      bow.tenWktShown=true;
      q.push('💥 10-WICKET HAUL by '+bow.name+'!');
      if(bwi===GameState.userTeamIndex){
        GameState._matchTenWickets++;  // ✅ Now works because GameState has this field
        if(GameState.isTournament){
          TournamentState.userStats.tenWickets.push({
            player:bow.name,
            wickets:bow.wickets,
            runs:bow.runs,
            match:GameState.teamNames[0]+' vs '+GameState.teamNames[1]
          });
        }
      }
    }
    
    if(isComp) AI.banRunAfterWicket(userRun);
  } else {
    // NOT OUT - Update stats FIRST before checking target (✅ Already correct!)
    GameState.batsmenStats[GameState.currentInnings][si].runs+=batsRun;
    GameState.batsmenStats[GameState.currentInnings][si].balls++;
    GameState.scores[GameState.currentInnings]+=batsRun;
    bow.runs+=batsRun;  // ✅ CRITICAL: Already updated BEFORE target check
    bow.consecutiveWickets=0;
    
    // Check for target AFTER updating all stats (✅ Already correct!)
    if(GameState.targets[GameState.currentInnings] && 
       GameState.scores[GameState.currentInnings]>=GameState.targets[GameState.currentInnings]){
      GameState.ballByBall[GameState.currentInnings].push(batsRun);
      
      // Check for milestones on winning run (✅ Already correct!)
      const bst=GameState.batsmenStats[GameState.currentInnings][si];
      const bpn=GameState.teamPlayers[bti][si]||'Batsman '+(si+1);
      
      if(bst.runs>=50&&!bst.fiftyShown){
        bst.fiftyShown=true;
        q.push('🏏 '+bpn+' reaches FIFTY!');
        if(bti===GameState.userTeamIndex){
          GameState._matchFifties++;
          if(GameState.isTournament){
            TournamentState.userStats.fifties.push({
              player:bpn,
              runs:bst.runs,
              balls:bst.balls,
              match:GameState.teamNames[0]+' vs '+GameState.teamNames[1]
            });
          }
        }
      }
      
      if(bst.runs>=100&&!bst.hundredShown){
        bst.hundredShown=true;
        q.push('🏏 '+bpn+' reaches CENTURY!');
        if(bti===GameState.userTeamIndex){
          GameState._matchCenturies++;
          if(GameState.isTournament){
            TournamentState.userStats.centuries.push({
              player:bpn,
              runs:bst.runs,
              balls:bst.balls,
              match:GameState.teamNames[0]+' vs '+GameState.teamNames[1]
            });
          }
        }
      }
      
      if(batsRun===6){q.push('💥 SIX!');Music.playSFX('six');}
      else if(batsRun===4){q.push('🎯 FOUR!');Music.playSFX('four');}
      
      updateUI();
      Celebration.enqueueAndPlay(q,endInnings);
      return;
    }
    
    // Change strike if odd runs
    if(batsRun===1||batsRun===3||batsRun===5){
      [GameState.striker,GameState.nonStriker]=[GameState.nonStriker,GameState.striker];
    }
    
    // Check milestones (non-winning runs)
    const bst=GameState.batsmenStats[GameState.currentInnings][si];
    const bpn=GameState.teamPlayers[bti][si]||'Batsman '+(si+1);
    
    if(bst.runs>=50&&!bst.fiftyShown){
      bst.fiftyShown=true;
      q.push('🏏 '+bpn+' reaches FIFTY!');
      if(bti===GameState.userTeamIndex){
        GameState._matchFifties++;
        if(GameState.isTournament){
          TournamentState.userStats.fifties.push({
            player:bpn,
            runs:bst.runs,
            balls:bst.balls,
            match:GameState.teamNames[0]+' vs '+GameState.teamNames[1]
          });
        }
      }
    }
    
    if(bst.runs>=100&&!bst.hundredShown){
      bst.hundredShown=true;
      q.push('🏏 '+bpn+' reaches CENTURY!');
      if(bti===GameState.userTeamIndex){
        GameState._matchCenturies++;
        if(GameState.isTournament){
          TournamentState.userStats.centuries.push({
            player:bpn,
            runs:bst.runs,
            balls:bst.balls,
            match:GameState.teamNames[0]+' vs '+GameState.teamNames[1]
          });
        }
      }
    }
    
    if(batsRun===6){q.push('💥 SIX!');Music.playSFX('six');}
    else if(batsRun===4){q.push('🎯 FOUR!');Music.playSFX('four');}
  }
  
  GameState.ballByBall[GameState.currentInnings].push(out?'W':batsRun);
  updateUI();
  
  // Test match specific checks
  if(GameState.matchMode==='test'){
    if(GameState.wickets[GameState.currentInnings]>=10){
      Celebration.enqueueAndPlay(q,endInnings);
      return;
    }
    
    if(GameState.totalMatchBalls%(GameState.dayOvers*GameState.ballsPerOver)===0 && 
       GameState.totalMatchBalls<GameState.totalMatchBallsLimit){
      const d=Math.floor((GameState.totalMatchBalls-1)/(GameState.dayOvers*GameState.ballsPerOver))+1;
      Utils.log('--- Stumps: Day '+d+' Ends ---');
      Utils.toggleButtons('.number-buttons button',false);
      Utils.getElement('bowlerSelect').disabled=true;
      Utils.getElement('continueDayBtn').style.display='inline-block';
      return;
    }
    
    if(GameState.totalMatchBalls>=GameState.totalMatchBallsLimit){
      Celebration.enqueueAndPlay(q,()=>finishMatch('Match Drawn - Time limit reached','draw'));
      return;
    }
  }
  
  // Over completion
  if(GameState.ballsBowled[GameState.currentInnings]%GameState.ballsPerOver===0){
    [GameState.striker,GameState.nonStriker]=[GameState.nonStriker,GameState.striker];
    GameState.lastBowler=GameState.currentBowler;
    const bwTi=1-bti;
    
    if(bwTi===GameState.compTeamIndex){
      let nb;
      do{
        nb=Math.floor(Math.random()*GameState.teamPlayers[bwTi].length);
      } while(nb===GameState.lastBowler&&GameState.teamPlayers[bwTi].length>1);
      GameState.currentBowler=nb;
      Utils.getElement('bowlerSelect').value=nb;
      Utils.getElement('bowlerSelect').disabled=true;
      Utils.toggleButtons('.number-buttons button',true);
    } else {
      GameState.currentBowler=null;
      Utils.getElement('bowlerSelect').disabled=false;
      Utils.toggleButtons('.number-buttons button',false);
      Utils.log('End of over. Select next bowler.');
    }
  }
  
  // Check for innings end
  if(GameState.wickets[GameState.currentInnings]>=10 || 
     (GameState.ballsBowled[GameState.currentInnings]>=GameState.totalBallsPerInnings && GameState.matchMode!=='test')){
    Celebration.enqueueAndPlay(q,endInnings);
    return;
  }
  
  Celebration.enqueueAndPlay(q);
}

function continueNextDay(){
  GameState.currentBowler=null;
  GameState.lastBowler=null;
  Utils.getElement('bowlerSelect').disabled=false;
  Utils.toggleButtons('.number-buttons button',false);
  Utils.getElement('continueDayBtn').style.display='none';
  const nd=Math.floor(GameState.totalMatchBalls/(GameState.dayOvers*GameState.ballsPerOver))+1;
  Utils.log('--- Day '+nd+' begins ---');
  updateUI();
}

function declareBattingInnings(){
  if(GameState.matchMode!=='test') return;
  if(Utils.getBattingTeamIndex()!==GameState.userTeamIndex) return;
  
  TossAnim.show('🏳️','Declaration!',
    GameState.teamNames[GameState.userTeamIndex]+' declare on '+GameState.scores[GameState.currentInnings]+'/'+GameState.wickets[GameState.currentInnings],
    'Good luck with the bowling!'
  ).then(()=>{
    Utils.log(GameState.teamNames[GameState.userTeamIndex]+' DECLARED on '+GameState.scores[GameState.currentInnings]+'/'+GameState.wickets[GameState.currentInnings]+'!');
    endInnings();
  });
}

console.log('✅ Part 2 FIXED loaded: Game logic initialized with bowling milestone counters');