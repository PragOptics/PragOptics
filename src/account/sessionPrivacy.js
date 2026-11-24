// Opaque UI protection; this does not authenticate a person or replace server guards.
let screen=null,observer=null,version=0;const restored=new Map(),closers=new Map();
const resumeKeys=new Set();
function shieldKeys(event){
 const completingResume=resumeKeys.has(event.key);
 if(!screen&&!completingResume)return;
 event.stopImmediatePropagation();
 if(completingResume){event.preventDefault();if(event.type==='keyup')resumeKeys.delete(event.key);return;}
 if(event.key==='Escape')event.preventDefault();
 if(event.type==='keydown'&&(event.key==='Enter'||event.key===' ')&&event.target===screen.querySelector('button')){event.preventDefault();resumeKeys.add(event.key);const button=screen.querySelector('button');if(!button.disabled)button.click();}
}
if(typeof window!=='undefined')for(const name of ['keydown','keyup','keypress'])window.addEventListener?.(name,shieldKeys,true);
export const sessionVersion=()=>version;
export function sessionChanged({renewal=false}={}){if(!renewal)version++;globalThis.window?.dispatchEvent?.(new Event('pragoptics:session-changed'));}
export function closePrivateModal(id){closers.get(id)?.();}
export function registerPrivateModal(id,close){closers.set(id,close);return()=>{if(closers.get(id)===close)closers.delete(id);};}
export function assertSessionVersion(expected){if(expected!==version)throw Object.assign(new Error('The session changed. No response was applied.'),{code:'SESSION_CHANGED',sessionInvalidated:true});}
export function closePrivateModals(){for(const [id,close]of [...closers]){try{close();}catch{/* Continue protecting other private surfaces. */}finally{closers.delete(id);}}if(typeof document==='undefined')return;for(const host of document.querySelectorAll?.('.acct-modal-host')||[]){host.hidden=true;host.replaceChildren();}}
function protect(){
  const nodes=[...document.body.children,...document.querySelectorAll('dialog[open]')];
  for(const node of nodes){if(node===screen||screen?.contains(node)||restored.has(node))continue;restored.set(node,{inert:node.inert,aria:node.getAttribute('aria-hidden')});node.inert=true;node.setAttribute('aria-hidden','true');}
}
export function coverSession(onResume){
  if(screen)return screen;
  screen=document.createElement('dialog');screen.className='idle-gate';screen.setAttribute('aria-label','Session paused');screen.setAttribute('data-session-protection','');
  screen.innerHTML='<div class="idle-card"><span class="idle-dot"></span><h3>Are you still there?</h3><p>Your private workspace is covered. Continue after verifying your session.</p><button type="button" class="idle-go">I\u2019m back</button></div>';
  screen.addEventListener('cancel',event=>event.preventDefault());screen.querySelector('button').addEventListener('click',()=>{const button=screen?.querySelector('button');if(button){button.disabled=true;button.textContent='Verifying session…';}void onResume();});
  document.documentElement.classList.add('session-privacy-locked');document.body.appendChild(screen);screen.addEventListener('click',event=>event.stopPropagation());globalThis.window?.getSelection?.()?.removeAllRanges();protect();
  observer=new MutationObserver(protect);observer.observe(document.body,{childList:true,subtree:true});
  if(typeof screen.showModal==='function')screen.showModal();else screen.setAttribute('open','');
  screen.querySelector('button').focus();return screen;
}
export function retrySessionCover(){if(!screen)return;screen.querySelector('p').textContent='Your session could not be verified. Your work stays covered. Check your connection and try again.';const button=screen.querySelector('button');button.disabled=false;button.textContent='Try again';}
export function uncoverSession(){
  observer?.disconnect();observer=null;if(screen){screen.close?.();screen.remove();screen=null;}
  for(const [node,prior]of restored){node.inert=prior.inert;if(prior.aria===null)node.removeAttribute('aria-hidden');else node.setAttribute('aria-hidden',prior.aria);}restored.clear();document.documentElement.classList.remove('session-privacy-locked');
}

export function sessionBoundResponse(response,expected){
 return new Proxy(response,{get(target,key){
  assertSessionVersion(expected);
  if(key==='clone')return()=>{assertSessionVersion(expected);return sessionBoundResponse(target.clone(),expected);};
  const value=Reflect.get(target,key,target);
  if(typeof value!=='function')return value;
  if(['json','text','blob','arrayBuffer','formData','bytes'].includes(key))return async(...args)=>{assertSessionVersion(expected);const body=await value.apply(target,args);assertSessionVersion(expected);return body;};
  return value.bind(target);
 }});
}
