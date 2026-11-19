import { useEffect, useState } from 'react';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Link } from '@astryxdesign/core/Link';
import { TextInput } from '@astryxdesign/core/TextInput';
import { fetchExternalData } from './service-client.mjs';

const time=(value)=>value?new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'—';
export default function ExternalDataPanel({kind,onVehicles,onTowing}){
 const [data,setData]=useState(null);const [connection,setConnection]=useState('loading');const [query,setQuery]=useState('');const [limit,setLimit]=useState(30);const [choice,setChoice]=useState(null);const [version,setVersion]=useState(0);
 const fleet=kind==='fleet';
 useEffect(()=>{
  let stopped=false;let timer;let controller;let first=true;
  const read=async()=>{
   if(document.hidden){timer=setTimeout(read,60000);return;}
   controller=new AbortController();setConnection('loading');
   try{const path=fleet?`/api/pm/vehicles${choice?`?cityCode=${encodeURIComponent(choice.cityCode)}&provider=${encodeURIComponent(choice.provider)}`:''}`:'/api/towing/areas';
    const next=await fetchExternalData(path,controller.signal);
    if(!['ready','unconfigured','unsupported','error'].includes(next.status)||!Array.isArray(fleet?next.vehicles:next.areas))throw new Error('invalid');
    if(!stopped){setData(next);setConnection('online');if(fleet)onVehicles(next.status==='ready'?next.vehicles:[],first);else onTowing(next.status==='ready'?next.areas.filter(row=>row.geocodeStatus==='matched'):[],first);first=false;}
   }catch{if(!stopped){setConnection('offline');if(fleet)onVehicles([]);else onTowing([]);}}
   finally{if(!stopped)timer=setTimeout(read,60000);}
  };read();const visible=()=>{if(!document.hidden)setVersion(v=>v+1);};document.addEventListener('visibilitychange',visible);
  return()=>{stopped=true;clearTimeout(timer);controller?.abort();if(fleet)onVehicles([]);else onTowing([]);document.removeEventListener('visibilitychange',visible);};
 },[fleet,choice,version,onVehicles,onTowing]);
 const keyword=query.trim().toLowerCase();const rows=(fleet?data?.vehicles:data?.areas)??[];
 const filtered=rows.filter(row=>`${row.address??''} ${row.provider??''} ${row.id}`.toLowerCase().includes(keyword));
 return <VStack gap={4}>
  <Heading level={2}>{fleet?'실제 PM 위치':'관악구 견인 분석구역'}</Heading>
  <Text color="secondary">{fleet?'제공처가 지원하는 지역의 기기 위치를 조회합니다.':'실제 조치 완료된 견인 이력을 같은 주소로 묶었습니다. 건수가 많은 주소부터 표시합니다.'}</Text>
  <Text type="label" aria-live="polite">{connection==='offline'?'연결 확인 필요':connection==='loading'?'자료 확인 중':data?.status==='ready'?'실제 자료 연결됨':data?.status==='unsupported'?'관악구 위치정보 미지원':data?.status==='error'?'제공처 응답 확인 필요':'데이터 연결 준비'}</Text>
  {data?.sourceUrl&&<Link href={data.sourceUrl} target="_blank" rel="noopener noreferrer">공식 원자료 보기</Link>}
  {fleet?<>
   <Text type="supporting">선택 지역: {data?.cityName??'서울'} · 수집 {time(data?.collectedAt)} KST</Text>
   {data?.status==='unsupported'&&<Text>TAGO 응답에 서울 관악구의 운영사가 없습니다. 이는 관악구에 기기가 0대라는 뜻이 아닙니다. 아래 지원 지역을 선택하면 지도가 해당 지역으로 이동합니다.</Text>}
   <HStack gap={2} wrap="wrap">{data?.providers?.map(provider=><Button key={`${provider.cityCode}:${provider.provider}`} label={`${provider.cityName} · ${provider.provider}`} size="sm" variant="secondary" onClick={()=>{setChoice(provider);setQuery('');setLimit(30);}}/>)}{choice&&<Button label="관악구 지원 확인" size="sm" variant="ghost" onClick={()=>setChoice(null)}/>}</HStack>
   {data?.status==='ready'&&<Text>원본 {data.totalRows}대 중 {rows.length}대 조회{data.partial?' · 일부 조회':''}. 원자료에 기기 관측 시각이 없어 현재 위치 정확도와 도착 후 대여 가능 여부는 보장되지 않습니다.</Text>}
  </>:<>
   <Text type="supporting">신고 기준 기간 {data?.from??'—'} ~ {data?.to??'—'}<br/>수집 {time(data?.collectedAt)} KST</Text>
   {data?.status==='ready'?<Text>전체 {data.sourceRows.toLocaleString('ko-KR')}건 확인 · 관악구 {data.districtRows.toLocaleString('ko-KR')}건 · 집계 제외 {data.excludedRows}건 · 주소 {rows.length.toLocaleString('ko-KR')}곳</Text>:<Text>견인 원자료를 수집한 뒤 주소별 분석 결과를 제공합니다.</Text>}
   <Text type="supporting">과거 견인 주소의 대표 위치입니다. 원의 크기는 견인 건수를 나타내며, 실제 견인 위치·법적 금지 경계·허가된 주차존을 뜻하지 않습니다.</Text>
   <Text aria-live="polite">SGIS 지도 표시 {data?.geocoding?.mapped??0}곳 · 주소 확인 필요 {data?.geocoding?.review??0}곳 · 미변환 {data?.geocoding?.pending??rows.length}곳</Text>
   {data?.geocoding?.status==='error'&&<Text>좌표 자료를 읽지 못했습니다. 지도 표시를 중단했습니다.</Text>}
   {!!data?.geocoding?.pending&&<Text type="supporting">주소 좌표 변환을 준비 중입니다. 변환된 주소부터 지도에 표시합니다.</Text>}
   {data?.geocoding?.sourceUrl&&<Link href={data.geocoding.sourceUrl} target="_blank" rel="noopener noreferrer">좌표 출처: SGIS</Link>}
   {!!data?.geocoding?.mapped&&<Button label="견인 분석 위치 전체 보기" variant="secondary" isDisabled={connection!=='online'} onClick={()=>onTowing(rows.filter(row=>row.geocodeStatus==='matched'),true)}/>}
  </>}
  {connection==='offline'&&<Text>마지막 조회 자료이며 최신 상태는 확인할 수 없습니다.</Text>}
  {!!rows.length&&<><TextInput label={fleet?'기기 번호 검색':'견인 주소 검색'} value={query} hasClear onChange={value=>{setQuery(value);setLimit(30);}}/><Text>검색 결과 {filtered.length}건</Text><VStack gap={0}>{filtered.slice(0,limit).map(row=><VStack key={row.id} gap={2} paddingBlock={4} style={{borderBottom:'var(--border-width) solid var(--color-border)'}}>
   <Text type="label">{fleet?`${row.provider} · ${row.id}`:row.address}</Text>
   {fleet?<><Text>배터리 {row.battery}%</Text><Text type="supporting">위도 {row.point[0]} · 경도 {row.point[1]}</Text></>:<><Text>견인 {row.count.toLocaleString('ko-KR')}건</Text><Text type="supporting">조치 기간 {row.firstDate} ~ {row.lastDate}</Text><Text type="supporting">{Object.entries(row.types).map(([type,count])=>`${type} ${count}건`).join(' · ')}</Text>{row.geocodeStatus==='matched'?<><Text type="supporting">SGIS 주소 확인 {time(row.geocodedAt)} KST</Text><Button label={`${row.address} 지도에서 보기`} size="sm" variant="secondary" isDisabled={connection!=='online'} onClick={()=>onTowing([row],true)}/></>:<Text type="supporting">{row.geocodeStatus==='review'?'주소 확인 필요 · 정확한 일치 결과 없음':'좌표 미변환'}</Text>}</>}
  </VStack>)}</VStack>{filtered.length>limit&&<Button label="자료 더 보기" variant="secondary" onClick={()=>setLimit(v=>v+30)}/>}</>}
  <Button label="자료 새로고침" variant="secondary" onClick={()=>setVersion(v=>v+1)}/>
 </VStack>;
}
