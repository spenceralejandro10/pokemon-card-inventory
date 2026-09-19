const SUPABASE_URL="https://cnivcnexsqobipvqxero.supabase.co";
const SUPABASE_KEY="sb_publishable_6UjwLuM-op0-OBKWlbusTw_qmLNZVfU";
const WA="573125214785";
const SALE_API=SUPABASE_URL+"/functions/v1/sale-order";
const ADMIN_API=SUPABASE_URL+"/functions/v1/admin-control";
const CATALOG_PAGE_SIZE=48;
const SUPABASE_PAGE_SIZE=1000;
const CATALOG_MAX_REMOTE_ROWS=25000;
const CATALOG_REQUEST_TIMEOUT=12000;

const CATEGORY_LABELS={
 all:"Todos",pokemon:"Pokémon",yugioh:"Yu-Gi-Oh!",digimon:"Digimon",
 dragonball:"Dragon Ball",naruto:"Naruto",accessories:"Accesorios",sealed:"Producto sellado",electronics:"Electrónica",misc:"Coleccionables y más"
};
const CARD_CATEGORIES=new Set(["pokemon","yugioh","digimon","dragonball","naruto"]);
const SHIPPING_ZONES=new Set(["L","R","N","Z","O","E"]);
const PAYMENT_METHODS=new Set(["Nequi","Bre-B / llave bancaria","Bancolombia","Daviplata"]);
const TOP_LOADER_PREFERENCES=new Set(["one_per_card","up_to_three","send_loose","custom"]);
const SHIPPING={
 1:{L:9000,R:10450,N:17830,Z:25750,O:27560,E:42150},
 2:{L:9000,R:10450,N:17830,Z:25750,O:27560,E:42150},
 3:{L:12820,R:16070,N:25420,Z:33600,O:40880,E:61430},
 4:{L:16230,R:19610,N:29270,Z:41250,O:49350,E:65730},
 5:{L:16230,R:19610,N:29270,Z:41250,O:49350,E:65730}
};
const state={
 products:[],favorites:new Map(),offers:{},offerMode:"individual",
 offerHistory:[],category:"all",sort:"featured",visibleLimit:CATALOG_PAGE_SIZE,
 lotOffer:0,order:null,validatedCodes:new Map(),codeHandlingPrice:0,codeShippingWeightKg:1
};

