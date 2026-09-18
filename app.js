const SUPABASE_URL="https://cnivcnexsqobipvqxero.supabase.co";
const SUPABASE_KEY="sb_publishable_6UjwLuM-op0-OBKWlbusTw_qmLNZVfU";
const WA="573125214785";
const SALE_API=SUPABASE_URL+"/functions/v1/sale-order";

const CATEGORY_LABELS={
 all:"Todos",pokemon:"Pokémon",yugioh:"Yu-Gi-Oh!",digimon:"Digimon",
 dragonball:"Dragon Ball",naruto:"Naruto",accessories:"Accesorios",sealed:"Producto sellado",electronics:"Electrónica"
};
const CARD_CATEGORIES=new Set(["pokemon","yugioh","digimon","dragonball","naruto"]);
const SHIPPING={
 1:{L:9000,R:10450,N:17830,Z:25750,O:27560,E:42150},
 2:{L:9000,R:10450,N:17830,Z:25750,O:27560,E:42150},
 3:{L:12820,R:16070,N:25420,Z:33600,O:40880,E:61430},
 4:{L:16230,R:19610,N:29270,Z:41250,O:49350,E:65730},
 5:{L:16230,R:19610,N:29270,Z:41250,O:49350,E:65730}
};
const state={
 products:[],favorites:new Map(),offers:{},offerMode:"individual",
 offerHistory:[],category:"all",order:null,validatedCode:null,validatedCodeTotal:0,codeItems:[],codeShippingWeightKg:1
};

