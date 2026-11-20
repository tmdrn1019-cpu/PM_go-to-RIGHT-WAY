# npm run convert:sidewalk
# Turns the 2015 Seoul footfall survey (spot info OA-21707 + observations OA-21705) into private data/sidewalk-2015.json:
# each spot's WGS84 point, surveyed sidewalk width and weekday hourly pedestrian count. Needs openpyxl and pyproj.
import json, os, sys, collections, openpyxl
from pyproj import Transformer

spots_file, counts_file, out_file = (sys.argv[1:] + [None] * 3)[:3]
spots_file = spots_file or 'data/zone-source/spots-2015/spots-2015.xlsx'
counts_file = counts_file or 'data/zone-source/footfall-2015.xlsx'
out_file = out_file or 'data/sidewalk-2015.json'
# Checked 2026-11-20: EPSG:5181 puts "OO역 N번 출구" spots ~117m from station centres; Bessel TM variants are ~350m off.
to_wgs84 = Transformer.from_crs('EPSG:5181', 'EPSG:4326', always_xy=True)

counts = collections.defaultdict(lambda: collections.defaultdict(list))
for row in openpyxl.load_workbook(counts_file, read_only=True).worksheets[0].iter_rows(min_row=5, values_only=True):
    spot, kind, day, slot, people = row[1], row[2], row[3], str(row[4] or ''), row[5]
    # Main survey on weekdays only; the seasonal re-survey and weekends would skew the weekday average.
    if kind == '본조사' and day in ('월', '화', '수', '목', '금') and slot[:2].isdigit() and isinstance(people, (int, float)) and people >= 0:
        counts[spot][int(slot[:2])].append(people)

spots = []
for row in list(openpyxl.load_workbook(spots_file, read_only=True).worksheets[0].iter_rows(values_only=True))[4:]:
    try:
        width, x, y = float(row[7]), float(row[32]), float(row[33])
    except (TypeError, ValueError):
        continue
    # The sheet repeats spot codes for the seasonal re-survey; keep the main-survey row only.
    if width <= 0 or row[0] not in counts or row[36] != '본조사':
        continue
    lng, lat = to_wgs84.transform(x, y)
    if not (37.3 < lat < 37.8 and 126.7 < lng < 127.3):
        continue
    hourly = {h: round(sum(v) / len(v)) for h, v in sorted(counts[row[0]].items())}
    spots.append({'id': row[0], 'name': str(row[1]).rstrip('.'), 'point': [round(lat, 6), round(lng, 6)], 'widthM': width,
                  'walkway': row[13], 'obstacle': row[12], 'hourly': hourly})

os.makedirs(os.path.dirname(out_file), exist_ok=True)
temporary = f'{out_file}.{os.getpid()}.tmp'
with open(temporary, 'w', encoding='utf-8') as f:
    json.dump({'version': 1, 'year': 2015, 'source': 'https://data.seoul.go.kr/dataList/OA-21707/F/1/datasetView.do',
               'counts': 'https://data.seoul.go.kr/dataList/OA-21705/F/1/datasetView.do', 'crs': 'EPSG:5181', 'spots': spots}, f, ensure_ascii=False)
os.replace(temporary, out_file)
print(f'2015 보도 조사 지점 {len(spots)}곳 -> {out_file}')