const normalize=function(v){
 return String(v==null?"":v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
};
const cop=function(n){return new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",maximumFractionDigits:0}).format(Number(n)||0)};
const parseCOP=function(v){return Number(String(v||"").replace(/\D/g,""))||0};
function formatCOPInput(el){const n=parseCOP(el.value);el.value=n?new Intl.NumberFormat("es-CO").format(n):""}
function productKey(p){return String(p.category||"product")+"::"+String(p.id)}
function productOffer(p){
 const key=productKey(p);
 if(!state.offers[key]&&state.offers[p.id]){
  state.offers[key]=state.offers[p.id];
  delete state.offers[p.id];
 }
 return state.offers[key]||{};
}
function escapeHTML(value){
 return String(value==null?"":value).replace(/[&<>"']/g,function(char){
  return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char];
 });
}

try{state.offerHistory=(JSON.parse(localStorage.getItem("cardnestOfferHistory")||localStorage.getItem("pokemonOfferHistory")||"[]")||[]).slice(0,3);localStorage.setItem("cardnestOfferHistory",JSON.stringify(state.offerHistory))}catch(e){}
try{
 const draft=JSON.parse(localStorage.getItem("cardnestOfferDraft")||"null");
 if(draft&&typeof draft==="object"){
  if(draft.offers&&typeof draft.offers==="object")state.offers=draft.offers;
  if(draft.mode==="individual"||draft.mode==="lot")state.offerMode=draft.mode;
  state.lotOffer=Math.max(0,Math.min(10000000,Number(draft.lotOffer)||0));
 }
}catch(e){}
let savedFavoriteRefs=[];
try{
 const saved=JSON.parse(localStorage.getItem("cardnestFavorites")||localStorage.getItem("pokemonFavorites")||"[]");
 if(Array.isArray(saved))savedFavoriteRefs=saved;
}catch(e){}

function rarityGroup(p){
 if(p.rarity_group)return p.rarity_group;
 const t=normalize([p.rarity_verified,p.rarity_detected,p.variant,p.canonical_name].filter(Boolean).join(" "));
 if(/\bex\b/.test(t))return "ex";
 if(t.includes("holo")||t.includes("foil")||t.includes("brillo"))return "holo";
 if(t.includes("full art")||t.includes("arte completo")||t.includes("illustration")||/(^|\\s)(ar|sar)(\\s|$)/.test(t))return "fullart";
 return "general";
}
function imageUrl(p){
 const source=String(p.source_image_url||p.image_url||"");
 const driveId=source.match(/\/d\/([^/]+)/)||source.match(/[?&]id=([^&]+)/);
 if(p.image_path)return SUPABASE_URL+"/storage/v1/object/public/card-images/"+p.image_path;
 if(driveId)return "https://drive.google.com/thumbnail?id="+driveId[1]+"&sz=w1000";
 return /^https?:\/\//i.test(source)?source:"";
}
function productName(p){return p.canonical_name||p.name_original||"Producto"}
function productQty(p){return Math.max(1,Number(productOffer(p).qty||1))}
function productStatus(p){
 if(p.demo)return "Inventario de ejemplo";
 if(p.sale_status==="sold_out"||Number(p.stock_quantity)<=0)return "No disponible";
 if(p.condition||p.card_condition)return p.condition||p.card_condition;
 if(p.validation_status==="verified")return "Datos verificados";
 if(p.validation_status)return "Pendiente de verificación";
 return "Información por verificar";
}
function shuffleList(list){
 const a=list.slice();
 for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
 return a;
}
function mixCatalog(list){
 const groups={};
 list.forEach(function(p){(groups[p.category]||(groups[p.category]=[])).push(p)});
 Object.keys(groups).forEach(function(k){groups[k]=shuffleList(groups[k])});
 const out=[],categories=Object.keys(groups),positions={};
 categories.forEach(function(k){positions[k]=0});
 while(categories.some(function(k){return positions[k]<groups[k].length})){
  shuffleList(categories).forEach(function(k){
   if(positions[k]<groups[k].length)out.push(groups[k][positions[k]++]);
  });
 }
 return out;
}

async function fetchJson(url,options){
 const controller=new AbortController();
 const timer=setTimeout(function(){controller.abort()},CATALOG_REQUEST_TIMEOUT);
 try{
  const response=await fetch(url,Object.assign({},options||{},{signal:controller.signal}));
  if(!response.ok)throw new Error("HTTP "+response.status);
  return await response.json();
 }finally{clearTimeout(timer)}
}
async function fetchSupabaseTable(table,headers,filterQuery){
 const rows=[];
 for(let offset=0;offset<CATALOG_MAX_REMOTE_ROWS;offset+=SUPABASE_PAGE_SIZE){
  const filter=filterQuery?filterQuery+"&":"";
  const query="?select=*&"+filter+"order=id.asc&limit="+SUPABASE_PAGE_SIZE+"&offset="+offset;
  const page=await fetchJson(SUPABASE_URL+"/rest/v1/"+table+query,{headers:headers});
  if(!Array.isArray(page))throw new Error("Respuesta inválida al cargar "+table+".");
  rows.push.apply(rows,page);
  if(page.length<SUPABASE_PAGE_SIZE)return rows;
 }
 throw new Error("El inventario supera el límite seguro de carga.");
}
function normalizePokemonRecord(p){
 return Object.assign({},p,{
  category:"pokemon",category_label:"Pokémon",
  card_number:p.card_number||p.number||"",
  stock_quantity:p.stock_quantity==null?1:Number(p.stock_quantity),
  sale_status:p.sale_status||"available",
  rarity_group:rarityGroup(p),demo:false
 });
}
function setCatalogStatus(message,type){
 const box=document.getElementById("catalogStatus");
 if(!box)return;
 box.hidden=!message;
 box.textContent=message||"";
 box.className="catalog-status "+(type||"");
}
function restoreFavorites(){
 const byKey=new Map(state.products.map(function(p){return [productKey(p),p]}));
 savedFavoriteRefs.forEach(function(ref){
  let found=byKey.get(String(ref));
  if(!found)found=state.products.find(function(p){return String(p.id)===String(ref)});
  if(found)state.favorites.set(productKey(found),found);
 });
 savedFavoriteRefs=[];
}
async function loadProducts(){
 setCatalogStatus("Cargando inventario…","loading");
 const headers={apikey:SUPABASE_KEY,Authorization:"Bearer "+SUPABASE_KEY};
 const results=await Promise.allSettled([
  fetchSupabaseTable("cards",headers),
  fetchJson("data/demo-products.json?v=20260918-3"),
  fetchSupabaseTable("electronics_products",headers),
  fetchJson("data/cards.json?v=20260918-1"),
  fetchSupabaseTable("products",headers,"category_code=eq.misc")
 ]);
 const remoteCards=results[0].status==="fulfilled"&&Array.isArray(results[0].value)?results[0].value:[];
 const localCards=results[3].status==="fulfilled"&&Array.isArray(results[3].value)?results[3].value:[];
 const pokemonSource=remoteCards.length?remoteCards:localCards;
 if(!pokemonSource.length)throw new Error("No fue posible cargar el inventario principal.");
 const pokemon=pokemonSource.map(normalizePokemonRecord);
 const demo=results[1].status==="fulfilled"&&Array.isArray(results[1].value)?results[1].value:[];
 const electronicsRaw=results[2].status==="fulfilled"&&Array.isArray(results[2].value)?results[2].value:[];
 const electronics=electronicsRaw.map(function(p){
  return {
   id:p.id,category:"electronics",category_label:"Electrónica",
   canonical_name:p.name,name_original:p.product_type||"",
   language:"",card_number:p.reference_code,
   set_name:[p.brand,p.model].filter(Boolean).join(" · "),
   hp:null,rarity_detected:p.product_type||"Electrónica",rarity_verified:null,
   rarity_group:"general",variant:p.short_specs||"",
   image_path:p.image_path||"",source_image_url:p.source_image_url||"",
   stock_quantity:p.stock_quantity,sale_status:p.sale_status,demo:p.demo,
   electronics_brand:p.brand,electronics_model:p.model,electronics_type:p.product_type,
   electronics_specs:p.short_specs,electronics_compatibility:p.compatibility,
   electronics_power:p.power_info,electronics_color:p.color,electronics_condition:p.condition
  };
 });
 const miscRaw=results[4].status==="fulfilled"&&Array.isArray(results[4].value)?results[4].value:[];
 const misc=miscRaw.map(function(p){
  const a=p.attributes&&typeof p.attributes==="object"?p.attributes:{};
  return {
   id:p.id,category:"misc",category_label:"Coleccionables y más",
   canonical_name:p.name,name_original:p.product_type||"",
   language:"",card_number:p.reference_code||"",
   set_name:[a.object_type,a.theme].filter(Boolean).join(" · "),
   hp:null,rarity_detected:a.object_type||p.product_type||"Coleccionable",rarity_verified:null,
   rarity_group:"general",variant:p.description||a.details||"",
   image_path:p.image_path||"",source_image_url:p.source_image_url||p.primary_image_url||"",
   stock_quantity:p.stock_quantity,sale_status:p.sale_status,demo:!!p.demo,
   condition:p.condition_label||"",
   misc_type:a.object_type||p.product_type||"",
   misc_theme:a.theme||"",
   misc_material:a.material||"",
   misc_dimensions:a.dimensions||"",
   misc_details:a.details||p.description||"",
   generic_brand:p.brand||"",generic_model:p.model||"",generic_description:p.description||""
  };
 });
 state.products=mixCatalog(pokemon.concat(demo,electronics,misc));
 restoreFavorites();
 persistFavorites();
 const partial=[];
 if(!remoteCards.length&&localCards.length)partial.push("inventario Pokémon local");
 if(results[1].status!=="fulfilled")partial.push("categorías de demostración");
 if(results[2].status!=="fulfilled")partial.push("electrónica");
 if(results[4].status!=="fulfilled")partial.push("coleccionables y más");
 setCatalogStatus(partial.length?"Catálogo parcial: no fue posible actualizar "+partial.join(" y ")+".":"",partial.length?"warning":"");
 render();
 updateFavorites();
 updateQuote();
}
function matches(p,q,language,rarity){
 const hay=[p.id,p.canonical_name,p.name_original,p.card_number,p.set_name,p.set_code,p.language,p.rarity_detected,p.rarity_verified,p.variant,p.category_label,p.electronics_brand,p.electronics_model,p.electronics_type,p.electronics_specs,p.electronics_compatibility,p.electronics_power,p.electronics_color,p.generic_brand,p.generic_model,p.generic_description,p.misc_type,p.misc_theme,p.misc_material,p.misc_dimensions,p.misc_details].map(normalize).join(" ");
 const terms=normalize(q).split(/\s+/).filter(Boolean);
 return terms.every(function(term){return hay.includes(term)})&&(!language||p.language===language)&&(!rarity||(p.category==="pokemon"&&rarityGroup(p)===rarity));
}
function sortProducts(list){
 const mode=document.getElementById("sortFilter").value;
 if(mode==="featured")return list;
 const sorted=list.slice();
 sorted.sort(function(a,b){
  if(mode==="name")return productName(a).localeCompare(productName(b),"es",{sensitivity:"base",numeric:true});
  if(mode==="category")return String(CATEGORY_LABELS[a.category]||a.category).localeCompare(String(CATEGORY_LABELS[b.category]||b.category),"es",{sensitivity:"base"})||productName(a).localeCompare(productName(b),"es",{sensitivity:"base"});
  return String(a.id).localeCompare(String(b.id),"es",{numeric:true,sensitivity:"base"});
 });
 return sorted;
}
function render(){
 const grid=document.getElementById("cardsGrid"),tpl=document.getElementById("cardTemplate");
 const q=document.getElementById("searchInput").value;
 const language=document.getElementById("languageFilter").value;
 const rarity=document.getElementById("rarityFilter").value;
 const filtered=state.products.filter(function(p){
  return (state.category==="all"||p.category===state.category)&&matches(p,q,language,rarity);
 });
 const ordered=sortProducts(filtered),list=ordered.slice(0,state.visibleLimit);
 grid.innerHTML="";
 document.getElementById("countLabel").textContent=filtered.length
  ?"Mostrando "+list.length+" de "+filtered.length+" producto"+(filtered.length===1?"":"s")
  :"0 productos";
 const loadMore=document.getElementById("loadMore");
 loadMore.hidden=list.length>=filtered.length;
 if(!loadMore.hidden)loadMore.textContent="Cargar "+Math.min(CATALOG_PAGE_SIZE,filtered.length-list.length)+" productos más";
 if(!list.length){
  grid.innerHTML='<div class="empty"><div class="empty-icon" aria-hidden="true">⌕</div><div class="empty-copy"><strong>Sin resultados con estos filtros</strong><span>No hay productos que coincidan con la combinación actual. Puedes cambiar un filtro o volver a ver todo el catálogo.</span></div><button type="button" data-reset-empty>Ver todos los productos</button></div>';
  grid.querySelector("[data-reset-empty]").onclick=resetFilters;
  return;
 }
 list.forEach(function(p){
  const n=tpl.content.cloneNode(true),card=n.querySelector(".card"),wrap=n.querySelector(".card-image-wrap"),img=n.querySelector(".card-image");
  const src=imageUrl(p);
  if(p.category==="electronics")card.classList.add("electronics-card");
  if(src){
   img.src=src;img.hidden=false;img.alt=productName(p)+" "+(p.card_number||"");
   img.title="Haz clic para ampliar";img.tabIndex=0;img.setAttribute("role","button");
   img.setAttribute("aria-label","Ampliar imagen de "+productName(p));
   img.onclick=function(e){e.preventDefault();e.stopPropagation();openImageViewer(src,p)};
   img.onkeydown=function(e){if(e.key==="Enter"||e.key===" "){e.preventDefault();openImageViewer(src,p)}};
  }else{
   img.hidden=true;wrap.classList.add("image-pending");wrap.setAttribute("data-label",CATEGORY_LABELS[p.category]||"Producto");
  }
  const categoryTag=n.querySelector(".card-category-tag");
  categoryTag.textContent=CATEGORY_LABELS[p.category]||"Producto";
  categoryTag.dataset.category=p.category;
  const demo=n.querySelector(".demo-badge");demo.hidden=!p.demo;
  n.querySelector(".card-name").textContent=productName(p);
  n.querySelector(".original-name").textContent=p.name_original&&p.name_original!==p.canonical_name?p.name_original:"";
  const langBadge=n.querySelector(".language-badge");
  langBadge.textContent=p.language||"—";
  langBadge.hidden=!CARD_CATEGORIES.has(p.category);
  const stock=n.querySelector(".stock-badge"),sold=(p.sale_status==="sold_out"||Number(p.stock_quantity)<=0);
  stock.textContent=sold?"NO DISPONIBLE":String(p.stock_quantity||1)+" disponible"+(Number(p.stock_quantity||1)===1?"":"s");
  stock.classList.toggle("sold",sold);card.classList.toggle("sold-out",sold);
  n.querySelector(".card-id").textContent=p.id;
  n.querySelector(".card-number").textContent=p.card_number||"Pendiente";
  n.querySelector(".card-set").textContent=p.set_name||p.set_code||"Pendiente";
  if(p.category==="electronics"){
   n.querySelector(".card-number").closest("div").querySelector("dt").textContent="Referencia";
   n.querySelector(".card-set").closest("div").querySelector("dt").textContent="Marca / modelo";
   n.querySelector(".card-rarity").closest("div").querySelector("dt").textContent="Características";
   n.querySelector(".card-rarity").textContent=p.electronics_specs||p.variant||"Información pendiente";
   n.querySelector(".card-status").textContent=p.electronics_condition||productStatus(p);
   n.querySelector(".original-name").textContent=[p.electronics_type,p.electronics_brand].filter(Boolean).join(" · ");
  }
  if(p.category==="misc"){
   n.querySelector(".card-number").closest("div").querySelector("dt").textContent="Referencia";
   n.querySelector(".card-set").closest("div").querySelector("dt").textContent="Tipo / tema";
   n.querySelector(".card-rarity").closest("div").querySelector("dt").textContent="Detalles";
   n.querySelector(".card-set").textContent=[p.misc_type,p.misc_theme].filter(Boolean).join(" · ")||"Coleccionable";
   n.querySelector(".card-rarity").textContent=[p.misc_material,p.misc_dimensions,p.misc_details].filter(Boolean).join(" · ")||"Información pendiente";
   n.querySelector(".card-status").textContent=p.condition||productStatus(p);
   n.querySelector(".original-name").textContent=[p.generic_brand,p.misc_type].filter(Boolean).join(" · ");
  }
  const hpRow=n.querySelector(".card-hp-row");
  if(p.hp==null||p.hp===""){hpRow.hidden=true}else n.querySelector(".card-hp").textContent=p.hp;
  if(p.category!=="electronics"&&p.category!=="misc"){
   n.querySelector(".card-rarity").textContent=p.rarity_verified||p.rarity_detected||"General";
   n.querySelector(".card-status").textContent=productStatus(p);
  }
  const fav=n.querySelector(".favorite-btn"),selected=state.favorites.has(productKey(p));
  if(sold){fav.disabled=true;fav.textContent="No disponible"}else{fav.textContent=selected?"♥ Seleccionado":"♡ Me interesa";fav.classList.toggle("selected",selected)}
  if(!sold)fav.onclick=function(){toggleFavorite(p)};
  grid.appendChild(n);
 });
}
["searchInput","languageFilter","rarityFilter","sortFilter"].forEach(function(id){
 document.getElementById(id).addEventListener("input",function(){state.visibleLimit=CATALOG_PAGE_SIZE;render()});
});
document.getElementById("loadMore").onclick=function(){state.visibleLimit+=CATALOG_PAGE_SIZE;render()};
document.querySelectorAll(".catalog-tab").forEach(function(btn){
 btn.addEventListener("click",function(){selectCategory(btn.dataset.category)});
});
document.querySelectorAll("[data-go-category]").forEach(function(btn){
 btn.addEventListener("click",function(){selectCategory(btn.dataset.goCategory)});
});
function selectCategory(cat){
 state.category=cat||"all";
 state.visibleLimit=CATALOG_PAGE_SIZE;
 document.querySelectorAll(".catalog-tab").forEach(function(b){b.classList.toggle("active",b.dataset.category===state.category)});
 document.getElementById("discoverStrip").hidden=state.category!=="all";
 const rarityWrap=document.getElementById("rarityFilterWrap");
 const rarityAllowed=state.category==="all"||state.category==="pokemon";
 rarityWrap.hidden=!rarityAllowed;
 if(!rarityAllowed)document.getElementById("rarityFilter").value="";
 const language=document.getElementById("languageFilter");
 const languageAllowed=state.category==="all"||CARD_CATEGORIES.has(state.category);
 language.hidden=!languageAllowed;
 if(!languageAllowed)language.value="";
 const launch=document.getElementById("electronicsLaunch");
 if(launch)launch.hidden=!(state.category==="all"||state.category==="electronics");
 const search=document.getElementById("searchInput");
 const label=CATEGORY_LABELS[state.category]||"productos";
 search.placeholder=state.category==="all"
  ?"Busca por nombre, número, colección o referencia"
  :(state.category==="accessories"||state.category==="sealed"
    ?"Busca "+label+" por nombre o referencia"
    :state.category==="electronics"
      ?"Busca electrónica por nombre, referencia, marca o modelo"
      :state.category==="misc"
        ?"Busca coleccionables por nombre, referencia, tipo o material"
        :"Busca "+label+" por nombre o número de carta");
 render();
 window.scrollTo({top:document.querySelector(".catalog-nav").offsetTop-20,behavior:"smooth"});
}
const initialParams=new URLSearchParams(location.search);
const requestedCard=initialParams.get("card"),requestedCategory=initialParams.get("category");
if(requestedCard)document.getElementById("searchInput").value=requestedCard;
if(requestedCategory&&CATEGORY_LABELS[requestedCategory])selectCategory(requestedCategory);

function goHome(){
 document.getElementById("searchInput").value="";
 document.getElementById("languageFilter").value="";
 document.getElementById("rarityFilter").value="";
 document.getElementById("sortFilter").value="featured";
 selectCategory("all");
 window.scrollTo({top:0,behavior:"smooth"});
}
function resetFilters(){
 document.getElementById("searchInput").value="";
 document.getElementById("languageFilter").value="";
 document.getElementById("rarityFilter").value="";
 document.getElementById("sortFilter").value="featured";
 state.visibleLimit=CATALOG_PAGE_SIZE;
 render();
 document.querySelector(".search-panel").scrollIntoView({behavior:"smooth",block:"start"});
}
document.getElementById("brandHome").onclick=goHome;
document.getElementById("heroHome").onclick=goHome;
document.getElementById("heroHome").onkeydown=function(event){if(event.key==="Enter"||event.key===" "){event.preventDefault();goHome()}};
document.getElementById("resetFilters").onclick=resetFilters;
const exploreElectronics=document.getElementById("exploreElectronics");
if(exploreElectronics)exploreElectronics.onclick=function(){selectCategory("electronics")};

const discoverMessages=[
 "Productos revisados antes de la venta",
 "Compra acompañada por WhatsApp",
 "Trazabilidad mediante código de venta",
 "Colecciones, accesorios, electrónica y coleccionables"
];
let discoverIndex=0;
setInterval(function(){
 const el=document.getElementById("discoverDynamic");if(!el)return;
 discoverIndex=(discoverIndex+1)%discoverMessages.length;
 el.classList.remove("message-pop");void el.offsetWidth;
 el.textContent=discoverMessages[discoverIndex];
 el.classList.add("message-pop");
},3200);

function persistFavorites(){
 const ids=Array.from(state.favorites.keys());
 localStorage.setItem("cardnestFavorites",JSON.stringify(ids));
 localStorage.setItem("pokemonFavorites",JSON.stringify(ids));
}
function persistOfferDraft(){
 localStorage.setItem("cardnestOfferDraft",JSON.stringify({offers:state.offers,mode:state.offerMode,lotOffer:state.lotOffer}));
}
function setOfferStatus(message,type){
 const box=document.getElementById("offerStatus");
 box.hidden=!message;box.textContent=message||"";box.className="offer-status "+(type||"");
}
function toggleFavorite(p){
 const key=productKey(p);
 if(state.favorites.has(key))state.favorites.delete(key);else state.favorites.set(key,p);
 persistFavorites();updateFavorites();render();
}
function selectedProducts(){return Array.from(state.favorites.values()).filter(Boolean)}
const panelTriggers=new WeakMap();
function syncPanelLock(){
 document.body.classList.toggle("panel-open",!!document.querySelector(".shipping-modal.open,.cart-viewer.open"));
}
function openPanel(panel,backdrop){
 panelTriggers.set(panel,document.activeElement);
 panel.inert=false;panel.classList.add("open");panel.setAttribute("aria-hidden","false");
 backdrop.hidden=false;syncPanelLock();
 requestAnimationFrame(function(){panel.querySelector("button,input,select,textarea,a[href]")?.focus()});
}
function closePanel(panel,backdrop){
 panel.classList.remove("open");panel.setAttribute("aria-hidden","true");panel.inert=true;
 backdrop.hidden=true;syncPanelLock();
 const trigger=panelTriggers.get(panel);
 if(trigger&&document.contains(trigger)&&!trigger.hidden&&!trigger.closest("[inert]"))trigger.focus();
}
function updateFavorites(){
 const products=selectedProducts(),n=products.length;
 document.body.classList.toggle("has-selection",!!n);
 document.getElementById("favoriteCountBar").textContent=n;
 document.getElementById("favoritesBar").hidden=!n;
 const btn=document.getElementById("cartViewerBtn");btn.hidden=!n;
 document.getElementById("cartViewerCount").textContent=n;
 const thumbs=document.getElementById("cartViewerThumbs");thumbs.innerHTML="";
 products.forEach(function(p){
  const src=imageUrl(p);
  if(src){
   const img=document.createElement("img");img.src=src;img.alt=productName(p);img.title=productName(p);
   img.onclick=function(e){e.stopPropagation();openImageViewer(src,p)};thumbs.appendChild(img);
  }else{
   const ph=document.createElement("button");ph.type="button";ph.className="thumb-placeholder";ph.textContent=(CATEGORY_LABELS[p.category]||"Producto").slice(0,3).toUpperCase();
   ph.title=productName(p);ph.onclick=function(e){e.stopPropagation()};thumbs.appendChild(ph);
  }
 });
 if(document.getElementById("cartViewer").classList.contains("open"))renderCartViewer();
 updateQuote();
}
function openCartViewer(){renderCartViewer();openPanel(document.getElementById("cartViewer"),document.getElementById("cartViewerBackdrop"));document.getElementById("openCartViewer").setAttribute("aria-expanded","true")}
function closeCartViewer(){closePanel(document.getElementById("cartViewer"),document.getElementById("cartViewerBackdrop"));document.getElementById("openCartViewer").setAttribute("aria-expanded","false")}
document.getElementById("openCartViewer").onclick=openCartViewer;
document.getElementById("closeCartViewer").onclick=closeCartViewer;
document.getElementById("cartViewerBackdrop").onclick=closeCartViewer;
document.getElementById("thumbPrev").onclick=function(e){e.stopPropagation();document.getElementById("cartViewerThumbs").scrollBy({left:-350,behavior:"smooth"})};
document.getElementById("thumbNext").onclick=function(e){e.stopPropagation();document.getElementById("cartViewerThumbs").scrollBy({left:350,behavior:"smooth"})};
function renderCartViewer(){
 const products=selectedProducts(),g=document.getElementById("cartViewerGrid");
 document.getElementById("cartViewerSubtitle").textContent=products.length+" seleccionado"+(products.length===1?"":"s");
 g.innerHTML="";
 products.forEach(function(p){
  const item=document.createElement("div");item.className="cart-view-card";
  const src=imageUrl(p);
  let media;
  if(src){
   media=document.createElement("img");media.src=src;media.alt=productName(p);media.onclick=function(){openImageViewer(src,p)};
  }else{
   media=document.createElement("div");media.className="cart-placeholder";media.textContent=CATEGORY_LABELS[p.category]||"Producto";
  }
  const info=document.createElement("div"),name=document.createElement("strong"),reference=document.createElement("small");
  name.textContent=productName(p);reference.textContent=String(p.card_number||p.id);info.append(name,reference);
  const remove=document.createElement("button");remove.type="button";remove.className="cart-remove";remove.textContent="Quitar";
  remove.setAttribute("aria-label","Quitar "+productName(p)+" de la selección");
  remove.onclick=function(){toggleFavorite(p)};
  item.append(media,info,remove);
  g.appendChild(item);
 });
 if(!products.length)closeCartViewer();
}

function openFavorites(){setOfferStatus("");renderFavoriteItems();openPanel(document.getElementById("favoritesModal"),document.getElementById("favoritesBackdrop"))}
function closeFavorites(){closePanel(document.getElementById("favoritesModal"),document.getElementById("favoritesBackdrop"))}
document.getElementById("reviewFavorites").onclick=openFavorites;
document.getElementById("closeFavorites").onclick=closeFavorites;
document.getElementById("favoritesBackdrop").onclick=closeFavorites;
document.getElementById("clearFavorites").onclick=function(){
 if(confirm("¿Quieres borrar todos los productos seleccionados?")){
  state.favorites.clear();state.offers={};state.lotOffer=0;
  document.getElementById("lotOffer").value="";
  persistFavorites();persistOfferDraft();updateFavorites();render();closeFavorites();closeCartViewer();
 }
};


const MIN_OFFER_PER_UNIT=3000;
const MAX_OFFER_TOTAL=10000000;
function offerUnitsTotal(){
 return selectedProducts().reduce(function(sum,p){
  return sum+Math.max(1,Number(productOffer(p).qty||1));
 },0);
}
function setOfferInputState(input,valid,message){
 input.classList.toggle("offer-invalid",!valid);
 const label=input.closest("label");
 let help=label.querySelector(".offer-field-help");
 if(!help){help=document.createElement("small");help.className="offer-field-help";label.appendChild(help)}
 help.textContent=message||"";
 help.classList.toggle("error",!valid&&!!message);
}
function renderFavoriteItems(){
 const box=document.getElementById("favoriteItems");box.innerHTML="";
 selectedProducts().forEach(function(p){
  const row=document.createElement("div");row.className="favorite-item";
  const max=Math.max(1,Number(p.stock_quantity||1)),key=productKey(p),o=productOffer(p),disabled=state.offerMode==="lot"?"disabled":"";
  row.innerHTML='<div class="favorite-product-info"><strong>'+escapeHTML(productName(p))+'</strong><small>ID '+escapeHTML(p.id)+' · '+escapeHTML(p.card_number||"Sin referencia")+'</small><small>Disponibles: '+max+'</small><button class="offer-remove" type="button">Quitar de la selección</button></div>'+
   '<div class="offer-controls"><label>Cantidad<input class="qty-input" type="number" min="1" max="'+max+'" value="'+(o.qty||1)+'"></label>'+
   '<label>Oferta por unidad <b>COP</b><div class="money-input"><span>$</span><input class="price-input" inputmode="numeric" maxlength="10" placeholder="Mín. 3.000" '+disabled+' value="'+(o.price?new Intl.NumberFormat("es-CO").format(o.price):"")+'"></div><small class="offer-field-help">Mínimo $3.000 COP por unidad.</small></label></div>';
  const qty=row.querySelector(".qty-input"),price=row.querySelector(".price-input"),remove=row.querySelector(".offer-remove");
  remove.setAttribute("aria-label","Quitar "+productName(p)+" de la selección");
  remove.onclick=function(){toggleFavorite(p);renderFavoriteItems()};
  qty.oninput=function(e){
   const q=Math.min(max,Math.max(1,Number(e.target.value||1)));
   e.target.value=q;
   state.offers[key]=Object.assign({},state.offers[key]||{},{qty:q});
   persistOfferDraft();
   updateOfferTotal();
  };
  price.oninput=function(e){
   let val=parseCOP(e.target.value);
   if(val>MAX_OFFER_TOTAL)val=MAX_OFFER_TOTAL;
   e.target.value=val?new Intl.NumberFormat("es-CO").format(val):"";
   state.offers[key]=Object.assign({},state.offers[key]||{},{price:val});
   persistOfferDraft();
   setOfferInputState(e.target,!val||val>=MIN_OFFER_PER_UNIT,val&&val<MIN_OFFER_PER_UNIT?"La oferta mínima es $3.000 COP.":"Mínimo $3.000 COP por unidad.");
   updateOfferTotal();
  };
  box.appendChild(row);
 });
 renderOfferHistory();updateOfferTotal();
}
function updateOfferTotal(){
 const lot=parseCOP(document.getElementById("lotOffer").value);
 const sum=selectedProducts().reduce(function(a,p){
  const o=productOffer(p);
  return a+Number(o.price||0)*Number(o.qty||1);
 },0);
 const total=state.offerMode==="lot"?lot:sum;
 const totalEl=document.getElementById("offerTotal");
 totalEl.textContent=cop(total)+" COP";
 totalEl.classList.toggle("offer-total-over",total>MAX_OFFER_TOTAL);
 const lotHelp=document.getElementById("lotOfferHelp");
 if(state.offerMode==="lot"){
  const minLot=MIN_OFFER_PER_UNIT*Math.max(1,offerUnitsTotal());
  lotHelp.textContent="Mínimo para este lote: "+cop(minLot)+" COP · Máximo: "+cop(MAX_OFFER_TOTAL)+" COP.";
  lotHelp.classList.toggle("error",!!lot&&(lot<minLot||lot>MAX_OFFER_TOTAL));
 }
}
document.getElementById("lotOffer").oninput=function(e){
 let n=parseCOP(e.target.value);
 if(n>MAX_OFFER_TOTAL)n=MAX_OFFER_TOTAL;
 e.target.value=n?new Intl.NumberFormat("es-CO").format(n):"";
 state.lotOffer=n;persistOfferDraft();setOfferStatus("");
 updateOfferTotal();
};
document.querySelectorAll('input[name="offerMode"]').forEach(function(r){
 r.onchange=function(e){
  state.offerMode=e.target.value;
  document.getElementById("lotOfferBox").hidden=state.offerMode!=="lot";
  persistOfferDraft();setOfferStatus("");
  renderFavoriteItems();
 }
});
document.getElementById("lotOffer").value=state.lotOffer?new Intl.NumberFormat("es-CO").format(state.lotOffer):"";
const restoredOfferMode=document.querySelector('input[name="offerMode"][value="'+state.offerMode+'"]');
if(restoredOfferMode)restoredOfferMode.checked=true;
document.getElementById("lotOfferBox").hidden=state.offerMode!=="lot";
function cardLink(id,category){
 const url=new URL(location.href);
 url.search="";url.hash="";
 url.searchParams.set("card",String(id));
 if(category)url.searchParams.set("category",String(category));
 return url.toString();
}

const clearOfferHistoryBtn=document.getElementById("clearOfferHistory");
if(clearOfferHistoryBtn)clearOfferHistoryBtn.onclick=function(){
 if(!state.offerHistory.length)return;
 if(confirm("¿Eliminar el historial de ofertas guardado en este dispositivo?")){
  state.offerHistory=[];
  localStorage.removeItem("cardnestOfferHistory");
  localStorage.removeItem("pokemonOfferHistory");
  renderOfferHistory();
 }
};
function renderOfferHistory(){
 const box=document.getElementById("offerHistory");if(!box)return;
 if(!state.offerHistory.length){box.innerHTML='<p class="history-empty">Todavía no has enviado ofertas.</p>';return}
 box.innerHTML=state.offerHistory.slice(0,3).map(function(o,index){
  const cards=Array.isArray(o.cards)?o.cards:[],date=new Date(o.date),dateLabel=Number.isNaN(date.getTime())?"Fecha no disponible":date.toLocaleString("es-CO");
  return '<article class="history-card"><div class="history-head"><div><strong>'+escapeHTML(o.id||"Oferta")+'</strong><small>'+escapeHTML(dateLabel)+' · '+cards.length+' referencia'+(cards.length===1?"":"s")+'</small></div><div class="history-total"><strong>'+cop(o.total)+' COP</strong><button type="button" data-delete-offer="'+index+'" aria-label="Eliminar esta oferta">Eliminar</button></div></div>'+
   '<div class="history-cards">'+cards.map(function(c){return '<a href="'+escapeHTML(cardLink(c.id,c.category))+'"><span>'+escapeHTML(c.name||"Producto")+'</span><small>ID '+escapeHTML(c.id)+' · '+escapeHTML(c.number||"Sin número")+' · Cantidad: '+Math.max(1,Number(c.qty)||1)+'</small></a>'}).join("")+'</div></article>';
 }).join("");
 box.querySelectorAll("[data-delete-offer]").forEach(function(button){
  button.onclick=function(){
   state.offerHistory.splice(Number(button.dataset.deleteOffer),1);
   localStorage.setItem("cardnestOfferHistory",JSON.stringify(state.offerHistory));
   renderOfferHistory();
  };
 });
}
document.getElementById("sendOffer").onclick=function(){
 const products=selectedProducts();
 setOfferStatus("");
 if(!products.length){setOfferStatus("Selecciona al menos un producto.","error");return}
 let total=0;
 if(state.offerMode==="lot"){
  const lot=parseCOP(document.getElementById("lotOffer").value);
  const minLot=MIN_OFFER_PER_UNIT*Math.max(1,offerUnitsTotal());
  if(lot<minLot){setOfferStatus("La oferta por el lote debe ser de al menos "+cop(minLot)+" COP.","error");document.getElementById("lotOffer").focus();return}
  if(lot>MAX_OFFER_TOTAL){setOfferStatus("La oferta total no puede superar "+cop(MAX_OFFER_TOTAL)+" COP.","error");document.getElementById("lotOffer").focus();return}
  total=lot;
 }else{
  const invalid=products.find(function(p){return Number(productOffer(p).price||0)<MIN_OFFER_PER_UNIT});
  if(invalid){
   renderFavoriteItems();
   setOfferStatus('Debes asignar una oferta mínima de $3.000 COP a cada producto. Falta: '+productName(invalid)+'.',"error");
   const invalidIndex=products.indexOf(invalid),invalidInput=document.querySelectorAll(".price-input")[invalidIndex];
   if(invalidInput){invalidInput.focus();setOfferInputState(invalidInput,false,"La oferta mínima es $3.000 COP.")}
   return;
  }
  total=products.reduce(function(a,p){
   const o=productOffer(p);
   return a+Number(o.price||0)*Number(o.qty||1);
  },0);
  if(total>MAX_OFFER_TOTAL){setOfferStatus("La oferta total no puede superar "+cop(MAX_OFFER_TOTAL)+" COP.","error");return}
 }
 const ref="OF-"+Date.now().toString(36).toUpperCase();
 const lines=products.map(function(p){
  const o=productOffer(p),qty=Number(o.qty||1),price=Number(o.price||0);
  return state.offerMode==="lot"
   ?"• ID "+p.id+" | "+productName(p)+" | Cantidad: "+qty
   :"• ID "+p.id+" | "+productName(p)+" | Cantidad: "+qty+" | Oferta por unidad: "+cop(price)+" COP | Subtotal: "+cop(price*qty)+" COP";
 });
 const record={id:ref,date:new Date().toISOString(),mode:state.offerMode,total:total,cards:products.map(function(p){return {id:p.id,category:p.category,name:productName(p),number:p.card_number,qty:productQty(p)}})};
 state.offerHistory.unshift(record);
 state.offerHistory=state.offerHistory.slice(0,3);
 localStorage.setItem("cardnestOfferHistory",JSON.stringify(state.offerHistory));
 renderOfferHistory();
 const intro="Hola, equipo CardNest. Estoy interesado en comprar los siguientes productos y quisiera confirmar disponibilidad y revisar mi propuesta.\\n\\nReferencia de oferta: "+ref+"\\nModalidad: "+(state.offerMode==="lot"?"Oferta por el lote completo":"Oferta por producto")+"\\n\\n";
 const totalLine="\\nPropuesta total: "+cop(total)+" COP";
 const note="\\n\\nSi la propuesta es aprobada, por favor envíenme el código de venta para continuar con el pedido y el envío. Gracias.";
 const opened=window.open("https://wa.me/"+WA+"?text="+encodeURIComponent(intro+lines.join("\\n")+totalLine+note),"_blank","noopener");
 if(opened)opened.opener=null;
 setOfferStatus("Oferta preparada. WhatsApp se abrió con el detalle de la propuesta.","success");
};
document.getElementById("startShipping").onclick=function(){closeFavorites();document.getElementById("shippingFab").focus();openShipping()};

document.addEventListener("keydown",function(event){
 const openPanels=Array.from(document.querySelectorAll(".shipping-modal.open,.cart-viewer.open"));
 const panel=openPanels[openPanels.length-1];
 if(!panel)return;
 if(event.key==="Escape"){
  event.preventDefault();
  if(panel.id==="shippingModal")closeShipping();
  else if(panel.id==="favoritesModal")closeFavorites();
  else closeCartViewer();
  return;
 }
 if(event.key!=="Tab")return;
 const focusable=Array.from(panel.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]'))
  .filter(function(element){return !element.hidden&&element.getClientRects().length>0});
 if(!focusable.length)return;
 const first=focusable[0],last=focusable[focusable.length-1];
 if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
 else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
});



function topLoaderQty(){
 if(!document.getElementById("toploaderOption").checked)return 0;
 return Math.max(1,Math.min(100,Number(document.getElementById("toploaderQtyInput").value||1)));
}
function topLoaderPrice(qty){
 qty=Math.max(0,Math.min(100,Number(qty)||0));
 return Math.floor(qty/6)*10000+(qty%6)*2000;
}
function topLoaderPreferenceLabel(value){
 return {
  one_per_card:"Un Top Loader por carta",
  up_to_three:"Hasta 3 cartas por Top Loader",
  send_loose:"Enviar Top Loaders aparte, sin asignar",
  custom:"Otra indicación"
 }[value]||"Sin preferencia";
}
function renderToploaderConfigurator(){
 const enabled=document.getElementById("toploaderOption").checked;
 const config=document.getElementById("toploaderConfigurator");
 config.hidden=!enabled;
 const qtyInput=document.getElementById("toploaderQtyInput");
 if(enabled){
  let q=Math.max(1,Math.min(100,Number(qtyInput.value||1)));
  qtyInput.value=q;
  document.getElementById("toploaderQty").textContent=String(q);
 }else{
  document.getElementById("toploaderQty").textContent="0";
 }
 updateQuote();
}
function updateQuote(){
 const zone=document.getElementById("shippingZone")?.value||"N";
 const hasCode=state.validatedCodes.size>0;
 const kg=Math.max(1,Math.min(5,Number(state.codeShippingWeightKg||1)));
 const topQty=topLoaderQty();
 const topCost=topLoaderPrice(topQty);
 const freight=hasCode?((SHIPPING[kg]&&SHIPPING[kg][zone])||0):0;
 const handling=hasCode?Number(state.codeHandlingPrice||0):0;
 const total=freight+handling+topCost;

 document.getElementById("shippingCardCount").textContent=hasCode?"Código de envío validado":"Valida el código para continuar";
 document.getElementById("shippingRateInfo").textContent=hasCode?"Tarifa Coordinadora calculada según zona":"Tarifa Coordinadora pendiente";
 document.getElementById("toploaderCost").textContent="Top Loaders: "+cop(topCost)+" COP";
 document.getElementById("shippingCost").textContent=hasCode?(cop(freight)+" COP"):"Pendiente";
 document.getElementById("shippingHandling").textContent=hasCode?(cop(handling)+" COP"):"Pendiente";
 document.getElementById("shippingProtection").textContent=cop(topCost)+" COP";
 document.getElementById("shippingTotal").textContent=hasCode?(cop(total)+" COP"):"Pendiente";
}
function openShipping(){
 openPanel(document.getElementById("shippingModal"),document.getElementById("shippingBackdrop"));
 setCheckoutStatus("");
 updateQuote();
}
function closeShipping(){
 closePanel(document.getElementById("shippingModal"),document.getElementById("shippingBackdrop"));
}
document.getElementById("shippingFab").onclick=openShipping;
document.getElementById("closeShipping").onclick=closeShipping;
document.getElementById("shippingBackdrop").onclick=closeShipping;
document.getElementById("shippingZone").addEventListener("input",updateQuote);
document.getElementById("shippingPaymentMethod").addEventListener("input",updateQuote);
document.getElementById("toploaderOption").addEventListener("change",renderToploaderConfigurator);
document.getElementById("toploaderQtyInput").addEventListener("input",function(){
 let q=Math.max(1,Math.min(100,Number(this.value||1)));this.value=q;
 document.getElementById("toploaderQty").textContent=String(q);updateQuote();
});
document.getElementById("customerNotes").addEventListener("input",function(){
 document.getElementById("customerNotesCount").textContent=String(this.value.length);
});
document.getElementById("toploaderNotes").addEventListener("input",function(){
 document.getElementById("toploaderNotesCount").textContent=String(this.value.length);
});

function restrictInputs(){
 const digits=function(id){
  const el=document.getElementById(id);
  el.addEventListener("input",function(){el.value=el.value.replace(/\D/g,"")});
 };
 digits("buyerPhone");digits("buyerDocument");
 ["buyerName","destDepartment","destCity"].forEach(function(id){
  const el=document.getElementById(id);
  el.addEventListener("input",function(){el.value=el.value.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .-]/g,"")});
 });
}
restrictInputs();

