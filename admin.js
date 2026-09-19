const SUPABASE_URL="https://cnivcnexsqobipvqxero.supabase.co";
const SUPABASE_KEY="sb_publishable_6UjwLuM-op0-OBKWlbusTw_qmLNZVfU";
const ADMIN_API=SUPABASE_URL+"/functions/v1/admin-control";
const TOKEN_KEY="cardnestAdminToken";
const REMEMBER_KEY="cardnestRememberedUsername";
const REMEMBER_ACCESS_KEY="cardnestRememberAccess";

const state={
 token:sessionStorage.getItem(TOKEN_KEY)||localStorage.getItem(TOKEN_KEY)||"",
 user:null,
 products:[],
 activity:[],
 activityHasMore:true,
 profiles:[],
 summary:{},
 unread:0,
 currentView:"overview",
 chatPartnerId:"",
 chatLastId:0,
 chatMessages:[],
 heartbeatTimer:null,
 chatTimer:null,
 selectedAvatar:null,
 selectedChatFile:null
};

const $=(s)=>document.querySelector(s);
const $$=(s)=>Array.from(document.querySelectorAll(s));
const cop=(n)=>new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",maximumFractionDigits:0}).format(Number(n)||0);
const safe=(v)=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const formatDate=(v)=>{const d=new Date(v);return Number.isNaN(d.getTime())?"—":d.toLocaleString("es-CO")};
const initials=(name)=>String(name||"CN").trim().split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toUpperCase()||"CN";
function setStatus(el,msg,type=""){if(!el)return;el.hidden=!msg;el.textContent=msg||"";el.className="form-status "+type}
function setAvatar(el,profile){
 if(!el)return;
 el.innerHTML="";
 if(profile?.avatar_url){
  const img=document.createElement("img");img.src=profile.avatar_url;img.alt="";el.appendChild(img);
 }else{
  el.textContent=initials(profile?.display_name||profile?.username||"CN");
 }
}
function profileById(id){return state.profiles.find(p=>p.id===id)||null}
function selfProfile(){return profileById(state.user?.id)||state.user||null}

async function api(action,payload={}){
 const res=await fetch(ADMIN_API,{
  method:"POST",
  headers:{"Content-Type":"application/json",apikey:SUPABASE_KEY,...(state.token?{"x-admin-token":state.token}:{})},
  body:JSON.stringify({action,...payload})
 });
 const data=await res.json().catch(()=>({}));
 if(!res.ok){
  if(res.status===401&&action!=="login"){
   sessionStorage.removeItem(TOKEN_KEY);localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(REMEMBER_ACCESS_KEY);state.token="";state.user=null;stopTimers();showLogin();
  }
  throw new Error(data.message||"No fue posible completar la operación.");
 }
 return data;
}

