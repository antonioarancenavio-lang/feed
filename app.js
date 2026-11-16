(function(){
"use strict";
const S=window.LeadStore,$=s=>document.querySelector(s);

/* Constructor de elementos: el contenido de usuario entra siempre como texto, nunca como HTML */
const h=(t,a,...k)=>{
 const e=document.createElement(t);
 for(const[n,v]of Object.entries(a||{})){
  if(n.startsWith("on"))e.addEventListener(n.slice(2),v);
  else if(v!==false&&v!=null)e.setAttribute(n,v===true?"":v)
 }
 k.flat().forEach(c=>e.append(c instanceof Node?c:document.createTextNode(c==null?"":c)));
 return e
};

const fdt=s=>new Date(s).toLocaleString("es-ES",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
const fd=s=>new Date(s).toLocaleDateString("es-ES",{day:"numeric",month:"short",year:"numeric"});

let tt;
function toast(m,bad){
 const t=$("#toast");
 t.textContent=m;t.className=bad?"bad":"";
 t.setAttribute("role",bad?"alert":"status");
 t.hidden=false;clearTimeout(tt);
 tt=setTimeout(()=>t.hidden=true,bad?5000:2500)
}

const opts=(sel,list,ph)=>sel.replaceChildren(
 h("option",{value:""},ph),
 ...list.map(x=>h("option",{value:x},x))
);

opts($("#f-type"),S.TYPES,"Selecciona…");
opts($("#f-time"),S.TIMEFRAMES,"Selecciona…");
opts($("#a-fst"),S.STATUSES,"Todos los estados");

/* ---------- Formulario ---------- */
const F={
 name:"f-name",
 phone:"f-phone",
 city:"f-city",
 type:"f-type",
 description:"f-desc",
 timeframe:"f-time",
 consent:"f-consent"
};

const keys=Object.keys(F);

/* Campo trampa antispam */
const readForm=()=>({
 name:$("#f-name").value,
 phone:$("#f-phone").value,
 city:$("#f-city").value,
 type:$("#f-type").value,
 description:$("#f-desc").value,
 timeframe:$("#f-time").value,
 consent:$("#f-consent").checked,
 website:$("#f-web").value
});

function showErr(k,msg){
 const el=$("#"+F[k]);
 $("#e-"+k).textContent=msg||"";
 if(msg)el.setAttribute("aria-invalid","true");
 else el.removeAttribute("aria-invalid")
}

const form=$("#form");

form.addEventListener("focusout",e=>{
 const k=keys.find(k=>F[k]===e.target.id);
 if(!k)return;
 const el=e.target;
 if(el.value||el.getAttribute("aria-invalid"))
  showErr(k,S.validate(readForm()).errors[k])
});

form.addEventListener("input",e=>{
 const k=keys.find(k=>F[k]===e.target.id);
 if(e.target.id==="f-desc")$("#cnt").textContent=e.target.value.length+"/1000";
 if(k&&e.target.getAttribute("aria-invalid"))
  showErr(k,S.validate(readForm()).errors[k])
});

form.addEventListener("change",e=>{
 const k=keys.find(k=>F[k]===e.target.id);
 if(k&&e.target.getAttribute("aria-invalid"))
  showErr(k,S.validate(readForm()).errors[k])
});

function showOk(ref){
 form.hidden=true;
 $("#ok").hidden=false;
 $("#ok-ref").textContent=ref?"Referencia: "+ref:"";
 $("#ok-ref").hidden=!ref;
 $("#ok").scrollIntoView({block:"center"});
}

let sending=false;

form.addEventListener("submit",async e=>{
 e.preventDefault();
 if(sending)return;

 const al=$("#f-alert");
 al.hidden=true;

 const d=readForm();

 /* Primero se comprueba el campo trampa antispam */
 if(String(d.website||"").trim()){
  showOk(null);
  return;
 }

 const r=S.validate(d);
 keys.forEach(k=>showErr(k,r.errors[k]));

 if(!r.ok){
  const k=keys.find(k=>r.errors[k]);
  const n=Object.keys(r.errors).length;
  $("#"+F[k]).focus();
  al.textContent="Revisa los campos marcados: "+(n===1?"1 campo requiere tu atención.":n+" campos requieren tu atención.");
  al.hidden=false;
  return
 }

 sending=true;
 const btn=$("#f-send");
 btn.disabled=true;
 btn.setAttribute("aria-busy","true");
 btn.textContent="Enviando…";

 try{
  const item=await S.create(d);
  showOk(item.ref);
 }catch(err){
  if(err&&err.spam){
   showOk(null)
  }else{
   if(err&&err.errors){
    Object.keys(err.errors).forEach(k=>showErr(k,err.errors[k]));
    al.textContent="Hay datos que no son válidos. Revisa el formulario."
   }else{
    al.textContent="No se pudo registrar la solicitud. "+((err&&err.message)||"Inténtalo de nuevo.")
   }
   al.hidden=false;
   al.scrollIntoView({block:"center"});
  }
 }finally{
  sending=false;
  btn.disabled=false;
  btn.removeAttribute("aria-busy");
  btn.textContent="Enviar solicitud"
 }
});

$("#again").addEventListener("click",()=>{
 form.reset();
 keys.forEach(k=>showErr(k,""));
 $("#f-alert").hidden=true;
 $("#cnt").textContent="0/1000";
 $("#ok").hidden=true;
 form.hidden=false;
 $("#f-name").focus()
});

/* ---------- Administración ---------- */
const COL=["#2c4f9e","#6b3a96","#1f6f6b","#6b756d"];

let all=[],q="",fst="";
let storageError="";
let warnedDamaged=false;
let openId=null,detailSnap="";

const pill=s=>h("span",{class:"pill s"+S.STATUSES.indexOf(s)},s);

let loadSeq=0;

async function loadAdmin(){
 const seq=++loadSeq;

 try{
  const list=await S.list();
  if(seq!==loadSeq)return;

  all=list;
  storageError="";

  if(S.wasDamaged()){
   if(!warnedDamaged){
    warnedDamaged=true;
    toast("Los datos guardados estaban dañados; se conservó una copia aparte.",1)
   }
  }else{
   warnedDamaged=false
  }
 }catch(e){
  if(seq!==loadSeq)return;
  all=[];
  storageError=(e&&e.message)||"No se puede acceder al almacenamiento del navegador."
 }

 renderAdmin()
}

function renderAdmin(){
 const bad=!!storageError;

 $("#a-err").hidden=!bad;
 $("#a-err-t").textContent=bad?storageError:"";

 ["#a-q","#a-fst","#a-seed","#a-clear"].forEach(s=>$(s).disabled=bad);

 const box=$("#a-list");

 if(bad){
  $("#a-stats").replaceChildren();
  box.replaceChildren(h("div",{class:"empty"},"No se pueden mostrar las solicitudes porque no se puede acceder al almacenamiento. Esto no significa que no existan."));
  return
 }

 const stat=(n,l,c)=>h("div",{class:"stat",style:"--c:"+c},h("b",{},n),h("span",{},l));

 $("#a-stats").replaceChildren(
  stat(all.length,"Total","#1f6f6b"),
  ...S.STATUSES.map((s,i)=>stat(all.filter(x=>x.status===s).length,s,COL[i]))
 );

 const L=all.filter(x=>(!fst||x.status===fst)&&(!q||(x.name+" "+x.city+" "+x.ref).toLowerCase().includes(q)));

 if(!L.length){
  const msg=all.length
   ?"Ninguna solicitud coincide con la búsqueda."
   :S.wasDamaged()
    ?"Los datos guardados estaban dañados y no se pueden mostrar. Se conservó una copia aparte; puedes restaurar los ejemplos."
    :"Aún no hay solicitudes. Envía una desde el formulario o restaura los ejemplos.";

  box.replaceChildren(h("div",{class:"empty"},msg));
  return
 }

 box.replaceChildren(
  h("table",{},
   h("thead",{},
    h("tr",{},
     ...["Nombre","Localidad","Tipo de reforma","Fecha","Estado",""].map(t=>h("th",{},t))
    )
   ),
   h("tbody",{},
    ...L.map(x=>h("tr",{},
     h("td",{},
      h("b",{},x.name),
      h("br"),
      h("small",{style:"color:var(--mute)"},x.ref)
     ),
     h("td",{"data-l":"Localidad"},x.city),
     h("td",{"data-l":"Reforma"},x.type),
     h("td",{"data-l":"Fecha"},fd(x.createdAt)),
     h("td",{},pill(x.status)),
     h("td",{},
      h("button",{
       class:"btn sm sec",
       type:"button",
       onclick:()=>openDetail(x.id)
      },"Ver solicitud")
     )
    )))
   )
  )
 )
}

async function openDetail(id,refocus){
 let x;

 try{
  x=await S.get(id)
 }catch(e){
  toast(e.message,1);
  return
 }

 if(!x){
  if($("#dlg").open)$("#dlg").close();
  toast("Solicitud no encontrada.",1);
  return
 }

 openId=id;
 detailSnap=JSON.stringify(x);

 const sel=h("select",{id:"d-status"},
  ...S.STATUSES.map(s=>h("option",{value:s,selected:s===x.status},s))
 );

 sel.addEventListener("change",async()=>{
  const previous=x.status;
  const next=sel.value;

  if(previous===next)return;

  try{
   await S.updateStatus(x.id,next,previous);
   toast("Estado actualizado")
  }catch(e){
   toast(e.message,1)
  }

  await loadAdmin();
  await openDetail(x.id,true)
 });

 const info=(l,v)=>h("div",{},h("small",{},l),h("b",{},v));

 $("#dbody").replaceChildren(
  h("div",{class:"dh"},
   h("div",{},
    h("h2",{style:"font-size:22px;margin:0"},x.name),
    h("small",{style:"color:var(--mute)"},"Referencia "+x.ref+" · "+fdt(x.createdAt))
   ),
   h("button",{
    class:"btn sm sec",
    type:"button",
    onclick:()=>$("#dlg").close()
   },"Cerrar")
  ),
  h("div",{class:"info"},
   info("Teléfono",h("a",{href:"tel:"+x.phone.replace(/[^0-9+]/g,"")},x.phone)),
   info("Localidad",x.city),
   info("Tipo de reforma",x.type),
   info("Plazo aproximado",x.timeframe),
   h("div",{class:"full"},
    h("small",{},"Descripción del proyecto"),
    h("div",{class:"desc"},x.description)
   )
  ),
  h("div",{class:"st"},
   h("label",{for:"d-status"},"Estado de la solicitud"),
   sel
  ),
  h("small",{style:"color:var(--mute)"},"Consentimiento aceptado el "+fdt(x.consentAt)+" (demostración)."),
  h("h3",{style:"margin:16px 0 8px;font-size:16px"},"Historial"),
  h("div",{class:"tl"},
   ...x.history.slice().reverse().map(e=>h("p",{},e.text,h("small",{},fdt(e.at))))
  )
 );

 if(!$("#dlg").open)$("#dlg").showModal();

 if(refocus)sel.focus()
}

$("#dlg").addEventListener("close",()=>{
 openId=null;
 detailSnap=""
});

/* Si otra pestaña cambió o eliminó la solicitud abierta, se actualiza el detalle */
async function refreshDetail(){
 if(!openId||!$("#dlg").open)return;

 try{
  const x=await S.get(openId);

  if(!x){
   $("#dlg").close();
   toast("La solicitud abierta ya no existe (cambio en otra pestaña).",1)
  }else if(JSON.stringify(x)!==detailSnap){
   await openDetail(openId)
  }
 }catch(e){}
}

$("#a-q").addEventListener("input",e=>{
 q=e.target.value.trim().toLowerCase();
 renderAdmin()
});

$("#a-fst").addEventListener("change",e=>{
 fst=e.target.value;
 renderAdmin()
});

$("#a-retry").addEventListener("click",loadAdmin);

$("#a-seed").addEventListener("click",async()=>{
 if(!confirm("¿Sustituir las solicitudes actuales por las 6 de ejemplo? Se perderán las actuales."))return;

 try{
  await S.seedDemo();
  toast("Ejemplos restaurados")
 }catch(e){
  toast(e.message,1)
 }

 await loadAdmin()
});

$("#a-clear").addEventListener("click",async()=>{
 if(!confirm("¿Vaciar todas las solicitudes? No se puede deshacer."))return;

 try{
  await S.clear();
  toast("Solicitudes eliminadas")
 }catch(e){
  toast(e.message,1)
 }

 await loadAdmin()
});

/* ---------- Sincronización entre pestañas ---------- */
S.subscribe(async()=>{
 if($("#admin").hidden)return;

 const before=JSON.stringify(all);
 await loadAdmin();

 if(JSON.stringify(all)!==before){
  toast("Solicitudes actualizadas desde otra pestaña")
 }

 await refreshDetail()
});

/* ---------- Navegación ---------- */
function route(){
 const adm=location.hash==="#admin";

 $("#public").hidden=adm;
 $("#admin").hidden=!adm;

 if(!adm&&$("#dlg").open)$("#dlg").close();

 document.title=adm
  ?"Administración (demo) · Piedra Clara"
  :"Piedra Clara Reformas · Baños y cocinas";

 if(adm){
  loadAdmin();
  scrollTo(0,0)
 }else{
  const el=location.hash.length>1&&document.getElementById(location.hash.slice(1));
  if(el)el.scrollIntoView();
  else scrollTo(0,0)
 }
}

addEventListener("hashchange",route);
route();
})();
