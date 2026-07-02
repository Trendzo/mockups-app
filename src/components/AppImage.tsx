import React, { useState } from 'react';
import {
  Image,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
  ImageStyle,
} from 'react-native';
import FastImage, { ResizeMode, Source } from '@d11/react-native-fast-image';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '../theme/theme';

/**
 * Single choke-point for images. Remote (http/https) images go through FastImage
 * (disk cache + priority); LOCAL images (file://, content://, ph://, asset-library,
 * data:) go through RN's <Image>, because FastImage is built for network images
 * and does not reliably render local file URIs. Both fade in on load (§6).
 */
export interface AppImageProps {
  uri?: string | null;
  style?: StyleProp<ImageStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  resizeMode?: keyof typeof FastImage.resizeMode;
  radius?: number;
}

const AFastImage = Animated.createAnimatedComponent(FastImage);
const AImage = Animated.createAnimatedComponent(Image);

const isRemote = (uri: string) => /^https?:\/\//i.test(uri);

export function AppImage({
  uri,
  style,
  containerStyle,
  resizeMode = 'cover',
  radius = 0,
}: AppImageProps) {
  const opacity = useSharedValue(0);
  const [errored, setErrored] = useState(false);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const onLoad = () => {
    opacity.value = withTiming(1, { duration: 320 });
  };

  const remote = uri ? isRemote(uri) : false;
  const rnResize = resizeMode === 'stretch' ? 'stretch' : resizeMode; // maps 1:1
  const mode: ResizeMode = FastImage.resizeMode[resizeMode];

  return (
    <View
      style={[
        styles.container,
        { borderRadius: radius, backgroundColor: colors.cardGray },
        containerStyle,
      ]}
    >
      {uri && !errored ? (
        remote ? (
          <AFastImage
            source={
              {
                uri,
                priority: FastImage.priority.normal,
                cache: FastImage.cacheControl.immutable,
              } as Source
            }
            resizeMode={mode}
            onLoad={onLoad}
            onError={() => setErrored(true)}
            style={[StyleSheet.absoluteFill, animStyle, style as object]}
          />
        ) : (
          <AImage
            source={{ uri }}
            resizeMode={rnResize as 'cover' | 'contain' | 'stretch' | 'center'}
            onLoad={onLoad}
            onError={() => setErrored(true)}
            style={[StyleSheet.absoluteFill, animStyle, style as object]}
          />
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
