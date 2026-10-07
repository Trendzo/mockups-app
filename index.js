/**
 * @format
 */

// gesture-handler must be the very first import in the entry file.
import 'react-native-gesture-handler';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { registerPushBackgroundHandlers } from './src/services/push/background';

// Phone push: the FCM + Notifee background handlers must be registered at the top level, before the
// app component, so a push or notification tap that wakes a killed app is handled. Wrapped inside:
// without Firebase configured (no google-services.json) this is a no-op.
registerPushBackgroundHandlers();

AppRegistry.registerComponent(appName, () => App);
