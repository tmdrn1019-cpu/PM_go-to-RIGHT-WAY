import { readFileSync, statSync, mkdirSync, writeFileSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { boundedJson } from './seoul-data.mjs';

export const sgisSource='https://sgis.mods.go.kr/developer/html/newOpenApi/api/dataApi/addressBoundary.html';
const cacheFile='data/towing-geocodes.json';
const ttl=30*86400000;
const validPoint=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=37.3&&p[0]<=37.8&&p[1]>=126.7&&p[1]<=127.3;
const validNumber=n=>typeof n==='string'&&/^\d+(\.\d+)?$/.test(n)||typeof n==='number'&&Number.isFinite(n);

export function matchAddress(address,data){
 const result=data?.result;const rows=result?.resultdata;
 if(data?.errCd!==0||String(result?.matching)!=='0'||String(result?.totalcount)!=='1'||!Array.isArray(rows)||rows.length!==1)return null;
 const row=rows[0];
 const match=/^서울특별시 (\S+구) (.+(?:동|가|리|대로|로|길)) (\d+)(?:-(\d+))?$/.exec(address);
 // The district in the address must be the district SGIS resolved (any Seoul 구, not only 관악구).
 if(!match||String(row.addr_type)!=='6'||row.sido_nm!=='서울특별시'||row.sgg_nm!==match[1])return null;
 match.shift(); // drop the district so the indices below stay place, main, sub
 const road=/(대로|로|길)$/.test(match[1]);
 const main=road?row.road_nm_main_no:row.jibun_main_no;const rawSub=road?row.road_nm_sub_no:row.jibun_sub_no;
 // SGIS represents an absent sub-number as the string "null" in live parcel results.
 const sub=!match[3]&&rawSub==='null'?'0':rawSub;
 if((road?row.road_nm:row.leg_nm)!==match[1]||!validNumber(main)||!validNumber(sub)||Number(main)!==Number(match[2])||Number(sub)!==Number(match[3]??0))return null;
 const x=row.x??row.X;const y=row.y??row.Y;if(!validNumber(x)||!validNumber(y))return null;
 const point=[Number(y),Number(x)];return validPoint(point)?point:null;
}

export function createSgis({serviceId=process.env.SGIS_SERVICE_ID,securityKey=process.env.SGIS_SECURITY_KEY,fetchImpl=fetch,now=Date.now}={}){
 let token;let expires=0;
 const request=async(path,parameters)=>{
  try{const url=new URL(`https://sgisapi.mods.go.kr/OpenAPI3/${path}.json`);url.search=new URLSearchParams(parameters).toString();
   return await boundedJson(await fetchImpl(url.toString(),{signal:AbortSignal.timeout(10000),redirect:'error'}));
  }catch{throw new Error('SGIS 요청 실패. 인증 설정과 네트워크를 확인해 주세요.');}
 };
 return async address=>{
  if(!serviceId?.trim()||!securityKey?.trim())throw new Error('SGIS_SERVICE_ID와 SGIS_SECURITY_KEY 설정이 필요합니다.');
  for(let attempt=0;attempt<2;attempt++){
   if(!token||expires<=now()+60000){
    const auth=await request('auth/authentication',{consumer_key:serviceId,consumer_secret:securityKey});
    if(auth.errCd!==0||typeof auth.result?.accessToken!=='string'||!auth.result.accessToken||!validNumber(auth.result.accessTimeout))throw new Error('SGIS 인증 실패. 서비스 ID와 보안 Key를 확인해 주세요.');
    // The guide says seconds; its official response examples use milliseconds.
    token=auth.result.accessToken;const timeout=Number(auth.result.accessTimeout);expires=timeout<1e12?timeout*1000:timeout;
    if(expires<=now())throw new Error('SGIS 인증 유효기간 확인이 필요합니다.');
   }
   const data=await request('addr/geocodewgs84',{accessToken:token,address,pagenum:'0',resultcount:'5'});
   if(data.errCd===-401){token=null;continue;}
   if(data.errCd===-100)return null;
   if(data.errCd!==0)throw new Error('SGIS 주소 조회 실패. 호출 한도와 인증 상태를 확인해 주세요.');
   return matchAddress(address,data);
  }
  throw new Error('SGIS 인증 갱신 실패.');
 };
}

function readCache(file){
 try{
  if(statSync(file).size>8*1024*1024)throw Error();
  const data=JSON.parse(readFileSync(file,'utf8'));
  if(data.version!==1||!Array.isArray(data.entries)||data.entries.length>50000)throw Error();
  const ids=new Set();
  for(const e of data.entries){
   if(typeof e.id!=='string'||ids.has(e.id)||typeof e.address!=='string'||!Number.isFinite(Date.parse(e.checkedAt))||!['matched','review'].includes(e.status)||(e.status==='matched'&&!validPoint(e.point)))throw Error();
   ids.add(e.id);
  }
  return data.entries;
 }catch(error){if(error.code==='ENOENT')return [];throw new Error('SGIS 좌표 저장 파일 확인이 필요합니다.');}
}
function saveCache(entries,file){
 mkdirSync(dirname(file),{recursive:true});const temp=`${file}.${process.pid}.tmp`;let created=false;
 try{writeFileSync(temp,JSON.stringify({version:1,entries}),{flag:'wx'});created=true;renameSync(temp,file);}
 finally{if(created&&existsSync(temp))unlinkSync(temp);}
}
const fresh=(entry,now)=>entry&&Date.parse(entry.checkedAt)<=now&&now-Date.parse(entry.checkedAt)<ttl;

export async function collectGeocodes({data,file=cacheFile,geocode=createSgis(),pause=()=>new Promise(resolve=>setTimeout(resolve,250)),progress=()=>{}}){
 if(data.status!=='ready')throw new Error('견인 원자료를 먼저 수집해 주세요.');
 const saved=new Map(readCache(file).map(e=>[e.id,e]));let completed=0;let changed=false;
 try{
  for(const area of data.areas){
   const previous=saved.get(area.id);
   if(previous?.status==='matched'&&previous.address===area.address&&fresh(previous,Date.now()))continue;
   const point=await geocode(area.address);
   if(point!==null&&!validPoint(point))throw new Error('SGIS 좌표 확인이 필요합니다.');
   saved.set(area.id,{id:area.id,address:area.address,checkedAt:new Date().toISOString(),status:point?'matched':'review',...(point?{point}:{})});
   changed=true;completed++;if(completed%25===0){saveCache([...saved.values()],file);changed=false;}progress(completed,data.areas.length);await pause();
  }
 }finally{if(changed)saveCache([...saved.values()],file);}
 return withGeocodes(data,file);
}

export function withGeocodes(data,file=cacheFile,now=Date.now()){
 let entries=[];let status='ready';
 try{entries=readCache(file);}catch{status='error';}
 const saved=new Map(entries.map(e=>[e.id,e]));let mapped=0;let review=0;
 const areas=data.areas.map(area=>{
  const entry=saved.get(area.id);const usable=entry?.address===area.address&&fresh(entry,now);
  const geocodeStatus=usable?entry.status:'pending';
  if(geocodeStatus==='matched')mapped++;if(geocodeStatus==='review')review++;
  return {...area,geocodeStatus,...(usable?{geocodedAt:entry.checkedAt}:{}),...(geocodeStatus==='matched'?{point:entry.point}:{})};
 });
 return {...data,areas,geocoding:{status,sourceUrl:sgisSource,mapped,review,pending:areas.length-mapped-review}};
}
