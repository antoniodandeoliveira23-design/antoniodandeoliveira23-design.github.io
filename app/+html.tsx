import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * app/+html.tsx
 * Template HTML raiz — renderizado pelo `expo export --platform web`.
 *
 * Injeta o background escuro (#1A0B2E) + splash screen branded ANTES do JS,
 * eliminando a tela branca enquanto o bundle (2 MB) está carregando.
 *
 * A splash some automaticamente quando o React monta o primeiro elemento real.
 *
 * Referência: https://docs.expo.dev/router/reference/static-rendering/#root-html
 */

const SPLASH_CSS = `
html,body{background-color:#1A0B2E!important;margin:0;padding:0}
#agora-splash{
  position:fixed;inset:0;z-index:9999;
  background:#1A0B2E;
  display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:20px;
  transition:opacity .35s ease;
}
#agora-splash.fade{opacity:0;pointer-events:none}
#agora-logo-box{
  width:80px;height:80px;border-radius:16px;
  background:#000;
  display:flex;align-items:center;justify-content:center;
}
#agora-logo-letter{
  font-family:system-ui,-apple-system,sans-serif;
  font-size:40px;font-weight:700;color:#fff;line-height:1;
}
#agora-logo-name{
  font-family:system-ui,-apple-system,sans-serif;
  font-size:22px;font-weight:700;color:#fff;
  letter-spacing:6px;margin-top:4px;
}
#agora-spinner{
  width:32px;height:32px;border-radius:50%;
  border:3px solid rgba(255,255,255,.2);
  border-top-color:#fff;
  animation:agora-spin .8s linear infinite;
  margin-top:8px;
}
@keyframes agora-spin{to{transform:rotate(360deg)}}
@keyframes agora-slidein{from{opacity:0;transform:translateX(-50%) translateY(16px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
`;

/** Remove a splash assim que o React montar o primeiro nó real no #root */
const SPLASH_JS = `
(function(){
  var splash=document.getElementById('agora-splash');
  if(!splash)return;
  var root=document.getElementById('root');
  if(!root){splash.remove();return;}
  var ob=new MutationObserver(function(){
    var first=root.firstElementChild;
    if(first&&first.childElementCount>0){
      ob.disconnect();
      splash.classList.add('fade');
      setTimeout(function(){splash.remove();},380);
    }
  });
  ob.observe(root,{childList:true,subtree:true});
})();
`;

/**
 * Registra o Service Worker e exibe banner de "Nova versão disponível"
 * quando o SW detecta que index.html foi atualizado no servidor.
 */
const SW_JS = `
(function(){
  if(!('serviceWorker' in navigator))return;

  // Banner de atualização (injetado dinamicamente, fora do React)
  function mostrarBannerAtualizacao(){
    if(document.getElementById('agora-update-banner'))return;
    var b=document.createElement('div');
    b.id='agora-update-banner';
    b.style.cssText='position:fixed;bottom:80px;left:50%;transform:translateX(-50%);'+
      'background:#7B2FBE;color:#fff;padding:12px 20px;border-radius:12px;'+
      'font-family:system-ui,sans-serif;font-size:14px;font-weight:600;'+
      'box-shadow:0 4px 20px rgba(0,0,0,.4);z-index:99999;'+
      'display:flex;align-items:center;gap:12px;white-space:nowrap;'+
      'animation:agora-slidein .3s ease';
    b.innerHTML='<span>🚀 Nova versão disponível</span>'+
      '<button onclick="location.reload()" style="background:rgba(255,255,255,.2);'+
      'border:none;color:#fff;padding:6px 14px;border-radius:8px;'+
      'font-size:13px;font-weight:700;cursor:pointer">Atualizar</button>';
    document.body.appendChild(b);
  }

  // Ouve mensagens do SW (nova versão detectada)
  navigator.serviceWorker.addEventListener('message',function(e){
    if(e.data&&e.data.tipo==='ATUALIZACAO_DISPONIVEL') mostrarBannerAtualizacao();
  });

  // Registra o SW após o load (não bloqueia o carregamento inicial)
  window.addEventListener('load',function(){
    navigator.serviceWorker.register('/sw.js',{scope:'/'})
      .then(function(reg){
        // Verifica atualizações a cada 30 min enquanto o app está aberto
        setInterval(function(){ reg.update(); }, 30*60*1000);
        reg.addEventListener('updatefound',function(){
          var sw=reg.installing;
          if(!sw)return;
          sw.addEventListener('statechange',function(){
            if(sw.state==='installed'&&navigator.serviceWorker.controller){
              mostrarBannerAtualizacao();
            }
          });
        });
      })
      .catch(function(err){ console.warn('[SW] Registro falhou:',err); });
  });
})();
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />

        {/* Fundo + splash branded — injetados ANTES do JS */}
        <style dangerouslySetInnerHTML={{ __html: SPLASH_CSS }} />

        {/* Reset padrão do Expo para ScrollView no web */}
        <ScrollViewStyleReset />

        {/*
          Preconnect + Preload do Leaflet — baixa CSS e JS em paralelo com o
          bundle principal, eliminando a espera extra do mapa na Home.
        */}
        <link rel="preconnect" href="https://unpkg.com" crossOrigin="anonymous" />
        <link
          rel="preload"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          as="style"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
          as="script"
          crossOrigin="anonymous"
        />

        {/*
          DNS prefetch para os tile servers do mapa CartoDB — o browser
          começa a resolver os IPs antes do mapa ser montado.
        */}
        <link rel="dns-prefetch" href="https://a.basemaps.cartocdn.com" />
        <link rel="dns-prefetch" href="https://b.basemaps.cartocdn.com" />
        <link rel="dns-prefetch" href="https://c.basemaps.cartocdn.com" />
        <link rel="dns-prefetch" href="https://d.basemaps.cartocdn.com" />
      </head>
      <body>
        {/* Splash screen HTML puro — visível imediatamente, some quando React monta */}
        <div id="agora-splash">
          <div id="agora-logo-box">
            <span id="agora-logo-letter">A</span>
          </div>
          <span id="agora-logo-name">AGORA</span>
          <div id="agora-spinner" />
        </div>

        {children}

        {/* Script de remoção da splash — roda após o body ser parseado */}
        <script dangerouslySetInnerHTML={{ __html: SPLASH_JS }} />

        {/* Registro do Service Worker — roda após o load, não bloqueia */}
        <script dangerouslySetInnerHTML={{ __html: SW_JS }} />
      </body>
    </html>
  );
}
