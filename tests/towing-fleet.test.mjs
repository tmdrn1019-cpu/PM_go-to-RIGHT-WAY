import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateTowing, collectTowing, readTowing, publishTowing } from '../server/towing.mjs';
import { mkdtempSync, writeFileSync, readFileSync, unlinkSync, rmdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFleet } from '../server/fleet.mjs';

const row = { NO:'1', GU_NM:'관악구', ADDR:'서울특별시 관악구 검증동 1', TYPE:'검증 유형', DCLR_DT:'2025-12-30', ACTN_DAY:'2025-12-31' };
test('견인 저장 파일의 추가 비밀 필드와 잘못된 집계는 공개 응답으로 반환하지 않는다',()=>{
 const dir=mkdtempSync(join(tmpdir(),'pm-towing-'));const file=join(dir,'feed.json');
 try{const data={version:1,status:'ready',collectedAt:new Date().toISOString(),sourceRows:1,...aggregateTowing([row]),secret:'private-key'};data.areas[0].secret='private-key';
 writeFileSync(file,JSON.stringify(data));assert.equal(JSON.stringify(readTowing(file)).includes('private-key'),false);
 data.areas[0].count=-1;writeFileSync(file,JSON.stringify(data));assert.notEqual(readTowing(file).status,'ready');
 }finally{if(existsSync(file))unlinkSync(file);rmdirSync(dir);}
});
test('견인 분석구역은 관악구의 실제 조치일 있는 이력만 주소별로 집계하고 법적 경계를 만들지 않는다',()=>{
 const result=aggregateTowing([row,{...row,NO:'2'},{...row,NO:'3',ACTN_DAY:''},{...row,NO:'4',GU_NM:'종로구'},{...row,NO:'5',TYPE:'오신고'}]);
 assert.equal(result.areas.length,1);assert.equal(result.areas[0].count,2);assert.equal(result.excludedRows,2);
 assert.equal('boundary' in result.areas[0],false);assert.equal('point' in result.areas[0],false);
 assert.throws(()=>aggregateTowing([row,row]));
});
test('자치구가 누락되거나 판별 불가이면 관악구 0건의 성공 집계를 만들지 않는다',()=>{
 for(const district of [undefined,null,'','알수없는구'])assert.throws(()=>aggregateTowing([{...row,GU_NM:district}]));
});
test('공개 조회 계약을 넘는 새 집계는 마지막 정상 파일을 덮어쓰지 않는다',()=>{
 const dir=mkdtempSync(join(tmpdir(),'pm-publish-'));const file=join(dir,'feed.json');
 try{const valid={version:1,status:'ready',sourceRows:1,collectedAt:new Date().toISOString(),...aggregateTowing([row])};publishTowing(valid,file);const before=readFileSync(file,'utf8');
 assert.throws(()=>publishTowing({...valid,padding:'x'.repeat(8*1024*1024)},file));assert.equal(readFileSync(file,'utf8'),before);
 assert.throws(()=>publishTowing({...valid,areas:Array(50001).fill(valid.areas[0])},file));assert.equal(readFileSync(file,'utf8'),before);
 writeFileSync(file,'invalid');assert.equal(readTowing(file).status,'error');
 }finally{unlinkSync(file);rmdirSync(dir);}
});
test('날짜별 견인 수집은 날짜 필터와 일일 건수를 검증해 페이지 중복을 피한다',async()=>{
 const urls=[];const fetchImpl=async(url)=>{urls.push(url);const date=url.match(/(\d{4}-\d{2}-\d{2})\/$/)?.[1];assert.ok(date);return Response.json({aiTbAutoKickboard:{RESULT:{CODE:'INFO-000'},list_total_count:1,row:[{...row,NO:date,DCLR_DT:date}]}});};
 const options={apiKey:'test',from:'2025-12-30',to:'2025-12-31',fetchImpl,pause:async()=>{}};
 const result=await collectTowing(options);assert.equal(urls.length,2);assert.equal(result.sourceRows,2);assert.equal(result.areas[0].count,2);assert.equal(result.fetchedDays,2);
 await assert.rejects(collectTowing({...options,fetchImpl:async()=>Response.json({aiTbAutoKickboard:{RESULT:{CODE:'INFO-000'},list_total_count:1001,row:[row]}})}));
 await assert.rejects(collectTowing({...options,fetchImpl:async()=>Response.json({aiTbAutoKickboard:{RESULT:{CODE:'INFO-000'},list_total_count:1,row:[row]}})}));
});
const providers={response:{header:{resultCode:'00'},body:{items:{item:[{citycode:'12',cityname:'세종특별시',providername:'GBIKE'}]},totalCount:1}}};
test('견인 수집의 일시적인 요청 실패는 같은 페이지를 재시도하고 중복 집계하지 않는다',async()=>{
 let calls=0;const result=await collectTowing({apiKey:'key',from:'2025-12-30',to:'2025-12-30',pause:async()=>{},fetchImpl:async()=>{calls++;if(calls===1)throw new Error('temporary');return Response.json({aiTbAutoKickboard:{RESULT:{CODE:'INFO-000'},list_total_count:1,row:[row]}});}});
 assert.equal(calls,2);assert.equal(result.areas[0].count,1);
});
test('TAGO가 서울 요청에 세종 자료를 반환해도 서울의 빈 기기 목록으로 취급하지 않는다',async()=>{
 let calls=0;const read=createFleet({apiKey:'private-test',fetchImpl:async()=>{calls++;return Response.json(providers);}});
 const state=await read();assert.equal(state.status,'unsupported');assert.equal(state.cityName,'서울');assert.deepEqual(state.vehicles,[]);assert.equal(state.providers[0].cityName,'세종특별시');
 await read();assert.equal(calls,1);assert.equal(JSON.stringify(state).includes('private-test'),false);
});
test('TAGO 조회는 검증된 운영사/지역만 허용하고 기기 좌표와 배터리를 검사한다',async()=>{
 const read=createFleet({apiKey:'key',fetchImpl:async(url)=>url.includes('GetPMProvider')?Response.json(providers):Response.json({response:{header:{resultCode:'00'},body:{items:{item:[{vehicleid:'a',citycode:'12',cityname:'세종특별시',providername:'GBIKE',latitude:'36.5',longitude:'127.2',battery:'80'}]},totalCount:1}}})});
 assert.equal((await read('12','FAKE')).status,'unsupported');
 const state=await read('12','GBIKE');assert.equal(state.status,'ready');assert.deepEqual(state.vehicles[0].point,[36.5,127.2]);assert.equal(state.vehicles[0].observedAt,null);
});
test('TAGO의 다른 지역 기기·빈 좌표와 외부 오류는 공개 위치로 반환하지 않는다',async()=>{
 for(const change of [{citycode:'11'},{latitude:''},{battery:'101'}]){
  const read=createFleet({apiKey:'key',fetchImpl:async(url)=>url.includes('GetPMProvider')?Response.json(providers):Response.json({response:{header:{resultCode:'00'},body:{items:{item:[{vehicleid:'a',citycode:'12',cityname:'세종특별시',providername:'GBIKE',latitude:'36.5',longitude:'127.2',battery:'80',...change}]},totalCount:1}}})});
  const result=await read('12','GBIKE');assert.equal(result.status,'error');assert.deepEqual(result.vehicles,[]);
 }
});
test('TAGO 제공처 오류에도 1분 캐시로 반복 요청을 제한한다',async()=>{
 let calls=0;const read=createFleet({apiKey:'private-key',fetchImpl:async()=>{calls++;throw new Error('private-key');}});
 const state=await read();await read();assert.equal(calls,1);assert.equal(JSON.stringify(state).includes('private-key'),false);
});
test('한 운영사의 기기 조회가 실패해도 선택 지역과 다른 운영사 목록을 보존한다',async()=>{
 const catalog=structuredClone(providers);catalog.response.body.items.item.push({citycode:'12',cityname:'세종특별시',providername:'ALPACA'});catalog.response.body.totalCount=2;
 const read=createFleet({apiKey:'key',fetchImpl:async(url)=>{if(url.includes('GetPMProvider'))return Response.json(catalog);throw new Error('unavailable');}});
 const state=await read('12','GBIKE');assert.equal(state.status,'error');assert.equal(state.cityName,'세종특별시');assert.equal(state.providers.length,2);assert.deepEqual(state.vehicles,[]);
});
test('견인 집계는 자치구를 지정하지 않으면 서울 전체를 주소별로 묶는다',()=>{
 const seoul=aggregateTowing([row,{...row,NO:'2',GU_NM:'강남구',ADDR:'서울특별시 강남구 청담동 77'}],null);
 assert.deepEqual(seoul.areas.map(a=>[a.district,a.count]).sort(),[['강남구',1],['관악구',1]]);
 assert.equal(seoul.districtRows,2);
});
