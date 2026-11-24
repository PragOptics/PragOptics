// Native idle/expiry guard. A presence click resumes only after server verification.
import {openLoginModal} from '../ui/login.modal.js';
import {accessToken} from '../runtime/session.js';
import {createSessionGate} from './sessionGate.js';
import {coverSession,retrySessionCover,uncoverSession,closePrivateModals,sessionVersion} from './sessionPrivacy.js';
function session(){
 const token=accessToken();let expiresAt=0;
 try{let part=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');while(part.length%4)part+='=';expiresAt=Number(JSON.parse(atob(part)).exp)*1000||0;}catch{}
 return {present:!!token,valid:!!window.isAccessTokenValid?.(),expiresAt,version:sessionVersion()};
}
export function createIdleGate({onSignIn}={}){
 let started=false;
 const gate=createSessionGate({session,refresh:()=>window.pragRefreshSession?.(true),pause:()=>coverSession(()=>gate.resume()),release:uncoverSession,retry:retrySessionCover,
  signIn:()=>{closePrivateModals();window.invalidateSession?.('signin');uncoverSession();if(onSignIn)onSignIn();else openLoginModal('login');}});
 const activity=event=>{if(event.target?.closest?.('[data-session-protection]'))return;if(!gate.activity()){if(event.cancelable)event.preventDefault();event.stopImmediatePropagation();}};
 return {start(){if(started)return;started=true;for(const name of ['pointerdown','keydown','touchstart'])document.addEventListener(name,activity,{capture:true});window.addEventListener('focus',gate.check);window.addEventListener('online',gate.check);document.addEventListener('visibilitychange',()=>{if(!document.hidden)gate.check();});window.addEventListener('pragoptics:session-changed',gate.changed);gate.check();},pause:gate.lock};
}
