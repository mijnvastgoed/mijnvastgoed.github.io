const supabaseClient=window.supabase.createClient('https://rcqvszklticaxnegcbaf.supabase.co','sb_publishable_PsScBfmvTJFqmSSF8ToNqg_EU1PgpHm');

const allAreasLabel='Alle Amsterdamse woningen';
const modeConfig={
  koop:{
    subtitle:'Een compleet overzicht van alle woningen die deze week te koop aangeboden worden in Amsterdam.',
    priceLabel:'Alle prijzen',
    title:'Koopwoningen in Amsterdam — Nieuw',
    priceOptions:[
      {value:'all',label:'Alle prijzen'},
      {value:'500',label:'Tot € 500.000'},
      {value:'750',label:'Tot € 750.000'},
      {value:'1000',label:'Tot € 1.000.000'},
      {value:'over',label:'Vanaf € 1.000.000'}
    ]
  },
  huur:{
    subtitle:'Een compleet overzicht van alle huurwoningen die de afgelopen vijf dagen in Amsterdam zijn aangeboden.',
    priceLabel:'Alle huurprijzen',
    title:'Huurwoningen in Amsterdam — Nieuw',
    priceOptions:[
      {value:'1500',label:'Tot € 1.500'},
      {value:'2500',label:'Tot € 2.500'},
      {value:'3500',label:'Tot € 3.500'},
      {value:'4500',label:'Tot € 4.500'},
      {value:'over4500',label:'Boven € 4.500'}
    ]
  }
};

const requestedMode=new URLSearchParams(location.search).get('aanbod');
let activeMode=requestedMode==='huur'?'huur':'koop';
let allProperties=[],properties=[],filtered=[],current=0,currentUser='',saved=new Set(),drag=null,galleryIndex=0,galleryProperty=null;

const deck=document.querySelector('#deck');
const empty=document.querySelector('#emptyState');
const actions=document.querySelector('#actions');
const progress=document.querySelector('#progress');
const mapPanel=document.querySelector('#mapPanel');
const mapArrow=document.querySelector('#mapArrow');
const activeMap=document.querySelector('#activeMap');
const mapAddress=document.querySelector('#mapAddress');

const euro=value=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(value);
const propertyKey=property=>`${property.listingType}:${property.id}`;
const areaText=property=>property.area&&property.area.toLowerCase()!=='amsterdam'?`Amsterdam ${property.area}`:'Amsterdam';
const priceSuffix=property=>property.listingType==='huur'?'p/m':'k.k.';

function renderDeck(){
  deck.innerHTML='';
  filtered.slice(current,current+3).reverse().forEach(property=>{
    const card=document.createElement('article');
    card.className='property-card';
    card.dataset.key=propertyKey(property);
    const position=filtered.indexOf(property)+1;
    const hasPhotos=property.photos.length>0;
    const photoAttributes=hasPhotos?`tabindex="0" role="button" aria-label="Bekijk alle foto's van ${property.address}"`:'';
    card.innerHTML=`<div class="swipe-stamp next">VOLGENDE</div><div class="swipe-stamp save">BEWAAR</div><div class="card-photo${hasPhotos?'':' no-photo'}" ${photoAttributes}>${hasPhotos?`<img src="${property.photos[0]}" alt="Interieur van ${property.address}">`:''}<span class="date-badge">${property.date}</span>${hasPhotos?`<span class="photo-count">▧ ${property.photos.length} foto's</span>`:''}</div><div class="card-info"><span class="card-number">${String(position).padStart(2,'0')} / ${String(filtered.length).padStart(2,'0')}</span><h2>${property.address}</h2><p class="neighborhood">${areaText(property)}</p><p class="price">${euro(property.price)} <small>${priceSuffix(property)}</small></p><div class="facts"><span class="fact"><strong>${property.size} m²</strong>Wonen</span><span class="fact"><strong>${property.beds}</strong>Slaapkamers</span><span class="fact"><strong>${property.energy}</strong>Energielabel</span></div><span class="feature">${property.feature}</span><div class="property-links">${hasPhotos?'<span class="details-link">Tik op de foto voor meer →</span>':''}${property.url?`<a class="funda-link" href="${property.url}" target="_blank" rel="noopener noreferrer">Bekijk op Funda ↗</a>`:''}</div></div>`;
    deck.appendChild(card);
  });
  const done=current>=filtered.length;
  deck.hidden=done;
  empty.hidden=!done;
  actions.hidden=done;
  renderMap(done?null:filtered[current]);
  progress.innerHTML=filtered.map((_,index)=>`<span class="${index===current?'active':''}"></span>`).join('');
  bindTopCard();
}

