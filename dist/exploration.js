import { UNKNOWN, trackKey, genreTags, classify, excluded, songsFrom, similarity, layout, localDay, heatmap, genreColor } from './exploration-data.js';

export function createExploration({ el, cover, linkedName, onFilter }) {
  const root = document.getElementById('exploration');
  root.innerHTML = `
    <div class="section-heading"><div><span class="eyebrow">FOLLOW YOUR CURIOSITY</span><h2>A map of your rotation</h2></div><span id="explore-mode" class="badge"></span></div>
    <div class="explore-controls"><label>Find a song <input id="map-search" type="search" placeholder="Song or artist…"></label><label>Artist-derived genre <select id="genre-filter"><option value="">All genres</option></select></label></div>
    <article class="panel constellation-panel"><div class="panel-heading"><div><span class="eyebrow">01 / EXPLORE</span><h3>Song constellation</h3></div><span class="small-star" aria-hidden="true">✳</span></div>
      <p class="explore-copy">Metadata relationships, not acoustic similarity. Shared artists carry 70% of the score; overlapping artist-derived genre tags carry up to 30%. Connected songs attract each other; unconnected proximity has no meaning. All dots have equal size.</p>
      <div class="map-toolbar" role="group" aria-label="Constellation navigation"><button id="zoom-in" aria-label="Zoom in">＋</button><button id="zoom-out" aria-label="Zoom out">−</button><button id="pan-left" aria-label="Pan left">←</button><button id="pan-right" aria-label="Pan right">→</button><button id="pan-up" aria-label="Pan up">↑</button><button id="pan-down" aria-label="Pan down">↓</button><button id="map-reset">Reset view</button></div>
      <div class="constellation-grid"><div><svg id="song-map" viewBox="0 0 800 460" role="group" aria-label="Song constellation. Tab to songs; Enter selects. Drag the background to pan."></svg><p id="map-status" class="explore-copy" role="status"></p></div><aside id="song-detail" class="song-detail" aria-live="polite"></aside></div>
      <div id="genre-legend" class="genre-legend" aria-label="Genre color legend"></div>
      <details class="explore-alternative"><summary>Browse songs as a list & review sound classifications</summary><p>Likely ASMR / noise is detected from explicit title, artist, and album labels. No audio is analyzed. False positives and missed tracks are possible. Overrides apply only when the exclusion toggle is on, and stay in memory for this connection.</p><div id="song-alternative"></div></details>
    </article>
    <article class="panel heatmap-panel"><div class="panel-heading"><div><span class="eyebrow">02 / FIND PATTERNS</span><h3>The shape of your listening</h3></div></div>
      <div class="explore-controls"><label>Group by <select id="heat-mode"><option value="days">Calendar day</option><option value="hours">Hour of day</option></select></label><label>From <input id="heat-start" type="date"></label><label>Through <input id="heat-end" type="date"></label><label>Intensity <select id="heat-value"><option value="count">Recorded plays</option><option value="percent">% of column plays</option></select></label></div>
      <p id="heat-coverage" class="explore-copy"></p><p class="explore-copy">One play counts once: the first artist-derived genre alphabetically, or Unknown. Additional tags are available in song details. Percentages use all included plays in each column before the genre filter. Dates and hours use your local timezone.</p>
      <p class="explore-copy heat-key"><span class="heat-swatch level-0"></span> 0 in an observed bucket <span class="heat-swatch level-2"></span> Fewer <span class="heat-swatch level-4"></span> More <span class="heat-swatch no-data"></span> No records / coverage unknown</p>
      <div id="heat-table" class="heat-scroll" tabindex="0" role="region" aria-label="Genre heatmap table, scroll for more columns"></div><div id="heat-detail" class="heat-detail" aria-live="polite"></div>
    </article>`;
  const $ = id => document.getElementById(id);
  const overrides = new Map();
  let data={}, connected=false, hideNoise=false, selected=null, all=[], points=[], filtered=[], snapshot=null;
  let camera={x:0,y:0,w:800,h:460};
  const svg=$('song-map'), ns='http://www.w3.org/2000/svg';
  function svgEl(tag, attrs) {const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs)) n.setAttribute(k,String(v));return n;}
  function primary(track) {return genreTags(track,data.artists||[])[0] || UNKNOWN;}
  function matches(track) {
    const query=$('map-search').value.trim().toLocaleLowerCase(), genre=$('genre-filter').value;
    return (!genre || primary(track)===genre) && `${track.name} ${(track.artists||[]).map(a=>a.name).join(' ')}`.toLocaleLowerCase().includes(query);
  }
  function setCamera() {svg.setAttribute('viewBox',`${camera.x} ${camera.y} ${camera.w} ${camera.h}`);}
  function zoom(factor) {
    const width=Math.max(200,Math.min(1600,camera.w*factor)), height=width*460/800;
    camera={x:camera.x+(camera.w-width)/2,y:camera.y+(camera.h-height)/2,w:width,h:height};setCamera();
  }
  $('zoom-in').onclick=()=>zoom(0.8);$('zoom-out').onclick=()=>zoom(1.25);
  for(const [id,dx,dy] of [['pan-left',-1,0],['pan-right',1,0],['pan-up',0,-1],['pan-down',0,1]]) $(id).onclick=()=>{camera.x+=dx*camera.w*.15;camera.y+=dy*camera.h*.15;setCamera();};
  $('map-reset').onclick=()=>{camera={x:0,y:0,w:800,h:460};setCamera();};
  let drag=null;
  svg.addEventListener('pointerdown',e=>{if(e.target!==svg)return;drag={x:e.clientX,y:e.clientY,camera:{...camera}};svg.setPointerCapture(e.pointerId);});
  svg.addEventListener('pointermove',e=>{if(!drag)return;const rect=svg.getBoundingClientRect();const scale=Math.max(drag.camera.w/rect.width,drag.camera.h/rect.height);camera.x=drag.camera.x-(e.clientX-drag.x)*scale;camera.y=drag.camera.y-(e.clientY-drag.y)*scale;setCamera();});
  for(const type of ['pointerup','pointercancel','lostpointercapture']) svg.addEventListener(type,()=>{drag=null;});
  function edges(track) {
    const layer=svg.querySelector('.map-edges');if(!layer)return;layer.replaceChildren();
    const source=points.find(p=>trackKey(p.track)===trackKey(track||{}));if(!source)return;
    for(const target of points) if(target!==source && filtered.includes(target.track) && similarity(source.track,target.track,data.artists||[]).score>0) layer.append(svgEl('line',{x1:source.x,y1:source.y,x2:target.x,y2:target.y}));
  }
  function choose(track) {selected=trackKey(track);details(track);edges(track);svg.querySelectorAll('[data-song]').forEach(n=>n.setAttribute('aria-pressed',String(n.dataset.song===selected)));}
  function details(track) {
    const panel=$('song-detail');panel.replaceChildren();
    if(!track){panel.append(el('div','eyebrow','PICK A DOT'),el('h3','','Where does it lead?'),el('p','','Select a song to explore its metadata connections.'));return;}
    panel.append(cover(track,0),linkedName(track),el('p','',(track.artists||[]).map(a=>a.name).join(', ')),el('p','',`Artist-derived tags: ${genreTags(track,data.artists||[]).join(', ') || 'Unknown — no tags returned'}`));
    const reason=classify(track);if(reason)panel.append(el('p','',`Likely ASMR / noise: ${reason}. Review in the song list below.`));
    panel.append(el('h4','','Closest metadata connections'));
    const related=filtered.filter(t=>trackKey(t)!==trackKey(track)).map(t=>({track:t,...similarity(track,t,data.artists||[])})).filter(t=>t.score>0).sort((a,b)=>b.score-a.score || trackKey(a.track).localeCompare(trackKey(b.track))).slice(0,5);
    if(!related.length)panel.append(el('p','','No supported relationships in this selection. Missing genres are not inferred.'));
    for(const item of related){const button=el('button','related-song',item.track.name);button.onclick=()=>choose(item.track);panel.append(button,el('small','',item.reasons.join(' · ')));}
  }
  function drawMap() {
    filtered=all.filter(t=>!excluded(t,hideNoise,overrides) && matches(t));
    svg.replaceChildren(svgEl('g',{class:'map-edges','aria-hidden':'true'}));
    for(const p of points.filter(p=>filtered.includes(p.track))) {
      const node=svgEl('g',{transform:`translate(${p.x} ${p.y})`,tabindex:0,role:'button','aria-label':`${p.track.name}, ${(p.track.artists||[]).map(a=>a.name).join(', ')}, ${primary(p.track)}`,'aria-pressed':String(trackKey(p.track)===selected),'data-song':trackKey(p.track),class:`song-node genre-${genreColor(primary(p.track))}`});
      node.append(svgEl('circle',{r:11}));const label=svgEl('text',{y:25,'text-anchor':'middle'});label.textContent=p.track.name.length>23?`${p.track.name.slice(0,22)}…`:p.track.name;node.append(label);
      const title=svgEl('title',{});title.textContent=`${p.track.name} · ${primary(p.track)}`;node.append(title);
      node.onclick=()=>choose(p.track);node.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(p.track);}};
      node.onpointerenter=()=>edges(p.track);node.onpointerleave=()=>edges(filtered.find(t=>trackKey(t)===selected));
      node.onfocus=()=>edges(p.track);node.onblur=()=>edges(filtered.find(t=>trackKey(t)===selected));svg.append(node);
    }
    const current=filtered.find(t=>trackKey(t)===selected);details(current);edges(current);
    $('map-status').textContent=filtered.length?`${filtered.length} songs · drag the background or use the navigation buttons. Genre filters use the primary tag.`:'No songs match. Clear the search or genre filter, or review excluded tracks below.';
    const legend=$('genre-legend');legend.replaceChildren();
    for(const genre of [...new Set(all.map(primary))].sort()) {const chip=el('button',`genre-chip genre-${genreColor(genre)}`,genre);chip.setAttribute('aria-pressed',String($('genre-filter').value===genre));chip.onclick=()=>{$('genre-filter').value=$('genre-filter').value===genre?'':genre;draw();};legend.append(chip);}
    const list=$('song-alternative');list.replaceChildren();
    // Keep excluded songs reviewable even when the map hides them.
    for(const track of all.filter(matches)) {
      const row=el('div','song-review');const button=el('button','text-button',`${track.name} — ${(track.artists||[]).map(a=>a.name).join(', ')} (${primary(track)})`);button.onclick=()=>{choose(track);$('song-detail').scrollIntoView({block:'nearest'});};
      const reason=classify(track), label=el('label','','Classification override '), select=el('select');select.setAttribute('aria-label',`Classification for ${track.name}`);
      for(const [value,text] of [['auto','Automatic'],['include','Keep as music'],['exclude','Treat as ASMR / noise']]) {const option=el('option','',text);option.value=value;select.append(option);}
      select.value=overrides.get(trackKey(track))||'auto';select.onchange=()=>{if(select.value==='auto')overrides.delete(trackKey(track));else overrides.set(trackKey(track),select.value);onFilter();};label.append(select);
      row.append(button,el('small','',`${reason || 'No ASMR / noise label detected'}${excluded(track,hideNoise,overrides)?' · Excluded':''}`),label);list.append(row);
    }
  }
  function drawHeat() {
    const target=$('heat-table');target.replaceChildren();$('heat-detail').replaceChildren();
    const start=$('heat-start').value,end=$('heat-end').value,mode=$('heat-mode').value;
    if(!start||!end||start>end){target.append(el('p','empty','Choose a valid date range.'));return;}
    const model=heatmap(data.recent?.items||[],data.artists||[],{start,end,mode,hideNoise,overrides});
    const dates=model.valid.map(p=>p.played_at).sort();
    $('heat-coverage').textContent=`${connected?'Limited Spotify recent-play snapshot':'Synthetic demo history — illustrative only'}. ${dates.length?`Returned coverage: ${new Date(dates[0]).toLocaleString()} – ${new Date(dates.at(-1)).toLocaleString()}.`:'No timestamped listening returned.'} ${model.included.length} included records in this date range. Gaps do not establish silence; no bucket is guaranteed complete.`;
    if(mode==='days' && model.columns.length>62){target.append(el('p','empty','Choose 62 days or fewer for the daily view, or switch to hours.'));return;}
    if(!model.included.length){target.append(el('p','empty','No included timestamped plays in this range. Adjust the dates or review the ASMR / noise filter.'));return;}
    const rows=model.rows.filter(g=>!$('genre-filter').value||g===$('genre-filter').value);
    if(!rows.length){target.append(el('p','empty','No recorded plays for this genre in this range.'));return;}
    const table=el('table','heatmap'),caption=el('caption','sr-only','Artist-derived primary genre by local day or hour. Cell buttons reveal contributing tracks.');table.append(caption);
    const head=el('thead'),hr=el('tr');hr.append(el('th','','Genre'));
    for(const col of model.columns){const th=el('th','',mode==='hours'?`${col}:00`:col.slice(5));th.scope='col';hr.append(th);}head.append(hr);table.append(head);
    const percent=$('heat-value').value==='percent';
    const amount=(g,c)=>{const count=(model.cells.get(JSON.stringify([g,c]))||[]).length;return percent?count/(model.totals.get(c)||1)*100:count;};
    const max=Math.max(1,...model.rows.flatMap(g=>model.columns.map(c=>amount(g,c))));
    const body=el('tbody');
    for(const genre of rows){const row=el('tr'),th=el('th',`genre-label genre-${genreColor(genre)}`,genre);th.scope='row';row.append(th);
      for(const col of model.columns){const records=model.cells.get(JSON.stringify([genre,col]))||[],value=amount(genre,col),observed=model.observed.has(col),td=el('td');
        const text=observed?(percent?`${Math.round(value)}%`:String(records.length)):'—';const button=el('button',`heat-cell ${observed?`level-${value?Math.max(1,Math.ceil(value/max*4)):0}`:'no-data'}`,text);
        const description=`${genre}, ${mode==='hours'?`${col}:00 local hour`:col}: ${observed?`${records.length} recorded plays${percent?`, ${value.toFixed(1)}% of column`:''}`:'no records; coverage unknown'}`;
        button.setAttribute('aria-label',description);button.title=`${description}${records.length?` · ${records.slice(0,3).map(p=>p.track.name).join(', ')}`:''}`;
        button.onclick=()=>{const detail=$('heat-detail');detail.replaceChildren(el('h4','',description));if(!records.length)detail.append(el('p','',observed?'Zero included plays for this genre in this observed bucket.':'No records in this bucket. Listening coverage is unknown.'));for(const p of records){const r=el('div','heat-track');r.append(linkedName(p.track),el('small','',`${(p.track.artists||[]).map(a=>a.name).join(', ')} · ${new Date(p.played_at).toLocaleString()}`));detail.append(r);}};
        td.append(button);row.append(td);
      }body.append(row);
    }table.append(body);target.append(table);
  }
  function draw(){drawMap();drawHeat();}
  $('map-search').addEventListener('input',drawMap);$('genre-filter').addEventListener('change',draw);
  for(const id of ['heat-mode','heat-start','heat-end','heat-value']) $(id).addEventListener('change',drawHeat);
  return {
    excluded: track=>excluded(track,hideNoise,overrides),
    setNoise(value){hideNoise=value;},
    reset(){overrides.clear();selected=null;snapshot=null;$('map-search').value='';$('genre-filter').value='';$('heat-start').value='';$('heat-end').value='';camera={x:0,y:0,w:800,h:460};setCamera();},
    update(next,isConnected){
      data=next;connected=isConnected;all=songsFrom(data);
      const signature=JSON.stringify([all,data.artists]);if(signature!==snapshot){points=layout(all,data.artists||[]);snapshot=signature;}
      const previous=$('genre-filter').value;$('genre-filter').replaceChildren();const any=el('option','','All genres');any.value='';$('genre-filter').append(any);
      for(const genre of [...new Set(all.map(primary))].sort()){const opt=el('option','',genre);opt.value=genre;$('genre-filter').append(opt);}
      $('genre-filter').value=[...$('genre-filter').options].some(o=>o.value===previous)?previous:'';
      if(!$('heat-start').value){const dates=(data.recent?.items||[]).filter(p=>p.played_at && Number.isFinite(Date.parse(p.played_at))).map(p=>p.played_at).sort();const end=new Date(dates.at(-1)||Date.now()),start=new Date(end);start.setDate(start.getDate()-13);$('heat-start').value=localDay(start);$('heat-end').value=localDay(end);}
      $('explore-mode').textContent=connected?'YOUR RETURNED SPOTIFY DATA':'ILLUSTRATIVE DEMO';draw();
    }
  };
}
