import { ScrollViewStyleReset } from 'expo-router/html';

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <title>ProspectLocal</title>
        <ScrollViewStyleReset />
        <script
          dangerouslySetInnerHTML={{
            __html:
              'window.__PROSPECTLOCAL_RUNTIME__ = window.__PROSPECTLOCAL_RUNTIME__ || {};',
          }}
        />
        <script src="/runtime-config.js" />
      </head>
      <body>{children}</body>
    </html>
  );
}
