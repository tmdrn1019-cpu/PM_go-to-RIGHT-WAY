// The pm theme. `astryx experimental theme editor` wrote this file once and never changes it again.
// The checked settings live in pm.settings.json and the generated pm.settings.ts;
// change them with `astryx experimental theme editor set pm ...`. Add your own changes below: they win over the settings.
import {defineTheme} from '@astryxdesign/core/theme';
import {pmSettings} from './pm.settings';

export const pmTheme = defineTheme({
  extends: pmSettings,
  name: 'pm',
});
