import test from 'node:test';
import assert from 'node:assert/strict';
import { attachMapNavigation } from '../dist/map-navigation.js';

// Exercise the actual event handlers with SVG's aspect-ratio/letterbox geometry.
function mapHarness(rect={x:100,y:50,width:800,height:460}) {
  const handlers=new Map(), attrs=new Map([['viewBox','0 0 800 460']]), captures=new Set(), classes=new Set(), selected=[];
  const camera=()=>attrs.get('viewBox').split(' ').map(Number);
  const svg={
    classList:{add:name=>classes.add(name),remove:name=>classes.delete(name)},
    addEventListener(type,handler,options){if(!handlers.has(type))handlers.set(type,[]);handlers.get(type).push({handler,options});},
    setAttribute:(key,value)=>attrs.set(key,value),
    getBoundingClientRect:()=>rect,
    getScreenCTM(){return {inverse(){return {transform(point){
      const [x,y,w,h]=camera(),scale=Math.min(rect.width/w,rect.height/h);
      return {x:x+(point.x-rect.x-(rect.width-w*scale)/2)/scale,y:y+(point.y-rect.y-(rect.height-h*scale)/2)/scale};
    }};}};},
    createSVGPoint(){return {x:0,y:0,matrixTransform(matrix){return matrix.transform(this);}};},
    setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id),
    closest:()=>null,focus(){}
  };
  const controls=attachMapNavigation(svg,key=>selected.push(key));
  function emit(type,props={}) {
    const event={target:svg,button:0,pointerId:1,clientX:300,clientY:200,detail:1,deltaMode:0,prevented:false,stopped:false,
      preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...props};
    for(const {handler} of handlers.get(type)||[])handler(event);
    return event;
  }
  function world(x,y){const point=svg.createSVGPoint();point.x=x;point.y=y;return point.matrixTransform(svg.getScreenCTM().inverse());}
  const node={dataset:{song:'track-1'},closest(){return this;},focus(){}};
  return {svg,controls,emit,camera,world,node,selected,captures,classes,handlers};
}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} ≠ ${b}`);
test('wheel zoom keeps the pointer world position fixed on desktop and a letterboxed mobile viewport',()=>{
  for(const rect of [{x:100,y:50,width:800,height:460},{x:0,y:0,width:350,height:440}]){
    const h=mapHarness(rect),x=rect.x+rect.width*.3,y=rect.y+rect.height*.6,before=h.world(x,y);
    const event=h.emit('wheel',{deltaY:-120,clientX:x,clientY:y});
    assert.equal(event.prevented,true);assert.ok(h.camera()[2]<800);
    const after=h.world(x,y);close(before.x,after.x);close(before.y,after.y);
    assert.equal(h.handlers.get('wheel')[0].options.passive,false);
    h.emit('wheel',{deltaY:1e9,clientX:x,clientY:y});
    for(let i=0;i<10;i++)h.emit('wheel',{deltaY:1e9});assert.equal(h.camera()[2],1600);
    for(let i=0;i<10;i++)h.emit('wheel',{deltaY:-1e9});assert.equal(h.camera()[2],200);
  }
});
test('dragging from a song pans the camera and cannot accidentally select the song',()=>{
  const h=mapHarness();h.emit('pointerdown',{target:h.node});
  h.emit('pointermove',{clientX:350,clientY:230});
  assert.deepEqual(h.camera(),[-50,-30,800,460]);
  h.emit('pointerup',{clientX:350,clientY:230});assert.deepEqual(h.selected,[]);
  const click=h.emit('click',{target:h.node});assert.equal(click.stopped,true);
  assert.equal(h.captures.size,0);assert.equal(h.classes.has('is-dragging'),false);
});
test('a tap selects once, keyboard clicks pass through, and release-only drags do not select',()=>{
  const h=mapHarness();h.emit('pointerdown',{target:h.node});h.emit('pointerup');assert.deepEqual(h.selected,['track-1']);
  assert.equal(h.emit('click',{detail:0}).stopped,false);
  h.emit('pointerdown',{target:h.node});h.emit('pointerup',{clientX:450});assert.equal(h.selected.length,1);
  h.emit('pointerdown',{target:h.node,button:2});h.emit('pointerup');assert.equal(h.selected.length,1);
});
test('two-finger pinch zooms around the gesture center and never selects on release',()=>{
  const h=mapHarness();
  h.emit('pointerdown',{pointerId:1,clientX:300,clientY:250,target:h.node});
  h.emit('pointerdown',{pointerId:2,clientX:400,clientY:250});
  const anchor=h.world(350,250);
  h.emit('pointermove',{pointerId:1,clientX:250,clientY:250});
  h.emit('pointermove',{pointerId:2,clientX:450,clientY:250});
  close(h.camera()[2],400);close(h.world(350,250).x,anchor.x);close(h.world(350,250).y,anchor.y);
  h.emit('pointerup',{pointerId:1,clientX:250,clientY:250});
  const before=h.camera();h.emit('pointermove',{pointerId:2,clientX:470,clientY:260});
  assert.ok(h.camera()[0]<before[0]);h.emit('pointerup',{pointerId:2,clientX:470,clientY:260});
  assert.deepEqual(h.selected,[]);assert.equal(h.captures.size,0);
});
test('keyboard navigation is scoped, resets the camera, and preserves browser shortcuts',()=>{
  const h=mapHarness();assert.equal(h.emit('keydown',{key:'ArrowRight'}).prevented,true);assert.equal(h.camera()[0],96);
  h.emit('keydown',{key:'+'});assert.equal(h.camera()[2],640);
  h.emit('keydown',{key:'0'});assert.deepEqual(h.camera(),[0,0,800,460]);
  h.emit('keydown',{key:'-'});assert.equal(h.camera()[2],1000);
  h.emit('keydown',{key:'Home'});assert.deepEqual(h.camera(),[0,0,800,460]);
  assert.equal(h.emit('keydown',{key:'+',ctrlKey:true}).prevented,false);
  assert.equal(h.emit('keydown',{key:'Tab'}).prevented,false);
});
test('cancellation and resetting drop stale pointer captures and suppress selection',()=>{
  for(const action of ['pointercancel','lostpointercapture','reset']){
    const h=mapHarness();h.emit('pointerdown',{target:h.node});
    if(action==='reset')h.controls.reset();else h.emit(action);
    h.emit('pointerup');assert.deepEqual(h.selected,[]);assert.equal(h.captures.size,0);
    assert.equal(h.classes.has('is-dragging'),false);
  }
});
test('the initial fit includes all songs on mobile and keyboard reset restores that fit',()=>{
  const h=mapHarness({x:0,y:0,width:350,height:440}),points=[{x:300,y:180},{x:490,y:310}];
  h.controls.fit(points);const fitted=h.camera(),[x,y,w,height]=fitted;
  assert.ok(points.every(p=>p.x>x && p.x<x+w && p.y>y && p.y<y+height));
  close(w/height,350/440);
  h.emit('wheel',{deltaY:-100});assert.notDeepEqual(h.camera(),fitted);
  h.emit('keydown',{key:'0'});assert.deepEqual(h.camera(),fitted);
});
