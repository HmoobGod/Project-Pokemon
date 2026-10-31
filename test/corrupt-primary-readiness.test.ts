import test from 'node:test';
import assert from 'node:assert/strict';
import {assessCorruptPrimaryReadiness} from '../src/corrupt-primary-readiness.ts';

test('corrupt-primary preview exported for testing',()=>{
  assert.equal(typeof assessCorruptPrimaryReadiness,'function');
});