function showLogin(){
 $("#loginView").hidden=false;$("#panelView").hidden=true;
 const remembered=localStorage.getItem(REMEMBER_KEY)||"";
 $("#adminUsername").value=remembered;
 $("#rememberUsername").checked=!!remembered;
 setTimeout(()=>remembered?$("#adminPassword")?.focus():$("#adminUsername")?.focus(),20);
}
function showPanel(){
 $("#loginView").hidden=true;$("#panelView").hidden=false;
 const me=selfProfile();
 $("#sidebarUser").textContent=me?.display_name||me?.username||"Administrador";
 $("#sidebarRole").textContent=me?.corporate_title||me?.role||"Administrador";
 $("#headerName").textContent=me?.display_name||me?.username||"Administrador";
 $("#headerTitle").textContent=[me?.corporate_title,me?.professional_title].filter(Boolean).join(" · ")||"Administración";
 setAvatar($("#sidebarAvatar"),me);
 setAvatar($("#headerAvatar"),me);
 $("#passwordWarning").hidden=!state.user?.must_change_password;
 updateChatBadge();
 startTimers();
}
function stopTimers(){
 if(state.heartbeatTimer)clearInterval(state.heartbeatTimer);
 if(state.chatTimer)clearInterval(state.chatTimer);
 state.heartbeatTimer=null;state.chatTimer=null;
}
function startTimers(){
 stopTimers();
 state.heartbeatTimer=setInterval(()=>heartbeat().catch(()=>{}),30000);
 state.chatTimer=setInterval(()=>{if(state.currentView==="chat")loadChat(false).catch(()=>{})},5000);
}
function switchView(name){
 state.currentView=name;
 $$(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===name));
 $$(".admin-view").forEach(p=>p.classList.toggle("active",p.dataset.panel===name));
 const labels={overview:"Resumen",team:"Equipo",chat:"Chat interno",mercadolibre:"Mercado Libre",integrations:"Integraciones",activity:"Histórico",security:"Seguridad"};
 $("#viewTitle").textContent=labels[name]||"Centro de mando";
 if(name==="mercadolibre")renderProducts();
 if(name==="team")renderTeam();
 if(name==="chat"){
  populateRecipients();
  loadChat(true).catch(e=>setStatus($("#chatStatus"),e.message,"error"));
 }
 if(name==="activity")renderActivity();
 window.scrollTo({top:0,behavior:"smooth"});
}

