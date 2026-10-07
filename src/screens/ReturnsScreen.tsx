import React from 'react';
import { AppText, BackButton, Screen } from '../components';
import { ScreenProps } from '../navigation/types';

/** Scaffold placeholder (T2): replaced by the real screen. Route + params are final. */
export function ReturnsScreen({ navigation }: ScreenProps<'Returns'>) {
  return (
    <Screen edges={['top']}>
      <BackButton onPress={() => navigation.goBack()} />
      <AppText variant="cardTitle">Returns</AppText>
    </Screen>
  );
}
