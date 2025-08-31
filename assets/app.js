// موادي — PWA with IndexedDB storage (subjects, notes, PDFs, albums/images, audios)
// No frameworks, pure JS.

// Register SW
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}

// PWA install prompt
let deferredPrompt;
const installBtn = document.getElementById('installBtn');
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.hidden = false;
});
installBtn?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.hidden = true;
});

// ------- IndexedDB helper -------
const DB_NAME = 'mosaed-db';
const DB_VER  = 1;

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('subjects')) {
        const s = db.createObjectStore('subjects', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('notes')) {
        const s = db.createObjectStore('notes', { keyPath: 'id', autoIncrement: true });
        s.createIndex('bySubject', 'subjectId');
      }
      if (!db.objectStoreNames.contains('pdfs')) {
        const s = db.createObjectStore('pdfs', { keyPath: 'id', autoIncrement: true });
        s.createIndex('bySubject', 'subjectId');
      }
      if (!db.objectStoreNames.contains('albums')) {
        const s = db.createObjectStore('albums', { keyPath: 'id', autoIncrement: true });
        s.createIndex('bySubject', 'subjectId');
      }
      if (!db.objectStoreNames.contains('images')) {
        const s = db.createObjectStore('images', { keyPath: 'id', autoIncrement: true });
        s.createIndex('byAlbum', 'albumId');
      }
      if (!db.objectStoreNames.contains('audios')) {
        const s = db.createObjectStore('audios', { keyPath: 'id', autoIncrement: true });
        s.createIndex('bySubject', 'subjectId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function tx(store, mode='readonly') {
  return idbOpen().then(db => db.transaction(store, mode));
}
function getAllByIndex(store, indexName, key) {
  return tx(store).then(tr => new Promise((res, rej) => {
    const idx = tr.objectStore(store).index(indexName);
    const req = idx.getAll(key);
    req.onsuccess = () => res(req.result || []);
    req.onerror = () => rej(req.error);
  }));
}
function getAll(store) {
  return tx(store).then(tr => new Promise((res, rej) => {
    const req = tr.objectStore(store).getAll();
    req.onsuccess = () => res(req.result || []);
    req.onerror = () => rej(req.error);
  }));
}
function add(store, value) {
  return tx(store, 'readwrite').then(tr => new Promise((res, rej) => {
    const req = tr.objectStore(store).add(value);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  }));
}
function put(store, value) {
  return tx(store, 'readwrite').then(tr => new Promise((res, rej) => {
    const req = tr.objectStore(store).put(value);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  }));
}
function del(store, key) {
  return tx(store, 'readwrite').then(tr => new Promise((res, rej) => {
    const req = tr.objectStore(store).delete(key);
    req.onsuccess = () => res();
    req.onerror = () => rej(req.error);
  }));
}
function get(store, key) {
  return tx(store).then(tr => new Promise((res, rej) => {
    const req = tr.objectStore(store).get(key);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  }));
}

// ------- UI helpers -------
const $root = document.getElementById('view-root');
const $fab  = document.getElementById('fab');
const $modal = document.getElementById('modal');
const $modalTitle = document.getElementById('modalTitle');
const $modalBody  = document.getElementById('modalBody');
const $modalActions = document.getElementById('modalActions');
document.getElementById('closeModal').onclick = closeModal;
function openModal(title, bodyNode, actions=[]) {
  $modalTitle.textContent = title;
  $modalBody.innerHTML = '';
  $modalBody.appendChild(bodyNode);
  $modalActions.innerHTML = '';
  actions.forEach(a => $modalActions.appendChild(a));
  $modal.classList.remove('hidden');
}
function closeModal(){ $modal.classList.add('hidden'); }
function el(tag, attrs={}, ...children) {
  const n = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.substring(2), v);
    else if (k === 'html') n.innerHTML = v;
    else n.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null) continue;
    n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return n;
}
function toast(msg, ms=1500){
  const t = el('div', {class:'toast'}, msg);
  document.body.appendChild(t);
  setTimeout(()=>t.remove(), ms);
}

