/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './src/App';
import { name as appName } from './app.json';
import { installDevlogConsoleMirror } from './src/shared/devlog';

// Before anything else registers: the warnings worth reading are raised during boot and during a
// consultation, and both are invisible from outside the app otherwise. No-op unless __DEV__.
installDevlogConsoleMirror();

AppRegistry.registerComponent(appName, () => App);

