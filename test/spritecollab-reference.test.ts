import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SPRITECOLLAB_REVISION, SPRITECOLLAB_REPOSITORY,
  SPRITECOLLAB_REFERENCE_EXAMPLES, spriteCollabReference,
  parseSpriteCollabCredits, assessSpriteCollabRights,
} from '../src/spritecollab-reference.ts';

test('reference URLs pin one SpriteCollab revision and never expose asset download URLs',()=>{
  assert.equal(SPRITECOLLAB_REPOSITORY,'PMDCollab/SpriteCollab');
  assert.match(SPRITECOLLAB_REVISION,/^[a-f0-9]{40}$/);
  for(const {kind,folder} of SPRITECOLLAB_REFERENCE_EXAMPLES) {
    const link=spriteCollabReference(kind,folder);
    assert.equal(link.numericFolder,String(folder).padStart(4,'0'));
    assert.equal(link.sourcePath,`${kind}/${link.numericFolder}`);
    assert.equal(link.creditsPath,`${link.sourcePath}/credits.txt`);
    assert.ok(link.creditsUrl.includes(SPRITECOLLAB_REVISION));
    assert.ok(link.sourceTreeUrl.includes(SPRITECOLLAB_REVISION));
    assert.equal(link.allowedToBundle,false);
    assert.ok(!Object.keys(link).some(k=>/download|binary|png/i.test(k)));
  }
  for(const folder of [-1,1.5,1e30,NaN,Infinity,10000])
    assert.throws(()=>spriteCollabReference('sprite',folder),/Invalid/);
  assert.throws(()=>spriteCollabReference('other' as never,1),/Invalid/);
});

test('actual historical Chunsoft sprite rows remain explicitly restricted',()=>{
  const rows=parseSpriteCollabCredits(
    '2020-10-07 17:58:43.323442\tCHUNSOFT\tCUR\tUnspecified\tWalk,Attack,Idle\n');
  assert.deepEqual(rows[0].actions,['Walk','Attack','Idle']);
  const a=assessSpriteCollabRights(rows,'Walk');
  assert.equal(a.finding,'official-restricted');
  assert.deepEqual(a.currentContributors,['CHUNSOFT']);
  assert.equal(a.allowedToBundle,false);
});

test('old community credits never grant current access and current noncommercial credits are only candidates',()=>{
  const records=parseSpriteCollabCredits(
    '2021-08-12 01:50:44.092609\t<@!237286997645983744>\tOLD\tPMDCollab_1\tNormal,Happy\n'+
    '2025-03-29 06:00:59.179867\t<@!544245909639397378>\tCUR\tCC_BY-NC_4\tSpecial1,Special0\n'+
    '2022-02-03 17:33:26.842985\tCHUNSOFT\tCUR\tUnspecified\tNormal\n');
  assert.equal(assessSpriteCollabRights(records,'Normal').finding,'official-restricted');
  assert.equal(assessSpriteCollabRights(records,'Happy').finding,'missing-current-credit');
  const c=assessSpriteCollabRights(records,'Special0');
  assert.equal(c.finding,'community-noncommercial-candidate');
  assert.deepEqual(c.currentContributors,['<@!544245909639397378>']);
  assert.equal(c.allowedToBundle,false);
  assert.equal(assessSpriteCollabRights(records,'Unknown').finding,'missing-current-credit');
});

test('mixed official and custom current credits are restricted; unknown licenses fail closed',()=>{
  const mix=parseSpriteCollabCredits(
    '2024-07-13 01:07:42.692884\tCHUNSOFT\tCUR\tCC_BY-NC_4\tNormal\n'+
    '2024-07-13 01:28:34.177412\tArtist2\tCUR\tCC_BY-NC_4\tNormal,Happy\n');
  assert.equal(assessSpriteCollabRights(mix,'Normal').finding,'official-restricted');
  assert.equal(assessSpriteCollabRights(mix,'Happy').finding,'community-noncommercial-candidate');
  const unknown=parseSpriteCollabCredits(
    '2022-04-14 00:56:01.712419\tArtist3\tCUR\tPMDCollab_1\tAttack,Walk\n');
  assert.equal(assessSpriteCollabRights(unknown,'Attack').finding,'license-unverified');
  assert.equal(assessSpriteCollabRights(unknown,'Attack').allowedToBundle,false);
});

test('parser rejects malformed/ambiguous metadata and never accepts untrusted file paths',()=>{
  const failures=['not-a-row',
    '2020-10-07 17:58:43\tArtist\tCUR\tCC_BY-NC_4',
    '2020-10-07 17:58:43\tArtist\tNEW\tCC_BY-NC_4\tIdle',
    '2020-10-07 17:58:43\t\tCUR\tCC_BY-NC_4\tIdle',
    '2020-10-07 17:58:43\tArtist\tCUR\tCC_BY-NC_4\t../../evil',
    '2020-10-07 17:58:43\tArtist\tCUR\tCC_BY-NC_4\tWalk,',
    '2020-10-07 17:58:43\tArtist\tCUR\tCC_BY-NC_4\tWalk\textra'];
  for(const s of failures)assert.throws(()=>parseSpriteCollabCredits(s),/Malformed|Invalid/);
  assert.throws(()=>assessSpriteCollabRights([], '../evil'),/Invalid/);
  assert.deepEqual(parseSpriteCollabCredits(''),[]);
});
