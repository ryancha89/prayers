# Regenerate Unity consultation voice clips (ko) from the RN strings the app actually shows.
# Usage: SAJU_TOKEN=<SAJU_ACCESS_TOKEN> python3 tools/regen_consult_clips.py [--dry]   (Rails dev on :4000)
# Writes Assets/Resources/Audio/Consultation/ko/<locKey>[__<topic>].wav — then re-export Unity.
import json, os, sys, base64, struct, urllib.request, concurrent.futures as cf
FLOW='/Users/namaste/git/prayers/src/features/counseling/flow'
OUT='/Users/namaste/git/saju_fullstack/saju_world_unity/Assets/Resources/Audio/Consultation/ko'
TOKEN=os.environ['SAJU_TOKEN']
strings=json.load(open(f'{FLOW}/consultationStrings.json'))
flow=json.load(open(f'{FLOW}/consultationFlow.json'))
def ko(k): v=strings.get(k); return (v or {}).get('ko') if isinstance(v,dict) else None
topics=sorted(k[len('consult_topic_'):] for k in strings if k.startswith('consult_topic_'))
# every loc key the flow can speak
keys=set()
def walk(o):
    if isinstance(o,dict):
        for k,v in o.items():
            if k.lower().endswith('lockeys') and isinstance(v,list): keys.update(x for x in v if isinstance(x,str))
            elif k.lower().endswith('lockey') and isinstance(v,str): keys.add(v)
            else: walk(v)
    elif isinstance(o,list):
        for x in o: walk(x)
walk(flow)
keys={k for k in keys if k.startswith('consult_p') and ko(k)}
existing={f[:-4] for f in os.listdir(OUT) if f.endswith('.wav')}
jobs={}
for k in sorted(keys):
    t=ko(k)
    if '{0}' in t:
        for tp in topics:
            lbl=ko(f'consult_topic_{tp}') or tp
            jobs[f'{k}__{tp}']=t.replace('{0}',lbl)
    else: jobs[k]=t
for name in sorted(existing-set(jobs)):
    base=name.split('__')[0]; t=ko(base)
    if not t: continue
    tp=name.split('__')[1] if '__' in name else None
    jobs[name]=t.replace('{0}',ko(f'consult_topic_{tp}') or tp) if tp else t
print('topics',topics); print('keys',len(keys),'jobs',len(jobs),'existing',len(existing))
print('existing not regenerated:',sorted(existing-set(jobs)))
print('new files:',sorted(set(jobs)-existing))
def synth(name,text):
    req=urllib.request.Request('http://localhost:4000/api/v1/prayers/tts',data=json.dumps({'text':text,'lang':'ko'}).encode(),
        headers={'Content-Type':'application/json','Saju-Authorization':f'Bearer-{TOKEN}','User-Auth':'dev-clipgen'})
    r=json.load(urllib.request.urlopen(req,timeout=120))
    if not r.get('success'): raise RuntimeError(r)
    pcm=base64.b64decode(r['pcm_base64']); sr=int(r.get('sample_rate',24000)); ch=int(r.get('channels',1))
    with open(f'{OUT}/{name}.wav','wb') as f:
        f.write(b'RIFF'+struct.pack('<I',36+len(pcm))+b'WAVEfmt '+struct.pack('<IHHIIHH',16,1,ch,sr,sr*ch*2,ch*2,16)+b'data'+struct.pack('<I',len(pcm))+pcm)
    return name,len(pcm)/(sr*ch*2)
ONLY=[a for a in sys.argv[1:] if not a.startswith('--')]
if ONLY: jobs={k:v for k,v in jobs.items() if k.split('__')[0] in ONLY}; print('only',list(jobs))
if '--dry' in sys.argv: sys.exit()
with cf.ThreadPoolExecutor(3) as ex:
    for fut in cf.as_completed([ex.submit(synth,n,t) for n,t in jobs.items()]):
        try: n,d=fut.result(); print(f'ok {n} {d:.1f}s',flush=True)
        except Exception as e: print('FAIL',e,flush=True)
print('DONE')