function imageOf(p){
 const src=String(p.primary_image_url||p.source_image_url||"");
 const m=src.match(/\/d\/([^/]+)/)||src.match(/[?&]id=([^&]+)/);
 if(m)return "https://drive.google.com/thumbnail?id="+m[1]+"&sz=w300";
 return /^https?:\/\//i.test(src)?src:"";
}
function channelState(p){return p.mercadolibre||{enabled:false,price_cop:null,external_status:"draft"}}
function renderSummary(){
 $("#statProducts").textContent=state.summary.products??0;
 $("#statMlSelected").textContent=state.summary.ml_selected??0;
 $("#statMlActive").textContent=state.summary.ml_active??0;
 $("#statSoldOut").textContent=state.summary.sold_out??0;
}
function renderPresence(){
 const box=$("#presenceGrid");if(!box)return;
 if(!state.profiles.length){box.innerHTML='<span class="muted">Sin perfiles disponibles.</span>';return}
 box.innerHTML=state.profiles.map(p=>
  '<article class="presence-person">'+
   '<div class="presence-avatar">'+(p.avatar_url?'<img src="'+safe(p.avatar_url)+'" alt="">':safe(initials(p.display_name)))+'</div>'+
   '<div><strong>'+safe(p.display_name||p.username)+'</strong><small>'+safe(p.corporate_title||"Administración")+'</small></div>'+
   '<span class="presence-dot '+(p.online?"online":"offline")+'"></span>'+
   '<em>'+(p.online?"En línea":"Desconectado")+'</em>'+
  '</article>'
 ).join("");
}
function renderTeam(){
 const box=$("#teamProfiles");if(!box)return;
 box.innerHTML=state.profiles.map(p=>{
  const mine=p.id===state.user?.id;
  return '<article class="team-profile-card '+(mine?"mine":"")+'">'+
   '<div class="profile-hero">'+
    '<div class="large-avatar">'+(p.avatar_url?'<img src="'+safe(p.avatar_url)+'" alt="">':safe(initials(p.display_name)))+'</div>'+
    '<span class="presence-dot '+(p.online?"online":"offline")+'"></span>'+
   '</div>'+
   '<div class="profile-info">'+
    '<div class="profile-flags"><span>'+safe(p.role==="owner"?"Propietario":"Administración")+'</span>'+(mine?'<b>Tu perfil</b>':'')+'</div>'+
    '<h3>'+safe(p.display_name||p.username)+'</h3>'+
    '<strong>'+safe(p.corporate_title||"Administración")+'</strong>'+
    '<p>'+safe(p.professional_title||"")+'</p>'+
    '<dl><div><dt>Usuario</dt><dd>'+safe(p.username)+'</dd></div><div><dt>Estado</dt><dd>'+(p.online?"En línea":"Desconectado")+'</dd></div><div><dt>Último acceso</dt><dd>'+safe(formatDate(p.last_login_at))+'</dd></div></dl>'+
   '</div>'+
  '</article>';
 }).join("");
 const me=selfProfile();
 setAvatar($("#profilePreview"),me);
}
function updateChatBadge(){
 const badge=$("#chatBadge");if(!badge)return;
 badge.hidden=!state.unread;
 badge.textContent=String(Math.min(99,state.unread||0));
}
function renderActivity(){
 const box=$("#activityList");if(!box)return;
 if(!state.activity.length){box.innerHTML='<div class="activity-item"><span>Sin actividad registrada todavía.</span></div>';$("#loadMoreActivity").hidden=true;return}
 const labels={
  login:"Inicio de sesión",
  logout:"Cierre de sesión",
  save_channel:"Canal de venta actualizado",
  change_password:"Contraseña actualizada",
  profile_photo_updated:"Foto de perfil actualizada",
  chat_message_sent:"Mensaje interno enviado"
 };
 box.innerHTML=state.activity.map(a=>{
  const actor=a.admin_users?.display_name||a.admin_users?.username||"Sistema";
  const detail=a.entity_type==="product"&&a.entity_id?"Producto "+a.entity_id:
    a.action==="chat_message_sent"?"Comunicación interna":
    a.entity_id&&a.entity_type==="admin_user"?"Perfil administrativo":"Operación del sistema";
  return '<div class="activity-item">'+
   '<strong>'+safe(labels[a.action]||a.action)+'</strong>'+
   '<span><b>'+safe(actor)+'</b> · '+safe(detail)+'</span>'+
   '<time>'+safe(formatDate(a.created_at))+'</time>'+
  '</div>';
 }).join("");
 $("#loadMoreActivity").hidden=!state.activityHasMore;
}
function parsePrice(v){return Number(String(v||"").replace(/\D/g,""))||0}
function renderProducts(){
 const q=($("#productSearch")?.value||"").trim().toLowerCase();
 const mode=$("#channelFilter")?.value||"all";
 const rows=state.products.filter(p=>{
  const c=channelState(p);
  if(mode==="selected"&&!c.enabled)return false;
  if(mode==="cardnest"&&c.enabled)return false;
  const hay=[p.id,p.name,p.reference_code,p.category_code,p.product_type].join(" ").toLowerCase();
  return !q||hay.includes(q);
 });
 const box=$("#productsTable");
 if(!rows.length){box.innerHTML='<div class="panel-card">No hay productos con este filtro.</div>';return}
 box.innerHTML=rows.map(p=>{
  const c=channelState(p),img=imageOf(p),status=c.external_status||"draft";
  const disabled=Number(p.stock_quantity)<=0||p.sale_status==="sold_out";
  return '<article class="product-row" data-product="'+safe(p.id)+'">'+
   '<div class="product-main">'+(img?'<img class="product-thumb" src="'+safe(img)+'" alt="">':'<div class="product-thumb"></div>')+
   '<div class="product-copy"><strong>'+safe(p.name)+'</strong><small>'+safe(p.id)+' · '+safe(p.category_code)+' · '+safe(p.reference_code||"Sin referencia")+'</small></div></div>'+
   '<div class="product-stock"><strong>'+safe(String(p.stock_quantity))+' uds.</strong><span>'+safe(p.sale_status||"")+'</span></div>'+
   '<label class="channel-toggle"><input class="ml-toggle" type="checkbox" '+(c.enabled?"checked":"")+' '+(disabled?"disabled":"")+'> Preparar para ML</label>'+
   '<div class="price-wrap"><small>PRECIO ML · PRIVADO</small><input class="price-input" inputmode="numeric" placeholder="$ COP" value="'+(c.price_cop?new Intl.NumberFormat("es-CO").format(c.price_cop):"")+'" '+(disabled?"disabled":"")+'></div>'+
   '<button class="channel-save" type="button" '+(disabled?"disabled":"")+'>Guardar</button>'+
   '<div class="row-status '+(c.enabled?"ready":"")+'">Estado: '+safe(status)+(disabled?" · Producto sin stock":"")+'</div>'+
   '</article>';
 }).join("");
 $$(".product-row").forEach(row=>{
  const input=row.querySelector(".price-input");
  input?.addEventListener("input",()=>{const n=parsePrice(input.value);input.value=n?new Intl.NumberFormat("es-CO").format(n):""});
  row.querySelector(".channel-save")?.addEventListener("click",()=>saveChannel(row));
 });
}
async function saveChannel(row){
 const productId=row.dataset.product,toggle=row.querySelector(".ml-toggle"),priceEl=row.querySelector(".price-input"),status=row.querySelector(".row-status"),btn=row.querySelector(".channel-save");
 const enabled=!!toggle.checked,price=parsePrice(priceEl.value)||null;
 if(enabled&&!price){status.textContent="Debes definir un precio para Mercado Libre.";status.className="row-status error";priceEl.focus();return}
 btn.disabled=true;btn.textContent="Guardando…";
 try{
  const data=await api("save_channel",{product_id:productId,enabled,price_cop:price});
  const p=state.products.find(x=>x.id===productId);if(p)p.mercadolibre=data.channel;
  status.textContent=enabled?"Preparado para Mercado Libre. Aún no se ha publicado.":"Solo CardNest. No está preparado para Mercado Libre.";
  status.className="row-status ready";
  await loadDashboard(false);
 }catch(e){status.textContent=e.message;status.className="row-status error"}
 finally{btn.disabled=false;btn.textContent="Guardar"}
}

