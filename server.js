const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'nce_state.json');
const HTML_FILE = path.join(ROOT, 'index (22) (1).html');

const EMPTY_MAIN = {
  users: [], locations: {NCE:['Other'],SMC:['Other'],ANC:['Other'],ADNOC:['Other'],NCEDRVR:['Other'],SMCDRVR:['Other']},
  employees: [], callServices: [], csRoster:{supervisors:[],members:[]},
  dutyStopReports: [], warningLetters: [], notifications: [], auditLog: [],
  manpower:{shortages:{},meta:{preparedBy:'',bySite:{}}}, _rev:0, _updatedAt:Date.now()
};

function ensureData(){
  if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR,{recursive:true});
  if(!fs.existsSync(DATA_FILE)){
    const state={main:EMPTY_MAIN,logos:{},roles:[],desgs:{},conames:{},salaries:{},updatedAt:Date.now()};
    fs.writeFileSync(DATA_FILE,JSON.stringify(state,null,2),'utf8');
  }
}
function readState(){
  ensureData();
  try{return JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));}
  catch(e){
    const state={main:EMPTY_MAIN,logos:{},roles:[],desgs:{},conames:{},salaries:{},updatedAt:Date.now()};
    fs.writeFileSync(DATA_FILE,JSON.stringify(state,null,2),'utf8');
    return state;
  }
}
function writeState(state){
  state.updatedAt=Date.now();
  const tmp=DATA_FILE+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(state,null,2),'utf8');
  fs.renameSync(tmp,DATA_FILE);

  // Automatic backup after every data save
  try{
    const backupDir=path.join(ROOT,'backups');
    if(!fs.existsSync(backupDir)) fs.mkdirSync(backupDir,{recursive:true});

    const stamp=new Date().toISOString()
      .replace(/T/,'_')
      .replace(/:/g,'-')
      .replace(/\..+Z$/,'');

const backupFile=path.join(backupDir,'nce_state_'+stamp+'.json');
    fs.copyFileSync(DATA_FILE,backupFile);

    // Keep only the latest 30 backups
    const backups=fs.readdirSync(backupDir)
      .filter(f=>f.startsWith('nce_state_')&&f.endsWith('.json'))
      .map(f=>({
        name:f,
        time:fs.statSync(path.join(backupDir,f)).mtimeMs
      }))
      .sort((a,b)=>b.time-a.time);

    backups.slice(30).forEach(x=>{
      try{fs.unlinkSync(path.join(backupDir,x.name));}catch(e){}
    });
  }catch(e){
    console.error('Automatic backup failed:',e.message);
  }
}
function json(res,status,data){
  const body=JSON.stringify(data);
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS'});
  res.end(body);
}
function body(req){return new Promise((resolve,reject)=>{let b='';req.on('data',c=>{b+=c;if(b.length>30*1024*1024)req.destroy();});req.on('end',()=>{try{resolve(b?JSON.parse(b):{});}catch(e){reject(e);}});req.on('error',reject);});}
function safeStatic(p){
  const target=path.normalize(path.join(ROOT,p));
  return target.startsWith(ROOT+path.sep)||target===ROOT;
}
function getPathParts(reqPath){
  return reqPath.split('/').filter(Boolean).slice(2).map(decodeURIComponent);
}

ensureData();
const server=http.createServer(async (req,res)=>{
  const parsed=url.parse(req.url,true);
  const pathname=parsed.pathname||'/';
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS'});return res.end();}

  try{
    if(pathname==='/api/health') return json(res,200,{ok:true,server:'NCE Own Server',time:new Date().toISOString()});

    if(pathname==='/api/state' && req.method==='GET'){
      const state=readState();
      return json(res,200,state);
    }

    if(pathname==='/api/state' && req.method==='POST'){
      const b=await body(req); const key=String(b.key||'');
      if(!key) return json(res,400,{error:'key required'});
      const state=readState(); const value=b.value;
      if(key==='main') state.main=value||EMPTY_MAIN;
      else if(key==='logos'||key==='roles'||key==='desgs'||key==='conames'||key==='salaries') state[key]=value;
      else if(key==='csRoster') state.main.csRoster=value||{supervisors:[],members:[]};
      else if(key.startsWith('callServices/')){
        const id=key.slice('callServices/'.length);
        state.main.callServices=Array.isArray(state.main.callServices)?state.main.callServices:[];
        const i=state.main.callServices.findIndex(x=>String(x.id)===id);
        if(i>=0) state.main.callServices[i]=value; else if(value) state.main.callServices.push(value);
      } else {
        // Unknown paths are retained in a generic state bucket for forward compatibility.
        state.extra=state.extra||{};state.extra[key]=value;
      }
      state.main=state.main||EMPTY_MAIN;
      state.main._updatedAt=Date.now();
      writeState(state);
      return json(res,200,{ok:true,updatedAt:state.updatedAt});
    }

    if(pathname.startsWith('/api/state/') && req.method==='DELETE'){
      const parts=getPathParts(pathname); const key=parts.join('/');
      const state=readState();
      if(key.startsWith('callServices/')){
        const id=key.slice('callServices/'.length);
        state.main.callServices=(state.main.callServices||[]).filter(x=>String(x.id)!==id);
      } else if(key==='csRoster') state.main.csRoster={supervisors:[],members:[]};
      else if(['logos','roles','desgs','conames','salaries'].includes(key)) delete state[key];
      else {state.extra=state.extra||{};delete state.extra[key];}
      writeState(state);
      return json(res,200,{ok:true,updatedAt:state.updatedAt});
    }

    // Static app
    let filePath=pathname==='/'?HTML_FILE:path.join(ROOT,pathname.replace(/^\/+/,''));
    if(!safeStatic(filePath)) return json(res,403,{error:'forbidden'});
    if(fs.existsSync(filePath) && fs.statSync(filePath).isFile()){
      const ext=path.extname(filePath).toLowerCase();
      const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon'};
      res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream'});
      return fs.createReadStream(filePath).pipe(res);
    }
    return json(res,404,{error:'not found'});
  }catch(e){console.error(e);return json(res,500,{error:e.message});}
});
server.listen(PORT,'0.0.0.0',()=>console.log(`NCE Staff Server running on http://0.0.0.0:${PORT}`));