const normalize=function(v){return String(v==null?"":v).toLowerCase().trim()};
const cop=function(n){return new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",maximumFractionDigits:0}).format(Number(n)||0)};
const parseCOP=function(v){return Number(String(v||"").replace(/\D/g,""))||0};
function formatCOPInput(el){const n=parseCOP(el.value);el.value=n?new Intl.NumberFormat("es-CO").format(n):""}

try{state.offerHistory=(JSON.parse(localStorage.getItem("cardnestOfferHistory")||localStorage.getItem("pokemonOfferHistory")||"[]")||[]).slice(0,3);localStorage.setItem("cardnestOfferHistory",JSON.stringify(state.offerHistory))}catch(e){}
try{
 const saved=JSON.parse(localStorage.getItem("cardnestFavorites")||localStorage.getItem("pokemonFavorites")||"[]");
 saved.forEach(function(id){state.favorites.set(id,null)});
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
 const driveId=String(p.source_image_url||"").match(/\/d\/([^/]+)/);
 if(p.image_path)return SUPABASE_URL+"/storage/v1/object/public/card-images/"+p.image_path;
 return driveId?"https://drive.google.com/thumbnail?id="+driveId[1]+"&sz=w1000":"";
}
function productName(p){return p.canonical_name||p.name_original||"Producto"}
function productQty(p){return Math.max(1,Number((state.offers[p.id]||{}).qty||1))}
function shuffleList(list){
 const a=list.slice();
 for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
 return a;
}
function mixCatalog(list){
 const groups={};
 list.forEach(function(p){(groups[p.category]||(groups[p.category]=[])).push(p)});
 Object.keys(groups).forEach(function(k){groups[k]=shuffleList(groups[k])});
 const out=[],categories=Object.keys(groups);
 while(categories.some(function(k){return groups[k].length})){
  shuffleList(categories).forEach(function(k){if(groups[k].length)out.push(groups[k].shift())});
 }
 return out;
}

async function loadProducts(){
 const results=await Promise.all([
  fetch(SUPABASE_URL+"/rest/v1/cards?select=*&order=id.asc",{headers:{apikey:SUPABASE_KEY,Authorization:"Bearer "+SUPABASE_KEY}}),
  fetch("data/demo-products.json?v=20260918-3"),
  fetch(SUPABASE_URL+"/rest/v1/electronics_products?select=*&order=id.asc",{headers:{apikey:SUPABASE_KEY,Authorization:"Bearer "+SUPABASE_KEY}})
 ]);
 if(!results[0].ok)throw new Error(await results[0].text());
 const pokemon=(await results[0].json()).map(function(p){
  return Object.assign({},p,{category:"pokemon",category_label:"Pokémon",rarity_group:rarityGroup(p),demo:false});
 });
 const demo=results[1].ok?await results[1].json():[];
 const electronics=results[2].ok?(await results[2].json()).map(function(p){
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
 }):[];
 state.products=mixCatalog(pokemon.concat(demo,electronics));
 for(const id of Array.from(state.favorites.keys())){
  const found=state.products.find(function(p){return p.id===id});
  if(found)state.favorites.set(id,found);else state.favorites.delete(id);
 }
 persistFavorites();
 render();
 updateFavorites();
 updateQuote();
}
function matches(p,q,language,rarity){
 const hay=[p.id,p.canonical_name,p.name_original,p.card_number,p.set_name,p.set_code,p.language,p.rarity_detected,p.rarity_verified,p.variant,p.category_label,p.electronics_brand,p.electronics_model,p.electronics_type,p.electronics_specs,p.electronics_compatibility,p.electronics_power,p.electronics_color].map(normalize).join(" ");
 return (!q||hay.includes(normalize(q)))&&(!language||p.language===language)&&(!rarity||(p.category==="pokemon"&&rarityGroup(p)===rarity));
}
function render(){
 const grid=document.getElementById("cardsGrid"),tpl=document.getElementById("cardTemplate");
 const q=document.getElementById("searchInput").value;
 const language=document.getElementById("languageFilter").value;
 const rarity=document.getElementById("rarityFilter").value;
 const list=state.products.filter(function(p){
  return (state.category==="all"||p.category===state.category)&&matches(p,q,language,rarity);
 });
 grid.innerHTML="";
 document.getElementById("countLabel").textContent=list.length+" producto"+(list.length===1?"":"s");
 if(!list.length){grid.innerHTML='<div class="empty">No hay productos que coincidan con estos filtros.</div>';return}
 list.forEach(function(p){
  const n=tpl.content.cloneNode(true),card=n.querySelector(".card"),wrap=n.querySelector(".card-image-wrap"),img=n.querySelector(".card-image");
  const src=imageUrl(p);
  if(p.category==="electronics")card.classList.add("electronics-card");
  if(src){
   img.src=src;img.hidden=false;img.alt=productName(p)+" "+(p.card_number||"");
   img.title="Haz clic para ampliar";
   img.onclick=function(e){e.preventDefault();e.stopPropagation();openImageViewer(src,p)};
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
   n.querySelector(".card-status").textContent=p.electronics_condition||"Nuevo / demo";
   n.querySelector(".original-name").textContent=[p.electronics_type,p.electronics_brand].filter(Boolean).join(" · ");
  }
  const hpRow=n.querySelector(".card-hp-row");
  if(p.hp==null||p.hp===""){hpRow.hidden=true}else n.querySelector(".card-hp").textContent=p.hp;
  if(p.category!=="electronics"){
   n.querySelector(".card-rarity").textContent=p.rarity_verified||p.rarity_detected||"General";
   n.querySelector(".card-status").textContent=p.demo?"Inventario de ejemplo":"Sin uso · protegida";
  }
  const fav=n.querySelector(".favorite-btn"),selected=state.favorites.has(p.id);
  if(sold){fav.disabled=true;fav.textContent="No disponible"}else{fav.textContent=selected?"♥ Seleccionado":"♡ Me interesa";fav.classList.toggle("selected",selected)}
  if(!sold)fav.onclick=function(){toggleFavorite(p)};
  grid.appendChild(n);
 });
}
["searchInput","languageFilter","rarityFilter"].forEach(function(id){document.getElementById(id).addEventListener("input",render)});
document.querySelectorAll(".catalog-tab").forEach(function(btn){
 btn.addEventListener("click",function(){selectCategory(btn.dataset.category)});
});
document.querySelectorAll("[data-go-category]").forEach(function(btn){
 btn.addEventListener("click",function(){selectCategory(btn.dataset.goCategory)});
});
function selectCategory(cat){
 state.category=cat||"all";
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
      :"Busca "+label+" por nombre o número de carta");
 render();
 window.scrollTo({top:document.querySelector(".catalog-nav").offsetTop-20,behavior:"smooth"});
}
const requestedCard=new URLSearchParams(location.search).get("card");
if(requestedCard)document.getElementById("searchInput").value=requestedCard;

function goHome(){
 document.getElementById("searchInput").value="";
 document.getElementById("languageFilter").value="";
 document.getElementById("rarityFilter").value="";
 selectCategory("all");
 window.scrollTo({top:0,behavior:"smooth"});
}
document.getElementById("brandHome").onclick=goHome;
document.getElementById("heroHome").onclick=goHome;
document.getElementById("resetFilters").onclick=goHome;
const exploreElectronics=document.getElementById("exploreElectronics");
if(exploreElectronics)exploreElectronics.onclick=function(){selectCategory("electronics")};

