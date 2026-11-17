import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const file=(name)=>readFile(resolve(root,name),'utf8');

test('Android demo manifest declares a distinct app ID and zero network permissions',async()=>{
 const [manifest,gradle]=await Promise.all([
  file('android-demo/app/src/main/AndroidManifest.xml'),
  file('android-demo/app/build.gradle')]);
 assert.match(gradle,/applicationId 'org\.projectpokemon\.offlinesandbox'/);
 assert.match(gradle,/assets\.srcDirs \+= \[file\('\.\.\/\.\.\/offline-sandbox'\)\]/);
 assert.doesNotMatch(manifest,/<uses-permission\b/);
 assert.match(manifest,/android:usesCleartextTraffic="false"/);
 assert.match(manifest,/android:allowBackup="false"/);
 assert.doesNotMatch(manifest,/pokebonk\.com/i);
});

test('Android WebView permits only packaged assets; disables remote access and storage',async()=>{
 const java=await file('android-demo/app/src/main/java/org/projectpokemon/offlinesandbox/OfflineSandboxActivity.java');
 for(const required of [
  'WebViewAssetLoader','appassets.androidplatform.net','setBlockNetworkLoads(true)',
  'setJavaScriptEnabled(true)','setDomStorageEnabled(false)','setDatabaseEnabled(false)',
  'setAllowFileAccess(false)','setAllowContentAccess(false)',
  'setAllowUniversalAccessFromFileURLs(false)','setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW)',
  'setWebContentsDebuggingEnabled(false)','setHttpAllowed(false)',
  'shouldInterceptRequest','denied(403','setCacheMode(WebSettings.LOAD_NO_CACHE)'
 ])assert.ok(java.includes(required),required);
 assert.doesNotMatch(java,/pokebonk\\.com|api\\.pokebonk\\.com/i);
 assert.doesNotMatch(java,/(?:loadUrl|postUrl)\(\s*["']https?:\/\/(?:pokebonk\.com|api\.)/);
});

test('APK CI must check exact asset bytes, no network permission, and never publish a release',async()=>{
 const workflow=await file('.github/workflows/offline-android-sandbox.yml');
 assert.match(workflow,/assembleDebug/);
 assert.match(workflow,/sha256sum/);
 assert.match(workflow,/zipfile/);
 assert.match(workflow,/android\.permission\.\(INTERNET\|ACCESS_NETWORK_STATE\)/);
 assert.match(workflow,/UNVERIFIED-offline-sandbox-debug/);
 assert.match(workflow,/Render local sandbox in real headless Chromium/);
 assert.doesNotMatch(workflow,/softprops\/action-gh-release|github\.ref_name|assembleRelease/);
});