async function fileToDataUrl(file,maxBytes){
 if(!file)throw new Error("Selecciona un archivo.");
 if(file.size>maxBytes)throw new Error("El archivo supera el tamaño permitido.");
 return await new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(String(reader.result||""));
  reader.onerror=()=>reject(new Error("No fue posible leer el archivo."));
  reader.readAsDataURL(file);
 });
}

async function heartbeat(){
 if(!state.token)return;
 const data=await api("heartbeat");
 state.profiles=data.profiles||state.profiles;
 state.unread=Number(data.unread)||0;
 renderPresence();renderTeam();updateChatBadge();populateRecipients(false);showPanel();
}

function populateRecipients(reset=true){
 const select=$("#chatRecipient");if(!select)return;
 const others=state.profiles.filter(p=>p.id!==state.user?.id);
 if(!others.length){select.innerHTML='<option value="">Sin otro administrador</option>';state.chatPartnerId="";return}
 const current=state.chatPartnerId||select.value||others[0].id;
 select.innerHTML=others.map(p=>'<option value="'+safe(p.id)+'">'+safe(p.display_name||p.username)+' · '+safe(p.corporate_title||"")+'</option>').join("");
 const valid=others.some(p=>p.id===current)?current:others[0].id;
 select.value=valid;
 if(reset||state.chatPartnerId!==valid){state.chatPartnerId=valid}
 updateRecipientStatus();
}
function updateRecipientStatus(){
 const p=profileById(state.chatPartnerId),label=$("#chatRecipientStatus");
 if(!label)return;
 label.textContent=p?(p.online?"En línea ahora":"Desconectado · último acceso "+formatDate(p.last_login_at)):"—";
 label.className="presence-label "+(p?.online?"online":"");
}
function renderChat(scroll=true){
 const box=$("#chatMessages");if(!box)return;
 if(!state.chatPartnerId){box.innerHTML='<div class="chat-empty">No hay otro administrador disponible.</div>';return}
 if(!state.chatMessages.length){box.innerHTML='<div class="chat-empty">Todavía no hay mensajes en esta conversación.</div>';return}
 const profiles=new Map(state.profiles.map(p=>[p.id,p]));
 box.innerHTML=state.chatMessages.map(m=>{
  const mine=m.sender_id===state.user?.id;
  const sender=profiles.get(m.sender_id);
  let attachment="";
  if(m.attachment_url){
   const isImage=String(m.attachment_mime||"").startsWith("image/");
   attachment=isImage
    ?'<a class="chat-image-link" href="'+safe(m.attachment_url)+'" target="_blank" rel="noopener"><img src="'+safe(m.attachment_url)+'" alt="'+safe(m.attachment_name||"Imagen adjunta")+'"><span>'+safe(m.attachment_name||"Imagen")+'</span></a>'
    :'<a class="chat-file-link" href="'+safe(m.attachment_url)+'" target="_blank" rel="noopener">Adjunto · '+safe(m.attachment_name||"Archivo")+'</a>';
  }
  return '<article class="chat-message '+(mine?"mine":"theirs")+'">'+
   '<div class="chat-message-meta"><strong>'+safe(mine?"Tú":sender?.display_name||"Administrador")+'</strong><time>'+safe(formatDate(m.created_at))+'</time></div>'+
   (m.body?'<div class="chat-bubble">'+safe(m.body).replace(/\n/g,"<br>")+'</div>':"")+
   attachment+
  '</article>';
 }).join("");
 if(scroll)box.scrollTop=box.scrollHeight;
}
async function loadChat(initial){
 if(!state.chatPartnerId)return;
 const data=await api("chat_list",{partner_id:state.chatPartnerId,after_id:initial?0:state.chatLastId});
 state.profiles=data.profiles||state.profiles;
 state.unread=Number(data.unread)||0;
 const incoming=data.messages||[];
 if(initial){
  state.chatMessages=incoming;
 }else if(incoming.length){
  const ids=new Set(state.chatMessages.map(m=>String(m.id)));
  incoming.forEach(m=>{if(!ids.has(String(m.id)))state.chatMessages.push(m)});
 }
 state.chatLastId=state.chatMessages.reduce((n,m)=>Math.max(n,Number(m.id)||0),0);
 updateChatBadge();renderPresence();renderTeam();populateRecipients(false);renderChat(initial||incoming.length>0);
}
async function sendChat(){
 const partner=state.chatPartnerId;
 if(!partner)throw new Error("No hay destinatario disponible.");
 const message=$("#chatMessage").value.trim();
 let attachment=null;
 if(state.selectedChatFile){
  const data=await fileToDataUrl(state.selectedChatFile,5*1024*1024);
  attachment={name:state.selectedChatFile.name,mime:state.selectedChatFile.type||"application/octet-stream",data};
 }
 if(!message&&!attachment)throw new Error("Escribe un mensaje o adjunta un archivo.");
 const out=await api("chat_send",{recipient_id:partner,message,attachment});
 $("#chatMessage").value="";
 $("#chatFile").value="";
 state.selectedChatFile=null;
 $("#chatAttachmentPreview").hidden=true;
 $("#chatAttachmentPreview").innerHTML="";
 $("#chatFileName").textContent="Imagen, PDF o documento · máximo 5 MB";
 if(out.message){
  const exists=state.chatMessages.some(m=>String(m.id)===String(out.message.id));
  if(!exists)state.chatMessages.push(out.message);
  state.chatLastId=Math.max(state.chatLastId,Number(out.message.id)||0);
 }
 renderChat(true);
}

