import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * app/+html.tsx
 * Template HTML raiz — renderizado pelo `expo export --platform web`.
 *
 * Injeta o background escuro (#1A0B2E) diretamente no HTML estático,
 * evitando a tela branca enquanto o bundle JS (2 MB) ainda está carregando.
 *
 * Referência: https://docs.expo.dev/router/reference/static-rendering/#root-html
 */
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

        {/*
          Fundo escuro injetado ANTES do JS — elimina a tela branca inicial.
          O #1A0B2E é o CORES.background do tema AGORA.
        */}
        <style dangerouslySetInnerHTML={{
          __html: 'html,body{background-color:#1A0B2E!important;margin:0}',
        }} />

        {/* Reset padrão do Expo para ScrollView no web */}
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
