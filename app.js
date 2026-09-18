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
  img.alt=`${c.canonical_name||c.name_original||"Carta"} ${c.card_number||""}`;img.title="Haz clic para ampliar";img.onclick=e=>{e.preventDefault();e.stopPropagation();openImageViewer(img.src,c)};
  n.querySelector(".card-name").textContent=c.canonical_name||c.name_original||"Pendiente de identificar";
  n.querySelector(".original-name").textContent=c.name_original&&c.name_original!==c.canonical_name?c.name_original:"";
  n.querySelector(".language-badge").textContent=c.language||"Unknown";const stock=n.querySelector(".stock-badge"),sold=(c.sale_status==="sold_out"||Number(c.stock_quantity)<=0);stock.textContent=sold?"NO DISPONIBLE":`${c.stock_quantity} disponible${c.stock_quantity===1?"":"s"}`;stock.classList.toggle("sold",sold);n.querySelector(".card").classList.toggle("sold-out",sold);
  n.querySelector(".card-id").textContent=c.id;n.querySelector(".card-number").textContent=c.card_number||"Pendiente";
  n.querySelector(".card-set").textContent=c.set_name||c.set_code||"Pendiente";n.querySelector(".card-hp").textContent=c.hp??"—";
  n.querySelector(".card-rarity").textContent=c.rarity_verified||c.rarity_detected||"Pendiente de revisión";
  n.querySelector(".card-status").textContent="Sin uso · protegida";
  const a=n.querySelector(".drive-link");if(a)a.remove();
  const fav=n.querySelector(".favorite-btn");if(sold){fav.disabled=true;fav.textContent="No disponible";}const selected=state.favorites.has(c.id); fav.classList.toggle("selected",selected); if(!sold)fav.textContent=selected?"♥ Seleccionada":"♡ Me interesa";
  fav.addEventListener("click",()=>toggleFavorite(c));
  grid.appendChild(n);
 });
}
["searchInput","languageFilter","rarityFilter"].forEach(id=>document.getElementById(id).addEventListener("input",render));
const requestedCard=new URLSearchParams(location.search).get("card");if(requestedCard){document.getElementById("searchInput").value=requestedCard}
loadCards().catch(e=>{console.error(e);document.getElementById("cardsGrid").innerHTML='<div class="empty">Error conectando con Supabase.</div>'});
const SHIPPING={
1:{L:9000,R:10450,N:17830,Z:25750,O:27560,E:42150},
2:{L:9000,R:10450,N:17830,Z:25750,O:27560,E:42150},
3:{L:12820,R:16070,N:25420,Z:33600,O:40880,E:61430},
4:{L:16230,R:19610,N:29270,Z:41250,O:49350,E:65730},
5:{L:16230,R:19610,N:29270,Z:41250,O:49350,E:65730}};
const cop=n=>new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",maximumFractionDigits:0}).format(n||0);
const WA="573125214785";
function imageUrl(c){
 const driveId=(c.source_image_url||"").match(/\/d\/([^/]+)/)?.[1];
 return c.image_path?`${SUPABASE_URL}/storage/v1/object/public/card-images/${c.image_path}`:(driveId?`https://drive.google.com/thumbnail?id=${driveId}&sz=w1000`:"");
}
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
document.getElementById("createOrder").onclick=()=>{const data={name:document.getElementById("buyerName").value.trim(),phone:document.getElementById("buyerPhone").value.trim(),document:document.getElementById("buyerDocument").value.trim(),department:document.getElementById("destDepartment").value.trim(),city:document.getElementById("destCity").value.trim(),address:document.getElementById("destAddress").value.trim(),neighborhood:document.getElementById("destNeighborhood").value.trim(),reference:document.getElementById("destReference").value.trim(),paymentMethod:document.getElementById("shippingPaymentMethod").value};if(!data.name||!data.phone||!data.department||!data.city||!data.address||!data.paymentMethod){alert("Completa nombre, celular, departamento, ciudad, dirección y medio de pago.");return}const id=makeOrderId(),expires=Date.now()+4*60*60*1000;state.order={id,expires,...data,cards:[...state.favorites.values()].filter(Boolean).map(c=>({id:c.id,name:c.canonical_name||c.name_original||"Carta",number:c.card_number})),offerTotal:state.offerMode==="lot"?parseCOP(document.getElementById("lotOffer").value):Object.values(state.offers).reduce((a,b)=>a+Number(b||0),0)};localStorage.setItem("pokemonPendingOrder",JSON.stringify(state.order));showReceipt();downloadOrderPDF()};
function downloadOrderPDF(){if(!state.order||!window.jspdf)return;const {jsPDF}=window.jspdf,d=new jsPDF(),o=state.order;let y=18;const line=(label,value)=>{d.setFont("helvetica","bold");d.text(label,14,y);d.setFont("helvetica","normal");d.text(String(value||"—"),65,y);y+=7};d.setFontSize(18);d.text("Pokemon Card Inventory - Pedido",14,y);y+=10;d.setFontSize(11);line("Referencia:",o.id);line("Valido hasta:",new Date(o.expires).toLocaleString("es-CO"));line("Nombre:",o.name);line("Celular:",o.phone);line("Documento:",o.document||"No informado");line("Departamento:",o.department);line("Ciudad:",o.city);line("Direccion:",o.address);line("Barrio/sector:",o.neighborhood||"No informado");line("Indicaciones:",o.reference||"No informado");line("Pago del envio:",o.paymentMethod);line("Oferta acordada:",cop(o.offerTotal));y+=4;d.setFont("helvetica","bold");d.text("Cartas",14,y);y+=7;d.setFont("helvetica","normal");o.cards.forEach((c,i)=>{const t=`${i+1}. ${c.name} - ${c.number||c.id}`;d.text(t,14,y);y+=6;if(y>270){d.addPage();y=18}});y+=5;d.setFont("helvetica","bold");d.text("Condicion de pago",14,y);y+=7;d.setFont("helvetica","normal");d.text(d.splitTextToSize("El envio debe pagarse antes del despacho. Conserva esta referencia y envia por WhatsApp la foto del comprobante junto con el numero de pedido. El valor de las cartas se gestiona contra entrega segun lo acordado.",180),14,y);d.save(`pedido-${o.id}.pdf`)}
document.getElementById("downloadReceipt").onclick=downloadOrderPDF;
function showReceipt(){if(!state.order)return;document.getElementById("orderReceipt").hidden=false;document.getElementById("receiptId").textContent=state.order.id;const tick=()=>{if(!state.order)return;const left=state.order.expires-Date.now();if(left<=0){document.getElementById("receiptCountdown").textContent="EXPIRADO";document.getElementById("shippingWhatsapp").style.pointerEvents="none";localStorage.removeItem("pokemonPendingOrder");return}const s=Math.floor(left/1000),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),ss=s%60;document.getElementById("receiptCountdown").textContent=`${h}:${String(m).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;const a=document.getElementById("shippingWhatsapp");a.href=`https://wa.me/${WA}?text=${encodeURIComponent(`Hola. Ya pagué el envío del pedido ${state.order.id}. Nombre: ${state.order.name}. Ciudad: ${state.order.city}. Adjunto la foto del comprobante de pago.`)}`;setTimeout(tick,1000)};tick()}
try{const saved=JSON.parse(localStorage.getItem("pokemonPendingOrder")||"null");if(saved&&saved.expires>Date.now()){state.order=saved;setTimeout(showReceipt,0)}}catch(e){}
function persistFavorites(){localStorage.setItem("pokemonFavorites",JSON.stringify([...state.favorites.keys()]))}
function toggleFavorite(card){state.favorites.has(card.id)?state.favorites.delete(card.id):state.favorites.set(card.id,card);persistFavorites();updateFavorites();render()}
function updateFavorites(){const n=state.favorites.size;document.getElementById("favoriteCountBar").textContent=n;document.getElementById("favoritesBar").hidden=!n;const btn=document.getElementById("cartViewerBtn");btn.hidden=!n;document.getElementById("cartViewerCount").textContent=n;const thumbs=document.getElementById("cartViewerThumbs");thumbs.innerHTML=[...state.favorites.values()].filter(Boolean).map(c=>`<img src="${imageUrl(c)}" alt="${c.canonical_name||c.name_original||"Carta"}" title="${c.canonical_name||c.name_original||c.id}">`).join("");thumbs.querySelectorAll("img").forEach((img,i)=>{const cards=[...state.favorites.values()].filter(Boolean);img.onclick=e=>{e.stopPropagation();openImageViewer(img.src,cards[i])}});if(document.getElementById("cartViewer").classList.contains("open"))renderCartViewer();if(document.getElementById("shippingCost"))updateQuote()}
document.getElementById("cartViewerBtn").onclick=openCartViewer;document.getElementById("closeCartViewer").onclick=closeCartViewer;document.getElementById("cartViewerBackdrop").onclick=closeCartViewer;
function openCartViewer(){renderCartViewer();document.getElementById("cartViewer").classList.add("open");document.getElementById("cartViewerBackdrop").hidden=false}
function closeCartViewer(){document.getElementById("cartViewer").classList.remove("open");document.getElementById("cartViewerBackdrop").hidden=true}
function renderCartViewer(){const cards=[...state.favorites.values()].filter(Boolean),g=document.getElementById("cartViewerGrid");document.getElementById("cartViewerSubtitle").textContent=cards.length+" seleccionada"+(cards.length===1?"":"s");g.innerHTML=cards.map(c=>`<div class="cart-view-card"><img src="${imageUrl(c)}" alt="${c.canonical_name||c.name_original||"Carta"}"><div><strong>${c.canonical_name||c.name_original||"Carta"}</strong><small>${c.card_number||c.id}</small></div></div>`).join("");g.querySelectorAll(".cart-view-card img").forEach((img,i)=>img.onclick=()=>openImageViewer(img.src,cards[i]))}
document.getElementById("reviewFavorites").onclick=openFavorites;
function openFavorites(){renderFavoriteItems();document.getElementById("favoritesModal").classList.add("open");document.getElementById("favoritesBackdrop").hidden=false}
function closeFavorites(){document.getElementById("favoritesModal").classList.remove("open");document.getElementById("favoritesBackdrop").hidden=true}
document.getElementById("closeFavorites").onclick=closeFavorites;document.getElementById("favoritesBackdrop").onclick=closeFavorites;
function parseCOP(v){return Number(String(v||"").replace(/\D/g,""))||0}
function formatCOPInput(el){const n=parseCOP(el.value);el.value=n?new Intl.NumberFormat("es-CO").format(n):""}
function renderFavoriteItems(){const box=document.getElementById("favoriteItems");box.innerHTML="";[...state.favorites.values()].filter(Boolean).forEach(card=>{const row=document.createElement("div");row.className="favorite-item";const disabled=state.offerMode==="lot"?"disabled":"";const max=Math.max(1,Number(card.stock_quantity||1));row.innerHTML=`<div><strong>${card.canonical_name||card.name_original||"Carta"}</strong><small>ID: ${card.id} · ${card.name_original&&card.name_original!==card.canonical_name?card.name_original+" · ":""}${card.card_number||""}</small><small>Disponibles: ${max}</small></div><div class="offer-controls"><label>Cantidad<input class="qty-input" type="number" min="1" max="${max}" value="${state.offers[card.id]?.qty||1}"></label><label>Oferta por unidad<div class="money-input"><span>$</span><input class="price-input" inputmode="numeric" placeholder="0" ${disabled} value="${state.offers[card.id]?.price?new Intl.NumberFormat("es-CO").format(state.offers[card.id].price):""}"></div></label></div>`;const qty=row.querySelector(".qty-input"),price=row.querySelector(".price-input");qty.oninput=e=>{const q=Math.min(max,Math.max(1,Number(e.target.value||1)));state.offers[card.id]={...(state.offers[card.id]||{}),qty:q};updateOfferTotal()};price.oninput=e=>{formatCOPInput(e.target);state.offers[card.id]={...(state.offers[card.id]||{}),price:parseCOP(e.target.value)};updateOfferTotal()};box.appendChild(row)});renderOfferHistory();updateOfferTotal()}
function updateOfferTotal(){const lot=parseCOP(document.getElementById("lotOffer").value),sum=[...state.favorites.keys()].reduce((a,id)=>{const o=state.offers[id]||{};return a+(Number(o.price||0)*Number(o.qty||1))},0);document.getElementById("offerTotal").textContent=cop(lot||sum)}
document.getElementById("lotOffer").oninput=e=>{formatCOPInput(e.target);updateOfferTotal()};
document.querySelectorAll('input[name="offerMode"]').forEach(r=>r.onchange=e=>{state.offerMode=e.target.value;document.getElementById("lotOfferBox").hidden=state.offerMode!=="lot";renderFavoriteItems()});
document.getElementById("sendOffer").onclick=()=>{const lot=parseCOP(document.getElementById("lotOffer").value);const cards=[...state.favorites.values()].filter(Boolean);const total=state.offerMode==="lot"?lot:cards.reduce((a,c)=>{const o=state.offers[c.id]||{};return a+Number(o.price||0)*Number(o.qty||1)},0);if(!total){alert("Escribe tu oferta antes de continuar.");return}const ref="OF-"+Date.now().toString(36).toUpperCase();const lines=cards.map(c=>{const o=state.offers[c.id]||{},qty=Number(o.qty||1),price=Number(o.price||0);return state.offerMode==="lot"?`• ID ${c.id} | ${c.canonical_name||c.name_original} | Cantidad: ${qty}`:`• ID ${c.id} | ${c.canonical_name||c.name_original} | Cantidad: ${qty} | Oferta por unidad: ${cop(price)} | Subtotal: ${cop(price*qty)}`});const record={id:ref,date:new Date().toISOString(),mode:state.offerMode,total,cards:cards.map(c=>({id:c.id,name:c.canonical_name||c.name_original,number:c.card_number,qty:Number(state.offers[c.id]?.qty||1)}))};state.offerHistory.unshift(record);state.offerHistory=state.offerHistory.slice(0,30);localStorage.setItem("pokemonOfferHistory",JSON.stringify(state.offerHistory));renderOfferHistory();const intro=`¡Hola! Espero que estén muy bien. 👋\n\nEncontré varias cartas increíbles en Pokémon Card Inventory y me gustaría comprarlas. Les comparto mi propuesta para que podamos revisarla y llegar a un acuerdo.\n\nReferencia de mi oferta: ${ref}\nModalidad: ${state.offerMode==="lot"?"Oferta por el lote completo":"Oferta por carta"}\n\n`;const close=state.offerMode==="lot"?`\nMi propuesta por el lote completo es: ${cop(total)}`:`\nMi propuesta total es: ${cop(total)}`;const note="\n\n¿Podrían confirmarme cuáles cartas y cantidades están disponibles y si podemos cerrar la compra con esta propuesta? Muchas gracias. Quedo atento. 😊";window.open(`https://wa.me/${WA}?text=${encodeURIComponent(intro+lines.join("\n")+close+note)}`,"_blank")};
function cardLink(id){return location.origin+location.pathname+"?card="+encodeURIComponent(id)}
function renderOfferHistory(){const box=document.getElementById("offerHistory");if(!box)return;if(!state.offerHistory.length){box.innerHTML='<p class="history-empty">Todavía no has enviado ofertas.</p>';return}box.innerHTML=state.offerHistory.map(o=>`<article class="history-card"><div class="history-head"><div><strong>${o.id}</strong><small>${new Date(o.date).toLocaleString("es-CO")} · ${o.cards.length} referencia${o.cards.length===1?"":"s"}</small></div><strong>${cop(o.total)}</strong></div><div class="history-cards">${o.cards.map(c=>`<a href="${cardLink(c.id)}" title="Ver ${c.name}"><span>${c.name}</span><small>ID ${c.id} · ${c.number||"Sin número"} · Cantidad: ${c.qty||1}</small></a>`).join("")}</div></article>`).join("")}
document.getElementById("startShipping").onclick=()=>{closeFavorites();openShipping()};
document.getElementById("clearFavorites").onclick=()=>{if(confirm("¿Quieres borrar todas las cartas guardadas?")){state.favorites.clear();persistFavorites();updateFavorites();render()}};
document.getElementById("quoteFavorites").onclick=()=>{const lines=[...state.favorites.values()].map(c=>`• ${c.canonical_name||c.name_original||"Carta"} — ${c.card_number||c.id}`);window.open(`https://wa.me/${WA}?text=${encodeURIComponent("Hola, quiero cotizar estas cartas Pokémon:\n"+lines.join("\n")+"\n\n¿Me confirmas disponibilidad y precio?")}`,"_blank")};
updateFavorites();
function openImageViewer(src,card){const v=document.getElementById("imageViewer");document.getElementById("viewerImage").src=src;document.getElementById("viewerCaption").textContent=(card.canonical_name||card.name_original||"Carta")+" · "+(card.card_number||card.id);v.hidden=false;requestAnimationFrame(()=>v.classList.add("open"));document.body.classList.add("viewer-open")}
function closeImageViewer(){const v=document.getElementById("imageViewer");v.classList.remove("open");document.body.classList.remove("viewer-open");setTimeout(()=>v.hidden=true,160)}
document.getElementById("closeImageViewer").onclick=e=>{e.preventDefault();e.stopPropagation();closeImageViewer()};
document.getElementById("imageViewer").addEventListener("click",e=>{const img=document.getElementById("viewerImage");if(!img.contains(e.target))closeImageViewer()});
document.getElementById("viewerImage").addEventListener("click",e=>e.stopPropagation());
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!document.getElementById("imageViewer").hidden)closeImageViewer()});
document.getElementById("thumbPrev").onclick=e=>{e.stopPropagation();document.getElementById("cartViewerThumbs").scrollBy({left:-260,behavior:"smooth"})};
document.getElementById("thumbNext").onclick=e=>{e.stopPropagation();document.getElementById("cartViewerThumbs").scrollBy({left:260,behavior:"smooth"})};
