import { readTowing } from './towing.mjs';
import { collectGeocodes } from './sgis.mjs';

try{
 if(!process.env.SGIS_SERVICE_ID?.trim()||!process.env.SGIS_SECURITY_KEY?.trim())throw new Error('SGIS_SERVICE_ID와 SGIS_SECURITY_KEY를 .env.local에 설정해 주세요.');
 const result=await collectGeocodes({data:readTowing(),progress:(done,total)=>{if(done%25===0)console.log(`주소 변환 ${done}건 처리 / 전체 ${total}곳`);}});
 console.log(`완료: 지도 표시 ${result.geocoding.mapped}곳 · 확인 필요 ${result.geocoding.review}곳 · 미변환 ${result.geocoding.pending}곳`);
}catch(error){console.error(error.message);process.exitCode=1;}
