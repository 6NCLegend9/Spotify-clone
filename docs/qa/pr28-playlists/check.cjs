const fs = require('fs');
const vm = require('vm');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..') + path.sep;
const ts = require(path.join(root, 'node_modules/typescript'));
const assert = require('node:assert/strict');
const jsx = require(path.join(root, 'node_modules/react/jsx-runtime'));
function harness(file, extra = {}) {
  const slots = [], cleanups = [], events = [], routes = [], closes = [];
  let index = 0, calls = 0, resolve;
  const account = { status: 'authenticated', data: {user: {id:'alice'}} };
  const react = {
    useState(initial) { const key=index++; if (!(key in slots)) slots[key]= typeof initial==='function'?initial():initial; return [slots[key], value=>slots[key]=typeof value==='function'?value(slots[key]):value]; },
    useRef(initial) { const key=index++; return slots[key] ||= {current:initial}; },
    useEffect(callback) { const key=index++; if (!(key in slots)) {slots[key]=true; const cleanup=callback(); if(cleanup) cleanups.push(cleanup);} }
  };
  const listeners = new Map();
  const mocks = {
    react, 'react/jsx-runtime':jsx,
    'next-auth/react':{useSession:()=>account},
    'next/navigation':{useRouter:()=>({push:path=>routes.push(path)}),usePathname:()=>'/library'},
    'react-redux':{useDispatch:()=>()=>{}},
    '@/utils/accountCache.mjs':{accountOwner:(session,status)=>status==='authenticated'?session.user.id:null},
    '../Layout/AppShell':{useNav:()=>({setShowNav:value=>closes.push(value)})},
    '@/services/playlistApi':{createPlaylist:()=>{calls++;return new Promise(done=>resolve=done)},getUserPlaylists:()=>new Promise(()=>{})},
    '@/utils/playlistThemes':{PLAYLIST_CATEGORIES:['Pop'],matchPlaylistCategory:()=>''},
    '@/utils/userError':{toUserError:value=>value},
    '@/services/http':{requestJson:async()=>({success:true,data:[],artists:[]})},
    '@/utils/followedArtistsList.mjs':{followedArtistsForDisplay:value=>value.followedArtistsMeta||[]},
    '@/utils/accountNotifications.mjs':{FOLLOWS_CHANGED_EVENT:'heykasa:follows-changed'},
    'react-hot-toast':{toast:{success:()=>{},error:()=>{}}},
    ...extra,
  };
  const context = {module:{exports:{}},exports:{},console,AbortController,
    CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail}},
    window:{dispatchEvent:event=>{events.push(event);listeners.get(event.type)?.(event)},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)},
    require:name=>mocks[name] || new Proxy({}, {get:()=>()=>null}),
  };
  context.exports=context.module.exports;
  const source=fs.readFileSync(root+file,'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(compiled+(file.endsWith('Playlists.jsx')?'\nmodule.exports.testComponent = AccountPlaylists;':''),context);
  return {render:props=>{index=0;return (context.module.exports.testComponent||context.module.exports.default)(props)},events,routes,closes,account,listeners,cleanup:()=>cleanups.forEach(fn=>fn()),resolve:value=>resolve(value),calls:()=>calls};
}
function find(node, type) { if(!node)return; if(Array.isArray(node))return node.map(child=>find(child,type)).find(Boolean);if(node.type===type)return node;return find(node.props?.children,type); }
const tick=()=>new Promise(done=>setImmediate(done));
(async()=>{
  for(const mode of ['success','failure','account-change','unmount']) {
    const h=harness('src/components/Sidebar/PlaylistModal.jsx');
    const props={show:true,setShow:()=>{}};
    find(h.render(props),'input').props.onChange({target:{value:'My playlist'}});
    const form=find(h.render(props),'form');
    form.props.onSubmit({preventDefault(){}});form.props.onSubmit({preventDefault(){}});
    assert.equal(h.calls(),1,'Duplicate submission must not create two playlists');
    if(mode==='account-change'){h.account.data.user.id='bob';h.render(props);}
    if(mode==='unmount')h.cleanup();
    h.resolve(mode==='failure'?{success:false,message:'Rejected'}:{success:true,data:{playlist:{_id:'new-id',name:'My playlist'}}});
    await tick();
    assert.equal(h.events.length,mode==='success'?1:0);
    assert.equal(h.routes.length,mode==='success'?1:0);
    if(mode==='success'){
      assert.equal(h.events[0].detail.owner,'alice');
      assert.equal(h.events[0].detail.playlist._id,'new-id');
      assert.equal(h.routes[0],'/library/playlist/new-id');
      assert.deepEqual(h.closes,[false]);
    }
  }
  const sidebar=harness('src/components/Sidebar/Playlists.jsx');
  const props={owner:'alice',status:'authenticated',compact:true};
  sidebar.render(props);
  sidebar.listeners.get('heykasa:playlists-changed')({detail:{owner:'bob',playlist:{_id:'wrong',name:'Wrong'}}});
  assert.equal(find(sidebar.render(props),'nav').props.children[1].length,0);
  sidebar.listeners.get('heykasa:playlists-changed')({detail:{owner:'alice',playlist:{_id:'new-id',name:'New'}}});
  assert.equal(find(sidebar.render(props),'nav').props.children[1].length,1,'Created playlist immediately enters sidebar');
  sidebar.listeners.get('heykasa:playlists-changed')({detail:{owner:'alice',playlist:{_id:'new-id',name:'New'}}});
  assert.equal(find(sidebar.render(props),'nav').props.children[1].length,1,'Duplicate event must not duplicate playlist');
  console.log('PASS: create success, rejected create, double submit, account change, unmount, immediate sidebar update, account-scoped events, duplicate events');
})().catch(error=>{console.error(error);process.exitCode=1});
