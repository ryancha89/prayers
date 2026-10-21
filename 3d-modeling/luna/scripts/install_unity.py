"""Stage the verified Luna package into the existing companion Unity project.

External-project writes require the command's filesystem approval. Preserve all
existing .meta GUIDs and back up the exact pre-existing working files first.
"""
import hashlib
import json
import shutil
from pathlib import Path
from datetime import datetime

HERE = Path(__file__).resolve().parents[1]
PROJECT = Path('/Users/namaste/git/saju_fullstack/saju_world_unity_hall')
OUT = HERE / 'output/mobile'
ROOT = Path('Assets/Art/1.character/f_char_luna')
verification = json.loads((OUT/'verification.json').read_text())
assert verification['passed']
for file, digest in verification['artifact_hashes'].items():
    assert hashlib.sha256((OUT/file).read_bytes()).hexdigest() == digest, file
backup = HERE/'output/integration/backups'/datetime.now().strftime('%Y%m%d-%H%M%S')
paths = [ROOT, Path('Assets/Editor/LunaImporter.cs'), Path('Assets/Editor/LunaMobileIntegration.cs'),
         Path('Assets/Scenes/ConsultationSolo04.unity'), Path('Assets/Scenes/TrainJourney.unity'),
         Path('Assets/Art/2.environment/trainjourney/Materials/Counsellors')]
for rel in paths:
    src = PROJECT/rel
    if not src.exists(): continue
    dst = backup/rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    if src.is_dir(): shutil.copytree(src, dst)
    else: shutil.copy2(src, dst)
shutil.copy2(OUT/'Luna_Avatar.fbx', PROJECT/ROOT/'0.model/Luna_Avatar.fbx')
for texture in (OUT/'textures').glob('*.png'):
    shutil.copy2(texture, PROJECT/ROOT/'1.textures'/texture.name)
importer = PROJECT/'Assets/Editor/LunaImporter.cs'
code = importer.read_text()
old = 'm => Stylized(m, Tex("CO_Hair_Brown_BaseColor.png"), Color.white, keepMaps: true)'
new = 'm => { Stylized(m, Tex("CO_Hair_Brown_BaseColor.png"), Color.white); WarmHair(m); if (m.HasProperty("_SpecIntensity")) m.SetFloat("_SpecIntensity", 0f); }'
assert old in code or new in code, 'hair setup changed; inspect before patching'
importer.write_text(code.replace(old, new))
shutil.copy2(HERE/'scripts/LunaMobileIntegration.cs', PROJECT/'Assets/Editor/LunaMobileIntegration.cs')
manifest = {'project': str(PROJECT), 'backup': str(backup), 'artifact_hashes': verification['artifact_hashes']}
(HERE/'output/integration/staging.json').write_text(json.dumps(manifest, indent=2))
print('STAGED', json.dumps(manifest, ensure_ascii=False))