function longPress(node, cb, ms=600){
  let timer, startX=0, startY=0;
  const onDown = (e)=>{
    startX = (e.touches?.[0]?.clientX ?? e.clientX);
    startY = (e.touches?.[0]?.clientY ?? e.clientY);
    timer = setTimeout(()=> cb(e), ms);
  };
  const cancel = ()=> { clearTimeout(timer); };
  const onMove = (e)=>{
    const x=(e.touches?.[0]?.clientX ?? e.clientX);
    const y=(e.touches?.[0]?.clientY ?? e.clientY);
    if (Math.hypot(x-startX,y-startY) > 10) clearTimeout(timer);
  };
  node.addEventListener('pointerdown', onDown);
  node.addEventListener('pointerup', cancel);
  node.addEventListener('pointerleave', cancel);
  node.addEventListener('pointermove', onMove);
}

// ------- Subjects (Main Screen) -------
const ICONS = ['📘','📗','📕','📙','🧪','🧮','💻','🌍'];
const LEVELS = ['ممتاز','جيد جدا','جيد','مقبول','ضعيف','أحتاج مُساعدة'];
const COLORS = ['#16a34a','#2563eb','#dc2626','#eab308','#a855f7','#06b6d4','#f59e0b','#f97316'];

function renderMain(){
  Promise.all([getAll('subjects')]).then(([subjects])=>{
    $root.innerHTML = '';
    const list = el('div', {class:'grid'});
    subjects.sort((a,b)=>a.name.localeCompare(b.name,'ar'));
    subjects.forEach(s=>{
      const card = el('div', {class:'subject', style:`background:${hexWithAlpha(s.color,0.15)};border-color:${hexWithAlpha(s.color,0.4)}`},
        el('div',{class:'left'}, s.icon || '📘'),
        el('div',{class:'mid'},
          el('div',{}, s.name),
          el('div',{class:'small'}, `المستوى: ${s.level || '—'}`)
        ),
        el('div',{}, el('span', {class:'pill'}, 'فتح ▶'))
      );
      card.addEventListener('click', ()=> openSubject(s.id));
      longPress(card, async ()=>{
        if (confirm('حذف المادة؟ سيتم حذف كل ما بداخلها.')){
          await cascadeDeleteSubject(s.id);
          toast('تم الحذف');
          renderMain();
        }
      });
      list.appendChild(card);
    });
    const wrap = el('div',{}, list);
    $root.appendChild(wrap);
    // FAB for new subject
    $fab.onclick = addSubjectDialog;
    $fab.title = 'إضافة مادة';
    $fab.style.background = '#1f2937';
  });
}

async function cascadeDeleteSubject(id){
  // delete child entities
  const notes  = await getAllByIndex('notes','bySubject',id);
  const pdfs   = await getAllByIndex('pdfs','bySubject',id);
  const albums = await getAllByIndex('albums','bySubject',id);
  const audios = await getAllByIndex('audios','bySubject',id);
  for (const n of notes) await del('notes', n.id);
  for (const p of pdfs)  await del('pdfs',  p.id);
  for (const a of albums){
    const imgs = await getAllByIndex('images','byAlbum',a.id);
    for (const im of imgs) await del('images', im.id);
    await del('albums', a.id);
  }
  for (const a of audios) await del('audios', a.id);
  await del('subjects', id);
}

function addSubjectDialog(){
  const body = el('div',{},
    el('label',{},'اسم المادة'),
    el('input',{class:'input', id:'sName', placeholder:'مثال: رياضيات'}),
    el('div',{class:'row', style:'margin-top:10px'},
      el('div',{}, el('label',{},'الأيقونة'),
        iconPicker('sIcon')
      ),
      el('div',{}, el('label',{},'المستوى'),
        levelPicker('sLevel')
      ),
    ),
    el('div',{style:'margin-top:10px'},
      el('label',{},'اللون'),
      colorPicker('sColor')
    )
  );
  const saveBtn = el('button',{class:'btn primary'},'حفظ');
  saveBtn.onclick = async ()=>{
    const name = body.querySelector('#sName').value?.trim();
    const icon = body.querySelector('[data-key="sIcon"].active')?.dataset.val || '📘';
    const level= body.querySelector('#sLevel').value;
    const color= body.querySelector('[data-key="sColor"].active')?.dataset.val || COLORS[0];
    if (!name) return toast('اكتب اسم المادة');
    const id = await add('subjects',{name, icon, level, color, createdAt: Date.now()});
    closeModal();
    renderMain();
  };
  openModal('إضافة مادة', body, [saveBtn]);
}

