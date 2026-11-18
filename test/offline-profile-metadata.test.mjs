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
  assert.match(src,/existing\.size\(\) != 1/);
  assert.match(src,/existing\.containsKey\(RECORD_KEY\)/);
  assert.match(src,/Unknown offline profile slots; no reset/);
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
  assert.match(src,/persistedCorruptionNeverRewritesRawBytesInDisposableFixture/);
  assert.match(src,/unexpectedPrivateKeysNeverCreateOrRewriteIdentity/);
  assert.match(src,/offline_unknown_key_test_/);
  assert.match(src,/offline_solo_test_fixture_/);
  assert.match(src,/deleteSharedPreferences\(fixtureName\)/);
  assert.match(src,/assertEquals\("Reopening MUST NOT overwrite prior raw profile bytes"/);
  assert.match(workflow,/assembleDebugAndroidTest/);
  const emulatorWorkflow=await read('.github/workflows/offline-android-emulator.yml');
  for(const testcase of [
    'realAndroidWebViewLoadsAndRunsEntirelyOffline',
    'freshIdentityIsStableAndContainsNoProgression',
    'corruptOrForgedProfilesFailClosedWithoutStorageWrites',
    'persistedCorruptionNeverRewritesRawBytesInDisposableFixture',
    'unexpectedPrivateKeysNeverCreateOrRewriteIdentity'
  ]) {
    assert.ok(emulatorWorkflow.includes(testcase),
      'Real emulator XML gate must require '+testcase);
  }
  assert.match(emulatorWorkflow,/Duplicate AndroidJUnit testcase/);
  assert.match(emulatorWorkflow,/Expected exactly 5 Android tests/);
  assert.ok(emulatorWorkflow.includes('python3 android-demo/ci/verify_profile_restart.py'));
  const restart=await read('android-demo/ci/verify_profile_restart.py');
  for(const expected of [
    'org.projectpokemon.offlinesandbox',
    'offline_solo_profile_metadata_v1.xml',
    '"force-stop", PACKAGE',
    'assert first_raw == second_raw',
    'check_airplane_mode()'
  ]) assert.ok(restart.includes(expected), 'Missing restart safety gate: '+expected);
  for(const forbidden of [
    'pm clear','deleteSharedPreferences','pokebonk.standard',
    'android.permission.INTERNET'
  ]) assert.ok(!restart.includes(forbidden), 'Unsafe restart script content: '+forbidden);

  assert.match(emulatorWorkflow,/root\.attrib\.get\('skipped', -1\)/);

  assert.match(manifest,/android:allowBackup="false"/);
  assert.doesNotMatch(manifest,/<uses-permission\s/);
});
