const SUPABASE_URL="https://cnivcnexsqobipvqxero.supabase.co";
const SUPABASE_KEY="sb_publishable_6UjwLuM-op0-OBKWlbusTw_qmLNZVfU";
const state={cards:[],favorites:new Map(),offers:{},order:null,offerMode:"individual",offerHistory:[]};
try{state.offerHistory=JSON.parse(localStorage.getItem("pokemonOfferHistory")||"[]")}catch(e){}
try{JSON.parse(localStorage.getItem("pokemonFavorites")||"[]").forEach(id=>state.favorites.set(id,null))}catch(e){}

async function loadCards(){
  const res=await fetch(`${SUPABASE_URL}/rest/v1/cards?select=*&order=id.asc`,{
    headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`}
  });
  if(!res.ok) throw new Error(await res.text());
  state.cards=await res.json();
  for(const [id] of state.favorites){const card=state.cards.find(c=>c.id===id);card?state.favorites.set(id,card):state.favorites.delete(id)}
  persistFavorites();populateRarityFilter(); render();
}
function populateRarityFilter(){
 const select=document.getElementById("rarityFilter");
 [...new Set(state.cards.map(c=>c.rarity_verified||c.rarity_detected).filter(Boolean))].sort().forEach(r=>{
  const o=document.createElement("option");o.value=r;o.textContent=r;select.appendChild(o);
 });
}
const normalize=v=>String(v??"").toLowerCase().trim();
function matches(c,q,l,r){
 const h=[c.id,c.name_original,c.canonical_name,c.card_number,c.set_name,c.set_code,c.language,c.rarity_detected,c.rarity_verified,c.hp,c.variant].map(normalize).join(" ");
 return (!q||h.includes(normalize(q)))&&(!l||c.language===l)&&(!r||(c.rarity_verified||c.rarity_detected||"")===r);
}
function render(){
 const q=document.getElementById("searchInput").value,l=document.getElementById("languageFilter").value,r=document.getElementById("rarityFilter").value;
 const cards=state.cards.filter(c=>matches(c,q,l,r)),grid=document.getElementById("cardsGrid"),tpl=document.getElementById("cardTemplate");
 grid.innerHTML="";document.getElementById("countLabel").textContent=`${cards.length} carta${cards.length===1?"":"s"}`;
 if(!cards.length){grid.innerHTML='<div class="empty">No se encontraron cartas.</div>';return}
 cards.forEach(c=>{
  const n=tpl.content.cloneNode(true),img=n.querySelector(".card-image");
  const driveId=(c.source_image_url||"").match(/\/d\/([^/]+)/)?.[1];
  img.src=c.image_path?`${SUPABASE_URL}/storage/v1/object/public/card-images/${c.image_path}`:(driveId?`https://drive.google.com/thumbnail?id=${driveId}&sz=w1000`:"");
  img.alt=`${c.canonical_name||c.name_original||"Carta"} ${c.card_number||""}`;
  n.querySelector(".card-name").textContent=c.canonical_name||c.name_original||"Pendiente de identificar";
  n.querySelector(".original-name").textContent=c.name_original&&c.name_original!==c.canonical_name?c.name_original:"";
  n.querySelector(".language-badge").textContent=c.language||"Unknown";
  n.querySelector(".card-id").textContent=c.id;n.querySelector(".card-number").textContent=c.card_number||"Pendiente";
  n.querySelector(".card-set").textContent=c.set_name||c.set_code||"Pendiente";n.querySelector(".card-hp").textContent=c.hp??"—";
  n.querySelector(".card-rarity").textContent=c.rarity_verified||c.rarity_detected||"Pendiente de revisión";
  n.querySelector(".card-status").textContent="Sin uso · protegida";
  const a=n.querySelector(".drive-link");a.href=c.source_image_url||"#";if(!c.source_image_url)a.style.display="none";
  const fav=n.querySelector(".favorite-btn");
  const selected=state.favorites.has(c.id); fav.classList.toggle("selected",selected); fav.textContent=selected?"♥ Seleccionada":"♡ Me interesa";
  fav.addEventListener("click",()=>toggleFavorite(c));
  grid.appendChild(n);
 });
}
["searchInput","languageFilter","rarityFilter"].forEach(id=>document.getElementById(id).addEventListener("input",render));
loadCards().catch(e=>{console.error(e);document.getElementById("cardsGrid").innerHTML='<div class="empty">Error conectando con Supabase.</div>'});
const SHIPPING={
1:{L:9000,R:10450,N:17830,Z:25750,O:27560,E:42150},
2:{L:9000,R:10450,N:17830,Z:25750,O:27560,E:42150},
3:{L:12820,R:16070,N:25420,Z:33600,O:40880,E:61430},
4:{L:16230,R:19610,N:29270,Z:41250,O:49350,E:65730},
5:{L:16230,R:19610,N:29270,Z:41250,O:49350,E:65730}};
const cop=n=>new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",maximumFractionDigits:0}).format(n||0);
const WA="573125214785";
function estimatedShipment(){
 const count=Math.max(1,state.favorites.size),withTop=document.getElementById("toploaderOption")?.checked??true;
 const grams=count*(withTop?10.5:2)+100;
 return {count,withTop,grams,kg:Math.max(1,Math.ceil(grams/1000)),topCost:withTop?count*2000:0};
}
function updateQuote(){const zone=document.getElementById("shippingZone")?.value||"N",declared=Math.max(0,Number(document.getElementById("declaredValue")?.value||0)),s=estimatedShipment(),rateKg=Math.min(5,s.kg),freight=SHIPPING[rateKg]?.[zone]||SHIPPING[5]?.[zone]||0,handling=Math.round(declared*.01);document.getElementById("shippingCost").textContent=cop(freight);document.getElementById("shippingHandling").textContent=cop(handling);document.getElementById("shippingTotal").textContent=cop(freight+handling+s.topCost);document.getElementById("shippingCardCount").textContent=`${state.favorites.size} carta${state.favorites.size===1?"":"s"} seleccionada${state.favorites.size===1?"":"s"}`;document.getElementById("estimatedWeight").textContent=`Peso estimado: ${s.grams} g · tarifa ${rateKg} kg`;document.getElementById("toploaderCost").textContent=`Top Loaders: ${cop(s.topCost)}`}
function openShipping(){document.getElementById("shippingModal").classList.add("open");document.getElementById("shippingBackdrop").hidden=false;document.getElementById("shippingModal").setAttribute("aria-hidden","false")}
function closeShipping(){document.getElementById("shippingModal").classList.remove("open");document.getElementById("shippingBackdrop").hidden=true;document.getElementById("shippingModal").setAttribute("aria-hidden","true")}
document.getElementById("shippingFab").onclick=openShipping;document.getElementById("closeShipping").onclick=closeShipping;document.getElementById("shippingBackdrop").onclick=closeShipping;
["shippingZone","toploaderOption","declaredValue"].forEach(id=>document.getElementById(id)?.addEventListener("input",updateQuote));updateQuote();
function makeOrderId(){return "PKM-"+Date.now().toString(36).slice(-5).toUpperCase()+Math.random().toString(36).slice(2,5).toUpperCase()}
document.getElementById("createOrder").onclick=()=>{const name=document.getElementById("buyerName").value.trim(),phone=document.getElementById("buyerPhone").value.trim(),city=document.getElementById("destCity").value.trim();if(!name||!phone||!city){alert("Completa nombre, teléfono y ciudad.");return}const id=makeOrderId(),expires=Date.now()+4*60*60*1000;state.order={id,expires,name,phone,city};localStorage.setItem("pokemonPendingOrder",JSON.stringify(state.order));showReceipt()};
function showReceipt(){if(!state.order)return;document.getElementById("orderReceipt").hidden=false;document.getElementById("receiptId").textContent=state.order.id;const tick=()=>{if(!state.order)return;const left=state.order.expires-Date.now();if(left<=0){document.getElementById("receiptCountdown").textContent="EXPIRADO";document.getElementById("shippingWhatsapp").style.pointerEvents="none";localStorage.removeItem("pokemonPendingOrder");return}const s=Math.floor(left/1000),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),ss=s%60;document.getElementById("receiptCountdown").textContent=`${h}:${String(m).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;const a=document.getElementById("shippingWhatsapp");a.href=`https://wa.me/${WA}?text=${encodeURIComponent(`Hola. Ya pagué el envío del pedido ${state.order.id}. Nombre: ${state.order.name}. Ciudad: ${state.order.city}. Adjunto la foto del comprobante de pago.`)}`;setTimeout(tick,1000)};tick()}
try{const saved=JSON.parse(localStorage.getItem("pokemonPendingOrder")||"null");if(saved&&saved.expires>Date.now()){state.order=saved;setTimeout(showReceipt,0)}}catch(e){}
function persistFavorites(){localStorage.setItem("pokemonFavorites",JSON.stringify([...state.favorites.keys()]))}
function toggleFavorite(card){state.favorites.has(card.id)?state.favorites.delete(card.id):state.favorites.set(card.id,card);persistFavorites();updateFavorites();render()}
function updateFavorites(){const n=state.favorites.size;document.getElementById("favoriteCount").textContent=n;document.getElementById("favoriteCountBar").textContent=n;document.getElementById("favoritesBar").hidden=!n;if(document.getElementById("shippingCost"))updateQuote()}
document.getElementById("favoritesFab").onclick=()=>{if(state.favorites.size)openFavorites()};
document.getElementById("reviewFavorites").onclick=openFavorites;
function openFavorites(){renderFavoriteItems();document.getElementById("favoritesModal").classList.add("open");document.getElementById("favoritesBackdrop").hidden=false}
function closeFavorites(){document.getElementById("favoritesModal").classList.remove("open");document.getElementById("favoritesBackdrop").hidden=true}
document.getElementById("closeFavorites").onclick=closeFavorites;document.getElementById("favoritesBackdrop").onclick=closeFavorites;
function parseCOP(v){return Number(String(v||"").replace(/\D/g,""))||0}
function formatCOPInput(el){const n=parseCOP(el.value);el.value=n?new Intl.NumberFormat("es-CO").format(n):""}
function renderFavoriteItems(){const box=document.getElementById("favoriteItems");box.innerHTML="";[...state.favorites.values()].filter(Boolean).forEach(card=>{const row=document.createElement("div");row.className="favorite-item";const disabled=state.offerMode==="lot"?"disabled":"";row.innerHTML=`<div><strong>${card.canonical_name||card.name_original||"Carta"}</strong><small>${card.name_original&&card.name_original!==card.canonical_name?card.name_original+" · ":""}${card.card_number||card.id}</small></div><div class="money-input"><span>$</span><input inputmode="numeric" placeholder="0" ${disabled} value="${state.offers[card.id]?new Intl.NumberFormat("es-CO").format(state.offers[card.id]):""}"></div>`;row.querySelector("input").oninput=e=>{formatCOPInput(e.target);state.offers[card.id]=parseCOP(e.target.value);updateOfferTotal()};box.appendChild(row)});renderOfferHistory();updateOfferTotal()}
function updateOfferTotal(){const lot=parseCOP(document.getElementById("lotOffer").value),sum=Object.values(state.offers).reduce((a,b)=>a+Number(b||0),0);document.getElementById("offerTotal").textContent=cop(lot||sum)}
document.getElementById("lotOffer").oninput=e=>{formatCOPInput(e.target);updateOfferTotal()};
document.querySelectorAll('input[name="offerMode"]').forEach(r=>r.onchange=e=>{state.offerMode=e.target.value;document.getElementById("lotOfferBox").hidden=state.offerMode!=="lot";renderFavoriteItems()});
document.getElementById("sendOffer").onclick=()=>{const lot=parseCOP(document.getElementById("lotOffer").value),total=state.offerMode==="lot"?lot:Object.values(state.offers).reduce((a,b)=>a+Number(b||0),0);if(!total){alert("Escribe tu oferta antes de continuar.");return}const cards=[...state.favorites.values()].filter(Boolean);const lines=cards.map(c=>`• ${c.canonical_name||c.name_original||"Carta"} ${c.card_number||c.id}: ${state.offerMode==="lot"?"incluida en oferta del lote":cop(state.offers[c.id]||0)}`);const record={id:"OF-"+Date.now().toString(36).toUpperCase(),date:new Date().toISOString(),mode:state.offerMode,total,cards:cards.map(c=>({id:c.id,name:c.canonical_name||c.name_original||"Carta",number:c.card_number}))};state.offerHistory.unshift(record);state.offerHistory=state.offerHistory.slice(0,30);localStorage.setItem("pokemonOfferHistory",JSON.stringify(state.offerHistory));renderOfferHistory();window.open(`https://wa.me/${WA}?text=${encodeURIComponent("Hola, quiero realizar una oferta por estas cartas Pokémon. Esta es una oferta, no un pedido confirmado.\nReferencia: "+record.id+"\n"+lines.join("\n")+"\n\nOferta total: "+cop(total))}`,"_blank")};
function renderOfferHistory(){const box=document.getElementById("offerHistory");if(!box)return;if(!state.offerHistory.length){box.innerHTML='<p class="history-empty">Todavía no has enviado ofertas.</p>';return}box.innerHTML=state.offerHistory.map(o=>`<div class="history-item"><div><strong>${o.id}</strong><small>${new Date(o.date).toLocaleString("es-CO")} · ${o.cards.length} carta${o.cards.length===1?"":"s"}</small></div><strong>${cop(o.total)}</strong></div>`).join("")}
document.getElementById("startShipping").onclick=()=>{closeFavorites();openShipping()};
document.getElementById("clearFavorites").onclick=()=>{if(confirm("¿Quieres borrar todas las cartas guardadas?")){state.favorites.clear();persistFavorites();updateFavorites();render()}};
document.getElementById("quoteFavorites").onclick=()=>{const lines=[...state.favorites.values()].map(c=>`• ${c.canonical_name||c.name_original||"Carta"} — ${c.card_number||c.id}`);window.open(`https://wa.me/${WA}?text=${encodeURIComponent("Hola, quiero cotizar estas cartas Pokémon:\n"+lines.join("\n")+"\n\n¿Me confirmas disponibilidad y precio?")}`,"_blank")};
updateFavorites();