function setFieldError(el,message){
 if(!el)return;
 el.classList.add("field-invalid");
 let error=el.closest("label")?.querySelector(".field-error");
 if(!error&&el.closest("label")){
  error=document.createElement("small");error.className="field-error";el.closest("label").appendChild(error);
 }
 if(error)error.textContent=message;
}
function clearFieldError(el){
 if(!el)return;
 el.classList.remove("field-invalid");
 const error=el.closest("label")?.querySelector(".field-error");
 if(error)error.remove();
}
document.querySelectorAll("#checkoutUnlocked input,#checkoutUnlocked select,#checkoutUnlocked textarea").forEach(function(el){
 el.addEventListener("input",function(){clearFieldError(el)});
 el.addEventListener("change",function(){clearFieldError(el)});
});

async function saleApi(payload){
 const controller=new AbortController(),timer=setTimeout(function(){controller.abort()},20000);
 try{
  const res=await fetch(SALE_API,{
   method:"POST",
   headers:{"Content-Type":"application/json",apikey:SUPABASE_KEY,Authorization:"Bearer "+SUPABASE_KEY},
   body:JSON.stringify(payload),
   signal:controller.signal
  });
  const data=await res.json().catch(function(){return {}});
  if(!res.ok){
   const error=new Error(data.message||"No se pudo completar la operación.");
   error.code=data.error||"REQUEST_FAILED";error.status=res.status;
   throw error;
  }
  return data;
 }catch(error){
  if(error&&error.name==="AbortError")throw new Error("La validación tardó demasiado. Intenta nuevamente.");
  throw error;
 }finally{clearTimeout(timer)}
}
function setCodeStatus(type,message){
 const box=document.getElementById("saleCodeStatus");
 box.className="code-status "+(type||"");
 box.textContent=message;
}
function setCheckoutStatus(message,type){
 const box=document.getElementById("checkoutStatus");
 box.hidden=!message;box.textContent=message||"";box.className="checkout-status "+(type||"");
}

