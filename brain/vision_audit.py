"""Offline matched-state counterfactuals. No market or wallet access."""
import copy,hashlib,io,json,sys,time
from pathlib import Path
import numpy as np
from PIL import Image
REPO=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(REPO/'brain'))
from kernel import Brain
from sensory import frame_to_drive
import display
out=REPO/'brain/runs/vision-audit';out.mkdir(parents=True,exist_ok=True)
pops=json.loads((REPO/'brain/populations.json').read_text())['populations']
cal=json.loads((REPO/'brain/calibration.json').read_text())
b=Brain(bg=cal['bg'],noise_sigma=cal['noise_sigma'])
def ix(name,side=None):
 d=pops[name]['bodyIds'];return b.idx(d.get(side,[]) if side else [v for vs in d.values() for v in vs])
r16,r78=ix('R1_R6'),ix('R7_R8')
watch={'left':ix('DNp20','L'),'right':ix('DNp20','R'),'gate':ix('DNpe017'),'retina':r16,'kc':ix('KC')}
up=np.linspace(1,1.15,80).tolist(); rng=np.random.default_rng(919)
frames={'rising':display.market_frame('CONTROL',up), 'repeat':display.market_frame('CONTROL',up), 'reversed':display.market_frame('CONTROL',up[::-1]), 'flat':display.market_frame('CONTROL',[1]*80), 'shuffled':display.market_frame('CONTROL',rng.permutation(up).tolist()), 'label_only':display.market_frame('ANOTHER',up), 'blank':np.full((180,320,3),255,dtype=np.uint8)}
hashes={}
for name,img in frames.items():
 buf=io.BytesIO();Image.fromarray(img).save(buf,format='PNG');raw=buf.getvalue();hashes[name]=hashlib.sha256(raw).hexdigest();(out/f'{name}.png').write_bytes(raw)
arrays=['v','syn','refrac','ext','spike_counts','_noise']
rows=[];started=time.time()
for seed in range(5):
 # Exact same noise trajectory and settled dynamical state for every image within a seed.
 b.v.fill(-52);b.syn.fill(0);b.refrac.fill(0);b.ext.fill(0);b.spike_counts.fill(0);b._noise.fill(0);b._step_i=0;b.rng=np.random.default_rng(seed)
 b.run_ms(200,{})
 snap={k:getattr(b,k).copy() for k in arrays};step=b._step_i;rngstate=copy.deepcopy(b.rng.bit_generator.state)
 for name,img in frames.items():
  for k,value in snap.items():getattr(b,k)[:]=value
  b._step_i=step;b.rng.bit_generator.state=copy.deepcopy(rngstate)
  d16,d78=frame_to_drive(img,len(r16),len(r78));b.ext.fill(0);b.ext[r16]=d16;b.ext[r78]=d78
  t=time.time();c=b.run_ms(500,watch)
  left=c['left']/max(1,len(watch['left']))/.5;right=c['right']/max(1,len(watch['right']))/.5
  row={'seed':seed,'condition':name,'rateL':left,'rateR':right,'diffHz':right-left,'gateSpikes':c['gate'],'retinalSpikes':c['retina'],'kcSpikes':c['kc'],'totalSpikes':c['_total'],'seconds':round(time.time()-t,3)}
  rows.append(row);(out/'progress.json').write_text(json.dumps(rows,indent=2));print(json.dumps(row),flush=True)
paired={name:[next(r['diffHz'] for r in rows if r['seed']==s and r['condition']==name)-next(r['diffHz'] for r in rows if r['seed']==s and r['condition']=='rising') for s in range(5)] for name in frames if name!='rising'}
repeat_ok=all(x==0 for x in paired['repeat'])
result={'schemaVersion':1,'protocol':'matched full dynamical state and RNG; 200ms common settling; 500ms observations; five independent seeds','mapping':'engineered flattened luminance/channel map, not anatomical retinotopy','decoder':'raw DNp20 R-L; deployed EMA needs a separate sequence-level validation','frameHashes':hashes,'calibration':{'bg':cal['bg'],'noise_sigma':cal['noise_sigma']},'sourceHashes':{f:hashlib.sha256((REPO/'brain'/f).read_bytes()).hexdigest() for f in ['kernel.py','sensory.py','populations.json','calibration.json']},'displayHash':hashlib.sha256((REPO/'brain/display.py').read_bytes()).hexdigest(),'pairedDiffHz':paired,'repeatExact':repeat_ok,'rows':rows,'elapsedSeconds':round(time.time()-started,2),'claim':'Pilot only. A nonzero effect is not evidence of chart understanding, attention, learning, or profitability. No release pass is inferred from this exploratory test.'}
(out/'report.json').write_text(json.dumps(result,indent=2));print('AUDIT_COMPLETE',flush=True)
