const SUPABASE_URL="https://cnivcnexsqobipvqxero.supabase.co";
const SUPABASE_KEY="sb_publishable_6UjwLuM-op0-OBKWlbusTw_qmLNZVfU";
const ADMIN_API=SUPABASE_URL+"/functions/v1/admin-control";
const MERCADOLIBRE_API=SUPABASE_URL+"/functions/v1/mercadolibre-oauth";
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
 mlConnection:null,
 mlLoading:false,
 currentView:"overview",
 heartbeatTimer:null,
 selectedAvatar:null
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

async function mlApi(action,payload={}){
 const res=await fetch(MERCADOLIBRE_API,{
  method:"POST",
  headers:{"Content-Type":"application/json",apikey:SUPABASE_KEY,...(state.token?{"x-admin-token":state.token}:{})},
  body:JSON.stringify({action,...payload})
 });
 const data=await res.json().catch(()=>({}));
 if(!res.ok){
  if(res.status===401){
   sessionStorage.removeItem(TOKEN_KEY);localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(REMEMBER_ACCESS_KEY);state.token="";state.user=null;stopTimers();showLogin();
  }
  throw new Error(data.message||"No fue posible completar la conexión con Mercado Libre.");
 }
 return data;
}

function showLogin(){
 stopTimers();
 const boot=$("#adminBoot");if(boot)boot.hidden=true;
 location.replace("index.html?collab=1");
}
function showFatalPanelError(message){
 const boot=$("#adminBoot");
 if(!boot)return;
 boot.hidden=false;
 boot.classList.add("error");
 boot.innerHTML='<img src="https://drive.google.com/thumbnail?id=1IUSpv73234Nvjz2KC_VhqhuFHSsF0yqN&sz=w1000" alt="CardNest"><strong>No pudimos abrir el centro de mando</strong><span>'+safe(message||"Ocurrió un error inesperado.")+'</span><button type="button" id="retryAdminBoot">Reintentar</button>';
 document.getElementById("retryAdminBoot")?.addEventListener("click",()=>location.reload());
}
function showPanel(){
 const boot=$("#adminBoot");if(boot)boot.hidden=true;
 const panel=$("#panelView");
 if(panel)panel.hidden=false;
 const me=selfProfile();
 const headerName=$("#headerName");
 const headerTitle=$("#headerTitle");
 const passwordWarning=$("#passwordWarning");
 if(headerName)headerName.textContent=me?.display_name||me?.username||"Administrador";
 if(headerTitle)headerTitle.textContent=[me?.corporate_title,me?.professional_title].filter(Boolean).join(" · ")||"Administración";
 setAvatar($("#headerAvatar"),me);
 if(passwordWarning)passwordWarning.hidden=!state.user?.must_change_password;
 startTimers();
}
function stopTimers(){
 if(state.heartbeatTimer)clearInterval(state.heartbeatTimer);
 state.heartbeatTimer=null;
}
function startTimers(){
 stopTimers();
 state.heartbeatTimer=setInterval(()=>heartbeat().catch(()=>{}),15000);
}
function switchView(name){
 state.currentView=name;
 $$(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===name));
 $$(".admin-view").forEach(p=>p.classList.toggle("active",p.dataset.panel===name));
 const labels={overview:"Resumen",team:"Perfil",mercadolibre:"Mercado Libre",integrations:"Integraciones",activity:"Histórico",security:"Seguridad"};
 $("#viewTitle").textContent=labels[name]||"Centro de mando";
 if(name==="mercadolibre"){
  renderProducts();
  loadMlConnection().catch(e=>setStatus($("#mlConnectionStatus"),e.message,"error"));
 }
 if(name==="integrations")loadMlConnection().catch(()=>{});
 if(name==="team")renderProfilePage();
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

