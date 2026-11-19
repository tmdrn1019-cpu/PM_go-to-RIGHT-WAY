import React from 'react';
import { createRoot } from 'react-dom/client';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import { Theme } from '@astryxdesign/core/theme';
import { InternationalizationProvider } from '@astryxdesign/core/i18n';
import ko from '@astryxdesign/core/locales/ko-KR.generated.js';
import { themes, defaultThemeSlug } from './astryx-themes';
import App from './App';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <InternationalizationProvider locale="ko-KR" messages={{ 'ko-KR': ko }}>
      <Theme theme={themes[defaultThemeSlug]} mode="light"><App /></Theme>
    </InternationalizationProvider>
  </React.StrictMode>,
);
