import { useEffect, useRef, useState } from 'react';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Box, Act } from './panel-ui';
import { Link } from '@astryxdesign/core/Link';
import { TextInput } from '@astryxdesign/core/TextInput';
import { fetchExternalData } from './service-client.mjs';
import CandidateList from './CandidateList.jsx';

const time=(value)=>value?new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'—';
export default function ExternalDataPanel({kind,onVehicles,onTowing}){
 const [data,setData]=useState(null);const [connection,setConnection]=useState('loading');const [query,setQuery]=useState('');const [limit,setLimit]=useState(30);const [choice,setChoice]=useState(null);const [version,setVersion]=useState(0);const autoPicked=useRef(false);
 const fleet=kind==='fleet';
 useEffect(()=>{
  let stopped=false;let timer;let controller;let first=true;
  const read=async()=>{
   if(document.hidden){timer=setTimeout(read,60000);return;}
   controller=new AbortController();setConnection('loading');
   try{const path=fleet?`/api/pm/vehicles${choice?`?cityCode=${encodeURIComponent(choice.cityCode)}&provider=${encodeURIComponent(choice.provider)}`:''}`:'/api/towing/areas';
    const next=await fetchExternalData(path,controller.signal);
    if(!['ready','unconfigured','unsupported','error'].includes(next.status)||!Array.isArray(fleet?next.vehicles:next.areas))throw new Error('invalid');
    // Seoul has no TAGO coverage, so show the first supported provider's real scooters once instead of an empty map.
    if(!stopped&&fleet&&!choice&&!autoPicked.current&&next.status==='unsupported'&&next.providers?.length){autoPicked.current=true;setChoice(next.providers[0]);return;}
    if(!stopped){setData(next);setConnection('online');if(fleet)onVehicles(next.status==='ready'?next.vehicles:[],first);else onTowing(next.status==='ready'?next.areas.filter(row=>row.geocodeStatus==='matched'):[],first);first=false;}
   }catch{if(!stopped){setConnection('offline');if(fleet)onVehicles([]);else onTowing([]);}}
   finally{if(!stopped)timer=setTimeout(read,60000);}
  };read();const visible=()=>{if(!document.hidden)setVersion(v=>v+1);};document.addEventListener('visibilitychange',visible);
  return()=>{stopped=true;clearTimeout(timer);controller?.abort();if(fleet)onVehicles([]);else onTowing([]);document.removeEventListener('visibilitychange',visible);};
 },[fleet,choice,version,onVehicles,onTowing]);
 const keyword=query.trim().toLowerCase();const rows=(fleet?data?.vehicles:data?.areas)??[];
 const filtered=rows.filter(row=>`${row.address??''} ${row.provider??''} ${row.id}`.toLowerCase().includes(keyword));
 const ready=data?.status==='ready';const n=(v)=>(v??0).toLocaleString('ko-KR');
 const status=connection==='offline'?'연결 확인 필요':connection==='loading'?'자료 확인 중':ready?'실제 자료 연결됨':data?.status==='unsupported'?'서울 위치정보 미지원':data?.status==='error'?'제공처 응답 확인 필요':'데이터 연결 준비';
 return <VStack gap={4}>
  <Box tone={connection==='online'&&ready?'green':connection==='offline'||data?.status==='error'?'orange':'muted'}>
   <Text type="label" aria-live="polite">{status}</Text>
   <Text>{fleet?'제공처가 지원하는 지역의 실제 기기 위치예요.':'관악구의 실제 견인 이력을 주소별로 묶었어요. 지도의 원 크기가 견인 건수예요 (금지 경계 아님).'}</Text>
   {data?.sourceUrl&&<Link href={data.sourceUrl} target="_blank" rel="noopener noreferrer">공식 원자료 보기</Link>}
  </Box>
  {fleet?<>
   <Box>
    <Text type="supporting">{data?.cityName??'서울'} · 수집 {time(data?.collectedAt)} KST</Text>
    {autoPicked.current&&choice&&<Text>서울은 TAGO가 지원하지 않아 {choice.cityName} {choice.provider}의 실제 기기를 보여 줘요.</Text>}
    {data?.status==='unsupported'&&<Text>TAGO에 서울 운영사가 없어요 (기기 0대라는 뜻은 아니에요). 아래에서 지역을 골라 주세요.</Text>}
    {ready&&<Text>원본 {data.totalRows}대 중 {rows.length}대{data.partial?' · 일부 조회':''} · 관측 시각 미제공</Text>}
   </Box>
   {!!data?.providers?.length&&<HStack gap={2} wrap="wrap">{data.providers.map(provider=>{const on=choice?.cityCode===provider.cityCode&&choice?.provider===provider.provider;return <Button key={`${provider.cityCode}:${provider.provider}`} label={`${provider.cityName} · ${provider.provider}`} size="sm" variant={on?'primary':'secondary'} aria-pressed={on} onClick={()=>{setChoice(provider);setQuery('');setLimit(30);}}/>;})}{choice&&<Button label="서울 지원 확인" size="sm" variant="secondary" onClick={()=>setChoice(null)}/>}</HStack>}
  </>:<>
   <HStack gap={2} wrap="wrap">{[[ready?data.districtRows:null,'관악구 견인'],[ready?rows.length:null,'주소'],[data?.geocoding?.mapped,'지도 표시']].map(([value,label])=><Card key={label} variant="muted" padding={3}><VStack gap={0} hAlign="center"><Text type="display-3">{value==null?'—':n(value)}</Text><Text type="label">{label}</Text></VStack></Card>)}</HStack>
   <Box>
    <Text type="supporting">신고 기간 {data?.from??'—'} ~ {data?.to??'—'} · 수집 {time(data?.collectedAt)} KST</Text>
    {ready?<Text type="supporting">서울 전체 {n(data.sourceRows)}건 확인 · 집계 제외 {data.excludedRows}건 · 주소 확인 필요 {n(data?.geocoding?.review)}곳 · 미변환 {n(data?.geocoding?.pending??rows.length)}곳</Text>:<Text>견인 원자료를 수집한 뒤 주소별 분석 결과를 보여 줘요.</Text>}
    {data?.geocoding?.sourceUrl&&<Link href={data.geocoding.sourceUrl} target="_blank" rel="noopener noreferrer">좌표 출처: SGIS</Link>}
   </Box>
   {data?.geocoding?.status==='error'&&<Box tone="orange"><Text>좌표 자료를 읽지 못해 지도 표시를 멈췄어요.</Text></Box>}
   {!!data?.geocoding?.mapped&&<Act label="견인 위치 전체 지도에서 보기" isDisabled={connection!=='online'} onClick={()=>onTowing(rows.filter(row=>row.geocodeStatus==='matched'),true)}/>}
   {ready&&<CandidateList onTowing={onTowing}/>}
  </>}
  {connection==='offline'&&<Box tone="orange"><Text>마지막 조회 자료예요. 최신 상태는 확인할 수 없어요.</Text></Box>}
  {!!rows.length&&<><TextInput label={fleet?'기기 번호 검색':'견인 주소 검색'} value={query} hasClear onChange={value=>{setQuery(value);setLimit(30);}}/><Text type="label" color="secondary">검색 결과 {filtered.length}건</Text><VStack gap={2}>{filtered.slice(0,limit).map(row=><Card key={row.id} variant="muted" padding={3}><HStack hAlign="between" vAlign="center" gap={2}><VStack gap={1} style={{minWidth:0}}>
   <Text type="label">{fleet?`${row.provider} · ${row.id}`:row.address.replace(/^서울특별시 /,'')}</Text>
   {fleet?<Text type="supporting">배터리 {row.battery}% · {row.point[0]}, {row.point[1]}</Text>:<><Text>견인 {n(row.count)}건</Text><Text type="supporting">{Object.entries(row.types).map(([type,count])=>`${type} ${count}`).join(' · ')}{row.geocodeStatus==='matched'?'':row.geocodeStatus==='review'?' · 주소 확인 필요':' · 좌표 미변환'}</Text></>}
  </VStack>{!fleet&&row.geocodeStatus==='matched'&&<Button label="지도에서 보기" size="sm" variant="primary" isDisabled={connection!=='online'} onClick={()=>onTowing([row],true)}/>}</HStack></Card>)}</VStack>{filtered.length>limit&&<Act label="자료 더 보기" variant="secondary" onClick={()=>setLimit(v=>v+30)}/>}</>}
  <Act label="자료 새로고침" variant="secondary" onClick={()=>setVersion(v=>v+1)}/>
 </VStack>;
}
