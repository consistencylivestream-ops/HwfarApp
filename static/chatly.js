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
// Chrome/Android default to audio/webm, which Safari (macOS/iOS) cannot record
// or play. Picking the first type the current browser actually supports keeps
// voice notes working the same way on PC, iPhone, and Android.
const pickAudioMimeType = () => {
  if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
  // Chrome/Firefox/Android support (and prefer) webm/opus; Safari on macOS
  // and iOS support neither and need audio/mp4 instead — isTypeSupported
  // lets each browser pick its own best-working format automatically.
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/aac'];
  return candidates.find(type => { try { return MediaRecorder.isTypeSupported(type); } catch (_) { return false; } }) || '';
};
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
  "Reshared status":"Statut partagé à nouveau","views":"vues","years":"ans","updates":"mises à jour",
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
  "You":"Vous","turned off disappearing messages":"a désactivé les messages éphémères",
  "set disappearing messages to":"a réglé les messages éphémères sur","24 hours":"24 heures","7 days":"7 jours","90 days":"90 jours",
  "Disappearing message":"Message éphémère",
  "Story type":"Type de statut","Text":"Texte","Add a caption (optional)":"Ajouter une légende (facultatif)",
  "Tap to record an audio status":"Appuyez pour enregistrer un statut audio","Record":"Enregistrer","Record again":"Enregistrer à nouveau",
  "Stop":"Arrêter","Loading stories…":"Chargement des statuts…","is calling":"vous appelle",
  "Incoming audio call":"Appel audio entrant","Incoming video call":"Appel vidéo entrant","Enter a username to begin":"Saisissez un nom d’utilisateur pour commencer",
  "Camera on":"Caméra activée","Camera off":"Caméra désactivée","Microphone on":"Micro activé","Microphone muted":"Micro coupé",
  "Unmute microphone":"Réactiver le micro","Connected":"Connecté","Call ended.":"Appel terminé.","Call declined.":"Appel refusé",
   "Viewed by":"Vu par","Message the owner…":"Écrire au propriétaire…","Long press a status to react":"Maintenez un statut pour réagir",
   "Show status likes and dislikes":"Afficher les j’aime et je n’aime pas des statuts","Welcome motion":"Animation d’accueil",
   "Friends and family animation on the sign-in and sign-up screen.":"Animation des amis et de la famille sur l’écran de connexion et d’inscription."
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
  applyTranslations();watchTranslations();initIncomingCallPopup();
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
function toggleLocalPreference(key,id){
  const next=localStorage.getItem(key)==='off'?'on':'off';
  localStorage.setItem(key,next);
  const switchEl=id&&$('#'+id); if(switchEl)switchEl.classList.toggle('on',next!=='off');
  if(key==='hwfar_welcome_animation'){
    const welcome=$('#auth-welcome');
    if(welcome)welcome.classList.toggle('is-off',next==='off');
  }
}
function toggleWelcomeAnimation(){toggleLocalPreference('hwfar_welcome_animation','welcome-animation-switch');}
function applyWelcomeAnimationPreference(){
  const enabled=localStorage.getItem('hwfar_welcome_animation')!=='off';
  $('#auth-welcome')?.classList.toggle('is-off',!enabled);
  $('#welcome-animation-switch')?.classList.toggle('on',enabled);
}
document.body.dataset.theme = localStorage.getItem('chatly_theme') || 'dark';
function logout(){
  if(typeof callId!=='undefined'&&callId&&!callFinished){
    localStorage.setItem('hwfar_call_logout_pending','1');
    localStorage.removeItem('chatly_token');
    localStorage.removeItem('chatly_username');
    localStorage.removeItem('chatly_user_id');
    toast('Logged out. This call stays active until you hang up.');
    return;
  }
  localStorage.removeItem('chatly_token'); localStorage.removeItem('chatly_username'); localStorage.removeItem('chatly_user_id'); location.href='/';
}

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
async function initGoogleSignIn(){
  const form=$('#auth-form'); if(!form||$('#google-signin-container'))return;
  const container=document.createElement('div');
  container.id='google-signin-container';
  container.style.cssText='margin-bottom:16px;display:flex;flex-direction:column;align-items:center;gap:10px';
  const buttonBox=document.createElement('div'); buttonBox.id='google-signin-button';
  const divider=document.createElement('div');
  divider.textContent='or continue with Google';
  divider.style.cssText='color:var(--muted);font-size:12px;text-align:center';
  container.append(buttonBox,divider);
  form.parentNode.insertBefore(container,form);
  const config=await api('/auth/google/config');
  const clientId=config.body?.client_id;
  if(!clientId){container.hidden=true;return;}
  const ready=()=>{
    if(!window.google?.accounts?.id)return;
    google.accounts.id.initialize({client_id:clientId,callback:handleGoogleCredential});
    google.accounts.id.renderButton(buttonBox,{theme:'filled_black',size:'large',shape:'pill',width:280});
  };
  if(window.google?.accounts?.id){ready();return;}
  if(document.getElementById('google-identity-script')){window.addEventListener('load',ready);return;}
  const script=document.createElement('script');
  script.src='https://accounts.google.com/gsi/client'; script.async=true; script.defer=true;
  script.id='google-identity-script'; script.onload=ready;
  document.head.appendChild(script);
}
let googlePendingToken='';
async function handleGoogleCredential(response){
  const result=await api('/auth/google',{method:'POST',body:JSON.stringify({credential:response.credential})});
  if(!result.ok){if($('#auth-error'))$('#auth-error').textContent=result.body?.error||'Google sign-in failed.';return;}
  if(result.body.new_user){openGoogleUsernameModal(result.body);return;}
  localStorage.setItem('chatly_token',result.body.access_token);
  localStorage.setItem('chatly_username',result.body.username);
  localStorage.setItem('chatly_user_id',result.body.user_id);
  localStorage.setItem('hwfar_language',result.body.language||'en');
  location.href='/chat';
}
function openGoogleUsernameModal(data){
  googlePendingToken=data.pending_token;
  const modal=$('#google-username-modal'); if(!modal)return;
  $('#google-username').value=data.suggested_username||'';
  $('#google-username-error').textContent='';
  const countrySelect=$('#google-country');
  if(countrySelect&&countrySelect.options.length<2){
    COUNTRIES.forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;countrySelect.appendChild(o);});
  }
  modal.classList.add('open'); modal.setAttribute('aria-hidden','false');
}
function closeGoogleUsernameModal(){
  const modal=$('#google-username-modal'); if(!modal)return;
  modal.classList.remove('open'); modal.setAttribute('aria-hidden','true');
}
async function submitGoogleUsername(){
  const err=$('#google-username-error');
  const payload={
    pending_token:googlePendingToken,
    username:$('#google-username').value.trim(),
    country:$('#google-country').value,
    language:currentLanguage||'en',
    age:$('#google-age').value,
    gender:$('#google-gender').value,
    community_accepted:$('#google-guidelines').checked,
  };
  const result=await api('/auth/google/complete',{method:'POST',body:JSON.stringify(payload)});
  if(!result.ok){err.textContent=result.body?.error||'Could not finish sign-up.';return;}
  localStorage.setItem('chatly_token',result.body.access_token);
  localStorage.setItem('chatly_username',result.body.username);
  localStorage.setItem('chatly_user_id',result.body.user_id);
  localStorage.setItem('hwfar_language',result.body.language||'en');
  closeGoogleUsernameModal();
  location.href='/chat';
}
let secureAccountPassword='', secureAccountEmail='';
function openSecureAccountModal(password,email){
  secureAccountPassword=password||''; secureAccountEmail=email||'';
  const modal=$('#secure-account-modal'); if(!modal){location.href='/chat';return;}
  $('#secure-error').textContent='';
  $('#secure-step-email').hidden=true; $('#secure-step-code').hidden=false;
  $('#secure-notice').textContent='We sent a 6-digit code to '+(email||'your email')+'. Enter it to finish creating your account.';
  $('#secure-code').value='';
  modal.classList.add('open'); modal.setAttribute('aria-hidden','false');
}
async function resendSecureEmailCode(){
  const err=$('#secure-error');
  const result=await api('/account/email',{method:'POST',body:JSON.stringify({email:secureAccountEmail,password:secureAccountPassword})});
  if(!result.ok){err.textContent=result.body?.error||'Could not resend code.';return;}
  err.textContent=''; $('#secure-notice').textContent='New code sent to '+secureAccountEmail+'.';
}
async function sendSecureEmailCode(){
  const email=$('#secure-email').value.trim(), err=$('#secure-error');
  if(!email){err.textContent='Enter an email address.';return;}
  const result=await api('/account/email',{method:'POST',body:JSON.stringify({email,password:secureAccountPassword})});
  if(!result.ok){err.textContent=result.body?.error||'Could not send verification code.';return;}
  secureAccountEmail=email; err.textContent='';
  $('#secure-notice').textContent='Verification code sent to '+email+'.';
  $('#secure-step-email').hidden=true; $('#secure-step-code').hidden=false;
}
async function verifySecureEmailCode(){
  const code=$('#secure-code').value.trim(), err=$('#secure-error');
  const result=await api('/account/email/verify',{method:'POST',body:JSON.stringify({code})});
  if(!result.ok){err.textContent=result.body?.error||'Incorrect code.';return;}
  toast('Email verified — your account is secured.');
  const modal=$('#secure-account-modal');
  if(modal){modal.classList.remove('open'); modal.setAttribute('aria-hidden','true');}
  location.href='/chat';
}
function initCartonGate(onSolved){
  const track=$('#carton-track'), scene=$('#carton-scene');
  if(!track||!scene)return;
  let dragging=false, startY=0, dy=0, solved=false;
  const travel=()=>Math.max(track.clientHeight-70,40); // distance from bottom start to the slot
  const setY=(y)=>{ scene.style.transform=`translate(-50%, -${y}px)`; };
  const onDown=(e)=>{
    if(solved)return;
    dragging=true; startY=(e.touches?e.touches[0]:e).clientY; dy=0;
    scene.setPointerCapture?.(e.pointerId);
  };
  const onMove=(e)=>{
    if(!dragging)return;
    const clientY=(e.touches?e.touches[0]:e).clientY;
    dy=Math.min(Math.max(startY-clientY,0),travel());
    setY(dy);
  };
  const onUp=()=>{
    if(!dragging)return; dragging=false;
    if(dy>=travel()-18){
      solved=true; setY(travel());
      track.classList.add('placed');
      setTimeout(()=>onSolved(),450);
    } else {
      setY(0);
    }
  };
  scene.addEventListener('pointerdown',onDown);
  window.addEventListener('pointermove',onMove);
  window.addEventListener('pointerup',onUp);
  scene.addEventListener('keydown',e=>{ // keyboard fallback for accessibility
    if(solved)return;
    if(e.key==='Enter'||e.key===' '){e.preventDefault();solved=true;setY(travel());track.classList.add('placed');setTimeout(()=>onSolved(),450);}
  });
}
function initAuthPage(){
  currentLanguage=localStorage.getItem('hwfar_language')==='fr'?'fr':'en';
  applyTranslations();watchTranslations();
  applyWelcomeAnimationPreference();
  if (token()) { location.href='/chat'; return; }
  initGoogleSignIn();
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
  if($('#login-fields')&&!$('#forgot-password-link')){
    const link=document.createElement('button');
    link.type='button'; link.id='forgot-password-link';
    link.textContent='Forgot password?';
    link.style.cssText='background:none;border:0;color:var(--accent2);font-weight:700;font-size:13px;margin-top:8px;cursor:pointer;padding:0;display:block';
    link.onclick=openForgotPassword;
    $('#login-fields').appendChild(link);
  }
  if($('#signup-password')&&!$('#signup-email')){
    const wrapper=$('#signup-password').closest('.field')||$('#signup-password').parentElement;
    const emailField=document.createElement('div');
    emailField.className='field';
    emailField.innerHTML='<input id="signup-email" type="email" placeholder="Email address" autocomplete="email">';
    wrapper.insertAdjacentElement('afterend',emailField);
  }
  toggle.onclick = () => {
    register = !register; signupStep = 1;
    $('#auth-title').textContent = register ? 'Create your account' : 'Welcome back';
    $('#auth-sub').textContent = register ? 'A safer, more personal way to chat.' : 'Private messages, made simple.';
    $('#login-fields').hidden = register; $('#signup-fields').hidden = !register;
    $('#auth-toggle-copy').textContent = register ? 'Already have an account?' : "Don't have an account?";
    toggle.textContent = register ? 'Log in' : 'Sign up';
    if (register) {
      if (sessionStorage.getItem('hwfar_carton_verified')) { showCartonGate(false); showSignupStep(1); }
      else { showCartonGate(true); }
    }
    $('#auth-error').textContent = ''; signupError('');
  };
  const showCartonGate = (show) => {
    if($('#signup-gate'))$('#signup-gate').hidden = !show;
    if($('#signup-steps'))$('#signup-steps').hidden = show;
    if($('.auth-progress'))$('.auth-progress').hidden = show;
  };
  initCartonGate(() => { sessionStorage.setItem('hwfar_carton_verified','1'); showCartonGate(false); showSignupStep(1); });
   if(new URLSearchParams(location.search).get('signup')==='1')toggle.click();
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
       const email = $('#signup-email')?.value.trim() || '';
       if(!email){ signupError('Add your email — it secures your account.'); return; }
       const data = {
        username: $('#signup-username').value.trim(),
        password: $('#signup-password').value,
        email,
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
      openSecureAccountModal(data.password,result.body?.email||email); return;
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

let contacts = [], active = null, socket = null, typingTimer = null, remoteTyping = false;
let mediaRecorder = null, recordingChunks = [], recordingStartedAt = 0, recordingTimer = null, recordingCancelled = false;
const icon = (name) => name === 'edit'
  ? '<svg viewBox="0 0 24 24"><path d="m4 16-.7 4.7L8 20l11.5-11.5a2.8 2.8 0 0 0-4-4L4 16Z"/><path d="m13.8 6.2 4 4"/></svg>'
  : name === 'timer'
  ? '<svg class="disappear-badge" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M10 2h4"/></svg>'
  : '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5"/></svg>';
// Disappearing-messages system notes are stored server-side as a compact
// "disappearing:<seconds>:<actor>" code (not free text) so each viewer's
// client can localize it and phrase it as "You" vs the other person's name.
const DISAPPEARING_LABELS = {0:'Off',86400:'24 hours',604800:'7 days',7776000:'90 days'};
function systemMessageText(m){
  const parts = (m.content||'').split(':');
  if (parts[0] !== 'disappearing') return esc(m.content||'');
  const seconds = Number(parts[1]), actor = parts.slice(2).join(':');
  const me = localStorage.getItem('chatly_username');
  const who = actor === me ? tr('You') : esc(actor);
  if (!seconds) return `${who} ${tr('turned off disappearing messages')}`;
  const label = tr(DISAPPEARING_LABELS[seconds] || `${seconds}s`);
  return `${who} ${tr('set disappearing messages to')} ${label}`;
}
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
let incomingCallData=null, incomingCallTransport=null;
function hideIncomingCall(){
  const pop=$('#incoming-call-pop');
  if(pop){pop.classList.remove('open');pop.hidden=true;}
  incomingCallData=null; incomingCallTransport=null; stopCallRingtone();
}
function answerIncomingCall(accepted){
  if(!incomingCallData)return;
  const data=incomingCallData, transport=incomingCallTransport;
  hideIncomingCall();
  if(transport?.connected)transport.emit('call_response',{to:data.from,call_id:data.call_id,accepted:!!accepted});
  if(accepted){
    location.href='/call/'+encodeURIComponent(data.from)+'?accepted=1&callId='+encodeURIComponent(data.call_id||'')+'&mode='+(data.mode==='video'?'video':'audio');
  }
}
function showIncomingCall(data,transport){
  if(!data?.from)return;
  incomingCallData=data; incomingCallTransport=transport;
  const pop=$('#incoming-call-pop');
  if(!pop){location.href='/call/'+encodeURIComponent(data.from)+'?incoming=1&callId='+encodeURIComponent(data.call_id||'')+'&mode='+(data.mode==='video'?'video':'audio');return;}
  $('#incoming-call-avatar').outerHTML=avatar(data.from,'',44,true);
  const avatarEl=$('#incoming-call-pop .avatar'); if(avatarEl)avatarEl.id='incoming-call-avatar';
  $('#incoming-call-name').textContent=data.from;
  $('#incoming-call-mode').textContent=data.mode==='video'?'Incoming video call':'Incoming audio call';
  pop.hidden=false;pop.classList.add('open');startCallRingtone();
}
function initIncomingCallPopup(){
  const pop=$('#incoming-call-pop'); if(!pop)return;
  $('#incoming-call-accept').onclick=()=>answerIncomingCall(true);
  $('#incoming-call-decline').onclick=()=>answerIncomingCall(false);
  $('#incoming-call-text').onclick=()=>{
    if(!incomingCallData)return;
    const name=incomingCallData.from;answerIncomingCall(false);location.href='/chat/'+encodeURIComponent(name);
  };
}
let showArchivedView=false;
async function loadContacts(){
  const result=await api('/contacts'); contacts=result.ok ? result.body : [];
  const query=($('#search')?.value || '').toLowerCase();
  const archivedCount=contacts.filter(c=>c.archived).length;
  const toggle=$('#archived-toggle-btn');
  if(toggle){toggle.hidden=!archivedCount && !showArchivedView; toggle.querySelector('span').textContent=archivedCount;}
  const scoped=contacts.filter(c=>!!c.archived===showArchivedView);
  const visible=scoped.filter(c=>c.username.toLowerCase().includes(query));
  $('#contacts').innerHTML=visible.length ? visible.map(c=>`
    <a class="contact ${active===c.username?'active':''}" href="/chat/${encodeURIComponent(c.username)}">
      ${avatar(c.username,c.avatar,44,!!c.online)}<div class="contact-main"><div class="contact-top"><span class="contact-name">${esc(c.username)}</span><span class="contact-time ${c.unread_count?'unread':''}">${timeLabel(c.last_sent_at)}</span></div>
       <div class="contact-bottom"><span class="preview">${c.last_mine?tr('You: '):''}${esc(c.last_content || tr('Start a conversation'))}</span>${c.unread_count?`<span class="badge">${c.unread_count>99?'99+':c.unread_count}</span>`:''}</div></div>
       <button class="icon-btn contact-archive" type="button" title="${c.archived?tr('Unarchive chat'):tr('Archive chat')}" aria-label="${c.archived?tr('Unarchive chat'):tr('Archive chat')}" onclick="event.preventDefault();event.stopPropagation();toggleArchiveContact('${esc(c.username)}',${!!c.archived})">${c.archived?'⤴':'⤵'}</button>
      </a>`).join('') : `<div class="empty">${showArchivedView?tr('No archived chats.'):(contacts.length||archivedCount?tr('No matches.'):tr('No chats yet — start a new one.'))}</div>`;
}
function toggleArchivedView(){
  showArchivedView=!showArchivedView;
  $('#archived-toggle-btn')?.classList.toggle('active',showArchivedView);
  loadContacts();
}
async function toggleArchiveContact(username,currentlyArchived){
  const result=await api('/contacts/'+encodeURIComponent(username)+'/archive',{method:'POST',body:JSON.stringify({archived:!currentlyArchived})});
  if(!result.ok){toast(result.body?.error||'Could not update this chat.');return;}
  if(active===username && !currentlyArchived) closeThread();
  loadContacts();
}
async function toggleActiveArchive(){
  if(!active)return;
  $('#thread-menu')?.classList.remove('open');
  const contact=contacts.find(c=>c.username===active);
  const nowArchived=!(contact&&contact.archived);
  const result=await api('/contacts/'+encodeURIComponent(active)+'/archive',{method:'POST',body:JSON.stringify({archived:nowArchived})});
  if(!result.ok){toast(result.body?.error||'Could not update this chat.');return;}
  toast(nowArchived?'Chat archived.':'Chat unarchived.');
  if(nowArchived) closeThread(); else loadContacts();
}
function presenceText(p){ return p?.online ? tr('online') : (p?.last_seen ? formatLastSeen(p.last_seen) : ''); }
async function updatePresence(){
  if (!active) return; const result=await api('/presence/'+encodeURIComponent(active));
  if (!remoteTyping && $('#thread-status')) $('#thread-status').textContent=result.ok ? presenceText(result.body) : '';
}
function voiceExtension(dataUrl){
  const match=/^data:audio\/([a-z0-9.+-]+)/i.exec(dataUrl||''); if(!match)return 'webm';
  const type=match[1].split(';')[0].toLowerCase();
  if(type==='mp4')return 'm4a'; if(type==='mpeg')return 'mp3'; if(type==='ogg')return 'ogg'; if(type==='aac')return 'aac'; return 'webm';
}
function voiceClock(seconds){
  const value=Math.max(0,Math.round(Number(seconds)||0));
  return `${Math.floor(value/60)}:${String(value%60).padStart(2,'0')}`;
}
const VOICE_SPEEDS=[1,1.5,2,0.5];
function voicePlayer(src,id,duration){
  const safeId=id||Date.now();
  return `<span class="voice-player" data-voice-player="${safeId}">
    <audio src="${esc(src)}" preload="metadata"></audio>
    <button class="voice-play" type="button" aria-label="Play voice note">▶</button>
    <span class="voice-track"><input class="voice-progress" type="range" min="0" max="100" value="0" aria-label="Voice note progress"><span class="voice-time">${voiceClock(duration)}</span></span>
    <button class="voice-speed" type="button" data-rate-index="0" title="${tr('Playback speed')}" aria-label="${tr('Playback speed')}">1x</button>
    <a class="voice-download" href="${esc(src)}" download="hwfar-voice-note-${safeId}.${voiceExtension(src)}" title="${tr('Save voice note')}" aria-label="${tr('Save voice note')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v13m0 0-4.5-4.5M12 16l4.5-4.5"/><path d="M4 20h16"/></svg></a>
  </span>`;
}
function wireVoicePlayers(root=document){
  root.querySelectorAll?.('.voice-player:not([data-ready])').forEach(player=>{
    const audio=player.querySelector('audio'), play=player.querySelector('.voice-play');
    const progress=player.querySelector('.voice-progress'), time=player.querySelector('.voice-time');
    const speedBtn=player.querySelector('.voice-speed');
    if(!audio||!play||!progress)return;
    player.dataset.ready='1';
    const update=()=>{
      const total=audio.duration||0, current=audio.currentTime||0;
      progress.value=total?String((current/total)*100):'0';
      if(time)time.textContent=voiceClock(current);
    };
    play.onclick=()=>{
      if(audio.paused){
        document.querySelectorAll('.voice-player audio').forEach(other=>{if(other!==audio){other.pause();other.closest('.voice-player')?.querySelector('.voice-play')?.replaceChildren(document.createTextNode('▶'));}});
        audio.play().catch(()=>toast('This voice note could not be played.'));
      }else audio.pause();
    };
    if(speedBtn){
      speedBtn.onclick=()=>{
        const nextIndex=(Number(speedBtn.dataset.rateIndex||'0')+1)%VOICE_SPEEDS.length;
        const rate=VOICE_SPEEDS[nextIndex];
        audio.playbackRate=rate;
        speedBtn.dataset.rateIndex=String(nextIndex);
        speedBtn.textContent=(rate===1?'1':String(rate))+'x';
      };
    }
    audio.addEventListener('play',()=>{play.textContent='❚❚';});
    audio.addEventListener('pause',()=>{play.textContent='▶';});
    audio.addEventListener('ended',()=>{play.textContent='▶';progress.value='0';if(time)time.textContent=voiceClock(audio.duration);});
    audio.addEventListener('loadedmetadata',update);audio.addEventListener('timeupdate',update);
    progress.oninput=()=>{if(audio.duration)audio.currentTime=(Number(progress.value)/100)*audio.duration;};
  });
}
const STATUS_REACTION_RE=/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\uFE0F?\s*Reacted to your status$/u;
function renderMessage(m){
  if((m.type||'text')==='system') return `<div class="day system-note" data-id="${m.id||''}">${systemMessageText(m)}</div>`;
  const mine=m.from==='me', deleted=!!m.deleted, type=m.type||'text';
  let body='', statusReactionMatch=!deleted&&type==='text' ? STATUS_REACTION_RE.exec((m.content||'').trim()) : null;
  if(deleted) body=`<span class="bubble-text">${tr('This message was deleted')}</span>`;
  else if(statusReactionMatch) body=`<span class="status-reaction-msg"><span class="status-reaction-quote"><span class="status-reaction-quote-dot" aria-hidden="true">◌</span>${tr(mine?'Your status':'Status')}</span><span class="status-reaction-emoji">${esc(statusReactionMatch[1])}</span></span>`;
  else if(type==='image') body=`<img class="message-media" src="${esc(m.content)}" alt="Image sent in chat" loading="lazy" onerror="mediaLoadError(this)">`;
  else if(type==='video') body=`<video class="message-media message-video" src="${esc(m.content)}" controls playsinline></video>`;
   else if(type==='voice') body=`<span class="voice-message"><span aria-hidden="true">🎙</span>${voicePlayer(m.content,m.id,m.duration)}</span>`;
  else body=`<span class="bubble-text">${esc(m.content)}</span>`;
  const edited=!deleted&&m.edited&&!statusReactionMatch ? `<span class="edited-label">${tr('(edited)')}</span>` : '';
  const actions=mine&&!deleted&&type==='text'&&!statusReactionMatch ? `<div class="message-actions"><button class="message-action" type="button" title="${tr('Edit message')}" aria-label="${tr('Edit message')}" onclick="editMessage(${Number(m.id)})">${icon('edit')}</button><button class="message-action" type="button" title="${tr('Delete message')}" aria-label="${tr('Delete message')}" onclick="deleteMessage(${Number(m.id)})">${icon('delete')}</button></div>` : '';
  const expiring=m.expires_at ? `<span class="meta-icon" title="${tr('Disappearing message')}">${icon('timer')}</span>` : '';
  return `<div class="row ${mine?'mine':'theirs'}" data-id="${m.id||''}"><div><div class="bubble ${deleted?'deleted':''} ${m.edited?'edited':''} ${statusReactionMatch?'status-reaction-bubble':''}">${body}${edited}<span class="meta">${expiring}${messageTime(m.sent_at)}${tick(m)}</span></div>${actions}</div></div>`;
}
function mediaLoadError(img){
  img.onerror=null;
  const placeholder=document.createElement('div');
  placeholder.className='message-media media-broken';
  placeholder.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z"/><path d="m4 15 4-4 3 3 5-5 4 4M9 9.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"/></svg><span>Image unavailable</span>';
  img.replaceWith(placeholder);
}
function openMediaViewer(url){
  const viewer=$('#media-viewer'); if(!viewer||!url)return;
  $('#media-viewer-img').src=url;
  const dl=$('#media-viewer-download');
  if(dl){const ext=/^data:image\/(\w+)/.exec(url); dl.href=url; dl.setAttribute('download','hwfar-image-'+Date.now()+'.'+(ext?ext[1].replace('jpeg','jpg'):'jpg'));}
  viewer.classList.add('open'); viewer.hidden=false; viewer.setAttribute('aria-hidden','false');
}
function closeMediaViewer(){
  const viewer=$('#media-viewer'); if(!viewer)return;
  viewer.classList.remove('open'); viewer.hidden=true; viewer.setAttribute('aria-hidden','true'); $('#media-viewer-img').src='';
}
// Disappearing messages are purged server-side lazily (on the next send/fetch/
// read), so a chat left open across the expiry moment wouldn't otherwise drop
// the bubble until you left and came back. These timers mirror that expiry
// live, purely client-side — the server remains the source of truth and will
// already have deleted the row by the time this fires.
const expiryTimers = new Map(); // message id -> array of timeout handles
const MAX_TIMEOUT = 2147483000; // just under the 32-bit setTimeout ceiling (~24.8 days)

function clearMessageExpiry(id){
  const handles=expiryTimers.get(id);
  if(handles) handles.forEach(clearTimeout);
  expiryTimers.delete(id);
}
function clearAllMessageExpiries(){
  expiryTimers.forEach(handles=>handles.forEach(clearTimeout));
  expiryTimers.clear();
}
function pruneEmptyDayLabels(){
  const box=$('#messages'); if(!box) return;
  Array.from(box.querySelectorAll('.day:not(.system-note)')).forEach(day=>{
    let sib=day.nextElementSibling, hasRow=false;
    while(sib && !sib.classList.contains('day')){ if(sib.classList.contains('row')){hasRow=true;break;} sib=sib.nextElementSibling; }
    if(!hasRow) day.remove();
  });
}
function removeExpiredMessage(id){
  expiryTimers.delete(id);
  const row=document.querySelector(`[data-id="${id}"]`); if(!row) return;
  row.classList.add('expiring');
  setTimeout(()=>{ row.remove(); pruneEmptyDayLabels(); }, 220);
  loadContacts();
}
function scheduleMessageExpiry(m){
  if(!m || !m.expires_at || !m.id) return;
  clearMessageExpiry(m.id);
  const end=sqlDate(m.expires_at); if(!end) return;
  const remaining=end.getTime()-Date.now();
  if(remaining<=0){ removeExpiredMessage(m.id); return; }
  const handles=[];
  const arm=(delay)=>{
    if(delay>MAX_TIMEOUT) handles.push(setTimeout(()=>arm(delay-MAX_TIMEOUT), MAX_TIMEOUT));
    else handles.push(setTimeout(()=>removeExpiredMessage(m.id), delay));
  };
  arm(remaining);
  expiryTimers.set(m.id, handles);
}
function renderMessages(messages){
  const box=$('#messages'); box.innerHTML=''; let last='';
  clearAllMessageExpiries();
  messages.forEach(m=>{ const label=dayLabel(m.sent_at); if(label!==last){box.insertAdjacentHTML('beforeend',`<div class="day">${label}</div>`);last=label;} box.insertAdjacentHTML('beforeend',renderMessage(m)); scheduleMessageExpiry(m); });
  wireVoicePlayers(box);
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
  $('#empty-main').hidden=true; $('#thread').hidden=false; $('#thread-name').textContent=active;
  const contact=contacts.find(c=>c.username===active);
  const profile=contact||((await api('/profile/'+encodeURIComponent(active))).body||{});
  $('#thread-avatar').outerHTML=avatar(active,profile.avatar,44,!!profile.online); // restore stable id
  const avatarEl=document.querySelector('#thread .avatar'); if(avatarEl) avatarEl.id='thread-avatar';
  const history=await api('/messages/'+encodeURIComponent(active));
  if(history.ok) renderMessages(history.body);
  const setting=await api('/chat/'+encodeURIComponent(active)+'/disappearing'); if(setting.ok) $('#disappearing').value=setting.body.seconds;
  if($('#thread-archive-btn'))$('#thread-archive-btn').textContent=(contact&&contact.archived)?tr('Unarchive chat'):tr('Archive chat');
  await updatePresence(); await markRead();
}
function closeThread(){ location.href='/chat'; }
function viewActiveProfile(){ if(active) openProfileModal(active); }
async function openProfileModal(username){
  const modal=$('#profile-modal'); if(!modal||!username) return;
  const contact=contacts.find(c=>c.username===username);
  const result=await api('/profile/'+encodeURIComponent(username));
  const u=result.ok?result.body:(contact||{username});
  $('#profile-modal-avatar').innerHTML=avatar(username,u.avatar,88,!!u.online);
  $('#profile-modal-name').textContent=username;
  $('#profile-modal-status').textContent=presenceText(u)||tr('Offline');
  const age=u.age_visible?(u.age?`${u.age} ${tr('years')}`:tr('Not added')):tr('Private');
  const gender=u.gender_visible?(u.gender||tr('Not added')):tr('Private');
  $('#profile-modal-details').innerHTML=`
    <div class="profile-detail"><small>${tr('Country')}</small><span>${esc(u.country||tr('Not added'))}</span></div>
    <div class="profile-detail"><small>${tr('Age')}</small><span>${esc(age)}</span></div>
    <div class="profile-detail"><small>${tr('Gender')}</small><span>${esc(gender)}</span></div>
    <div class="profile-detail"><small>${tr('Username')}</small><span>${esc(username)}</span></div>`;
  modal.classList.add('open'); modal.setAttribute('aria-hidden','false');
}
function closeProfileModal(){
  const modal=$('#profile-modal'); if(!modal) return;
  modal.classList.remove('open'); modal.setAttribute('aria-hidden','true');
}
function syncDisappearingControl(m){
  if(m.type!=='system'||!active)return;
  if(m.from!=='me' && m.from!==active)return;
  const parts=(m.content||'').split(':');
  if(parts[0]!=='disappearing')return;
  const select=$('#disappearing'); if(select)select.value=parts[1];
}
async function saveDisappearing(seconds){
  if(!active) return;
  await api('/chat/'+encodeURIComponent(active)+'/disappearing',{method:'POST',body:JSON.stringify({seconds:Number(seconds)})});
}
function toggleThreadMenu(){
  const menu=$('#thread-menu'); if(menu)menu.classList.toggle('open');
}
async function reportActiveUser(){
  if(!active)return;
  $('#thread-menu')?.classList.remove('open');
  const reason=window.prompt('Why are you reporting this user?', 'Inappropriate or abusive content');
  if(reason===null)return;
  const result=await api('/users/'+encodeURIComponent(active)+'/report',{method:'POST',body:JSON.stringify({reason})});
  toast(result.ok?'Report submitted.':(result.body?.error||'Could not submit report.'));
}
async function blockActiveUser(){
  if(!active)return;
  $('#thread-menu')?.classList.remove('open');
  if(!window.confirm(`Block ${active}? They will not be able to message or call you.`))return;
  const result=await api('/users/'+encodeURIComponent(active)+'/block',{method:'POST',body:'{}'});
  if(!result.ok){toast(result.body?.error||'Could not block this user.');return;}
  toast(`${active} is blocked.`);location.href='/chat';
}
function appendLiveMessage(m){
  if(m.from!=='me' && m.from!==active) return;
  const box=$('#messages'), near=box.scrollHeight-box.scrollTop-box.clientHeight<140;
  if(m.id && box.querySelector(`[data-id="${m.id}"]`)) return;
  const last=box.querySelector('.day:last-of-type'), label=dayLabel(m.sent_at);
  if(!last || last.textContent!==label) box.insertAdjacentHTML('beforeend',`<div class="day">${label}</div>`);
   box.insertAdjacentHTML('beforeend',renderMessage(m)); wireVoicePlayers(box.lastElementChild); if(near || m.from==='me') box.scrollTop=box.scrollHeight;
  scheduleMessageExpiry(m);
  if(m.from!== 'me') markRead();
}
function connectSocket(){
  socket=io({auth:{token:token()}});
  socket.on('new_message',async m=>{appendLiveMessage(m); syncDisappearingControl(m); await loadContacts(); notify(m);});
  socket.on('message_updated',m=>{if(m.from===active||m.from==='me'){const row=document.querySelector(`[data-id="${m.id}"]`);if(row)row.outerHTML=renderMessage(m);}});
  socket.on('message_status',data=>(data.ids||[]).forEach(id=>{const row=document.querySelector(`[data-id="${id}"]`); if(!row)return; const old=row.querySelector('.tick'); if(old){old.classList.toggle('read',data.status==='read'); if(data.status==='read')old.innerHTML='<path d="M1 6l4 4L11 1M5.5 6l4 4L15.5 1" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>';}}));
   socket.on('typing',data=>{if(data.from===active){remoteTyping=!!data.active;$('#thread-status').textContent=remoteTyping?tr('typing…'):''; if(!remoteTyping)updatePresence();}});
  socket.on('presence',data=>{if(data.username===active && !remoteTyping)$('#thread-status').textContent=presenceText(data);loadContacts();});
  socket.on('incoming_call',data=>showIncomingCall(data,socket));
  socket.on('call_error',data=>toast(data?.message||'Call could not be started.'));
}
function connectIncomingCallSocket(){
  if(!token()||window.CALL_USERNAME)return;
  const incomingSocket=io({auth:{token:token()}});
  incomingSocket.on('incoming_call',data=>showIncomingCall(data,incomingSocket));
  window.addEventListener('beforeunload',()=>incomingSocket.close());
}
async function sendPayload(payload){
  if(!active)return false;
  const result=await api('/send',{method:'POST',body:JSON.stringify({to:active,...payload})});
  if(result.ok){appendLiveMessage(result.body);loadContacts();return true;}
  toast(result.body?.error||'Message could not be sent.'); return false;
}
function syncComposerActions(){
  const input=$('#message-input'), send=$('#composer .send'), voice=$('#voice-button');
  if(!input||!send||!voice)return;
  const hasText=!!input.value.trim();
  send.hidden=!hasText;
  voice.hidden=hasText;
}
async function sendMessage(){
  const input=$('#message-input'), button=document.querySelector('#composer .send'), content=input.value.trim();
  if(!content||!active)return;
  input.value=''; input.style.height='auto';
  syncComposerActions();
  if(button){button.disabled=true;button.classList.add('sending');}
  if(!(await sendPayload({type:'text',content}))){input.value=content;input.dispatchEvent(new Event('input'));}
  if(button){button.disabled=false;button.classList.remove('sending');}
  syncComposerActions();
}
function readFileAsDataUrl(file){
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
}
async function sendAttachment(event){
  const file=event.target.files?.[0]; event.target.value=''; if(!file||!active)return;
  if(file.size>12*1024*1024){toast('Choose an image, video, or audio file smaller than 12 MB.');return;}
  const type=file.type.startsWith('video/')?'video':file.type.startsWith('audio/')?'voice':'image';
  try{await sendPayload({type,content:await readFileAsDataUrl(file)});}catch(_){toast('That file could not be read.');}
}
function stopRecorderAfterFlush(recorder){
  if(!recorder||recorder.state==='inactive')return;
  // Give mobile encoders time to dispatch their final dataavailable chunk.
  // Stopping immediately is what clips the last syllable of a voice note.
  try{recorder.requestData();}catch(_){}
  setTimeout(()=>{if(recorder.state!=='inactive')recorder.stop();},320);
}
async function startVoiceRecording(event){
  event?.preventDefault(); if(mediaRecorder||!active)return;
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){toast('Voice recording is not supported in this browser.');return;}
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    const pickedMime=pickAudioMimeType();
    mediaRecorder=pickedMime?new MediaRecorder(stream,{mimeType:pickedMime}):new MediaRecorder(stream);
    recordingChunks=[]; recordingStartedAt=Date.now(); recordingCancelled=false;
     const button=$('#voice-button'); button.classList.add('recording'); button.title='Tap again to send voice message';
    const status=document.createElement('span');status.id='recording-status';status.className='recording-status';
    const timeEl=document.createElement('span');timeEl.id='recording-time';timeEl.textContent='● 0s';
    const cancelBtn=document.createElement('button');cancelBtn.type='button';cancelBtn.id='recording-cancel';cancelBtn.className='recording-cancel';cancelBtn.title='Discard recording';cancelBtn.setAttribute('aria-label','Discard recording');cancelBtn.textContent='✕';
    cancelBtn.onclick=e=>{e.preventDefault();e.stopPropagation();cancelVoiceRecording();};
    status.append(timeEl,cancelBtn); $('#composer').appendChild(status);
    recordingTimer=setInterval(()=>{timeEl.textContent=`● ${Math.floor((Date.now()-recordingStartedAt)/1000)}s`;},250);
    mediaRecorder.ondataavailable=e=>{if(e.data&&e.data.size)recordingChunks.push(e.data);};
    mediaRecorder.onstop=async()=>{
       clearInterval(recordingTimer);status.remove();button.classList.remove('recording');button.title='Tap to record, tap again to send';
      stream.getTracks().forEach(track=>track.stop()); const duration=Math.max(1,Math.round((Date.now()-recordingStartedAt)/1000)); const mime=mediaRecorder.mimeType||pickedMime; mediaRecorder=null;
      if(recordingCancelled||!recordingChunks.length){recordingCancelled=false;return;}
      const blob=new Blob(recordingChunks,{type:mime||'audio/webm'}); const data=await readFileAsDataUrl(blob);
      await sendPayload({type:'voice',content:data,duration});
    };
    // Flushing chunks every 250ms (instead of one chunk delivered only at
    // stop time) is what was letting the last stretch of a recording get
    // lost/cut off on some devices and browsers.
    mediaRecorder.start(250);
  }catch(_){toast('Microphone access was blocked. Allow it to record voice notes.');mediaRecorder=null;}
}
function stopVoiceRecording(event){
  event?.preventDefault(); if(!mediaRecorder||mediaRecorder.state==='inactive')return;
  stopRecorderAfterFlush(mediaRecorder);
}
function cancelVoiceRecording(){
  if(!mediaRecorder)return;
  recordingCancelled=true;
  if(mediaRecorder.state!=='inactive')mediaRecorder.stop();
  toast('Voice note discarded.');
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
  if(m.from==='me'||m.type==='system')return;
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
  active=window.ACTIVE_USERNAME||null;
  await initPageLanguage();
  initMoreMenu();
  $('#search').oninput=loadContacts;
  $('#composer').onsubmit=e=>{e.preventDefault();sendMessage();};
  $('#attach-button').onclick=()=>$('#attachment-input').click();
  $('#attachment-input').onchange=sendAttachment;
  $('#thread-more')?.addEventListener('click',event=>{event.stopPropagation();toggleThreadMenu();});
  document.addEventListener('click',()=>$('#thread-menu')?.classList.remove('open'));
  $('#thread-profile-trigger')?.addEventListener('click',viewActiveProfile);
  $('#profile-modal-close')?.addEventListener('click',closeProfileModal);
  $('#profile-modal')?.addEventListener('click',e=>{if(e.target.id==='profile-modal')closeProfileModal();});
  $('#messages')?.addEventListener('click',e=>{const img=e.target.closest('img.message-media'); if(img)openMediaViewer(img.src);});
  $('#media-viewer-close')?.addEventListener('click',closeMediaViewer);
  $('#media-viewer')?.addEventListener('click',e=>{if(e.target.id==='media-viewer')closeMediaViewer();});
  const voice=$('#voice-button'); voice.onclick=toggleVoiceRecording;
  $('#message-input').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}};
  $('#message-input').oninput=e=>{e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,120)+'px';syncComposerActions(); if(socket&&active){socket.emit('typing',{to:active,active:true});clearTimeout(typingTimer);typingTimer=setTimeout(()=>socket.emit('typing',{to:active,active:false}),1800);}};
  syncComposerActions();
  if(window.visualViewport){
    const vv=window.visualViewport;
    const pinComposer=()=>{
      const composer=$('#composer'); if(!composer)return;
      const overlap=window.innerHeight-vv.height-vv.offsetTop;
      composer.style.transform=overlap>0?`translateY(-${overlap}px)`:'';
      const box=$('#messages'); if(box)box.scrollTop=box.scrollHeight;
    };
    vv.addEventListener('resize',pinComposer); vv.addEventListener('scroll',pinComposer);
  }
  loadContacts().then(openThread); connectSocket(); document.addEventListener('visibilitychange',markRead);
}
async function initSettingsPage(){
  if(!token()){location.href='/';return;}
  await initPageLanguage();
  initMoreMenu();
  connectIncomingCallSocket();
  const me=await api('/account/me'); if(!me.ok)return;
  if($('#new-username'))$('#new-username').value=me.body.username;
  if($('#avatar-preview')){
    $('#avatar-preview').innerHTML=me.body.avatar?`<img src="${esc(me.body.avatar)}" alt="Profile photo">`:'👤';
    initAvatarUpload();
  }
  if($('#account-email')){
    $('#account-email').value=me.body.email||'';
    renderEmailStatus(me.body.email,me.body.email_verified);
  }
  if($('#google-account-card'))$('#google-account-card').hidden=!me.body.google_linked;
  if($('#online-switch'))$('#online-switch').classList.toggle('on',me.body.show_online!==false);
  if($('#age-switch'))$('#age-switch').classList.toggle('on',!!me.body.show_age);
  if($('#gender-switch'))$('#gender-switch').classList.toggle('on',!!me.body.show_gender);
  if($('#lastseen-switch'))$('#lastseen-switch').classList.toggle('on',me.body.show_last_seen!==false);
  if($('#statusviews-switch'))$('#statusviews-switch').classList.toggle('on',me.body.share_status_views!==false);
   if($('#status-reactions-switch'))$('#status-reactions-switch').classList.toggle('on',me.body.show_status_reactions!==false);
  if($('#theme-switch'))$('#theme-switch').classList.toggle('on',document.body.dataset.theme==='dark');
   if($('#welcome-animation-switch'))$('#welcome-animation-switch').classList.toggle('on',localStorage.getItem('hwfar_welcome_animation')!=='off');
  if($('#notification-switch'))$('#notification-switch').classList.toggle('on',localStorage.getItem('chatly_notifications')==='on');
  if($('#notification-sound-switch'))$('#notification-sound-switch').classList.toggle('on',soundOn('hwfar_notification_sound'));
  if($('#call-sound-switch'))$('#call-sound-switch').classList.toggle('on',soundOn('hwfar_call_sound'));
  document.querySelectorAll('.language-choice').forEach(button=>button.classList.toggle('active',button.dataset.language===currentLanguage));
  if($('#blocked-list'))loadBlockedList();
  if($('#about-installs'))loadAppStats();
}
function paintStars(n){
  document.querySelectorAll('.about-star').forEach(btn=>{
    const filled=Number(btn.dataset.star)<=n;
    btn.textContent=filled?'★':'☆'; btn.style.color=filled?'var(--accent)':'';
  });
}
async function loadAppStats(){
  const result=await api('/api/app-stats'); if(!result.ok)return;
  const {installs,rating_count,rating_average,my_rating}=result.body;
  $('#about-installs').textContent=`${installs.toLocaleString()} install${installs===1?'':'s'}`;
  $('#about-rating').textContent=rating_count?`${rating_average}★ average from ${rating_count} rating${rating_count===1?'':'s'}`:'Be the first to rate HwFar.';
  paintStars(my_rating||0);
}
async function rateApp(stars){
  paintStars(stars);
  const result=await api('/api/app-rate',{method:'POST',body:JSON.stringify({stars})});
  if(!result.ok){toast(result.body?.error||'Could not save your rating.');return;}
  $('#about-rating').textContent=`${result.body.rating_average}★ average from ${result.body.rating_count} rating${result.body.rating_count===1?'':'s'} — thanks!`;
}
function deviceId(){
  let id=localStorage.getItem('hwfar_device_id');
  if(!id){id=(crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`);localStorage.setItem('hwfar_device_id',id);}
  return id;
}
function trackInstall(){
  if(localStorage.getItem('hwfar_install_tracked'))return;
  localStorage.setItem('hwfar_install_tracked','1');
  api('/api/app-install',{method:'POST',body:JSON.stringify({device_id:deviceId()})});
}
window.addEventListener('appinstalled',trackInstall);
async function togglePrivacySetting(setting='show_online'){
  const ids={show_online:'online-switch',show_age:'age-switch',show_gender:'gender-switch',show_last_seen:'lastseen-switch',share_status_views:'statusviews-switch'};
  const sw=$('#'+ids[setting]); if(!sw)return;
  const next=!sw.classList.contains('on'); sw.classList.toggle('on',next);
  const result=await api('/account/privacy',{method:'POST',body:JSON.stringify({[setting]:next})});
  if(!result.ok) { sw.classList.toggle('on',!next); if($('#settings-flash'))$('#settings-flash').textContent=result.body?.error||'Could not save privacy setting.'; }
}
async function loadBlockedList(){
  const list=$('#blocked-list'); if(!list)return;
  const result=await api('/blocked');
  if(!result.ok){list.innerHTML='<div class="empty">Could not load your blocked list.</div>';return;}
  const blocked=result.body||[];
  list.innerHTML=blocked.length?blocked.map(u=>`
    <div class="setting"><div>${avatar(u.username,u.avatar,36)}</div><div><b>${esc(u.username)}</b></div><div class="spacer"></div>
    <button class="btn secondary" type="button" onclick="unblockUser('${esc(u.username)}')">Unblock</button></div>`).join('')
    :'<div class="empty">You haven\'t blocked anyone.</div>';
}
async function unblockUser(username){
  const result=await api('/users/'+encodeURIComponent(username)+'/unblock',{method:'POST',body:'{}'});
  if(!result.ok){toast(result.body?.error||'Could not unblock this user.');return;}
  toast(`${username} is unblocked.`);
  loadBlockedList();
}
async function saveUsername(){
  const result=await api('/account/username',{method:'POST',body:JSON.stringify({username:$('#new-username').value.trim()})});
  $('#settings-flash').textContent=result.ok?'Username updated.':(result.body?.error||'Could not update username.');
}
function initAvatarUpload(){
  const input=$('#avatar-upload'); if(!input||input._wired)return; input._wired=true;
  input.addEventListener('change',event=>{
    const file=event.target.files?.[0]; if(!file)return;
    if(file.size>2*1024*1024){$('#settings-flash').textContent='Choose an image smaller than 2 MB.';event.target.value='';return;}
    const reader=new FileReader();
    reader.onload=async()=>{
      const dataUrl=reader.result;
      $('#avatar-preview').innerHTML=`<img src="${esc(dataUrl)}" alt="Profile photo">`;
      const result=await api('/account/avatar',{method:'POST',body:JSON.stringify({avatar:dataUrl})});
      $('#settings-flash').textContent=result.ok?'Profile photo updated.':(result.body?.error||'Could not update photo.');
    };
    reader.readAsDataURL(file);
  });
}
function renderEmailStatus(email,verified){
  const badge=$('#email-status-badge'); if(!badge)return;
  badge.textContent=!email?'· No email on file':(verified?'· Verified ✓':'· Not verified yet');
  if($('#remove-email-btn'))$('#remove-email-btn').hidden=!email;
}
async function sendEmailCode(){
  const email=$('#account-email').value.trim(), password=$('#email-password').value, flash=$('#settings-flash');
  if(!password){flash.textContent="Enter your current password to confirm it's you.";return;}
  const result=await api('/account/email',{method:'POST',body:JSON.stringify({email,password})});
  if(!result.ok){flash.textContent=result.body?.error||'Could not send verification code.';return;}
  flash.textContent='Verification code sent to '+email+'.';
  $('#email-password').value='';
  renderEmailStatus(email,false);
  if($('#email-code-row'))$('#email-code-row').hidden=false;
}
async function verifyEmailCode(){
  const code=$('#email-code').value.trim(), flash=$('#settings-flash');
  const result=await api('/account/email/verify',{method:'POST',body:JSON.stringify({code})});
  if(!result.ok){flash.textContent=result.body?.error||'Incorrect code.';return;}
  flash.textContent='Email verified. You can now use it to reset your password.';
  $('#email-code').value=''; if($('#email-code-row'))$('#email-code-row').hidden=true;
  renderEmailStatus(result.body.email,true);
}
async function removeEmail(){
  const password=$('#email-password').value, flash=$('#settings-flash');
  if(!password){flash.textContent="Enter your current password to confirm it's you.";return;}
  if(!confirm('Remove your recovery email? You will only be able to reset your password if you have another sign-in method.'))return;
  const result=await api('/account/email/delete',{method:'POST',body:JSON.stringify({password})});
  if(!result.ok){flash.textContent=result.body?.error||'Could not remove email.';return;}
  flash.textContent='Recovery email removed.';
  $('#email-password').value=''; $('#account-email').value='';
  if($('#email-code-row'))$('#email-code-row').hidden=true;
  renderEmailStatus('',false);
}
async function unlinkGoogleAccount(){
  const password=$('#google-unlink-password').value, flash=$('#settings-flash');
  if(!password){flash.textContent="Enter your current password to confirm it's you.";return;}
  if(!confirm('Unlink your Google account? You will need your HwFar username and password to log in.'))return;
  const result=await api('/account/google/unlink',{method:'POST',body:JSON.stringify({password})});
  if(!result.ok){flash.textContent=result.body?.error||'Could not unlink Google account.';return;}
  flash.textContent='Google account unlinked.';
  $('#google-unlink-password').value='';
  if($('#google-account-card'))$('#google-account-card').hidden=true;
}
async function changePassword(){
  const current=$('#current-password').value, next=$('#new-password').value, flash=$('#settings-flash');
  if(next.length<6){flash.textContent='New password needs at least 6 characters.';return;}
  const result=await api('/account/password',{method:'POST',body:JSON.stringify({current_password:current,new_password:next})});
  flash.textContent=result.ok?'Password updated.':(result.body?.error||'Could not update password.');
  if(result.ok){$('#current-password').value='';$('#new-password').value='';}
}
let forgotIdentifier='';
function openForgotPassword(){
  const modal=$('#forgot-modal'); if(!modal)return;
  $('#forgot-step-request').hidden=false; $('#forgot-step-reset').hidden=true;
  $('#forgot-error').textContent=''; $('#forgot-identifier').value='';
  $('#forgot-code').value=''; $('#forgot-new-password').value='';
  modal.classList.add('open'); modal.setAttribute('aria-hidden','false');
}
function closeForgotPassword(){
  const modal=$('#forgot-modal'); if(!modal)return;
  modal.classList.remove('open'); modal.setAttribute('aria-hidden','true');
}
async function requestPasswordReset(){
  const identifier=$('#forgot-identifier').value.trim(), err=$('#forgot-error');
  if(!identifier){err.textContent='Enter your username or email.';return;}
  const result=await api('/forgot-password',{method:'POST',body:JSON.stringify({identifier})});
  if(!result.ok){err.textContent=result.body?.error||'Something went wrong. Try again in a moment.';return;}
  forgotIdentifier=identifier; err.textContent='';
  $('#forgot-notice').textContent=result.body?.message||"If that account has a verified email on file, we've sent a reset code to it.";
  $('#forgot-step-request').hidden=true; $('#forgot-step-reset').hidden=false;
}
async function submitPasswordReset(){
  const code=$('#forgot-code').value.trim(), newPassword=$('#forgot-new-password').value, err=$('#forgot-error');
  if(newPassword.length<6){err.textContent='New password needs at least 6 characters.';return;}
  const result=await api('/reset-password',{method:'POST',body:JSON.stringify({identifier:forgotIdentifier,code,new_password:newPassword})});
  if(!result.ok){err.textContent=result.body?.error||'Could not reset password.';return;}
  closeForgotPassword(); toast('Password updated. You can now log in.');
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
      <div class="discover-actions"><button class="btn secondary" onclick="startDiscovered('${encodeURIComponent(u.username)}')">Message</button></div>
    </article>`;
  }).join('');
}
async function startDiscovered(encoded){const username=decodeURIComponent(encoded);await api('/contacts/add',{method:'POST',body:JSON.stringify({username})});location.href='/chat/'+encodeURIComponent(username);}
async function initNewChatPage(){
  if(!token()){location.href='/';return;}
  await initPageLanguage();
  initMoreMenu();
  connectIncomingCallSocket();
  $('#new-chat-username').onkeydown=e=>{if(e.key==='Enter')createChat();};
  if(window.PREFILL_TO)$('#new-chat-username').value=window.PREFILL_TO;
}
function shareLink(url,title,text){
  if(navigator.share){navigator.share({title,text,url}).catch(()=>{});return;}
  navigator.clipboard?.writeText(url).then(()=>toast('Link copied.'),()=>toast(url));
}
function shareMyProfileLink(){
  const me=localStorage.getItem('chatly_username'); if(!me)return;
  shareLink(`${location.origin}/new-chat?to=${encodeURIComponent(me)}`,'Chat with me on HwFar',`Message me on HwFar — I'm @${me}`);
}
function shareActiveChatLink(){
  if(!active)return;
  $('#thread-menu')?.classList.remove('open');
  shareLink(`${location.origin}/new-chat?to=${encodeURIComponent(active)}`,`Chat with @${active} on HwFar`,`Message @${active} on HwFar`);
}
function shareAppLink(){
  shareLink(location.origin,'HwFar','Send private messages with the people you care about — try HwFar.');
}
async function createChat(){
  const username=$('#new-chat-username').value.trim(), error=$('#new-chat-error'); if(!username){error.textContent='Enter a username.';return;}
  const result=await api('/contacts/add',{method:'POST',body:JSON.stringify({username})});
  if(!result.ok){error.textContent=result.body?.error||'Could not start chat.';return;} location.href='/chat/'+encodeURIComponent(username);
}

