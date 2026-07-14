import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Mode, ModelGender } from '../types/enums';
import { PublishResult, Submission } from '../types/api';
import { VariantMode } from '../types/catalog';
import { UploadFile } from '../utils/image';

/** A captured/picked local image passing through the flow. */
export interface LocalPhoto {
  uri: string;
  width?: number;
  height?: number;
}

export type RootStackParamList = {
  // Auth + onboarding (application-first)
  Login: undefined;
  ApplicationForm: { verifiedPhone?: string } | undefined;
  ApplicationStatus: { applicationId: string; email: string };
  Resubmit: { applicationId: string; email: string };
  // OpenStreetMap store-location picker (writes address + pincode into the draft).
  LocationPicker: undefined;

  // Post-login gate
  PendingApproval: undefined;
  Terms: undefined;

  // Retailer self-service
  Kyc: undefined;
  ChangeRequest: undefined;

  // Bottom-tab container (Home · Catalog · Profile share one persistent bar)
  Main: undefined;
  Home: undefined;

  // QR checkout scanner → pushes picks to an open web Register over SSE
  Scan: undefined;

  // Catalog flow: photo picker (front + optional back/close-ups) → configure
  SelectPhotos: undefined;
  Capture: { slot: 'front' | 'back' | 'pattern' | 'logo' | 'tag' };
  Configure: undefined; // images read from the capture-draft store
  Generating: {
    apparel: UploadFile;
    apparelBack?: UploadFile;
    design?: UploadFile;
    pattern?: UploadFile;
    logo?: UploadFile;
    tag?: UploadFile;
    modelGender?: ModelGender;
    mode: Mode;
    prompt?: string;
    only?: string[];
  };
  ReviewResults: { submission: Submission };
  Publish: { submission: Submission };
  PublishSuccess: { result: PublishResult };

  // History of generated work
  Creations: undefined;

  // Catalog management
  Catalog: undefined;
  ProductDetail: { id: string };
  VariantForm: { listingId: string; variantId?: string; mode: VariantMode };

  // Unified product-creation/edit wizard (state lives in the productDraft store).
  ProductWizardBasics: undefined;
  ProductWizardVariants: undefined;
  ProductWizardDetails: undefined;
  ProductWizardReview: undefined;

  // Dev
  Profile: undefined;
};

export type ScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;
