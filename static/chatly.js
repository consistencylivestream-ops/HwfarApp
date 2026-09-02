/* HwFar's browser client. Pages are server-rendered; this file only owns
   interactions and the live transport for the page currently on screen. */
const $ = (s) => document.querySelector(s);
const esc = (value) => { const d = document.createElement('div'); d.textContent = value == null ? '' : value; return d.innerHTML; };
const token = () => localStorage.getItem('chatly_token');
const api = async (path, options = {}) => {
  const headers = {'Content-Type':'application/json', ...(options.headers || {})};
  if (token()) headers.Authorization = 'Bearer ' + token();
  try {
    const res = await fetch(path, {...options, headers});
    let body = null; try { body = await res.json(); } catch (_) {}
    if (res.status === 401 && location.pathname !== '/') { localStorage.removeItem('chatly_token'); location.href = '/'; }
    return {ok:res.ok, status:res.status, body};
  } catch (_) {
    return {ok:false,status:0,body:{error:'Could not reach HwFar. Check that the server is running.'}};
  }
};
const avatarColor = (name) => {
  let n = 0; for (const c of name || '?') n = c.charCodeAt(0) + ((n << 5) - n);
  return ['#00a884','#6b7fd7','#d77e9c','#d7a94a','#4aa9d7','#9b6bd7','#d76b6b'][Math.abs(n) % 7];
};
const avatar = (user, image, size=44, online=false) => `<div class="avatar" style="width:${size}px;height:${size}px;background:${image?'transparent':avatarColor(user)}">${image ? `<img src="${esc(image)}" alt="">` : esc((user||'?').slice(0,2).toUpperCase())}${online ? '<span class="dot"></span>' : '<span class="dot off"></span>'}</div>`;
const COUNTRIES = ["Afghanistan","Albania","Algeria","Andorra","Angola","Antigua and Barbuda","Argentina","Armenia","Australia","Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Barbados","Belarus","Belgium","Belize","Benin","Bhutan","Bolivia","Bosnia and Herzegovina","Botswana","Brazil","Brunei","Bulgaria","Burkina Faso","Burundi","Cabo Verde","Cambodia","Cameroon","Canada","Central African Republic","Chad","Chile","China","Colombia","Comoros","Congo (Republic of the)","Costa Rica","Côte d’Ivoire","Croatia","Cuba","Cyprus","Czechia","Democratic Republic of the Congo","Denmark","Djibouti","Dominica","Dominican Republic","Ecuador","Egypt","El Salvador","Equatorial Guinea","Eritrea","Estonia","Eswatini","Ethiopia","Fiji","Finland","France","Gabon","Gambia","Georgia","Germany","Ghana","Greece","Grenada","Guatemala","Guinea","Guinea-Bissau","Guyana","Haiti","Honduras","Hungary","Iceland","India","Indonesia","Iran","Iraq","Ireland","Israel","Italy","Jamaica","Japan","Jordan","Kazakhstan","Kenya","Kiribati","Kuwait","Kyrgyzstan","Laos","Latvia","Lebanon","Lesotho","Liberia","Libya","Liechtenstein","Lithuania","Luxembourg","Madagascar","Malawi","Malaysia","Maldives","Mali","Malta","Marshall Islands","Mauritania","Mauritius","Mexico","Micronesia","Moldova","Monaco","Mongolia","Montenegro","Morocco","Mozambique","Myanmar","Namibia","Nauru","Nepal","Netherlands","New Zealand","Nicaragua","Niger","Nigeria","North Korea","North Macedonia","Norway","Oman","Pakistan","Palau","Palestine","Panama","Papua New Guinea","Paraguay","Peru","Philippines","Poland","Portugal","Qatar","Romania","Russia","Rwanda","Saint Kitts and Nevis","Saint Lucia","Saint Vincent and the Grenadines","Samoa","San Marino","Sao Tome and Principe","Saudi Arabia","Senegal","Serbia","Seychelles","Sierra Leone","Singapore","Slovakia","Slovenia","Solomon Islands","Somalia","South Africa","South Korea","South Sudan","Spain","Sri Lanka","Sudan","Suriname","Sweden","Switzerland","Syria","Taiwan","Tajikistan","Tanzania","Thailand","Timor-Leste","Togo","Tonga","Trinidad and Tobago","Tunisia","Türkiye","Turkmenistan","Tuvalu","Uganda","Ukraine","United Arab Emirates","United Kingdom","United States","Uruguay","Uzbekistan","Vanuatu","Vatican City","Venezuela","Vietnam","Yemen","Zambia","Zimbabwe"];
const I18N={fr:{
  "Welcome back":"Bon retour","Private messages, made simple.":"Des messages privés, en toute simplicité.",
  "Username":"Nom d’utilisateur","Password":"Mot de passe","Password (6+ characters)":"Mot de passe (6 caractères ou plus)",
  "Log in":"Se connecter","Create your account":"Créer votre compte",
  "A safer, more personal way to chat.":"Une façon plus sûre et personnelle de discuter.",
  "Don't have an account?":"Vous n’avez pas de compte ?","Sign up":"S’inscrire","Already have an account?":"Vous avez déjà un compte ?",
  "Create your HwFar account.":"Créez votre compte HwFar.","Continue":"Continuer","Back":"Retour",
  "Which language do you prefer?":"Quelle langue préférez-vous ?",
  "HwFar will use this choice throughout the app. You can change it later in Settings.":"HwFar utilisera ce choix dans toute l’application. Vous pourrez le modifier plus tard dans les paramètres.",
  "Choose a language":"Choisissez une langue","Where are you based?":"Où habitez-vous ?",
  "This helps us make HwFar feel local to you.":"Cela nous aide à adapter HwFar à votre région.","Select your country":"Sélectionnez votre pays",
  "Profile photo":"Photo de profil","Add a photo so people know it’s you.":"Ajoutez une photo pour que les autres vous reconnaissent.",
  "Upload profile photo":"Télécharger une photo de profil","Basic information":"Informations de base",
  "Tell us your age and gender":"Indiquez votre âge et votre genre","Age":"Âge","Gender":"Genre",
  "Female":"Femme","Male":"Homme","Non-binary":"Non binaire","Prefer not to say":"Je préfère ne pas le dire",
  "Choose what people can see. You can change this later in Privacy.":"Choisissez ce que les autres peuvent voir. Vous pourrez modifier cela plus tard dans Confidentialité.",
  "Show my age on my profile":"Afficher mon âge sur mon profil","Show my gender on my profile":"Afficher mon genre sur mon profil",
  "Keep HwFar welcoming":"Gardons HwFar accueillant","Review these guidelines before you join.":"Consultez ces règles avant de rejoindre HwFar.",
  "HwFar Community Guidelines":"Règles de la communauté HwFar","Be respectful":"Soyez respectueux",
  "Share quality content":"Partagez du contenu de qualité","Protect privacy":"Protégez la vie privée",
  "Do not misuse HwFar":"N’utilisez pas HwFar à mauvais escient","Keep conversations safe":"Gardez les conversations sûres",
  "Help us protect the community":"Aidez-nous à protéger la communauté","One more thing":"Une dernière chose",
  "I have read and accept the Community Guidelines.":"J’ai lu et j’accepte les règles de la communauté.",
  "Quick human check":"Vérification rapide","Loading verification…":"Chargement de la vérification…","Your answer":"Votre réponse",
  "Create account":"Créer le compte","Toggle theme":"Changer de thème","Chats":"Discussions","Discover":"Découvrir",
  "Signup progress":"Progression de l’inscription","Profile preview":"Aperçu du profil",
  "Statuses":"Statuts","Status":"Statut","Calls":"Appels","New chat":"Nouvelle discussion","Settings":"Paramètres",
  "Log out":"Se déconnecter","Back to chats":"Retour aux discussions","Search or start a new chat":"Rechercher ou commencer une discussion",
  "Send private messages with the people you care about.":"Envoyez des messages privés aux personnes qui comptent pour vous.",
  "Call this person":"Appeler cette personne","Disappearing messages":"Messages éphémères","Off":"Désactivé",
  "Add an attachment":"Ajouter une pièce jointe","Type a message":"Écrire un message","Send message":"Envoyer le message",
  "Find people who chose to be visible.":"Trouvez les personnes qui ont choisi d’être visibles.",
  "Search by username":"Rechercher par nom d’utilisateur","Loading…":"Chargement…","No suggestions right now.":"Aucune suggestion pour le moment.",
  "Message":"Message","Call":"Appeler","Country":"Pays","Not added":"Non renseigné","Private":"Privé","Available to chat":"Disponible pour discuter",
  "Search by exact username and start a private conversation.":"Recherchez un nom d’utilisateur exact et commencez une conversation privée.",
  "Start chat":"Commencer","Enter a username.":"Saisissez un nom d’utilisateur.","Recent calls":"Appels récents","Last 40":"40 derniers",
  "Choose someone to call":"Choisissez quelqu’un à appeler","Private audio and video calls":"Appels audio et vidéo privés",
  "Enter exact username":"Saisissez le nom d’utilisateur exact","Call type":"Type d’appel","Audio":"Audio","Video":"Vidéo",
  "End call":"Terminer l’appel","Start call":"Démarrer l’appel","Mute microphone":"Couper le micro",
  "Turn camera off":"Désactiver la caméra","Decline":"Refuser","Accept":"Accepter","No calls yet.":"Aucun appel pour le moment.",
  "Missed call":"Appel manqué","Accepted call":"Appel accepté","Completed call":"Appel terminé","Calling":"Appel en cours",
  "Share a thought, photo, video, or audio for 48 hours.":"Partagez une pensée, une photo, une vidéo ou un audio pendant 48 heures.",
  "Add status":"Ajouter un statut","Your status":"Votre statut","Expires in 48h":"Expire dans 48 h","Write a status update…":"Écrivez un statut…",
  "Who can view this?":"Qui peut voir ceci ?","Everyone in HwFar":"Tout le monde sur HwFar","Only mutual friends":"Amis communs uniquement",
  "Only selected people":"Personnes sélectionnées uniquement","Share with usernames":"Partager avec ces noms d’utilisateur",
  "Hide from usernames":"Masquer pour ces noms d’utilisateur","(optional)":"(facultatif)","Post status":"Publier le statut",
  "Recent statuses":"Statuts récents","Newest first":"Plus récents d’abord","Edit":"Modifier","Delete":"Supprimer",
  "Reshare":"Partager à nouveau","Viewed by":"Vu par","No one has viewed this status yet.":"Personne n’a encore vu ce statut.",
  "Reshared status":"Statut partagé à nouveau","views":"vues","years":"ans",
  "Make HwFar feel like yours. You can change your privacy choices whenever you want.":"Personnalisez HwFar. Vous pouvez modifier vos choix de confidentialité à tout moment.",
  "Account":"Compte","Change your username or log out.":"Modifiez votre nom d’utilisateur ou déconnectez-vous.",
  "Privacy":"Confidentialité","Choose who can see your online status, age, and gender.":"Choisissez qui peut voir votre présence, votre âge et votre genre.",
  "Appearance":"Apparence","Theme and interface preferences.":"Thème et préférences d’interface.",
  "Notifications":"Notifications","Message alerts on this browser.":"Alertes de messages sur ce navigateur.",
  "Language":"Langue","Choose the interface language.":"Choisissez la langue de l’interface.",
  "New username":"Nouveau nom d’utilisateur","Save":"Enregistrer","Show online and last-seen status":"Afficher la présence et la dernière activité",
  "People will only see this while you allow it.":"Les autres ne le verront que lorsque vous l’autorisez.",
  "Show my age":"Afficher mon âge","Your age stays hidden from your profile until you turn this on.":"Votre âge reste masqué jusqu’à activation.",
  "Show my gender":"Afficher mon genre","You can keep this private and still use HwFar normally.":"Vous pouvez garder cela privé et utiliser HwFar normalement.",
  "Dark theme":"Thème sombre","Stored on this device.":"Enregistré sur cet appareil.",
  "Browser notifications":"Notifications du navigateur","Get alerts for new messages when HwFar is in the background.":"Recevez des alertes pour les nouveaux messages quand HwFar est en arrière-plan.",
  "Notification sound":"Son de notification","Call ringtone":"Sonnerie d’appel","Language saved.":"Langue enregistrée.",
  "Today":"Aujourd’hui","Yesterday":"Hier","online":"en ligne","last seen":"dernière activité","last seen ":"dernière activité ","today at ":"aujourd’hui à ","yesterday at ":"hier à "
  ,"HwFar — sign in":"HwFar — connexion","HwFar — chats":"HwFar — discussions","HwFar — discover":"HwFar — découvrir",
  "HwFar — statuses":"HwFar — statuts","HwFar — calls":"HwFar — appels","HwFar — settings":"HwFar — paramètres","HwFar — new chat":"HwFar — nouvelle discussion"
  ,"Start a conversation":"Commencer une conversation","No matches.":"Aucun résultat.","No chats yet — start a new one.":"Aucune discussion — commencez-en une nouvelle.",
  "You: ":"Vous : ","Voice message":"Message vocal","Photo":"Photo","This message was deleted":"Ce message a été supprimé",
  "(edited)":"(modifié)","Edit message":"Modifier le message","Delete message":"Supprimer le message","typing…":"écrit…",
  "Story type":"Type de statut","Text":"Texte","Add a caption (optional)":"Ajouter une légende (facultatif)",
  "Tap to record an audio status":"Appuyez pour enregistrer un statut audio","Record":"Enregistrer","Record again":"Enregistrer à nouveau",
  "Stop":"Arrêter","Loading stories…":"Chargement des statuts…","is calling":"vous appelle",
  "Incoming audio call":"Appel audio entrant","Incoming video call":"Appel vidéo entrant","Enter a username to begin":"Saisissez un nom d’utilisateur pour commencer",
  "Camera on":"Caméra activée","Camera off":"Caméra désactivée","Microphone on":"Micro activé","Microphone muted":"Micro coupé",
  "Unmute microphone":"Réactiver le micro","Connected":"Connecté","Call ended.":"Appel terminé.","Call declined.":"Appel refusé",
  "Viewed by":"Vu par"
}};
let currentLanguage=localStorage.getItem('hwfar_language')==='fr'?'fr':'en', translationObserver=null;
const tr=value=>currentLanguage==='fr'?(I18N.fr[value]||value):value;
function applyTranslations(root=document){
  document.documentElement.lang=currentLanguage;
  if(currentLanguage==='fr'&&document.title)document.title=tr(document.title);
  const scope=root.nodeType===1?root:document, walker=document.createTreeWalker(scope,NodeFilter.SHOW_TEXT);
  const nodes=[];let node;while(node=walker.nextNode())nodes.push(node);
  nodes.forEach(textNode=>{
    const original=textNode.nodeValue, trimmed=original.trim();
    if(trimmed&&I18N.fr[trimmed])textNode.nodeValue=original.replace(trimmed,tr(trimmed));
  });
  scope.querySelectorAll?.('[placeholder],[title],[aria-label]').forEach(el=>{
    ['placeholder','title','aria-label'].forEach(attribute=>{
      if(el.hasAttribute(attribute))el.setAttribute(attribute,tr(el.getAttribute(attribute)));
    });
  });
}
function watchTranslations(){
  if(translationObserver)return;
  translationObserver=new MutationObserver(records=>{
    if(currentLanguage!=='fr')return;
    records.forEach(record=>{
      record.addedNodes.forEach(node=>{if(node.nodeType===1)applyTranslations(node);});
      if(record.type==='characterData'&&record.target.parentElement)applyTranslations(record.target.parentElement);
    });
  });
  translationObserver.observe(document.body,{childList:true,subtree:true,characterData:true});
}
async function initPageLanguage(){
  if(token()){
    const result=await api('/account/me');
    if(result.ok&&['en','fr'].includes(result.body?.language)){
      currentLanguage=result.body.language;localStorage.setItem('hwfar_language',currentLanguage);
    }
  }
  applyTranslations();watchTranslations();
}
const sqlDate = (value) => value ? new Date(value.replace(' ','T') + 'Z') : null;
const isSameDay = (a,b) => a && b && a.toDateString() === b.toDateString();
const timeLabel = (value) => {
  const d = sqlDate(value); if (!d) return '';
  const now = new Date(), yesterday = new Date(now); yesterday.setDate(now.getDate()-1);
  if (isSameDay(d, now)) return d.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'});
  if (isSameDay(d, yesterday)) return tr('Yesterday');
  return d.toLocaleDateString([], {month:'short', day:'numeric'});
};
const messageTime = (value) => {
  const d = sqlDate(value); return d ? d.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}) : '';
};
const dayLabel = (value) => {
  const d = sqlDate(value), now = new Date(), yesterday = new Date(now);
  if (!d) return ''; yesterday.setDate(now.getDate()-1);
  if (isSameDay(d, now)) return tr('Today');
  if (isSameDay(d, yesterday)) return tr('Yesterday');
  return d.toLocaleDateString([], {month:'short',day:'numeric',year:'numeric'});
};
const formatLastSeen = (value) => {
  const d = sqlDate(value); if (!d) return '';
  const now = new Date(), yesterday = new Date(now); yesterday.setDate(now.getDate()-1);
  const when = isSameDay(d,now) ? tr('today at ') : isSameDay(d,yesterday) ? tr('yesterday at ') : '';
  return tr('last seen ') + when + d.toLocaleString([], {dateStyle: when ? undefined : 'medium', timeStyle:'short'});
};
const tick = (message) => {
  if (message.from !== 'me') return '';
  const color = message.read ? 'read' : '';
  const double = message.delivered || message.read;
  return `<svg class="tick ${color}" viewBox="0 0 16 11"><path d="${double?'M1 6l4 4L11 1M5.5 6l4 4L15.5 1':'M1 6l4 4L11 1'}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
};
function toggleTheme(){
  const next = document.body.dataset.theme === 'light' ? 'dark' : 'light';
  document.body.dataset.theme = next; localStorage.setItem('chatly_theme', next);
  const sw = $('#theme-switch'); if (sw) sw.classList.toggle('on', next === 'dark');
}
document.body.dataset.theme = localStorage.getItem('chatly_theme') || 'dark';
function logout(){ localStorage.removeItem('chatly_token'); localStorage.removeItem('chatly_username'); localStorage.removeItem('chatly_user_id'); location.href='/'; }

let signupStep = 1;
let signupUsernameAvailable = false, signupHumanToken = '', usernameCheckTimer = null;
async function checkUsernameAvailability(username){
  const status=$('#username-status'); if(!status)return false;
  if(!/^[a-zA-Z0-9_.-]{2,24}$/.test(username)){status.className='availability taken';status.textContent='Use 2-24 letters, numbers, dots, dashes, or underscores.';signupUsernameAvailable=false;return false;}
  status.className='availability checking';status.textContent='Checking username…';
  const result=await api('/check-username?username='+encodeURIComponent(username));
  signupUsernameAvailable=!!(result.ok&&result.body?.available);
  status.className='availability '+(signupUsernameAvailable?'available':'taken');
  status.textContent=signupUsernameAvailable?'Username is available.':(result.body?.error||'That username is already taken.');
  return signupUsernameAvailable;
}
async function loadHumanChallenge(){
  const result=await api('/signup/challenge');
  if(result.ok){signupHumanToken=result.body.token;$('#human-question').textContent=result.body.question;}
  else $('#human-question').textContent='Verification could not load. Please try again.';
}
function initAuthPage(){
  currentLanguage=localStorage.getItem('hwfar_language')==='fr'?'fr':'en';
  applyTranslations();watchTranslations();
  if (token()) { location.href='/chat'; return; }
  let register = false;
  const form = $('#auth-form'), toggle = $('#auth-toggle');
  let avatarData = '';
  const showSignupStep = (step) => {
    signupStep = step;
    document.querySelectorAll('.signup-step').forEach(el => el.hidden = Number(el.dataset.step) !== step);
    document.querySelectorAll('.auth-progress i').forEach((el, index) => el.classList.toggle('active', index < step));
  };
  const signupError = (message) => {
    const target = signupStep === 2 ? $('#auth-error-language') : signupStep === 3 ? $('#auth-error-country') : signupStep === 5 ? $('#auth-error-basic') : signupStep === 6 ? $('#auth-error-guidelines') : $('#auth-error-signup');
    if (target) target.textContent = message || '';
  };
  const countrySelect=$('#signup-country');
  COUNTRIES.forEach(country=>{const option=document.createElement('option');option.value=country;option.textContent=country;countrySelect?.appendChild(option);});
  $('#signup-username')?.addEventListener('input',()=>{
    signupUsernameAvailable=false; const value=$('#signup-username').value.trim(); const status=$('#username-status');
    if(status){status.className='availability';status.textContent='';}
    clearTimeout(usernameCheckTimer); if(value.length>=2)usernameCheckTimer=setTimeout(()=>checkUsernameAvailability(value),350);
  });
  toggle.onclick = () => {
    register = !register; signupStep = 1;
    $('#auth-title').textContent = register ? 'Create your account' : 'Welcome back';
    $('#auth-sub').textContent = register ? 'A safer, more personal way to chat.' : 'Private messages, made simple.';
    $('#login-fields').hidden = register; $('#signup-fields').hidden = !register;
    $('#auth-toggle-copy').textContent = register ? 'Already have an account?' : "Don't have an account?";
    toggle.textContent = register ? 'Log in' : 'Sign up';
    if (register) showSignupStep(1);
    $('#auth-error').textContent = ''; signupError('');
  };
  $('#profile-photo')?.addEventListener('change', event => {
    const file = event.target.files?.[0]; if (!file) return;
    if (file.size > 2 * 1024 * 1024) { signupError('Choose an image smaller than 2 MB.'); event.target.value=''; return; }
    const reader = new FileReader();
    reader.onload = () => {
      avatarData = reader.result;
      $('#photo-preview').innerHTML = `<img src="${esc(avatarData)}" alt="Profile preview">`;
    };
    reader.readAsDataURL(file);
  });
  form.onsubmit = async (event) => {
    event.preventDefault(); const username=$('#username').value.trim(), password=$('#password').value;
    if (register) {
       const data = {
        username: $('#signup-username').value.trim(),
        password: $('#signup-password').value,
        language: $('#signup-language').value,
         country: $('#signup-country').value,
        avatar: avatarData,
        age: $('#signup-age').value,
        gender: $('#signup-gender').value,
        show_age: $('#show-age').checked,
         show_gender: $('#show-gender').checked,
         community_accepted: $('#community-accepted').checked,
         human_token: signupHumanToken,
         human_answer: $('#human-answer').value.trim(),
         website: $('#website').value
      };
      const result = await api('/register',{method:'POST',body:JSON.stringify(data)});
      if (!result.ok){ signupError(result.body?.error || 'Could not create account.'); return; }
      const login = await api('/login',{method:'POST',body:JSON.stringify({username:data.username,password:data.password})});
      if (!login.ok){ signupError('Account created. Please log in.'); return; }
       localStorage.setItem('chatly_token',login.body.access_token); localStorage.setItem('chatly_username',login.body.username); localStorage.setItem('chatly_user_id',login.body.user_id); localStorage.setItem('hwfar_language',login.body.language||data.language);
      location.href='/chat'; return;
    }
    $('#auth-error').textContent='';
    const login = await api('/login',{method:'POST',body:JSON.stringify({username,password})});
    if (!login.ok){ $('#auth-error').textContent=login.body?.error || 'Invalid username or password.'; return; }
    localStorage.setItem('chatly_token',login.body.access_token); localStorage.setItem('chatly_username',login.body.username); localStorage.setItem('chatly_user_id',login.body.user_id); localStorage.setItem('hwfar_language',login.body.language||'en');
    location.href='/chat';
  };
}
async function nextSignupStep(step){
  signupStep = step;
  const error = step === 1 ? $('#auth-error-signup') : step === 2 ? $('#auth-error-language') : step === 3 ? $('#auth-error-country') : step === 5 ? $('#auth-error-basic') : $('#auth-error-guidelines');
  if(error)error.textContent='';
  if (step === 1) {
    const username=$('#signup-username').value.trim(), password=$('#signup-password').value;
    if (!/^[a-zA-Z0-9_.-]{2,24}$/.test(username)) { error.textContent='Use 2-24 letters, numbers, dots, dashes, or underscores.'; return; }
    if (password.length < 6) { error.textContent='Your password needs at least 6 characters.'; return; }
    if(!(await checkUsernameAvailability(username)))return;
  }
  if(step===2&&!$('#signup-language').value){error.textContent='Choose English or French to continue.';return;}
  if(step===3&&!$('#signup-country').value){error.textContent='Choose your country to continue.';return;}
  if(step===5){
    const age=Number($('#signup-age').value), gender=$('#signup-gender').value;
    if(!Number.isInteger(age)||age<13||age>120){error.textContent='Enter an age between 13 and 120.';return;}
    if(!gender){error.textContent='Choose a gender option.';return;}
    await loadHumanChallenge();
  }
  document.querySelectorAll('.signup-step').forEach(el => el.hidden = Number(el.dataset.step) !== step + 1);
  document.querySelectorAll('.auth-progress i').forEach((el,index)=>el.classList.toggle('active',index <= step));
  signupStep=step+1;
}
function prevSignupStep(step){
  signupStep = step - 1;
  document.querySelectorAll('.signup-step').forEach(el => el.hidden = Number(el.dataset.step) !== step - 1);
  document.querySelectorAll('.auth-progress i').forEach((el,index)=>el.classList.toggle('active',index < step - 1));
}

let contacts = [], active = window.ACTIVE_USERNAME || null, socket = null, typingTimer = null, remoteTyping = false;
let mediaRecorder = null, recordingChunks = [], recordingStartedAt = 0, recordingTimer = null;
const icon = (name) => name === 'edit'
  ? '<svg viewBox="0 0 24 24"><path d="m4 16-.7 4.7L8 20l11.5-11.5a2.8 2.8 0 0 0-4-4L4 16Z"/><path d="m13.8 6.2 4 4"/></svg>'
  : '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5"/></svg>';
function toast(message){
  let el=$('#chat-toast'); if(!el){el=document.createElement('div');el.id='chat-toast';el.className='toast';document.body.appendChild(el);}
  el.textContent=message; clearTimeout(el._timer); el._timer=setTimeout(()=>el.remove(),3200);
}
let hwfarAudioContext=null, callRingtoneTimer=null;
function soundOn(key){return localStorage.getItem(key)!=='off';}
function unlockHwFarAudio(){
  const AudioContext=window.AudioContext||window.webkitAudioContext;
  if(!AudioContext)return null;
  try{
    if(!hwfarAudioContext)hwfarAudioContext=new AudioContext();
    if(hwfarAudioContext.state==='suspended')hwfarAudioContext.resume().catch(()=>{});
    return hwfarAudioContext;
  }catch(_){return null;}
}
function playHwFarMelody(notes,volume=.045){
  const context=unlockHwFarAudio(); if(!context)return;
  let offset=0;
  notes.forEach(note=>{
    const start=context.currentTime+offset, end=start+note.duration;
    const oscillator=context.createOscillator(), gain=context.createGain();
    oscillator.type=note.type||'sine'; oscillator.frequency.setValueAtTime(note.frequency,start);
    gain.gain.setValueAtTime(0.0001,start);
    gain.gain.exponentialRampToValueAtTime(volume,start+0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001,Math.max(start+0.04,end-0.03));
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.start(start); oscillator.stop(end);
    offset+=note.duration+(note.pause||0);
  });
}
function playNotificationSound(){
  if(!soundOn('hwfar_notification_sound'))return;
  playHwFarMelody([
    {frequency:784,duration:.14},{frequency:988,duration:.18,pause:.04},
    {frequency:1175,duration:.3,type:'triangle'}
  ],.035);
}
function stopCallRingtone(){
  if(callRingtoneTimer){clearTimeout(callRingtoneTimer);callRingtoneTimer=null;}
}
function startCallRingtone(){
  stopCallRingtone();
  if(!soundOn('hwfar_call_sound'))return;
  const ring=()=>{
    playHwFarMelody([
      {frequency:784,duration:.18},{frequency:988,duration:.18},
      {frequency:1175,duration:.28,pause:.1},{frequency:988,duration:.18}
    ],.06);
    callRingtoneTimer=setTimeout(ring,2800);
  };
  ring();
}
document.addEventListener('pointerdown',unlockHwFarAudio,{passive:true});
async function loadContacts(){
  const result=await api('/contacts'); contacts=result.ok ? result.body : [];
  const query=($('#search')?.value || '').toLowerCase();
  const visible=contacts.filter(c=>c.username.toLowerCase().includes(query));
  $('#contacts').innerHTML=visible.length ? visible.map(c=>`
    <a class="contact ${active===c.username?'active':''}" href="/chat/${encodeURIComponent(c.username)}">
      ${avatar(c.username,c.avatar,44,!!c.online)}<div class="contact-main"><div class="contact-top"><span class="contact-name">${esc(c.username)}</span><span class="contact-time ${c.unread_count?'unread':''}">${timeLabel(c.last_sent_at)}</span></div>
       <div class="contact-bottom"><span class="preview">${c.last_mine?tr('You: '):''}${esc(c.last_content || tr('Start a conversation'))}</span>${c.unread_count?`<span class="badge">${c.unread_count>99?'99+':c.unread_count}</span>`:''}</div></div></a>`).join('') : `<div class="empty">${contacts.length?tr('No matches.'):tr('No chats yet — start a new one.')}</div>`;
}
function presenceText(p){ return p?.online ? tr('online') : (p?.last_seen ? formatLastSeen(p.last_seen) : ''); }
async function updatePresence(){
  if (!active) return; const result=await api('/presence/'+encodeURIComponent(active));
  if (!remoteTyping && $('#thread-status')) $('#thread-status').textContent=result.ok ? presenceText(result.body) : '';
}
function renderMessage(m){
  const mine=m.from==='me', deleted=!!m.deleted, type=m.type||'text';
  let body='';
  if(deleted) body=`<span class="bubble-text">${tr('This message was deleted')}</span>`;
  else if(type==='image') body=`<img class="message-media" src="${esc(m.content)}" alt="Image sent in chat">`;
  else if(type==='video') body=`<video class="message-media message-video" src="${esc(m.content)}" controls playsinline></video>`;
  else if(type==='voice') body=`<span class="voice-message"><span aria-hidden="true">🎙</span><audio src="${esc(m.content)}" controls preload="metadata"></audio>${m.duration?`<span class="voice-duration">${Math.round(m.duration)}s</span>`:''}</span>`;
  else body=`<span class="bubble-text">${esc(m.content)}</span>`;
  const edited=!deleted&&m.edited ? `<span class="edited-label">${tr('(edited)')}</span>` : '';
  const actions=mine&&!deleted&&type==='text' ? `<div class="message-actions"><button class="message-action" type="button" title="${tr('Edit message')}" aria-label="${tr('Edit message')}" onclick="editMessage(${Number(m.id)})">${icon('edit')}</button><button class="message-action" type="button" title="${tr('Delete message')}" aria-label="${tr('Delete message')}" onclick="deleteMessage(${Number(m.id)})">${icon('delete')}</button></div>` : '';
  return `<div class="row ${mine?'mine':'theirs'}" data-id="${m.id||''}"><div><div class="bubble ${deleted?'deleted':''} ${m.edited?'edited':''}">${body}${edited}<span class="meta">${messageTime(m.sent_at)}${tick(m)}</span></div>${actions}</div></div>`;
}
function renderMessages(messages){
  const box=$('#messages'); box.innerHTML=''; let last='';
  messages.forEach(m=>{ const label=dayLabel(m.sent_at); if(label!==last){box.insertAdjacentHTML('beforeend',`<div class="day">${label}</div>`);last=label;} box.insertAdjacentHTML('beforeend',renderMessage(m)); });
  box.scrollTop=box.scrollHeight;
}
async function markRead(){
  if (!active || document.visibilityState !== 'visible') return;
  const result=await api('/messages/'+encodeURIComponent(active)+'/read',{method:'POST'});
  (result.body?.read_ids||[]).forEach(id=>{const row=document.querySelector(`[data-id="${id}"]`); if(row){const old=row.querySelector('.tick'); if(old){old.classList.add('read'); old.innerHTML='<path d="M1 6l4 4L11 1M5.5 6l4 4L15.5 1" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>';}}});
  if(result.body?.read_ids?.length) loadContacts();
}
async function openThread(){
  if(!active) return;
  $('#empty-main').hidden=true; $('#thread').hidden=false; $('#thread-name').textContent=active; $('#thread-settings').href='/settings';
  if($('#thread-call')) $('#thread-call').href='/call/'+encodeURIComponent(active);
  const contact=contacts.find(c=>c.username===active);
  const profile=contact||((await api('/profile/'+encodeURIComponent(active))).body||{});
  $('#thread-avatar').outerHTML=avatar(active,profile.avatar,44,!!profile.online); // restore stable id
  const avatarEl=document.querySelector('#thread .avatar'); if(avatarEl) avatarEl.id='thread-avatar';
  const history=await api('/messages/'+encodeURIComponent(active));
  if(history.ok) renderMessages(history.body);
  const setting=await api('/chat/'+encodeURIComponent(active)+'/disappearing'); if(setting.ok) $('#disappearing').value=setting.body.seconds;
  await updatePresence(); await markRead();
}
function closeThread(){ location.href='/chat'; }
async function saveDisappearing(seconds){
  if(!active) return;
  await api('/chat/'+encodeURIComponent(active)+'/disappearing',{method:'POST',body:JSON.stringify({seconds:Number(seconds)})});
}
function appendLiveMessage(m){
  if(m.from!=='me' && m.from!==active) return;
  const box=$('#messages'), near=box.scrollHeight-box.scrollTop-box.clientHeight<140;
  if(m.id && box.querySelector(`[data-id="${m.id}"]`)) return;
  const last=box.querySelector('.day:last-of-type'), label=dayLabel(m.sent_at);
  if(!last || last.textContent!==label) box.insertAdjacentHTML('beforeend',`<div class="day">${label}</div>`);
  box.insertAdjacentHTML('beforeend',renderMessage(m)); if(near || m.from==='me') box.scrollTop=box.scrollHeight;
  if(m.from!== 'me') markRead();
}
function connectSocket(){
  socket=io({auth:{token:token()}});
  socket.on('new_message',async m=>{appendLiveMessage(m); await loadContacts(); notify(m);});
  socket.on('message_updated',m=>{if(m.from===active||m.from==='me'){const row=document.querySelector(`[data-id="${m.id}"]`);if(row)row.outerHTML=renderMessage(m);}});
  socket.on('message_status',data=>(data.ids||[]).forEach(id=>{const row=document.querySelector(`[data-id="${id}"]`); if(!row)return; const old=row.querySelector('.tick'); if(old){old.classList.toggle('read',data.status==='read'); if(data.status==='read')old.innerHTML='<path d="M1 6l4 4L11 1M5.5 6l4 4L15.5 1" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>';}}));
   socket.on('typing',data=>{if(data.from===active){remoteTyping=!!data.active;$('#thread-status').textContent=remoteTyping?tr('typing…'):''; if(!remoteTyping)updatePresence();}});
  socket.on('presence',data=>{if(data.username===active && !remoteTyping)$('#thread-status').textContent=presenceText(data);loadContacts();});
  socket.on('incoming_call',data=>{
    startCallRingtone();
    if(window.handleIncomingCall){window.handleIncomingCall(data);return;}
    const mode=data.mode==='video'?'video':'audio';
    if(window.confirm(`${data.from} is calling you (${mode}). Open the call?`)){
      location.href='/call/'+encodeURIComponent(data.from)+'?incoming=1&callId='+encodeURIComponent(data.call_id)+'&mode='+mode;
    }else socket.emit('call_response',{to:data.from,call_id:data.call_id,accepted:false});
  });
  socket.on('call_error',data=>toast(data?.message||'Call could not be started.'));
}
function connectIncomingCallSocket(){
  if(!token()||window.CALL_USERNAME)return;
  const incomingSocket=io({auth:{token:token()}});
  incomingSocket.on('incoming_call',data=>{
    startCallRingtone();
    if(window.handleIncomingCall)window.handleIncomingCall(data);
  });
  window.addEventListener('beforeunload',()=>incomingSocket.close());
}
async function sendPayload(payload){
  if(!active)return false;
  const result=await api('/send',{method:'POST',body:JSON.stringify({to:active,...payload})});
  if(result.ok){appendLiveMessage(result.body);loadContacts();return true;}
  toast(result.body?.error||'Message could not be sent.'); return false;
}
async function sendMessage(){
  const input=$('#message-input'), button=document.querySelector('#composer .send'), content=input.value.trim();
  if(!content||!active)return;
  input.value=''; input.style.height='auto';
  if(button){button.disabled=true;button.classList.add('sending');}
  if(!(await sendPayload({type:'text',content}))){input.value=content;input.dispatchEvent(new Event('input'));}
  if(button){button.disabled=false;button.classList.remove('sending');}
}
function readFileAsDataUrl(file){
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
}
async function sendAttachment(event){
  const file=event.target.files?.[0]; event.target.value=''; if(!file||!active)return;
  if(file.size>12*1024*1024){toast('Choose an image or video smaller than 12 MB.');return;}
  const type=file.type.startsWith('video/')?'video':'image';
  try{await sendPayload({type,content:await readFileAsDataUrl(file)});}catch(_){toast('That file could not be read.');}
}
async function startVoiceRecording(event){
  event?.preventDefault(); if(mediaRecorder||!active)return;
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){toast('Voice recording is not supported in this browser.');return;}
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    mediaRecorder=new MediaRecorder(stream); recordingChunks=[]; recordingStartedAt=Date.now();
     const button=$('#voice-button'); button.classList.add('recording'); button.title='Tap again to send voice message';
    const status=document.createElement('span');status.id='recording-status';status.className='recording-status';status.textContent='● 0s';$('#composer').appendChild(status);
    recordingTimer=setInterval(()=>{status.textContent=`● ${Math.floor((Date.now()-recordingStartedAt)/1000)}s`;},250);
    mediaRecorder.ondataavailable=e=>{if(e.data.size)recordingChunks.push(e.data);};
    mediaRecorder.onstop=async()=>{
       clearInterval(recordingTimer);status.remove();button.classList.remove('recording');button.title='Tap to record, tap again to send';
      stream.getTracks().forEach(track=>track.stop()); const duration=Math.max(1,Math.round((Date.now()-recordingStartedAt)/1000)); const mime=mediaRecorder.mimeType; mediaRecorder=null;
      if(!recordingChunks.length)return;
      const blob=new Blob(recordingChunks,{type:mime||'audio/webm'}); const data=await readFileAsDataUrl(blob);
      await sendPayload({type:'voice',content:data,duration});
    };
    mediaRecorder.start();
  }catch(_){toast('Microphone access was blocked. Allow it to record voice notes.');mediaRecorder=null;}
}
function stopVoiceRecording(event){
  event?.preventDefault(); if(mediaRecorder&&mediaRecorder.state!=='inactive')mediaRecorder.stop();
}
async function toggleVoiceRecording(){
  if(mediaRecorder){stopVoiceRecording();return;}
  await startVoiceRecording();
}
async function editMessage(id){
  const row=document.querySelector(`[data-id="${id}"]`), current=row?.querySelector('.bubble-text')?.textContent||''; if(!current)return;
  const content=window.prompt('Edit message',current); if(content===null||!content.trim()||content.trim()===current)return;
  const result=await api('/messages/'+id,{method:'PATCH',body:JSON.stringify({content:content.trim()})});
  if(!result.ok)toast(result.body?.error||'Message could not be edited.'); else if(row)row.outerHTML=renderMessage(result.body);
}
async function deleteMessage(id){
  const row=document.querySelector(`[data-id="${id}"]`); if(!row)return;
  if(!window.confirm('Delete this message? If it has been seen, it will only disappear for you.'))return;
  const result=await api('/messages/'+id,{method:'DELETE'});
  if(!result.ok){toast(result.body?.error||'Message could not be deleted.');return;}
  if(row)row.outerHTML=renderMessage(result.body); loadContacts();
}
function notify(m){
  if(m.from==='me')return;
  playNotificationSound();
  if(localStorage.getItem('chatly_notifications')!=='on'||document.visibilityState==='visible'||!('Notification'in window)||Notification.permission!=='granted')return;
  new Notification(m.from,{body:m.content,tag:'hwfar-'+m.from});
}
function initMoreMenu(){
  const bar=document.querySelector('.topbar'); if(!bar||bar.querySelector('.more-toggle'))return;
  const button=document.createElement('button'); button.className='icon-btn more-toggle'; button.type='button'; button.title='More'; button.setAttribute('aria-label','More'); button.textContent='⋮';
  const menu=document.createElement('div'); menu.className='more-menu'; menu.innerHTML='<a href="/stories">Statuses</a><a href="/call">Calls</a><a href="/discover">Discover</a><a href="/new-chat">New chat</a><a href="/settings">Settings</a>';
  button.onclick=event=>{event.stopPropagation();menu.classList.toggle('open');};
  document.addEventListener('click',()=>menu.classList.remove('open'));
  bar.append(button,menu);
}
async function initChatPage(){
  if(!token()){location.href='/';return;}
  await initPageLanguage();
  initMoreMenu();
  $('#search').oninput=loadContacts;
  $('#composer').onsubmit=e=>{e.preventDefault();sendMessage();};
  $('#attach-button').onclick=()=>$('#attachment-input').click();
  $('#attachment-input').onchange=sendAttachment;
  const voice=$('#voice-button'); voice.onclick=toggleVoiceRecording;
  $('#message-input').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}};
  $('#message-input').oninput=e=>{e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,120)+'px'; if(socket&&active){socket.emit('typing',{to:active,active:true});clearTimeout(typingTimer);typingTimer=setTimeout(()=>socket.emit('typing',{to:active,active:false}),1800);}};
  loadContacts().then(openThread); connectSocket(); document.addEventListener('visibilitychange',markRead);
}
async function initSettingsPage(){
  if(!token()){location.href='/';return;}
  await initPageLanguage();
  initMoreMenu();
  connectIncomingCallSocket();
  const me=await api('/account/me'); if(!me.ok)return;
  if($('#new-username'))$('#new-username').value=me.body.username;
  if($('#online-switch'))$('#online-switch').classList.toggle('on',me.body.show_online!==false);
  if($('#age-switch'))$('#age-switch').classList.toggle('on',!!me.body.show_age);
  if($('#gender-switch'))$('#gender-switch').classList.toggle('on',!!me.body.show_gender);
  if($('#theme-switch'))$('#theme-switch').classList.toggle('on',document.body.dataset.theme==='dark');
  if($('#notification-switch'))$('#notification-switch').classList.toggle('on',localStorage.getItem('chatly_notifications')==='on');
  if($('#notification-sound-switch'))$('#notification-sound-switch').classList.toggle('on',soundOn('hwfar_notification_sound'));
  if($('#call-sound-switch'))$('#call-sound-switch').classList.toggle('on',soundOn('hwfar_call_sound'));
  document.querySelectorAll('.language-choice').forEach(button=>button.classList.toggle('active',button.dataset.language===currentLanguage));
}
async function togglePrivacySetting(setting='show_online'){
  const ids={show_online:'online-switch',show_age:'age-switch',show_gender:'gender-switch'};
  const sw=$('#'+ids[setting]); if(!sw)return;
  const next=!sw.classList.contains('on'); sw.classList.toggle('on',next);
  const result=await api('/account/privacy',{method:'POST',body:JSON.stringify({[setting]:next})});
  if(!result.ok) { sw.classList.toggle('on',!next); if($('#settings-flash'))$('#settings-flash').textContent=result.body?.error||'Could not save privacy setting.'; }
}
async function saveUsername(){
  const result=await api('/account/username',{method:'POST',body:JSON.stringify({username:$('#new-username').value.trim()})});
  $('#settings-flash').textContent=result.ok?'Username updated.':(result.body?.error||'Could not update username.');
}
async function toggleNotifications(){
  const sw=$('#notification-switch'), flash=$('#settings-flash');
  if(!('Notification'in window)){flash.textContent='Notifications are not supported in this browser.';return;}
  if(Notification.permission!=='granted'){const permission=await Notification.requestPermission();if(permission!=='granted'){flash.textContent='Notifications are blocked in browser settings.';return;}}
  const next=!sw.classList.contains('on');sw.classList.toggle('on',next);localStorage.setItem('chatly_notifications',next?'on':'off');
}
function toggleSoundPreference(key,id){
  const sw=$('#'+id); if(!sw)return;
  const next=!sw.classList.contains('on');
  sw.classList.toggle('on',next);
  localStorage.setItem(key,next?'on':'off');
  if(!next&&key==='hwfar_call_sound')stopCallRingtone();
  if(next&&key==='hwfar_notification_sound')playNotificationSound();
}
async function setLanguage(language){
  if(!['en','fr'].includes(language))return;
  const result=await api('/account/language',{method:'POST',body:JSON.stringify({language})});
  if(!result.ok){$('#settings-flash').textContent=result.body?.error||'Could not save language.';return;}
  localStorage.setItem('hwfar_language',language);location.reload();
}
async function initDiscoverPage(){
  if(!token()){location.href='/';return;}
  await initPageLanguage();
  const result=await api('/users/suggestions'), list=$('#discover-list');
  initMoreMenu();
  connectIncomingCallSocket();
  if(!result.ok||!result.body.length){list.innerHTML='<div class="empty">No suggestions right now.</div>';return;}
  list.innerHTML=result.body.map(u=>{
    const availability=u.online?'online':(u.last_seen?formatLastSeen(u.last_seen):'Available to chat');
    const age=u.age_visible?(u.age?`${u.age} ${tr('years')}`:tr('Not added')):tr('Private');
    const gender=u.gender_visible?(u.gender||'Not added'):'Private';
    return `<article class="card discover-card">
      <div class="discover-identity">${avatar(u.username,u.avatar,52,!!u.online)}<div><div class="discover-name">${esc(u.username)}</div><div class="discover-handle">${esc(availability)}</div></div><span class="spacer"></span></div>
      <div class="discover-details">
        <div class="profile-detail"><small>Country</small><span>${esc(u.country||'Not added')}</span></div>
        <div class="profile-detail"><small>Age</small><span>${esc(age)}</span></div>
        <div class="profile-detail"><small>Gender</small><span>${esc(gender)}</span></div>
        <div class="profile-detail"><small>Username</small><span>${esc(u.username)}</span></div>
      </div>
      <div class="discover-actions"><button class="btn secondary" onclick="startDiscovered('${encodeURIComponent(u.username)}')">Message</button><button class="btn call-outline" onclick="callDiscovered('${encodeURIComponent(u.username)}')">☎ Call</button></div>
    </article>`;
  }).join('');
}
async function startDiscovered(encoded){const username=decodeURIComponent(encoded);await api('/contacts/add',{method:'POST',body:JSON.stringify({username})});location.href='/chat/'+encodeURIComponent(username);}
function callDiscovered(encoded){location.href='/call/'+encodeURIComponent(decodeURIComponent(encoded));}
async function initNewChatPage(){
  if(!token()){location.href='/';return;}
  await initPageLanguage();
  initMoreMenu();
  connectIncomingCallSocket();
  $('#new-chat-username').onkeydown=e=>{if(e.key==='Enter')createChat();};
}
async function createChat(){
  const username=$('#new-chat-username').value.trim(), error=$('#new-chat-error'); if(!username){error.textContent='Enter a username.';return;}
  const result=await api('/contacts/add',{method:'POST',body:JSON.stringify({username})});
  if(!result.ok){error.textContent=result.body?.error||'Could not start chat.';return;} location.href='/chat/'+encodeURIComponent(username);
}

let callSocket=null, callPeer=null, callStream=null, callTargetName='', callCurrentUser='', callId='', callMode='audio', pendingCallCandidates=[], callFinished=false;
const callQuery=()=>new URLSearchParams(location.search);
function setCallMode(mode){
  callMode=mode==='video'?'video':'audio';
  $('#audio-mode')?.classList.toggle('active',callMode==='audio');
  $('#video-mode')?.classList.toggle('active',callMode==='video');
  if($('#flip-camera'))$('#flip-camera').hidden=callMode!=='video';
}
function callStatus(text){if($('#call-status'))$('#call-status').textContent=text;}
function callError(text){if($('#call-error'))$('#call-error').textContent=text||'';}
function renderCallAvatar(profile){
  const el=$('#call-avatar'); if(!el)return;
  el.innerHTML=profile?.avatar?`<img src="${esc(profile.avatar)}" alt="">`:esc((profile?.username||callTargetName||'?').slice(0,2).toUpperCase());
  el.style.background=profile?.avatar?'transparent':avatarColor(profile?.username||callTargetName);
}
function ensureCallSocket(){
  if(callSocket?.connected)return Promise.resolve();
  if(!callSocket){
    callSocket=io({auth:{token:token()}});
    callSocket.on('connect_error',()=>callError('Could not connect to calls. Refresh and try again.'));
    callSocket.on('call_response',async data=>{
      if(data.call_id!==callId)return;
      if(!data.accepted){finishCall('Call declined.');return;}
      stopCallRingtone();
      callStatus('Connecting…');
      try{
        const ready=await getCallMedia(); if(!ready){finishCall('Could not access your microphone.');return;}
        await createOffer();
      }catch(_){finishCall('Could not start the call.');}
    });
    callSocket.on('call_signal',async data=>{
      if(data.call_id!==callId)return;
      const signal=data.signal||{};
      try{
        if(signal.offer){
          await ensurePeer();
          await callPeer.setRemoteDescription(new RTCSessionDescription(signal.offer));
          for(const candidate of pendingCallCandidates)await callPeer.addIceCandidate(candidate);
          pendingCallCandidates=[];
          const answer=await callPeer.createAnswer();
          await callPeer.setLocalDescription(answer);
          sendCallSignal({answer:callPeer.localDescription});
        }else if(signal.answer&&callPeer){
          await callPeer.setRemoteDescription(new RTCSessionDescription(signal.answer));
          callStatus('Connected');
        }else if(signal.candidate&&callPeer){
          const candidate=new RTCIceCandidate(signal.candidate);
          if(callPeer.remoteDescription)await callPeer.addIceCandidate(candidate);else pendingCallCandidates.push(candidate);
        }
      }catch(_){finishCall('The call connection failed.');}
    });
    callSocket.on('call_end',data=>{if(data.call_id===callId)finishCall('Call ended.');});
    callSocket.on('call_error',data=>finishCall(data?.message||'Call could not be started.'));
  }
  return new Promise(resolve=>{
    if(callSocket.connected){resolve();return;}
    callSocket.once('connect',resolve);
  });
}
async function getCallMedia(){
  if(callStream)return true;
  if(!navigator.mediaDevices?.getUserMedia){callError('Your browser does not support microphone or camera calls.');return false;}
  try{
    callStream=await navigator.mediaDevices.getUserMedia({audio:true,video:callMode==='video'});
    const local=$('#local-video'), localAudio=$('#local-audio');
    if(local&&callMode==='video'){local.srcObject=callStream;local.hidden=false;}
    if(localAudio){
      localAudio.srcObject=callStream;
      localAudio.muted=false;
      localAudio.play().catch(()=>{});
    }
    $('#mute-mic')?.removeAttribute('hidden');
    if(callMode==='video')$('#flip-camera')?.removeAttribute('hidden');
    return true;
  }catch(_){callError('Microphone or camera access was blocked. Allow it and try again.');return false;}
}
async function ensurePeer(){
  if(callPeer)return callPeer;
  callPeer=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
  callStream?.getTracks().forEach(track=>callPeer.addTrack(track,callStream));
  callPeer.ontrack=e=>{
    const stream=e.streams[0];
    if(callMode==='video'){
      const video=$('#remote-video'); if(video){video.srcObject=stream;video.hidden=false;}
    }else{
      const audio=$('#remote-audio'); if(audio){audio.srcObject=stream;audio.play().catch(()=>{});}
    }
  };
  callPeer.onicecandidate=e=>{if(e.candidate)sendCallSignal({candidate:e.candidate});};
  callPeer.onconnectionstatechange=()=>{
    if(['failed','disconnected'].includes(callPeer.connectionState))finishCall('The connection was lost.');
    if(callPeer.connectionState==='connected')callStatus('Connected');
  };
  return callPeer;
}
function sendCallSignal(signal){if(callSocket?.connected)callSocket.emit('call_signal',{to:callTargetName,call_id:callId,signal});}
async function createOffer(){
  await ensurePeer();
  const offer=await callPeer.createOffer();
  await callPeer.setLocalDescription(offer);
  sendCallSignal({offer:callPeer.localDescription});
}
async function startCall(){
  callTargetName=$('#call-username')?.value.trim()||callTargetName;
  callError('');
  if(!callTargetName){callError('Enter the exact username you want to call.');return;}
  if(callTargetName===callCurrentUser||callTargetName===localStorage.getItem('chatly_username')){callError('You cannot call yourself.');return;}
  callId=window.crypto?.randomUUID?crypto.randomUUID():String(Date.now());
  callFinished=false;
  await ensureCallSocket();
  callSocket.emit('call_invite',{to:callTargetName,call_id:callId,mode:callMode});
  startCallRingtone();
  $('#call-dialer')?.setAttribute('hidden','');
  $('#start-call')?.setAttribute('hidden','');
  callStatus(`${tr('Calling')} ${callTargetName}…`);
}
async function acceptCall(){
  callError('');
  stopCallRingtone();
  const ready=await getCallMedia(); if(!ready)return;
  await ensureCallSocket();
  callSocket.emit('call_response',{to:callTargetName,call_id:callId,accepted:true});
  $('#incoming-actions')?.setAttribute('hidden','');
  $('#call-actions')?.removeAttribute('hidden');
  callStatus('Connecting…');
}
function declineCall(){
  stopCallRingtone();
  if(callSocket?.connected)callSocket.emit('call_response',{to:callTargetName,call_id:callId,accepted:false});
  finishCall('Call declined.');
}
function finishCall(message){
  if(callFinished&&message==='Call ended.')return;
  callFinished=true;
  stopCallRingtone();
  if(callSocket?.connected&&callId)callSocket.emit('call_end',{to:callTargetName,call_id:callId});
  callPeer?.close(); callPeer=null;
  callStream?.getTracks().forEach(track=>track.stop()); callStream=null;
  const remote=$('#remote-video'),local=$('#local-video'),remoteAudio=$('#remote-audio');
  const localAudio=$('#local-audio');
  if(remote){remote.srcObject=null;remote.hidden=true;}
  if(local){local.srcObject=null;local.hidden=true;}
  if(remoteAudio){remoteAudio.pause();remoteAudio.srcObject=null;}
  if(localAudio){localAudio.pause();localAudio.srcObject=null;}
  $('#mute-mic')?.setAttribute('hidden','');
  $('#flip-camera')?.setAttribute('hidden','');
  $('#incoming-actions')?.setAttribute('hidden','');
  $('#start-call')?.removeAttribute('hidden');
  callStatus(message||tr('Call ended.'));
  loadCallHistory();
}
function endCall(){finishCall('Call ended.');}
function toggleCamera(){
  const track=callStream?.getVideoTracks?.()[0]; if(!track)return;
  track.enabled=!track.enabled; callStatus(track.enabled?'Camera on':'Camera off');
  const button=$('#flip-camera');
  if(button)button.setAttribute('aria-label',track.enabled?'Turn camera off':'Turn camera on');
}
function toggleMute(){
  const track=callStream?.getAudioTracks?.()[0]; if(!track)return;
  track.enabled=!track.enabled; callStatus(track.enabled?'Microphone on':'Microphone muted');
  const button=$('#mute-mic');
  if(button){
    button.classList.toggle('is-muted',!track.enabled);
    button.setAttribute('aria-label',track.enabled?tr('Mute microphone'):tr('Unmute microphone'));
  }
}
function handleIncomingCall(data){
  if(!data?.from)return;
  const mode=data.mode==='video'?'video':'audio';
  startCallRingtone();
  location.href='/call/'+encodeURIComponent(data.from)+'?incoming=1&callId='+encodeURIComponent(data.call_id||'')+'&mode='+mode;
}
async function loadCallHistory(){
  const list=$('#call-history'); if(!list)return;
  const result=await api('/calls');
  if(!result.ok||!result.body?.length){list.innerHTML='<div class="empty">No calls yet.</div>';return;}
  list.innerHTML=result.body.map(call=>{
    const missed=call.status==='missed';
    const direction=call.direction==='incoming'?'↙':'↗';
    const label=missed?tr('Missed call'):call.status==='accepted'?tr('Accepted call'):call.status==='completed'?tr('Completed call'):tr('Calling');
    return `<a class="call-history-row ${missed?'missed':''}" href="/call/${encodeURIComponent(call.username)}">
      ${avatar(call.username,call.avatar,38)}<div class="call-history-info"><strong>${esc(call.username)}</strong><span>${direction} ${label} · ${call.mode==='video'?tr('Video'):tr('Audio')}</span></div><time>${timeLabel(call.created_at)}</time>
    </a>`;
  }).join('');
}
async function initCallPage(){
  if(!token()){location.href='/';return;}
  await initPageLanguage();
  initMoreMenu();
  const account=await api('/account/me'); if(account.ok)callCurrentUser=account.body?.username||'';
  callTargetName=window.CALL_USERNAME||'';
  const query=callQuery(), incoming=query.get('incoming')==='1';
  if(query.get('mode'))setCallMode(query.get('mode'));
  if($('#call-username')){
    $('#call-username').value=callTargetName;
    $('#call-username').oninput=e=>{callTargetName=e.target.value.trim();};
    $('#call-username').onkeydown=e=>{if(e.key==='Enter')startCall();};
  }
  if(callTargetName){
    $('#call-name').textContent=callTargetName;
    const profile=await api('/profile/'+encodeURIComponent(callTargetName));
    if(profile.ok){renderCallAvatar(profile.body);if(profile.body.online)callStatus('online');}
  }
  await ensureCallSocket();
  loadCallHistory();
  if(incoming){
    callId=query.get('callId')||''; $('#call-name').textContent=`${callTargetName} ${tr('is calling')}`;
    $('#call-dialer')?.setAttribute('hidden',''); $('#start-call')?.setAttribute('hidden','');
    $('#incoming-actions')?.removeAttribute('hidden'); $('#call-actions')?.setAttribute('hidden','');
    startCallRingtone();
    callStatus(tr(callMode==='video'?'Incoming video call':'Incoming audio call'));
  }else if(!callTargetName){
    callStatus(tr('Enter a username to begin'));
  }
  window.addEventListener('beforeunload',()=>{if(callSocket?.connected&&callId)callSocket.emit('call_end',{to:callTargetName,call_id:callId});});
}

let storyType='text', storyMedia='', storyAudioRecorder=null, storyAudioChunks=[], storyCache={};
function setStoryType(type){
  storyType=['text','image','video','audio'].includes(type)?type:'text';
  document.querySelectorAll('[data-story-type]').forEach(button=>button.classList.toggle('active',button.dataset.storyType===storyType));
  const text=$('#story-text'), fileRow=$('#story-file-row'), audioRow=$('#story-audio-row');
  if(text)text.hidden=storyType!=='text';
  if(fileRow)fileRow.hidden=!['image','video'].includes(storyType)||!storyMedia;
  if(audioRow)audioRow.hidden=storyType!=='audio';
  if(['image','video'].includes(storyType)&&!storyMedia)$('#story-file')?.click();
}
function clearStoryMedia(){
  storyMedia=''; const file=$('#story-file'); if(file)file.value='';
  if($('#story-file-row'))$('#story-file-row').hidden=true;
}
async function toggleStoryAudio(){
  const button=$('#story-audio-button'), status=$('#story-audio-status');
  if(storyAudioRecorder){storyAudioRecorder.stop();return;}
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){if(status)status.textContent='Audio recording is not supported here.';return;}
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    storyAudioChunks=[]; storyAudioRecorder=new MediaRecorder(stream);
    button.textContent='Stop'; if(status)status.textContent='Recording audio…';
    storyAudioRecorder.ondataavailable=e=>{if(e.data.size)storyAudioChunks.push(e.data);};
    storyAudioRecorder.onstop=async()=>{
      stream.getTracks().forEach(track=>track.stop());
      const blob=new Blob(storyAudioChunks,{type:storyAudioRecorder.mimeType||'audio/webm'});
      storyMedia=await readFileAsDataUrl(blob); storyAudioRecorder=null;
      button.textContent='Record again'; if(status)status.textContent='Audio ready to post.';
    };
    storyAudioRecorder.start();
  }catch(_){if(status)status.textContent='Microphone access was blocked.';storyAudioRecorder=null;}
}
function updateStoryPrivacyFields(){
  const audience=$('#story-audience')?.value;
  if($('#story-allowed-wrap'))$('#story-allowed-wrap').hidden=audience!=='custom';
}
async function publishStory(){
  const error=$('#story-error'); if(error)error.textContent='';
  const content=storyType==='text'?($('#story-text')?.value||'').trim():storyMedia;
  if(!content){if(error)error.textContent=storyType==='text'?'Write something first.':'Choose or record media first.';return;}
  const result=await api('/statuses',{method:'POST',body:JSON.stringify({
    type:storyType,content,caption:($('#story-caption')?.value||'').trim(),
    audience:$('#story-audience')?.value||'everyone',
    allowed_users:($('#story-allowed')?.value||'').split(',').map(v=>v.trim()).filter(Boolean),
    hidden_users:($('#story-hidden')?.value||'').split(',').map(v=>v.trim()).filter(Boolean)
  })});
  if(!result.ok){if(error)error.textContent=result.body?.error||'Story could not be posted.';return;}
  resetStoryComposer(); loadStories();
}
function resetStoryComposer(){
  storyType='text';storyMedia='';
  if($('#story-text'))$('#story-text').value='';
  if($('#story-caption'))$('#story-caption').value='';
  if($('#story-allowed'))$('#story-allowed').value='';
  if($('#story-hidden'))$('#story-hidden').value='';
  if($('#story-file'))$('#story-file').value='';
  if($('#story-file-row'))$('#story-file-row').hidden=true;
  if($('#story-audio-status'))$('#story-audio-status').textContent='Tap to record an audio status';
  if($('#story-audio-button'))$('#story-audio-button').textContent='Record';
  if($('#story-audience'))$('#story-audience').value='everyone';
  updateStoryPrivacyFields();setStoryType('text');
}
function focusStoryComposer(){$('#story-text')?.focus();window.scrollTo({top:0,behavior:'smooth'});}
function storyRemaining(value){
  const end=sqlDate(value); if(!end)return '';
  const minutes=Math.max(0,Math.round((end-Date.now())/60000));
  if(minutes<60)return `${minutes}${currentLanguage==='fr'?' min':'m'} ${currentLanguage==='fr'?'restantes':'left'}`;
  return `${Math.floor(minutes/60)} h ${currentLanguage==='fr'?'restantes':'left'}`;
}
function storyBody(story){
  if(story.type==='image')return `<img class="story-media" src="${esc(story.content)}" alt="Story from ${esc(story.username)}">`;
  if(story.type==='video')return `<video class="story-media story-video" src="${esc(story.content)}" controls playsinline></video>`;
  if(story.type==='audio')return `<div class="story-audio"><span>◉</span><audio src="${esc(story.content)}" controls preload="metadata"></audio></div>`;
  return `<div class="story-text">${esc(story.content)}</div>`;
}
function renderStory(story){
  storyCache[story.id]=story;
  const ownActions=story.mine?`<button class="story-action" onclick="editStory(${story.id})">${tr('Edit')}</button><button class="story-action danger" onclick="deleteStory(${story.id})">${tr('Delete')}</button>`:'';
  const reactions=story.mine
    ? `<button class="story-action" onclick="viewStory(${story.id})">◉ ${story.view_count||0} ${tr('views')}</button>`
    : `<button class="story-action reaction ${story.viewer_reaction==='like'?'active':''}" onclick="reactStory(${story.id},'like')" title="Like or unlike this status">♡ ${story.like_count||0}</button><button class="story-action reaction ${story.viewer_reaction==='dislike'?'active dislike':''}" onclick="reactStory(${story.id},'dislike')" title="Dislike or remove your dislike">♧ ${story.dislike_count||0}</button><button class="story-action" onclick="reshareStory(${story.id})">↗ ${tr('Reshare')}</button>`;
  const reshareLabel=story.reshared_from?`<span class="story-origin">↗ ${tr('Reshared status')}</span>`:'';
  return `<article class="card story-card" data-story-id="${story.id}"><div class="story-head">${avatar(story.username,story.avatar,40)}<div><strong>${esc(story.username)}${story.mine?' · You':''}</strong><small>${storyRemaining(story.expires_at)} · ${timeLabel(story.created_at)}</small></div><span class="spacer"></span></div>${storyBody(story)}${story.caption?`<p class="story-caption">${esc(story.caption)}</p>`:''}${reshareLabel}<div class="story-footer">${ownActions}${reactions}</div><div class="story-viewers" hidden></div></article>`;
}
async function loadStories(){
  const list=$('#stories-list');if(!list)return;
  const result=await api('/statuses');
  if(!result.ok||!result.body?.length){list.innerHTML='<div class="empty">No active statuses yet. Be the first to post.</div>';return;}
  storyCache={};list.innerHTML=result.body.map(renderStory).join('');
}
async function editStory(id){
  const story=storyCache[id];if(!story)return;
  const content=story.type==='text'?window.prompt('Edit your story',story.content):story.content;
  if(content===null)return;
  const caption=window.prompt('Edit your caption',story.caption||'');
  if(caption===null)return;
  const result=await api('/statuses/'+id,{method:'PATCH',body:JSON.stringify({content,caption})});
  if(!result.ok)toast(result.body?.error||'Status could not be edited.');else loadStories();
}
async function deleteStory(id){
  if(!window.confirm('Delete this story now?'))return;
  const result=await api('/statuses/'+id,{method:'DELETE'});
  if(!result.ok)toast(result.body?.error||'Status could not be deleted.');else loadStories();
}
async function reactStory(id,reaction){
  const story=storyCache[id]; if(!story||story.mine)return;
  const next=story.viewer_reaction===reaction?'none':reaction;
  const result=await api('/statuses/'+id+'/reaction',{method:'POST',body:JSON.stringify({reaction:next})});
  if(!result.ok){toast(result.body?.error||'Status reaction could not be saved.');return;}
  Object.assign(story,result.body); story.viewer_reaction=result.body.viewer_reaction;
  const card=document.querySelector(`[data-story-id="${id}"]`);
  if(card)card.outerHTML=renderStory(story);
}
async function viewStory(id){
  const result=await api('/statuses/'+id+'/views');
  if(!result.ok){toast(result.body?.error||'Status viewers could not be loaded.');return;}
  const panel=document.querySelector(`[data-story-id="${id}"] .story-viewers`);
  if(!panel)return;
  const viewers=result.body||[];
  panel.innerHTML=viewers.length
    ? `<strong>Viewed by</strong>${viewers.map(viewer=>`<span>${avatar(viewer.username,viewer.avatar,24)} ${esc(viewer.username)}</span>`).join('')}`
    : '<span>No one has viewed this status yet.</span>';
  panel.hidden=!panel.hidden;
}
async function reshareStory(id){
  const result=await api('/statuses/'+id+'/reshare',{method:'POST',body:'{}'});
  if(!result.ok)toast(result.body?.error||'Status could not be reshared.');else{toast('Status reshared for 48 hours.');loadStories();}
}
async function initStoriesPage(){
  if(!token()){location.href='/';return;}
  await initPageLanguage();
  initMoreMenu();connectIncomingCallSocket();
  $('#story-file')?.addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file)return;
    const selected=file.type.startsWith('video/')?'video':'image';storyType=selected;
    storyMedia=await readFileAsDataUrl(file);
    if($('#story-file-name'))$('#story-file-name').textContent=file.name;
    setStoryType(selected);
  });
  updateStoryPrivacyFields();loadStories();
}