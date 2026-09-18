const state={cards:[]};

async function loadCards(){
  const res=await fetch("data/cards.json",{cache:"no-store"});
  state.cards=await res.json();
  populateRarityFilter();
  render();
}

function populateRarityFilter(){
  const select=document.getElementById("rarityFilter");
  const rarities=[...new Set(state.cards.map(c=>c.rarity_verified||c.rarity_detected).filter(Boolean))].sort();
  for(const rarity of rarities){
    const opt=document.createElement("option");
    opt.value=rarity; opt.textContent=rarity;
    select.appendChild(opt);
  }
}

function normalize(v){return String(v??"").toLowerCase().trim()}

function matches(card,q,language,rarity){
  const haystack=[
    card.id,card.name_original,card.canonical_name,card.number,
    card.set_name,card.set_code,card.language,card.rarity_detected,
    card.rarity_verified,card.hp,card.variant
  ].map(normalize).join(" ");
  const textOk=!q||haystack.includes(normalize(q));
  const langOk=!language||card.language===language;
  const effectiveRarity=card.rarity_verified||card.rarity_detected||"";
  const rarityOk=!rarity||effectiveRarity===rarity;
  return textOk&&langOk&&rarityOk;
}

function render(){
  const q=document.getElementById("searchInput").value;
  const language=document.getElementById("languageFilter").value;
  const rarity=document.getElementById("rarityFilter").value;
  const filtered=state.cards.filter(c=>matches(c,q,language,rarity));

  const grid=document.getElementById("cardsGrid");
  const tpl=document.getElementById("cardTemplate");
  grid.innerHTML="";
  document.getElementById("countLabel").textContent=`${filtered.length} carta${filtered.length===1?"":"s"}`;

  if(!filtered.length){
    grid.innerHTML='<div class="empty">No se encontraron cartas.</div>';
    return;
  }

  for(const card of filtered){
    const node=tpl.content.cloneNode(true);
    const img=node.querySelector(".card-image");
    img.src=card.image_url||"";
    img.alt=`${card.canonical_name||card.name_original} ${card.number||""}`;
    node.querySelector(".card-name").textContent=card.canonical_name||card.name_original||"Sin nombre";
    node.querySelector(".original-name").textContent=
      card.name_original && card.name_original!==card.canonical_name ? card.name_original : "";
    node.querySelector(".language-badge").textContent=card.language||"Unknown";
    node.querySelector(".card-id").textContent=card.id||"—";
    node.querySelector(".card-number").textContent=card.number||"—";
    node.querySelector(".card-set").textContent=card.set_name||card.set_code||"Pendiente";
    node.querySelector(".card-hp").textContent=card.hp??"—";
    node.querySelector(".card-rarity").textContent=
      card.rarity_verified||card.rarity_detected||"Unknown";
    node.querySelector(".card-status").textContent=card.validation_status||"pending";
    const a=node.querySelector(".drive-link");
    a.href=card.source_image_url||card.image_url||"#";
    if(!card.source_image_url&&!card.image_url){a.style.display="none"}
    grid.appendChild(node);
  }
}

["searchInput","languageFilter","rarityFilter"].forEach(id=>{
  document.getElementById(id).addEventListener("input",render);
});

loadCards().catch(err=>{
  console.error(err);
  document.getElementById("cardsGrid").innerHTML='<div class="empty">No fue posible cargar la base de datos.</div>';
});