function normalizeSaleCodeValue(value){return String(value||"").trim().toUpperCase()}
function validSaleCodeFormat(code){return /^[A-Z0-9][A-Z0-9-]{5,39}$/.test(code)}
function codeInputs(){return Array.from(document.querySelectorAll(".sale-code-input"))}
function enteredSaleCodes(){return codeInputs().map(function(input){return normalizeSaleCodeValue(input.value)}).filter(Boolean)}
function uniqueSaleCodes(){
 const codes=enteredSaleCodes();
 return new Set(codes).size===codes.length?codes:null;
}
function setRowCodeStatus(row,type,message){
 const box=row.querySelector(".sale-code-row-status");
 box.className="sale-code-row-status code-status "+(type||"");
 box.textContent=message;
}
function setCodeStatus(type,message){
 const box=document.getElementById("saleCodeStatus");
 box.className="code-status code-summary "+(type||"");
 box.textContent=message;
}
function setCheckoutStatus(message,type){
 const box=document.getElementById("checkoutStatus");
 box.hidden=!message;box.textContent=message||"";box.className="checkout-status "+(type||"");
}
function moveCheckoutInfoInitial(){
 const info=document.getElementById("checkoutInfo");
 const gate=document.querySelector(".checkout-gate");
 if(info&&gate&&info.previousElementSibling!==gate)gate.insertAdjacentElement("afterend",info);
 info?.classList.add("checkout-info-initial");
}
function moveCheckoutInfoToEnd(){
 const info=document.getElementById("checkoutInfo");
 const unlocked=document.getElementById("checkoutUnlocked");
 if(info&&unlocked){unlocked.appendChild(info);info.classList.remove("checkout-info-initial")}
}
function clearValidatedCodes(){
 state.validatedCodes.clear();
 state.codeHandlingPrice=0;
 state.codeShippingWeightKg=1;
 document.getElementById("checkoutUnlocked").hidden=true;
 moveCheckoutInfoInitial();
 document.getElementById("toploaderOption").checked=false;
 renderToploaderConfigurator();
 updateQuote();
}
function recomputeCodeGate(){
 const rows=Array.from(document.querySelectorAll("[data-code-row]"));
 let handling=0,weight=0,validCount=0,hasUnvalidated=false;
 rows.forEach(function(row){
  const input=row.querySelector(".sale-code-input");
  const code=normalizeSaleCodeValue(input.value);
  if(!code)return;
  const data=state.validatedCodes.get(code);
  if(data){validCount++;handling+=Number(data.handling_price||0);weight+=Math.max(1,Number(data.shipping_weight_kg||1))}
  else hasUnvalidated=true;
 });
 state.codeHandlingPrice=Math.max(0,handling);
 state.codeShippingWeightKg=Math.max(1,Math.min(5,Math.floor(weight||1)));
 const ready=validCount>0&&!hasUnvalidated;
 document.getElementById("checkoutUnlocked").hidden=!ready;
 if(ready){
  setCodeStatus("success",validCount+" código"+(validCount===1?"":"s")+" validado"+(validCount===1?"":"s")+". Ya puedes completar y pagar el envío.");
  document.getElementById("deliveryDetails").open=true;
  moveCheckoutInfoToEnd();
 }else{
  moveCheckoutInfoInitial();
  if(validCount&&hasUnvalidated)setCodeStatus("warning","Valida o elimina los códigos pendientes antes de continuar.");
  else if(!validCount)setCodeStatus("","Valida al menos un código para continuar. Puedes agregar hasta 3.");
 }
 updateQuote();
 return ready;
}
async function validateCodeRow(row,prefix){
 const input=row.querySelector(".sale-code-input");
 const code=normalizeSaleCodeValue(input.value);
 input.value=code;
 if(!code){setRowCodeStatus(row,"error","Escribe un código.");recomputeCodeGate();return false}
 if(!validSaleCodeFormat(code)){setRowCodeStatus(row,"error","Formato de código inválido.");recomputeCodeGate();return false}
 const all=enteredSaleCodes();
 if(all.filter(function(x){return x===code}).length>1){setRowCodeStatus(row,"error","Este código ya fue agregado.");recomputeCodeGate();return false}
 const btn=row.querySelector(".validate-sale-code");
 btn.disabled=true;btn.textContent="Validando…";
 try{
  const data=await saleApi({action:"validate",code:code});
  if(data.valid&&data.ready_for_shipping){
   state.validatedCodes.set(code,data);
   setRowCodeStatus(row,"success",(prefix?prefix+" ":"")+"Código válido.");
   recomputeCodeGate();
   return true;
  }
  state.validatedCodes.delete(code);
  setRowCodeStatus(row,"error",data.message||"Código inválido, vencido o ya utilizado.");
  recomputeCodeGate();return false;
 }catch(e){
  state.validatedCodes.delete(code);
  setRowCodeStatus(row,"error",e.message||"No fue posible validar el código.");
  recomputeCodeGate();return false;
 }finally{
  btn.disabled=false;btn.textContent="Validar";
 }
}
function wireCodeRow(row){
 const input=row.querySelector(".sale-code-input");
 input.addEventListener("input",function(){
  const oldCode=input.dataset.validatedCode||"";
  input.value=input.value.toUpperCase().replace(/[^A-Z0-9-]/g,"");
  if(oldCode&&normalizeSaleCodeValue(input.value)!==oldCode)state.validatedCodes.delete(oldCode);
  input.dataset.validatedCode="";
  setRowCodeStatus(row,"","Pendiente de validación.");
  setCheckoutStatus("");
  recomputeCodeGate();
 });
 row.querySelector(".validate-sale-code").addEventListener("click",async function(){
  const ok=await validateCodeRow(row,"");
  if(ok)input.dataset.validatedCode=normalizeSaleCodeValue(input.value);
 });
 const remove=row.querySelector(".remove-sale-code");
 if(remove)remove.addEventListener("click",function(){
  const code=normalizeSaleCodeValue(input.value);
  if(code)state.validatedCodes.delete(code);
  row.remove();
  document.getElementById("addSaleCode").disabled=document.querySelectorAll("[data-code-row]").length>=3;
  recomputeCodeGate();
 });
}
function addSaleCodeRow(value){
 const container=document.getElementById("saleCodeRows");
 if(container.querySelectorAll("[data-code-row]").length>=3)return null;
 const row=document.createElement("div");
 row.className="sale-code-row";row.setAttribute("data-code-row","");
 row.innerHTML='<div class="code-validator"><input class="sale-code-input" maxlength="40" autocomplete="off" autocapitalize="characters" spellcheck="false" pattern="[A-Za-z0-9-]{6,40}" aria-label="Código de venta adicional" placeholder="Otro código de compra"><button class="validate-sale-code" type="button">Validar</button><button class="remove-sale-code" type="button" aria-label="Eliminar este código">×</button></div><div class="sale-code-row-status code-status" aria-live="polite">Código adicional.</div>';
 container.appendChild(row);
 if(value)row.querySelector(".sale-code-input").value=value;
 wireCodeRow(row);
 document.getElementById("addSaleCode").disabled=container.querySelectorAll("[data-code-row]").length>=3;
 return row;
}
document.querySelectorAll("[data-code-row]").forEach(wireCodeRow);
document.getElementById("addSaleCode").onclick=function(){addSaleCodeRow("")};

