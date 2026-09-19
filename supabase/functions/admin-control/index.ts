import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb, degrees } from "npm:pdf-lib@1.17.1";

const allowedOrigins=new Set([
  "https://spenceralejandro10.github.io",
  "https://cardnest.co",
  "https://www.cardnest.co",
  "http://localhost:8000",
  "http://127.0.0.1:8000"
]);
const MAX_BODY_BYTES=15_000_000;
const AVATAR_MAX_BYTES=10_485_760;
const CHAT_FILE_MAX_BYTES=5_242_880;
const clean=(v:unknown)=>String(v??"").trim();
const hex=(bytes:Uint8Array)=>Array.from(bytes).map(b=>b.toString(16).padStart(2,"0")).join("");
const safeFileName=(name:string)=>name.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,90)||"archivo";
const allowedAttachmentMimes=new Set([
  "image/jpeg","image/png","image/webp","image/gif","application/pdf","text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"
]);
const allowedAvatarMimes=new Set(["image/jpeg","image/png","image/webp","image/gif"]);

async function sha256(value:string){
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))));
}
function corsHeaders(req:Request){
  const origin=req.headers.get("origin")||"";
  const allow=allowedOrigins.has(origin)?origin:"https://spenceralejandro10.github.io";
  return {
    "Access-Control-Allow-Origin":allow,
    "Vary":"Origin",
    "Access-Control-Allow-Headers":"content-type, apikey, x-admin-token",
    "Access-Control-Allow-Methods":"POST, OPTIONS",
    "Cache-Control":"no-store",
    "Content-Type":"application/json",
    "Referrer-Policy":"no-referrer",
    "X-Content-Type-Options":"nosniff",
    "X-Frame-Options":"DENY"
  };
}
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:corsHeaders(req)});

