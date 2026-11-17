import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=(name)=>readFile(resolve(root,name),'utf8');

test('fresh profile is app-private metadata, isolated from Standard and server accounts',async()=>{
  const src=await read('android-demo/app/src/main/java/org/projectpokemon/offlinesandbox/OfflineSoloProfileStore.java');
  const activity=await read('android-demo/app/src/main/java/org/projectpokemon/offlinesandbox/OfflineSandboxActivity.java');
  assert.match(src,/getSharedPreferences\(PREFERENCES, Context\.MODE_PRIVATE\)/);
  assert.match(src,/offline_solo_profile_metadata_v1/);
  assert.match(src,/org\.projectpokemon\.offlinesandbox\.profile\.metadata\.v1/);
  assert.match(src,/if \(preferences\.contains\(RECORD_KEY\)\)/);
  assert.match(src,/parseStrict\(raw\)/);
  assert.match(src,/throw new IllegalStateException\("Unreadable offline profile; no reset"/);
  assert.match(src,/putString\(RECORD_KEY, serialized\)\.commit\(\)/);
  assert.match(activity,/OfflineSoloProfileStore\.openOrCreate\(this\)/);
  for(const forbidden of [
    'pokebonk.standard.profile', 'pokemonUnlocked','stardust','itemsOwned',
    'purchase','rewards', 'runSequence','importSave','unlockAll',
    'setDomStorageEnabled(true)', 'INTERNET'
  ]) {
    if(forbidden==='rewards') {
      // A comment explicitly excludes awards; the profile may not have a
      // save field or setter for them.
      assert.doesNotMatch(src,/\.put\(["']rewards["']/);
    } else if(forbidden==='INTERNET') {
      assert.doesNotMatch(src,/android\.permission\.INTERNET/);
    } else if(forbidden==='stardust'||forbidden==='purchase') {
      // Comments explaining forbidden purchases aren't persisted fields.
      assert.doesNotMatch(src,/\.put\(["'](?:stardust|purchase)["']/);
    } else {
      assert.ok(!src.includes(forbidden), 'Offline metadata must not couple to '+forbidden);
    }
  }
});

test('fresh-profile metadata has Android runtime cases for persistence and fail-closed corruption',async()=>{
  const src=await read('android-demo/app/src/androidTest/java/org/projectpokemon/offlinesandbox/OfflineSoloProfileStoreTest.java');
  const [workflow,manifest]=await Promise.all([
    read('.github/workflows/offline-android-sandbox.yml'),
    read('android-demo/app/src/main/AndroidManifest.xml')
  ]);
  assert.match(src,/freshIdentityIsStableAndContainsNoProgression/);
  assert.match(src,/corruptOrForgedProfilesFailClosedWithoutStorageWrites/);
  assert.match(src,/assertEquals\("Reopening MUST NOT overwrite prior raw profile bytes"/);
  assert.match(workflow,/assembleDebugAndroidTest/);
  assert.match(manifest,/android:allowBackup="false"/);
  assert.doesNotMatch(manifest,/<uses-permission\s/);
});
