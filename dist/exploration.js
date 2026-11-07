import { UNKNOWN, trackKey, genreTags, songsFrom, similarity, layout, genreColor } from './exploration-data.js';
import { attachMapNavigation } from './map-navigation.js';

export function createExploration({ el, cover, linkedName }) {
  const root = document.getElementById('exploration');
  root.innerHTML = `
    <div class="section-heading"><div><span class="eyebrow">FOLLOW YOUR CURIOSITY</span><h2>A map of your rotation</h2></div><span id="explore-mode" class="badge"></span></div>
    <div class="explore-controls"><label>Find a song <input id="map-search" type="search" placeholder="Song or artist…"></label><label>Artist-derived genre <select id="genre-filter"><option value="">All genres</option></select></label></div>
    <article class="panel constellation-panel"><div class="panel-heading"><div><span class="eyebrow">EXPLORE THE CONNECTIONS</span><h3>Song constellation</h3></div><span class="small-star" aria-hidden="true">✳</span></div>
      <p class="explore-copy">Metadata relationships, not acoustic similarity. Shared artists carry 70% of the score; overlapping artist-derived genre tags carry up to 30%. Connected songs attract each other; unconnected proximity has no meaning. All dots have equal size.</p>
      <div class="constellation-grid"><div><svg id="song-map" viewBox="0 0 800 460" role="group" tabindex="0" aria-label="Interactive song constellation" aria-describedby="map-instructions"></svg><p id="map-instructions" class="explore-copy">Scroll or pinch to zoom at the pointer. Drag to explore. With the map focused: arrow keys pan, + / − zoom, 0 or Home resets. Tab to a song; Enter or Space selects it.</p><p id="map-status" class="explore-copy" role="status"></p></div><aside id="song-detail" class="song-detail" aria-live="polite"></aside></div>
      <div id="genre-legend" class="genre-legend" aria-label="Genre color legend"></div>
      <details class="explore-alternative"><summary>Browse songs as a list</summary><div id="song-alternative"></div></details>
    </article>`;
  const $ = id => document.getElementById(id);
  let data={}, selected=null, hovered=null, all=[], points=[], filtered=[], snapshot=null;
  const svg=$('song-map'), ns='http://www.w3.org/2000/svg';
  function svgEl(tag, attrs) {const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs)) n.setAttribute(k,String(v));return n;}
  function primary(track) {return genreTags(track,data.artists||[])[0] || UNKNOWN;}
  function matches(track) {
    const query=$('map-search').value.trim().toLocaleLowerCase(), genre=$('genre-filter').value;
    return (!genre || primary(track)===genre) && `${track.name} ${(track.artists||[]).map(a=>a.name).join(' ')}`.toLocaleLowerCase().includes(query);
  }
  const navigation=attachMapNavigation(svg,key=>{
    const track=filtered.find(t=>trackKey(t)===key);if(track)choose(track);
  });
  function edges() {
    const layer=svg.querySelector('.map-edges');if(!layer)return;layer.replaceChildren();
    for(const key of [...new Set([selected,hovered].filter(Boolean))]) {
      const source=points.find(p=>trackKey(p.track)===key && filtered.includes(p.track));if(!source)continue;
      for(const target of points) if(target!==source && filtered.includes(target.track) && similarity(source.track,target.track,data.artists||[]).score>0) layer.append(svgEl('line',{x1:source.x,y1:source.y,x2:target.x,y2:target.y,class:key===selected?'selected-edge':'hover-edge'}));
    }
  }
  function choose(track) {selected=trackKey(track);details(track);edges();svg.querySelectorAll('[data-song]').forEach(n=>n.setAttribute('aria-pressed',String(n.dataset.song===selected)));}
  function details(track) {
    const panel=$('song-detail');panel.replaceChildren();
    if(!track){panel.append(el('div','eyebrow','PICK A DOT'),el('h3','','Where does it lead?'),el('p','','Select a song to explore its metadata connections.'));return;}
    panel.append(cover(track,0),linkedName(track),el('p','',(track.artists||[]).map(a=>a.name).join(', ')),el('p','',`Artist-derived tags: ${genreTags(track,data.artists||[]).join(', ') || 'Unknown — no tags returned'}`));
    panel.append(el('h4','','Closest metadata connections'));
    const related=filtered.filter(t=>trackKey(t)!==trackKey(track)).map(t=>({track:t,...similarity(track,t,data.artists||[])})).filter(t=>t.score>0).sort((a,b)=>b.score-a.score || trackKey(a.track).localeCompare(trackKey(b.track))).slice(0,5);
    if(!related.length)panel.append(el('p','','No supported relationships in this selection. Missing genres are not inferred.'));
    for(const item of related){const button=el('button','related-song',item.track.name);button.onclick=()=>choose(item.track);panel.append(button,el('small','',item.reasons.join(' · ')));}
  }
  function drawMap() {
    navigation.cancel();hovered=null;
    filtered=all.filter(matches);
    svg.replaceChildren(svgEl('g',{class:'map-edges','aria-hidden':'true'}));
    for(const p of points.filter(p=>filtered.includes(p.track))) {
      const node=svgEl('g',{transform:`translate(${p.x} ${p.y})`,tabindex:0,role:'button','aria-label':`${p.track.name}, ${(p.track.artists||[]).map(a=>a.name).join(', ')}, ${primary(p.track)}`,'aria-pressed':String(trackKey(p.track)===selected),'data-song':trackKey(p.track),class:`song-node genre-${genreColor(primary(p.track))}`});
      node.append(svgEl('circle',{r:11}));const label=svgEl('text',{y:25,'text-anchor':'middle'});label.textContent=p.track.name.length>23?`${p.track.name.slice(0,22)}…`:p.track.name;node.append(label);
      const title=svgEl('title',{});title.textContent=`${p.track.name} · ${primary(p.track)}`;node.append(title);
      node.onclick=event=>{if(event.detail===0)choose(p.track);};node.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(p.track);}};
      node.onpointerenter=()=>{hovered=trackKey(p.track);edges();};node.onpointerleave=()=>{hovered=null;edges();};
      node.onfocus=()=>{hovered=trackKey(p.track);edges();};node.onblur=()=>{hovered=null;edges();};svg.append(node);
    }
    const current=filtered.find(t=>trackKey(t)===selected);details(current);edges();
    $('map-status').textContent=filtered.length?`${filtered.length} songs · relationships use returned artist metadata. Genre filters use the primary tag.`:'No songs match. Clear the search or genre filter. Likely ASMR / noise recordings are excluded automatically.';
    const legend=$('genre-legend');legend.replaceChildren();
    for(const genre of [...new Set(all.map(primary))].sort()) {const chip=el('button',`genre-chip genre-${genreColor(genre)}`,genre);chip.setAttribute('aria-pressed',String($('genre-filter').value===genre));chip.onclick=()=>{$('genre-filter').value=$('genre-filter').value===genre?'':genre;drawMap();};legend.append(chip);}
    const list=$('song-alternative');list.replaceChildren();
    for(const track of all.filter(matches)) {
      const row=el('div','song-review');const button=el('button','text-button',`${track.name} — ${(track.artists||[]).map(a=>a.name).join(', ')} (${primary(track)})`);button.onclick=()=>{choose(track);$('song-detail').scrollIntoView({block:'nearest'});};
      row.append(button);list.append(row);
    }
    if(!filtered.length)list.append(el('p','empty','No included songs match this selection.'));
  }
  $('map-search').addEventListener('input',drawMap);$('genre-filter').addEventListener('change',drawMap);
  return {
    reset(){selected=null;hovered=null;snapshot=null;$('map-search').value='';$('genre-filter').value='';navigation.reset();},
    update(next,isConnected){
      data=next;all=songsFrom(data);
      const signature=JSON.stringify([all,data.artists]);if(signature!==snapshot){points=layout(all,data.artists||[]);snapshot=signature;navigation.fit(points);}
      else {const byKey=new Map(all.map(t=>[trackKey(t),t]));points.forEach(p=>{p.track=byKey.get(trackKey(p.track));});}
      const previous=$('genre-filter').value;$('genre-filter').replaceChildren();const any=el('option','','All genres');any.value='';$('genre-filter').append(any);
      for(const genre of [...new Set(all.map(primary))].sort()){const opt=el('option','',genre);opt.value=genre;$('genre-filter').append(opt);}
      $('genre-filter').value=[...$('genre-filter').options].some(o=>o.value===previous)?previous:'';
      $('explore-mode').textContent=isConnected?'YOUR RETURNED SPOTIFY DATA':'ILLUSTRATIVE DEMO';drawMap();
    }
  };
}