function renderMlConnection(){
 const info=state.mlConnection;
 const connected=!!info?.connected;
 const connection=info?.connection||null;
 const overview=$("#mlOverviewStatus");
 const integration=$("#mlIntegrationStatus");
 const stateBox=$("#mlConnectionState");
 const stateLabel=stateBox?.querySelector("strong");
 const text=$("#mlConnectionText");
 const meta=$("#mlAccountMeta");
 const connect=$("#mlConnectBtn");
 const disconnect=$("#mlDisconnectBtn");

 if(overview){
  overview.textContent=connected?"Conectado":"Por conectar";
  overview.className="status "+(connected?"ok":"pending");
 }
 if(integration){
  integration.textContent=connected?"Conectado":"Pendiente de autorización";
  integration.className="status "+(connected?"ok":"pending");
 }
 if(stateBox){
  stateBox.classList.toggle("connected",connected);
 }
 if(stateLabel)stateLabel.textContent=connected?"Cuenta autorizada":"Integración pendiente";
 if(text){
  text.textContent=connected
   ?"CardNest está autorizado para operar con esta cuenta de Mercado Libre."
   :"Autoriza la cuenta principal de Mercado Libre para activar publicaciones, stock y notificaciones.";
 }
 if(meta){
  if(connected&&connection){
   const bits=[
    connection.nickname?String(connection.nickname):"",
    connection.site_id?String(connection.site_id):"",
    connection.user_id?"Usuario "+String(connection.user_id):""
   ].filter(Boolean);
   meta.textContent=bits.join(" · ");
   meta.hidden=!bits.length;
  }else{
   meta.textContent="";
   meta.hidden=true;
  }
 }
 if(connect){
  connect.disabled=state.mlLoading;
  connect.textContent=connected?"Reautorizar cuenta":"Autorizar cuenta";
 }
 if(disconnect){
  disconnect.hidden=!connected;
  disconnect.disabled=state.mlLoading;
 }
}

async function loadMlConnection(){
 if(!state.token||state.mlLoading)return state.mlConnection;
 state.mlLoading=true;
 renderMlConnection();
 try{
  const data=await mlApi("status");
  state.mlConnection=data;
  renderMlConnection();
  return data;
 }finally{
  state.mlLoading=false;
  renderMlConnection();
 }
}

async function startMlConnection(){
 const btn=$("#mlConnectBtn");
 if(btn){btn.disabled=true;btn.textContent="Preparando autorización…"}
 setStatus($("#mlConnectionStatus"),"");
 try{
  const data=await mlApi("start");
  if(!data.authorization_url)throw new Error("Mercado Libre no devolvió una URL de autorización.");
  location.assign(data.authorization_url);
 }catch(e){
  setStatus($("#mlConnectionStatus"),e.message,"error");
  if(btn){btn.disabled=false;btn.textContent=state.mlConnection?.connected?"Reautorizar cuenta":"Autorizar cuenta"}
 }
}

async function disconnectMlConnection(){
 if(!confirm("¿Desconectar la cuenta de Mercado Libre de CardNest?"))return;
 state.mlLoading=true;
 renderMlConnection();
 setStatus($("#mlConnectionStatus"),"");
 try{
  await mlApi("disconnect");
  state.mlConnection={connected:false,connection:null};
  renderMlConnection();
  setStatus($("#mlConnectionStatus"),"Cuenta de Mercado Libre desconectada correctamente.","success");
 }catch(e){
  setStatus($("#mlConnectionStatus"),e.message,"error");
 }finally{
  state.mlLoading=false;
  renderMlConnection();
 }
}

function otherProfile(){
 return state.profiles.find(p=>p.id!==state.user?.id)||null;
}
function onlineText(profile){
 if(!profile)return "Sin información";
 if(profile.online)return "En línea ahora";
 return profile.last_seen_at ? "Desconectado · última actividad "+formatDate(profile.last_seen_at) : "Desconectado";
}
function renderPartnerPresence(){
 const partner=otherProfile();
 const avatar=$("#partnerAvatar");
 const name=$("#partnerName");
 const status=$("#partnerStatus");
 if(avatar)setAvatar(avatar,partner);
 if(name)name.textContent=partner?.display_name||"Otro administrador";
 if(status){
  status.className=partner?.online?"online":"offline";
  status.innerHTML='<i></i> '+safe(onlineText(partner));
 }
 const pageAvatar=$("#profilePartnerAvatar");
 const pageName=$("#profilePartnerName");
 const pageStatus=$("#profilePartnerStatus");
 if(pageAvatar)setAvatar(pageAvatar,partner);
 if(pageName)pageName.textContent=partner?.display_name||"Otro administrador";
 if(pageStatus){
  pageStatus.className="profile-partner-status "+(partner?.online?"online":"offline");
  pageStatus.innerHTML='<i></i> '+safe(onlineText(partner));
 }
}
function renderProfilePage(){
 const me=selfProfile();
 setAvatar($("#profilePreview"),me);
 const name=$("#profileDisplayName");
 const title=$("#profileDisplayTitle");
 const profession=$("#profileDisplayProfession");
 if(name)name.textContent=me?.display_name||me?.username||"Administrador";
 if(title)title.textContent=me?.corporate_title||"Administración";
 if(profession)profession.textContent=me?.professional_title||"";
 renderPartnerPresence();
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
 renderPartnerPresence();renderProfilePage();showPanel();
}