function renderMap(property){
  if(!property){mapPanel.hidden=true;mapArrow.hidden=true;activeMap.innerHTML='';return}
  const mapQuery=encodeURIComponent(`${property.address}, Amsterdam`);
  mapPanel.hidden=false;
  mapArrow.hidden=false;
  mapAddress.textContent=property.address;
  activeMap.innerHTML=`<iframe src="https://www.google.com/maps?q=${mapQuery}&output=embed&z=10" title="Kaart van ${property.address}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe><a class="map-link" href="https://www.google.com/maps/search/?api=1&query=${mapQuery}" target="_blank" rel="noopener noreferrer" aria-label="Open ${property.address} in Google Maps">Open in Google Maps ↗</a>`;
}

function bindTopCard(){
  const card=deck.lastElementChild;
  if(!card)return;
  const property=allProperties.find(item=>propertyKey(item)===card.dataset.key);
  if(!property)return;
  const photo=card.querySelector('.card-photo');
  if(property.photos.length){
    photo.onclick=()=>openGallery(property);
    photo.onkeydown=event=>{if(event.key==='Enter')openGallery(property)};
  }
  card.onpointerdown=event=>{
    if(event.target.closest('.card-photo,.funda-link'))return;
    drag={x:event.clientX};
    card.setPointerCapture(event.pointerId);
  };
  card.onpointermove=event=>{
    if(!drag)return;
    const dx=event.clientX-drag.x;
    card.style.transition='none';
    card.style.transform=`translateX(${dx}px) rotate(${dx/30}deg)`;
    card.querySelector(dx>0?'.save':'.next').style.opacity=Math.min(Math.abs(dx)/100,1);
  };
  card.onpointerup=event=>{
    if(!drag)return;
    const dx=event.clientX-drag.x;
    drag=null;
    if(Math.abs(dx)>80)advance(dx>0);
    else{
      card.style.transition='';
      card.style.transform='';
      card.querySelectorAll('.swipe-stamp').forEach(stamp=>stamp.style.opacity=0);
    }
  };
}

function advance(save=false){
  const card=deck.lastElementChild;
  if(!card)return;
  const property=filtered[current];
  if(save&&!currentUser){openAccount();return}
  if(save){saved.add(propertyKey(property));persistSaved();updateSaved()}
  const direction=save?1:-1;
  card.style.transition='transform .32s ease, opacity .32s';
  card.style.transform=`translateX(${direction*900}px) rotate(${direction*18}deg)`;
  card.style.opacity='0';
  setTimeout(()=>{current++;renderDeck()},280);
}

function savedKey(){return `nieuw_saved_${currentUser.toLowerCase()}`}
function persistSaved(){if(currentUser)localStorage.setItem(savedKey(),JSON.stringify([...saved]))}
function loadSaved(){
  const stored=currentUser?JSON.parse(localStorage.getItem(savedKey())||'[]').map(String):[];
  saved=new Set(stored.map(value=>value.includes(':')?value:`koop:${value}`));
  updateSaved();
}
function updateSaved(){
  document.querySelector('#savedCount').textContent=saved.size;
  document.querySelector('#accountLabel').textContent=currentUser?currentUser.split('@')[0]:'Inloggen';
  document.querySelector('#accountButton .avatar').textContent=currentUser?currentUser[0]:'↗';
}

