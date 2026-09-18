const SUPABASE_URL="https://cnivcnexsqobipvqxero.supabase.co";
const SUPABASE_KEY="sb_publishable_6UjwLuM-op0-OBKWlbusTw_qmLNZVfU";
const WA="573125214785";
const SALE_API=SUPABASE_URL+"/functions/v1/sale-order";

const CATEGORY_LABELS={
 all:"Todos",pokemon:"Pokémon",yugioh:"Yu-Gi-Oh!",digimon:"Digimon",
 dragonball:"Dragon Ball",naruto:"Naruto",accessories:"Accesorios",sealed:"Producto sellado"
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

try{state.offerHistory=(JSON.parse(localStorage.getItem("cardnestOfferHistory")||localStorage.getItem("pokemonOfferHistory")||"[]")||[]).slice(0,5);localStorage.setItem("cardnestOfferHistory",JSON.stringify(state.offerHistory))}catch(e){}
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
  fetch("data/demo-products.json?v=20260918-3")
 ]);
 if(!results[0].ok)throw new Error(await results[0].text());
 const pokemon=(await results[0].json()).map(function(p){
  return Object.assign({},p,{category:"pokemon",category_label:"Pokémon",rarity_group:rarityGroup(p),demo:false});
 });
 const demo=results[1].ok?await results[1].json():[];
 state.products=mixCatalog(pokemon.concat(demo));
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
 const hay=[p.id,p.canonical_name,p.name_original,p.card_number,p.set_name,p.set_code,p.language,p.rarity_detected,p.rarity_verified,p.variant,p.category_label].map(normalize).join(" ");
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
  const hpRow=n.querySelector(".card-hp-row");
  if(p.hp==null||p.hp===""){hpRow.hidden=true}else n.querySelector(".card-hp").textContent=p.hp;
  n.querySelector(".card-rarity").textContent=p.rarity_verified||p.rarity_detected||"General";
  n.querySelector(".card-status").textContent=p.demo?"Inventario de ejemplo":"Sin uso · protegida";
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
 const search=document.getElementById("searchInput");
 const label=CATEGORY_LABELS[state.category]||"productos";
 search.placeholder=state.category==="all"
  ?"Busca por nombre, número, colección o referencia"
  :(state.category==="accessories"||state.category==="sealed"
    ?"Busca "+label+" por nombre o referencia"
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
function renderOfferHistory(){
 const box=document.getElementById("offerHistory");if(!box)return;
 if(!state.offerHistory.length){box.innerHTML='<p class="history-empty">Todavía no has enviado ofertas.</p>';return}
 box.innerHTML=state.offerHistory.slice(0,5).map(function(o){
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
 state.offerHistory=state.offerHistory.slice(0,5);
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
function renderCodeProducts(){
 const box=document.getElementById("codeProducts");
 const items=checkoutItems();
 box.hidden=!items.length;
 if(!items.length){box.innerHTML="";return}
 box.innerHTML='<strong>Productos asociados al código</strong><div class="code-product-list">'+items.map(function(p){
  return '<div><span>'+String(p.name||p.id)+'</span><small>'+String(p.number||p.id)+' · Cantidad: '+Math.max(1,Number(p.qty||1))+'</small></div>';
 }).join("")+'</div>';
}
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
function clearValidatedCode(){
 state.validatedCode=null;
 state.validatedCodeTotal=0;
 state.codeItems=[];
 state.codeShippingWeightKg=1;
 document.getElementById("checkoutUnlocked").hidden=true;
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
  setCodeStatus("error","Este código no tiene productos asociados. Solicita un código nuevo al analista.");
  return;
 }
 setCodeStatus("success",(prefix?prefix+" ":"")+"Código válido. Los productos negociados fueron cargados correctamente.");
 renderCodeProducts();
 document.getElementById("checkoutUnlocked").hidden=false;
 document.getElementById("deliveryDetails").open=true;
 renderToploaderConfigurator();
 updateQuote();
}
document.getElementById("saleCode").addEventListener("input",function(){
 if(state.validatedCode&&this.value.trim().toUpperCase()!==state.validatedCode){
  clearValidatedCode();
  setCodeStatus("","El código cambió. Debes validarlo nuevamente.");
 }
});
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

function buildPdf(){
 if(!state.order||!window.jspdf)return null;
 const jsPDF=window.jspdf.jsPDF,d=new jsPDF(),o=state.order;let y=18;
 function ensureSpace(h){if(y+h>278){d.addPage();y=18}}
 function line(label,value){
  ensureSpace(12);
  d.setFont("helvetica","bold");d.text(label,14,y);
  d.setFont("helvetica","normal");
  const parts=d.splitTextToSize(String(value||"—"),125);
  d.text(parts,65,y);y+=Math.max(7,parts.length*5.5);
 }
 d.setFontSize(19);d.text("CardNest - Orden de envio",14,y);y+=10;
 d.setFontSize(10);
 line("Pedido:",o.id);
 line("Codigo de venta:",o.sale_code);
 line("Valido hasta:",new Date(o.expires_at).toLocaleString("es-CO"));
 line("Valor declarado:",cop(o.agreed_product_total)+" COP (no se paga en esta orden)");
 line("Nombre:",o.buyer.name);
 line("Correo:",o.buyer.email);
 line("Celular:",o.buyer.phone);
 line("Documento:",o.buyer.document);
 line("Departamento:",o.buyer.department);
 line("Ciudad:",o.buyer.city);
 line("Direccion:",o.buyer.address);
 line("Barrio / sector:",o.buyer.neighborhood);
 line("Indicaciones:",o.buyer.reference||"Sin indicaciones");
 line("Observaciones:",o.buyer.notes||"Sin observaciones");

 y+=3;ensureSpace(35);
 d.setFont("helvetica","bold");d.text("Pago del envio",14,y);y+=7;
 d.setFont("helvetica","normal");
 line("Flete Coordinadora:",cop(o.shipping_price)+" COP");
 line("Manejo 1%:",cop(o.handling_price)+" COP");
 line("Top Loaders:",o.top_loader_qty+" unidad(es) · "+cop(o.protection_price)+" COP");
 if(o.top_loader_qty){
  line("Uso Top Loaders:",topLoaderPreferenceLabel(o.top_loader_preference));
  line("Indicacion Top Loaders:",o.top_loader_notes||"Sin indicaciones");
 }
 line("TOTAL A PAGAR:",cop(o.shipping_total)+" COP");
 line("Medio de pago:",o.payment_method);
 line("Datos de pago:",o.payment_destination);

 y+=3;ensureSpace(20);
 d.setFont("helvetica","bold");d.text("Productos asociados al codigo",14,y);y+=7;
 d.setFont("helvetica","normal");
 (o.items||[]).forEach(function(item,i){
  ensureSpace(9);
  d.text((i+1)+". "+item.name+" | "+(item.number||item.id)+" | Cantidad: "+item.qty,14,y);y+=6;
 });

 y+=5;ensureSpace(35);
 d.setFont("helvetica","bold");d.text("Estado y confirmacion",14,y);y+=7;
 d.setFont("helvetica","normal");
 const warning=o.payment_demo
  ?"MODO PRUEBA: los datos bancarios mostrados son temporales. NO REALICES PAGOS REALES. "
  :"";
 const msg=warning+"Esta orden corresponde al pago del envio. Cuando CardNest verifique la recepcion del pago del envio, la empresa procede a alistar los productos asociados al codigo de venta para su despacho. Conserva este PDF y el codigo para seguimiento.";
 d.text(d.splitTextToSize(msg,180),14,y);
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
 document.getElementById("checkoutUnlocked").hidden=false;
 document.getElementById("orderReceipt").hidden=false;
 document.getElementById("receiptId").textContent=o.sale_code||o.id;
 document.getElementById("demoPaymentWarning").hidden=!o.payment_demo;
 clearInterval(receiptTimer);
 function tick(){
  const left=new Date(o.expires_at).getTime()-Date.now(),el=document.getElementById("receiptCountdown");
  if(left<=0){el.textContent="EXPIRADO";clearInterval(receiptTimer);localStorage.removeItem("cardnestPendingOrder");return}
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
 if(saved&&new Date(saved.expires_at).getTime()>Date.now()){
  state.order=saved;setTimeout(showReceipt,0);
 }
}catch(e){}
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