function decodeBase64(data:string){
  const payload=data.includes(",")?data.slice(data.indexOf(",")+1):data;
  const binary=atob(payload);
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return bytes;
}
function bytesToBase64(bytes:Uint8Array){
  let out="";
  const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk){
    out+=String.fromCharCode(...bytes.subarray(i,Math.min(i+chunk,bytes.length)));
  }
  return btoa(out);
}
function pdfText(value:unknown){
  return String(value??"")
    .replace(/[–—]/g,"-")
    .replace(/·/g,"-")
    .replace(/[“”]/g,'"')
    .replace(/[‘’]/g,"'")
    .replace(/[^\u0020-\u007E\u00A0-\u00FF]/g," ")
    .replace(/\s+/g," ")
    .trim();
}
function roleFunctions(title:string){
  const t=String(title||"");
  if(t==="CEO & Fundador")return [
    "Direccion estrategica y definicion de prioridades corporativas.",
    "Supervision del modelo comercial, tecnologico y operativo de CardNest.",
    "Aprobacion de alianzas, canales de venta e iniciativas de crecimiento.",
    "Gobierno general de producto, marca, seguridad y evolucion de la plataforma."
  ];
  if(/Gerente General|COO|Gerente de Operaciones/i.test(t))return [
    "Coordinacion de la operacion diaria y seguimiento de objetivos.",
    "Supervision de procesos internos, inventario y calidad operativa.",
    "Articulacion entre tecnologia, comercial y administracion.",
    "Seguimiento de indicadores y mejora continua."
  ];
  if(/CTO|Tecnologia/i.test(t))return [
    "Direccion de arquitectura, plataformas e integraciones tecnologicas.",
    "Supervision de seguridad, automatizacion y continuidad de sistemas.",
    "Definicion de estandares tecnicos y prioridades de desarrollo.",
    "Evaluacion de nuevas tecnologias aplicables al negocio."
  ];
  if(/CFO|Financiero/i.test(t))return [
    "Planeacion y seguimiento financiero interno.",
    "Control de presupuestos, costos y reportes de gestion.",
    "Apoyo a decisiones economicas y sostenibilidad operativa.",
    "Coordinacion de controles financieros y trazabilidad."
  ];
  if(/CMO|Marketing|Comercial/i.test(t))return [
    "Planeacion comercial y posicionamiento de la marca.",
    "Coordinacion de canales, campanas y relacion con clientes.",
    "Seguimiento de oportunidades y crecimiento comercial.",
    "Apoyo a estrategia de producto y comunicacion."
  ];
  if(/Director|Gerente/i.test(t))return [
    "Direccion del area asignada y cumplimiento de objetivos.",
    "Coordinacion de procesos, prioridades y recursos del area.",
    "Seguimiento de resultados y reporte a direccion.",
    "Mejora continua y control de calidad."
  ];
  if(/Coordinador|Lider/i.test(t))return [
    "Coordinacion de tareas y seguimiento operativo del area.",
    "Apoyo a documentacion, control y comunicacion interna.",
    "Ejecucion de prioridades definidas por la gerencia.",
    "Reporte de avances, riesgos y oportunidades de mejora."
  ];
  return [
    "Ejecucion de funciones propias del rol asignado.",
    "Apoyo a procesos internos y cumplimiento de procedimientos.",
    "Registro y trazabilidad de actividades bajo su responsabilidad.",
    "Colaboracion con las areas operativas y administrativas."
  ];
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders(req)});
  if(req.method!=="POST")return json(req,{error:"METHOD_NOT_ALLOWED"},405);
  const contentLength=Number(req.headers.get("content-length")||0);
  if(contentLength>MAX_BODY_BYTES)return json(req,{error:"PAYLOAD_TOO_LARGE",message:"El archivo o la solicitud es demasiado grande."},413);

  const supabaseUrl=Deno.env.get("SUPABASE_URL")??"";
  const serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
  if(!supabaseUrl||!serviceRole)return json(req,{error:"SERVER_CONFIG"},500);
  const db=createClient(supabaseUrl,serviceRole,{auth:{persistSession:false,autoRefreshToken:false}});

  let body:Record<string,unknown>;
  try{
    const raw=await req.text();
    if(raw.length>MAX_BODY_BYTES)return json(req,{error:"PAYLOAD_TOO_LARGE",message:"El archivo o la solicitud es demasiado grande."},413);
    const parsed=JSON.parse(raw||"{}");
    if(!parsed||Array.isArray(parsed)||typeof parsed!=="object")throw new Error("bad");
    body=parsed as Record<string,unknown>;
  }catch{
    return json(req,{error:"INVALID_JSON"},400);
  }

  const action=clean(body.action);

  async function audit(userId:string|null,a:string,entityType?:string,entityId?:string,details:Record<string,unknown>={}){
    const {error}=await db.from("admin_audit_log").insert({
      admin_user_id:userId,
      action:a,
      entity_type:entityType||null,
      entity_id:entityId||null,
      details
    });
    if(error)console.error("audit insert failed",error.code);
  }

  async function requireSession(){
    const token=clean(req.headers.get("x-admin-token"));
    if(token.length<40)return null;
    const hash=await sha256(token);
    const now=new Date().toISOString();
    const {data:session,error:sError}=await db.from("admin_sessions")
      .select("id,admin_user_id,expires_at,revoked_at")
      .eq("token_hash",hash)
      .is("revoked_at",null)
      .gt("expires_at",now)
      .maybeSingle();
    if(sError||!session)return null;
    const {data:user,error:uError}=await db.from("admin_users")
      .select("id,username,display_name,role,must_change_password,is_active,corporate_title,professional_title,profile_frame_style,avatar_path,last_login_at,last_seen_at")
      .eq("id",session.admin_user_id)
      .eq("is_active",true)
      .maybeSingle();
    if(uError||!user)return null;
    const seen=new Date().toISOString();
    await Promise.all([
      db.from("admin_sessions").update({last_seen_at:seen}).eq("id",session.id),
      db.from("admin_users").update({last_seen_at:seen}).eq("id",user.id)
    ]);
    user.last_seen_at=seen;
    return {token,session,user};
  }

  async function signedUrl(path:string|null,expires=3600){
    if(!path)return null;
    const {data,error}=await db.storage.from("admin-media").createSignedUrl(path,expires);
    if(error||!data?.signedUrl)return null;
    return data.signedUrl;
  }

  async function getProfiles(){
    const now=Date.now();
    const {data:users,error:uError}=await db.from("admin_users")
      .select("id,username,display_name,role,corporate_title,professional_title,profile_frame_style,avatar_path,last_login_at,last_seen_at,is_active")
      .eq("is_active",true)
      .order("role",{ascending:false})
      .order("created_at",{ascending:true});
    if(uError)throw uError;
    const {data:sessions,error:sError}=await db.from("admin_sessions")
      .select("admin_user_id,last_seen_at,expires_at,revoked_at")
      .is("revoked_at",null)
      .gt("expires_at",new Date().toISOString());
    if(sError)throw sError;
    const lastByUser=new Map<string,number>();
    for(const s of sessions||[]){
      const t=new Date(s.last_seen_at).getTime();
      if(Number.isFinite(t)&&t>(lastByUser.get(s.admin_user_id)||0))lastByUser.set(s.admin_user_id,t);
    }
    return await Promise.all((users||[]).map(async(u:any)=>{
      const activeAt=lastByUser.get(u.id)||0;
      return {
        id:u.id,
        username:u.username,
        display_name:u.display_name,
        role:u.role,
        corporate_title:u.corporate_title||"",
        professional_title:u.professional_title||"",
        profile_frame_style:u.profile_frame_style||"standard",
        avatar_path:u.avatar_path||null,
        avatar_url:await signedUrl(u.avatar_path,3600),
        last_login_at:u.last_login_at,
        last_seen_at:u.last_seen_at,
        online:activeAt>0&&(now-activeAt)<90_000
      };
    }));
  }

  async function unreadCount(userId:string){
    const {data:readRow}=await db.from("admin_chat_reads").select("last_read_message_id").eq("user_id",userId).maybeSingle();
    const last=Number(readRow?.last_read_message_id||0);
    const {count}=await db.from("admin_chat_messages")
      .select("id",{count:"exact",head:true})
      .eq("recipient_id",userId)
      .gt("id",last);
    return count||0;
  }

  if(action==="login"){
    const username=clean(body.username).toLowerCase();
    const password=String(body.password??"");
    if(!/^[a-z0-9_]{4,40}$/.test(username)||password.length<8){
      return json(req,{error:"INVALID_CREDENTIALS",message:"Usuario o contraseña incorrectos."},401);
    }
    const cutoff=new Date(Date.now()-15*60*1000).toISOString();
    const {count}=await db.from("admin_login_attempts").select("id",{count:"exact",head:true})
      .eq("username",username).eq("success",false).gte("created_at",cutoff);
    if((count||0)>=8)return json(req,{error:"TOO_MANY_ATTEMPTS",message:"Demasiados intentos. Espera 15 minutos."},429);

    const {data,error}=await db.rpc("admin_check_credentials",{p_username:username,p_password:password});
    const user=Array.isArray(data)?data[0]:null;
    if(error||!user){
      await db.from("admin_login_attempts").insert({username,success:false});
      return json(req,{error:"INVALID_CREDENTIALS",message:"Usuario o contraseña incorrectos."},401);
    }
    await db.from("admin_login_attempts").insert({username,success:true});
    await db.from("admin_sessions").update({revoked_at:new Date().toISOString()})
      .eq("admin_user_id",user.id).is("revoked_at",null);

    const bytes=crypto.getRandomValues(new Uint8Array(32));
    const token=hex(bytes);
    const tokenHash=await sha256(token);
    const expiresAt=new Date(Date.now()+8*60*60*1000).toISOString();
    const now=new Date().toISOString();
    const {error:sessionError}=await db.from("admin_sessions").insert({
      admin_user_id:user.id,
      token_hash:tokenHash,
      token_prefix:token.slice(0,10),
      expires_at:expiresAt,
      last_seen_at:now
    });
    if(sessionError)return json(req,{error:"LOGIN_FAILED"},500);
    await db.from("admin_users").update({last_login_at:now,last_seen_at:now}).eq("id",user.id);
    const {data:fullUser}=await db.from("admin_users")
      .select("id,username,display_name,role,must_change_password,corporate_title,professional_title,profile_frame_style,avatar_path,last_login_at,last_seen_at")
      .eq("id",user.id).single();
    await audit(user.id,"login","admin_user",user.id);
    return json(req,{ok:true,token,expires_at:expiresAt,user:fullUser||user});
  }

  const auth=await requireSession();
  if(!auth)return json(req,{error:"UNAUTHORIZED",message:"La sesión no es válida o expiró."},401);

  if(action==="me"){
    const avatar_url=await signedUrl(auth.user.avatar_path,3600);
    return json(req,{ok:true,user:{...auth.user,avatar_url},unread:await unreadCount(auth.user.id)});
  }

  if(action==="logout"){
    await audit(auth.user.id,"logout","admin_user",auth.user.id);
    await db.from("admin_sessions").update({revoked_at:new Date().toISOString()}).eq("id",auth.session.id);
    return json(req,{ok:true});
  }

  if(action==="heartbeat"){
    return json(req,{ok:true,profiles:await getProfiles(),unread:await unreadCount(auth.user.id)});
  }

  if(action==="dashboard"){
    const profiles=await getProfiles().catch(()=>[]);
    const [{data:products,error:pErr},{data:channels,error:cErr},{data:media,error:mErr},{data:logs,error:lErr}]=await Promise.all([
      db.from("products").select("id,category_code,name,product_type,reference_code,stock_quantity,sale_status,primary_image_url,source_image_url,demo,updated_at").order("category_code").order("name"),
      db.from("product_channels").select("*").eq("channel","mercadolibre"),
      db.from("product_media").select("id,product_id,channel_scope,position,is_primary,url,storage_path").order("position"),
      db.from("admin_audit_log").select("id,admin_user_id,action,entity_type,entity_id,details,created_at").order("id",{ascending:false}).limit(25)
    ]);

    if(pErr)return json(req,{error:"DATA_LOAD_FAILED",message:"No fue posible cargar el inventario."},500);

    const safeChannels=cErr?[]:(channels||[]);
    const safeMedia=mErr?[]:(media||[]);
    const safeLogs=lErr?[]:(logs||[]);
    const actorMap=new Map((profiles||[]).map((p:any)=>[p.id,p]));
    const activity=safeLogs.map((row:any)=>({
      ...row,
      admin_users: row.admin_user_id ? {
        display_name:actorMap.get(row.admin_user_id)?.display_name||null,
        username:actorMap.get(row.admin_user_id)?.username||null,
        corporate_title:actorMap.get(row.admin_user_id)?.corporate_title||null
      } : null
    }));

    const channelMap=new Map(safeChannels.map((c:any)=>[c.product_id,c]));
    const mediaMap=new Map<string,any[]>();
    for(const item of safeMedia){
      const arr=mediaMap.get(item.product_id)||[];
      arr.push(item);
      mediaMap.set(item.product_id,arr);
    }
    const rows=(products||[]).map((p:any)=>({...p,mercadolibre:channelMap.get(p.id)||null,media:mediaMap.get(p.id)||[]}));
    const self=(profiles||[]).find((p:any)=>p.id===auth.user.id)||auth.user;
    return json(req,{
      ok:true,
      user:{...auth.user,avatar_url:self?.avatar_url||null},
      profiles:profiles||[],
      products:rows,
      activity,
      unread:await unreadCount(auth.user.id).catch(()=>0),
      summary:{
        products:rows.length,
        ml_selected:rows.filter((p:any)=>p.mercadolibre?.enabled).length,
        ml_active:rows.filter((p:any)=>p.mercadolibre?.external_status==="active").length,
        sold_out:rows.filter((p:any)=>p.sale_status==="sold_out"||Number(p.stock_quantity)<=0).length
      }
    });
  }

  if(action==="activity"){
    const before=Math.max(0,Number(body.before_id)||0);
    let query=db.from("admin_audit_log")
      .select("id,admin_user_id,action,entity_type,entity_id,details,created_at")
      .order("id",{ascending:false})
      .limit(50);
    if(before>0)query=query.lt("id",before);
    const {data,error}=await query;
    if(error)return json(req,{error:"ACTIVITY_LOAD_FAILED",message:"No fue posible cargar el histórico."},500);

    const profiles=await getProfiles().catch(()=>[]);
    const actorMap=new Map((profiles||[]).map((p:any)=>[p.id,p]));
    const activity=(data||[]).map((row:any)=>({
      ...row,
      admin_users: row.admin_user_id ? {
        display_name:actorMap.get(row.admin_user_id)?.display_name||null,
        username:actorMap.get(row.admin_user_id)?.username||null,
        corporate_title:actorMap.get(row.admin_user_id)?.corporate_title||null
      } : null
    }));
    return json(req,{ok:true,activity,has_more:activity.length===50});
  }

  if(action==="save_profile"){
    const displayName=clean(body.display_name).replace(/\s+/g," ").slice(0,60);
    const corporateTitle=clean(body.corporate_title).slice(0,80);
    const professionalTitle=clean(body.professional_title).replace(/\s+/g," ").slice(0,80);
    const requestedFrame=clean(body.profile_frame_style)||"standard";

    const allowedTitles=new Set([
      "CEO & Fundador",
      "Gerente General & COO",
      "COO · Director de Operaciones",
      "CTO · Director de Tecnología",
      "CFO · Director Financiero",
      "CMO · Director de Marketing",
      "Gerente de Tecnología",
      "Gerente Comercial",
      "Gerente de Operaciones",
      "Gerente Administrativo",
      "Director de Producto",
      "Director Comercial",
      "Director de Tecnología",
      "Coordinador de Área",
      "Líder de Área",
      "Especialista",
      "Analista",
      "Asesor"
    ]);

    const allowedFrames=new Set(["standard","silver","hearts","cats","paws","stars","neon","ceo_inferno","metal_rock","lava_rock","future_neon"]);
    const isOwner=auth.user.role==="owner";
    const frameStyle=requestedFrame;

    if(displayName.length<2)return json(req,{error:"INVALID_NAME",message:"Escribe un nombre válido."},400);
    if(!allowedTitles.has(corporateTitle))return json(req,{error:"INVALID_TITLE",message:"Selecciona un cargo válido."},400);
    if(corporateTitle==="CEO & Fundador" && !isOwner){
      return json(req,{error:"CEO_RESERVED",message:"El cargo CEO & Fundador está reservado para Picard."},403);
    }
    if(!allowedFrames.has(frameStyle)){
      return json(req,{error:"INVALID_FRAME",message:"Selecciona un marco válido."},400);
    }
    if(frameStyle==="ceo_inferno" && !isOwner){
      return json(req,{error:"CEO_FRAME_RESERVED",message:"El marco Inferno CEO está reservado exclusivamente para la cuenta CEO."},403);
    }

    const {data:before}=await db.from("admin_users")
      .select("display_name,corporate_title,professional_title,profile_frame_style")
      .eq("id",auth.user.id)
      .maybeSingle();

    const {data:updated,error:updateError}=await db.from("admin_users").update({
      display_name:displayName,
      corporate_title:corporateTitle,
      professional_title:professionalTitle||null,
      profile_frame_style:frameStyle,
      profile_updated_at:new Date().toISOString(),
      updated_at:new Date().toISOString()
    }).eq("id",auth.user.id)
      .select("id,username,display_name,role,must_change_password,corporate_title,professional_title,profile_frame_style,avatar_path,last_login_at,last_seen_at")
      .single();

    if(updateError||!updated)return json(req,{error:"PROFILE_SAVE_FAILED",message:"No fue posible guardar el perfil."},500);

    await audit(auth.user.id,"profile_updated","admin_user",auth.user.id,{
      previous:{
        display_name:before?.display_name||null,
        corporate_title:before?.corporate_title||null,
        professional_title:before?.professional_title||null,
        profile_frame_style:before?.profile_frame_style||null
      },
      current:{
        display_name:updated.display_name,
        corporate_title:updated.corporate_title,
        professional_title:updated.professional_title||null,
        profile_frame_style:updated.profile_frame_style||null
      }
    });

    return json(req,{ok:true,user:{...updated,avatar_url:await signedUrl(updated.avatar_path,3600)}});
  }

  if(action==="certificate"){
    const {data:profile,error:profileError}=await db.from("admin_users")
      .select("id,username,display_name,role,corporate_title,professional_title,profile_frame_style")
      .eq("id",auth.user.id)
      .single();
    if(profileError||!profile)return json(req,{error:"CERTIFICATE_PROFILE_FAILED",message:"No fue posible cargar los datos del certificado."},500);

    const pdf=await PDFDocument.create();
    const page=pdf.addPage([842,595]);
    const width=page.getWidth(),height=page.getHeight();
    const regular=await pdf.embedFont(StandardFonts.Helvetica);
    const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
    const italic=await pdf.embedFont(StandardFonts.TimesRomanItalic);

    const navy=rgb(0.07,0.22,0.32);
    const gold=rgb(0.84,0.66,0.18);
    const ink=rgb(0.12,0.16,0.19);
    const muted=rgb(0.42,0.48,0.52);
    const pale=rgb(0.97,0.98,0.985);

    page.drawRectangle({x:0,y:0,width,height,color:pale});
    page.drawRectangle({x:20,y:20,width:width-40,height:height-40,borderColor:navy,borderWidth:2});
    page.drawRectangle({x:29,y:29,width:width-58,height:height-58,borderColor:gold,borderWidth:1});
    page.drawRectangle({x:36,y:height-106,width:width-72,height:58,color:navy});
    page.drawRectangle({x:36,y:height-112,width:width-72,height:5,color:gold});

    page.drawText("DEMO",{
      x:245,y:205,size:108,font:bold,color:rgb(0.90,0.91,0.92),rotate:degrees(24),opacity:0.34
    });

    let logoPlaced=false;
    try{
      const logoResp=await fetch("https://drive.google.com/thumbnail?id=1IUSpv73234Nvjz2KC_VhqhuFHSsF0yqN&sz=w1000");
      if(logoResp.ok){
        const logoBytes=new Uint8Array(await logoResp.arrayBuffer());
        const ct=(logoResp.headers.get("content-type")||"").toLowerCase();
        let logo:any=null;
        if(ct.includes("png"))logo=await pdf.embedPng(logoBytes);
        else if(ct.includes("jpeg")||ct.includes("jpg"))logo=await pdf.embedJpg(logoBytes);
        if(logo){
          const scaled=logo.scaleToFit(122,44);
          page.drawImage(logo,{x:54,y:height-98,width:scaled.width,height:scaled.height});
          logoPlaced=true;
        }
      }
    }catch{}
    if(!logoPlaced){
      page.drawText("CARDNEST",{x:54,y:height-87,size:26,font:bold,color:rgb(1,1,1)});
    }
    page.drawText("CERTIFICADO INTERNO DE ROL - DEMOSTRACION",{
      x:242,y:height-80,size:15,font:bold,color:rgb(1,1,1)
    });
    page.drawText("Documento de prueba - no acredita vinculo laboral real ni tiene validez legal.",{
      x:242,y:height-96,size:8.5,font:regular,color:rgb(0.88,0.92,0.94)
    });

    const name=pdfText(profile.display_name||profile.username);
    const title=pdfText(profile.corporate_title||"Rol interno");
    const profession=pdfText(profile.professional_title||"No declarada");
    const username=pdfText(profile.username);
    const issueDate=new Intl.DateTimeFormat("es-CO",{timeZone:"America/Bogota",year:"numeric",month:"long",day:"2-digit"}).format(new Date());
    const certificateId="CN-DEMO-"+new Date().toISOString().slice(0,10).replaceAll("-","")+"-"+username.toUpperCase().slice(0,18);

    page.drawText("CardNest deja constancia, exclusivamente para fines de demostracion del sistema, de que:",{
      x:74,y:430,size:11,font:regular,color:muted
    });
    const nameWidth=bold.widthOfTextAtSize(name,28);
    page.drawText(name,{x:(width-nameWidth)/2,y:382,size:28,font:bold,color:navy});
    const titleWidth=bold.widthOfTextAtSize(title,17);
    page.drawText(title,{x:(width-titleWidth)/2,y:350,size:17,font:bold,color:gold});
    const professionLine="Profesion declarada: "+profession;
    const professionWidth=regular.widthOfTextAtSize(professionLine,10);
    page.drawText(professionLine,{x:(width-professionWidth)/2,y:329,size:10,font:regular,color:muted});

    page.drawText("Funciones asociadas al rol",{x:74,y:290,size:12,font:bold,color:navy});
    const functions=roleFunctions(title);
    let fy=266;
    for(const item of functions){
      page.drawCircle({x:82,y:fy+3,size:2.3,color:gold});
      page.drawText(pdfText(item),{x:92,y:fy,size:9.5,font:regular,color:ink});
      fy-=23;
    }

    page.drawLine({start:{x:74,y:152},end:{x:768,y:152},thickness:0.7,color:rgb(0.82,0.85,0.87)});
    page.drawText("Usuario interno: "+username,{x:74,y:132,size:8.5,font:regular,color:muted});
    page.drawText("Emision: "+pdfText(issueDate),{x:74,y:116,size:8.5,font:regular,color:muted});
    page.drawText("Codigo: "+certificateId,{x:74,y:100,size:8.5,font:regular,color:muted});

    page.drawText("Matteo Laurent",{x:563,y:121,size:25,font:italic,color:navy});
    page.drawLine({start:{x:555,y:112},end:{x:738,y:112},thickness:0.8,color:ink});
    page.drawText("Matteo Laurent - Director Corporativo (DEMO)",{x:566,y:98,size:7.4,font:bold,color:muted});
    page.drawText("Firma de demostracion",{x:615,y:86,size:7,font:regular,color:muted});

    page.drawText("CARDNEST - DOCUMENTO DE DEMOSTRACION / SIN VALIDEZ LABORAL O LEGAL",{
      x:197,y:48,size:8.3,font:bold,color:rgb(0.45,0.48,0.50)
    });

    pdf.setTitle("Certificado interno CardNest - "+name+" - DEMO");
    pdf.setSubject("Certificado interno de rol de demostracion");
    pdf.setAuthor("CardNest");
    pdf.setCreator("CardNest Admin");

    const bytes=await pdf.save();
    await audit(auth.user.id,"certificate_generated","admin_user",auth.user.id,{certificate_id:certificateId,role:title});
    return json(req,{
      ok:true,
      filename:"CardNest-Certificado-"+safeFileName(name)+"-DEMO.pdf",
      mime:"application/pdf",
      data:bytesToBase64(bytes),
      certificate_id:certificateId
    });
  }

  if(action==="upload_avatar"){
    const file=(body.file??{}) as Record<string,unknown>;
    const name=safeFileName(clean(file.name));
    const mime=clean(file.mime).toLowerCase();
    const data=String(file.data??"");
    if(!allowedAvatarMimes.has(mime))return json(req,{error:"INVALID_AVATAR_TYPE",message:"Usa una imagen JPG, PNG, WebP o GIF."},400);
    if(!data)return json(req,{error:"AVATAR_REQUIRED",message:"Selecciona una imagen."},400);
    let bytes:Uint8Array;
    try{bytes=decodeBase64(data)}catch{return json(req,{error:"INVALID_AVATAR",message:"No fue posible leer la imagen."},400)}
    if(bytes.byteLength<1||bytes.byteLength>AVATAR_MAX_BYTES)return json(req,{error:"AVATAR_TOO_LARGE",message:"La foto debe pesar máximo 10 MB."},413);

    const ext=mime==="image/jpeg"?"jpg":mime==="image/png"?"png":mime==="image/gif"?"gif":"webp";
    const path=`avatars/${auth.user.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const {error:uploadError}=await db.storage.from("admin-media").upload(path,bytes,{contentType:mime,upsert:false,cacheControl:"3600"});
    if(uploadError)return json(req,{error:"AVATAR_UPLOAD_FAILED",message:"No fue posible guardar la foto."},500);
    const {error:updateError}=await db.from("admin_users").update({avatar_path:path,profile_updated_at:new Date().toISOString()}).eq("id",auth.user.id);
    if(updateError){
      await db.storage.from("admin-media").remove([path]);
      return json(req,{error:"AVATAR_SAVE_FAILED"},500);
    }
    await audit(auth.user.id,"profile_photo_updated","admin_user",auth.user.id,{file_name:name,mime});
    return json(req,{ok:true,avatar_url:await signedUrl(path,3600),avatar_path:path});
  }

  if(action==="chat_list"){
    const partnerId=clean(body.partner_id);
    const afterId=Math.max(0,Number(body.after_id)||0);
    let query=db.from("admin_chat_messages")
      .select("id,sender_id,recipient_id,body,attachment_path,attachment_name,attachment_mime,attachment_size,created_at")
      .or(`sender_id.eq.${auth.user.id},recipient_id.eq.${auth.user.id}`);
    if(afterId>0)query=query.gt("id",afterId).order("id",{ascending:true}).limit(100);
    else query=query.order("id",{ascending:false}).limit(100);
    const {data,error}=await query;
    if(error)return json(req,{error:"CHAT_LOAD_FAILED"},500);
    let messages=(data||[]) as any[];
    if(partnerId)messages=messages.filter(m=>
      (m.sender_id===auth.user.id&&m.recipient_id===partnerId)||
      (m.sender_id===partnerId&&m.recipient_id===auth.user.id)
    );
    if(!afterId)messages.reverse();
    const decorated=await Promise.all(messages.map(async m=>({
      ...m,
      attachment_url:m.attachment_path?await signedUrl(m.attachment_path,1800):null
    })));
    const highest=decorated.reduce((n,m)=>Math.max(n,Number(m.id)||0),0);
    if(highest>0){
      await db.from("admin_chat_reads").upsert({user_id:auth.user.id,last_read_message_id:highest,updated_at:new Date().toISOString()},{onConflict:"user_id"});
    }
    return json(req,{ok:true,messages:decorated,profiles:await getProfiles(),unread:await unreadCount(auth.user.id)});
  }

  if(action==="chat_send"){
    const recipientId=clean(body.recipient_id);
    const message=clean(body.message).slice(0,2000);
    const {data:recipient}=await db.from("admin_users").select("id,display_name,username").eq("id",recipientId).eq("is_active",true).maybeSingle();
    if(!recipient||recipient.id===auth.user.id)return json(req,{error:"INVALID_RECIPIENT",message:"Selecciona un destinatario válido."},400);

    let attachmentPath:string|null=null;
    let attachmentName:string|null=null;
    let attachmentMime:string|null=null;
    let attachmentSize:number|null=null;
    const attachment=body.attachment&&typeof body.attachment==="object"?(body.attachment as Record<string,unknown>):null;
    if(attachment){
      attachmentName=safeFileName(clean(attachment.name));
      attachmentMime=clean(attachment.mime).toLowerCase();
      const raw=String(attachment.data??"");
      if(!allowedAttachmentMimes.has(attachmentMime))return json(req,{error:"INVALID_FILE_TYPE",message:"Ese tipo de archivo no está permitido en el chat."},400);
      let bytes:Uint8Array;
      try{bytes=decodeBase64(raw)}catch{return json(req,{error:"INVALID_FILE",message:"No fue posible leer el archivo."},400)}
      if(bytes.byteLength<1||bytes.byteLength>CHAT_FILE_MAX_BYTES)return json(req,{error:"FILE_TOO_LARGE",message:"El archivo debe pesar máximo 5 MB."},413);
      attachmentSize=bytes.byteLength;
      const year=new Date().getUTCFullYear();
      attachmentPath=`chat/${year}/${auth.user.id}/${Date.now()}-${crypto.randomUUID()}-${attachmentName}`;
      const {error:uploadError}=await db.storage.from("admin-media").upload(attachmentPath,bytes,{contentType:attachmentMime,upsert:false,cacheControl:"3600"});
      if(uploadError)return json(req,{error:"FILE_UPLOAD_FAILED",message:"No fue posible adjuntar el archivo."},500);
    }
    if(!message&&!attachmentPath)return json(req,{error:"EMPTY_MESSAGE",message:"Escribe un mensaje o adjunta un archivo."},400);

    const {data:created,error:createError}=await db.from("admin_chat_messages").insert({
      sender_id:auth.user.id,
      recipient_id:recipientId,
      body:message||null,
      attachment_path:attachmentPath,
      attachment_name:attachmentName,
      attachment_mime:attachmentMime,
      attachment_size:attachmentSize
    }).select("id,sender_id,recipient_id,body,attachment_path,attachment_name,attachment_mime,attachment_size,created_at").single();
    if(createError){
      if(attachmentPath)await db.storage.from("admin-media").remove([attachmentPath]);
      return json(req,{error:"MESSAGE_SEND_FAILED",message:"No fue posible enviar el mensaje."},500);
    }
    await audit(auth.user.id,"chat_message_sent","admin_user",recipientId,{message_id:created.id,has_attachment:!!attachmentPath,attachment_name:attachmentName});
    const out={...created,attachment_url:attachmentPath?await signedUrl(attachmentPath,1800):null};
    return json(req,{ok:true,message:out});
  }

  if(action==="save_channel"){
    const productId=clean(body.product_id);
    const enabled=body.enabled===true;
    const rawPrice=body.price_cop===null||body.price_cop===""?null:Number(body.price_cop);
    if(!productId)return json(req,{error:"PRODUCT_REQUIRED"},400);
    if(rawPrice!==null&&(!Number.isInteger(rawPrice)||rawPrice<=0||rawPrice>1000000000)){
      return json(req,{error:"INVALID_PRICE",message:"Revisa el precio de Mercado Libre."},400);
    }
    if(enabled&&rawPrice===null)return json(req,{error:"PRICE_REQUIRED",message:"Asigna un precio de Mercado Libre antes de activar este canal."},400);
    const {data:product}=await db.from("products").select("id,name").eq("id",productId).maybeSingle();
    if(!product)return json(req,{error:"PRODUCT_NOT_FOUND"},404);
    const nextStatus=enabled?"ready":"draft";
    const {data:channel,error}=await db.from("product_channels").upsert({
      product_id:productId,
      channel:"mercadolibre",
      enabled,
      price_cop:rawPrice,
      external_status:nextStatus,
      updated_by:auth.user.id,
      updated_at:new Date().toISOString()
    },{onConflict:"product_id,channel"}).select("*").single();
    if(error)return json(req,{error:"SAVE_FAILED"},500);
    await audit(auth.user.id,"save_channel","product",productId,{channel:"mercadolibre",enabled,price_cop:rawPrice});
    return json(req,{ok:true,channel});
  }

  if(action==="update_credentials"){
    const currentPassword=String(body.current_password??"");
    const requestedUsername=clean(body.new_username).toLowerCase();
    const newPassword=String(body.new_password??"");

    if(currentPassword.length<1){
      return json(req,{error:"CURRENT_PASSWORD_REQUIRED",message:"Escribe tu contraseña actual para autorizar el cambio."},400);
    }

    const {data:verified,error:verifyError}=await db.rpc("admin_check_credentials",{
      p_username:auth.user.username,
      p_password:currentPassword
    });
    const verifiedUser=Array.isArray(verified)?verified[0]:null;
    if(verifyError||!verifiedUser||verifiedUser.id!==auth.user.id){
      await audit(auth.user.id,"credentials_change_rejected","admin_user",auth.user.id,{reason:"invalid_current_password"});
      return json(req,{error:"INVALID_CURRENT_PASSWORD",message:"La contraseña actual no es correcta."},401);
    }

    const nextUsername=requestedUsername||auth.user.username;
    if(!/^[a-z0-9_]{4,40}$/.test(nextUsername)){
      return json(req,{error:"INVALID_USERNAME",message:"El usuario debe tener 4 a 40 caracteres y usar solo letras minúsculas, números o guion bajo."},400);
    }

    const changingUsername=nextUsername!==auth.user.username;
    const changingPassword=newPassword.length>0;
    if(!changingUsername&&!changingPassword){
      return json(req,{error:"NO_CHANGES",message:"Escribe un usuario diferente o una contraseña nueva."},400);
    }

    if(changingPassword){
      const strong=newPassword.length>=12&&/[a-z]/.test(newPassword)&&/[A-Z]/.test(newPassword)&&/[0-9]/.test(newPassword)&&/[^A-Za-z0-9]/.test(newPassword);
      if(!strong){
        return json(req,{error:"WEAK_PASSWORD",message:"La nueva contraseña debe tener al menos 12 caracteres, mayúscula, minúscula, número y símbolo."},400);
      }
    }

    if(changingUsername){
      const {data:duplicate}=await db.from("admin_users").select("id").eq("username",nextUsername).neq("id",auth.user.id).maybeSingle();
      if(duplicate)return json(req,{error:"USERNAME_TAKEN",message:"Ese nombre de usuario ya está en uso."},409);
      const {error:userError}=await db.from("admin_users").update({
        username:nextUsername,
        updated_at:new Date().toISOString()
      }).eq("id",auth.user.id);
      if(userError){
        return json(req,{error:"USERNAME_UPDATE_FAILED",message:"No fue posible actualizar el usuario."},500);
      }
    }

    if(changingPassword){
      const {data:passwordUpdated,error:passwordError}=await db.rpc("admin_set_password",{
        p_user_id:auth.user.id,
        p_new_password:newPassword
      });
      if(passwordError||passwordUpdated!==true){
        return json(req,{error:"PASSWORD_CHANGE_FAILED",message:"No fue posible actualizar la contraseña."},500);
      }
    }

    await db.from("admin_sessions").update({revoked_at:new Date().toISOString()})
      .eq("admin_user_id",auth.user.id)
      .neq("id",auth.session.id)
      .is("revoked_at",null);

    await audit(auth.user.id,"credentials_updated","admin_user",auth.user.id,{
      previous_username:auth.user.username,
      current_username:nextUsername,
      username_changed:changingUsername,
      password_changed:changingPassword
    });

    const {data:updated}=await db.from("admin_users")
      .select("id,username,display_name,role,must_change_password,corporate_title,professional_title,profile_frame_style,avatar_path,last_login_at,last_seen_at")
      .eq("id",auth.user.id)
      .single();

    return json(req,{ok:true,user:updated});
  }

  if(action==="change_password"){
    const next=String(body.new_password??"");
    const strong=next.length>=12&&/[a-z]/.test(next)&&/[A-Z]/.test(next)&&/[0-9]/.test(next)&&/[^A-Za-z0-9]/.test(next);
    if(!strong)return json(req,{error:"WEAK_PASSWORD",message:"Usa al menos 12 caracteres con mayúscula, minúscula, número y símbolo."},400);
    const {data,error}=await db.rpc("admin_set_password",{p_user_id:auth.user.id,p_new_password:next});
    if(error||data!==true)return json(req,{error:"PASSWORD_CHANGE_FAILED"},500);
    await db.from("admin_sessions").update({revoked_at:new Date().toISOString()})
      .eq("admin_user_id",auth.user.id)
      .neq("id",auth.session.id)
      .is("revoked_at",null);
    await audit(auth.user.id,"change_password","admin_user",auth.user.id);
    return json(req,{ok:true});
  }

  return json(req,{error:"UNKNOWN_ACTION"},400);
});