function relativeDate(value){
  if(!value)return'Nieuw';
  const days=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/86400000));
  return days===0?'Vandaag':days===1?'Gisteren':`${days} dagen geleden`;
}

function normalizeProperty(property){
  const listingType=property.listing_type==='huur'?'huur':'koop';
  return{
    id:property.funda_id,
    listingType,
    address:property.address,
    area:property.area||'Amsterdam',
    price:Number(property.price)||0,
    size:Number(property.size)||0,
    beds:Number(property.beds)||0,
    energy:property.energy||'—',
    date:relativeDate(property.published_at),
    feature:property.feature||(listingType==='huur'?'Nieuw te huur':'Nieuw te koop'),
    photos:Array.isArray(property.photos)?property.photos.filter(photo=>typeof photo==='string'&&photo.trim()):[],
    url:property.url||''
  };
}

async function loadLiveProperties(){
  const{data,error}=await supabaseClient.from('properties').select('*').order('published_at',{ascending:false});
  allProperties=!error&&data?data.map(normalizeProperty):[];
  selectMode(activeMode,false);
}

function selectMode(mode,updateUrl=true){
  activeMode=mode==='huur'?'huur':'koop';
  const config=modeConfig[activeMode];
  properties=allProperties.filter(property=>property.listingType===activeMode);
  document.querySelector('#buyMode').classList.toggle('active',activeMode==='koop');
  document.querySelector('#rentMode').classList.toggle('active',activeMode==='huur');
  document.querySelector('#buyMode').setAttribute('aria-pressed',String(activeMode==='koop'));
  document.querySelector('#rentMode').setAttribute('aria-pressed',String(activeMode==='huur'));
  document.querySelector('#introSubtitle').textContent=config.subtitle;
  document.title=config.title;
  document.querySelector('#priceLabel').textContent=config.priceLabel;
  document.querySelector('#priceFilter').dataset.value='all';
  document.querySelector('#areaLabel').textContent=allAreasLabel;
  document.querySelector('#areaFilter').dataset.value=allAreasLabel;
  document.querySelector('#priceDropdown').innerHTML=config.priceOptions.map(option=>`<button data-price="${option.value}">${option.label}</button>`).join('');
  document.querySelector('#emptyState h2').textContent=activeMode==='huur'?'Geen andere actuele huurwoningen':'Geen andere actuele koopwoningen';
  filtered=[...properties];
  current=0;
  setupFilters();
  renderDeck();
  if(updateUrl){
    const url=new URL(location.href);
    url.searchParams.set('aanbod',activeMode);
    history.replaceState({},'',url);
  }
}

function openAccount(){
  const modal=document.querySelector('#accountModal');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
  setTimeout(()=>document.querySelector('#emailInput').focus(),50);
}
function closeAccount(){document.querySelector('#accountModal').classList.remove('open');document.querySelector('#accountModal').setAttribute('aria-hidden','true');document.body.style.overflow=''}

function renderSaved(){
  const list=document.querySelector('#savedList');
  const items=allProperties.filter(property=>saved.has(propertyKey(property)));
  document.querySelector('#userEmail').textContent=currentUser;
  document.querySelector('#userInitial').textContent=currentUser[0];
  list.innerHTML=items.length?items.map(property=>`<article class="saved-property">${property.photos.length?`<img src="${property.photos[0]}" alt="${property.address}">`:'<div class="saved-photo-empty" aria-hidden="true"></div>'}<div class="saved-property-info"><button class="remove-saved" data-remove="${propertyKey(property)}" aria-label="Verwijder ${property.address}">×</button><h3>${property.address}</h3><p>${areaText(property)} · ${property.size} m² · ${property.listingType==='huur'?'Huur':'Koop'}</p><strong>${euro(property.price)} ${priceSuffix(property)}</strong></div></article>`).join(''):`<div class="no-saved"><span>♡</span><h3>Nog niets bewaard</h3><p>Tik op het hartje bij een woning die je mooi vindt.</p></div>`;
}
function openSaved(){if(!currentUser){openAccount();return}renderSaved();document.querySelector('#savedPanel').classList.add('open');document.querySelector('#savedPanel').setAttribute('aria-hidden','false');document.body.style.overflow='hidden'}
function closeSaved(){document.querySelector('#savedPanel').classList.remove('open');document.querySelector('#savedPanel').setAttribute('aria-hidden','true');document.body.style.overflow=''}

