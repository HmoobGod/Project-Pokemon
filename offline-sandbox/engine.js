/* Original, asset-free offline solo sandbox; NOT authentic PokéBonk rules. */
(function(root){
  'use strict';
  const W=960,H=540,MAX_ENEMIES=48,MAX_SHOTS=96,DURATION=60;
  const bound=(x,min,max)=>Math.max(min,Math.min(max,x));
  const distanceSquared=(a,b)=>(a.x-b.x)**2+(a.y-b.y)**2;
  const finite=(n)=>typeof n==='number'&&Number.isFinite(n);
  function createGame(seed=1){
    if(!Number.isSafeInteger(seed)||seed<0)throw new Error('Invalid demo seed');
    return {phase:'ready',time:0,seed:seed>>>0,player:{x:W/2,y:H/2,hp:100},
      enemies:[],shots:[],nextEnemyId:1,spawnClock:0,attackClock:0,kills:0,
      /** No PokéBonk progression, currency, rewards or account writes. */
      rewards:0};
  }
  function start(s){
    if(s.phase==='ready'||s.phase==='finished') {
      const reset=createGame(s.seed);
      Object.assign(s,reset);
      s.phase='running';
    }else if(s.phase==='paused')s.phase='running';
    return s;
  }
  function pause(s){if(s.phase==='running')s.phase='paused';return s;}
  function random(s){
    let x=s.seed||0x6d2b79f5;
    x^=x<<13;x^=x>>>17;x^=x<<5;
    s.seed=x>>>0;
    return s.seed/4294967296;
  }
  function spawnEnemy(s){
    if(s.enemies.length>=MAX_ENEMIES)return;
    const edge=Math.floor(random(s)*4);
    const a=random(s);
    const x=edge===0?0:edge===1?W:a*W;
    const y=edge===2?0:edge===3?H:a*H;
    s.enemies.push({id:s.nextEnemyId++,x,y,hp:2});
  }
  function step(s,input={x:0,y:0},dt=1/60){
    if(s.phase!=='running')return s;
    if(!finite(dt)||dt<0)throw new Error('Invalid demo timestep');
    const elapsed=bound(dt,0,0.05);
    const ix=finite(input.x)?bound(input.x,-1,1):0;
    const iy=finite(input.y)?bound(input.y,-1,1):0;
    const mag=Math.hypot(ix,iy)||1;
    s.player.x=bound(s.player.x+ix/mag*190*elapsed,14,W-14);
    s.player.y=bound(s.player.y+iy/mag*190*elapsed,14,H-14);
    s.time+=elapsed;
    s.spawnClock+=elapsed;
    if(s.spawnClock>=0.85){
      s.spawnClock-=0.85;
      spawnEnemy(s);
    }
    s.attackClock+=elapsed;
    if(s.attackClock>=0.32&&s.shots.length<MAX_SHOTS&&s.enemies.length){
      const closest=s.enemies.reduce((a,b)=>
        distanceSquared(a,s.player)<distanceSquared(b,s.player)?a:b);
      const dx=closest.x-s.player.x,dy=closest.y-s.player.y;
      const dist=Math.hypot(dx,dy)||1;
      if(dist<350){
        s.shots.push({x:s.player.x,y:s.player.y,vx:dx/dist*390,vy:dy/dist*390,life:1.15});
        s.attackClock=0;
      }
    }
    for(const enemy of s.enemies){
      const dx=s.player.x-enemy.x,dy=s.player.y-enemy.y;
      const mag=Math.hypot(dx,dy)||1;
      enemy.x+=dx/mag*58*elapsed;enemy.y+=dy/mag*58*elapsed;
      if(distanceSquared(enemy,s.player)<24*24)s.player.hp-=17*elapsed;
    }
    const surviving=[];
    for(const shot of s.shots){
      shot.x+=shot.vx*elapsed;shot.y+=shot.vy*elapsed;shot.life-=elapsed;
      let hit=false;
      for(const enemy of s.enemies){
        if(enemy.hp>0&&distanceSquared(shot,enemy)<19*19){
          enemy.hp--;hit=true;break;
        }
      }
      if(!hit&&shot.life>0&&shot.x>=0&&shot.x<=W&&shot.y>=0&&shot.y<=H)
        surviving.push(shot);
    }
    s.shots=surviving;
    const alive=[];
    for(const enemy of s.enemies){
      if(enemy.hp<=0)s.kills++;
      else alive.push(enemy);
    }
    s.enemies=alive;
    if(s.player.hp<=0){s.player.hp=0;s.phase='finished';}
    else if(s.time>=DURATION){s.time=DURATION;s.phase='finished';}
    return s;
  }
  root.PokeBonkOfflineDemo=Object.freeze({WIDTH:W,HEIGHT:H,DURATION,
    MAX_ENEMIES,MAX_SHOTS,createGame,start,pause,step});
})(globalThis);