const discoverMessages=[
 "Productos revisados antes de la venta",
 "Compra acompañada por WhatsApp",
 "Trazabilidad mediante código de venta",
 "Colecciones, accesorios y producto sellado"
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
function invalidateSaleCode(message){
 if(!state.validatedCode)return;
 state.validatedCode=null;state.validatedCodeTotal=0;
 const box=document.getElementById("saleCodeStatus");
 if(box){box.className="code-status";box.textContent=message||"La selección cambió. Valida de nuevo el código del analista."}
 updateQuote();
}
function toggleFavorite(p){
 if(state.favorites.has(p.id))state.favorites.delete(p.id);else state.favorites.set(p.id,p);
 persistFavorites();updateFavorites();render();
}
function selectedProducts(){return Array.from(state.favorites.values()).filter(Boolean)}
function updateFavorites(){
 const products=selectedProducts(),n=products.length;
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
function openCartViewer(){renderCartViewer();document.getElementById("cartViewer").classList.add("open");document.getElementById("cartViewerBackdrop").hidden=false}
function closeCartViewer(){document.getElementById("cartViewer").classList.remove("open");document.getElementById("cartViewerBackdrop").hidden=true}
document.getElementById("cartViewerBtn").onclick=openCartViewer;
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
  item.innerHTML=(src?'<img src="'+src+'" alt="'+productName(p).replace(/"/g,"&quot;")+'">':'<div class="cart-placeholder">'+(CATEGORY_LABELS[p.category]||"Producto")+'</div>')+
   '<div><strong>'+productName(p)+'</strong><small>'+String(p.card_number||p.id)+'</small></div>';
  const img=item.querySelector("img");if(img)img.onclick=function(){openImageViewer(src,p)};
  g.appendChild(item);
 });
}

function openFavorites(){renderFavoriteItems();document.getElementById("favoritesModal").classList.add("open");document.getElementById("favoritesBackdrop").hidden=false}
function closeFavorites(){document.getElementById("favoritesModal").classList.remove("open");document.getElementById("favoritesBackdrop").hidden=true}
document.getElementById("reviewFavorites").onclick=openFavorites;
document.getElementById("closeFavorites").onclick=closeFavorites;
document.getElementById("favoritesBackdrop").onclick=closeFavorites;
document.getElementById("clearFavorites").onclick=function(){
 if(confirm("¿Quieres borrar todos los productos seleccionados?")){state.favorites.clear();persistFavorites();updateFavorites();render()}
};


const MIN_OFFER_PER_UNIT=3000;
const MAX_OFFER_TOTAL=10000000;
function offerUnitsTotal(){
 return selectedProducts().reduce(function(sum,p){
  return sum+Math.max(1,Number((state.offers[p.id]||{}).qty||1));
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
  const max=Math.max(1,Number(p.stock_quantity||1)),o=state.offers[p.id]||{},disabled=state.offerMode==="lot"?"disabled":"";
  row.innerHTML='<div class="favorite-product-info"><strong>'+productName(p)+'</strong><small>ID '+p.id+' · '+(p.card_number||"Sin referencia")+'</small><small>Disponibles: '+max+'</small></div>'+
   '<div class="offer-controls"><label>Cantidad<input class="qty-input" type="number" min="1" max="'+max+'" value="'+(o.qty||1)+'"></label>'+
   '<label>Oferta por unidad <b>COP</b><div class="money-input"><span>$</span><input class="price-input" inputmode="numeric" maxlength="10" placeholder="Mín. 3.000" '+disabled+' value="'+(o.price?new Intl.NumberFormat("es-CO").format(o.price):"")+'"></div><small class="offer-field-help">Mínimo $3.000 COP por unidad.</small></label></div>';
  const qty=row.querySelector(".qty-input"),price=row.querySelector(".price-input");
  qty.oninput=function(e){
   const q=Math.min(max,Math.max(1,Number(e.target.value||1)));
   e.target.value=q;
   state.offers[p.id]=Object.assign({},state.offers[p.id]||{},{qty:q});
   updateOfferTotal();
  };
  price.oninput=function(e){
   let val=parseCOP(e.target.value);
   if(val>MAX_OFFER_TOTAL)val=MAX_OFFER_TOTAL;
   e.target.value=val?new Intl.NumberFormat("es-CO").format(val):"";
   state.offers[p.id]=Object.assign({},state.offers[p.id]||{},{price:val});
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
  const o=state.offers[p.id]||{};
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
 updateOfferTotal();
};
document.querySelectorAll('input[name="offerMode"]').forEach(function(r){
 r.onchange=function(e){
  state.offerMode=e.target.value;
  document.getElementById("lotOfferBox").hidden=state.offerMode!=="lot";
  renderFavoriteItems();
 }
});
function cardLink(id){return location.origin+location.pathname+"?card="+encodeURIComponent(id)}

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
 box.innerHTML=state.offerHistory.slice(0,3).map(function(o){
  return '<article class="history-card"><div class="history-head"><div><strong>'+o.id+'</strong><small>'+new Date(o.date).toLocaleString("es-CO")+' · '+o.cards.length+' referencia'+(o.cards.length===1?"":"s")+'</small></div><strong>'+cop(o.total)+' COP</strong></div>'+
   '<div class="history-cards">'+o.cards.map(function(c){return '<a href="'+cardLink(c.id)+'"><span>'+c.name+'</span><small>ID '+c.id+' · '+(c.number||"Sin número")+' · Cantidad: '+(c.qty||1)+'</small></a>'}).join("")+'</div></article>';
 }).join("");
}
document.getElementById("sendOffer").onclick=function(){
 const products=selectedProducts();
 if(!products.length){alert("Selecciona al menos un producto.");return}
 let total=0;
 if(state.offerMode==="lot"){
  const lot=parseCOP(document.getElementById("lotOffer").value);
  const minLot=MIN_OFFER_PER_UNIT*Math.max(1,offerUnitsTotal());
  if(lot<minLot){alert("La oferta por el lote debe ser de al menos "+cop(minLot)+" COP.");return}
  if(lot>MAX_OFFER_TOTAL){alert("La oferta total no puede superar "+cop(MAX_OFFER_TOTAL)+" COP.");return}
  total=lot;
 }else{
  const invalid=products.find(function(p){return Number((state.offers[p.id]||{}).price||0)<MIN_OFFER_PER_UNIT});
  if(invalid){
   alert('Debes asignar una oferta mínima de $3.000 COP a cada producto. Falta: '+productName(invalid)+'.');
   renderFavoriteItems();
   return;
  }
  total=products.reduce(function(a,p){
   const o=state.offers[p.id]||{};
   return a+Number(o.price||0)*Number(o.qty||1);
  },0);
  if(total>MAX_OFFER_TOTAL){alert("La oferta total no puede superar "+cop(MAX_OFFER_TOTAL)+" COP.");return}
 }
 const ref="OF-"+Date.now().toString(36).toUpperCase();
 const lines=products.map(function(p){
  const o=state.offers[p.id]||{},qty=Number(o.qty||1),price=Number(o.price||0);
  return state.offerMode==="lot"
   ?"• ID "+p.id+" | "+productName(p)+" | Cantidad: "+qty
   :"• ID "+p.id+" | "+productName(p)+" | Cantidad: "+qty+" | Oferta por unidad: "+cop(price)+" COP | Subtotal: "+cop(price*qty)+" COP";
 });
 const record={id:ref,date:new Date().toISOString(),mode:state.offerMode,total:total,cards:products.map(function(p){return {id:p.id,name:productName(p),number:p.card_number,qty:productQty(p)}})};
 state.offerHistory.unshift(record);
 state.offerHistory=state.offerHistory.slice(0,3);
 localStorage.setItem("cardnestOfferHistory",JSON.stringify(state.offerHistory));
 renderOfferHistory();
 const intro="Hola, equipo CardNest. Estoy interesado en comprar los siguientes productos y quisiera confirmar disponibilidad y revisar mi propuesta.\\n\\nReferencia de oferta: "+ref+"\\nModalidad: "+(state.offerMode==="lot"?"Oferta por el lote completo":"Oferta por producto")+"\\n\\n";
 const totalLine="\\nPropuesta total: "+cop(total)+" COP";
 const note="\\n\\nSi la propuesta es aprobada, por favor envíenme el código de venta para continuar con el pedido y el envío. Gracias.";
 window.open("https://wa.me/"+WA+"?text="+encodeURIComponent(intro+lines.join("\\n")+totalLine+note),"_blank");
};
const quoteFavoritesBtn=document.getElementById("quoteFavorites");
if(quoteFavoritesBtn)quoteFavoritesBtn.onclick=function(){
 const lines=selectedProducts().map(function(p){return "• "+productName(p)+" — "+(p.card_number||p.id)});
 window.open("https://wa.me/"+WA+"?text="+encodeURIComponent("Hola, quiero cotizar estos productos de CardNest:\\n"+lines.join("\\n")+"\\n\\n¿Me confirman disponibilidad?"),"_blank");
};
document.getElementById("startShipping").onclick=function(){closeFavorites();openShipping()};



function checkoutItems(){
 return Array.isArray(state.codeItems)?state.codeItems:[];
}
function checkoutUnitCount(){
 return checkoutItems().reduce(function(sum,p){return sum+Math.max(1,Number(p.qty||1))},0);
}
function renderCodeProducts(){/* Productos ligados al código: uso interno, no se muestran al cliente. */}
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
 const hasCode=!!state.validatedCode&&checkoutItems().length>0;
 const kg=Math.max(1,Math.min(5,Number(state.codeShippingWeightKg||1)));
 const count=checkoutUnitCount();
 const topQty=topLoaderQty();
 const topCost=topLoaderPrice(topQty);
 const freight=hasCode?((SHIPPING[kg]&&SHIPPING[kg][zone])||0):0;
 const handling=hasCode?Math.round(Number(state.validatedCodeTotal||0)*.01):0;
 const total=freight+handling+topCost;

 document.getElementById("shippingCardCount").textContent=hasCode?(count+" producto"+(count===1?"":"s")+" asociados al código"):"Valida el código para cargar el pedido";
 document.getElementById("shippingRateInfo").textContent=hasCode?"Tarifa Coordinadora calculada según zona":"Tarifa Coordinadora pendiente";
 document.getElementById("toploaderCost").textContent="Top Loaders: "+cop(topCost)+" COP";
 document.getElementById("shippingCost").textContent=hasCode?(cop(freight)+" COP"):"Pendiente";
 document.getElementById("shippingHandling").textContent=hasCode?(cop(handling)+" COP"):"Pendiente";
 document.getElementById("shippingProtection").textContent=cop(topCost)+" COP";
 document.getElementById("shippingTotal").textContent=hasCode?(cop(total)+" COP"):"Pendiente";
}
function openShipping(){
 document.getElementById("shippingModal").classList.add("open");
 document.getElementById("shippingBackdrop").hidden=false;
 document.getElementById("shippingModal").setAttribute("aria-hidden","false");
 updateQuote();
}
function closeShipping(){
 document.getElementById("shippingModal").classList.remove("open");
 document.getElementById("shippingBackdrop").hidden=true;
 document.getElementById("shippingModal").setAttribute("aria-hidden","true");
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
 const res=await fetch(SALE_API,{
  method:"POST",
  headers:{"Content-Type":"application/json",apikey:SUPABASE_KEY},
  body:JSON.stringify(payload)
 });
 const data=await res.json().catch(function(){return {}});
 if(!res.ok&&payload.action!=="validate")throw new Error(data.message||"No se pudo completar la operación.");
 return data;
}
function setCodeStatus(type,message){
 const box=document.getElementById("saleCodeStatus");
 box.className="code-status "+(type||"");
 box.textContent=message;
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
function clearValidatedCode(){
 state.validatedCode=null;
 state.validatedCodeTotal=0;
 state.codeItems=[];
 state.codeShippingWeightKg=1;
 document.getElementById("checkoutUnlocked").hidden=true;
 moveCheckoutInfoInitial();
 renderCodeProducts();
 document.getElementById("toploaderOption").checked=false;
 renderToploaderConfigurator();
 updateQuote();
}
function applyValidatedCode(code,data,prefix){
 state.validatedCode=code;
 state.validatedCodeTotal=Number(data.agreed_total||0);
 state.codeItems=Array.isArray(data.items)?data.items:[];
 state.codeShippingWeightKg=Math.max(1,Math.min(5,Number(data.shipping_weight_kg||1)));
 if(!state.codeItems.length){
  clearValidatedCode();
  setCodeStatus("error","Este código no está listo para procesar el envío. Solicita un código nuevo al analista.");
  return;
 }
 setCodeStatus("success",(prefix?prefix+" ":"")+"Código válido. Ya puedes completar los datos y pagar el envío.");
 renderCodeProducts();
 document.getElementById("checkoutUnlocked").hidden=false;
 document.getElementById("deliveryDetails").open=true;
 moveCheckoutInfoToEnd();
 renderToploaderConfigurator();
 updateQuote();
}
document.getElementById("saleCode").addEventListener("input",function(){
 if(state.validatedCode&&this.value.trim().toUpperCase()!==state.validatedCode){
  clearValidatedCode();
  setCodeStatus("","El código cambió. Debes validarlo nuevamente.");
 }
});
const useDemoSaleCode=document.getElementById("useDemoSaleCode");
if(useDemoSaleCode)useDemoSaleCode.onclick=function(){
 document.getElementById("saleCode").value="CN-PRUEBA-001";
 document.getElementById("saleCode").focus();
 setCodeStatus("","Código de prueba cargado. Presiona “Validar código” para continuar.");
};
document.getElementById("validateSaleCode").onclick=async function(){
 const code=document.getElementById("saleCode").value.trim().toUpperCase();
 if(!code){setCodeStatus("error","Escribe el código que te entregó el analista.");return}
 const btn=this;btn.disabled=true;btn.textContent="Validando...";
 try{
  const data=await saleApi({action:"validate",code:code});
  if(data.valid)applyValidatedCode(code,data,"");
  else{clearValidatedCode();setCodeStatus("error",data.message||"Código inválido, vencido o ya utilizado.")}
 }catch(e){
  clearValidatedCode();setCodeStatus("error","No fue posible validar el código. Intenta nuevamente.");
 }finally{
  btn.disabled=false;btn.textContent="Validar código";
 }
};

document.getElementById("fillTestCheckout").onclick=async function(){
 const btn=this;btn.disabled=true;btn.textContent="Preparando prueba...";
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
 let found=null;
 try{
  const preferred=["CN-PRUEBA-001"].concat(Array.from({length:30},function(_,i){return "CN-TEST-"+String(i+1).padStart(3,"0")}));
  for(const code of preferred){
   const data=await saleApi({action:"validate",code:code});
   if(data.valid){found={code:code,data:data};break}
  }
  if(found){
   document.getElementById("saleCode").value=found.code;
   applyValidatedCode(found.code,found.data,"Modo prueba listo.");
   renderToploaderConfigurator();
  }else{
   clearValidatedCode();document.getElementById("saleCode").value="";
   setCodeStatus("error","Los códigos temporales de prueba ya fueron utilizados.");
  }
 }catch(e){
  clearValidatedCode();setCodeStatus("error","No fue posible preparar el modo de prueba.");
 }finally{
  btn.disabled=false;btn.textContent="⚡ Llenar datos temporales para probar";
 }
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
 if(!b.consent){setFieldError(fields.consent,"Debes confirmar los datos y productos acordados.");ok=false}
 if(!ok){
  document.getElementById("deliveryDetails").open=true;
  document.querySelector(".field-invalid")?.scrollIntoView({behavior:"smooth",block:"center"});
 }
 return ok;
}
document.getElementById("createOrder").onclick=async function(){
 const code=document.getElementById("saleCode").value.trim().toUpperCase();
 if(!code||state.validatedCode!==code||!checkoutItems().length){
  alert("Debes validar primero el código de venta entregado por el analista.");
  document.getElementById("saleCode").focus();return;
 }
 const b=buyerData();
 if(!validateBuyer(b))return;

 const paymentMethod=document.getElementById("shippingPaymentMethod");
 if(!paymentMethod.value){
  document.getElementById("shippingDetails").open=true;
  setFieldError(paymentMethod,"Selecciona el medio para pagar el envío.");
  paymentMethod.scrollIntoView({behavior:"smooth",block:"center"});
  return;
 }
 const topEnabled=document.getElementById("toploaderOption").checked;
 const topQty=topEnabled?topLoaderQty():0;
 const topPreference=topEnabled?document.getElementById("toploaderPreference").value:"";
 const topNotes=topEnabled?document.getElementById("toploaderNotes").value.trim():"";
 if(topNotes.length>180){
  document.getElementById("toploaderDetails").open=true;
  setFieldError(document.getElementById("toploaderNotes"),"Máximo 180 caracteres.");
  return;
 }

 const btn=this;let generated=false;btn.disabled=true;btn.textContent="Generando pedido y PDF...";
 try{
  const data=await saleApi({
   action:"create_order",
   code:code,
   buyer:b,
   customerNotes:b.notes,
   deliveryConsent:b.consent,
   topLoaderQty:topQty,
   topLoaderPreference:topPreference,
   topLoaderNotes:topNotes,
   shippingZone:document.getElementById("shippingZone").value,
   paymentMethod:paymentMethod.value
  });
  state.order=Object.assign({},data.order,{buyer:b});
  localStorage.setItem("cardnestPendingOrder",JSON.stringify(state.order));
  showReceipt();
  downloadOrderPDF();
  setCodeStatus("success","Pedido generado correctamente. Conserva este código para seguimiento.");
  generated=true;
  btn.disabled=true;
  btn.textContent="Pedido generado";
 }catch(e){
  alert(e.message||"No fue posible generar el pedido.");
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
   "Hola CardNest. Consulta del pedido "+order.id+" / código "+order.sale_code
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
  d.addPage();y=18;
  d.setDrawColor.apply(d,line);
  d.setLineWidth(.2);
 }
 function ensure(h){if(y+h>282)newPage()}
 function sectionTitle(title,subtitle){
  ensure(18);
  setText(navy,12,"bold");d.text(title,14,y);
  if(subtitle){setText(muted,8.5,"normal");d.text(subtitle,14,y+5)}
  y+=subtitle?10:7;
  d.setDrawColor.apply(d,line);d.line(14,y,196,y);y+=6;
 }
 function infoRow(label,value,x,w){
  const lx=x||14,ww=w||86;
  d.setFillColor.apply(d,soft);d.roundedRect(lx,y,ww,16,2,2,"F");
  setText(muted,7.5,"bold");d.text(label.toUpperCase(),lx+4,y+5);
  setText(ink,10,"bold");
  const lines=d.splitTextToSize(String(value||"—"),ww-8);
  d.text(lines,lx+4,y+10);
 }
 function infoPair(l1,v1,l2,v2){
  ensure(18);infoRow(l1,v1,14,87);infoRow(l2,v2,105,91);y+=20;
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
 setText([217,230,239],9,"normal");d.text("Orden de envío y confirmación de compra",14,23);
 setText([255,255,255],9,"bold");d.text("PEDIDO "+o.id,196,15,{align:"right"});
 setText([217,230,239],8,"normal");d.text("Código "+o.sale_code,196,22,{align:"right"});
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
 moneyRow("Manejo 1% sobre valor declarado",cop(o.handling_price)+" COP");
 moneyRow("Top Loaders ("+Number(o.top_loader_qty||0)+")",cop(o.protection_price)+" COP");
 d.setDrawColor.apply(d,line);d.line(18,y-2,192,y-2);
 moneyRow("TOTAL A PAGAR AHORA",cop(o.shipping_total)+" COP",true);
 y+=3;
 fieldLine("Medio de pago",o.payment_method);
 fieldLine("Datos de pago",o.payment_destination);
 fieldLine("Valor declarado",cop(o.agreed_product_total)+" COP · No se paga en esta orden");
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

 setText(muted,7,"normal");
 d.text("Documento generado electrónicamente por CardNest · Conserva el código de venta para seguimiento.",105,289,{align:"center"});
 return d;
}
function downloadOrderPDF(){
 const d=buildPdf();
 if(d)d.save("CardNest-envio-"+state.order.sale_code+".pdf");
}
document.getElementById("downloadReceipt").onclick=downloadOrderPDF;

let receiptTimer=null;
function showReceipt(){
 const o=state.order;if(!o)return;
 document.getElementById("orderReceipt").hidden=false;
 document.getElementById("receiptId").textContent=o.sale_code||o.id;
 document.getElementById("demoPaymentWarning").hidden=!o.payment_demo;
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
  "Hola. Envío el comprobante del pago del envío para el código "+o.sale_code+
  " (pedido "+o.id+"). Nombre: "+o.buyer.name+". Ciudad: "+o.buyer.city+
  ". Total del envío: "+cop(o.shipping_total)+" COP. Adjunto el comprobante y el PDF."
 );
}
try{
 const saved=JSON.parse(localStorage.getItem("cardnestPendingOrder")||"null");
 if(saved&&new Date(saved.expires_at).getTime()>Date.now())state.order=saved;
}catch(e){}
moveCheckoutInfoInitial();
document.getElementById("checkoutUnlocked").hidden=true;
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
