import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/400-italic.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/caveat/600.css';
import 'prosemirror-view/style/prosemirror.css';
import './ui/styles.css';
import { startApp } from './ui/app';
import { countVisit } from './ui/analytics';

// Read the address first: the app tidies a sign-in result out of it on start.
const href = location.href;
startApp(document.getElementById('app')!);
countVisit(href);
