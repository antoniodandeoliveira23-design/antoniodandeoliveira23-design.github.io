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
      </body>
    </html>
  );
}
