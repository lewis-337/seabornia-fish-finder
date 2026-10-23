const {test}=require('node:test'),assert=require('node:assert/strict'),B=require('../basemap-v10'),D=require('../fish-areas-v10');
test('geographic cameras round trip and preserve centre across orientation changes',()=>{
 for(const bounds of [[139.3,35,139.8,35.4],[127.4,26.1,127.9,26.6]]) for(const view of [[0,0,1050,950],[300,250,320,640],[-40,-60,1200,600]]){
  const c=B.geographic(view,bounds,390),r=B.legacy(c,bounds,390,390*view[3]/view[2]);
  r.forEach((n,i)=>assert.ok(Math.abs(n-view[i])<1e-8));
  const portrait=B.legacy(c,bounds,390,700),landscape=B.legacy(c,bounds,700,390);
  assert.deepEqual(B.geographic(portrait,bounds,390),B.geographic(landscape,bounds,700));
 }
});
test('layer preferences accept only supported backgrounds and bounded opacity',()=>{
 assert.equal(B.settings({base:'unsafe',opacity:-4}).base,'standard');assert.equal(B.settings({opacity:4}).opacity,1);assert.equal(B.settings({opacity:-4}).opacity,.15);assert.equal(B.validCamera({lat:90,lng:1,zoom:12}),false);
 assert.deepEqual(B.settings({base:'photo',overlays:{depth:false},opacity:.4}).overlays,{spots:true,points:true,habitat:false,depth:false});
});
test('regional names and aliases link without extracting tackle or shorter fish names',()=>{
 const s=[{id:'a',name:'シロアマダイ'},{id:'b',name:'アマダイ'},{id:'c',name:'ブリ'},{id:'d',name:'イラ'},{id:'e',name:'スマ',aliases:['スマガツオ']}];
 assert.deepEqual(D.speciesIn('ブリッジ タイラバ シロアマダイ・スマガツオ',s).sort(),['a','e']);
});
test('selected labels reserve their full footprint beside the bottom sheet',()=>{
 const M=require('../marina-core-v10'),p=M.freePosition(320,600,[{left:0,right:240,top:400,bottom:600}],{x:120,y:390},{left:50,right:50,top:27,bottom:48});
 assert.ok(p.y+48<=400 || p.x-50>=240);assert.ok(p.x>=50&&p.x+50<=320);
});
test('metric scale remains readable as zoom changes',()=>{
 for(const zoom of [5,10,15,20]){const s=B.scaleBar({lat:26.3,zoom});assert.ok(s.width>20&&s.width<=80);assert.match(s.label,/m$/)}
});
test('legacy workspaces and geographic v10 backups validate; malformed map objects fail safely',()=>{
 const M=require('../marina-core-v10');
 assert.ok(M.validWorkspace({view:[20,30,400,800],state:{month:10},fields:{catchMemo:'draft'}}));
 assert.ok(M.validWorkspace({camera:{lat:35.2,lng:139.6,zoom:12},map:B.settings(),state:{reportFish:'マダイ',reportLimit:80}}));
 assert.equal(!!M.validWorkspace({map:{base:'photo',overlays:null,opacity:.5}}),false);
 assert.equal(!!M.validWorkspace({camera:{lat:35,lng:139,zoom:Infinity}}),false);
});