async function loadDashboard(renderProductsToo=true){
 const data=await api("dashboard");
 state.user=data.user;
 state.products=data.products||[];
 state.activity=data.activity||[];
 state.activityHasMore=state.activity.length>=25;
 state.profiles=data.profiles||[];
 state.summary=data.summary||{};
 showPanel();renderSummary();renderPartnerPresence();renderProfilePage();renderActivity();
 if(renderProductsToo)renderProducts();
}

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
$("#mlConnectBtn")?.addEventListener("click",startMlConnection);
$("#mlDisconnectBtn")?.addEventListener("click",disconnectMlConnection);

$("#avatarFile").addEventListener("change",async function(){
 const file=this.files?.[0]||null;state.selectedAvatar=file;
 $("#saveAvatar").disabled=!file;
 if(!file){$("#avatarFileName").textContent="JPG, PNG o WebP · máximo 5 MB";renderProfilePage();return}
 $("#avatarFileName").textContent=file.name+" · "+Math.ceil(file.size/1024)+" KB";
 try{
  if(file.size>5*1024*1024)throw new Error("La foto supera 5 MB.");
  if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("Usa JPG, PNG o WebP.");
  const data=await fileToDataUrl(file,5*1024*1024);
  const preview=$("#profilePreview");preview.innerHTML='<img src="'+safe(data)+'" alt="Vista previa">';
  setStatus($("#avatarStatus"),"Vista previa lista. Pulsa “Guardar foto” para conservarla.","");
 }catch(e){
  state.selectedAvatar=null;this.value="";$("#saveAvatar").disabled=true;setStatus($("#avatarStatus"),e.message,"error");renderProfilePage();
 }
});
$("#saveAvatar").addEventListener("click",async function(){
 if(!state.selectedAvatar)return;
 const btn=this;btn.disabled=true;btn.textContent="Guardando…";setStatus($("#avatarStatus"),"");
 try{
  const dataUrl=await fileToDataUrl(state.selectedAvatar,5*1024*1024);
  const data=await api("upload_avatar",{file:{name:state.selectedAvatar.name,mime:state.selectedAvatar.type,data:dataUrl}});
  const me=state.profiles.find(p=>p.id===state.user.id);
  if(me){me.avatar_url=data.avatar_url;me.avatar_path=data.avatar_path}
  state.user.avatar_url=data.avatar_url;state.user.avatar_path=data.avatar_path;
  state.selectedAvatar=null;$("#avatarFile").value="";$("#avatarFileName").textContent="JPG, PNG o WebP · máximo 5 MB";
  renderProfilePage();renderPartnerPresence();showPanel();
  setStatus($("#avatarStatus"),"Foto guardada. Quedará asociada a tu perfil en próximos inicios de sesión.","success");
 }catch(e){setStatus($("#avatarStatus"),e.message,"error")}
 finally{btn.disabled=!state.selectedAvatar;btn.textContent="Guardar foto"}
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
 if(!state.token){showLogin();return}
 try{
  await loadDashboard();
  await loadMlConnection().catch(()=>null);
  const mlResult=new URLSearchParams(location.search).get("ml");
  if(mlResult){
   switchView("mercadolibre");
   const messages={
    connected:["Mercado Libre quedó conectado con CardNest.","success"],
    denied:["La autorización fue cancelada en Mercado Libre.","error"],
    invalid_state:["La autorización venció o no corresponde a esta sesión. Inténtalo de nuevo.","error"],
    token_error:["Mercado Libre no pudo completar la autorización. Inténtalo de nuevo.","error"],
    storage_error:["La autorización llegó, pero no fue posible guardar los tokens de forma segura.","error"]
   };
   const msg=messages[mlResult]||["No fue posible completar la autorización de Mercado Libre.","error"];
   setStatus($("#mlConnectionStatus"),msg[0],msg[1]);
   history.replaceState({},"",location.pathname+"#mercadolibre");
  }else{
   switchView("overview");
  }
 }catch(error){
  console.error("CardNest admin startup failed",error);
  showFatalPanelError(error?.message||"No fue posible cargar el panel administrativo.");
 }
})();