function setupFilters(){
  const neighborhoods=[...new Set(properties.map(property=>property.area).filter(area=>area&&area.toLowerCase()!=='amsterdam'))].sort((a,b)=>a.localeCompare(b,'nl'));
  const areas=[allAreasLabel,...neighborhoods];
  document.querySelector('#areaDropdown').innerHTML=areas.map(area=>`<button data-area="${area}">${area}</button>`).join('');
  document.querySelectorAll('.filter-button').forEach(button=>button.onclick=event=>{
    event.stopPropagation();
    const dropdown=button.nextElementSibling;
    document.querySelectorAll('.dropdown').forEach(item=>item!==dropdown&&item.classList.remove('open'));
    dropdown.classList.toggle('open');
    button.setAttribute('aria-expanded',String(dropdown.classList.contains('open')));
  });
  document.onclick=()=>document.querySelectorAll('.dropdown').forEach(dropdown=>dropdown.classList.remove('open'));
  document.querySelector('#priceDropdown').onclick=event=>{
    event.stopPropagation();
    if(!event.target.dataset.price)return;
    document.querySelector('#priceLabel').textContent=event.target.textContent;
    document.querySelector('#priceFilter').dataset.value=event.target.dataset.price;
    applyFilters();
  };
  document.querySelector('#areaDropdown').onclick=event=>{
    event.stopPropagation();
    if(!event.target.dataset.area)return;
    document.querySelector('#areaLabel').textContent=event.target.dataset.area;
    document.querySelector('#areaFilter').dataset.value=event.target.dataset.area;
    applyFilters();
  };
}

function matchesPrice(property,value){
  if(value==='all')return true;
  if(activeMode==='huur')return value==='over4500'?property.price>4500:property.price<=Number(value);
  return value==='over'?property.price>=1000000:property.price<=Number(value)*1000;
}

function applyFilters(){
  const priceValue=document.querySelector('#priceFilter').dataset.value||'all';
  const areaValue=document.querySelector('#areaFilter').dataset.value||allAreasLabel;
  filtered=properties.filter(property=>matchesPrice(property,priceValue)&&(areaValue===allAreasLabel||property.area===areaValue));
  current=0;
  document.querySelectorAll('.dropdown').forEach(dropdown=>dropdown.classList.remove('open'));
  document.querySelectorAll('.filter-button').forEach(button=>button.setAttribute('aria-expanded','false'));
  renderDeck();
}

function openGallery(property){
  if(!property.photos.length)return;
  galleryProperty=property;
  galleryIndex=0;
  updateGallery();
  const modal=document.querySelector('#galleryModal');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
}
function updateGallery(){
  if(!galleryProperty||!galleryProperty.photos.length)return;
  document.querySelector('#galleryImage').src=galleryProperty.photos[galleryIndex];
  document.querySelector('#galleryAddress').textContent=galleryProperty.address;
  document.querySelector('#galleryCounter').textContent=`${galleryIndex+1} / ${galleryProperty.photos.length}`;
  const link=document.querySelector('#galleryFundaLink');
  link.href=galleryProperty.url||'#';
  link.hidden=!galleryProperty.url;
}
function closeGallery(){document.querySelector('#galleryModal').classList.remove('open');document.querySelector('#galleryModal').setAttribute('aria-hidden','true');document.body.style.overflow='';galleryProperty=null}

