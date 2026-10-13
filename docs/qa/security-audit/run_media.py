"""ASGI fuzzing and local subprocess checks; no listening socket or external calls."""
import asyncio
import json
import os
import sys
import tempfile
import time
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'media-service'))
results = []

async def check(name, action):
    start = time.perf_counter()
    try:
        value = await asyncio.wait_for(action(), 3)
        results.append({'name': name, 'observation': value, 'ms': round((time.perf_counter()-start)*1000, 2)})
    except Exception as exc:
        results.append({'name': name, 'error': type(exc).__name__ + ': ' + str(exc)[:180]})

async def main():
    with tempfile.TemporaryDirectory(prefix='haykasa-media-audit-') as temporary:
        os.environ.update(MEDIA_API_KEY='AUDIT_API_KEY_'*4, MEDIA_LEASE_SECRET='AUDIT_LEASE_KEY_'*4, MEDIA_CACHE_DIR=temporary)
        from app.main import app, config, subscriber, manager
        from app.jobs import JobManager
        import app.assets as asset_module
        from app.assets import deliver, signature
        from fastapi.responses import StreamingResponse as FrameworkStreamingResponse
        class InlineStreamingResponse(FrameworkStreamingResponse):
            def __init__(self, content, *args, **kwargs):
                async def inline_chunks():
                    for chunk in content:
                        yield chunk
                super().__init__(inline_chunks(), *args, **kwargs)
        # Keep actual delivery logic, but avoid sandbox-blocked thread wakeups.
        asset_module.StreamingResponse = InlineStreamingResponse
        from app.models import ResolveRequest
        from app.processes import run_tool
        import httpx
        from starlette.requests import Request
        config.file_limit = 4096
        config.disk_limit = 65536
        config.workers = 2
        config.queue_size = 3
        jobs = JobManager(config)
        event = asyncio.Event()
        async def blocked_prepare(job):
            try:
                await event.wait()
            except asyncio.CancelledError:
                job.update(state='failed',reason='cancelled')
                raise
        jobs.prepare = blocked_prepare
        app.state.manager = jobs
        # Run the actual synchronous dependency functions inline. This sandbox
        # blocks the worker-thread event-loop wakeup used by ASGI TestClient.
        from fastapi import Header
        async def local_subscriber(authorization: str = Header(default=""), x_media_subscriber: str = Header(default="")):
            return subscriber(authorization, x_media_subscriber)
        async def local_manager():
            return jobs
        app.dependency_overrides[subscriber] = local_subscriber
        app.dependency_overrides[manager] = local_manager
        auth = {'Authorization':'Bearer '+config.api_key,'X-Media-Subscriber':'a'*64}
        valid = {'videoId':'dQw4w9WgXcQ','mode':'audio','maxHeight':1080,'profile':'webm-opus'}
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app,raise_app_exceptions=False),base_url='http://sandbox.invalid') as client:
            async def post(payload, headers=None):
                response=await client.post('/v1/jobs',content=payload,headers={**auth,'Content-Type':'application/json',**(headers or {})})
                try:
                    body=response.json()
                    if response.status_code == 422:
                        body={'errorCount':len(body.get('errors',body.get('detail',[]))),'echoBytes':len(response.content)}
                except ValueError:
                    body=response.text[:150]
                return {'status':response.status_code,'body':body}
            cases=[b'',b'{',b'null',b'[]',b'true',b'{"videoId":NaN}',json.dumps(valid).encode()]
            values=[None,'','   ','\u0000',-1,1.5,10**100,'1e309',"' OR 1=1 --",'<script>alert(1)</script>','😀'*3000,'A'*10001,{'$ne':None},['x']]
            for field in valid:
                for value in values:
                    cases.append(json.dumps({**valid,field:value}).encode())
            for i,payload in enumerate(cases):
                await check('job-payload:'+str(i),lambda p=payload:post(p))
            await check('jobs-oversize-correct-length',lambda:post(json.dumps({**valid,'padding':'A'*10000})))
            await check('jobs-oversize-forged-length',lambda:post(json.dumps({**valid,'padding':'A'*(1024*1024)}),{'Content-Length':'1'}))
            async def oversized_chunks():
                yield b'A'*3000
                yield b'A'*3000
            await check('jobs-chunked-oversize',lambda:post(oversized_chunks()))
            await check('jobs-small-validation-error',lambda:post(json.dumps({**valid,'padding':'A'*3000})))
            await check('jobs-overflow-content-length',lambda:post(json.dumps(valid),{'Content-Length':'9'*5000}))
            await check('jobs-negative-content-length',lambda:post(json.dumps(valid),{'Content-Length':'-1'}))
            async def invalid_auth():
                response=await client.post('/v1/jobs',json=valid,headers={'Authorization':'Bearer INVALID'})
                return {'status':response.status_code}
            await check('unauthorized-job',invalid_auth)
            for value in ['','bytes=','bytes=-0','bytes=9-2','bytes=100000-','bytes=0-1,3-4','bytes=0-1','bytes=-3','bytes=0-','bytes='+'9'*5000+'-']:
                asset_id='b'*32
                file=Path(temporary)/'audit.webm'
                file.write_bytes(b'0123456789')
                expiry=int(time.time())+60
                jobs.assets[asset_id]={'id':asset_id,'path':file,'descriptor':{'mimeType':'audio/webm'}}
                async def get_asset(range_value=value):
                    response=await client.get('/v1/assets/'+asset_id,params={'expires':expiry,'signature':signature(config.lease_key,asset_id,expiry)},headers={'Range':range_value} if range_value else {})
                    return {'status':response.status_code,'bodyLength':len(response.content),'contentRange':response.headers.get('content-range')}
                await check('range:'+value[:60],get_asset)
            for token,expires in [('0'*64,int(time.time())+60),(signature(config.lease_key,asset_id,0),0),('bad',int(time.time())+60)]:
                async def bad_lease(token=token,expires=expires):
                    response=await client.get('/v1/assets/'+asset_id,params={'expires':expires,'signature':token})
                    return {'status':response.status_code}
                await check('asset-invalid-lease:'+token[:8],bad_lease)
            for p in ['/v1/assets/../../etc/passwd','/v1/assets/%2e%2e%2fetc%2fpasswd','/v1/jobs/../../health','/v1/jobs/%00','/v1/assets/'+'A'*10001]:
                async def malformed_path(p=p):
                    response=await client.get(p,headers=auth)
                    return {'status':response.status_code,'bodyLength':len(response.content)}
                await check('path:'+p[:70],malformed_path)
            async def subscriber_boundary():
                created=jobs.create(ResolveRequest(**{**valid,'videoId':'11111111111'}),'c'*64)
                try:
                    jobs.get(created['jobId'],'d'*64)
                    blocked=False
                except KeyError:
                    blocked=True
                jobs.cancel(created['jobId'],'c'*64)
                await asyncio.sleep(0)
                return {'wrongSubscriberBlocked':blocked,'cancelled':jobs.jobs[created['jobId']]['state']=='failed'}
            await check('subscriber-boundary',subscriber_boundary)
            async def queue_capacity():
                accepted=0
                for i in range(20):
                    body=ResolveRequest(**{**valid,'videoId':f'{i:011d}'})
                    try:
                        jobs.create(body,'e'*64)
                        accepted+=1
                    except ValueError:
                        break
                return {'pending':sum(j['state']=='pending' for j in jobs.jobs.values()),'limit':config.workers+config.queue_size,'newAccepted':accepted}
            await check('queue-capacity',queue_capacity)
        await jobs.close()
        async def output_limit():
            # A separate supervisor kills this probe if cleanup itself hangs.
            import subprocess
            code = "import sys,asyncio;sys.path.insert(0,'media-service');from app.processes import run_tool;asyncio.run(run_tool([sys.executable,'-c','print(\"A\"*(6*1024*1024))'],.5))"
            start=time.perf_counter()
            try:
                completed=subprocess.run([sys.executable,'-c',code],cwd=ROOT,capture_output=True,timeout=3)
                return {'returnCode':completed.returncode,'expectedReasonReported':b'tool_output_limit' in completed.stderr,'elapsedSeconds':round(time.perf_counter()-start,2)}
            except subprocess.TimeoutExpired:
                return {'supervisorTimeout':True,'expectedDeadlineSeconds':.5,'elapsedSeconds':round(time.perf_counter()-start,2)}
        await check('subprocess-output-limit',output_limit)
        async def deadline():
            try:
                await run_tool([sys.executable,'-c','import time; time.sleep(5)'],.05)
                return 'unexpected success'
            except ValueError as exc:
                return {'reason':str(exc)}
        await check('subprocess-deadline',deadline)
        # Construct a response, then interrupt its file before reading the stream.
        async def interrupted_asset():
            file=Path(temporary)/'interrupted.webm';file.write_bytes(b'A'*100)
            expiry=int(time.time())+60
            asset={'id':'f'*32,'path':file,'descriptor':{'mimeType':'audio/webm'}}
            request=Request({'type':'http','method':'GET','headers':[]})
            response=deliver(config,asset,request,expiry,signature(config.lease_key,asset['id'],expiry))
            file.write_bytes(b'')
            data=b''.join([c async for c in response.body_iterator])
            return {'status':response.status_code,'declaredLength':response.headers.get('content-length'),'actualBytes':len(data)}
        await check('asset-truncated-during-delivery',interrupted_asset)
    if '--verify-fixes' in sys.argv:
        by_name = {r['name']:r for r in results}
        for name in ['jobs-oversize-correct-length','jobs-oversize-forged-length','jobs-overflow-content-length','jobs-chunked-oversize']:
            assert by_name[name]['observation']['status'] == 413, name
        assert by_name['jobs-small-validation-error']['observation']['body']['echoBytes'] < 1024
        probe=by_name['subprocess-output-limit']['observation']
        assert not probe.get('supervisorTimeout') and probe['expectedReasonReported'], probe
        assert by_name['subscriber-boundary']['observation']['wrongSubscriberBlocked']
        assert by_name['queue-capacity']['observation']['pending'] <= by_name['queue-capacity']['observation']['limit']
        assert not any('error' in r for r in results), results
    output=Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/haykasa-media-audit.json')
    output.write_text(json.dumps({'cases':len(results),'results':results},indent=2)+'\n')
    print(json.dumps({'output':str(output),'cases':len(results),'exceptions':sum('error' in r for r in results)}))

asyncio.run(main())
