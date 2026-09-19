const SUPABASE_URL="https://cnivcnexsqobipvqxero.supabase.co";
const SUPABASE_KEY="sb_publishable_6UjwLuM-op0-OBKWlbusTw_qmLNZVfU";
const ADMIN_API=SUPABASE_URL+"/functions/v1/admin-control";
const TOKEN_KEY="cardnestAdminToken";
const state={token:sessionStorage.getItem(TOKEN_KEY)||"",user:null,products:[],activity:[],summary:{}};

const $=(s)=>document.querySelector(s);
const $$=(s)=>Array.from(document.querySelectorAll(s));
const cop=(n)=>new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",maximumFractionDigits:0}).format(Number(n)||0);
const safe=(v)=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function setStatus(el,msg,type=""){el.hidden=!msg;el.textContent=msg||"";el.className="form-status "+type}
async function api(action,payload={}){
 const res=await fetch(ADMIN_API,{
  method:"POST",
  headers:{"Content-Type":"application/json",apikey:SUPABASE_KEY,...(state.token?{"x-admin-token":state.token}:{})},
  body:JSON.stringify({action,...payload})
 });
 const data=await res.json().catch(()=>({}));
 if(!res.ok){
  if(res.status===401&&action!=="login"){sessionStorage.removeItem(TOKEN_KEY);state.token="";showLogin()}
  throw new Error(data.message||"No fue posible completar la operación.");
 }
 return data;
}
function showLogin(){
 $("#loginView").hidden=false;$("#panelView").hidden=true;
 setTimeout(()=>$("#adminUsername")?.focus(),20);
}
function showPanel(){
 $("#loginView").hidden=true;$("#panelView").hidden=false;
 $("#sidebarUser").textContent=state.user?.display_name||state.user?.username||"Administrador";
 $("#sidebarRole").textContent=state.user?.role==="owner"?"Propietario":"Administrador";
 $("#passwordWarning").hidden=!state.user?.must_change_password;
}
function switchView(name){
 $$(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===name));
 $$(".admin-view").forEach(p=>p.classList.toggle("active",p.dataset.panel===name));
 const labels={overview:"Resumen",mercadolibre:"Mercado Libre",integrations:"Integraciones",activity:"Actividad",security:"Seguridad"};
 $("#viewTitle").textContent=labels[name]||"Centro de mando";
 if(name==="mercadolibre")renderProducts();
}
function imageOf(p){
 const src=String(p.primary_image_url||p.source_image_url||"");
 const m=src.match(/\/d\/([^/]+)/)||src.match(/[?&]id=([^&]+)/);
 if(m)return "https://drive.google.com/thumbnail?id="+m[1]+"&sz=w300";
 return /^https?:\/\//i.test(src)?src:"";
}
function channelState(p){
 return p.mercadolibre||{enabled:false,price_cop:null,external_status:"draft"};
}
function renderSummary(){
 $("#statProducts").textContent=state.summary.products??0;
 $("#statMlSelected").textContent=state.summary.ml_selected??0;
 $("#statMlActive").textContent=state.summary.ml_active??0;
 $("#statSoldOut").textContent=state.summary.sold_out??0;
}
function renderActivity(){
 const box=$("#activityList");
 if(!state.activity.length){box.innerHTML='<div class="activity-item"><span>Sin actividad todavía.</span></div>';return}
 box.innerHTML=state.activity.map(a=>{
  const actor=a.admin_users?.display_name||a.admin_users?.username||"Sistema";
  const labels={login:"Inicio de sesión",logout:"Cierre de sesión",save_channel:"Canal actualizado",change_password:"Contraseña actualizada"};
  return '<div class="activity-item"><strong>'+safe(labels[a.action]||a.action)+'</strong><span>'+safe(actor)+(a.entity_id?" · "+safe(a.entity_id):"")+'</span><time>'+safe(new Date(a.created_at).toLocaleString("es-CO"))+'</time></div>';
 }).join("");
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
async function loadDashboard(render=true){
 const data=await api("dashboard");
 state.user=data.user;state.products=data.products||[];state.activity=data.activity||[];state.summary=data.summary||{};
 showPanel();renderSummary();renderActivity();if(render)renderProducts();
}
$("#adminLoginForm").addEventListener("submit",async e=>{
 e.preventDefault();const status=$("#loginStatus");setStatus(status,"");
 const btn=e.currentTarget.querySelector("button");btn.disabled=true;btn.textContent="Validando…";
 try{
  const data=await api("login",{username:$("#adminUsername").value.trim(),password:$("#adminPassword").value});
  state.token=data.token;state.user=data.user;sessionStorage.setItem(TOKEN_KEY,state.token);$("#adminPassword").value="";
  await loadDashboard();switchView("overview");
 }catch(err){setStatus(status,err.message,"error")}
 finally{btn.disabled=false;btn.textContent="Entrar al panel"}
});
$("#logoutBtn").addEventListener("click",async()=>{
 try{await api("logout")}catch{}
 sessionStorage.removeItem(TOKEN_KEY);state.token="";state.user=null;showLogin();
});
$$(".nav-item").forEach(b=>b.addEventListener("click",()=>switchView(b.dataset.view)));
$$("[data-go-ml]").forEach(b=>b.addEventListener("click",()=>switchView("mercadolibre")));
$$("[data-go-security]").forEach(b=>b.addEventListener("click",()=>switchView("security")));
$("#productSearch").addEventListener("input",renderProducts);
$("#channelFilter").addEventListener("change",renderProducts);
$("#passwordForm").addEventListener("submit",async e=>{
 e.preventDefault();const a=$("#newPassword").value,b=$("#confirmPassword").value,status=$("#passwordStatus");
 setStatus(status,"");
 if(a!==b){setStatus(status,"Las contraseñas no coinciden.","error");return}
 const btn=e.currentTarget.querySelector("button");btn.disabled=true;
 try{
  await api("change_password",{new_password:a});
  state.user.must_change_password=false;$("#passwordWarning").hidden=true;$("#newPassword").value="";$("#confirmPassword").value="";
  setStatus(status,"Contraseña actualizada correctamente.","success");
 }catch(err){setStatus(status,err.message,"error")}
 finally{btn.disabled=false}
});
(async function init(){
 if(!state.token){showLogin();return}
 try{await loadDashboard();switchView("overview")}catch{sessionStorage.removeItem(TOKEN_KEY);state.token="";showLogin()}
})();