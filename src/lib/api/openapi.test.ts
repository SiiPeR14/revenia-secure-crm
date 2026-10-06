import {test} from 'node:test';
import assert from 'node:assert/strict';
import {openapi} from './openapi.ts';

test('OpenAPI contract exposes the private CRM surface with consistent error responses',()=>{
  assert.equal(openapi.openapi,'3.1.0');
  const paths=openapi.paths as Record<string,Record<string,unknown>>;
  assert.deepEqual(Object.keys(paths).sort(),[
    '/api/v1/clients','/api/v1/clients/{id}','/api/v1/tasks','/api/v1/tasks/{id}',
  ].sort());
  for(const methods of Object.values(paths)){
    for(const operation of Object.values(methods) as Array<Record<string,unknown>>){
      assert.ok(typeof operation.operationId==='string');
      assert.deepEqual(operation.security,[{sessionCookie:[]}]);
      const responses=operation.responses as Record<string,unknown>;
      for(const status of ['400','401','403','409','429','503'])assert.ok(responses[status],`${operation.operationId} lacks ${status}`);
    }
  }
  const schemes=(openapi.components as {securitySchemes:Record<string,Record<string,string>>}).securitySchemes;
  assert.deepEqual(schemes.sessionCookie,{type:'apiKey',in:'cookie',name:'revenia_session'});
});
