import React from 'react';
import { AppText, BackButton, Screen } from '../components';
import { ScreenProps } from '../navigation/types';

/** Scaffold placeholder (T3): replaced by the real screen. Route + params are final. */
export function PosExchangeScreen({ navigation }: ScreenProps<'PosExchange'>) {
  return (
    <Screen edges={['top']}>
      <BackButton onPress={() => navigation.goBack()} />
      <AppText variant="cardTitle">Exchange items</AppText>
    </Screen>
  );
}
