import { boundedJson } from './seoul-data.mjs';
const check=(valid)=>{if(!valid)throw new Error('PM 자료 확인이 필요합니다.');};
const string=(value)=>typeof value==='string'&&value.length>0&&value.length<=100;
export function createFleet({apiKey='',fetchImpl=fetch,now=Date.now}={}){
 const cache=new Map();const pending=new Map();
 async function request(method,params){
  const cacheKey=method+JSON.stringify(params);const old=cache.get(cacheKey);if(old&&now()<old.until){check(!old.error);return old.body;}if(pending.has(cacheKey))return pending.get(cacheKey);
  const task=(async()=>{const url=new URL(`https://apis.data.go.kr/1613000/PersonalMobilityInfo/${method}`);
   for(const[k,v]of Object.entries({serviceKey:apiKey,_type:'json',numOfRows:'1000',pageNo:'1',...params}))url.searchParams.set(k,v);
   const result=await boundedJson(await fetchImpl(url.href,{signal:AbortSignal.timeout(5000),redirect:'error'}));const response=result.response;
   check(response?.header?.resultCode==='00');const body=response.body;check(Number.isSafeInteger(body?.totalCount)&&body.totalCount>=0);
   const item=body.items?.item;const rows=item===undefined?[]:Array.isArray(item)?item:[item];check(rows.length<=1000&&body.totalCount>=rows.length&&(body.totalCount===0||rows.length>0));
   const value={rows,total:body.totalCount,collectedAt:new Date(now()).toISOString()};cache.set(cacheKey,{until:now()+60000,body:value});return value;
  })();pending.set(cacheKey,task);try{return await task;}catch{cache.set(cacheKey,{until:now()+60000,error:true});throw new Error('PM 자료 확인이 필요합니다.');}finally{pending.delete(cacheKey);}
 }
 return async(cityCode='',provider='')=>{
  const state={status:'unconfigured',cityName:'서울',providers:[],vehicles:[],sourceUrl:'https://www.data.go.kr/data/15117668/openapi.do',collectedAt:null};
  if(!apiKey)return state;
  try{const catalog=await request('GetPMProvider',{});check(catalog.rows.length===catalog.total);
   const providers=catalog.rows.map(row=>{check([row.citycode,row.cityname,row.providername].every(string));return{cityCode:row.citycode,cityName:row.cityname,provider:row.providername};});
   state.providers=providers;state.collectedAt=catalog.collectedAt;
   const choice=providers.find(row=>cityCode?row.cityCode===cityCode&&row.provider===provider:row.cityName.includes('서울'));
   if(!choice)return{...state,status:'unsupported',providers,collectedAt:catalog.collectedAt};
   state.cityName=choice.cityName;
   const data=await request('GetPMListByProvider',{cityCode:choice.cityCode,providerName:choice.provider});
   const ids=new Set();const vehicles=data.rows.map(row=>{
    check(row.citycode===choice.cityCode&&row.providername===choice.provider&&row.cityname===choice.cityName&&string(row.vehicleid)&&!ids.has(row.vehicleid));ids.add(row.vehicleid);
    check([row.latitude,row.longitude,row.battery].every(v=>typeof v==='number'||(typeof v==='string'&&v.trim()!=='')));
    const point=[Number(row.latitude),Number(row.longitude)];const battery=Number(row.battery);
    check(point.every(Number.isFinite)&&Math.abs(point[0])<=90&&Math.abs(point[1])<=180&&Number.isFinite(battery)&&battery>=0&&battery<=100);
    return{id:row.vehicleid,provider:choice.provider,cityName:choice.cityName,point,battery,observedAt:null};
   });return{...state,status:'ready',providers,cityName:choice.cityName,vehicles,collectedAt:data.collectedAt,totalRows:data.total,partial:data.total>vehicles.length};
  }catch{return{...state,status:'error'};}
 };
}