async function loadDashboard(renderProductsToo=true){
 const data=await api("dashboard");
 state.user=data.user;
 state.products=data.products||[];
 state.activity=data.activity||[];
 state.activityHasMore=state.activity.length>=25;
 state.profiles=data.profiles||[];
 state.summary=data.summary||{};
 state.unread=Number(data.unread)||0;
 showPanel();renderSummary();renderPresence();renderTeam();renderActivity();populateRecipients(false);updateChatBadge();
 if(renderProductsToo)renderProducts();
}

$("#adminLoginForm").addEventListener("submit",async e=>{
 e.preventDefault();const status=$("#loginStatus");setStatus(status,"");
 const username=$("#adminUsername").value.trim();
 const remember=$("#rememberUsername").checked;
 const btn=e.currentTarget.querySelector("button");btn.disabled=true;btn.textContent="Validando…";
 try{
  const data=await api("login",{username,password:$("#adminPassword").value});
  if(remember){
   localStorage.setItem(REMEMBER_KEY,username);
   localStorage.setItem(REMEMBER_ACCESS_KEY,"true");
   localStorage.setItem(TOKEN_KEY,data.token);
  }else{
   localStorage.removeItem(REMEMBER_KEY);
   localStorage.removeItem(REMEMBER_ACCESS_KEY);
   localStorage.removeItem(TOKEN_KEY);
  }
  state.token=data.token;state.user=data.user;sessionStorage.setItem(TOKEN_KEY,state.token);$("#adminPassword").value="";
  await loadDashboard();switchView("overview");
 }catch(err){setStatus(status,err.message,"error")}
 finally{btn.disabled=false;btn.textContent="Entrar al panel"}
});