let callSocket=null, callPeer=null, callStream=null, callTargetName='', callCurrentUser='', callId='', callMode='audio', pendingCallCandidates=[], callFinished=false, callRole='';
const CALL_STATE_KEY='hwfar_active_call';
function persistCallState(state){
  if(!callId)return;
  localStorage.setItem(CALL_STATE_KEY,JSON.stringify({
    callId,peer:callTargetName,mode:callMode,role:callRole,state:state||'active',
    user:callCurrentUser,updatedAt:Date.now()
  }));
}
function clearCallState(){
  const current=readCallState();
  if(!current||!callId||current.callId===callId)localStorage.removeItem(CALL_STATE_KEY);
}
function readCallState(){
  try{
    const state=JSON.parse(localStorage.getItem(CALL_STATE_KEY)||'null');
    return state?.callId?state:null;
  }catch(_){return null;}
}
window.addEventListener('storage',event=>{
  if(event.key===CALL_STATE_KEY&&event.newValue===null&&callId&&!callFinished)finishCall('Call ended.');
});
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
    callSocket.on('incoming_call',data=>{if(!callId)showIncomingCall(data,callSocket);});
    callSocket.on('call_response',async data=>{
      if(data.call_id!==callId)return;
      if(!data.accepted){finishCall('Call declined.');return;}
      stopCallRingtone();
      persistCallState('active');
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
      localAudio.muted=true;
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
  callRole='caller';persistCallState('ringing');
  callFinished=false;
  await ensureCallSocket();
  callSocket.emit('call_invite',{to:callTargetName,call_id:callId,mode:callMode});
  $('#call-dialer')?.setAttribute('hidden','');
  $('#start-call')?.setAttribute('hidden','');
  $('#call-actions')?.removeAttribute('hidden');
  callStatus(`${tr('Calling')} ${callTargetName}…`);
}
async function acceptCall(){
  callError('');
  stopCallRingtone();
  const ready=await getCallMedia(); if(!ready)return;
  callRole='receiver';persistCallState('active');
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
  clearCallState();
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
  if(callTargetName)$('#start-call')?.removeAttribute('hidden');
  else $('#call-actions')?.setAttribute('hidden','');
  callStatus(message||tr('Call ended.'));
  loadCallHistory();
  if(localStorage.getItem('hwfar_call_logout_pending')==='1'){
    localStorage.removeItem('hwfar_call_logout_pending');location.href='/';
  }
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
  showIncomingCall(data,callSocket);
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
  let savedCall=readCallState();
  if(!callTargetName&&!savedCall){
    const activeResult=await api('/calls/active');
    if(activeResult.ok&&activeResult.body?.active){
      savedCall={
        callId:activeResult.body.call_id,peer:activeResult.body.username,
        mode:activeResult.body.mode,role:activeResult.body.direction==='incoming'?'receiver':'caller',
        user:callCurrentUser,state:activeResult.body.status
      };
    }
  }
  if(!callTargetName&&savedCall&&(!savedCall.user||savedCall.user===callCurrentUser)){
    callTargetName=savedCall.peer||'';
    callId=savedCall.callId||'';
    callMode=savedCall.mode==='video'?'video':'audio';
    callRole=savedCall.role||'caller';
  }
  if(query.get('mode'))setCallMode(query.get('mode'));
  if($('#call-username')){
    $('#call-username').value=callTargetName;
    $('#call-username').oninput=e=>{
      callTargetName=e.target.value.trim();
      if(!callQuery().get('incoming'))$('#call-actions').toggleAttribute('hidden',!callTargetName);
    };
    $('#call-username').onkeydown=e=>{if(e.key==='Enter')startCall();};
  }
  if(callTargetName){
    $('#call-actions')?.removeAttribute('hidden');
    $('#start-call')?.removeAttribute('hidden');
    $('#call-name').textContent=callTargetName;
    const profile=await api('/profile/'+encodeURIComponent(callTargetName));
    if(profile.ok){renderCallAvatar(profile.body);if(profile.body.online)callStatus('online');}
  }
  await ensureCallSocket();
  loadCallHistory();
  const alreadyAccepted=query.get('accepted')==='1';
  if(incoming){
    callId=query.get('callId')||'';callRole='receiver';persistCallState('ringing');
    $('#call-name').textContent=`${callTargetName} ${tr('is calling')}`;
    $('#call-dialer')?.setAttribute('hidden',''); $('#start-call')?.setAttribute('hidden','');
    $('#incoming-actions')?.removeAttribute('hidden'); $('#call-actions')?.setAttribute('hidden','');
    startCallRingtone();
    callStatus(tr(callMode==='video'?'Incoming video call':'Incoming audio call'));
  }else if(alreadyAccepted){
    // The person already tapped Accept on the incoming-call popup, which has
    // already told the caller to proceed — just get media ready to receive the offer.
    callId=query.get('callId')||'';callRole='receiver';persistCallState('active');
    $('#call-name').textContent=callTargetName;
    $('#call-dialer')?.setAttribute('hidden',''); $('#start-call')?.setAttribute('hidden','');
    $('#incoming-actions')?.setAttribute('hidden',''); $('#call-actions')?.removeAttribute('hidden');
    callStatus('Connecting…');
    const ready=await getCallMedia();
    if(!ready)finishCall('Could not access your microphone.');
  }else if(callId&&callTargetName){
    $('#call-dialer')?.setAttribute('hidden','');
    $('#start-call')?.setAttribute('hidden','');
    callStatus(callRole==='receiver'?'Connected call — tap hang up to end':'Call active — return to the call tab');
  }else if(!callTargetName){
    callStatus(tr('Enter a username to begin'));
  }
  // Deliberately do not emit call_end on unload. A tab switch, reload, or
  // logout must not terminate the session; only the hang-up action does.
}

let storyType='text', storyMedia='', storyAudioRecorder=null, storyAudioChunks=[], storyCache={};
function setStoryType(type){
  storyType=['text','image','video','audio'].includes(type)?type:'text';
  document.querySelectorAll('[data-story-type]').forEach(button=>button.classList.toggle('active',button.dataset.storyType===storyType));
  const text=$('#story-text'), fileRow=$('#story-file-row'), audioRow=$('#story-audio-row');
  if(text)text.hidden=storyType!=='text';
  if(fileRow)fileRow.hidden=!['image','video','audio'].includes(storyType)||!storyMedia;
  if(audioRow)audioRow.hidden=storyType!=='audio';
  if(['image','video','audio'].includes(storyType)&&!storyMedia)$('#story-file')?.click();
}
function toggleStoryAddMenu(){
  $('#story-add-menu')?.classList.toggle('open');
}
function chooseStoryOption(type){
  $('#story-add-menu')?.classList.remove('open');
  $('#story-composer')?.removeAttribute('hidden');
  setStoryType(type);
  if(type==='text')focusStoryComposer();
}
function clearStoryMedia(){
  storyMedia=''; const file=$('#story-file'); if(file)file.value='';
  if($('#story-file-row'))$('#story-file-row').hidden=true;
  if($('#story-audio-status'))$('#story-audio-status').textContent='Tap to record an audio status';
}
async function toggleStoryAudio(){
  const button=$('#story-audio-button'), status=$('#story-audio-status');
  if(storyAudioRecorder){
    if(storyAudioRecorder.state!=='inactive'){
      stopRecorderAfterFlush(storyAudioRecorder);
    }
    return;
  }
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){if(status)status.textContent='Audio recording is not supported here.';return;}
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    const pickedMime=pickAudioMimeType();
    storyAudioChunks=[]; storyAudioRecorder=pickedMime?new MediaRecorder(stream,{mimeType:pickedMime}):new MediaRecorder(stream);
    button.textContent='Stop'; if(status)status.textContent='Recording audio…';
    storyAudioRecorder.ondataavailable=e=>{if(e.data&&e.data.size)storyAudioChunks.push(e.data);};
    storyAudioRecorder.onstop=async()=>{
      stream.getTracks().forEach(track=>track.stop());
      const blob=new Blob(storyAudioChunks,{type:storyAudioRecorder?.mimeType||pickedMime||'audio/webm'});
      storyMedia=await readFileAsDataUrl(blob); storyAudioRecorder=null;
      button.textContent='Record again'; if(status)status.textContent='Audio ready to post.';
    };
    storyAudioRecorder.start(250);
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
  $('#story-composer')?.setAttribute('hidden','');
  updateStoryPrivacyFields();setStoryType('text');
}
function focusStoryComposer(){
  $('#story-composer')?.removeAttribute('hidden');
  $('#story-add-menu')?.classList.remove('open');
  $('#story-text')?.focus();window.scrollTo({top:0,behavior:'smooth'});
}
function storyRemaining(value){
  const end=sqlDate(value); if(!end)return '';
  const minutes=Math.max(0,Math.round((end-Date.now())/60000));
  if(minutes<60)return `${minutes}${currentLanguage==='fr'?' min':'m'} ${currentLanguage==='fr'?'restantes':'left'}`;
  return `${Math.floor(minutes/60)} h ${currentLanguage==='fr'?'restantes':'left'}`;
}
function storyBody(story){
  if(story.type==='image')return `<img class="story-media" src="${esc(story.content)}" alt="Story from ${esc(story.username)}">`;
  if(story.type==='video')return `<video class="story-media story-video" src="${esc(story.content)}" controls playsinline></video>`;
  if(story.type==='audio')return `<div class="story-audio"><span>◉</span>${voicePlayer(story.content,'status-'+story.id,story.duration)}</div>`;
  return `<div class="story-text">${esc(story.content)}</div>`;
}
// Statuses are grouped per user (like WhatsApp): each row in the list represents
// one person, and opening it steps through every one of their statuses in order.
let storyGroups=[], viewerGroupIdx=0, viewerItemIdx=0, viewerAutoTimer=null, viewerMediaEl=null;
function groupStoriesByUser(stories){
  const order=[], byUser={};
  stories.forEach(story=>{
    storyCache[story.id]=story;
    const key=story.username;
    if(!byUser[key]){byUser[key]={username:story.username,avatar:story.avatar,mine:!!story.mine,items:[]};order.push(key);}
    byUser[key].items.push(story);
  });
  order.forEach(key=>byUser[key].items.sort((a,b)=>(sqlDate(a.created_at)||0)-(sqlDate(b.created_at)||0)));
  return order.map(key=>byUser[key]);
}
function groupRingClass(group){
  return (group.mine || group.items.every(item=>item.viewed_by_me)) ? 'seen' : 'unseen';
}
function refreshStoryRowRing(groupIndex){
  const group=storyGroups[groupIndex]; if(!group)return;
  const ring=document.querySelector(`.status-row[data-group-index="${groupIndex}"] .status-ring`);
  if(!ring)return;
  const seen=groupRingClass(group)==='seen';
  ring.classList.toggle('seen',seen); ring.classList.toggle('unseen',!seen);
}
let statusReactionPicker=null, statusLongPressTimer=null, statusLongPressTarget=null, statusLongPressTriggered=false;
function closeStatusReactionPicker(){
  statusReactionPicker?.remove();statusReactionPicker=null;
}
function openStatusReactionPicker(story,anchor){
  if(!story||story.mine||!anchor)return;
  closeStatusReactionPicker();
  const picker=document.createElement('div');
  picker.className='status-reaction-picker';
  picker.setAttribute('role','menu');
  // Positive emoji map to the public "like" total; negative emoji map to
  // "dislike", keeping the existing privacy-aware totals consistent.
  [['like','👍'],['like','❤️'],['like','😂'],['dislike','👎'],['dislike','😡']].forEach(([reaction,emoji])=>{
    const button=document.createElement('button');button.type='button';button.textContent=emoji;
    button.title=reaction==='like'?'Like':'Dislike';
    button.onclick=()=>{closeStatusReactionPicker();reactStory(story.id,reaction,emoji);};
    picker.appendChild(button);
  });
  document.body.appendChild(picker);statusReactionPicker=picker;
  const rect=anchor.getBoundingClientRect();
  picker.style.left=`${Math.max(74,Math.min(window.innerWidth-74,rect.left+rect.width/2))}px`;
  picker.style.top=`${Math.max(62,rect.top-8)}px`;
}
function storyForLongPress(target){
  const row=target.closest?.('.status-row');
  if(row){
    const group=storyGroups[Number(row.dataset.groupIndex)];
    return {story:group?.items?.[group.items.length-1],anchor:row};
  }
  if(target.closest?.('#viewer-body')){
    const group=storyGroups[viewerGroupIdx];
    return {story:group?.items?.[viewerItemIdx],anchor:target.closest('#viewer-body')};
  }
  return {};
}
function bindStatusLongPress(){
  document.addEventListener('pointerdown',event=>{
    if(event.pointerType==='mouse'&&event.button!==0)return;
    const found=storyForLongPress(event.target),story=found.story;
    if(!story||story.mine||event.target.closest('button,a,input,video,audio'))return;
    statusLongPressTarget=found.anchor;statusLongPressTriggered=false;
    clearTimeout(statusLongPressTimer);
    statusLongPressTimer=setTimeout(()=>{
      statusLongPressTriggered=true;
      openStatusReactionPicker(story,statusLongPressTarget);
    },520);
  },{passive:true});
  ['pointerup','pointercancel','pointermove'].forEach(type=>document.addEventListener(type,()=>{
    clearTimeout(statusLongPressTimer);statusLongPressTimer=null;
  },{passive:true}));
  document.addEventListener('click',event=>{
    if(statusLongPressTriggered){event.preventDefault();event.stopPropagation();statusLongPressTriggered=false;return;}
    if(statusReactionPicker&&!event.target.closest('.status-reaction-picker'))closeStatusReactionPicker();
  },true);
}
function renderStoryGroupRow(group,groupIndex){
  const latest=group.items[group.items.length-1], count=group.items.length;
  const ringClass=groupRingClass(group);
  const countLabel=count>1?`${count} ${tr('updates')}`:(group.mine?`${latest.view_count||0} ${tr('views')}`:(latest.type==='text'?'Text status':latest.type==='audio'?'Audio status':latest.type==='video'?'Video status':'Photo status'));
  return `<article class="status-row" data-group-index="${groupIndex}" onclick="openStoryGroup(${groupIndex})"><div class="status-ring ${ringClass}">${avatar(group.username,group.avatar,46)}</div><div class="status-info"><strong>${esc(group.username)}${group.mine?' · You':''}</strong><small>${countLabel} · ${storyRemaining(latest.expires_at)}</small></div><div class="status-row-actions"><span class="muted">›</span></div></article>`;
}
async function loadStories(){
  const list=$('#stories-list'),mineList=$('#my-status-row');if(!list||!mineList)return;
  const result=await api('/statuses');
  storyCache={};storyGroups=[];
  if(!result.ok||!result.body?.length){
    mineList.innerHTML='<div class="status-empty">Add a status update for your contacts.</div>';
    list.innerHTML='<div class="status-empty">No recent updates yet.</div>';return;
  }
  storyGroups=groupStoriesByUser(result.body);
  const ownIndex=storyGroups.findIndex(g=>g.mine);
  const otherIndexes=storyGroups.map((g,i)=>i).filter(i=>i!==ownIndex);
  mineList.innerHTML=ownIndex>-1?renderStoryGroupRow(storyGroups[ownIndex],ownIndex):'<div class="status-empty">Add a status update for your contacts.</div>';
  list.innerHTML=otherIndexes.length?otherIndexes.map(i=>renderStoryGroupRow(storyGroups[i],i)).join(''):'<div class="status-empty">No recent updates yet.</div>';
}
function clearViewerAutoAdvance(){
  if(viewerAutoTimer){clearTimeout(viewerAutoTimer);viewerAutoTimer=null;}
  if(viewerMediaEl){viewerMediaEl.removeEventListener('ended',viewerAdvanceHandler);viewerMediaEl=null;}
}
function viewerAdvanceHandler(){stepStory(1);}
function scheduleViewerAutoAdvance(story){
  clearViewerAutoAdvance();
  if(story.type==='video'||story.type==='audio'){
    const mediaEl=$('#viewer-body')?.querySelector('video,audio');
    if(mediaEl){viewerMediaEl=mediaEl;mediaEl.addEventListener('ended',viewerAdvanceHandler);}
  }else{
    viewerAutoTimer=setTimeout(()=>stepStory(1),5000);
  }
}
function renderStoryViewer(){
  const group=storyGroups[viewerGroupIdx]; if(!group)return;
  const story=group.items[viewerItemIdx]; if(!story)return;
  storyCache[story.id]=story;
  const viewer=$('#status-viewer');if(!viewer)return;
  const progress=$('.status-viewer-progress');
  if(progress)progress.innerHTML=group.items.map((item,i)=>`<i class="${i<viewerItemIdx?'done':''}${i===viewerItemIdx?' active':''}"></i>`).join('');
  $('#viewer-avatar').outerHTML=avatar(story.username,story.avatar,36,false);
  const viewerAvatar=$('#status-viewer .avatar');if(viewerAvatar)viewerAvatar.id='viewer-avatar';
  $('#viewer-name').textContent=story.username+(story.mine?' · You':'');
  $('#viewer-time').textContent=`${timeLabel(story.created_at)} · ${storyRemaining(story.expires_at)}`;
  $('#viewer-body').innerHTML=storyBody(story);
   wireVoicePlayers($('#viewer-body'));
  $('#viewer-caption').textContent=story.caption||'';
  const actions=$('#viewer-actions');
  if(story.mine){
    actions.innerHTML=`<button class="story-action" type="button" onclick="viewStory(${story.id})">◉ ${story.view_count||0} ${tr('views')}</button><button class="story-action" type="button" onclick="editStory(${story.id})">${tr('Edit')}</button><button class="story-action danger" type="button" onclick="deleteStory(${story.id})">${tr('Delete')}</button>`;
   }else{
     const reactionsVisible=story.reactions_visible!==false;
     const likes=reactionsVisible?(story.like_count||0):'—',dislikes=reactionsVisible?(story.dislike_count||0):'—';
     actions.innerHTML=`<button class="story-action reaction ${story.viewer_reaction==='like'?'active':''}" type="button" onclick="reactStory(${story.id},'like','👍')">👍 ${likes}</button><button class="story-action reaction ${story.viewer_reaction==='dislike'?'active dislike':''}" type="button" onclick="reactStory(${story.id},'dislike','👎')">👎 ${dislikes}</button><button class="story-action" type="button" onclick="reshareStory(${story.id})">↗ ${tr('Reshare')}</button>`;
  }
  const replyRow=$('#status-reply-row');
  if(replyRow){replyRow.hidden=!!story.mine; const replyInput=$('#status-reply-input'); if(replyInput)replyInput.value='';}
  viewer.hidden=false;viewer.classList.add('open');
  scheduleViewerAutoAdvance(story);
  if(!story.mine && !story.viewed_by_me){
    const groupIndex=viewerGroupIdx;
    api('/statuses/'+story.id+'/view',{method:'POST',body:'{}'}).then(result=>{
      if(!result.ok)return;
      Object.assign(story,result.body);
      refreshStoryRowRing(groupIndex);
    });
  }
}
function openStoryGroup(groupIndex){
  const group=storyGroups[groupIndex];if(!group)return;
  viewerGroupIdx=groupIndex;viewerItemIdx=0;
  renderStoryViewer();
}
function openStory(id){
  const groupIndex=storyGroups.findIndex(g=>g.items.some(item=>item.id===id));
  if(groupIndex<0)return;
  const itemIndex=storyGroups[groupIndex].items.findIndex(item=>item.id===id);
  viewerGroupIdx=groupIndex;viewerItemIdx=Math.max(0,itemIndex);
  renderStoryViewer();
}
function stepStory(direction){
  const group=storyGroups[viewerGroupIdx];if(!group)return;
  const next=viewerItemIdx+direction;
  if(next<0){
    if(viewerGroupIdx===0){renderStoryViewer();return;}
    viewerGroupIdx-=1;viewerItemIdx=storyGroups[viewerGroupIdx].items.length-1;renderStoryViewer();return;
  }
  if(next>=group.items.length){
    if(viewerGroupIdx>=storyGroups.length-1){closeStoryViewer();return;}
    viewerGroupIdx+=1;viewerItemIdx=0;renderStoryViewer();return;
  }
  viewerItemIdx=next;renderStoryViewer();
}
function closeStoryViewer(){
  clearViewerAutoAdvance();
  const viewer=$('#status-viewer');if(viewer){viewer.classList.remove('open');viewer.hidden=true;}
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
  if(!result.ok)toast(result.body?.error||'Status could not be deleted.');else{closeStoryViewer();loadStories();}
}
async function reactStory(id,reaction,emoji=''){
  const story=storyCache[id]; if(!story||story.mine)return;
  const next=story.viewer_reaction===reaction?'none':reaction;
  const result=await api('/statuses/'+id+'/reaction',{method:'POST',body:JSON.stringify({reaction:next})});
  if(!result.ok){toast(result.body?.error||'Status reaction could not be saved.');return;}
  Object.assign(story,result.body); story.viewer_reaction=result.body.viewer_reaction;
  if($('#status-viewer')?.classList.contains('open'))renderStoryViewer();
  if(next==='like'||next==='dislike'){
    // Deliver the reaction to the story owner as a real chat message, so it
    // shows up for them even if the reaction UI itself isn't visible there.
     api('/send',{method:'POST',body:JSON.stringify({to:story.username,type:'text',content:(emoji||(next==='like'?'👍':'👎'))+' Reacted to your status'})}).catch(()=>{});
  }
}
async function viewStory(id){
  const story=storyCache[id];if(!story)return;
  const result=await api('/statuses/'+id+'/views');
  if(!result.ok){toast(result.body?.error||'Status viewers could not be loaded.');return;}
  openStoryViewersModal(story,result.body||[]);
}
function openStoryViewersModal(story,viewers){
  const modal=$('#story-viewers-modal'); if(!modal)return;
  const title=$('#story-viewers-title'); if(title)title.textContent=`Viewed by (${viewers.length})`;
  const list=$('#story-viewers-list');
  if(list){
    list.innerHTML=viewers.length?viewers.map(v=>`<div class="story-viewer-row">${avatar(v.username,v.avatar,38)}<div class="story-viewer-row-info"><strong>${esc(v.username)}</strong><small>${timeLabel(v.viewed_at)}</small></div>${v.reaction?`<span class="story-viewer-reaction" title="${v.reaction==='like'?'Liked':'Disliked'}">${v.reaction==='like'?'👍':'👎'}</span>`:''}<button class="story-viewer-message-btn" type="button" onclick="closeStoryViewersModal();location.href='/chat/${encodeURIComponent(v.username)}'">${tr('Message')}</button></div>`).join('') : `<div class="story-viewers-empty">${tr('No one has viewed this status yet.')}</div>`;
  }
  modal.classList.add('open');modal.hidden=false;modal.setAttribute('aria-hidden','false');
}
function closeStoryViewersModal(){
  const modal=$('#story-viewers-modal'); if(!modal)return;
  modal.classList.remove('open');modal.hidden=true;modal.setAttribute('aria-hidden','true');
}
async function sendStatusReply(){
  const group=storyGroups[viewerGroupIdx]; const story=group?.items[viewerItemIdx]; if(!story||story.mine)return;
  const input=$('#status-reply-input'); const content=(input?.value||'').trim(); if(!content)return;
  const button=$('.status-reply-send'); if(button)button.disabled=true;
  const result=await api('/send',{method:'POST',body:JSON.stringify({to:story.username,type:'text',content})});
  if(button)button.disabled=false;
  if(!result.ok){toast(result.body?.error||'Reply could not be sent.');return;}
  if(input)input.value='';
  toast(`Reply sent to ${story.username}.`);
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
    if(file.size>12*1024*1024){toast('Choose a media file smaller than 12 MB.');event.target.value='';return;}
    const selected=file.type.startsWith('video/')?'video':file.type.startsWith('audio/')?'audio':'image';storyType=selected;
    storyMedia=await readFileAsDataUrl(file);
    if($('#story-file-name'))$('#story-file-name').textContent=file.name;
    if($('#story-audio-status')&&selected==='audio')$('#story-audio-status').textContent=`${file.name} ready to post.`;
    setStoryType(selected);
  });
  document.addEventListener('keydown',event=>{
    if($('#story-viewers-modal')?.classList.contains('open')&&event.key==='Escape'){closeStoryViewersModal();return;}
    if(!$('#status-viewer')?.classList.contains('open'))return;
    if(document.activeElement&&document.activeElement.id==='status-reply-input')return;
    if(event.key==='Escape')closeStoryViewer();
    else if(event.key==='ArrowRight')stepStory(1);
    else if(event.key==='ArrowLeft')stepStory(-1);
  });
  $('#status-reply-input')?.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();sendStatusReply();}});
  $('#story-viewers-close')?.addEventListener('click',closeStoryViewersModal);
  $('#story-viewers-modal')?.addEventListener('click',event=>{if(event.target.id==='story-viewers-modal')closeStoryViewersModal();});
  bindStatusLongPress();
  updateStoryPrivacyFields();loadStories();
}