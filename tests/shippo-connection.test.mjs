import test from 'node:test';
import assert from 'node:assert/strict';
import { shippoConnectionWords, shippoReturnWords } from '../src/account/shippoConnection.js';

test('authorization recovery shows the existing grant instead of inviting another signup', () => {
  for (const stage of ['processing', 'verifying']) {
    const words = shippoConnectionWords({status:'PENDING',detail:{oauthStage:stage}});
    assert.equal(words.canAuthorize,false);
    assert.equal(words.canCheck,true);
    assert.match(words.label,/processing|verifying/);
    assert.match(words.needs,/Check the connection again/i);
  }
});
test('connected account uses provider-verified identity and preserves a later read warning', () => {
  const words=shippoConnectionWords({status:'ACTIVE',lastError:'Shippo temporarily unavailable. Check again.',detail:{identityVerified:true,shippoAccountEmail:'different+owner@example.test',shippoAccountId:'merchant-1',carrierAccounts:14}});
  assert.equal(words.label,'connected');
  assert.match(words.identity,/different\+owner@example.test/);
  assert.match(words.needs,/temporarily unavailable/);
  assert.equal(words.canAuthorize,false);
});
test('a historical active row does not pretend a carrier list establishes the account identity', () => {
  const words=shippoConnectionWords({status:'ACTIVE',detail:{carrierAccounts:12,shippoAccountEmail:'unverified@example.test'}});
  assert.match(words.identity,/has not been verified/);
  assert.doesNotMatch(words.identity,/unverified@example/);
  assert.match(words.needs,/which Shippo account/);
});
test('provider error and diagnostic remain visible after return',()=>{
  const words=shippoConnectionWords({status:'PENDING',lastError:'Shippo rejected the authorization code.',detail:{oauthStage:'failed',oauthErrorCode:'invalid_grant',oauthHttpStatus:400}});
  assert.match(words.needs,/rejected.*invalid_grant.*400/);
  assert.equal(words.label,'authorization failed');
  assert.match(shippoReturnWords('failed'),/retains the diagnostic/);
  assert.match(shippoReturnWords('processing'),/still being processed/);
});
test('a successful retry still explains the earlier provider failure',()=>{
 const words=shippoConnectionWords({status:'ACTIVE',detail:{identityVerified:true,shippoAccountEmail:'owner@example.test',authorizedAt:'2026-11-28T04:46:08Z',lastAuthorizationFailure:{at:'2026-11-28T04:45:46Z',stage:'exchange',code:'invalid_grant',httpStatus:400}}});
 assert.equal(words.label,'connected');assert.match(words.needs,/Earlier authorization attempt: invalid_grant \(HTTP 400\).*later authorization completed successfully/);
});
