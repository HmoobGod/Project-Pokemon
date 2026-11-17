/* All resources are packaged locally. No account, API or save access. */
(function(){
  'use strict';
  const G=globalThis.PokeBonkOfflineDemo;
  if(!G)throw new Error('Missing local demo engine');
  const canvas=document.getElementById('arena'),ctx=canvas.getContext('2d');
  const status=document.getElementById('status'),start=document.getElementById('start'),
    pause=document.getElementById('pause');
  if(!ctx)throw new Error('Canvas is not available');
  const keys=new Set(),stick={id:null,x:0,y:0,startX:0,startY:0};
  let game=G.createGame(1),last=0;
  function buttonState(){
    start.textContent=game.phase==='ready'?'Start offline demo':'Restart demo';
    pause.textContent=game.phase==='paused'?'Resume':'Pause';
    pause.disabled=game.phase==='ready'||game.phase==='finished';
  }
  start.addEventListener('click',()=>{
    game=G.createGame(1);G.start(game);buttonState();
  });
  pause.addEventListener('click',()=>{
    if(game.phase==='paused')G.start(game);
    else G.pause(game);
    buttonState();
  });
  addEventListener('keydown',e=>{
    const k=e.key.toLowerCase();
    if(['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'].includes(k)){
      keys.add(k);e.preventDefault();
    }
    if(k===' '&&e.target===document.body){
      if(game.phase==='paused')G.start(game);else G.pause(game);
      buttonState();e.preventDefault();
    }
  });
  addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  addEventListener('blur',()=>{keys.clear();stick.id=null;stick.x=0;stick.y=0;G.pause(game);buttonState();});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){G.pause(game);buttonState();}
  });
  function coords(e){
    const box=canvas.getBoundingClientRect();
    return {x:(e.clientX-box.left)/box.width*G.WIDTH,
      y:(e.clientY-box.top)/box.height*G.HEIGHT};
  }
  canvas.addEventListener('pointerdown',e=>{
    if(stick.id!==null||game.phase!=='running')return;
    const p=coords(e);
    if(p.x>G.WIDTH/2)return;
    e.preventDefault();stick.id=e.pointerId;
    stick.startX=p.x;stick.startY=p.y;stick.x=0;stick.y=0;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove',e=>{
    if(stick.id!==e.pointerId)return;
    const p=coords(e),dx=p.x-stick.startX,dy=p.y-stick.startY;
    const m=Math.max(1,Math.hypot(dx,dy));
    stick.x=dx/Math.max(52,m);stick.y=dy/Math.max(52,m);
    e.preventDefault();
  });
  function lift(e){if(stick.id!==e.pointerId)return;stick.id=null;stick.x=0;stick.y=0;}
  canvas.addEventListener('pointerup',lift);
  canvas.addEventListener('pointercancel',lift);
  function input(){
    return {
      x:Math.max(-1,Math.min(1,stick.x+Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft')))),
      y:Math.max(-1,Math.min(1,stick.y+Number(keys.has('s')||keys.has('arrowdown'))-Number(keys.has('w')||keys.has('arrowup')))),
    };
  }
  function draw(){
    ctx.fillStyle='#10172a';ctx.fillRect(0,0,G.WIDTH,G.HEIGHT);
    ctx.strokeStyle='#1d2942';ctx.lineWidth=1;
    for(let x=0;x<G.WIDTH;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,G.HEIGHT);ctx.stroke();}
    for(let y=0;y<G.HEIGHT;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(G.WIDTH,y);ctx.stroke();}
    for(const enemy of game.enemies){
      ctx.beginPath();ctx.fillStyle='#f87171';ctx.arc(enemy.x,enemy.y,13,0,2*Math.PI);ctx.fill();
      ctx.fillStyle='#fcdddd';ctx.fillRect(enemy.x-9,enemy.y-19,18*Math.max(0,enemy.hp)/2,3);
    }
    for(const shot of game.shots){
      ctx.beginPath();ctx.fillStyle='#fde68a';ctx.arc(shot.x,shot.y,5,0,2*Math.PI);ctx.fill();
    }
    const p=game.player;
    ctx.beginPath();ctx.fillStyle='#5eead4';ctx.arc(p.x,p.y,14,0,2*Math.PI);ctx.fill();
    ctx.fillStyle='#b2f6e7';ctx.fillRect(p.x-17,p.y-22,34*Math.max(0,p.hp)/100,4);
    if(stick.id!==null){
      ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=3;
      ctx.beginPath();ctx.arc(stick.startX,stick.startY,53,0,2*Math.PI);ctx.stroke();
      ctx.beginPath();ctx.fillStyle='rgba(255,255,255,.35)';
      ctx.arc(stick.startX+stick.x*52,stick.startY+stick.y*52,19,0,2*Math.PI);ctx.fill();
    }
    if(game.phase!=='running'){
      ctx.fillStyle='rgba(0,0,0,.58)';ctx.fillRect(0,0,G.WIDTH,G.HEIGHT);
      ctx.fillStyle='#f8fafc';ctx.font='bold 32px system-ui';ctx.textAlign='center';
      const title=game.phase==='ready'?'Offline prototype only':
        game.phase==='paused'?'Paused':'Demo run complete';
      ctx.fillText(title,G.WIDTH/2,G.HEIGHT/2);
      ctx.font='18px system-ui';
      ctx.fillText('Original placeholder geometry — no authentic PokéBonk mechanics or rewards',
        G.WIDTH/2,G.HEIGHT/2+36);
      ctx.textAlign='start';
    }
    status.textContent=`State: ${game.phase} · Time ${game.time.toFixed(1)}/${G.DURATION}s · HP ${Math.ceil(game.player.hp)} · Demo defeats ${game.kills} · Rewards 0`;
  }
  function frame(now){
    if(last&&game.phase==='running')G.step(game,input(),Math.min((now-last)/1000,0.05));
    last=now;
    if(game.phase==='finished')buttonState();
    draw();requestAnimationFrame(frame);
  }
  buttonState();requestAnimationFrame(frame);
})();