$("#logoutBtn").addEventListener("click",async()=>{
 try{await api("logout")}catch{}
 sessionStorage.removeItem(TOKEN_KEY);state.token="";state.user=null;stopTimers();showLogin();
});

$$(".nav-item").forEach(b=>b.addEventListener("click",()=>switchView(b.dataset.view)));
$$("[data-go-ml]").forEach(b=>b.addEventListener("click",()=>switchView("mercadolibre")));
$$("[data-go-team]").forEach(b=>b.addEventListener("click",()=>switchView("team")));
$$("[data-go-security]").forEach(b=>b.addEventListener("click",()=>switchView("security")));
$("#productSearch").addEventListener("input",renderProducts);
$("#channelFilter").addEventListener("change",renderProducts);

$("#avatarFile").addEventListener("change",async function(){
 const file=this.files?.[0]||null;state.selectedAvatar=file;
 $("#saveAvatar").disabled=!file;
 if(!file){$("#avatarFileName").textContent="JPG, PNG o WebP · máximo 3 MB";renderTeam();return}
 $("#avatarFileName").textContent=file.name+" · "+Math.ceil(file.size/1024)+" KB";
 try{
  if(file.size>3*1024*1024)throw new Error("La foto supera 3 MB.");
  if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("Usa JPG, PNG o WebP.");
  const data=await fileToDataUrl(file,3*1024*1024);
  const preview=$("#profilePreview");preview.innerHTML='<img src="'+safe(data)+'" alt="Vista previa">';
  setStatus($("#avatarStatus"),"Vista previa lista. Pulsa “Guardar foto” para conservarla.","");
 }catch(e){
  state.selectedAvatar=null;this.value="";$("#saveAvatar").disabled=true;setStatus($("#avatarStatus"),e.message,"error");renderTeam();
 }
});
$("#saveAvatar").addEventListener("click",async function(){
 if(!state.selectedAvatar)return;
 const btn=this;btn.disabled=true;btn.textContent="Guardando…";setStatus($("#avatarStatus"),"");
 try{
  const dataUrl=await fileToDataUrl(state.selectedAvatar,3*1024*1024);
  const data=await api("upload_avatar",{file:{name:state.selectedAvatar.name,mime:state.selectedAvatar.type,data:dataUrl}});
  const me=state.profiles.find(p=>p.id===state.user.id);
  if(me){me.avatar_url=data.avatar_url;me.avatar_path=data.avatar_path}
  state.user.avatar_url=data.avatar_url;state.user.avatar_path=data.avatar_path;
  state.selectedAvatar=null;$("#avatarFile").value="";$("#avatarFileName").textContent="JPG, PNG o WebP · máximo 3 MB";
  renderTeam();renderPresence();showPanel();
  setStatus($("#avatarStatus"),"Foto guardada. Quedará asociada a tu perfil en próximos inicios de sesión.","success");
 }catch(e){setStatus($("#avatarStatus"),e.message,"error")}
 finally{btn.disabled=!state.selectedAvatar;btn.textContent="Guardar foto"}
});

