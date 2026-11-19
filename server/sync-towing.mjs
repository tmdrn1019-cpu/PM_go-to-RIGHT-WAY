import { mkdirSync, appendFileSync } from 'node:fs';
import { collectTowing, publishTowing } from './towing.mjs';
mkdirSync('data',{recursive:true});const archive=`data/towing-source-${process.pid}.jsonl`;
try {
 const result=await collectTowing({apiKey:process.env.SEOUL_OPEN_DATA_KEY,onPage:page=>appendFileSync(archive,JSON.stringify(page)+'\n'),progress:(days,total,count)=>{if(days%30===0||days===total)console.log(`2025년 견인 이력 ${days}/${total}일 · ${count}건`);}});
 publishTowing(result);
 console.log(JSON.stringify({status:result.status,sourceRows:result.sourceRows,districtRows:result.districtRows,areas:result.areas.length,excludedRows:result.excludedRows}));
} catch {console.error(`견인 수집을 완료하지 못했습니다. 기존 집계 파일을 유지합니다. 검증용 원본: ${archive}`);process.exitCode=1;}