const useDemoSaleCode=document.getElementById("useDemoSaleCode");
async function findAvailableDemoCodes(limit){
 const candidates=["CN-PRUEBA-001","CN-PRUEBA-002","CN-PRUEBA-003"].concat(Array.from({length:30},function(_,i){return "CN-TEST-"+String(i+1).padStart(3,"0")}));
 const found=[];
 for(const code of candidates){
  if(found.length>=limit)break;
  try{
   const data=await saleApi({action:"validate",code:code});
   if(data.valid&&data.ready_for_shipping)found.push({code:code,data:data});
  }catch(e){}
 }
 return found;
}
if(useDemoSaleCode)useDemoSaleCode.onclick=async function(){
 const btn=this;btn.disabled=true;btn.textContent="Buscando…";clearValidatedCodes();
 try{
  document.querySelectorAll("[data-code-row]").forEach(function(row,i){if(i>0)row.remove()});
  const first=document.querySelector("[data-code-row]");
  first.querySelector(".sale-code-input").value="";
  setRowCodeStatus(first,"","Buscando códigos temporales.");
  const found=await findAvailableDemoCodes(3);
  if(!found.length){setCodeStatus("error","No quedan códigos temporales disponibles.");return}
  found.forEach(function(entry,i){
   const row=i===0?first:addSaleCodeRow("");
   const input=row.querySelector(".sale-code-input");
   input.value=entry.code;input.dataset.validatedCode=entry.code;
   state.validatedCodes.set(entry.code,entry.data);
   setRowCodeStatus(row,"success","Código de prueba válido.");
  });
  document.getElementById("addSaleCode").disabled=found.length>=3;
  recomputeCodeGate();
 }catch(e){clearValidatedCodes();setCodeStatus("error","No fue posible preparar los códigos de prueba.")}
 finally{btn.disabled=false;btn.textContent="Preparar prueba"}
};

