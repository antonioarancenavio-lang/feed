/* LeadStore: capa de datos de LeadFlow Acquisition.
   Hoy guarda en localStorage. Todas las funciones devuelven Promesas para que,
   más adelante, se sustituya SOLO este archivo por llamadas a una API (fetch) sin tocar app.js.
   Las reglas de validate() deben repetirse en el servidor.

   Garantías de esta versión:
   - Escritura transaccional: los cambios se preparan sobre una copia y solo pasan a la caché
     si localStorage.setItem() tiene éxito. Si falla, la caché queda intacta.
   - Antes de cada cambio se vuelve a leer el almacenamiento (otra pestaña pudo modificarlo),
     de modo que no se sobrescriben datos recientes con una caché antigua.
   - Distingue «almacenamiento vacío» (lista vacía) de «error de acceso» (la promesa se rechaza con code:"access").
   - subscribe() avisa cuando otra pestaña cambia los datos (evento storage). Sin servidores. */
(function(){
"use strict";
const KEY="leadflow_acquisition_v1";
const STATUSES=["Nueva","En revisión","Contactada","Descartada"];
const TYPES=["Reforma de baño","Reforma de cocina","Reforma integral"];
const TIMEFRAMES=["Lo antes posible","En 1 a 3 meses","En 3 a 6 meses","Más de 6 meses","Solo me estoy informando"];
const MAX_HISTORY=200;
const MSG_ACCESS="No se puede acceder al almacenamiento del navegador (puede estar bloqueado, desactivado o en modo privado). No se ha modificado nada.";
const MSG_SAVE="No se pudo guardar en este navegador (almacenamiento lleno o bloqueado). No se ha modificado nada.";

const mkErr=(msg,props)=>Object.assign(new Error(msg),props||{});
const clone=x=>JSON.parse(JSON.stringify(x));
const clean=(v,n)=>String(v==null?"":v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,"").trim().slice(0,n);
const okId=s=>typeof s==="string"&&/^[A-Za-z0-9_-]{1,40}$/.test(s);
const okTs=s=>{const t=typeof s==="string"?Date.parse(s):NaN;return isNaN(t)||t<946684800000||t>4102444800000?"":new Date(t).toISOString()};
const uid=()=>"r"+Date.now().toString(36)+Math.random().toString(36).slice(2,8);

/* ---------- Referencias (LF-0001, LF-0002…) ---------- */
const fmtRef=n=>"LF-"+String(n).padStart(4,"0");
const refNum=s=>{const m=/^LF-(\d{1,9})$/i.exec(String(s==null?"":s).trim());const n=m?parseInt(m[1],10):0;return n>0?n:0};

function normalizeRefs(items){
 const used=new Set();let max=0;
 items.forEach(x=>{max=Math.max(max,refNum(x.ref))});
 items.forEach(x=>{
  const n=refNum(x.ref),ref=n?fmtRef(n):"";
  if(ref&&!used.has(ref)){x.ref=ref;used.add(ref)}else x.ref="";
 });
 items.forEach(x=>{if(!x.ref){max++;x.ref=fmtRef(max);used.add(x.ref)}});
 return items;
}
const nextRef=items=>fmtRef(items.reduce((m,x)=>Math.max(m,refNum(x.ref)),0)+1);

/* ---------- Validación compartida por el formulario y por el almacén ---------- */
function validate(i){
 i=i||{};const e={},v={};
 v.name=clean(i.name,100);v.phone=clean(i.phone,20);v.city=clean(i.city,80);
 v.type=i.type;v.timeframe=i.timeframe;v.description=clean(i.description,1000);v.consent=i.consent===true;
 if(v.name.length<2||!/^[\p{L}\p{M}' .-]+$/u.test(v.name))e.name="Escribe tu nombre (solo letras, de 2 a 100 caracteres).";
 const digits=v.phone.replace(/\D/g,"");
 if(!/^\+?[0-9 ()\-.]{9,20}$/.test(v.phone)||digits.length<9||digits.length>15)e.phone="Escribe un teléfono válido, por ejemplo 600 000 001.";
 if(v.city.length<2||!/^[\p{L}\p{M}0-9' .,()-]+$/u.test(v.city))e.city="Indica tu localidad.";
 if(!TYPES.includes(v.type))e.type="Elige el tipo de reforma.";
 if(v.description.length<10)e.description="Cuéntanos tu proyecto con al menos 10 caracteres.";
 if(!TIMEFRAMES.includes(v.timeframe))e.timeframe="Elige un plazo aproximado.";
 if(!v.consent)e.consent="Debes aceptar la información de privacidad para enviar la solicitud.";
 return {ok:!Object.keys(e).length,errors:e,value:v};
}

/* ---------- Saneado de lo leído ---------- */
function sanitize(r,seen){
 if(!r||typeof r!=="object")return null;
 const name=clean(r.name,100);if(!name)return null;
 let id=okId(r.id)&&!seen.has(r.id)?r.id:uid();while(seen.has(id))id=uid();seen.add(id);
 const at=okTs(r.createdAt)||new Date().toISOString();
 return {id,ref:r.ref,name,phone:clean(r.phone,20),city:clean(r.city,80),
  type:TYPES.includes(r.type)?r.type:TYPES[0],timeframe:TIMEFRAMES.includes(r.timeframe)?r.timeframe:TIMEFRAMES[4],
  description:clean(r.description,1000),status:STATUSES.includes(r.status)?r.status:STATUSES[0],source:"Web",
  consentAt:okTs(r.consentAt)||at,createdAt:at,
  history:(Array.isArray(r.history)?r.history:[]).map(h=>({at:okTs(h&&h.at)||at,text:clean(h&&h.text,200)})).filter(h=>h.text).slice(-MAX_HISTORY)};
}
function demoItems(){
 const d=n=>new Date(Date.now()-n*864e5).toISOString();
 const mk=(n,name,phone,city,type,timeframe,status,description)=>({id:uid()+n,ref:fmtRef(n),name,phone,city,type,timeframe,description,status,source:"Web",consentAt:d(n),createdAt:d(n),
  history:[{at:d(n),text:"Solicitud recibida (demostración)"}].concat(status!=="Nueva"?[{at:d(Math.max(n-1,0)),text:"Estado: Nueva → "+status}]:[])});
 return [
  mk(6,"Carmen Ficticia Lara","600 000 001","Ciudad Ejemplo","Reforma de baño","Lo antes posible","Nueva","Quiero cambiar la bañera por un plato de ducha y renovar los azulejos. Baño de unos 5 m²."),
  mk(5,"Luis Demo Prieto","600 000 002","Villa Muestra","Reforma de cocina","En 1 a 3 meses","En revisión","Cocina pequeña con salida a terraza. Me gustaría abrirla al salón y cambiar muebles y encimera."),
  mk(4,"Sofía Prueba Gil","600 000 003","Pueblo Imaginario","Reforma integral","En 3 a 6 meses","Contactada","Piso de 80 m² de los años 80: baño, cocina y suelos. Aún no tengo presupuesto máximo."),
  mk(3,"Andrés Test Mora","600 000 004","Ciudad Ejemplo","Reforma de baño","Solo me estoy informando","Descartada","Solo quería saber precios aproximados."),
  mk(2,"Elena Ejemplo Rey","600 000 005","Villa Muestra","Reforma de cocina","Lo antes posible","Nueva","Necesito cambiar la instalación eléctrica de la cocina y poner campana extractora nueva."),
  mk(1,"Mario Simulado Cano","600 000 006","Barrio Demo","Reforma de baño","En 1 a 3 meses","Nueva","Baño de invitados pequeño. Busco un cambio completo de sanitarios y grifería.")];
}

/* ---------- Acceso al almacenamiento ---------- */
const serialize=items=>JSON.stringify({version:1,items});
function readRaw(){try{return {raw:localStorage.getItem(KEY)}}catch(e){return {error:true}}}
function backupCorrupt(raw){
 try{
  let k=KEY+"_corrupt";const prev=localStorage.getItem(k);
  if(prev!==null&&prev!==raw)k+="_"+Date.now().toString(36);
  localStorage.setItem(k,raw);return true;
 }catch(e){return false}
}

let cache=null;
function load(){
 const r=readRaw();
 if(r.error)throw mkErr(MSG_ACCESS,{code:"access"});
 if(cache&&cache.raw===r.raw)return cache;
 if(r.raw===null){
  const items=demoItems(),text=serialize(items);
  try{localStorage.setItem(KEY,text)}catch(e){throw mkErr(MSG_ACCESS,{code:"access"})}
  return cache={raw:text,items};
 }
 try{
  const j=JSON.parse(r.raw);if(!j||typeof j!=="object"||!Array.isArray(j.items))throw 0;
  const seen=new Set();
  return cache={raw:r.raw,items:normalizeRefs(j.items.map(x=>sanitize(x,seen)).filter(Boolean))};
 }catch(e){
  return cache={raw:r.raw,items:[],damaged:true,backedUp:backupCorrupt(r.raw)};
 }
}

function commit(mutate){
 const cur=load();
 if(cur.damaged&&!cur.backedUp)throw mkErr("Los datos guardados están dañados y no se pudo conservar una copia, así que no se modificará nada para no perderlos.",{code:"damaged"});
 const items=clone(cur.items);
 const res=mutate(items);
 if(res&&res.noChange)return res.value;
 const text=serialize(items);
 try{localStorage.setItem(KEY,text)}catch(e){throw mkErr(MSG_SAVE,{code:"save"})}
 cache={raw:text,items};
 return res;
}
const run=f=>new Promise((ok,ko)=>{try{ok(f())}catch(e){ko(e)}});

/* ---------- Aviso de cambios hechos en otra pestaña ---------- */
const listeners=new Set();
const emit=()=>listeners.forEach(f=>{try{f()}catch(e){}});
addEventListener("storage",e=>{if(e.key===null||e.key===KEY)emit()});
function checkExternal(){if(!cache)return;const r=readRaw();if(!r.error&&r.raw!==cache.raw)emit()}
addEventListener("focus",checkExternal);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)checkExternal()});

window.LeadStore={STATUSES,TYPES,TIMEFRAMES,validate,
 list:()=>run(()=>load().items.map(clone).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))),
 get:id=>run(()=>{const x=load().items.find(x=>x.id===id);return x?clone(x):null}),
 create:data=>run(()=>{
  if(data&&String(data.website==null?"":data.website).trim())throw mkErr("Solicitud rechazada",{spam:true});
  const r=validate(data);if(!r.ok)throw mkErr("Datos no válidos",{errors:r.errors});
  const v=r.value;
  return clone(commit(items=>{
   const now=new Date().toISOString();let id=uid();while(items.some(x=>x.id===id))id=uid();
   const item={id,ref:nextRef(items),name:v.name,phone:v.phone,city:v.city,type:v.type,timeframe:v.timeframe,description:v.description,status:STATUSES[0],source:"Web",consentAt:now,createdAt:now,history:[{at:now,text:"Solicitud recibida (demostración)"}]};
   items.push(item);return item;
  }));
 }),
 updateStatus:(id,status,expected)=>run(()=>{
  if(!STATUSES.includes(status))throw mkErr("Estado no válido");
  return clone(commit(items=>{
   const it=items.find(x=>x.id===id);
   if(!it)throw mkErr("La solicitud ya no existe (puede haberse eliminado en otra pestaña).",{code:"notfound"});
   if(it.status===status)return {noChange:true,value:it};
   if(expected!==undefined&&it.status!==expected)throw mkErr("Otra pestaña cambió el estado a «"+it.status+"». Se ha actualizado la vista; vuelve a elegir si sigue siendo necesario.",{code:"conflict"});
   it.history.push({at:new Date().toISOString(),text:`Estado: ${it.status} → ${status}`});
   it.history=it.history.slice(-MAX_HISTORY);
   it.status=status;
   return it;
  }));
 }),
 seedDemo:()=>run(()=>commit(items=>{items.length=0;demoItems().forEach(x=>items.push(x));return items.length})),
 clear:()=>run(()=>{commit(items=>{items.length=0})}),
 wasDamaged:()=>!!(cache&&cache.damaged),
 subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)}
};
})();
