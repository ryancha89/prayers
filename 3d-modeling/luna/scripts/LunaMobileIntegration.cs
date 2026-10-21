// Copy to the companion Unity project's Assets/Editor, then run Apply.
// Updates existing Luna instances in place; never rebuilds the train or room.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using Object = UnityEngine.Object;

namespace SajuWorld.EditorTools
{
    public static class LunaMobileIntegration
    {
        [Serializable] public class Check { public string location; public int renderers, triangles, materialSlots, bones; }
        [Serializable] public class Report { public string revision = "continuous crown hair v2"; public List<Check> checks = new List<Check>(); public bool passed; }
        static readonly string[] Expected = { "Body_Geo", "Face_Geo", "Mouth_Geo", "EBrows_Geo", "CO_Hair_Long", "CO_Mobile_Cloth", "CO_Mobile_Jewelry", "CO_Mobile_Sheer" };
        static void Require(bool condition, string message) { if (!condition) throw new Exception("[LunaMobile] " + message); }

        public static void Apply()
        {
            var report = new Report();
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
            LunaImporter.ConfigureImport();
            LunaImporter.BuildPrefab();
            var prefab = PrefabUtility.LoadPrefabContents(LunaImporter.PrefabPath);
            try { report.checks.Add(CheckModel(prefab.GetComponentInChildren<Animator>(true).gameObject, "Npc_luna.prefab")); }
            finally { PrefabUtility.UnloadPrefabContents(prefab); }

            foreach (var path in new[] { LunaImporter.RoomPath, "Assets/Scenes/TrainJourney.unity" })
            {
                var scene = EditorSceneManager.OpenScene(path, OpenSceneMode.Single);
                var all = scene.GetRootGameObjects().SelectMany(r => r.GetComponentsInChildren<Transform>(true)).ToArray();
                var names = path == LunaImporter.RoomPath ? new[] { "Npc_luna" } : new[] { "Npc_luna", "Npc_luna_Platform" };
                foreach (string name in names)
                {
                    var npc = all.Single(t => t.name == name).gameObject;
                    var anim = npc.GetComponentInChildren<Animator>(true);
                    Require(anim != null, name + " missing Animator");
                    var controller = anim.runtimeAnimatorController;
                    var pos = npc.transform.localPosition;
                    var rot = npc.transform.localRotation;
                    var scale = npc.transform.localScale;
                    var active = npc.activeSelf;
                    LunaImporter.Dress(anim.gameObject);
                    if (path.Contains("TrainJourney"))
                    {
                        typeof(TrainJourneyBuilder).GetMethod("TrainSkin", BindingFlags.Static | BindingFlags.NonPublic)
                            .Invoke(null, new object[] { npc, LunaImporter.PersonaId });
                        typeof(LunaImporter).GetMethod("TrainMetals", BindingFlags.Static | BindingFlags.NonPublic)
                            .Invoke(null, new object[] { npc });
                    }
                    Require(anim.runtimeAnimatorController == controller && npc.activeSelf == active &&
                        npc.transform.localPosition == pos && npc.transform.localRotation == rot && npc.transform.localScale == scale,
                        name + " transform, visibility or controller changed");
                    report.checks.Add(CheckModel(anim.gameObject, path + "/" + name));
                    if (PrefabUtility.IsPartOfPrefabInstance(npc))
                        foreach (var r in npc.GetComponentsInChildren<Renderer>(true))
                            PrefabUtility.RecordPrefabInstancePropertyModifications(r);
                }
                EditorSceneManager.MarkSceneDirty(scene);
                Require(EditorSceneManager.SaveScene(scene), "save failed: " + path);
            }
            AssetDatabase.SaveAssets();
            Require(EmbeddedExportBuilder.ExportedScenePaths().Contains(LunaImporter.RoomPath), "room 4 not in app export");
            report.passed = true;
            string folder = Environment.GetEnvironmentVariable("LUNA_INTEGRATION_REPORT");
            Require(!string.IsNullOrEmpty(folder), "report folder required");
            Directory.CreateDirectory(folder);
            File.WriteAllText(Path.Combine(folder, "unity-integration.json"), JsonUtility.ToJson(report, true));
            Environment.SetEnvironmentVariable("LUNA_SHOTS", Path.Combine(folder, "previews"));
            LunaTempleBuilder.Shoot();
            Debug.Log("[LunaMobile] PASS: prefab + room + train seat + platform updated in place");
        }

        static Check CheckModel(GameObject body, string location)
        {
            var renderers = body.GetComponentsInChildren<SkinnedMeshRenderer>(true)
                .Where(r => r.enabled && r.gameObject.activeSelf).ToArray();
            Require(renderers.Select(r => r.name).OrderBy(n => n).SequenceEqual(Expected.OrderBy(n => n)), location + " unexpected renderers");
            int triangles = 0, slots = 0;
            foreach (var r in renderers)
            {
                Require(r.sharedMesh != null && AssetDatabase.GetAssetPath(r.sharedMesh) == LunaImporter.ModelPath, location + "/" + r.name + " stale mesh");
                Require(r.bones.Length > 0 && r.bones.All(b => b != null) && r.rootBone != null, location + "/" + r.name + " unmapped bones");
                Require(r.sharedMaterials.All(m => m != null && m.shader != null && m.shader.name != "Hidden/InternalErrorShader"), location + " missing material");
                for (int i = 0; i < r.sharedMesh.subMeshCount; i++) triangles += (int)r.sharedMesh.GetIndexCount(i) / 3;
                slots += r.sharedMaterials.Length;
            }
            Require(triangles == 43729, location + " unexpected triangle count: " + triangles);
            var hair = renderers.Single(r => r.name == "CO_Hair_Long").sharedMaterial;
            foreach (string property in new[] { "_NormalTex", "_MaskTex" })
                Require(!hair.HasProperty(property) || hair.GetTexture(property) == null, location + " stale hair atlas map: " + property);
            Require(hair.GetTexture("_BaseMap") != null, location + " missing hair atlas");
            return new Check { location = location, renderers = renderers.Length, triangles = triangles,
                materialSlots = slots, bones = renderers.SelectMany(r => r.bones).Distinct().Count() };
        }
    }
}
