import { createHash } from 'node:crypto';
import { readFileSync, statSync, mkdirSync, writeFileSync, renameSync, existsSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { boundedJson, districts } from './seoul-data.mjs';
export const towingSource = 'https://data.seoul.go.kr/dataList/OA-23057/S/1/datasetView.do';
export function publishTowing(data,file='data/towing-areas.json'){
 mkdirSync(dirname(file),{recursive:true});const temporary=`${file}.${process.pid}.tmp`;let created=false;
 try{writeFileSync(temporary,JSON.stringify(data),{flag:'wx'});created=true;check(readTowing(temporary).status==='ready');renameSync(temporary,file);}
 finally{if(created&&existsSync(temporary))unlinkSync(temporary);}
}
const check = (valid) => { if (!valid) throw new Error('견인 자료 확인이 필요합니다.'); };
const day = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;

export function aggregateTowing(rows) {
 const ids=new Set();const groups=new Map();let excludedRows=0;let districtRows=0;const knownDistricts=new Set(Object.values(districts));
 for(const row of rows){
  check(typeof row.NO==='string' && row.NO.length>0 && !ids.has(row.NO));ids.add(row.NO);
  check(knownDistricts.has(row.GU_NM));
  if(row.GU_NM!=='관악구')continue;districtRows++;
  if(!day(row.ACTN_DAY)||!day(row.DCLR_DT)||typeof row.ADDR!=='string'||!row.ADDR.trim()||row.ADDR.length>300||typeof row.TYPE!=='string'||!row.TYPE.trim()){excludedRows++;continue;}
  const address=row.ADDR.trim().replace(/\s+/g,' ');
  const group=groups.get(address)??{id:createHash('sha256').update(address).digest('hex').slice(0,20),address,district:'관악구',count:0,firstDate:row.ACTN_DAY,lastDate:row.ACTN_DAY,types:Object.create(null)};
  group.count++;group.firstDate=[group.firstDate,row.ACTN_DAY].sort()[0];group.lastDate=[group.lastDate,row.ACTN_DAY].sort().at(-1);
  group.types[row.TYPE]=(Object.hasOwn(group.types,row.TYPE)?group.types[row.TYPE]:0)+1;groups.set(address,group);
 }
 return {areas:[...groups.values()].sort((a,b)=>b.count-a.count||a.address.localeCompare(b.address,'ko')),districtRows,excludedRows};
}

export async function collectTowing({apiKey,from='2025-01-01',to='2025-12-31',fetchImpl=fetch,pause=(delay=200)=>new Promise(resolve=>setTimeout(resolve,delay)),progress=()=>{},onPage=()=>{}}){
 check(typeof apiKey==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(apiKey));check(day(from)&&day(to)&&from<=to&&Date.parse(to)-Date.parse(from)<=366*86400000);
 const dates=[];for(let at=Date.parse(from);at<=Date.parse(to);at+=86400000)dates.push(new Date(at).toISOString().slice(0,10));
 const rows=[];
 // Date partitions avoid the provider's duplicate rows across offset pages.
 for(let index=0;index<dates.length;index+=3){
  const batch=dates.slice(index,index+3);
  const results=await Promise.all(batch.map(async(date,offset)=>{
   if(offset)await pause(offset*250);let data;
   for(let attempt=0;attempt<3;attempt++){
    try{data=await boundedJson(await fetchImpl(`http://openapi.seoul.go.kr:8088/${encodeURIComponent(apiKey)}/json/aiTbAutoKickboard/1/1000/${date}/`,{signal:AbortSignal.timeout(15000),redirect:'error'}));
     const code=data.aiTbAutoKickboard?.RESULT?.CODE??data.RESULT?.CODE;if(['ERROR-500','ERROR-600','ERROR-601'].includes(code))throw new Error('temporary');break;
    }catch{if(attempt===2)throw new Error('견인 요청 실패');await pause(1000*(attempt+1));}
   }
   const source=data.aiTbAutoKickboard;const code=source?.RESULT?.CODE??data.RESULT?.CODE;check(code==='INFO-000'||code==='INFO-200');
   const entries=code==='INFO-200'?[]:source.row;const total=code==='INFO-200'?0:source.list_total_count;
   check(Number.isSafeInteger(total)&&total>=0&&total<=1000&&Array.isArray(entries)&&entries.length===total&&entries.every(row=>row.DCLR_DT===date));
   onPage({date,total,rows:entries});return entries;
  }));
  for(const entries of results)rows.push(...entries);progress(index+batch.length,dates.length,rows.length);await pause();
 }
 return {version:1,status:'ready',sourceUrl:towingSource,from,to,fetchedDays:dates.length,sourceRows:rows.length,collectedAt:new Date().toISOString(),...aggregateTowing(rows)};
}

export function readTowing(file='data/towing-areas.json'){
 try{check(statSync(file).size<=8*1024*1024);const data=JSON.parse(readFileSync(file,'utf8'));check(data.version===1&&data.status==='ready'&&Array.isArray(data.areas)&&data.areas.length<=50000&&day(data.collectedAt?.slice(0,10)));
  check([data.sourceRows,data.districtRows,data.excludedRows].every(n=>Number.isSafeInteger(n)&&n>=0)&&data.sourceRows>=data.districtRows);
  const ids=new Set();const areas=data.areas.map(row=>{
   check(typeof row.id==='string'&&row.id.length<=64&&!ids.has(row.id)&&typeof row.address==='string'&&row.address.length>0&&row.address.length<=300&&Number.isSafeInteger(row.count)&&row.count>0&&day(row.firstDate)&&day(row.lastDate)&&row.firstDate<=row.lastDate);ids.add(row.id);
   check(row.types&&typeof row.types==='object'&&!Array.isArray(row.types)&&Object.values(row.types).every(n=>Number.isSafeInteger(n)&&n>0)&&Object.values(row.types).reduce((sum,n)=>sum+n,0)===row.count);
   return{id:row.id,address:row.address,district:'관악구',count:row.count,firstDate:row.firstDate,lastDate:row.lastDate,types:row.types};
  });check(areas.reduce((sum,row)=>sum+row.count,0)+data.excludedRows===data.districtRows);
  return{version:1,status:'ready',sourceUrl:towingSource,collectedAt:data.collectedAt,from:day(data.from)?data.from:null,to:day(data.to)?data.to:null,fetchedDays:data.fetchedDays??null,sourceRows:data.sourceRows,districtRows:data.districtRows,excludedRows:data.excludedRows,areas};}
 catch(error){return {status:error.code==='ENOENT'?'unconfigured':'error',sourceUrl:towingSource,areas:[]};}
}
