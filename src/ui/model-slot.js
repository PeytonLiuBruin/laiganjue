// One lifecycle for built-in physical models and optional registered renderers.
import { h } from './kit.js';
import { builtInModel } from './models/index.js';
const registry=new Map();
export function registerModel(id,factory){registry.set(id,factory);}
export function hasModel(id){return registry.has(id)||!!builtInModel(id);}
export function createModelSlot(ctx,{id,label='',glyph='◇',hint=''}={}){
  const el=h('div',{class:'model-slot',dataset:{modelSlot:id},attrs:{role:'img','aria-label':label}});
  let impl=null,alive=true;
  const factory=registry.get(id)||builtInModel(id);
  try{impl=factory?.(el,ctx)||null;}catch(e){console.error('[model-slot]',id,e);}
  if(impl)el.classList.add('has-model');
  else el.replaceChildren(h('span',{class:'model-slot-glyph'},glyph),h('span',null,label));
  const api={el,get hasModel(){return!!impl;},set(state={}){
    if(!alive)return;
    impl?.set?.(state);
    if(state.text!=null)el.setAttribute('aria-label',`${label}，${state.text}`);
  },dispose(){if(!alive)return;alive=false;impl?.dispose?.();impl=null;}};
  api.set({glyph,text:hint});ctx.addCleanup(api.dispose);return api;
}