document.getElementById("fillTestCheckout").onclick=function(){
 document.getElementById("buyerName").value="Cliente Prueba";
 document.getElementById("buyerEmail").value="cliente.prueba@example.com";
 document.getElementById("buyerPhone").value="3001234567";
 document.getElementById("buyerDocument").value="123456789";
 document.getElementById("destDepartment").value="Cundinamarca";
 document.getElementById("destCity").value="Bogota";
 document.getElementById("destAddress").value="Calle 100 # 15-20";
 document.getElementById("destNeighborhood").value="Chico";
 document.getElementById("destReference").value="Porteria principal";
 document.getElementById("customerNotes").value="Prueba de flujo CardNest.";
 document.getElementById("customerNotesCount").textContent=String(document.getElementById("customerNotes").value.length);
 document.getElementById("deliveryConsent").checked=true;
 document.getElementById("shippingZone").value="N";
 document.getElementById("shippingPaymentMethod").value="Nequi";
 document.getElementById("toploaderOption").checked=true;
 document.getElementById("toploaderQtyInput").value="6";
 document.getElementById("toploaderPreference").value="one_per_card";
 document.getElementById("toploaderNotes").value="Aplicar primero a las cartas de mayor valor.";
 document.getElementById("toploaderNotesCount").textContent=String(document.getElementById("toploaderNotes").value.length);
 document.querySelectorAll("#checkoutUnlocked .field-invalid").forEach(clearFieldError);
 setCheckoutStatus("Datos temporales cargados. Revisa la cotización antes de generar el pedido.","success");
 renderToploaderConfigurator();
};

function buyerData(){
 return {
  name:document.getElementById("buyerName").value.trim(),
  email:document.getElementById("buyerEmail").value.trim(),
  phone:document.getElementById("buyerPhone").value.trim(),
  document:document.getElementById("buyerDocument").value.trim(),
  department:document.getElementById("destDepartment").value.trim(),
  city:document.getElementById("destCity").value.trim(),
  address:document.getElementById("destAddress").value.trim(),
  neighborhood:document.getElementById("destNeighborhood").value.trim(),
  reference:document.getElementById("destReference").value.trim(),
  notes:document.getElementById("customerNotes").value.trim(),
  consent:document.getElementById("deliveryConsent").checked
 };
}
function validateBuyer(b){
 let ok=true;
 const letters=/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .-]+$/;
 const email=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
 const fields={
  name:document.getElementById("buyerName"),
  email:document.getElementById("buyerEmail"),
  phone:document.getElementById("buyerPhone"),
  document:document.getElementById("buyerDocument"),
  department:document.getElementById("destDepartment"),
  city:document.getElementById("destCity"),
  address:document.getElementById("destAddress"),
  neighborhood:document.getElementById("destNeighborhood"),
  consent:document.getElementById("deliveryConsent")
 };
 Object.values(fields).forEach(clearFieldError);
 if(!b.name||b.name.length<2||b.name.length>80||!letters.test(b.name)){setFieldError(fields.name,"Completa un nombre válido usando solo letras.");ok=false}
 if(!email.test(b.email)||b.email.length>100){setFieldError(fields.email,"Completa un correo electrónico válido.");ok=false}
 if(!/^\d{7,15}$/.test(b.phone)){setFieldError(fields.phone,"Completa un celular de 7 a 15 números.");ok=false}
 if(!/^\d{5,20}$/.test(b.document)){setFieldError(fields.document,"Completa la identificación usando solo números.");ok=false}
 if(!b.department||b.department.length>60||!letters.test(b.department)){setFieldError(fields.department,"Completa el departamento.");ok=false}
 if(!b.city||b.city.length>60||!letters.test(b.city)){setFieldError(fields.city,"Completa la ciudad o municipio.");ok=false}
 if(b.address.length<5||b.address.length>120){setFieldError(fields.address,"Completa la dirección de entrega.");ok=false}
 if(b.neighborhood.length<2||b.neighborhood.length>80){setFieldError(fields.neighborhood,"Completa el barrio o sector.");ok=false}
 if(b.notes.length>300){setFieldError(document.getElementById("customerNotes"),"Máximo 300 caracteres.");ok=false}
 if(!b.consent){setFieldError(fields.consent,"Debes confirmar que los datos de entrega son correctos.");ok=false}
 if(!ok){
  document.getElementById("deliveryDetails").open=true;
  document.querySelector(".field-invalid")?.scrollIntoView({behavior:"smooth",block:"center"});
 }
 return ok;
}
function validOrderResponse(order){
 if(!order||typeof order!=="object")return false;
 const expiresAt=new Date(order.expires_at).getTime();
 const values=[order.shipping_price,order.handling_price,order.protection_price,order.shipping_total].map(Number);
 const responseCodes=Array.isArray(order.sale_codes)&&order.sale_codes.length?order.sale_codes:[order.sale_code];
 if(!order.id||responseCodes.length<1||responseCodes.length>3||responseCodes.some(function(code){return !validSaleCodeFormat(String(code||""))})||!Number.isFinite(expiresAt)||expiresAt<=Date.now())return false;
 if(values.some(function(value){return !Number.isFinite(value)||value<0}))return false;
 if(!PAYMENT_METHODS.has(order.payment_method)||!String(order.payment_destination||"").trim())return false;
 const topLoaderQty=Number(order.top_loader_qty||0);
 if(!Number.isInteger(topLoaderQty)||topLoaderQty<0||topLoaderQty>100)return false;
 return Math.abs(values[0]+values[1]+values[2]-values[3])<=1;
}
function validStoredOrder(order){
 if(!validOrderResponse(order)||!order.buyer||typeof order.buyer!=="object")return false;
 return ["name","email","phone","document","department","city","address","neighborhood"].every(function(field){
  return typeof order.buyer[field]==="string"&&order.buyer[field].trim().length>0;
 });
}
document.getElementById("createOrder").onclick=async function(){
 setCheckoutStatus("");
 const codes=uniqueSaleCodes();
 if(!codes||codes.length<1||codes.length>3||codes.some(function(code){return !validSaleCodeFormat(code)||!state.validatedCodes.has(code)})){
  setCheckoutStatus("Valida todos los códigos ingresados antes de continuar. Puedes usar entre 1 y 3.","error");
  document.querySelector(".sale-code-input")?.focus();return;
 }
 const b=buyerData();
 if(!validateBuyer(b)){setCheckoutStatus("Revisa los campos marcados antes de continuar.","error");return}

 const paymentMethod=document.getElementById("shippingPaymentMethod"),shippingZone=document.getElementById("shippingZone");
 if(!PAYMENT_METHODS.has(paymentMethod.value)){
  document.getElementById("shippingDetails").open=true;
  setFieldError(paymentMethod,"Selecciona el medio para pagar el envío.");
  paymentMethod.scrollIntoView({behavior:"smooth",block:"center"});
  setCheckoutStatus("Selecciona un medio de pago válido.","error");
  return;
 }
 if(!SHIPPING_ZONES.has(shippingZone.value)){setCheckoutStatus("Selecciona una zona de envío válida.","error");return}
 const topEnabled=document.getElementById("toploaderOption").checked;
 const topQty=topEnabled?topLoaderQty():0;
 const topPreference=topEnabled?document.getElementById("toploaderPreference").value:"";
 const topNotes=topEnabled?document.getElementById("toploaderNotes").value.trim():"";
 if(topEnabled&&!TOP_LOADER_PREFERENCES.has(topPreference)){
  document.getElementById("toploaderDetails").open=true;
  setFieldError(document.getElementById("toploaderPreference"),"Selecciona cómo quieres usar los Top Loaders.");
  setCheckoutStatus("Revisa la configuración de Top Loaders.","error");
  return;
 }
 if(topNotes.length>180||(topEnabled&&topPreference==="custom"&&topNotes.length<3)){
  document.getElementById("toploaderDetails").open=true;
  setFieldError(document.getElementById("toploaderNotes"),topNotes.length>180?"Máximo 180 caracteres.":"Describe brevemente cómo quieres usarlos.");
  setCheckoutStatus("Revisa la indicación de Top Loaders.","error");
  return;
 }

 const btn=this;let generated=false;btn.disabled=true;btn.textContent="Generando pedido y PDF...";
 try{
  const data=await saleApi({
   action:"create_order",
   codes:codes,
   buyer:b,
   customerNotes:b.notes,
   deliveryConsent:b.consent,
   topLoaderQty:topQty,
   topLoaderPreference:topPreference,
   topLoaderNotes:topNotes,
   shippingZone:shippingZone.value,
   paymentMethod:paymentMethod.value
  });
  if(!data.ok||!validOrderResponse(data.order))throw new Error("El servidor devolvió una respuesta incompleta. No se generó el comprobante.");
  state.order=Object.assign({},data.order,{buyer:b});
  localStorage.setItem("cardnestPendingOrder",JSON.stringify(state.order));
  refreshPendingOrderNotice();
  showReceipt();
  const pdfReady=downloadOrderPDF();
  setCodeStatus("success","Pedido generado correctamente. Conserva este código para seguimiento.");
  setCheckoutStatus(pdfReady?"Pedido generado y PDF descargado correctamente.":"Pedido generado. No fue posible descargar el PDF; usa el botón “Descargar PDF nuevamente”.",pdfReady?"success":"warning");
  generated=true;
  btn.disabled=true;
  btn.textContent="Pedido generado";
 }catch(e){
  if(e.code==="INVALID_OR_EXPIRED_CODE"){
   clearValidatedCodes();setCodeStatus("error","Uno de los códigos ya no está disponible. Solicita uno nuevo al analista.");
  }
  setCheckoutStatus(e.message||"No fue posible generar el pedido.","error");
 }finally{
  if(!generated){btn.disabled=false;btn.textContent="Generar pedido y descargar PDF";}
 }
};


