import React from 'react';
import { AppText, BackButton, Screen } from '../components';
import { ScreenProps } from '../navigation/types';

/** Scaffold placeholder (T4): replaced by the real screen. Route + params are final. */
export function InventoryImportScreen({ navigation }: ScreenProps<'InventoryImport'>) {
  return (
    <Screen edges={['top']}>
      <BackButton onPress={() => navigation.goBack()} />
      <AppText variant="cardTitle">Import inventory</AppText>
    </Screen>
  );
}
