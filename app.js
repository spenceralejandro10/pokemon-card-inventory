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

try{state.offerHistory=JSON.parse(localStorage.getItem("cardnestOfferHistory")||localStorage.getItem("pokemonOfferHistory")||"[]")}catch(e){}
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

function renderFavoriteItems(){
 const box=document.getElementById("favoriteItems");box.innerHTML="";
 selectedProducts().forEach(function(p){
  const row=document.createElement("div");row.className="favorite-item";
  const max=Math.max(1,Number(p.stock_quantity||1)),o=state.offers[p.id]||{},disabled=state.offerMode==="lot"?"disabled":"";
  row.innerHTML='<div class="favorite-product-info"><strong>'+productName(p)+'</strong><small>ID '+p.id+' · '+(p.card_number||"Sin referencia")+'</small><small>Disponibles: '+max+'</small></div>'+
   '<div class="offer-controls"><label>Cantidad<input class="qty-input" type="number" min="1" max="'+max+'" value="'+(o.qty||1)+'"></label>'+
   '<label>Oferta por unidad <b>COP</b><div class="money-input"><span>$</span><input class="price-input" inputmode="numeric" placeholder="Ej. 50.000" '+disabled+' value="'+(o.price?new Intl.NumberFormat("es-CO").format(o.price):"")+'"></div></label></div>';
  const qty=row.querySelector(".qty-input"),price=row.querySelector(".price-input");
  qty.oninput=function(e){const q=Math.min(max,Math.max(1,Number(e.target.value||1)));state.offers[p.id]=Object.assign({},state.offers[p.id]||{},{qty:q});updateOfferTotal();updateQuote()};
  price.oninput=function(e){formatCOPInput(e.target);state.offers[p.id]=Object.assign({},state.offers[p.id]||{},{price:parseCOP(e.target.value)});updateOfferTotal()};
  box.appendChild(row);
 });
 renderOfferHistory();updateOfferTotal();
}
function updateOfferTotal(){
 const lot=parseCOP(document.getElementById("lotOffer").value);
 const sum=selectedProducts().reduce(function(a,p){const o=state.offers[p.id]||{};return a+Number(o.price||0)*Number(o.qty||1)},0);
 document.getElementById("offerTotal").textContent=cop(state.offerMode==="lot"?lot:sum)+" COP";
}
document.getElementById("lotOffer").oninput=function(e){formatCOPInput(e.target);updateOfferTotal()};
document.querySelectorAll('input[name="offerMode"]').forEach(function(r){
 r.onchange=function(e){state.offerMode=e.target.value;document.getElementById("lotOfferBox").hidden=state.offerMode!=="lot";renderFavoriteItems()}
});
function cardLink(id){return location.origin+location.pathname+"?card="+encodeURIComponent(id)}
function renderOfferHistory(){
 const box=document.getElementById("offerHistory");if(!box)return;
 if(!state.offerHistory.length){box.innerHTML='<p class="history-empty">Todavía no has enviado ofertas.</p>';return}
 box.innerHTML=state.offerHistory.map(function(o){
  return '<article class="history-card"><div class="history-head"><div><strong>'+o.id+'</strong><small>'+new Date(o.date).toLocaleString("es-CO")+' · '+o.cards.length+' referencia'+(o.cards.length===1?"":"s")+'</small></div><strong>'+cop(o.total)+' COP</strong></div>'+
   '<div class="history-cards">'+o.cards.map(function(c){return '<a href="'+cardLink(c.id)+'"><span>'+c.name+'</span><small>ID '+c.id+' · '+(c.number||"Sin número")+' · Cantidad: '+(c.qty||1)+'</small></a>'}).join("")+'</div></article>';
 }).join("");
}
document.getElementById("sendOffer").onclick=function(){
 const products=selectedProducts();if(!products.length){alert("Selecciona al menos un producto.");return}
 const lot=parseCOP(document.getElementById("lotOffer").value);
 const total=state.offerMode==="lot"?lot:products.reduce(function(a,p){const o=state.offers[p.id]||{};return a+Number(o.price||0)*Number(o.qty||1)},0);
 if(!total){alert("Escribe tu oferta en pesos colombianos (COP) antes de continuar.");return}
 const ref="OF-"+Date.now().toString(36).toUpperCase();
 const lines=products.map(function(p){
  const o=state.offers[p.id]||{},qty=Number(o.qty||1),price=Number(o.price||0);
  return state.offerMode==="lot"?"• ID "+p.id+" | "+productName(p)+" | Cantidad: "+qty:
   "• ID "+p.id+" | "+productName(p)+" | Cantidad: "+qty+" | Oferta por unidad: "+cop(price)+" COP | Subtotal: "+cop(price*qty)+" COP";
 });
 const record={id:ref,date:new Date().toISOString(),mode:state.offerMode,total:total,cards:products.map(function(p){return {id:p.id,name:productName(p),number:p.card_number,qty:productQty(p)}})};
 state.offerHistory.unshift(record);state.offerHistory=state.offerHistory.slice(0,30);
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
function cardCheckoutItems(){
 return checkoutItems().filter(function(p){return CARD_CATEGORIES.has(String(p.category||"").toLowerCase())});
}
function maxToploaders(){
 return cardCheckoutItems().reduce(function(sum,p){return sum+Math.max(1,Number(p.qty||1))},0);
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
function topLoaderSelections(){
 if(!document.getElementById("toploaderOption").checked)return [];
 const mode=document.getElementById("toploaderMode").value;
 const cards=cardCheckoutItems();
 if(mode==="all"){
  return cards.map(function(p){return {id:p.id,qty:Math.max(1,Number(p.qty||1))}});
 }
 const result=[];
 document.querySelectorAll(".toploader-product-row").forEach(function(row){
  const id=row.dataset.id,qty=Math.max(0,Number(row.querySelector("input").value||0));
  if(qty>0)result.push({id:id,qty:qty});
 });
 return result;
}
function topLoaderCount(){
 return topLoaderSelections().reduce(function(sum,x){return sum+Number(x.qty||0)},0);
}
function renderToploaderConfigurator(){
 const enabled=document.getElementById("toploaderOption").checked;
 const config=document.getElementById("toploaderConfigurator");
 config.hidden=!enabled;
 const mode=document.getElementById("toploaderMode").value;
 const products=document.getElementById("toploaderProducts");
 const cards=cardCheckoutItems();
 products.innerHTML="";
 if(!enabled||!cards.length){
  if(enabled&&!cards.length)products.innerHTML='<p class="toploader-empty">Este código no contiene cartas compatibles con Top Loader.</p>';
  document.getElementById("toploaderQty").textContent="0";
  updateQuote();return;
 }
 if(mode==="custom"){
  cards.forEach(function(p){
   const max=Math.max(1,Number(p.qty||1)),row=document.createElement("label");
   row.className="toploader-product-row";row.dataset.id=p.id;
   row.innerHTML='<span><strong>'+String(p.name||p.id)+'</strong><small>'+String(p.number||p.id)+'</small></span><input type="number" min="0" max="'+max+'" value="0" aria-label="Cantidad de Top Loaders para '+String(p.name||p.id).replace(/"/g,"&quot;")+'">';
   row.querySelector("input").addEventListener("input",function(){
    this.value=Math.min(max,Math.max(0,Number(this.value||0)));
    document.getElementById("toploaderQty").textContent=String(topLoaderCount());
    updateQuote();
   });
   products.appendChild(row);
  });
 }else{
  products.innerHTML='<p class="toploader-all-note">Se agregará un Top Loader a cada carta negociada.</p>';
 }
 document.getElementById("toploaderQty").textContent=String(topLoaderCount());
 updateQuote();
}
function updateQuote(){
 const zone=document.getElementById("shippingZone")?.value||"N";
 const hasCode=!!state.validatedCode&&checkoutItems().length>0;
 const kg=Math.max(1,Math.min(5,Number(state.codeShippingWeightKg||1)));
 const count=checkoutUnitCount();
 const topQty=topLoaderCount();
 const protection=topQty*2000;
 const freight=hasCode?((SHIPPING[kg]&&SHIPPING[kg][zone])||0):0;
 const handling=hasCode?Math.round(Number(state.validatedCodeTotal||0)*.01):0;
 const total=freight+handling+protection;

 const countEl=document.getElementById("shippingCardCount");
 const weightEl=document.getElementById("estimatedWeight");
 const topEl=document.getElementById("toploaderCost");
 if(countEl)countEl.textContent=hasCode?(count+" producto"+(count===1?"":"s")+" ligados al código"):"Valida el código para cargar el pedido";
 if(weightEl)weightEl.textContent=hasCode?("Tarifa Coordinadora · tramo "+kg+" kg"):"Tarifa Coordinadora pendiente";
 if(topEl)topEl.textContent="Top Loaders: "+cop(protection)+" COP";
 document.getElementById("shippingCost").textContent=hasCode?(cop(freight)+" COP"):"Pendiente";
 document.getElementById("shippingHandling").textContent=hasCode?(cop(handling)+" COP"):"Pendiente";
 document.getElementById("shippingProtection").textContent=cop(protection)+" COP";
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
document.getElementById("toploaderMode").addEventListener("change",renderToploaderConfigurator);

document.getElementById("fillTestCheckout").onclick=async function(){
 const btn=this;btn.disabled=true;btn.textContent="Preparando prueba...";
 document.getElementById("buyerName").value="Cliente Prueba";
 document.getElementById("buyerPhone").value="3001234567";
 document.getElementById("buyerDocument").value="123456789";
 document.getElementById("destDepartment").value="Cundinamarca";
 document.getElementById("destCity").value="Bogota";
 document.getElementById("destAddress").value="Calle 100 # 15-20";
 document.getElementById("destNeighborhood").value="Chico";
 document.getElementById("destReference").value="Datos temporales para prueba";
 document.getElementById("shippingZone").value="N";
 document.getElementById("shippingPaymentMethod").value="Nequi";
 document.getElementById("toploaderOption").checked=false;
 let found=null;
 try{
  for(let i=1;i<=30;i++){
   const code="CN-TEST-"+String(i).padStart(3,"0");
   const data=await saleApi({action:"validate",code:code});
   if(data.valid){found={code:code,data:data};break}
  }
  if(found){
   document.getElementById("saleCode").value=found.code;
   applyValidatedCode(found.code,found.data,"Modo prueba listo.");
  }else{
   clearValidatedCode();
   document.getElementById("saleCode").value="";
   setCodeStatus("error","Los códigos temporales de prueba ya fueron utilizados.");
  }
 }catch(e){
  clearValidatedCode();
  setCodeStatus("error","No fue posible preparar el modo de prueba.");
 }finally{
  btn.disabled=false;btn.textContent="⚡ Llenar datos temporales para probar";
 }
};

function restrictInputs(){
 const digits=function(id){const el=document.getElementById(id);el.addEventListener("input",function(){el.value=el.value.replace(/\D/g,"")})};
 digits("buyerPhone");digits("buyerDocument");
 ["buyerName","destDepartment","destCity"].forEach(function(id){
  const el=document.getElementById(id);el.addEventListener("input",function(){el.value=el.value.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .-]/g,"")});
 });
}
restrictInputs();

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
 renderCodeProducts();
 renderToploaderConfigurator();
 updateQuote();
}
function applyValidatedCode(code,data,prefix){
 state.validatedCode=code;
 state.validatedCodeTotal=Number(data.agreed_total||0);
 state.codeItems=Array.isArray(data.items)?data.items:[];
 state.codeShippingWeightKg=Math.max(1,Math.min(5,Number(data.shipping_weight_kg||1)));
 setCodeStatus("success",(prefix?prefix+" ":"")+"Código "+code+" validado. "+state.codeItems.length+" referencia"+(state.codeItems.length===1?"":"s")+" asociada"+(state.codeItems.length===1?"":"s")+".");
 renderCodeProducts();
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

function buyerData(){
 return {
  name:document.getElementById("buyerName").value.trim(),
  phone:document.getElementById("buyerPhone").value.trim(),
  document:document.getElementById("buyerDocument").value.trim(),
  department:document.getElementById("destDepartment").value.trim(),
  city:document.getElementById("destCity").value.trim(),
  address:document.getElementById("destAddress").value.trim(),
  neighborhood:document.getElementById("destNeighborhood").value.trim(),
  reference:document.getElementById("destReference").value.trim()
 };
}
function validateBuyer(b){
 const letters=/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .-]+$/;
 if(!b.name||b.name.length<2||!letters.test(b.name)){alert("Escribe un nombre válido. El nombre debe contener letras, no números.");return false}
 if(!/^\d{7,15}$/.test(b.phone)){alert("El celular debe contener únicamente números, entre 7 y 15 dígitos.");return false}
 if(b.document&&!/^\d{5,20}$/.test(b.document)){alert("El documento de identificación debe contener únicamente números.");return false}
 if(!b.department||!letters.test(b.department)||!b.city||!letters.test(b.city)){alert("Departamento y ciudad deben contener letras.");return false}
 if(b.address.length<5){alert("Completa una dirección válida para la entrega.");return false}
 return true;
}
document.getElementById("createOrder").onclick=async function(){
 const code=document.getElementById("saleCode").value.trim().toUpperCase();
 if(!code||state.validatedCode!==code||!checkoutItems().length){
  alert("Para generar el pedido necesitas el código entregado por el analista. Ese código ya contiene los productos que fueron negociados por WhatsApp; no necesitas seleccionarlos nuevamente en la página.");
  document.getElementById("saleCode").focus();return;
 }
 const b=buyerData();if(!validateBuyer(b))return;
 const paymentMethod=document.getElementById("shippingPaymentMethod").value;
 if(!paymentMethod){alert("Selecciona el medio con el que pagarás el envío.");return}

 const btn=this;btn.disabled=true;btn.textContent="Generando pedido y PDF...";
 try{
  const data=await saleApi({
   action:"create_order",
   code:code,
   buyer:b,
   toploaderSelections:topLoaderSelections(),
   shippingZone:document.getElementById("shippingZone").value,
   paymentMethod:paymentMethod
  });
  state.order=Object.assign({},data.order,{buyer:b});
  localStorage.setItem("cardnestPendingOrder",JSON.stringify(state.order));
  showReceipt();
  downloadOrderPDF();
  clearValidatedCode();
 }catch(e){
  alert(e.message||"No fue posible generar el pedido.");
 }finally{
  btn.disabled=false;btn.textContent="Generar pedido y descargar PDF";
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
 d.setFontSize(19);d.text("CardNest - Pedido de envio",14,y);y+=10;
 d.setFontSize(10);
 line("Pedido:",o.id);
 line("Codigo venta:",o.sale_code);
 line("Valido hasta:",new Date(o.expires_at).toLocaleString("es-CO"));
 line("Nombre:",o.buyer.name);
 line("Celular:",o.buyer.phone);
 line("Documento:",o.buyer.document||"No informado");
 line("Departamento:",o.buyer.department);
 line("Ciudad:",o.buyer.city);
 line("Direccion:",o.buyer.address);
 line("Barrio / sector:",o.buyer.neighborhood||"No informado");
 line("Indicaciones:",o.buyer.reference||"No informado");

 y+=3;ensureSpace(38);
 d.setFont("helvetica","bold");d.text("Pago del envio",14,y);y+=7;
 d.setFont("helvetica","normal");
 line("Flete Coordinadora:",cop(o.shipping_price)+" COP");
 line("Manejo 1%:",cop(o.handling_price)+" COP");
 line("Top Loaders:",cop(o.protection_price)+" COP");
 line("TOTAL A PAGAR:",cop(o.shipping_total)+" COP");
 line("Medio de pago:",o.payment_method);
 line("Datos de pago:",o.payment_destination);

 y+=3;ensureSpace(20);
 d.setFont("helvetica","bold");d.text("Productos asociados al codigo",14,y);y+=7;
 d.setFont("helvetica","normal");
 (o.items||[]).forEach(function(item,i){
  ensureSpace(9);
  const top=item.toploader_qty?(" | Top Loader: "+item.toploader_qty):"";
  d.text((i+1)+". "+item.name+" | "+(item.number||item.id)+" | Cantidad: "+item.qty+top,14,y);y+=6;
 });

 y+=5;ensureSpace(30);
 d.setFont("helvetica","bold");d.text("Estado del pedido",14,y);y+=7;
 d.setFont("helvetica","normal");
 const warning=o.payment_demo
  ?"MODO PRUEBA: los datos bancarios mostrados son temporales. NO REALICES PAGOS REALES. "
  :"";
 const msg=warning+"Este documento corresponde al pago del envio, no al valor negociado de los productos. Una vez CardNest confirme la recepcion del pago del envio, el pedido pasa a alistamiento y preparacion para despacho. Conserva el codigo de venta para seguimiento.";
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
