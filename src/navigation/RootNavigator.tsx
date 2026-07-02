import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { HomeScreen } from '../screens/HomeScreen';
import { SelectPhotosScreen } from '../screens/SelectPhotosScreen';
import { CaptureScreen } from '../screens/CaptureScreen';
import { ConfigureScreen } from '../screens/ConfigureScreen';
import { GeneratingScreen } from '../screens/GeneratingScreen';
import { ReviewResultsScreen } from '../screens/ReviewResultsScreen';
import { PublishScreen } from '../screens/PublishScreen';
import { PublishSuccessScreen } from '../screens/PublishSuccessScreen';
import { TryOnScreen } from '../screens/TryOnScreen';
import { TryOnResultScreen } from '../screens/TryOnResultScreen';
import { CreationsScreen } from '../screens/CreationsScreen';
import { DevSettingsScreen } from '../screens/DevSettingsScreen';
import { colors } from '../theme/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
        animation: 'slide_from_right',
        gestureEnabled: true,
      }}
    >
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="SelectPhotos" component={SelectPhotosScreen} />
      <Stack.Screen
        name="Capture"
        component={CaptureScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
      <Stack.Screen name="Configure" component={ConfigureScreen} />
      <Stack.Screen
        name="Generating"
        component={GeneratingScreen}
        options={{ animation: 'fade', gestureEnabled: false }}
      />
      <Stack.Screen name="ReviewResults" component={ReviewResultsScreen} />
      <Stack.Screen name="Publish" component={PublishScreen} />
      <Stack.Screen
        name="PublishSuccess"
        component={PublishSuccessScreen}
        options={{ animation: 'fade', gestureEnabled: false }}
      />
      <Stack.Screen name="TryOn" component={TryOnScreen} />
      <Stack.Screen name="TryOnResult" component={TryOnResultScreen} />
      <Stack.Screen name="Creations" component={CreationsScreen} />
      <Stack.Screen
        name="DevSettings"
        component={DevSettingsScreen}
        options={{ animation: 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  );
}
