import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=(file)=>fs.readFileSync(path.join(root,file),"utf8");
const html=read("index.html");
const app=read("app.js");
const css=read("styles.css");
const adminHtml=read("admin.html");
const adminScriptPath=matches(adminHtml,/<script\s+src=["']([^"']+\.js(?:\?[^"']*)?)["']/gi)
 .map(function(src){return src.split("?")[0]})
 .find(function(src){return /^admin-runtime-[\w.-]+\.js$/.test(src)});
const adminApp=adminScriptPath?read(adminScriptPath):"";
const adminSource=read("admin.js");
const adminCss=read("admin.css");
const migrationSource=fs.readdirSync(path.join(root,"supabase/migrations"))
 .filter(function(file){return file.endsWith(".sql")})
 .map(function(file){return read("supabase/migrations/"+file)})
 .join("\n");
const edgeFunctionPaths=[
 "supabase/functions/sale-order/index.ts",
 "supabase/functions/admin-control/index.ts",
 "supabase/functions/mercadolibre-oauth/index.ts",
 "supabase/functions/mercadolibre-webhook/index.ts"
];
const edgeFunctions=edgeFunctionPaths.map(function(file){return {file,source:read(file)}});
const failures=[];

function assert(condition,message){
 if(!condition)throw new Error(message);
}
function check(label,fn){
 try{fn();console.log("✓ "+label)}
 catch(error){failures.push(label+": "+error.message);console.error("✗ "+label)}
}
function matches(source,pattern){return Array.from(source.matchAll(pattern),function(match){return match[1]})}

check("JavaScript público y administrativo válido",function(){
 new vm.Script(app,{filename:"app.js"});
 assert(adminScriptPath,"admin.html no carga un runtime JavaScript");
 new vm.Script(adminApp,{filename:adminScriptPath});
 new vm.Script(adminSource,{filename:"admin.js"});
});

check("JSON y claves de producto válidos",function(){
 const cards=JSON.parse(read("data/cards.json"));
 const demos=JSON.parse(read("data/demo-products.json"));
 assert(Array.isArray(cards),"data/cards.json debe ser una lista");
 assert(Array.isArray(demos),"data/demo-products.json debe ser una lista");
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
 [["index.html",html,"app.js",app],["admin.html",adminHtml,adminScriptPath,adminApp]].forEach(function(entry){
  const [htmlFile,markup,scriptFile,source]=entry;
  const ids=matches(markup,/\bid=["']([^"']+)["']/g);
  const unique=new Set();
  ids.forEach(function(id){assert(!unique.has(id),htmlFile+" contiene el ID duplicado #"+id);unique.add(id)});
  matches(source,/\bid=["']([^"']+)["']/g).forEach(function(id){unique.add(id)});
  const references=matches(source,/getElementById\(["']([^"']+)["']\)/g);
  references.forEach(function(id){assert(unique.has(id),scriptFile+" referencia el ID inexistente #"+id)});
 });
});

check("Recursos locales enlazados",function(){
 [["index.html",html],["admin.html",adminHtml]].forEach(function(entry){
  const refs=matches(entry[1],/\b(?:src|href)=["']([^"']+)["']/g);
  refs.forEach(function(ref){
   if(/^(?:https?:|\/\/|#|mailto:|tel:)/i.test(ref))return;
   const local=ref.split(/[?#]/)[0];
   if(local)assert(fs.existsSync(path.join(root,local)),entry[0]+" enlaza un recurso inexistente: "+local);
  });
 });
});

check("Recursos principales versionados para caché",function(){
 const styleVersion=html.match(/styles\.css\?v=([^"']+)/)?.[1];
 const scriptVersion=html.match(/app\.js\?v=([^"']+)/)?.[1];
 assert(styleVersion&&scriptVersion,"Falta versionar app.js o styles.css");
});

check("Enlaces externos seguros",function(){
 [html,adminHtml].forEach(function(markup){
  const externalTabs=Array.from(markup.matchAll(/<a\b[^>]*target=["']_blank["'][^>]*>/gi),function(match){return match[0]});
  externalTabs.forEach(function(tag){assert(/\brel=["'][^"']*noopener/i.test(tag),"Enlace _blank sin rel=noopener")});
 });
});

check("CSS con bloques balanceados",function(){
 [["styles.css",css],["admin.css",adminCss]].forEach(function(entry){
  const [file,source]=entry;
  let depth=0,inComment=false,quote="";
  for(let i=0;i<source.length;i++){
   const char=source[i],next=source[i+1];
   if(inComment){if(char==="*"&&next==="/"){inComment=false;i++}continue}
   if(!quote&&char==="/"&&next==="*"){inComment=true;i++;continue}
   if(quote){if(char==="\\")i++;else if(char===quote)quote="";continue}
   if(char==='"'||char==="'"){quote=char;continue}
   if(char==="{")depth++;
   if(char==="}")depth--;
   assert(depth>=0,file+" tiene una llave de cierre adicional");
  }
  assert(!inComment,file+" tiene un comentario sin cerrar");
  assert(!quote,file+" tiene una cadena sin cerrar");
  assert(depth===0,file+" tiene bloques sin cerrar");
 });
});

check("Funciones Edge sin secretos incrustados",function(){
 edgeFunctions.forEach(function(entry){
  assert(entry.source.includes('jsr:@supabase/functions-js@2.116.0/edge-runtime.d.ts'),entry.file+" debe fijar la versión del runtime de Supabase");
  assert(entry.source.includes('npm:@supabase/supabase-js@2.116.0'),entry.file+" debe fijar la versión de supabase-js");
  assert(entry.source.includes('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")'),entry.file+" debe leer la clave de servicio del entorno");
  assert(!/sb_secret_[A-Za-z0-9_-]+/.test(entry.source),entry.file+" contiene una clave secreta literal");
  assert(!/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./.test(entry.source),entry.file+" contiene un JWT literal");
 });
 assert(!/SUPABASE_SERVICE_ROLE_KEY/.test(app+adminApp+adminSource),"El frontend no puede acceder a la clave de servicio");
});

check("Defensas críticas de Mercado Libre activas",function(){
 const admin=edgeFunctions.find(function(entry){return entry.file.includes("admin-control")})?.source||"";
 const oauth=edgeFunctions.find(function(entry){return entry.file.includes("mercadolibre-oauth")})?.source||"";
 const webhook=edgeFunctions.find(function(entry){return entry.file.includes("mercadolibre-webhook")})?.source||"";
 assert(oauth.includes('action === "preflight"'),"OAuth debe exponer la revisión previa");
 assert(oauth.includes('MERCADOLIBRE_AUTHORIZATION_ENABLED'),"OAuth debe tener un interruptor de habilitación productiva");
 assert(oauth.includes('error: "AUTHORIZATION_DISABLED"'),"OAuth debe bloquear el inicio mientras la habilitación productiva esté apagada");
 assert(oauth.includes('code_challenge_method", "S256"'),"OAuth debe exigir PKCE S256");
 assert(oauth.includes('siteId !== EXPECTED_SITE_ID'),"OAuth debe rechazar cuentas fuera de MCO");
 assert(oauth.includes('refreshToken.length < 10'),"OAuth debe exigir refresh token");
 assert(oauth.includes('scopes.has("read")')&&oauth.includes('scopes.has("write")'),"OAuth debe exigir scopes de lectura y escritura");
 assert(oauth.includes('scopes.has("offline_access")'),"OAuth debe exigir el scope de renovación offline_access");
 assert(oauth.includes("admin_session_id"),"OAuth debe ligar el state a la sesión administrativa");
 assert(oauth.includes('error: "MANUAL_CHECKS_REQUIRED"'),"OAuth debe exigir la confirmación de configuración externa");
 assert(oauth.includes('manualChecks.test_users === true'),"OAuth debe exigir pruebas exclusivamente con usuarios de test");
 assert(webhook.includes('applicationId !== Number(CLIENT_ID)'),"El webhook debe validar application_id");
 assert(webhook.includes('Number(tokens.user_id) !== userId'),"El webhook debe validar user_id");
 assert(webhook.includes('url.pathname.startsWith(prefix)'),"El webhook debe limitar rutas de recursos");
 assert(webhook.includes('readLimitedBody(req)'),"El webhook debe limitar el cuerpo por bytes");
 assert(webhook.includes("timedFetch"),"Las llamadas del webhook deben tener timeout");
 assert(webhook.includes('refreshToken.length >= 10'),"La renovación debe exigir un refresh token nuevo");
 assert(webhook.includes("mercadolibre_mark_connection_error"),"El webhook debe cortar llamadas después de errores críticos de API");
 assert(migrationSource.includes("cardnest-mercadolibre-data-retention"),"La integración debe programar la retención de metadatos");
 assert(migrationSource.includes("received_at < now() - interval '30 days'"),"Los metadatos de webhook deben expirar");
 assert(/id=["']mlConnectBtn["'][^>]*\bdisabled\b/.test(adminHtml),"El botón OAuth debe iniciar bloqueado");
 assert(adminHtml.includes('id="mlPreflightChecks"'),"El panel debe mostrar la revisión previa");
 assert(adminApp.includes('mlApi("preflight")'),"El frontend debe repetir el preflight antes de autorizar");
 assert(adminApp.includes("validMlAuthorizationUrl"),"El frontend debe validar la URL de autorización");
 assert(adminApp.includes("mlManualReady"),"El frontend debe exigir la lista manual de Mercado Libre Developers");
 assert(adminHtml.includes('data-ml-manual="test_users"'),"El panel debe exigir la confirmación de usuarios de test");
 assert(admin.includes("readLimitedBody(req)"),"La API administrativa debe limitar el cuerpo por bytes");
 assert(admin.includes('error:"ORIGIN_NOT_ALLOWED"'),"La API administrativa debe rechazar orígenes externos");
 assert(admin.includes('error:"PRODUCT_NOT_SELLABLE"'),"La selección para ML debe validar inventario vendible");
 assert(!admin.includes('if(action==="change_password")'),"La ruta antigua sin contraseña actual debe permanecer deshabilitada");
});

if(failures.length){
 console.error("\n"+failures.length+" verificación(es) fallaron:");
 failures.forEach(function(failure){console.error("- "+failure)});
 process.exit(1);
}
console.log("\nTodas las verificaciones pasaron.");
