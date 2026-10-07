import React from 'react';
import { AppText, BackButton, Screen } from '../components';
import { ScreenProps } from '../navigation/types';

/** Scaffold placeholder (T3): replaced by the real screen. Route + params are final. */
export function PosReturnScreen({ navigation }: ScreenProps<'PosReturn'>) {
  return (
    <Screen edges={['top']}>
      <BackButton onPress={() => navigation.goBack()} />
      <AppText variant="cardTitle">Return items</AppText>
    </Screen>
  );
}
