import {useEffect} from 'react';
export const guidedMotion={introDelay:3000,duration:1150,offset:24};
let cancelMotion=()=>{};
export function guideTo(node){
 cancelMotion();if(!node)return;
 const start=window.scrollY,target=Math.max(0,node.getBoundingClientRect().top+start-guidedMotion.offset-(document.querySelector(".store-header")?.getBoundingClientRect().height||0));
 if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){window.scrollTo(0,target);return;}
 let frame,begin;const events=['wheel','touchstart','pointerdown','keydown'];
 const stop=()=>{cancelAnimationFrame(frame);events.forEach(e=>window.removeEventListener(e,stop));};
 events.forEach(e=>window.addEventListener(e,stop,{passive:true,once:true}));cancelMotion=stop;
 const tick=time=>{begin??=time;const t=Math.min(1,(time-begin)/guidedMotion.duration);window.scrollTo(0,start+(target-start)*(t*t*(3-2*t)));if(t<1)frame=requestAnimationFrame(tick);else stop();};frame=requestAnimationFrame(tick);
}
export function useIntroGuide(ref){useEffect(()=>{
 const events=['scroll','wheel','touchstart','pointerdown','keydown','input'];
 const cancel=()=>{clearTimeout(timer);events.forEach(e=>window.removeEventListener(e,cancel));};
 const timer=setTimeout(()=>{cancel();if(window.scrollY<40)guideTo(ref.current);},guidedMotion.introDelay);
 events.forEach(e=>window.addEventListener(e,cancel,{passive:true,once:true}));return()=>{cancel();cancelMotion();};
 },[]);}
