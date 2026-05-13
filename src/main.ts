import './shared/ui/styles/base.css';
import './modules/tonearm-match-lab/ui/tonearmMatchLab.css';
import './modules/tonearm-geometry-lab/ui/tonearmGeometryLab.css';
import './modules/vta-sra-lab/ui/vtaSraLab.css';

import { bootAnalyticsConsent } from './shared/privacy/analytics';
import { startRouter } from './app/router';

bootAnalyticsConsent();
startRouter('#app');
