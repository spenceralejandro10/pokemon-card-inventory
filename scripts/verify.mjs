import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=(file)=>fs.readFileSync(path.join(root,file),"utf8");
const html=read("index.html");
const app=read("app.js");
const css=read("styles.css");
const edgeFunction=read("supabase/functions/sale-order/index.ts");
const failures=[];

function assert(condition,message){
 if(!condition)throw new Error(message);
}
function check(label,fn){
 try{fn();console.log("✓ "+label)}
 catch(error){failures.push(label+": "+error.message);console.error("✗ "+label)}
}
function matches(source,pattern){return Array.from(source.matchAll(pattern),function(match){return match[1]})}

check("JavaScript válido",function(){new vm.Script(app,{filename:"app.js"})});

check("JSON y claves de producto válidos",function(){
 const cards=JSON.parse(read("data/cards.json"));
 const demos=JSON.parse(read("data/demo-products.json"));
 assert(Array.isArray(cards)&&cards.length>0,"data/cards.json debe ser una lista no vacía");
 assert(Array.isArray(demos)&&demos.length>0,"data/demo-products.json debe ser una lista no vacía");
 const products=cards.map(function(item){return {category:"pokemon",...item}}).concat(demos);
 const keys=new Set();
 products.forEach(function(item,index){
  assert(item.id,"Producto "+index+" sin id");
  const namePending=item.validation_status==="needs_name_and_catalog_verification";
  assert(item.canonical_name||item.name_original||namePending,"Producto "+item.id+" sin nombre ni estado de verificación");
  const key=String(item.category||"product")+"::"+String(item.id);
  assert(!keys.has(key),"Clave duplicada "+key);
  keys.add(key);
 });
});

check("IDs HTML únicos y referencias existentes",function(){
 const ids=matches(html,/\bid=["']([^"']+)["']/g);
 const unique=new Set();
 ids.forEach(function(id){assert(!unique.has(id),"ID duplicado #"+id);unique.add(id)});
 const references=matches(app,/getElementById\(["']([^"']+)["']\)/g);
 references.forEach(function(id){assert(unique.has(id),"app.js referencia el ID inexistente #"+id)});
});

check("Recursos locales enlazados",function(){
 const refs=matches(html,/\b(?:src|href)=["']([^"']+)["']/g);
 refs.forEach(function(ref){
  if(/^(?:https?:|\/\/|#|mailto:|tel:)/i.test(ref))return;
  const local=ref.split(/[?#]/)[0];
  if(local)assert(fs.existsSync(path.join(root,local)),"No existe "+local);
 });
});

check("Versiones de caché coordinadas",function(){
 const styleVersion=html.match(/styles\.css\?v=([^"']+)/)?.[1];
 const scriptVersion=html.match(/app\.js\?v=([^"']+)/)?.[1];
 assert(styleVersion&&scriptVersion,"Falta versionar app.js o styles.css");
 assert(styleVersion===scriptVersion,"Las versiones de app.js y styles.css no coinciden");
});

check("Enlaces externos seguros",function(){
 const externalTabs=Array.from(html.matchAll(/<a\b[^>]*target=["']_blank["'][^>]*>/gi),function(match){return match[0]});
 externalTabs.forEach(function(tag){assert(/\brel=["'][^"']*noopener/i.test(tag),"Enlace _blank sin rel=noopener")});
});

check("CSS con bloques balanceados",function(){
 let depth=0,inComment=false,quote="";
 for(let i=0;i<css.length;i++){
  const char=css[i],next=css[i+1];
  if(inComment){if(char==="*"&&next==="/"){inComment=false;i++}continue}
  if(!quote&&char==="/"&&next==="*"){inComment=true;i++;continue}
  if(quote){if(char==="\\")i++;else if(char===quote)quote="";continue}
  if(char==='"'||char==="'"){quote=char;continue}
  if(char==="{")depth++;
  if(char==="}")depth--;
  assert(depth>=0,"Hay una llave de cierre adicional");
 }
 assert(!inComment,"Comentario CSS sin cerrar");
 assert(!quote,"Cadena CSS sin cerrar");
 assert(depth===0,"Hay bloques CSS sin cerrar");
});

check("Función de pedidos sin secretos incrustados",function(){
 assert(edgeFunction.includes('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")'),"La clave de servicio debe venir del entorno");
 assert(!/sb_secret_[A-Za-z0-9_-]+/.test(edgeFunction),"Se encontró una clave secreta literal");
 assert(!/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./.test(edgeFunction),"Se encontró un JWT literal");
 assert(!/SUPABASE_SERVICE_ROLE_KEY/.test(app),"El frontend no puede acceder a la clave de servicio");
});

if(failures.length){
 console.error("\n"+failures.length+" verificación(es) fallaron:");
 failures.forEach(function(failure){console.error("- "+failure)});
 process.exit(1);
}
console.log("\nTodas las verificaciones pasaron.");
