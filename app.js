const SUPABASE_URL="https://cnivcnexsqobipvqxero.supabase.co";
const SUPABASE_KEY="sb_publishable_6UjwLuM-op0-OBKWlbusTw_qmLNZVfU";
const state={cards:[]};

async function loadCards(){
  const res=await fetch(`${SUPABASE_URL}/rest/v1/cards?select=*&order=id.asc`,{
    headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`}
  });
  if(!res.ok) throw new Error(await res.text());
  state.cards=await res.json();
  populateRarityFilter(); render();
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
  img.src=c.image_path?`${SUPABASE_URL}/storage/v1/object/public/card-images/${c.image_path}`:"";
  img.alt=`${c.canonical_name||c.name_original||"Carta"} ${c.card_number||""}`;
  n.querySelector(".card-name").textContent=c.canonical_name||c.name_original||"Pendiente de identificar";
  n.querySelector(".original-name").textContent=c.name_original&&c.name_original!==c.canonical_name?c.name_original:"";
  n.querySelector(".language-badge").textContent=c.language||"Unknown";
  n.querySelector(".card-id").textContent=c.id;n.querySelector(".card-number").textContent=c.card_number||"Pendiente";
  n.querySelector(".card-set").textContent=c.set_name||c.set_code||"Pendiente";n.querySelector(".card-hp").textContent=c.hp??"—";
  n.querySelector(".card-rarity").textContent=c.rarity_verified||c.rarity_detected||"Pendiente de revisión";
  n.querySelector(".card-status").textContent=c.validation_status;
  const a=n.querySelector(".drive-link");a.href=c.source_image_url||"#";if(!c.source_image_url)a.style.display="none";
  grid.appendChild(n);
 });
}
["searchInput","languageFilter","rarityFilter"].forEach(id=>document.getElementById(id).addEventListener("input",render));
loadCards().catch(e=>{console.error(e);document.getElementById("cardsGrid").innerHTML='<div class="empty">Error conectando con Supabase.</div>'});