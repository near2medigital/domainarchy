/** Domainarchy multiplayer server, Node 22+; no external dependencies.
 * Authoritative state, atomic actions, expiry, SSE fan-out, signed visitor cookies.
 * Simulation only: no payment collection is implemented.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CLIENT = path.resolve(ROOT, '../client/index.html');
const DB_PATH = process.env.DOMAINARCHY_DATA || path.resolve(ROOT, '../data/state.json');
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const ARENAS = { '61': 4, '469': 12, '4921': 40 };
const ZONE_RENT = { metropolis: 10, suburbs: 3, wildlands: 1 };
const DEMO = [
 ['Screaming Frog','screamingfrog.co.uk',3],['Ahrefs','ahrefs.com',1],['Semrush','semrush.com',0],
 ['Moz Pro','moz.com',1],['SearchEngineLand','searchengineland.com',2],['BrightLocal','brightlocal.com',3],
 ['FatJoe','fatjoe.com',4],['Sitebulb','sitebulb.com',2],['Search Engine Journal','searchenginejournal.com',1],
 ['AirPR Wire','airprwire.example',0]
];
const DAY=86400000;
const now=()=>Date.now();
const blankDB=()=>({schema:1,worlds:{},visitors:{},events:[],brands:{}});
let db;
try { db=JSON.parse(fs.readFileSync(DB_PATH,'utf8')); if(db.schema!==1)throw Error('Unsupported data schema'); }
catch(e) { if(e.code==='ENOENT')db=blankDB(); else throw e; }
const secretPath=path.resolve(path.dirname(DB_PATH),'.session-secret');
fs.mkdirSync(path.dirname(DB_PATH),{recursive:true});
let secret;
try {secret=fs.readFileSync(secretPath);} catch(e){if(e.code!=='ENOENT')throw e;secret=crypto.randomBytes(32);fs.writeFileSync(secretPath,secret,{mode:0o600,flag:'wx'});}
function persist(){
 const tmp=DB_PATH+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(db));fs.renameSync(tmp,DB_PATH);
}
function coordZone(q,r,limit){ const d=Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r)); return d <= (limit===4?1:limit===12?3:4)?'metropolis':d <= (limit===4?2:limit===12?8:16)?'suburbs':'wildlands'; }
const validArena=v=>Object.hasOwn(ARENAS,String(v));
const hexWithin=(q,r,R)=>Number.isInteger(q)&&Number.isInteger(r)&&Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r))<=R;
const hexKey=(q,r)=>q+','+r;
const id=()=>crypto.randomUUID();
function ensureWorld(a){
 if(db.worlds[a])return db.worlds[a];
 const radius=ARENAS[a],world={arena:a,radius,rev:1,hexes:{},boards:{},airship:[],flight:{brandId:'seed-0',t0:now(),n:0},events:[]};
 // Restrained, shared seed population: all visitors see identical initial examples.
 const possible=[];for(let q=-radius;q<=radius;q++)for(let r=Math.max(-radius,-q-radius);r<=Math.min(radius,-q+radius);r++)possible.push({q,r,d:Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r))});
 possible.sort((a,b)=>b.d-a.d||a.q-b.q||a.r-b.r);
 const edgeChoices=possible.filter(p=>p.q!==0||p.r!==0);
 const chosen=[{q:0,r:0},...Array.from({length:DEMO.length-1},(_,i)=>edgeChoices[(i*19+3)%edgeChoices.length])];
 for(let i=0;i<DEMO.length;i++){
   let {q,r}=chosen[i];
   const k=hexKey(q,r),z=coordZone(q,r,radius);
   const [name,url,f]=DEMO[i];
   const brandId='seed-'+i;
   db.brands[brandId]={id:brandId,name,url,tag:'Founding territory · demonstration',f,cat:'seo',owner:null,logo:null};
   world.hexes[k]={q,r,brandId,holder:null,day:1,tenancyDays:28,claimedAt:now()-DAY*12,expiresAt:now()+DAY*16,shieldUntil:now()-DAY,cheers:0,loot:null,siege:null,last:ZONE_RENT[z]*4};
 }
 db.worlds[a]=world;persist();return world;
}
function cookieSignature(v){return crypto.createHmac('sha256',secret).update(v).digest('hex');}
function actor(req,res){
 const raw=(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith('da_session='))?.slice(11);
 let user=null;
 if(raw){const [v,mac]=raw.split('.');if(v&&mac&&/^[a-f0-9-]{36}$/.test(v)){
  const expect=cookieSignature(v);if(mac.length===expect.length&&crypto.timingSafeEqual(Buffer.from(mac),Buffer.from(expect)))user=v;
 }}
 if(!user){user=id();const secure=!!(req.socket.encrypted||req.headers['x-forwarded-proto']==='https');
  res.setHeader('Set-Cookie',`da_session=${user}.${cookieSignature(user)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${secure?'; Secure':''}`);
 }
 if(!db.visitors[user])db.visitors[user]={id:user,lastCheer:null,streak:0,best:0,vouchers:[],claims:[],createdAt:now()};
 return db.visitors[user];
}
const dayString=ts=>new Date(ts).toISOString().slice(0,10);
function note(w,type,message,q,r){const e={id:id(),at:now(),type,message,q,r};w.events.unshift(e);w.events.length=Math.min(w.events.length,60);}
function publicWorld(world,user){
 const hexes={}; for(const [k,h] of Object.entries(world.hexes)){
  hexes[k]={...h,holder:undefined,loot:h.loot?{offer:h.loot.offer,left:h.loot.left}:null,mine:h.holder===user.id};
 }
 return {arena:world.arena,rev:world.rev,serverTime:now(),hexes,boards:world.boards,airship:world.airship,flight:world.flight||null,events:world.events,
  brands:Object.fromEntries(Object.entries(db.brands).map(([k,v])=>[k,{...v,owner:v.owner===user.id?user.id:null}])),viewer:{id:user.id,streak:user.streak,best:user.best,lastCheer:user.lastCheer,vouchers:user.vouchers}};
}
function response(res,code,obj){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj));}
function error(res,status,msg){response(res,status,{error:msg});}
const clients=new Map();
function broadcast(a){const group=clients.get(a);if(!group)return;
 for(const client of [...group])try{client.res.write(`event: state\ndata: ${JSON.stringify(publicWorld(db.worlds[a],client.user))}\n\n`);}catch{group.delete(client);}
}
function validUrl(raw){try{const u=new URL(/^https?:\/\//i.test(raw)?raw:'https://'+raw);return (u.protocol==='https:'||u.protocol==='http:')&&!u.username&&!u.password&&u.hostname.length<=253&&!/\s/.test(u.hostname)?u.hostname+u.pathname.replace(/\/$/,''):null;}catch{return null;}}
function brandInput(payload,visitor){
 if(!payload||typeof payload!=='object')throw Error('Brand details required');
 const clean=(x,max)=>String(x||'').trim().slice(0,max);
 const name=clean(payload.name,26),tag=clean(payload.tag,42),url=validUrl(payload.url||'');
 if(!name||!tag||!url)throw Error('Enter a brand name, tagline and valid website URL');
 const f=Number(payload.f);
 if(!Number.isInteger(f)||f<0||f>4)throw Error('Invalid faction');
 const logo=(typeof payload.logo==='string'&&/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(payload.logo)&&payload.logo.length<200000)?payload.logo:null;
 const brandId='placement-'+id();
 db.brands[brandId]={id:brandId,name,tag,url,f,cat:'seo',owner:visitor.id,logo};
 return brandId;
}
function settle(w,t){let changed=false;
 if(!w.flight){w.flight={brandId:'seed-0',t0:t,n:0};changed=true;}
 let cycles=0;while(t-w.flight.t0>=26000&&cycles++<200){
  w.flight.t0+=26000;w.flight.n++;const p=w.airship.find(p=>p.left>0&&p.expiresAt>t);
  if(p){p.left--;w.flight.brandId=p.brandId;}else{w.flight.brandId='seed-'+((w.flight.n*7+3)%DEMO.length);}
  changed=true;
 }
 for(const [k,h] of Object.entries(w.hexes)){
  if(h.expiresAt&&h.expiresAt<=t&&!h.siege){delete w.hexes[k];note(w,'expiry',`Territory (${k}) became available again`,h.q,h.r);changed=true;continue;}
  if(h.siege&&h.siege.endsAt<=t){
   if(h.expiresAt<=t){delete w.hexes[k];note(w,'expiry',`Territory (${k}) expired during a siege`,h.q,h.r);}
   else{
    const s=h.siege;h.brandId=s.brandId;h.holder=s.actor;h.claimedAt=t;h.shieldUntil=t+DAY*7;h.expiresAt=t+DAY*s.days;h.tenancyDays=s.days;h.last=s.cost;h.loot=s.loot||null;h.siege=null;h.cheers=0;
    note(w,'siege',`Hex (${k}) changed hands after its siege`,h.q,h.r);
   }changed=true;
  }
 }
 for(const [slot,b] of Object.entries(w.boards)){if(b.until<=t){delete w.boards[slot];changed=true;note(w,'expiry',`Billboard #${slot} became available`);}}
 w.airship=w.airship.filter(p=>p.expiresAt>t&&p.left>0);
 if(changed)w.rev++;
 return changed;
}
function takeAction(w,user,b){
 if(!b||typeof b!=='object')throw Error('Invalid action');
 const op=String(b.type||'');const q=Number(b.q),r=Number(b.r),t=now();
 if(!['claim','siege','cheer','voucher','billboard','airship'].includes(op))throw Error('Unknown action');
 if(['claim','siege','cheer','voucher'].includes(op)&&!hexWithin(q,r,w.radius))throw Error('Hex is outside this arena');
 const k=hexKey(q,r),h=w.hexes[k],z=coordZone(q,r,w.radius);
 if(op==='claim'){
  if(h)throw Error('That hex is already occupied. Reloaded shared state may have changed.');
  const days=Number(b.days);if(![14,28].includes(days))throw Error('Choose a valid tenancy');
  const brandId=brandInput(b.brand,user);
  w.hexes[k]={q,r,brandId,holder:user.id,claimedAt:t,expiresAt:t+days*DAY,shieldUntil:t+7*DAY,
   tenancyDays:days,cheers:0,day:42,loot:makeLoot(b.offer),siege:null,last:ZONE_RENT[z]*days/7};
  note(w,'claim',`${db.brands[brandId].name} claimed hex (${k})`,q,r);
 }else if(op==='siege'){
  if(!h)throw Error('Hex is unoccupied. Claim it instead.');
  if(h.holder===user.id)throw Error('You already own this territory');
  if(h.shieldUntil>t)throw Error('The territory shield is still active');
  if(h.siege)throw Error('A siege is already in progress');
  const days=Number(b.days);if(![14,28].includes(days))throw Error('Invalid tenancy');
  const brandId=brandInput(b.brand,user);const cost=Math.max(ZONE_RENT[z]*days/7,Number(h.last)||0);
  h.siege={actor:user.id,brandId,startedAt:t,endsAt:t+90*1000,days,cost,loot:makeLoot(b.offer)};
  note(w,'siege',`${db.brands[brandId].name} launched a siege on (${k})`,q,r);
 }else if(op==='cheer'){
  if(!h||!h.brandId)throw Error('Choose an occupied hex');
  const today=dayString(t);if(user.lastCheer===today)throw Error('You have already cheered today');
  const yesterday=dayString(t-DAY);
  user.streak=user.lastCheer===yesterday?user.streak+1:1;user.best=Math.max(user.best,user.streak);user.lastCheer=today;
  h.cheers=(h.cheers||0)+1;note(w,'cheer',`A visitor cheered ${db.brands[h.brandId]?.name||'a brand'}`,q,r);
 }else if(op==='voucher'){
  if(!h?.loot||h.loot.left<=0)throw Error('No vouchers remain');
  const code=h.loot.code;if(!user.claims.includes(code)){user.claims.push(code);h.loot.left--;}
  return {code};
 }else if(op==='billboard'){
  const slot=Number(b.slot),days=Number(b.days),max=6*(2*w.radius+1);
  if(!Number.isInteger(slot)||slot<0||slot>=max)throw Error('Invalid billboard slot');
  if(![1,7,14,28].includes(days))throw Error('Invalid duration');
  if(w.boards[slot])throw Error('That billboard has already been booked');
  const brandId=brandInput(b.brand,user);
  w.boards[slot]={slot,brandId,owner:user.id,until:t+DAY*days,days};
  note(w,'board',`${db.brands[brandId].name} booked billboard #${slot+1}`);
 }else if(op==='airship'){
  const passes=Number(b.passes);if(![50,100,250].includes(passes))throw Error('Invalid flyover bundle');
  const brandId=brandInput(b.brand,user);
  w.airship.push({id:id(),owner:user.id,brandId,left:passes,total:passes,expiresAt:t+DAY*28});
  note(w,'airship',`${db.brands[brandId].name} scheduled ${passes} flyovers`);
 }
 return {};
}
function makeLoot(raw){const offer=String(raw||'').trim().slice(0,36);return offer?{offer,code:'ARCH-'+crypto.randomBytes(4).toString('hex').toUpperCase(),left:25}:null;}
const html=fs.readFileSync(CLIENT);
const css=fs.readFileSync(path.resolve(ROOT,'../client/style.css'));
const script=fs.readFileSync(path.resolve(ROOT,'../client/client.js'));
const server=http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method==='GET'&&(u.pathname==='/'||u.pathname==='/index.html')){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});res.end(html);return;}
  if(req.method==='GET'&&(u.pathname==='/style.css'||u.pathname==='/client.js')){const isCSS=u.pathname==='/style.css';res.writeHead(200,{'Content-Type':isCSS?'text/css; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'no-cache'});res.end(isCSS?css:script);return;}
  if(u.pathname==='/health'&&req.method==='GET'){response(res,200,{ok:true,mode:'multiplayer',time:now()});return;}
  if(!u.pathname.startsWith('/api/')){error(res,404,'Not found');return;}
  const a=u.searchParams.get('arena')||'61';if(!validArena(a)){error(res,400,'Unknown arena');return;}
  const user=actor(req,res),w=ensureWorld(a);
  if(settle(w,now())){persist();broadcast(a);}
  if(req.method==='GET'&&u.pathname==='/api/state'){response(res,200,publicWorld(w,user));return;}
  if(req.method==='GET'&&u.pathname==='/api/events'){
   res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
   res.write(': connected\n\n');res.write(`event: state\ndata: ${JSON.stringify(publicWorld(w,user))}\n\n`);
   const c={res,user};if(!clients.has(a))clients.set(a,new Set());clients.get(a).add(c);
   req.on('close',()=>clients.get(a)?.delete(c));return;
  }
  if(req.method==='POST'&&u.pathname==='/api/action'){
   if(req.headers.origin){const origin=new URL(req.headers.origin);if(origin.host!==(req.headers.host||'')){error(res,403,'Cross-origin requests are not permitted');return;}}
   if(!String(req.headers['content-type']||'').startsWith('application/json')){error(res,415,'JSON required');return;}
   let data='';for await(const chunk of req){data+=chunk;if(data.length>250000){error(res,413,'Request too large');return;}}
   let action;try{action=JSON.parse(data);}catch{error(res,400,'Invalid JSON');return;}
   try{const result=takeAction(w,user,action);w.rev++;persist();broadcast(a);response(res,200,{ok:true,...result,state:publicWorld(w,user)});}
   catch(e){error(res,409,e.message);}return;
  }
  error(res,404,'Unknown endpoint');
 }catch(e){console.error(e);if(!res.headersSent)error(res,500,'Unexpected server error');else res.end();}
});
const sweeper=setInterval(()=>{for(const [a,w] of Object.entries(db.worlds)){if(settle(w,now())){persist();broadcast(a);}}},5000);sweeper.unref();
server.listen(PORT,HOST,()=>console.log(`Domainarchy multiplayer server: http://${HOST}:${PORT}`));
