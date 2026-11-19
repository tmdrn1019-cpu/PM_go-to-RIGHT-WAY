import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSgis, matchAddress, collectGeocodes, withGeocodes } from '../server/sgis.mjs';

const address='서울특별시 관악구 봉천동 100-27';
const row={addr_type:'6',sido_nm:'서울특별시',sgg_nm:'관악구',leg_nm:'봉천동',jibun_main_no:'100',jibun_sub_no:'27',x:'126.95',y:'37.48'};
const response=(changes={})=>({errCd:0,result:{matching:'0',totalcount:'1',resultdata:[row],...changes}});
test('SGIS accepts only unique, complete, parcel/building matches with exact address components',()=>{
 assert.deepEqual(matchAddress(address,response()),[37.48,126.95]);
 for(const result of [response({matching:'1'}),response({totalcount:'2'}),response({resultdata:[{...row,addr_type:'3'}]}),response({resultdata:[{...row,sgg_nm:'동작구'}]}),response({resultdata:[{...row,jibun_sub_no:'28'}]}),response({resultdata:[{...row,x:''}]})])assert.equal(matchAddress(address,result),null);
 assert.equal(matchAddress('서울특별시 관악구 봉천동 산100-27',response()),null);
 assert.deepEqual(matchAddress('서울특별시 관악구 관악로 1',response({resultdata:[{...row,road_nm:'관악로',road_nm_main_no:'1',road_nm_sub_no:'0'}]})),[37.48,126.95]);
 assert.deepEqual(matchAddress('서울특별시 관악구 신림동 502',response({resultdata:[{...row,leg_nm:'신림동',jibun_main_no:'502',jibun_sub_no:'null'}]})),[37.48,126.95]);
 assert.equal(matchAddress(address,response({resultdata:[{...row,jibun_sub_no:'null'}]})),null);
});
test('SGIS keeps credentials server-side, reuses token, renews invalid token and sanitizes failures',async()=>{
 let auth=0;let geocodes=0;
 const geocode=createSgis({serviceId:'test-id',securityKey:'test-secret',fetchImpl:async(url)=>{
  const u=new URL(url);
  if(u.pathname.includes('/auth/')){auth++;assert.equal(u.searchParams.get('consumer_secret'),'test-secret');return Response.json({errCd:0,result:{accessToken:`token-${auth}`,accessTimeout:String(Date.now()/1000+14400)}});}
  assert.equal(u.searchParams.has('consumer_secret'),false);geocodes++;
  return Response.json(geocodes===2?{errCd:-401}:response());
 }});
 assert.deepEqual(await geocode(address),[37.48,126.95]);assert.deepEqual(await geocode(address),[37.48,126.95]);assert.equal(auth,2);
 await assert.rejects(createSgis({fetchImpl:()=>{throw Error('must not call');}})(address),/SGIS_SERVICE_ID.*SGIS_SECURITY_KEY/);
 await assert.rejects(createSgis({serviceId:'x',securityKey:'y',fetchImpl:()=>{throw Error('test-secret');}})(address),e=>!e.message.includes('test-secret'));
});
test('offline cache resumes, joins exact addresses only and preserves successes after request failure',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'pm-sgis-'));const file=join(dir,'geocodes.json');
 const data={status:'ready',areas:[{id:'a',address},{id:'b',address:'서울특별시 관악구 봉천동 200'}]};
 try{
  let calls=0;
  await assert.rejects(collectGeocodes({data,file,geocode:async()=>{if(++calls===2)throw Error('network');return [37.48,126.95];},pause:async()=>{}}));
  assert.equal(withGeocodes(data,file).geocoding.mapped,1);
  await collectGeocodes({data,file,geocode:async()=>{calls++;return null;},pause:async()=>{}});
  assert.equal(calls,3);assert.equal(withGeocodes(data,file).geocoding.review,1);
  await collectGeocodes({data,file,geocode:async()=>{calls++;return [37.48,126.95];},pause:async()=>{}});
  assert.equal(calls,4);assert.equal(withGeocodes(data,file).geocoding.mapped,2);
  assert.equal(withGeocodes({...data,areas:[{id:'a',address:'서울특별시 관악구 다른동 1'}]},file).geocoding.mapped,0);
  assert.equal(withGeocodes(data,file,Date.now()+31*86400000).geocoding.mapped,0);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('SGIS expiry supports millisecond examples and seconds documented in the official guide',async()=>{
 for(const scale of [1,1000]){
  let now=Date.now();let auth=0;
  const geocode=createSgis({serviceId:'x',securityKey:'y',now:()=>now,fetchImpl:async url=>url.includes('/auth/')?(auth++,Response.json({errCd:0,result:{accessToken:'token',accessTimeout:String((now+14400000)/scale)}})):Response.json(response())});
  await geocode(address);now+=14500000;await geocode(address);assert.equal(auth,2);
 }
});
test('corrupt coordinate files fail closed; extra cache fields never reach public areas',()=>{
 const dir=mkdtempSync(join(tmpdir(),'pm-sgis-'));const file=join(dir,'geocodes.json');const data={status:'ready',areas:[{id:'a',address}]};
 const entry={id:'a',address,checkedAt:new Date().toISOString(),status:'matched',point:[37.48,126.95],accessToken:'private'};
 try{
  writeFileSync(file,JSON.stringify({version:1,entries:[entry]}));
  assert.equal(JSON.stringify(withGeocodes(data,file)).includes('private'),false);
  for(const entries of [[{...entry,point:[126.95,37.48]}],[entry,entry],[{...entry,checkedAt:'invalid'}]]){
   writeFileSync(file,JSON.stringify({version:1,entries}));
   const result=withGeocodes(data,file);assert.equal(result.geocoding.status,'error');assert.equal(result.areas[0].point,undefined);
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('SGIS empty search and quota errors remain distinct',async()=>{
 for(const code of [-100,-999]){
  const geocode=createSgis({serviceId:'x',securityKey:'y',fetchImpl:async url=>Response.json(url.includes('/auth/')?{errCd:0,result:{accessToken:'token',accessTimeout:String(Date.now()+14400000)}}:{errCd:code})});
  if(code===-100)assert.equal(await geocode(address),null);else await assert.rejects(geocode(address),/조회 실패/);
 }
});