function makeOrderQRDataUrl(order){
 if(typeof QRCode==="undefined")return null;
 try{
  const holder=document.createElement("div");
  holder.style.position="fixed";holder.style.left="-9999px";holder.style.top="-9999px";
  document.body.appendChild(holder);
  const qrText="https://wa.me/"+WA+"?text="+encodeURIComponent(
   "Hola CardNest. Consulta del pedido "+order.id+" / códigos "+(Array.isArray(order.sale_codes)?order.sale_codes.join(", "):order.sale_code)
  );
  new QRCode(holder,{text:qrText,width:180,height:180,correctLevel:QRCode.CorrectLevel.M});
  const canvas=holder.querySelector("canvas");
  const img=holder.querySelector("img");
  const data=canvas?canvas.toDataURL("image/png"):(img?img.src:null);
  holder.remove();
  return data;
 }catch(e){return null}
}

function buildPdf(){
 if(!state.order||!window.jspdf)return null;
 const jsPDF=window.jspdf.jsPDF,d=new jsPDF({unit:"mm",format:"a4"}),o=state.order;
 const navy=[24,50,75],gold=[244,197,66],ink=[27,39,51],muted=[96,113,127],soft=[244,247,249],line=[214,223,230],green=[20,112,78];
 let y=0;

 function setText(color,size,style,font){
  d.setTextColor.apply(d,color||ink);
  d.setFont(font||"helvetica",style||"normal");
  d.setFontSize(size||10);
 }
 function newPage(){
  d.addPage();
  setText(navy,9,"bold");d.text("CardNest",14,13);
  setText(muted,7.5,"normal");d.text("Pedido "+String(o.id||""),196,13,{align:"right"});
  d.setDrawColor.apply(d,line);d.line(14,16,196,16);y=23;
  d.setDrawColor.apply(d,line);
  d.setLineWidth(.2);
 }
 function ensure(h){if(y+h>278)newPage()}
 function sectionTitle(title,subtitle){
  ensure(18);
  setText(navy,12,"bold");d.text(title,14,y);
  if(subtitle){setText(muted,8.5,"normal");d.text(subtitle,14,y+5)}
  y+=subtitle?10:7;
  d.setDrawColor.apply(d,line);d.line(14,y,196,y);y+=6;
 }
 function infoRow(label,value,x,w,height,lines){
  const lx=x||14,ww=w||86,rowHeight=height||16,valueLines=lines||d.splitTextToSize(String(value||"—"),ww-8);
  d.setFillColor.apply(d,soft);d.roundedRect(lx,y,ww,rowHeight,2,2,"F");
  setText(muted,7.5,"bold");d.text(label.toUpperCase(),lx+4,y+5);
  setText(ink,10,"bold");
  d.text(valueLines,lx+4,y+10);
 }
 function infoPair(l1,v1,l2,v2){
  const leftLines=d.splitTextToSize(String(v1||"—"),79),rightLines=d.splitTextToSize(String(v2||"—"),83);
  const height=Math.max(16,11+Math.max(leftLines.length,rightLines.length)*4.4);
  ensure(height+4);infoRow(l1,v1,14,87,height,leftLines);infoRow(l2,v2,105,91,height,rightLines);y+=height+4;
 }
 function fieldLine(label,value){
  ensure(9);
  setText(muted,8,"bold");d.text(label,14,y);
  setText(ink,9.2,"normal");
  const lines=d.splitTextToSize(String(value||"—"),132);
  d.text(lines,61,y);y+=Math.max(6,lines.length*4.7);
 }
 function moneyRow(label,value,bold){
  ensure(8);
  setText(bold?ink:muted,9,bold?"bold":"normal");d.text(label,18,y);
  setText(bold?green:ink,bold?11:9,bold?"bold":"normal");
  d.text(String(value),192,y,{align:"right"});
  y+=7;
 }

 // Header
 d.setFillColor.apply(d,navy);d.rect(0,0,210,38,"F");
 d.setFillColor.apply(d,gold);d.rect(0,38,210,2,"F");
 setText([255,255,255],22,"bold");d.text("CardNest",14,16);
 setText([217,230,239],9,"normal");d.text("Orden y comprobante de pago del envío",14,23);
 setText([255,255,255],9,"bold");d.text("PEDIDO "+o.id,196,15,{align:"right"});
 setText([217,230,239],8,"normal");d.text("Código(s) "+(Array.isArray(o.sale_codes)?o.sale_codes.join(" · "):o.sale_code),196,22,{align:"right",maxWidth:85});
 y=49;

 // Status strip + QR
 d.setFillColor(234,247,240);d.roundedRect(14,y,136,24,3,3,"F");
 setText(green,8,"bold");d.text("ESTADO DEL PEDIDO",19,y+7);
 setText(ink,11,"bold");d.text("Pendiente de confirmación del pago del envío",19,y+14);
 setText(muted,7.5,"normal");d.text("Válido hasta "+new Date(o.expires_at).toLocaleString("es-CO"),19,y+20);

 const qr=makeOrderQRDataUrl(o);
 if(qr){
  d.setFillColor(255,255,255);d.roundedRect(157,y-2,39,39,3,3,"F");
  d.addImage(qr,"PNG",160,y+1,33,33);
  setText(muted,6.7,"bold");d.text("QR · WhatsApp pedido",176.5,y+39,{align:"center"});
 }
 y+=33;

 sectionTitle("Datos del cliente","Información suministrada para preparar el despacho");
 infoPair("Nombre completo",o.buyer.name,"Documento",o.buyer.document);
 infoPair("Correo electrónico",o.buyer.email,"Celular",o.buyer.phone);
 fieldLine("Departamento",o.buyer.department);
 fieldLine("Ciudad / municipio",o.buyer.city);
 fieldLine("Dirección",o.buyer.address);
 fieldLine("Barrio / sector",o.buyer.neighborhood);
 fieldLine("Indicaciones",o.buyer.reference||"Sin indicaciones");
 fieldLine("Observaciones",o.buyer.notes||"Sin observaciones");
 y+=4;

 sectionTitle("Pago del envío","Esta orden corresponde únicamente a los costos asociados al envío");
 ensure(48);
 d.setFillColor(249,251,252);d.roundedRect(14,y,182,43,3,3,"F");
 y+=9;
 moneyRow("Flete Coordinadora",cop(o.shipping_price)+" COP");
 moneyRow("Manejo logístico",cop(o.handling_price)+" COP");
 moneyRow("Top Loaders ("+Number(o.top_loader_qty||0)+")",cop(o.protection_price)+" COP");
 d.setDrawColor.apply(d,line);d.line(18,y-2,192,y-2);
 moneyRow("TOTAL A PAGAR AHORA",cop(o.shipping_total)+" COP",true);
 y+=3;
 fieldLine("Medio de pago",o.payment_method);
 fieldLine("Datos de pago",o.payment_destination);
 if(Number(o.top_loader_qty||0)>0){
  fieldLine("Uso Top Loaders",topLoaderPreferenceLabel(o.top_loader_preference));
  fieldLine("Indicación",o.top_loader_notes||"Sin indicaciones");
 }
 y+=4;

 sectionTitle("Confirmación y seguimiento");
 ensure(54);
 d.setFillColor(255,249,231);d.roundedRect(14,y,182,24,3,3,"F");
 setText([103,82,23],8.4,"bold");
 const warning=o.payment_demo
  ?"MODO PRUEBA · Los datos de pago mostrados son temporales. NO REALICES PAGOS REALES."
  :"Cuando CardNest confirme la recepción del pago del envío, el pedido pasa a alistamiento y preparación para despacho.";
 d.text(d.splitTextToSize(warning,170),20,y+8);
 y+=31;

 // Demo responsible analyst / signature
 setText(muted,7.5,"bold");d.text("RESPONSABLE COMERCIAL (DEMO)",14,y);
 y+=7;
 setText(navy,18,"italic","times");d.text("Alessio Romano",14,y);
 y+=5;
 d.setDrawColor(90,110,124);d.line(14,y,78,y);
 y+=5;
 setText(ink,8.5,"bold");d.text("Alessio Romano · Analista de Ventas",14,y);
 setText(muted,7.5,"normal");d.text("CardNest Sales Operations · Demo",14,y+5);
 d.text("Tel. demo: +39 000 000 0000 · alessio.romano@example.com",14,y+10);

 const pages=d.getNumberOfPages();
 for(let page=1;page<=pages;page++){
  d.setPage(page);d.setDrawColor.apply(d,line);d.line(14,285,196,285);
  setText(muted,7,"normal");
  d.text("Documento generado electrónicamente por CardNest · Conserva el código de venta para seguimiento.",14,290);
  d.text("Página "+page+" de "+pages,196,290,{align:"right"});
 }
 return d;
}
function downloadOrderPDF(){
 try{
  const d=buildPdf();
  if(!d)return false;
  d.save("CardNest-envio-"+state.order.id+".pdf");
  return true;
 }catch(error){console.error("PDF generation failed",error);return false}
}
document.getElementById("downloadReceipt").onclick=function(){
 if(!downloadOrderPDF())setCheckoutStatus("No fue posible preparar el PDF. Recarga la página e intenta nuevamente.","error");
};

