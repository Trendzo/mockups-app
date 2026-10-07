import React from 'react';
import { AppText, BackButton, Screen } from '../components';
import { ScreenProps } from '../navigation/types';

/** Scaffold placeholder (T3): replaced by the real screen. Route + params are final. */
export function PosLabelsScreen({ navigation }: ScreenProps<'PosLabels'>) {
  return (
    <Screen edges={['top']}>
      <BackButton onPress={() => navigation.goBack()} />
      <AppText variant="cardTitle">Price labels</AppText>
    </Screen>
  );
}
