import "jsr:@supabase/functions-js@2.116.0/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const allowedOrigins=new Set([
  "https://spenceralejandro10.github.io",
  "https://cardnest.co",
  "https://www.cardnest.co",
  "http://localhost:8000",
  "http://127.0.0.1:8000"
]);

const clean=(v:unknown)=>String(v??"").trim();
const json=(req:Request,body:unknown,status=200)=>{
  const origin=req.headers.get("origin")||"";
  const headers:Record<string,string>={
    "Vary":"Origin",
    "Access-Control-Allow-Headers":"content-type, apikey",
    "Access-Control-Allow-Methods":"POST, OPTIONS",
    "Cache-Control":"no-store",
    "Content-Type":"application/json; charset=utf-8",
    "Referrer-Policy":"no-referrer",
    "X-Content-Type-Options":"nosniff"
  };
  if(allowedOrigins.has(origin))headers["Access-Control-Allow-Origin"]=origin;
  return new Response(JSON.stringify(body),{status,headers});
};

function publicApiKeys(){
  const keys=new Set<string>();
  const legacy=clean(Deno.env.get("SUPABASE_ANON_KEY"));
  if(legacy)keys.add(legacy);
  try{
    const parsed=JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")||"{}");
    if(parsed&&typeof parsed==="object"){
      for(const value of Object.values(parsed)){
        if(typeof value==="string"&&value)keys.add(value);
        else if(value&&typeof value==="object"&&typeof (value as any).key==="string")keys.add((value as any).key);
      }
    }
  }catch{}
  return keys;
}

function secretApiKey(){
  const legacy=clean(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  if(legacy)return legacy;
  try{
    const parsed=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");
    if(parsed&&typeof parsed==="object"){
      const value=(parsed as any).default;
      if(typeof value==="string")return value;
      if(value&&typeof value.key==="string")return value.key;
    }
  }catch{}
  return "";
}

async function sha256(value:string){
  const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)));
  return Array.from(bytes).map(b=>b.toString(16).padStart(2,"0")).join("");
}

Deno.serve(async(req)=>{
  const origin=req.headers.get("origin")||"";
  if((req.method==="POST"||req.method==="OPTIONS")&&origin&&!allowedOrigins.has(origin)){
    return json(req,{error:"ORIGIN_NOT_ALLOWED"},403);
  }
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:json(req,{}).headers});
  if(req.method!=="POST")return json(req,{error:"METHOD_NOT_ALLOWED"},405);

  const suppliedKey=clean(req.headers.get("apikey"));
  if(!suppliedKey||!publicApiKeys().has(suppliedKey)){
    return json(req,{error:"INVALID_API_KEY"},401);
  }

  const supabaseUrl=clean(Deno.env.get("SUPABASE_URL"));
  const secretKey=secretApiKey();
  if(!supabaseUrl||!secretKey)return json(req,{error:"SERVER_CONFIG"},500);
  const db=createClient(supabaseUrl,secretKey,{auth:{persistSession:false,autoRefreshToken:false}});

  let body:any;
  try{body=await req.json()}catch{return json(req,{error:"INVALID_JSON"},400)}

  const action=clean(body?.action)||"status";
  const productId=clean(body?.product_id).slice(0,80);
  const visitorId=clean(body?.visitor_id);

  if(!productId||!/^[A-Za-z0-9][A-Za-z0-9_-]{2,79}$/.test(productId)){
    return json(req,{error:"INVALID_PRODUCT"},400);
  }
  if(!/^[0-9a-fA-F-]{36}$/.test(visitorId)){
    return json(req,{error:"INVALID_VISITOR"},400);
  }

  const {data:product,error:pErr}=await db.from("products")
    .select("id,sale_status,demo")
    .eq("id",productId)
    .maybeSingle();
  if(pErr||!product||product.demo===true||!["available","sold_out"].includes(product.sale_status)){
    return json(req,{error:"PRODUCT_NOT_PUBLIC"},404);
  }

  const visitorHash=await sha256(visitorId);
  if(action==="set"){
    const interested=body?.interested===true;
    if(interested&&product.sale_status!=="available"){
      return json(req,{error:"PRODUCT_NOT_AVAILABLE",message:"El producto ya no está disponible."},409);
    }
    if(interested){
      const {error}=await db.from("product_interests").upsert(
        {product_id:productId,visitor_hash:visitorHash},
        {onConflict:"product_id,visitor_hash",ignoreDuplicates:true}
      );
      if(error)return json(req,{error:"INTEREST_SAVE_FAILED"},500);
    }else{
      const {error}=await db.from("product_interests")
        .delete()
        .eq("product_id",productId)
        .eq("visitor_hash",visitorHash);
      if(error)return json(req,{error:"INTEREST_REMOVE_FAILED"},500);
    }
  }else if(action!=="status"){
    return json(req,{error:"INVALID_ACTION"},400);
  }

  const [{data:interest},{data:countRow}]=await Promise.all([
    db.from("product_interests")
      .select("product_id")
      .eq("product_id",productId)
      .eq("visitor_hash",visitorHash)
      .maybeSingle(),
    db.from("product_interest_counts")
      .select("interest_count")
      .eq("product_id",productId)
      .maybeSingle()
  ]);

  return json(req,{
    ok:true,
    product_id:productId,
    interested:!!interest,
    interest_count:Number(countRow?.interest_count||0)
  });
});