$("#chatRecipient").addEventListener("change",function(){
 state.chatPartnerId=this.value;state.chatLastId=0;state.chatMessages=[];updateRecipientStatus();
 loadChat(true).catch(e=>setStatus($("#chatStatus"),e.message,"error"));
});
$("#chatFile").addEventListener("change",function(){
 const file=this.files?.[0]||null;state.selectedChatFile=file;
 const preview=$("#chatAttachmentPreview");
 if(!file){preview.hidden=true;preview.innerHTML="";$("#chatFileName").textContent="Imagen, PDF o documento · máximo 5 MB";return}
 if(file.size>5*1024*1024){
  state.selectedChatFile=null;this.value="";setStatus($("#chatStatus"),"El archivo debe pesar máximo 5 MB.","error");return;
 }
 $("#chatFileName").textContent=file.name+" · "+Math.ceil(file.size/1024)+" KB";
 preview.hidden=false;
 if(file.type.startsWith("image/")){
  const reader=new FileReader();reader.onload=()=>{preview.innerHTML='<img src="'+safe(String(reader.result||""))+'" alt=""><span>'+safe(file.name)+'</span>'};reader.readAsDataURL(file);
 }else preview.innerHTML='<span>Adjunto listo: '+safe(file.name)+'</span>';
});
$("#chatForm").addEventListener("submit",async e=>{
 e.preventDefault();const btn=e.currentTarget.querySelector('button[type="submit"]');btn.disabled=true;btn.textContent="Enviando…";setStatus($("#chatStatus"),"");
 try{await sendChat()}catch(err){setStatus($("#chatStatus"),err.message,"error")}
 finally{btn.disabled=false;btn.textContent="Enviar mensaje"}
});

$("#loadMoreActivity").addEventListener("click",async function(){
 const btn=this,before=state.activity.reduce((min,a)=>Math.min(min,Number(a.id)||Infinity),Infinity);
 if(!Number.isFinite(before))return;
 btn.disabled=true;btn.textContent="Cargando…";
 try{
  const data=await api("activity",{before_id:before});
  state.activity=state.activity.concat(data.activity||[]);
  state.activityHasMore=!!data.has_more;
  renderActivity();
 }catch(e){setStatus($("#productsStatus"),e.message,"error")}
 finally{btn.disabled=false;btn.textContent="Cargar registros anteriores"}
});

$("#passwordForm").addEventListener("submit",async e=>{
 e.preventDefault();const a=$("#newPassword").value,b=$("#confirmPassword").value,status=$("#passwordStatus");
 setStatus(status,"");
 if(a!==b){setStatus(status,"Las contraseñas no coinciden.","error");return}
 const btn=e.currentTarget.querySelector("button");btn.disabled=true;
 try{
  await api("change_password",{new_password:a});
  state.user.must_change_password=false;$("#passwordWarning").hidden=true;$("#newPassword").value="";$("#confirmPassword").value="";
  setStatus(status,"Contraseña actualizada correctamente.","success");
  await loadDashboard(false);
 }catch(err){setStatus(status,err.message,"error")}
 finally{btn.disabled=false}
});

document.addEventListener("visibilitychange",()=>{if(!document.hidden&&state.token)heartbeat().catch(()=>{})});

(async function init(){
 const remembered=localStorage.getItem(REMEMBER_KEY)||"";
 const persistAccess=localStorage.getItem(REMEMBER_ACCESS_KEY)==="true";
 if(remembered)$("#adminUsername").value=remembered;
 $("#rememberUsername").checked=!!remembered||persistAccess
 if(!state.token){showLogin();return}
 try{await loadDashboard();switchView("overview")}catch{sessionStorage.removeItem(TOKEN_KEY);localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(REMEMBER_ACCESS_KEY);state.token="";showLogin()}
})();