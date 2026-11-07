// Pointer coordinates are converted through the SVG matrix, including letterboxing.
export function attachMapNavigation(svg, onSelect) {
  let initial = { x:0, y:0, w:800, h:460 };
  let camera = { ...initial }, moved = false, tap = null;
  const pointers = new Map();
  function paint() { svg.setAttribute('viewBox', `${camera.x} ${camera.y} ${camera.w} ${camera.h}`); }
  function world(position) {
    const point = svg.createSVGPoint(); point.x=position.x; point.y=position.y;
    return point.matrixTransform(svg.getScreenCTM().inverse());
  }
  function zoom(factor, from, to=from) {
    const anchor=world(from), destination=world(to);
    const width=Math.max(200,Math.min(1600,camera.w*factor)), ratio=width/camera.w;
    camera={ x:anchor.x-(destination.x-camera.x)*ratio, y:anchor.y-(destination.y-camera.y)*ratio, w:width, h:camera.h*ratio };
    paint();
  }
  const midpoint = values => ({x:(values[0].x+values[1].x)/2,y:(values[0].y+values[1].y)/2});
  const distance = values => Math.hypot(values[0].x-values[1].x,values[0].y-values[1].y);
  function cancel() {
    const ids=[...pointers.keys()]; pointers.clear(); tap=null; moved=true;
    svg.classList.remove('is-dragging');
    for(const id of ids) if(svg.hasPointerCapture(id)) svg.releasePointerCapture(id);
  }
  svg.addEventListener('pointerdown',event=>{
    if(event.button!==0 || pointers.size>=2)return;
    const target=event.target.closest('[data-song]');
    if(!pointers.size){moved=false;tap={x:event.clientX,y:event.clientY,key:target?.dataset.song};}
    else moved=true;
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    svg.setPointerCapture(event.pointerId);
    svg.classList.add('is-dragging');
    // Keep arrow-key navigation scoped to the map rather than scrolling the page.
    (target || svg).focus({preventScroll:true});
  });
  svg.addEventListener('pointermove',event=>{
    if(!pointers.has(event.pointerId))return;
    const before=[...pointers.values()];
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(tap && Math.hypot(event.clientX-tap.x,event.clientY-tap.y)>5)moved=true;
    if(pointers.size===2){
      const after=[...pointers.values()], oldDistance=distance(before), newDistance=distance(after);
      if(oldDistance>0 && newDistance>0)zoom(oldDistance/newDistance,midpoint(before),midpoint(after));
    } else if(moved) {
      const from=world(before[0]),to=world([...pointers.values()][0]);
      camera.x+=from.x-to.x;camera.y+=from.y-to.y;paint();
    }
  });
  svg.addEventListener('pointerup',event=>{
    if(!pointers.has(event.pointerId))return;
    // Also measure the release point: the browser can coalesce away the last move.
    if(tap && Math.hypot(event.clientX-tap.x,event.clientY-tap.y)>5)moved=true;
    const key=!moved && pointers.size===1 ? tap?.key : null;
    pointers.delete(event.pointerId);
    if(svg.hasPointerCapture(event.pointerId))svg.releasePointerCapture(event.pointerId);
    if(!pointers.size){tap=null;svg.classList.remove('is-dragging');}
    if(key)onSelect(key);
  });
  for(const type of ['pointercancel','lostpointercapture']) svg.addEventListener(type,event=>{
    if(!pointers.has(event.pointerId))return;
    cancel();svg.classList.remove('is-dragging');
  });
  // Pointer selection is handled on release; ignore the subsequent synthetic click.
  // Keyboard and assistive-technology clicks (detail=0) still reach song buttons.
  svg.addEventListener('click',event=>{if(event.detail>0){event.preventDefault();event.stopPropagation();}},true);
  svg.addEventListener('wheel',event=>{
    if(pointers.size || !event.deltaY)return;
    event.preventDefault();
    const pixels=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?svg.getBoundingClientRect().height:1);
    zoom(Math.exp(Math.max(-.5,Math.min(.5,pixels*.002))),{x:event.clientX,y:event.clientY});
  },{passive:false});
  svg.addEventListener('keydown',event=>{
    if(event.altKey || event.ctrlKey || event.metaKey)return;
    const direction={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
    if(direction){event.preventDefault();camera.x+=direction[0]*camera.w*.12;camera.y+=direction[1]*camera.h*.12;paint();}
    else if(['+','=','-','_'].includes(event.key)){
      event.preventDefault();const rect=svg.getBoundingClientRect();zoom(['+','='].includes(event.key) ? 0.8 : 1.25,{x:rect.x+rect.width/2,y:rect.y+rect.height/2});
    } else if(event.key==='0' || event.key==='Home') {event.preventDefault();camera={...initial};paint();}
  });
  function reset(){cancel();camera={...initial};paint();}
  return { cancel, reset, fit(points){
    if(!points.length)return;
    const rect=svg.getBoundingClientRect(), aspect=rect.width && rect.height ? rect.width/rect.height : 800/460;
    const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
    const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
    const width=Math.max(200,right-left+180,(bottom-top+120)*aspect);
    initial={x:(left+right-width)/2,y:(top+bottom-width/aspect)/2,w:width,h:width/aspect};reset();
  } };
}
