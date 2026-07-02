import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Mode } from '../types/enums';
import { PublishResult, Submission } from '../types/api';
import { UploadFile } from '../utils/image';

/** A captured/picked local image passing through the flow. */
export interface LocalPhoto {
  uri: string;
  width?: number;
  height?: number;
}

export type RootStackParamList = {
  Home: undefined;

  // Catalog flow: two-card picker (front required, back optional) → configure
  SelectPhotos: undefined;
  Capture: { slot: 'front' | 'back' };
  Configure: { apparel: LocalPhoto; apparelBack?: LocalPhoto };
  Generating: {
    apparel: UploadFile;
    apparelBack?: UploadFile;
    design?: UploadFile;
    mode: Mode;
    prompt?: string;
    only?: string[];
  };
  ReviewResults: { submission: Submission };
  Publish: { submission: Submission };
  PublishSuccess: { result: PublishResult };

  // Try-on flow
  TryOn: undefined;
  TryOnResult: {
    result: { jobId: string; result: string; steps: string[] };
  };

  // History of generated work
  Creations: undefined;

  // Dev
  DevSettings: undefined;
};

export type ScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;
