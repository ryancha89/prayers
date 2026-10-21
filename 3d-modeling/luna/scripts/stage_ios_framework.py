"""Install the newly built simulator framework into Prayers and its local pod."""
import hashlib
import json
import shutil
from pathlib import Path
from datetime import datetime

APP = Path(__file__).resolve().parents[3]
OUT = APP/'3d-modeling/luna/output/integration'
SRC = Path('/Users/namaste/git/saju_fullstack/saju_world_unity_hall/Builds/uaal-ios-sim-derived/Build/Products/Release-iphonesimulator/UnityFramework.framework')
assert (SRC/'Data/globalgamemanagers').exists(), 'built Unity Data missing'
backup = OUT/'backups'/('framework-'+datetime.now().strftime('%Y%m%d-%H%M%S'))
backup.mkdir(parents=True)
def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
    return h.hexdigest()
hashes={str(p.relative_to(SRC)):digest(p) for p in sorted((SRC/'Data').rglob('*')) if p.is_file()}
for label, parent in [('artifact', APP/'unity/builds/ios'), ('pod', APP/'node_modules/@azesmway/react-native-unity/ios')]:
    dst=parent/'UnityFramework.framework'
    stage=parent/'UnityFramework.luna-next'
    assert not stage.exists()
    shutil.copytree(SRC,stage,symlinks=True)
    assert all(digest(stage/name)==value for name,value in hashes.items())
    if dst.exists(): dst.rename(backup/(label+'-UnityFramework.framework'))
    stage.rename(dst)
manifest={'source':str(SRC),'data_hashes':hashes,'backup':str(backup),'platform':'iOS Simulator arm64'}
(OUT/'ios-framework.json').write_text(json.dumps(manifest,indent=2))
print('STAGED_FRAMEWORK',len(hashes),'Unity Data files')
