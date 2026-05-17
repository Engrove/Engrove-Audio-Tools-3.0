import './shared/ui/styles/base.css';
import './modules/tonearm-match-lab/ui/tonearmMatchLab.css';
import './modules/tonearm-geometry-lab/ui/tonearmGeometryLab.css';
import './modules/vta-sra-lab/ui/vtaSraLab.css';
import './modules/measurement-lab/ui/measurementLab.css';

import { bootAnalyticsConsent } from './shared/privacy/analytics';
import { mountConsentBanner } from './shared/privacy/renderConsentBanner';
import { mountHelpModal } from './shared/ui/helpModal';
import { mountMobileDesktopNotice } from './shared/ui/mobileDesktopNotice';
import { startRouter } from './app/router';

bootAnalyticsConsent();
startRouter('#app');
mountConsentBanner();
mountHelpModal();
mountMobileDesktopNotice();
