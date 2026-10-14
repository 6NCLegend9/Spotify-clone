"""Isolated stateless adapter checks; in-memory private storage, no upstream calls."""
import asyncio
import inspect
import json
import os
import sys
import time
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'media-service'))
os.environ.update(JWT_SECRET='isolated-signing-secret-' * 3, BLOB_READ_WRITE_TOKEN='isolated-storage-token')
from vercel.blob import AsyncBlobClient
# Check the actual pinned SDK accepts every argument used by the adapter.
for name in ('put', 'get', 'list_objects', 'delete'):
    assert hasattr(AsyncBlobClient, name), name
inspect.signature(AsyncBlobClient.put).bind(None, 'path', b'bytes', access='private', content_type='audio/mp4', add_random_suffix=False, multipart=True)
inspect.signature(AsyncBlobClient.get).bind(None, 'path', access='private')
inspect.signature(AsyncBlobClient.list_objects).bind(None, prefix='path/', limit=1000)
inspect.signature(AsyncBlobClient.delete).bind(None, ['path'])
import httpx
from app import vercel_app as media
from app.jobs import JobManager

objects = {}
calls = []
class Blob:
    async def list_objects(self, **kwargs):
        return SimpleNamespace(blobs=[SimpleNamespace(pathname=p) for p in sorted(objects) if p.startswith(kwargs['prefix'])],has_more=False)
    async def delete(self, paths):
        for path in paths: objects.pop(path, None)
    async def put(self, path, data, **kwargs):
        assert kwargs['access'] == 'private'
        objects[path] = data
        return SimpleNamespace(pathname=path,url='https://isolated.private.blob.vercel-storage.com/'+path)
    async def get(self, path, **kwargs):
        calls.append(path)
        if path not in objects: return None
        async def chunks(): yield objects[path]
        return SimpleNamespace(status_code=200,stream=chunks())
media.AsyncBlobClient = Blob
async def prepare(self, job):
    path = job['directory'] / 'asset.mp4'
    path.write_bytes(b'bounded-audio-fixture')
    job.update(state='ready',qualities=[],asset={'id':'a'*32,'path':path,'size':path.stat().st_size,'descriptor':{'mimeType':'audio/mp4','duration':2,'codec':'aac','audioBitrateKbps':128,'height':None}})
JobManager.prepare = prepare

async def main():
    headers={'Authorization':'Bearer '+media.API_KEY,'X-Media-Subscriber':'a'*64,'X-Media-Public-Origin':'https://preview.example.test'}
    payload={'videoId':'abcdefghijk','mode':'audio','profile':'mp4-aac','maxHeight':1080}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=media.app),base_url='https://preview.example.test') as client:
        assert (await client.post('/v1/jobs',json=payload)).status_code == 401
        assert (await client.post('/v1/jobs',content=b'x'*4097,headers=headers)).status_code == 413
        assert (await client.post('/v1/jobs',json={**payload,'videoId':'<script>'},headers=headers)).status_code == 422
        assert (await client.post('/v1/jobs',json=payload,headers={**headers,'X-Media-Public-Origin':'javascript:alert(1)'})).status_code == 400
        response=await client.post('/v1/jobs',json=payload,headers=headers)
        assert response.status_code == 200, response.text
        value=response.json();job=value['jobId']
        assert value['state']=='ready' and value['asset']['url'].startswith('https://preview.example.test/v1/assets/')
        assert len(objects)==2
        # There is no persistent manager on the app: a new storage client reads
        # completed jobs and renews signed leases without original local files.
        assert not hasattr(media.app.state,'manager')
        assert (await client.get('/v1/jobs/'+job,headers=headers)).json()['state']=='ready'
        assert (await client.post('/v1/jobs/'+job+'/renew',headers=headers)).status_code==200
        assert (await client.get('/v1/jobs/'+job,headers={**headers,'X-Media-Subscriber':'b'*64})).status_code==404
        asset=urlsplit(value['asset']['url']); signed=asset.path+'?'+asset.query
        before=len(calls)
        assert (await client.get(asset.path+'?expires=1&signature='+'0'*64)).status_code==403
        assert len(calls)==before, 'invalid lease touched private storage'
        head=await client.head(signed,headers={'Range':'bytes=2-5'})
        assert head.status_code==206 and head.headers['content-length']=='4' and head.content==b''
        assert (await client.head(signed,headers={'Range':'bytes=999-'})).status_code==416
        assert (await client.head(signed,headers={'Range':'bytes=0-1,4-5'})).status_code==416
        assert (await client.head(signed,headers={'Range':'bytes=-0'})).status_code==416
        assert (await client.head(signed,headers={'Range':'bytes='+'9'*10001+'-'})).status_code==416
        assert (await client.delete('/v1/jobs/'+job,headers={**headers,'X-Media-Subscriber':'b'*64})).status_code==404
        assert (await client.delete('/v1/jobs/'+job,headers=headers)).status_code==200
        assert not objects
        assert (await client.head(signed)).status_code==404
    stale=f'{int(time.time()-media.TTL-1):08x}'+'c'*24
    objects[media.paths(stale)[0]]=b'expired'
    objects['unrelated/customer-file']=b'keep'
    await media.cleanup(Blob())
    assert objects=={'unrelated/customer-file':b'keep'}
    assert media.byte_range('bytes=-4',20)==(16,19,206)
    assert media.byte_range('bytes=4-',20)==(4,19,206)
    print('PASS: actual SDK signatures, private uploads, completed request-scoped jobs, cross-instance poll/renew, account isolation, signed lease rejection before storage, HEAD/ranges, malformed bodies, cancellation, bounded TTL cleanup')
asyncio.run(main())
