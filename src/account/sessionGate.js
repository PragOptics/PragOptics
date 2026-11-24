// Session pause policy only. Authentication remains with the native session service.
export function createSessionGate({session,refresh,pause,release,signIn,retry,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout,idleMs=30*60*1000}) {
  let idleTimer=0,expiryTimer=0,paused=false,busy=false;
  function arm() {
    clearTimer(idleTimer);clearTimer(expiryTimer);
    const s=session();
    if(!s.present)return;
    if(!paused)idleTimer=setTimer(()=>lock(),idleMs);
    if(s.expiresAt)expiryTimer=setTimer(check,Math.min(2147483647,Math.max(0,s.expiresAt-now()+1)));
  }
  function lock(){if(!session().present||paused)return;paused=true;pause();}
  function check(){const s=session();if(!s.present){paused=false;arm();return true;}if(!s.valid){lock();signIn();return false;}arm();return true;}
  function activity(){if(!check())return false;return !paused;}
  async function resume(){
    if(!paused||busy)return;busy=true;const before=session();
    try{
      const result=await refresh(),after=session();
      if(after.version!==before.version&&after.valid)return;
      if((result?.refreshed===true||result?.verified===true)&&after.valid){paused=false;release();arm();return;}
      if(!after.present||!after.valid||/^http-(401|403)$/.test(result?.reason||'')){signIn();return;}
      retry();
    }catch{if(!session().valid)signIn();else retry();}
    finally{busy=false;}
  }
  function changed(){arm();}
  function stop(){clearTimer(idleTimer);clearTimer(expiryTimer);}
  return {activity,check,lock,resume,changed,stop};
}