function iconPicker(key){
  const w = el('div',{class:'icon-choice'});
  ICONS.forEach((i,idx)=>{
    const b = el('button',{'data-key':key,'data-val':i}, i);
    b.onclick = ()=>{
      [...w.children].forEach(c=>c.classList.remove('active'));
      b.classList.add('active');
    };
    if(idx===0) b.classList.add('active');
    w.appendChild(b);
  });
  return w;
}
function levelPicker(id){
  const s = el('select',{class:'select', id});
  LEVELS.forEach(v=> s.appendChild(el('option',{}, v)) );
  return s;
}
function colorPicker(key){
  const row = el('div',{class:'row3'});
  COLORS.forEach((c,idx)=>{
    const b = el('button',{class:'color-swatch', style:`background:${c}`,'data-key':key,'data-val':c});
    b.onclick = ()=>{
      [...row.children].forEach(c=>c.classList.remove('active'));
      b.classList.add('active');
    };
    if(idx===0) b.classList.add('active');
    row.appendChild(b);
  });
  return row;
}
function hexWithAlpha(hex, a){
  const c = hex.replace('#','');
  const n = parseInt(c,16);
  const r = (n>>16)&255, g=(n>>8)&255, b=n&255;
  return `rgba(${r},${g},${b},${a})`;
}