let receiptTimer=null;

function resetCheckoutToCodeEntry(){
 document.querySelector(".checkout-gate").hidden=false;
 document.getElementById("checkoutInfo").hidden=false;
 document.getElementById("checkoutUnlocked").hidden=true;
 ["fillTestCheckout","deliveryDetails","toploaderDetails","shippingDetails","createOrder"].forEach(function(id){
  const el=document.getElementById(id);if(el)el.hidden=false;
 });
 document.getElementById("orderReceipt").hidden=true;
 document.getElementById("shippingTitle").textContent="Finaliza tu compra";
 const lead=document.querySelector("#shippingModal > .modal-lead");
 if(lead)lead.textContent="Para continuar debes validar el código de venta que te entrega el analista después de acordar tu compra por WhatsApp.";
 const fab=document.getElementById("shippingFab"),fabCopy=fab.querySelector("span"),fabHint=fab.querySelector("small");
 if(fabCopy&&fabCopy.firstChild)fabCopy.firstChild.nodeValue="Programa tu envío";
 if(fabHint)fabHint.textContent="Paga los productos al recibir";
 clearValidatedCodes();
 moveCheckoutInfoInitial();
 const rows=Array.from(document.querySelectorAll("[data-code-row]"));
 rows.forEach(function(row,i){if(i>0)row.remove()});
 const codeInput=document.querySelector(".sale-code-input");
 if(codeInput){codeInput.value="";codeInput.dataset.validatedCode="";setRowCodeStatus(rows[0],"","Código principal.");codeInput.focus()}
 document.getElementById("addSaleCode").disabled=false;
 setCodeStatus("","Valida al menos un código para continuar. Puedes agregar hasta 3.");
}
function refreshPendingOrderNotice(){
 const notice=document.getElementById("pendingOrderNotice");
 const label=document.getElementById("pendingOrderLabel");
 if(!notice||!label)return;
 const valid=validStoredOrder(state.order);
 notice.hidden=!valid;
 if(valid){
  label.textContent=((Array.isArray(state.order.sale_codes)?state.order.sale_codes.join(" · "):state.order.sale_code)||state.order.id)+" · vence "+new Date(state.order.expires_at).toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"});
 }
}
function showCompletedCheckout(){
 document.querySelector(".checkout-gate").hidden=true;
 document.getElementById("checkoutInfo").hidden=true;
 document.getElementById("checkoutUnlocked").hidden=false;
 ["fillTestCheckout","deliveryDetails","toploaderDetails","shippingDetails","createOrder"].forEach(function(id){
  document.getElementById(id).hidden=true;
 });
 document.getElementById("shippingTitle").textContent="Pedido generado";
 const lead=document.querySelector("#shippingModal > .modal-lead");
 if(lead)lead.textContent="Conserva el código y el PDF mientras confirmas el pago del envío con CardNest.";
 const fab=document.getElementById("shippingFab"),fabCopy=fab.querySelector("span"),fabHint=fab.querySelector("small");
 if(fabCopy&&fabCopy.firstChild)fabCopy.firstChild.nodeValue="Ver pedido pendiente";
 if(fabHint)fabHint.textContent="Consulta el comprobante y el tiempo restante";
}
function showReceipt(){
 const o=state.order;if(!o)return;
 showCompletedCheckout();
 document.getElementById("orderReceipt").hidden=false;
 document.getElementById("receiptId").textContent=(Array.isArray(o.sale_codes)&&o.sale_codes.length?o.sale_codes.join(" · "):o.sale_code)||o.id;
 document.getElementById("demoPaymentWarning").hidden=!o.payment_demo;
 const expiredMessage=document.getElementById("receiptExpiredMessage");
 if(expiredMessage)expiredMessage.hidden=true;
 clearInterval(receiptTimer);
 function tick(){
  const left=new Date(o.expires_at).getTime()-Date.now(),el=document.getElementById("receiptCountdown");
  if(left<=0){
   el.textContent="EXPIRADO";
   const msg=document.getElementById("receiptExpiredMessage");if(msg)msg.hidden=false;
   clearInterval(receiptTimer);localStorage.removeItem("cardnestPendingOrder");return
  }
  const s=Math.floor(left/1000),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),ss=s%60;
  el.textContent=h+":"+String(m).padStart(2,"0")+":"+String(ss).padStart(2,"0");
 }
 tick();receiptTimer=setInterval(tick,1000);
 const a=document.getElementById("shippingWhatsapp");
 a.href="https://wa.me/"+WA+"?text="+encodeURIComponent(
  "Hola. Envío el comprobante del pago del envío para el/los código(s) "+(Array.isArray(o.sale_codes)?o.sale_codes.join(", "):o.sale_code)+
  " (pedido "+o.id+"). Nombre: "+o.buyer.name+". Ciudad: "+o.buyer.city+
  ". Total del envío: "+cop(o.shipping_total)+" COP. Adjunto el comprobante y el PDF."
 );
}

const viewPendingOrderBtn=document.getElementById("viewPendingOrder");
if(viewPendingOrderBtn)viewPendingOrderBtn.onclick=function(){
 if(validStoredOrder(state.order))showReceipt();
 else{
  localStorage.removeItem("cardnestPendingOrder");
  state.order=null;
  refreshPendingOrderNotice();
  setCodeStatus("error","El pedido pendiente ya no está disponible.");
 }
};
const startAnotherOrderBtn=document.getElementById("startAnotherOrder");
if(startAnotherOrderBtn)startAnotherOrderBtn.onclick=function(){
 resetCheckoutToCodeEntry();
 refreshPendingOrderNotice();
};
moveCheckoutInfoInitial();
document.getElementById("checkoutUnlocked").hidden=true;
try{
 const saved=JSON.parse(localStorage.getItem("cardnestPendingOrder")||"null");
 if(validStoredOrder(saved))state.order=saved;
 else localStorage.removeItem("cardnestPendingOrder");
}catch(e){}
refreshPendingOrderNotice();
function openImageViewer(src,p){
 const v=document.getElementById("imageViewer");if(!src||!v)return;
 document.getElementById("viewerImage").src=src;
 document.getElementById("viewerCaption").textContent=productName(p)+" · "+(p.card_number||p.id);
 if(!v.open)v.showModal();document.body.classList.add("viewer-open");
}
function closeImageViewer(){const v=document.getElementById("imageViewer");if(v&&v.open)v.close()}
const viewer=document.getElementById("imageViewer");
if(viewer){
 viewer.addEventListener("close",function(){document.body.classList.remove("viewer-open")});
 viewer.addEventListener("cancel",function(){document.body.classList.remove("viewer-open")});
 viewer.addEventListener("click",function(e){if(e.target===viewer)closeImageViewer()});
}

let selectedDockScrollTimer;
window.addEventListener("scroll",function(){
 const dock=document.getElementById("cartViewerBtn");if(!dock||dock.hidden)return;
 dock.classList.add("dock-yield");clearTimeout(selectedDockScrollTimer);
 selectedDockScrollTimer=setTimeout(function(){dock.classList.remove("dock-yield")},650);
},{passive:true});

loadProducts().catch(function(e){
 console.error(e);document.getElementById("cardsGrid").innerHTML='<div class="empty">No fue posible cargar el catálogo.</div>';
});

function setCollaboratorModal(open){
 const modal=document.getElementById("collaboratorModal"),backdrop=document.getElementById("collaboratorBackdrop");if(!modal||!backdrop)return;
 modal.setAttribute("aria-hidden",open?"false":"true");modal.inert=!open;backdrop.hidden=!open;
 if(open)setTimeout(()=>modal.querySelector("input")?.focus(),20);
}
["openCollaboratorLogin","footerCollaboratorLogin"].forEach(id=>document.getElementById(id)?.addEventListener("click",()=>setCollaboratorModal(true)));
document.getElementById("closeCollaboratorLogin")?.addEventListener("click",()=>setCollaboratorModal(false));
document.getElementById("collaboratorBackdrop")?.addEventListener("click",()=>setCollaboratorModal(false));
document.getElementById("collaboratorForm")?.addEventListener("submit",async function(e){
 e.preventDefault();
 const form=e.currentTarget,inputs=form.querySelectorAll("input"),notice=document.getElementById("collabDemoNotice"),button=form.querySelector("button");
 const username=String(inputs[0]?.value||"").trim(),password=String(inputs[1]?.value||"");
 notice.hidden=false;notice.textContent="Validando acceso…";button.disabled=true;
 try{
  const res=await fetch(ADMIN_API,{method:"POST",headers:{"Content-Type":"application/json",apikey:SUPABASE_KEY},body:JSON.stringify({action:"login",username:username,password:password})});
  const data=await res.json().catch(function(){return {}});
  if(!res.ok||!data.token)throw new Error(data.message||"Usuario o contraseña incorrectos.");
  sessionStorage.setItem("cardnestAdminToken",data.token);
  location.href="admin.html";
 }catch(error){
  notice.textContent=error.message||"No fue posible iniciar sesión.";
  button.disabled=false;
 }
});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&document.getElementById("collaboratorModal")?.getAttribute("aria-hidden")==="false")setCollaboratorModal(false)});
