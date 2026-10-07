import React from 'react';
import { AppText, BackButton, Screen } from '../components';
import { ScreenProps } from '../navigation/types';

/** Scaffold placeholder (T2): replaced by the real screen. Route + params are final. */
export function IssuesScreen({ navigation }: ScreenProps<'Issues'>) {
  return (
    <Screen edges={['top']}>
      <BackButton onPress={() => navigation.goBack()} />
      <AppText variant="cardTitle">Issues</AppText>
    </Screen>
  );
}
