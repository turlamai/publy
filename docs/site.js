// Shared appearance preferences; never stores credentials.
(function(){
  var root=document.documentElement;
  function read(k){try{return localStorage.getItem(k)}catch(_){return null}}
  function save(k,v){try{localStorage.setItem(k,v)}catch(_){}}
  var explicitLanguage=new URLSearchParams(location.search).get('lang');
  if(explicitLanguage==='zh'||explicitLanguage==='en')save('publy-lang-override-v2',explicitLanguage);
  var language=explicitLanguage||read('publy-lang-override-v2');
  if(language!=='zh'&&language!=='en')language=(navigator.language||'en').startsWith('zh')?'zh':'en';
  function lang(v){root.lang=v==='zh'?'zh-CN':'en';document.querySelectorAll('[data-switch]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.switch===v))})}
  if(document.querySelector('[data-switch]'))lang(language);
  document.querySelectorAll('[data-switch]').forEach(function(b){b.addEventListener('click',function(){lang(b.dataset.switch);save('publy-lang-override-v2',b.dataset.switch);var u=new URL(location.href);u.searchParams.set('lang',b.dataset.switch);history.replaceState(null,'',u.pathname+u.search+u.hash)})});
  var theme=read('publy-theme');if(theme==='dark'||theme==='light')root.dataset.theme=theme;
  document.querySelectorAll('[data-theme-switch]').forEach(function(b){b.setAttribute('aria-pressed',String(root.dataset.theme?root.dataset.theme==='dark':matchMedia('(prefers-color-scheme:dark)').matches));b.addEventListener('click',function(){var dark=root.dataset.theme?root.dataset.theme==='dark':matchMedia('(prefers-color-scheme:dark)').matches;root.dataset.theme=dark?'light':'dark';save('publy-theme',root.dataset.theme);b.setAttribute('aria-pressed',String(!dark))})});
})();