// ------- Subject details & tabs -------
function openSubject(subjectId){
  Promise.all([get('subjects', subjectId)]).then(async ([s])=>{
    if (!s) return;
    $root.innerHTML = '';
    const headRow = el('div',{class:'card'},
      el('div',{style:'display:flex;align-items:center;gap:10px;justify-content:space-between'},
        el('div',{}, `${s.icon} ${s.name}`),
        el('div',{},
          el('button',{class:'btn', onclick:()=>editSubjectDialog(s)},'تعديل'),
          ' ',
          el('button',{class:'btn ghost', onclick:renderMain},'رجوع')
        )
      ),
      el('div',{class:'small', style:`margin-top:6px;color:${s.color}`}, `المستوى: ${s.level}`)
    );
    const tabs = [
      {key:'notes',  label:'ملاحظات', color:'var(--green)'},
      {key:'pdfs',   label:'ملفات PDF', color:'var(--blue)'},
      {key:'images', label:'الصور', color:'var(--red)'},
      {key:'audios', label:'الصوتيات', color:'var(--yellow)'}
    ];
    let active = 'notes';
    const tabsBar = el('div',{class:'tabs'});
    tabs.forEach(t=>{
      const b = el('button',{class:'tab'+(t.key===active?' active':''), 'data-key':t.key}, t.label);
      b.onclick = ()=>{
        active = t.key;
        [...tabsBar.children].forEach(c=>c.classList.toggle('active', c.dataset.key===active));
        renderTab();
      };
      tabsBar.appendChild(b);
    });
    const section = el('div',{class:'section green', id:'section'});
    $root.append(headRow, tabsBar, section);

    function renderTab(){
      // set border color
      section.className = 'section ' + (active==='notes'?'green':active==='pdfs'?'blue':active==='images'?'red':'yellow');
      if (active==='notes') renderNotes();
      if (active==='pdfs') renderPDFs();
      if (active==='images') renderAlbums();
      if (active==='audios') renderAudios();
    }

    // FAB behaviors per-tab
    function setFab(color, handler, title='إضافة'){
      $fab.style.background = color;
      $fab.onclick = handler;
      $fab.title = title;
    }

    // ---- Notes tab ----
    async function renderNotes(){
      const list = await getAllByIndex('notes','bySubject',subjectId);
      section.innerHTML = '';
      const grid = el('div',{class:'grid'});
      list.sort((a,b)=>b.createdAt-a.createdAt).forEach(n=>{
        const note = el('div',{class:'note-card', title:'انقر للعرض — ضغطة مطولة للحذف'},
          el('div',{class:'small'}, n.title || 'بدون عنوان'),
          el('div',{}, (n.content||'').slice(0,90)+( (n.content||'').length>90?'…':'' ))
        );
        note.onclick = ()=>{
          const body = el('div',{},
            el('div',{class:'small', style:'margin-bottom:8px'}, n.title || '—'),
            el('div',{}, n.content || '—')
          );
          const delBtn = el('button',{class:'btn'},'حذف');
          delBtn.onclick = async ()=>{ await del('notes', n.id); closeModal(); renderNotes(); };
          openModal('ملاحظة', body, [delBtn, el('button',{class:'btn ghost',onclick:closeModal},'إغلاق')]);
        };
        longPress(note, async ()=>{
          if (confirm('حذف الملاحظة؟')){ await del('notes', n.id); renderNotes(); }
        });
        grid.appendChild(note);
      });
      section.appendChild(grid);
      setFab('var(--green)', ()=>addNoteDialog(), 'إضافة ملاحظة');
    }
    function addNoteDialog(){
      const body = el('div',{},
        el('label',{},'العنوان'),
        el('input',{class:'input', id:'nTitle', placeholder:'عنوان مختصر'}),
        el('label',{style:'margin-top:8px;display:block'},'النص'),
        el('textarea',{rows:'6', class:'input', id:'nContent', placeholder:'اكتب ملاحظتك هنا...'})
      );
      const saveBtn = el('button',{class:'btn primary'},'حفظ');
      saveBtn.onclick = async ()=>{
        const title = body.querySelector('#nTitle').value.trim();
        const content = body.querySelector('#nContent').value.trim();
        await add('notes',{subjectId, title, content, createdAt: Date.now()});
        closeModal(); renderNotes();
      };
      openModal('إضافة ملاحظة', body, [saveBtn]);
    }

    // ---- PDFs tab ----
    async function renderPDFs(){
      const list = await getAllByIndex('pdfs','bySubject',subjectId);
      section.innerHTML = '';
      const stack = el('div',{});
      list.sort((a,b)=>b.createdAt-a.createdAt).forEach(p=>{
        const row = el('div',{class:'item-row', title:'انقر للفتح — ضغطة مطولة للحذف'},
          el('div',{},'📄'),
          el('div',{style:'flex:1'}, p.name || 'ملف'),
          el('div',{class:'badge'}, humanSize(p.blobSize||0))
        );
        row.onclick = async ()=>{
          const file = await get('pdfs', p.id);
          if (!file?.blob){ toast('لا يمكن فتح الملف'); return; }
          const url = URL.createObjectURL(file.blob);
          // Inform the user to open with device PDF viewer
          const a = document.createElement('a');
          a.href = url; a.target = '_blank'; a.download = (p.name||'file')+'.pdf';
          a.click();
          setTimeout(()=> URL.revokeObjectURL(url), 10_000);
        };
        longPress(row, async ()=>{
          if (confirm('حذف الملف؟')) { await del('pdfs', p.id); renderPDFs(); }
        });
        stack.appendChild(row);
      });
      section.appendChild(stack);
      setFab('var(--blue)', ()=>addPDFDialog(), 'إضافة PDF');
    }
    function addPDFDialog(){
      const body = el('div',{},
        el('label',{},'اسم الملف'),
        el('input',{class:'input', id:'pName', placeholder:'اسم اختياري'}),
        el('label',{style:'margin-top:8px;display:block'},'اختر PDF'),
        el('input',{type:'file', accept:'application/pdf', id:'pFile', class:'input'}),
        el('div',{class:'small', style:'margin-top:6px'},'سيتم حفظ الملف داخل التطبيق (IndexedDB).')
      );
      const saveBtn = el('button',{class:'btn primary'},'حفظ');
      saveBtn.onclick = async ()=>{
        const name = body.querySelector('#pName').value.trim() || 'PDF';
        const file = body.querySelector('#pFile').files?.[0];
        if (!file) return toast('اختر ملف PDF');
        const blob = file.slice(0, file.size, 'application/pdf');
        await add('pdfs',{subjectId, name, blob, blobSize:file.size, createdAt: Date.now()});
        closeModal(); renderPDFs();
      };
      openModal('إضافة ملف PDF', body, [saveBtn]);
    }

    // ---- Images tab: Albums -> Images ----
    async function renderAlbums(){
      section.innerHTML = '';
      const albums = await getAllByIndex('albums','bySubject',subjectId);
      const grid = el('div',{});
      albums.sort((a,b)=>b.createdAt-a.createdAt).forEach(a=>{
        const row = el('div',{class:'album', title:'انقر للفتح — ضغطة مطولة للحذف'},
          el('div',{class:'color-swatch', style:`width:24px;background:${a.color||'#dc2626'}`},''),
          el('div',{style:'flex:1'}, a.name || 'ألبوم'),
          el('div',{class:'badge'}, 'صور')
        );
        row.onclick = ()=> openAlbum(a);
        longPress(row, async ()=>{
          if (confirm('حذف الألبوم بكل صوره؟')){
            const imgs = await getAllByIndex('images','byAlbum',a.id);
            for (const im of imgs) await del('images', im.id);
            await del('albums', a.id);
            renderAlbums();
          }
        });
        grid.appendChild(row);
      });
      section.appendChild(grid);
      setFab('var(--red)', ()=>addAlbumDialog(), 'إضافة خانة/ألبوم');
    }
    function addAlbumDialog(){
      const body = el('div',{},
        el('label',{},'اسم الخانة / الألبوم'),
        el('input',{class:'input', id:'aName', placeholder:'مثال: واجبات'}),
        el('label',{style:'margin-top:8px;display:block'},'اللون'),
        colorPicker('aColor')
      );
      const saveBtn = el('button',{class:'btn primary'},'حفظ');
      saveBtn.onclick = async ()=>{
        const name = body.querySelector('#aName').value.trim() || 'ألبوم';
        const color= body.querySelector('[data-key="aColor"].active')?.dataset.val || '#dc2626';
        const id = await add('albums',{subjectId, name, color, createdAt: Date.now()});
        closeModal(); renderAlbums(); openAlbum({id, subjectId, name, color});
      };
      openModal('إضافة خانة', body, [saveBtn]);
    }

    async function openAlbum(album){
      if (typeof album === 'number') album = await get('albums', album);
      const imgs = await getAllByIndex('images','byAlbum', album.id);
      section.innerHTML = '';
      section.appendChild(el('div',{class:'small', style:'margin-bottom:8px'}, `الألبوم: ${album.name}`));
      const grid = el('div',{class:'image-grid'});
      imgs.sort((a,b)=>b.createdAt-a.createdAt).forEach(img=>{
        const url = URL.createObjectURL(img.blob);
        const im = new Image();
        im.src = url;
        im.alt = img.name || 'صورة';
        im.title = 'انقر للتكبير — ضغطة مطولة للحذف';
        im.onclick = ()=> openViewer(url);
        longPress(im, async ()=>{
          if (confirm('حذف الصورة؟')){ await del('images', img.id); URL.revokeObjectURL(url); openAlbum(album); }
        });
        grid.appendChild(im);
      });
      section.appendChild(grid);
      setFab('var(--red)', ()=>addImagesDialog(album), 'إضافة صور');
    }
    function addImagesDialog(album){
      const body = el('div',{},
        el('label',{},'اختر صورًا'),
        el('input',{type:'file', multiple:true, accept:'image/*', id:'imgs', class:'input'}),
        el('div',{class:'small', style:'margin-top:6px'},'تُحفظ الصور داخل IndexedDB.')
      );
      const saveBtn = el('button',{class:'btn primary'},'حفظ');
      saveBtn.onclick = async ()=>{
        const files = body.querySelector('#imgs').files;
        if (!files || !files.length) return toast('اختر صور');
        for (const f of files){
          const blob = await f.slice(0, f.size, f.type);
          await add('images',{albumId: album.id, name:f.name, blob, createdAt: Date.now()});
        }
        closeModal(); openAlbum(album);
      };
      openModal('إضافة صور', body, [saveBtn]);
    }

    // Fullscreen viewer with click to close and wheel/touch zoom
    const viewer = el('div',{class:'viewer hidden'});
    const vImg = new Image();
    viewer.appendChild(vImg);
    document.body.appendChild(viewer);
    function openViewer(url){
      vImg.src = url;
      viewer.classList.remove('hidden');
      let scale = 1;
      vImg.style.transform = 'scale(1)';
      viewer.onclick = ()=> { viewer.classList.add('hidden'); vImg.src=''; };
      viewer.onwheel = (e)=>{
        e.preventDefault();
        scale += (e.deltaY < 0 ? 0.1 : -0.1);
        scale = Math.min(Math.max(scale, 1), 4);
        vImg.style.transform = `scale(${scale})`;
      };
      let start = null;
      viewer.ontouchstart = (e)=> { start = e.touches[0]; };
      viewer.ontouchmove = (e)=>{
        if (e.touches.length===2){
          const d = dist(e.touches[0], e.touches[1]);
          const d0 = dist(start, e.touches[1]||start);
          scale = Math.min(Math.max(d/d0, 1), 4);
          vImg.style.transform = `scale(${scale})`;
        }
      };
    }
    function dist(a,b){ if(!a||!b) return 1; return Math.hypot(a.clientX-b.clientX, a.clientY-b.clientY); }

    // ---- Audios tab ----
    async function renderAudios(){
      const list = await getAllByIndex('audios','bySubject',subjectId);
      section.innerHTML = '';
      const stack = el('div',{});
      list.sort((a,b)=>b.createdAt-a.createdAt).forEach(item=>{
        const audio = document.createElement('audio');
        audio.src = URL.createObjectURL(item.blob);
        audio.preload = 'metadata';
        const row = el('div',{class:'item-row', title:'تشغيل — ضغطة مطولة للحذف'},
          el('div',{},'🎵'),
          el('div',{style:'flex:1'}, item.name || 'تسجيل'),
          el('div',{class:'badge', id:`t${item.id}`}, '0:00')
        );
        audio.addEventListener('timeupdate', ()=>{
          const t = document.getElementById(`t${item.id}`);
          if (t) t.textContent = formatTime(audio.currentTime);
        });
        row.onclick = ()=>{
          // Toggle play/pause
          if (audio.paused) audio.play(); else audio.pause();
        };
        longPress(row, async ()=>{
          if (confirm('حذف الملف الصوتي؟')){ await del('audios', item.id); renderAudios(); }
        });
        stack.appendChild(row);
      });
      section.appendChild(stack);
      setFab('var(--yellow)', ()=>addAudioDialog(), 'إضافة صوت');
    }
    function addAudioDialog(){
      const body = el('div',{},
        el('label',{},'اسم الملف الصوتي'),
        el('input',{class:'input', id:'aName', placeholder:'اسم اختياري'}),
        el('label',{style:'margin-top:8px;display:block'},'اختر ملف صوتي'),
        el('input',{type:'file', accept:'audio/*', id:'aFile', class:'input'})
      );
      const saveBtn = el('button',{class:'btn primary'},'حفظ');
      saveBtn.onclick = async ()=>{
        const name = body.querySelector('#aName').value.trim() || 'صوت';
        const file = body.querySelector('#aFile').files?.[0];
        if (!file) return toast('اختر ملف صوتي');
        const blob = await file.slice(0, file.size, file.type || 'audio/*');
        await add('audios',{subjectId, name, blob, createdAt: Date.now()});
        closeModal(); renderAudios();
      };
      openModal('إضافة صوت', body, [saveBtn]);
    }

    renderTab();
  });
}