document.querySelector('#buyMode').onclick=()=>selectMode('koop');
document.querySelector('#rentMode').onclick=()=>selectMode('huur');
document.querySelector('#passButton').onclick=()=>advance(false);
document.querySelector('#likeButton').onclick=()=>advance(true);
document.querySelector('#resetButton').onclick=()=>{current=0;renderDeck()};
document.querySelector('#modalClose').onclick=closeGallery;
document.querySelector('#galleryPrev').onclick=()=>{galleryIndex=(galleryIndex-1+galleryProperty.photos.length)%galleryProperty.photos.length;updateGallery()};
document.querySelector('#galleryNext').onclick=()=>{galleryIndex=(galleryIndex+1)%galleryProperty.photos.length;updateGallery()};
document.querySelector('#galleryModal').onclick=event=>{if(event.target.id==='galleryModal')closeGallery()};
document.onkeydown=event=>{if(!galleryProperty)return;if(event.key==='Escape')closeGallery();if(event.key==='ArrowRight')document.querySelector('#galleryNext').click();if(event.key==='ArrowLeft')document.querySelector('#galleryPrev').click()};
document.querySelector('#accountButton').onclick=()=>currentUser?openSaved():openAccount();
document.querySelector('#savedButton').onclick=openSaved;
document.querySelector('[data-close-account]').onclick=closeAccount;
document.querySelector('[data-close-saved]').onclick=closeSaved;
document.querySelector('#accountModal').onclick=event=>{if(event.target.id==='accountModal')closeAccount()};
document.querySelector('#savedPanel').onclick=event=>{if(event.target.id==='savedPanel')closeSaved()};

document.querySelector('#loginForm').onsubmit=async event=>{
  event.preventDefault();
  const email=document.querySelector('#emailInput').value.trim().toLowerCase();
  const password=document.querySelector('#passwordInput').value;
  const feedback=document.querySelector('#formError');
  feedback.className='form-error';
  feedback.textContent='Even controleren…';
  const{data,error}=await supabaseClient.auth.signInWithPassword({email,password});
  if(!error){currentUser=data.user.email;loadSaved();closeAccount();openSaved();event.target.reset();return}
  const{error:signUpError}=await supabaseClient.auth.signUp({email,password,options:{emailRedirectTo:'https://mijnvastgoed.github.io/'}});
  if(signUpError){feedback.textContent=signUpError.message;return}
  feedback.className='form-error success';
  feedback.textContent='Account gemaakt! Controleer je inbox en klik op de verificatielink.';
};

document.querySelector('#forgotButton').onclick=async()=>{
  const email=document.querySelector('#emailInput').value.trim().toLowerCase();
  const feedback=document.querySelector('#formError');
  feedback.className='form-error';
  if(!email){feedback.textContent='Vul eerst je e-mailadres in.';return}
  const{error}=await supabaseClient.auth.resetPasswordForEmail(email,{redirectTo:'https://mijnvastgoed.github.io/'});
  feedback.className=`form-error${error?'':' success'}`;
  feedback.textContent=error?error.message:'Je ontvangt zo een e-mail om je wachtwoord te wijzigen.';
};

document.querySelector('#logoutButton').onclick=async()=>{await supabaseClient.auth.signOut();currentUser='';saved.clear();closeSaved();updateSaved()};
document.querySelector('#savedList').onclick=event=>{const button=event.target.closest('[data-remove]');if(!button)return;saved.delete(button.dataset.remove);persistSaved();updateSaved();renderSaved()};
supabaseClient.auth.onAuthStateChange(async(event,session)=>{currentUser=session?.user?.email||'';loadSaved();if(event==='PASSWORD_RECOVERY'){const newPassword=window.prompt('Kies een nieuw wachtwoord (minimaal 6 tekens):');if(newPassword){const{error}=await supabaseClient.auth.updateUser({password:newPassword});window.alert(error?error.message:'Je wachtwoord is gewijzigd.')}}});
supabaseClient.auth.getSession().then(({data})=>{currentUser=data.session?.user?.email||'';loadSaved()});
loadLiveProperties();
