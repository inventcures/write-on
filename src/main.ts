import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/400-italic.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/caveat/600.css';
import 'prosemirror-view/style/prosemirror.css';
import './ui/styles.css';
import { startApp } from './ui/app';

startApp(document.getElementById('app')!);