function editSubjectDialog(s){
  const body = el('div',{},
    el('label',{},'اسم المادة'),
    el('input',{class:'input', id:'sName', value:s.name}),
    el('div',{class:'row', style:'margin-top:10px'},
      el('div',{}, el('label',{},'الأيقونة'), iconPicker('sIcon')),
      el('div',{}, el('label',{},'المستوى'), levelPicker('sLevel'))
    ),
    el('div',{style:'margin-top:10px'}, el('label',{},'اللون'), colorPicker('sColor'))
  );
  // preselects
  setTimeout(()=>{
    for (const b of body.querySelectorAll('[data-key="sIcon"]')) if (b.dataset.val===s.icon) b.classList.add('active');
    body.querySelector('#sLevel').value = s.level;
    for (const b of body.querySelectorAll('[data-key="sColor"]')) if (b.dataset.val===s.color) b.classList.add('active');
  },0);
  const saveBtn = el('button',{class:'btn primary'},'حفظ');
  saveBtn.onclick = async ()=>{
    s.name = body.querySelector('#sName').value.trim() || s.name;
    s.icon = body.querySelector('[data-key="sIcon"].active')?.dataset.val || s.icon;
    s.level= body.querySelector('#sLevel').value || s.level;
    s.color= body.querySelector('[data-key="sColor"].active')?.dataset.val || s.color;
    await put('subjects', s);
    closeModal();
    // reflect on main if we are there
    const title = document.querySelector('#appTitle');
    if (title) { /* noop */ }
    // re-render current subject screen
    openSubject(s.id);
  };
  const delBtn = el('button',{class:'btn'},'حذف المادة');
  delBtn.onclick = async ()=>{
    if (confirm('حذف هذه المادة وكل محتوياتها؟')){
      await cascadeDeleteSubject(s.id);
      closeModal(); renderMain();
    }
  };
  openModal('تعديل المادة', body, [saveBtn, delBtn, el('button',{class:'btn ghost',onclick:closeModal},'إلغاء')]);
}

// Helpers
function humanSize(n){
  if (!n) return '—';
  const u=['B','KB','MB','GB']; let i=0; while(n>1024 && i<u.length-1){ n/=1024; i++; }
  return `${n.toFixed(1)} ${u[i]}`;
}
function formatTime(sec){ const m=Math.floor(sec/60), s=Math.floor(sec%60); return `${m}:${s.toString().padStart(2,'0')}`; }

// Initial render
renderMain();
